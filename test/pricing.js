// Yearly team plan: $290/year, same trial and features, same Stripe subscription access as monthly.
const assert = require('assert'); const crypto = require('crypto'); const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-price-'));
const root = path.join(__dirname, '..');
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '3', ACCESS_KEY_SECRET: 'test-secret', STRIPE_WEBHOOK_SECRET: 'whsec_test' });
for(const k of ['STRIPE_SECRET_KEY','RESEND_API_KEY','OWNER_EMAIL','OPENAI_API_KEY','STRIPE_PORTAL_LOGIN_URL','FEEDBACK_FILE','FEEDBACK_TOKEN','YEARLY_PAYMENT_LINK']) delete process.env[k];
const app = require('../server');
const { isActiveCustomer, planInfo, _subCache } = require('../access');
const MONTHLY = 'https://buy.stripe.com/7sY7sL3WAdh23e80D0asg04';
const YEARLY = 'https://buy.stripe.com/yearly_test_link';

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
function yearlySub(status){
  return { status, current_period_end: 1893456000, cancel_at_period_end: false, trial_end: status === 'trialing' ? 1764000000 : null,
    items: { data: [{ price: { unit_amount: 29000, recurring: { interval: 'year', interval_count: 1 } } }] } };
}

(async () => {
  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const realFetch = global.fetch;
  try{
    let r = await fetch(B + '/api/pricing'); let j = await r.json();
    ok(r.status === 200 && j.yearly === null && j.monthly.url === MONTHLY && j.monthly.amount === 29 && j.trialDays === 14, 'yearly checkout is hidden until YEARLY_PAYMENT_LINK is set');
    process.env.YEARLY_PAYMENT_LINK = 'javascript:alert(1)';
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.yearly === null && j.monthly.url === MONTHLY, 'a non-https yearly link is ignored');
    process.env.YEARLY_PAYMENT_LINK = 'http://buy.stripe.com/not-secure';
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.yearly === null, 'an http yearly link is ignored');
    process.env.YEARLY_PAYMENT_LINK = YEARLY;
    j = await (await fetch(B + '/api/pricing')).json();
    ok(j.yearly && j.yearly.url === YEARLY && j.yearly.amount === 290 && j.yearly.interval === 'year' && j.yearly.note === '2 months free', 'yearly checkout is $290/year with the note when the link is set');
    ok(j.monthly.url === MONTHLY, 'the monthly link stays the existing Stripe payment link');

    const home = read('public/index.html');
    const links = [...home.matchAll(/data-plan-link href="([^"]+)"/g)].map(m => m[1]);
    ok(links.length >= 3 && links.every(u => u === MONTHLY), 'pricing, hero, and banner trial buttons start on the monthly link');
    ok(home.includes('data-interval="year"') && home.includes('2 months free') && home.includes('data-billing'), 'the homepage has a Monthly / Yearly choice and the free-months note');
    ok(home.includes('$29') && home.includes('Yearly is $290'), 'the page states both prices');
    ok(!home.includes(YEARLY), 'the real yearly link is not hardcoded in the page');
    const about = read('public/about.html');
    ok(about.includes('data-plan-link href="' + MONTHLY + '"') && about.includes('data-interval="year"'), 'the about page trial button can switch to yearly');
    const terms = read('public/terms.html');
    ok(terms.includes('$29 per month or $290 per year') && terms.includes('two months free') && terms.includes('14-day free trial') && terms.includes('same features'), 'terms describe the yearly option, the trial, and the same features');
    const js = read('public/site.js');
    ok(js.includes("'$290'") && js.includes("'$29'") && js.includes('2 months free'), 'the billing switch updates the price between $29 and $290');

    const subs = {
      cus_YEAR_ACTIVE: yearlySub('active'),
      cus_YEAR_TRIAL: yearlySub('trialing'),
      cus_YEAR_DUE: yearlySub('past_due'),
      cus_YEAR_CANCEL: yearlySub('canceled'),
      cus_MONTH: { status:'active', current_period_end: 1893456000, cancel_at_period_end: false, items: { data: [{ price: { unit_amount: 2900, recurring: { interval: 'month' } } }] } }
    };
    process.env.STRIPE_SECRET_KEY = 'sk_test_yearly';
    global.fetch = async (u, o) => {
      const url = String(u);
      if(!url.startsWith('https://api.stripe.com/')) return realFetch(u, o);
      const id = new URL(url).searchParams.get('customer');
      return new Response(JSON.stringify({ data: subs[id] ? [subs[id]] : [] }), { status: 200, headers:{ 'content-type':'application/json' } });
    };
    _subCache.clear();
    const info = await planInfo('cus_YEAR_ACTIVE', Date.now());
    ok(info.status === 'active' && info.interval === 'year' && info.amount === 29000 && info.plan === 'team', 'plan details report a yearly price as the team plan');
    ok(await isActiveCustomer('cus_YEAR_ACTIVE', Date.now() - 400 * 864e5) === true, 'an active yearly subscription is a paid plan');
    _subCache.clear();
    ok(await isActiveCustomer('cus_YEAR_TRIAL', Date.now()) === true, 'a yearly subscription on its 14-day trial is active');
    _subCache.clear();
    ok(await isActiveCustomer('cus_YEAR_DUE', Date.now() - 400 * 864e5) === true, 'a past-due yearly subscription keeps access');
    _subCache.clear();
    ok(await isActiveCustomer('cus_YEAR_CANCEL', Date.now()) === false, 'a canceled yearly subscription does not grant access');
    _subCache.clear();
    const month = await planInfo('cus_MONTH', Date.now());
    ok(month.interval === 'month' && month.amount === 2900 && await isActiveCustomer('cus_MONTH', Date.now() - 400 * 864e5) === true, 'a monthly subscription is unchanged');

    const logs = []; const orig = console.log; console.log = (...a) => { logs.push(a.join(' ')); orig(...a); };
    const payload = JSON.stringify({ id:'evt_year', type:'checkout.session.completed', data:{ object:{ customer:'cus_YEAR_NEW', customer_details:{ email:'owner@example.com', name:'Pat Lee' }, mode:'subscription', amount_total: 29000 } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', 'whsec_test').update(t + '.' + payload).digest('hex');
    r = await realFetch(B + '/api/stripe/webhook', { method:'POST', headers:{ 'Content-Type':'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
    ok(r.status === 200, 'a yearly checkout uses the same webhook flow');
    ok(logs.some(l => l.includes('[email:not-sent]') && l.includes('owner@example.com')), 'a yearly checkout still sends the team welcome email');
    console.log = orig;

    console.log(`Pricing tests passed (${pass})`);
  } finally { global.fetch = realFetch; srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
