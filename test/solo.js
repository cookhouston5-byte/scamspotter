// Solo plan: $9/month or $90/year, one browser, and a Business upgrade when a second browser uses the key.
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-solo-'));
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '5', ACCESS_KEY_SECRET: 'test-secret' });
for(const k of ['STRIPE_SECRET_KEY','RESEND_API_KEY','OWNER_EMAIL','OPENAI_API_KEY','YEARLY_PAYMENT_LINK','SOLO_MONTHLY_PAYMENT_LINK','SOLO_YEARLY_PAYMENT_LINK']) delete process.env[k];
const app = require('../server');
const { makeKey, tierOf, planInfo, isActiveCustomer, _subCache } = require('../access');
const SOLO_M = 'https://buy.stripe.com/solo_month';
const SOLO_Y = 'https://buy.stripe.com/solo_year';
const seat = n => (n + 's').repeat(12).slice(0, 24);

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
function priceSub(status, amount, interval, extra){
  const price = Object.assign({ unit_amount: amount, recurring: { interval } }, extra && extra.price);
  const sub = { status, current_period_end: 1893456000, cancel_at_period_end: false, metadata: (extra && extra.metadata) || {}, items: { data: [{ price }] } };
  return sub;
}

(async () => {
  ok(tierOf(priceSub('active', 900, 'month')) === 'solo', 'a $9 monthly price is Solo');
  ok(tierOf(priceSub('active', 9000, 'year')) === 'solo', 'a $90 yearly price is Solo');
  ok(tierOf(priceSub('active', 2900, 'month')) === 'business', 'a $29 monthly price is Business');
  ok(tierOf(priceSub('active', 29000, 'year')) === 'business', 'a $290 yearly price is Business');
  ok(tierOf(priceSub('active', 2900, 'month', { price: { metadata: { plan: 'solo' } } })) === 'solo', 'price metadata plan=solo wins over the amount');
  ok(tierOf(priceSub('active', 900, 'month', { metadata: { plan: 'business' } })) === 'business', 'subscription metadata plan=business wins over the amount');
  ok(tierOf(priceSub('active', 1500, 'month')) === 'business', 'an unrecognized price stays Business so existing customers are not seat-limited');

  const home = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  ok(home.includes('data-solo-card') && home.includes('For one person') && home.includes('Unlimited staff') && home.includes('>$9<') && home.includes('Solo $90'), 'the pricing section has a Solo card and both prices');

  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const realFetch = global.fetch;
  const subs = {};
  global.fetch = async (u, o) => {
    const url = String(u);
    if(!url.startsWith('https://api.stripe.com/')) return realFetch(u, o);
    const id = new URL(url).searchParams.get('customer');
    return new Response(JSON.stringify({ data: subs[id] ? [subs[id]] : [] }), { status: 200, headers:{ 'content-type':'application/json' } });
  };
  const post = (headers, text) => fetch(B + '/api/analyze', { method:'POST', headers:{ 'Content-Type':'application/json', ...headers }, body: JSON.stringify({ text: text || 'Hello, lunch on Friday?' }) });
  try{
    let j = await (await fetch(B + '/api/pricing')).json();
    ok(j.solo === null && j.business.monthly.amount === 29 && j.business.yearly === null, 'Solo is omitted when neither Solo link is set');
    process.env.SOLO_MONTHLY_PAYMENT_LINK = 'javascript:alert(1)';
    process.env.SOLO_YEARLY_PAYMENT_LINK = 'http://buy.stripe.com/nope';
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.solo === null, 'non-https Solo links are ignored');
    process.env.SOLO_MONTHLY_PAYMENT_LINK = SOLO_M;
    delete process.env.SOLO_YEARLY_PAYMENT_LINK;
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.solo && j.solo.monthly.url === SOLO_M && j.solo.monthly.amount === 9 && j.solo.yearly === null && j.solo.label === 'For one person', 'only Solo monthly is offered when that is the link set');
    delete process.env.SOLO_MONTHLY_PAYMENT_LINK;
    process.env.SOLO_YEARLY_PAYMENT_LINK = SOLO_Y;
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.solo.monthly === null && j.solo.yearly.url === SOLO_Y && j.solo.yearly.amount === 90 && j.solo.yearly.note === '2 months free', 'only Solo yearly is offered when that is the link set');
    process.env.SOLO_MONTHLY_PAYMENT_LINK = SOLO_M;
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.solo.monthly.url === SOLO_M && j.solo.yearly.url === SOLO_Y && j.solo.seats === 1, 'both Solo checkouts are offered together');

    process.env.STRIPE_SECRET_KEY = 'sk_test_solo';
    subs.cus_SOLO = priceSub('active', 900, 'month');
    subs.cus_SOLO_YEAR = priceSub('trialing', 9000, 'year');
    subs.cus_SOLO_DUE = priceSub('past_due', 900, 'month');
    subs.cus_SOLO_CANCEL = priceSub('canceled', 900, 'month');
    subs.cus_BIZ = priceSub('active', 2900, 'month');
    subs.cus_META = priceSub('active', 2900, 'month', { price: { metadata: { plan: 'solo' } } });
    const info = await planInfo('cus_SOLO', Date.now());
    ok(info.plan === 'solo' && info.tier === 'solo' && info.seats === 1 && info.amount === 900 && info.interval === 'month', 'plan details describe Solo as one seat');
    ok(await isActiveCustomer('cus_SOLO', Date.now() - 400 * 864e5) === true, 'an active Solo subscription still has access');
    _subCache.clear();
    ok(await isActiveCustomer('cus_SOLO_YEAR', Date.now()) === true, 'a Solo yearly trial still has access');
    _subCache.clear();
    ok(await isActiveCustomer('cus_SOLO_DUE', Date.now() - 400 * 864e5) === true, 'a past-due Solo subscription keeps access');
    _subCache.clear();
    ok(await isActiveCustomer('cus_SOLO_CANCEL', Date.now()) === false, 'a canceled Solo subscription does not grant access');

    const key = makeKey('cus_SOLO');
    let r = await post({ 'X-Team-Key': key, 'X-Seat': seat('a'), 'X-Forwarded-For': '203.0.113.20' });
    j = await r.json();
    ok(r.status === 200 && j.plan.type === 'solo', 'the first browser on a Solo key gets unlimited checks');
    r = await post({ 'X-Team-Key': key, 'X-Seat': seat('b'), 'X-Forwarded-For': '203.0.113.21' });
    j = await r.json();
    ok(r.status === 402 && j.upgrade === true && /Upgrade to Business/.test(j.error), 'a second browser is asked to upgrade to Business');
    r = await post({ 'X-Team-Key': key, 'X-Seat': seat('a'), 'X-Forwarded-For': '203.0.113.20' });
    j = await r.json();
    ok(r.status === 200 && j.plan.type === 'solo', 'the original Solo browser still works');
    const plan = await (await fetch(B + '/api/plan', { headers:{ 'X-Team-Key': key, 'X-Seat': seat('b'), 'X-Forwarded-For': '203.0.113.21' } })).json();
    ok(plan.upgrade === true && plan.tier === 'solo' && plan.seat === 'taken', 'the plan screen tells the second browser the seat is taken');
    const raw = fs.readFileSync(path.join(tmp, 'seats.json'), 'utf8');
    ok(!raw.includes('203.0.113'), 'the seat file does not store an IP address');

    r = await post({ 'X-Team-Key': makeKey('cus_SOLO2'), 'X-Forwarded-For': '203.0.113.30' });
    subs.cus_SOLO2 = priceSub('active', 900, 'month');
    _subCache.clear();
    r = await post({ 'X-Team-Key': makeKey('cus_SOLO2'), 'X-Seat': 'nope', 'X-Forwarded-For': '203.0.113.30' });
    j = await r.json();
    ok(r.status === 402 && j.upgrade === true && j.reason === 'missing', 'a Solo check without a browser id does not claim the seat');
    ok(!fs.readFileSync(path.join(tmp, 'seats.json'), 'utf8').includes('cus_SOLO2'), 'a missing seat is not saved');
    r = await post({ 'X-Team-Key': makeKey('cus_SOLO2'), 'X-Seat': seat('c'), 'X-Forwarded-For': '203.0.113.30' });
    ok(r.status === 200, 'the real browser can still claim Solo after a bad seat id');

    const biz = makeKey('cus_BIZ');
    r = await post({ 'X-Team-Key': biz, 'X-Seat': seat('a'), 'X-Forwarded-For': '203.0.113.40' });
    ok(r.status === 200 && (await r.json()).plan.type === 'team', 'Business works for the first person');
    r = await post({ 'X-Team-Key': biz, 'X-Seat': seat('b'), 'X-Forwarded-For': '203.0.113.41' });
    ok(r.status === 200 && (await r.json()).plan.type === 'team', 'Business works for a second person');

    const meta = makeKey('cus_META');
    r = await post({ 'X-Team-Key': meta, 'X-Seat': seat('a'), 'X-Forwarded-For': '203.0.113.50' });
    ok(r.status === 200 && (await r.json()).plan.type === 'solo', 'metadata marks a subscription Solo even at another amount');
    r = await post({ 'X-Team-Key': meta, 'X-Seat': seat('b'), 'X-Forwarded-For': '203.0.113.51' });
    ok(r.status === 402 && (await r.json()).upgrade === true, 'that Solo subscription still allows only one browser');

    console.log(`Solo tests passed (${pass})`);
  } finally { global.fetch = realFetch; srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
