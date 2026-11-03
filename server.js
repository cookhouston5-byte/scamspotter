const express = require('express'); const fs = require('fs'); const net = require('net'); const path = require('path'); const crypto = require('crypto');
const { analyze } = require('./engine'); const { llmAnalyze } = require('./llm');
const { makeKey, parseKey, parseKeyFull, isActiveCustomer, stripeGet, stripePost, planInfo, verifyStripeSignature } = require('./access');
const { sendEmail, notifyOwner, welcomeEmail } = require('./emails');

const SITE = process.env.SITE_URL || 'https://scamspotter.app';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data'); // point at a persistent disk in production
const FEEDBACK = process.env.FEEDBACK_FILE || path.join(DATA_DIR, 'feedback.jsonl');
const REVIEWS = path.join(DATA_DIR, 'reviews.jsonl');
const FREE_PER_DAY = Math.max(0, Number(process.env.FREE_CHECKS_PER_DAY ?? 5));

// Render puts one proxy hop in front of the app, so trust exactly one X-Forwarded-For hop (override with TRUST_PROXY).
const TRUST_PROXY = process.env.TRUST_PROXY ?? '1';
const app = express(); app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY === 'true' ? true : TRUST_PROXY === 'false' ? false : TRUST_PROXY); app.disable('x-powered-by');
// Security headers (no CSP yet: the pages use inline scripts/styles).
app.use((req,res,next)=>{ res.set({ 'Strict-Transport-Security':'max-age=31536000; includeSubDomains', 'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' }); next(); });

// The site sits behind Cloudflare, which passes the visitor's real IP in CF-Connecting-IP. That header is only
// trusted when the request actually reached us from a Cloudflare address (req.ip, as reported by Render's proxy);
// anyone hitting the origin directly could otherwise set it to dodge the free limit and rate limits.
// Ranges from https://www.cloudflare.com/ips/ (override with CLOUDFLARE_IPS, comma-separated CIDRs).
const CF_RANGES = (process.env.CLOUDFLARE_IPS || '173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22,2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32').split(',').map(x => x.trim()).filter(Boolean);
const cfList = new net.BlockList();
for(const r of CF_RANGES){ const [a, bits] = r.split('/'); try{ cfList.addSubnet(a, Number(bits), net.isIPv6(a) ? 'ipv6' : 'ipv4'); }catch(e){ console.error('bad CLOUDFLARE_IPS entry:', r); } }
const normIp = ip => String(ip || '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');
function isCloudflare(ip){ ip = normIp(ip); const v = net.isIP(ip); if(!v) return false; try{ return cfList.check(ip, v === 6 ? 'ipv6' : 'ipv4'); }catch{ return false; } }
function clientIp(req){
  const peer = normIp(req.ip);
  const cf = String(req.get('cf-connecting-ip') || '').trim();
  if(cf && net.isIP(cf) && isCloudflare(peer)) return normIp(cf);
  return peer || 'unknown';
}

// Simple in-memory per-IP rate limiter (resets on restart; fine for a single instance).
function limiter(max, windowMs, msg){ const hits = new Map(); return (req,res,next)=>{
  const now = Date.now(), ip = clientIp(req); const h = (hits.get(ip) || []).filter(t => now - t < windowMs);
  if(h.length >= max){ res.set('Retry-After', String(Math.ceil(windowMs/1000))); return res.status(429).json({ error: msg || 'Too many requests in a short time. Please wait a minute and try again.' }); }
  h.push(now); hits.set(ip, h); if(hits.size > 10000) hits.clear(); next(); }; }

// Stripe webhook needs the raw body for signature checks, so it is registered before express.json().
const seenEvents = new Set();
app.post('/api/stripe/webhook', express.raw({ type:'*/*', limit:'1mb' }), async (req,res)=>{
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if(!verifyStripeSignature(raw, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error:'Bad signature' });
  let ev; try{ ev = JSON.parse(raw); }catch{ return res.status(400).json({ error:'Bad payload' }); }
  if(seenEvents.has(ev.id)) return res.json({ received:true, duplicate:true });
  seenEvents.add(ev.id); if(seenEvents.size > 5000) seenEvents.clear();
  const o = (ev.data && ev.data.object) || {};
  try{
    if(ev.type === 'checkout.session.completed'){
      const email = o.customer_details?.email || o.customer_email, name = o.customer_details?.name || '';
      const key = makeKey(o.customer, o.created ? o.created * 1000 : Date.now());
      if(email){ const m = welcomeEmail({ name, key }); await sendEmail({ to: email, ...m }); }
      await notifyOwner('New trial started', { Name: name, Email: email, Customer: o.customer, Business: o.custom_fields?.map(f => f.text?.value).filter(Boolean).join(', ') });
    } else if(ev.type === 'customer.subscription.deleted'){
      await notifyOwner('Subscription canceled', { Customer: o.customer, Status: o.status });
    }
  }catch(e){ console.error('webhook handling failed:', e.message); }
  res.json({ received:true });
});

app.use(express.json({ limit:'200kb' }));
app.get('/subscribed', (req,res)=>res.redirect(302, '/welcome'));
app.use(express.static(path.join(__dirname,'public'), { extensions:['html'] }));

app.get('/api/health', (req,res)=>res.json({ ok:true, llm: !!process.env.OPENAI_API_KEY }));

// Plan / quota helpers
const today = () => new Date().toISOString().slice(0,10);
const freeUse = new Map(); // "ip|date" -> count
const freeKey = req => clientIp(req) + '|' + today();
const freeLeft = req => Math.max(0, FREE_PER_DAY - (freeUse.get(freeKey(req)) || 0));
async function teamFromReq(req){
  const raw = req.get('x-team-key'); if(!raw) return { has:false };
  const k = parseKeyFull(raw); if(!k) return { has:true, valid:false };
  return { has:true, valid: await isActiveCustomer(k.customer, k.issuedAt), customer: k.customer, issuedAt: k.issuedAt };
}

app.post('/api/analyze', limiter(30, 60000, 'Too many checks in a short time. Please wait a minute and try again.'), async (req,res)=>{
  const { text='', sender='', subject='' } = req.body||{};
  if(!String(text).trim()) return res.status(400).json({ error:'Paste the message text to check.' });
  if(String(text).length > 50000) return res.status(413).json({ error:'Message too long (50,000 characters max).' });
  const team = await teamFromReq(req);
  let plan;
  if(team.valid) plan = { type:'team' };
  else {
    const left = freeLeft(req);
    if(left <= 0) return res.status(402).json({ error:`You've used your ${FREE_PER_DAY} free checks for today.`, limit:true, plan:{ type:'free', remaining:0, limit:FREE_PER_DAY, badKey: team.has } });
    const k = freeKey(req); freeUse.set(k, (freeUse.get(k) || 0) + 1);
    if(freeUse.size > 50000){ const d = '|' + today(); for(const x of freeUse.keys()) if(!x.endsWith(d)) freeUse.delete(x); }
    plan = { type:'free', remaining: left - 1, limit: FREE_PER_DAY, badKey: team.has };
  }
  const h = analyze({ text, sender, subject });
  const llm = await llmAnalyze({ text, sender, subject }, h);
  let result = { ...h, llm, plan };
  if(llm && !llm.error && llm.verdict){
    // blend: weighted average, never lower than a strong rule-based hit
    const blended = Math.round(h.score*0.5 + llm.score*0.5);
    result.score = h.score >= 55 ? Math.max(h.score, blended) : blended;
    result.verdict = result.score>=55?'Scam':result.score>=25?'Suspicious':'Safe';
    result.engine = 'heuristic+llm';
  }
  res.json(result);
});

// Plan status for the sidebar ("Your plan").
app.get('/api/plan', limiter(30, 60000), async (req,res)=>{
  const portalLogin = process.env.STRIPE_PORTAL_LOGIN_URL || null;
  const team = await teamFromReq(req);
  if(!team.has) return res.json({ plan:'free', remaining: freeLeft(req), limit: FREE_PER_DAY, portalLogin });
  if(!team.customer) return res.status(401).json({ error:'That access key isn’t valid. Check it was copied in full.', plan:'free', remaining: freeLeft(req), limit: FREE_PER_DAY, portalLogin });
  try{
    const info = await planInfo(team.customer, team.issuedAt);
    res.json({ ...info, active: team.valid, canManage: !!process.env.STRIPE_SECRET_KEY || !!portalLogin, portalLogin });
  }catch(e){ console.error('plan lookup failed:', e.message); res.json({ plan:'team', status:'unknown', active: team.valid, canManage:true, portalLogin }); }
});

// "Manage subscription": opens Stripe's billing portal for this customer (update card, invoices, cancel).
app.post('/api/billing-portal', limiter(10, 60000), async (req,res)=>{
  const customer = parseKey(req.get('x-team-key'));
  const login = process.env.STRIPE_PORTAL_LOGIN_URL;
  if(customer && process.env.STRIPE_SECRET_KEY){
    try{ const s = await stripePost('billing_portal/sessions', { customer, return_url: SITE + '/?menu=plan' }); return res.json({ url: s.url }); }
    catch(e){ console.error('portal failed:', e.message); }
  }
  if(login) return res.json({ url: login });
  res.status(503).json({ error:'Subscription management isn’t set up yet. Email hello@scamspotter.app and we’ll help right away.' });
});

// After Stripe checkout: /welcome?session_id=cs_... shows the team key right away (it's also emailed).
app.get('/api/welcome', limiter(20, 60000), async (req,res)=>{
  const id = String(req.query.session_id || '');
  if(!/^cs_[A-Za-z0-9_]+$/.test(id) || !process.env.STRIPE_SECRET_KEY) return res.json({ ok:false });
  try{
    const s = await stripeGet('checkout/sessions/' + id);
    if(s.status !== 'complete' || !s.customer) return res.json({ ok:false });
    res.json({ ok:true, key: makeKey(s.customer, s.created ? s.created * 1000 : Date.now()), name: s.customer_details?.name || '', email: s.customer_details?.email || '' });
  }catch(e){ console.error('welcome lookup failed:', e.message); res.json({ ok:false }); }
});

// Feedback and reviews. Stored server-side (JSON Lines) and copied to OWNER_EMAIL; never shown publicly automatically.
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (v, max) => escHtml(String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0, max));
const plain = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0, max);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
function appendLine(file, entry){ try{ fs.mkdirSync(path.dirname(file),{recursive:true}); fs.appendFileSync(file, JSON.stringify(entry)+'\n'); }catch(e){ console.error('write failed:', e.message); } }
const ipHash = req => crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0,12);

app.post('/api/feedback', limiter(5, 600000, 'Thanks! You\'ve sent a few already. Please try again later.'), (req,res)=>{
  const b = req.body || {};
  if(String(b.website||'').trim()) return res.json({ ok:true }); // honeypot filled: silently drop
  const raw = String(b.message ?? '').trim();
  if(raw.length < 5) return res.status(400).json({ error:'Please write a message (at least 5 characters).' });
  if(raw.length > 2000) return res.status(400).json({ error:'Message too long (2,000 characters max).' });
  const email = String(b.email ?? '').trim().toLowerCase();
  if(email && !validEmail(email)) return res.status(400).json({ error:'That email doesn\'t look right. Leave it blank or fix it.' });
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), name: clean(b.name,100), email: clean(email,200),
    page: clean(b.page,200), message: clean(raw,2000), ip: ipHash(req) };
  appendLine(FEEDBACK, entry); console.log('[feedback]', JSON.stringify(entry));
  notifyOwner('New feedback', { Name: plain(b.name,100), Email: email, Page: plain(b.page,200), Message: plain(raw,2000) });
  res.json({ ok:true });
});

app.post('/api/reviews', limiter(3, 600000, 'Thanks! You\'ve sent a few already. Please try again later.'), (req,res)=>{
  const b = req.body || {};
  if(String(b.website||'').trim()) return res.json({ ok:true });
  const comment = String(b.comment ?? '').trim(), name = String(b.name ?? '').trim();
  const rating = Math.round(Number(b.rating));
  if(!name) return res.status(400).json({ error:'Please add your name (first name is fine).' });
  if(!(rating >= 1 && rating <= 5)) return res.status(400).json({ error:'Please choose a rating from 1 to 5.' });
  if(comment.length < 5) return res.status(400).json({ error:'Please write a short comment (at least 5 characters).' });
  if(comment.length > 1000) return res.status(400).json({ error:'Comment too long (1,000 characters max).' });
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), name: clean(name,80), business: clean(b.business,120),
    rating, comment: clean(comment,1000), ip: ipHash(req), approved:false };
  appendLine(REVIEWS, entry); console.log('[review]', JSON.stringify(entry));
  notifyOwner(`New ${rating}-star review (needs approval)`, { Name: plain(name,80), Business: plain(b.business,120), Rating: rating + '/5', Comment: plain(comment,1000),
    'To publish it': 'Add it to public/reviews.json and redeploy.' });
  res.json({ ok:true });
});

// Owner-only read: disabled unless FEEDBACK_TOKEN is set; send it as "Authorization: Bearer <token>". ?type=reviews for reviews.
app.get('/api/feedback', (req,res)=>{
  const tok = process.env.FEEDBACK_TOKEN; const got = String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!tok || got.length !== tok.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(tok))) return res.status(404).json({ error:'Not found' });
  const file = req.query.type === 'reviews' ? REVIEWS : FEEDBACK;
  let items = []; try{ items = fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch{}
  res.json({ count: items.length, items });
});

app.use('/api', (req,res)=>res.status(404).json({ error:'Not found' }));
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'public','404.html')));
// JSON errors for API calls (malformed JSON, oversized body) instead of an HTML error page / stack trace
app.use((err, req, res, next)=>{
  const status = err.status || err.statusCode || 500;
  if(status >= 500) console.error(err);
  res.status(status).json({ error: status===413 ? 'Request too large.' : status===400 ? 'Invalid request.' : 'Something went wrong.' });
});
// Startup report: the app runs without any of these, but say clearly what is switched off.
function envReport(){
  const miss = (k, what) => { if(!process.env[k]) console.warn(`[config] ${k} not set: ${what}`); };
  miss('ACCESS_KEY_SECRET', 'team access keys are disabled (no keys issued or accepted; everyone gets the free limit).');
  miss('STRIPE_SECRET_KEY', 'subscriptions cannot be verified; team keys work only during their trial window, /welcome cannot show keys, billing portal falls back to STRIPE_PORTAL_LOGIN_URL.');
  miss('STRIPE_WEBHOOK_SECRET', 'Stripe webhooks are rejected, so no welcome email or new-trial notice is sent.');
  miss('RESEND_API_KEY', 'emails are logged instead of sent.');
  miss('OWNER_EMAIL', 'feedback, reviews and new trials are not emailed to you.');
  miss('DATA_DIR', 'feedback/reviews are written to ./data, which is wiped on every Render deploy.');
  miss('OPENAI_API_KEY', 'AI second opinion is off; rule-based checks only.');
}
const PORT = process.env.PORT || 3000;
if(require.main===module){ envReport(); app.listen(PORT, ()=>console.log('ScamSpotter on http://localhost:'+PORT)); }
module.exports = app; module.exports.clientIp = clientIp; module.exports.isCloudflare = isCloudflare;
