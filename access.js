// Team access keys and Stripe helpers. No database: a key is the Stripe customer id plus an HMAC signature,
// so the server can verify it with ACCESS_KEY_SECRET alone, and Stripe stays the source of truth for billing.
const crypto = require('crypto');

const secret = () => process.env.ACCESS_KEY_SECRET || '';
const sign = msg => crypto.createHmac('sha256', secret()).update(msg).digest('base64url').slice(0, 22);
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// How long a key is honored when Stripe can't confirm the subscription (no STRIPE_SECRET_KEY, or Stripe is down
// and we have no recent answer cached): the 14-day trial plus 1 day of grace, counted from when the key was issued.
const TRIAL_DAYS = Math.max(0, Number(process.env.TRIAL_DAYS ?? 14));
const trialWindowMs = () => (TRIAL_DAYS + 1) * 864e5;

// Key format: SS-<customer id>.<issued-at, unix seconds base36>.<signature>.
// Older keys without the issued-at part ("SS-cus_x.<sig>") still verify, but are only honored when Stripe confirms them.
function makeKey(customerId, issuedAtMs = Date.now()){
  if(!secret() || !customerId) return null;
  const t = Math.floor(issuedAtMs / 1000).toString(36);
  return 'SS-' + customerId + '.' + t + '.' + sign('team:' + customerId + ':' + t);
}
// Returns { customer, issuedAt (ms or null) } if the signature is valid, otherwise null.
function parseKeyFull(key){
  if(!secret()) return null;
  const s = String(key || '').trim();
  let m = /^SS-(cus_[A-Za-z0-9]+)\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/.exec(s);
  if(m) return safeEq(sign('team:' + m[1] + ':' + m[2]), m[3]) ? { customer: m[1], issuedAt: parseInt(m[2], 36) * 1000 } : null;
  m = /^SS-(cus_[A-Za-z0-9]+)\.([A-Za-z0-9_-]{22})$/.exec(s);
  if(m) return safeEq(sign('team:' + m[1]), m[2]) ? { customer: m[1], issuedAt: null } : null;
  return null;
}
const parseKey = key => { const k = parseKeyFull(key); return k ? k.customer : null; };
// A key is "within its trial window" if it was issued less than TRIAL_DAYS + 1 days ago.
const withinTrialWindow = issuedAt => !!issuedAt && issuedAt <= Date.now() + 60e3 && Date.now() - issuedAt < trialWindowMs();

async function stripeGet(path){
  const key = process.env.STRIPE_SECRET_KEY; if(!key) return null;
  const r = await fetch('https://api.stripe.com/v1/' + path, { headers:{ Authorization:'Bearer ' + key } });
  if(!r.ok) throw new Error('Stripe ' + r.status);
  return r.json();
}

async function stripePost(path, params){
  const key = process.env.STRIPE_SECRET_KEY; if(!key) return null;
  const r = await fetch('https://api.stripe.com/v1/' + path, { method:'POST', headers:{ Authorization:'Bearer ' + key, 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(params) });
  if(!r.ok) throw new Error('Stripe ' + r.status);
  return r.json();
}

// Plan details for the sidebar: status, trial end / renewal date, cancel-at-period-end.
// Without STRIPE_SECRET_KEY nothing can be confirmed, so the status is reported honestly as unverified.
async function planInfo(customerId, issuedAt){
  if(!process.env.STRIPE_SECRET_KEY){
    const ok = withinTrialWindow(issuedAt);
    return { plan:'team', status: ok ? 'unverified_trial' : 'unverified', details:false,
      trialEnd: ok ? Math.floor((issuedAt + TRIAL_DAYS * 864e5) / 1000) : null };
  }
  const subs = await stripeGet('subscriptions?status=all&limit=10&customer=' + encodeURIComponent(customerId));
  const order = ['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'];
  const s = (subs.data || []).sort((a,b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
  if(!s) return { plan:'team', status:'none', details:true };
  const item = s.items && s.items.data && s.items.data[0];
  const price = item && (item.price || item.plan);
  const periodEnd = s.current_period_end || (item && item.current_period_end) || null;
  const interval = price ? ((price.recurring && price.recurring.interval) || price.interval || null) : null;
  return { plan:'team', status:s.status, details:true, trialEnd:s.trial_end || null, periodEnd,
    cancelAtPeriodEnd:!!s.cancel_at_period_end, amount: price && price.unit_amount != null ? price.unit_amount : null, interval };
}

// Is this team allowed unlimited checks?
// - Stripe configured and reachable: yes only if a subscription is active, trialing, or past_due. Cached 6 hours.
// - Stripe errors: reuse the last answer Stripe gave for this customer if it's under 3 days old; otherwise honor the
//   key only inside its trial window. The fallback is cached for just 5 minutes so Stripe is asked again soon.
// - No STRIPE_SECRET_KEY: honor the key only inside its trial window (never unlimited forever). Logged loudly.
// This never grants open-ended access without Stripe's confirmation.
const subCache = new Map();
const CONFIRMED_TTL = 6 * 3600e3, STALE_OK = 3 * 864e5, FALLBACK_TTL = 5 * 60e3;
let warnedNoStripe = false;
async function isActiveCustomer(customerId, issuedAt){
  if(!process.env.STRIPE_SECRET_KEY){
    if(!warnedNoStripe){ warnedNoStripe = true; console.warn('[access] WARNING: STRIPE_SECRET_KEY is not set. Team keys cannot be verified with Stripe and are honored only for ' + (TRIAL_DAYS + 1) + ' days after they were issued.'); }
    return withinTrialWindow(issuedAt);
  }
  const c = subCache.get(customerId);
  if(c && Date.now() - c.checkedAt < c.ttl) return c.ok;
  let ok, ttl = CONFIRMED_TTL, at = Date.now(), confirmed = true;
  try{
    const subs = await stripeGet('subscriptions?status=all&limit=10&customer=' + encodeURIComponent(customerId));
    // Monthly and yearly are the same subscription. Access follows status, not the price interval.
    ok = (subs.data || []).some(s => ['active','trialing','past_due'].includes(s.status));
  }catch(e){
    confirmed = false; ttl = FALLBACK_TTL;
    const last = c && c.confirmed ? c : null;
    if(last && Date.now() - last.at < STALE_OK){ ok = last.ok; }
    else ok = withinTrialWindow(issuedAt);
    console.error('[access] ERROR: Stripe subscription check failed for ' + customerId + ' (' + e.message + '). Using ' + (last && Date.now() - last.at < STALE_OK ? 'last confirmed answer' : 'trial-window fallback') + ': ' + (ok ? 'allowed' : 'denied') + '.');
    if(last){ subCache.set(customerId, { ...last, ttl: FALLBACK_TTL, checkedAt: Date.now() }); return ok; }
  }
  subCache.set(customerId, { ok, at, checkedAt: Date.now(), ttl, confirmed }); if(subCache.size > 5000) subCache.clear();
  return ok;
}

// Verify a Stripe webhook signature (Stripe-Signature: t=...,v1=...). rawBody must be the exact bytes received.
function verifyStripeSignature(rawBody, header, whsec, toleranceSec = 300){
  if(!whsec || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k,v]) => [k.trim(), v]));
  const t = Number(parts.t); if(!t || Math.abs(Date.now()/1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', whsec).update(t + '.' + rawBody).digest('hex');
  const sigs = String(header).split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

module.exports = { makeKey, parseKey, parseKeyFull, withinTrialWindow, TRIAL_DAYS, _subCache: subCache, isActiveCustomer, stripeGet, stripePost, planInfo, verifyStripeSignature };
