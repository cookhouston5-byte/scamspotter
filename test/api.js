// API tests: free limit, team keys, plan/billing endpoints, Stripe webhook signature, feedback/reviews, welcome email.
const assert = require('assert'); const crypto = require('crypto'); const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '3', ACCESS_KEY_SECRET: 'test-secret', STRIPE_WEBHOOK_SECRET: 'whsec_test' });
for(const k of ['STRIPE_SECRET_KEY','RESEND_API_KEY','OWNER_EMAIL','OPENAI_API_KEY','STRIPE_PORTAL_LOGIN_URL','FEEDBACK_FILE']) delete process.env[k];
const app = require('../server'); const { makeKey, parseKey, parseKeyFull, isActiveCustomer, _subCache, verifyStripeSignature } = require('../access'); const { welcomeEmail } = require('../emails');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
(async () => {
  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const post = (p, body, h = {}) => fetch(B + p, { method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify(body) });
  const ip = n => ({ 'X-Forwarded-For': '203.0.113.' + n });
  try{
    // keys
    const key = makeKey('cus_TEST123'); ok(/^SS-cus_TEST123\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/.test(key), 'makeKey format');
    ok(Math.abs(parseKeyFull(key).issuedAt - Date.now()) < 5000, 'key carries its issue time');
    const oldKey = makeKey('cus_OLD1', Date.now() - 40 * 864e5);
    const legacy = 'SS-cus_LEGACY.' + crypto.createHmac('sha256', 'test-secret').update('team:cus_LEGACY').digest('base64url').slice(0, 22);
    ok(parseKeyFull(legacy) && parseKeyFull(legacy).issuedAt === null, 'legacy key format still verifies');
    ok(parseKey(key.replace(/\.([0-9a-z]+)\./, '.zzzz.')) === null, 'parseKey rejects a key with an altered issue time');
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
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'X-Team-Key': oldKey });
    ok(r.status === 402, 'without STRIPE_SECRET_KEY, a key older than the trial window is not unlimited');
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'X-Team-Key': legacy });
    ok(r.status === 402, 'without STRIPE_SECRET_KEY, a legacy key (no issue time) is not unlimited');
    // Client IP: CF-Connecting-IP is ignored unless the request came from a Cloudflare address
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'CF-Connecting-IP': '198.51.100.77' });
    ok(r.status === 402, 'spoofed CF-Connecting-IP from a non-Cloudflare peer does not reset the free limit');
    r = await post('/api/analyze', { text:'Hello' }, { 'X-Forwarded-For': '162.158.10.20', 'CF-Connecting-IP': '198.51.100.77' }); j = await r.json();
    ok(r.status === 200 && j.plan.remaining === 2, 'CF-Connecting-IP is used when the peer is a Cloudflare edge');
    r = await post('/api/analyze', { text:'Hello' }, { 'X-Forwarded-For': '162.158.10.21', 'CF-Connecting-IP': '198.51.100.77' }); j = await r.json();
    ok(r.status === 200 && j.plan.remaining === 1, 'same visitor through another Cloudflare edge shares one quota');
    r = await post('/api/analyze', { text:'Hello' }, { ...ip(1), 'X-Team-Key': 'SS-cus_FAKE.aaaaaaaaaaaaaaaaaaaaaa' });
    ok(r.status === 402, 'invalid team key does not bypass the limit');
    r = await post('/api/analyze', { text:'' }, ip(3)); ok(r.status === 400, 'empty message rejected');
    // A fake CF-Connecting-IP from a non-Cloudflare address must not reset the free limit.
    const direct = n => ({ 'X-Forwarded-For': '198.51.100.7', 'CF-Connecting-IP': '192.0.2.' + n });
    for(let i = 1; i <= 3; i++) await post('/api/analyze', { text:'Hello' }, direct(i));
    r = await post('/api/analyze', { text:'Hello' }, direct(99)); ok(r.status === 402, 'spoofed CF-Connecting-IP ignored when not from Cloudflare');
    r = await post('/api/analyze', { text:'Hello' }, { 'X-Forwarded-For': '104.16.0.5', 'CF-Connecting-IP': '192.0.2.200' }); ok(r.status === 200, 'CF-Connecting-IP trusted from a Cloudflare address');

    // plan endpoint
    j = await (await fetch(B + '/api/plan', { headers: ip(4) })).json(); ok(j.plan === 'free' && j.remaining === 3 && j.limit === 3, '/api/plan free status');
    j = await (await fetch(B + '/api/plan', { headers: { ...ip(4), 'X-Team-Key': key } })).json(); ok(j.plan === 'team' && j.status === 'unverified_trial' && j.active === true && j.trialEnd > Date.now()/1000, '/api/plan reports an unverified trial when Stripe is not configured');
    j = await (await fetch(B + '/api/plan', { headers: { ...ip(4), 'X-Team-Key': oldKey } })).json(); ok(j.status === 'unverified' && j.active === false, '/api/plan reports an expired unverified key as inactive');
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

    // Stripe errors never grant open-ended access
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'; const realFetch = global.fetch;
    global.fetch = async (u, o) => String(u).startsWith('https://api.stripe.com') ? new Response('{}', { status: 500 }) : realFetch(u, o);
    try{
      ok(await isActiveCustomer('cus_NEW1', Date.now()) === true, 'Stripe down: a key inside its trial window still works');
      ok(await isActiveCustomer('cus_OLD1', Date.now() - 40 * 864e5) === false, 'Stripe down: an old key with no confirmed answer is denied');
      _subCache.set('cus_PAID', { ok:true, at: Date.now() - 7 * 3600e3, checkedAt: Date.now() - 7 * 3600e3, ttl: 6 * 3600e3, confirmed:true });
      ok(await isActiveCustomer('cus_PAID', Date.now() - 400 * 864e5) === true, 'Stripe down: a recently confirmed paying team keeps access');
      _subCache.set('cus_GONE', { ok:true, at: Date.now() - 4 * 864e5, checkedAt: Date.now() - 4 * 864e5, ttl: 6 * 3600e3, confirmed:true });
      ok(await isActiveCustomer('cus_GONE', Date.now() - 400 * 864e5) === false, 'Stripe down: a confirmation older than 3 days is not reused');
      global.fetch = async (u, o) => String(u).startsWith('https://api.stripe.com') ? new Response(JSON.stringify({ data:[{ status:'canceled' }] }), { status: 200 }) : realFetch(u, o);
      ok(await isActiveCustomer('cus_CANC', Date.now()) === false, 'Stripe says canceled: denied even inside the trial window');
    } finally { global.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; }

    // pages
    for(const p of ['/', '/check', '/about', '/privacy', '/terms', '/welcome', '/reviews.json', '/img/houston-plane.jpg']){ r = await fetch(B + p); ok(r.status === 200, 'GET ' + p); }
    r = await fetch(B + '/nope'); ok(r.status === 404 && (await r.text()).includes('Missed the target'), 'custom 404 page');
    r = await fetch(B + '/'); ok(!r.headers.get('x-powered-by') && r.headers.get('x-frame-options') === 'DENY', 'security headers set');
    console.log(`API tests passed (${pass})`);
  } finally { srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
