// Team access keys and Stripe helpers. No database: a key is the Stripe customer id plus an HMAC signature,
// so the server can verify it with ACCESS_KEY_SECRET alone, and Stripe stays the source of truth for billing.
const crypto = require('crypto');

const secret = () => process.env.ACCESS_KEY_SECRET || '';
const sign = id => crypto.createHmac('sha256', secret()).update('team:' + id).digest('base64url').slice(0, 22);

function makeKey(customerId){
  if(!secret() || !customerId) return null;
  return 'SS-' + customerId + '.' + sign(customerId);
}
// Returns the customer id if the key's signature is valid, otherwise null.
function parseKey(key){
  if(!secret()) return null;
  const m = /^SS-(cus_[A-Za-z0-9]+)\.([A-Za-z0-9_-]{22})$/.exec(String(key || '').trim());
  if(!m) return null;
  const want = Buffer.from(sign(m[1])), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? m[1] : null;
}

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
async function planInfo(customerId){
  if(!process.env.STRIPE_SECRET_KEY) return { plan:'team', status:'active', details:false };
  const subs = await stripeGet('subscriptions?status=all&limit=10&customer=' + encodeURIComponent(customerId));
  const order = ['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'];
  const s = (subs.data || []).sort((a,b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
  if(!s) return { plan:'team', status:'none', details:true };
  const item = s.items && s.items.data && s.items.data[0];
  const periodEnd = s.current_period_end || (item && item.current_period_end) || null;
  return { plan:'team', status:s.status, details:true, trialEnd:s.trial_end || null, periodEnd,
    cancelAtPeriodEnd:!!s.cancel_at_period_end, amount: item && item.price ? item.price.unit_amount : null };
}

// Is this customer's subscription active or trialing? Cached for 6 hours.
// Without STRIPE_SECRET_KEY we can't ask Stripe, so a validly signed key is trusted.
const subCache = new Map();
async function isActiveCustomer(customerId){
  if(!process.env.STRIPE_SECRET_KEY) return true;
  const c = subCache.get(customerId); if(c && Date.now() - c.at < 6 * 3600e3) return c.ok;
  let ok = false;
  try{
    const subs = await stripeGet('subscriptions?status=all&limit=10&customer=' + encodeURIComponent(customerId));
    ok = (subs.data || []).some(s => ['active','trialing','past_due'].includes(s.status));
  }catch(e){ console.error('stripe check failed:', e.message); ok = c ? c.ok : true; } // fail open: don't lock out a paying team
  subCache.set(customerId, { ok, at: Date.now() }); if(subCache.size > 5000) subCache.clear();
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

const forgetCustomer = id => { if(id) subCache.delete(id); };
module.exports = { makeKey, parseKey, isActiveCustomer, forgetCustomer, stripeGet, stripePost, planInfo, verifyStripeSignature };
