// API tests: free limit, team keys, plan/billing endpoints, Stripe webhook signature, feedback/reviews, welcome email.
const assert = require('assert'); const crypto = require('crypto'); const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '3', ACCESS_KEY_SECRET: 'test-secret', STRIPE_WEBHOOK_SECRET: 'whsec_test' });
for(const k of ['STRIPE_SECRET_KEY','RESEND_API_KEY','OWNER_EMAIL','OPENAI_API_KEY','STRIPE_PORTAL_LOGIN_URL','FEEDBACK_FILE']) delete process.env[k];
const app = require('../server'); const { makeKey, parseKey, verifyStripeSignature } = require('../access'); const { welcomeEmail } = require('../emails');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
(async () => {
  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const post = (p, body, h = {}) => fetch(B + p, { method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify(body) });
  const ip = n => ({ 'CF-Connecting-IP': '203.0.113.' + n });
  try{
    // keys
    const key = makeKey('cus_TEST123'); ok(/^SS-cus_TEST123\.[A-Za-z0-9_-]{22}$/.test(key), 'makeKey format');
    ok(parseKey(key) === 'cus_TEST123', 'parseKey accepts valid key');
    ok(parseKey(key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A')) === null, 'parseKey rejects tampered key');
    ok(parseKey('SS-cus_OTHER.' + key.split('.')[1]) === null, 'parseKey rejects key for another customer');

    // free limit (3/day in tests), per IP
    for(let i = 1; i <= 3; i++){ const r = await post('/api/analyze', { text:'Hello, lunch on Friday?' }, ip(1)); const j = await r.json();
      ok(r.status === 200 && j.plan.type === 'free' && j.plan.remaining === 3 - i, `free check ${i} ok, ${3-i} left`); }
    let r = await post('/api/analyze', { text:'Hello again' }, ip(1)); let j = await r.json();
    ok(r.status === 402 && j.limit === true, 'free check 4 blocked with 402');
    r = await post('/api/analyze', { text:'Hello' }, ip(2)); ok(r.status === 200, 'other IP still has free checks');
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'X-Team-Key': key }); j = await r.json();
    ok(r.status === 200 && j.plan.type === 'team', 'valid team key bypasses the limit');
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'X-Team-Key': 'SS-cus_FAKE.aaaaaaaaaaaaaaaaaaaaaa' });
    ok(r.status === 402, 'invalid team key does not bypass the limit');
    r = await post('/api/analyze', { text:'' }, ip(3)); ok(r.status === 400, 'empty message rejected');

    // plan endpoint
    j = await (await fetch(B + '/api/plan', { headers: ip(4) })).json(); ok(j.plan === 'free' && j.remaining === 3 && j.limit === 3, '/api/plan free status');
    j = await (await fetch(B + '/api/plan', { headers: { ...ip(4), 'X-Team-Key': key } })).json(); ok(j.plan === 'team' && j.status === 'active', '/api/plan team status');
    r = await fetch(B + '/api/plan', { headers: { 'X-Team-Key': 'nonsense' } }); ok(r.status === 401, '/api/plan rejects bad key');
    r = await fetch(B + '/api/billing-portal', { method:'POST', headers: { 'X-Team-Key': key } }); ok(r.status === 503, 'billing portal explains when Stripe is not configured');
    process.env.STRIPE_PORTAL_LOGIN_URL = 'https://billing.stripe.com/p/login/test';
    j = await (await fetch(B + '/api/billing-portal', { method:'POST' })).json(); ok(j.url === 'https://billing.stripe.com/p/login/test', 'billing portal falls back to login link');
    delete process.env.STRIPE_PORTAL_LOGIN_URL;

    // webhook signature
    const payload = JSON.stringify({ id:'evt_1', type:'checkout.session.completed', data:{ object:{ customer:'cus_TEST123', customer_details:{ email:'owner@example.com', name:'Pat Lee' } } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', 'whsec_test').update(t + '.' + payload).digest('hex');
    ok(verifyStripeSignature(payload, `t=${t},v1=${sig}`, 'whsec_test'), 'valid Stripe signature accepted');
    ok(!verifyStripeSignature(payload, `t=${t - 1000},v1=${sig}`, 'whsec_test'), 'old/mismatched signature rejected');
    r = await fetch(B + '/api/stripe/webhook', { method:'POST', headers:{ 'Content-Type':'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
    ok(r.status === 200, 'webhook with valid signature accepted');
    r = await fetch(B + '/api/stripe/webhook', { method:'POST', headers:{ 'Content-Type':'application/json', 'Stripe-Signature': `t=${t},v1=${'0'.repeat(64)}` }, body: payload });
    ok(r.status === 400, 'webhook with bad signature rejected');

    // welcome email
    const m = welcomeEmail({ name:'Pat Lee', key }); ok(m.html.includes(key) && m.text.includes(key) && m.html.includes('Welcome aboard, Pat'), 'welcome email includes name and key');
    ok(!welcomeEmail({ name:'<script>', key }).html.includes('<script>'), 'welcome email escapes names');

    // feedback + reviews
    r = await post('/api/feedback', { message:'Great tool, small bug on mobile' }, ip(5)); ok(r.status === 200, 'feedback accepted');
    r = await post('/api/reviews', { name:'Pat', rating:5, comment:'Caught a fake invoice for us.' }, ip(5)); ok(r.status === 200, 'review accepted');
    r = await post('/api/reviews', { name:'Pat', rating:9, comment:'Bad rating' }, ip(6)); ok(r.status === 400, 'review with bad rating rejected');
    const saved = fs.readFileSync(path.join(tmp, 'reviews.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    ok(saved.length === 1 && saved[0].approved === false, 'review stored unapproved');
    ok(fs.existsSync(path.join(tmp, 'feedback.jsonl')), 'feedback stored in DATA_DIR');

    // pages
    for(const p of ['/', '/check', '/about', '/privacy', '/terms', '/welcome', '/reviews.json', '/img/houston-plane.jpg']){ r = await fetch(B + p); ok(r.status === 200, 'GET ' + p); }
    r = await fetch(B + '/nope'); ok(r.status === 404 && (await r.text()).includes('Missed the target'), 'custom 404 page');
    r = await fetch(B + '/'); ok(!r.headers.get('x-powered-by') && r.headers.get('x-frame-options') === 'DENY', 'security headers set');
    console.log(`API tests passed (${pass})`);
  } finally { srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
