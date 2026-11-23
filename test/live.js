// Live bug fixes: Spanish checks, risky-link floor, pricing copy, text validation, CSP.
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { analyze } = require('../engine');
const { welcomeEmail } = require('../emails');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-live-'));
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '3', ACCESS_KEY_SECRET: 'test-secret' });
for(const k of ['STRIPE_SECRET_KEY','SOLO_MONTHLY_PAYMENT_LINK','SOLO_YEARLY_PAYMENT_LINK','YEARLY_PAYMENT_LINK']) delete process.env[k];
const app = require('../server');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
const note = r => r.reasons.some(x => x.detail === 'We fully check English and Spanish; treat this result with extra caution.');

(async () => {
  const es = analyze({ text: 'URGENTE: Su cuenta bancaria ha sido suspendida. Compre tarjetas de regalo de inmediato y envíe los códigos. https://secure-banco.top/verificar' });
  ok(es.verdict !== 'Safe' && es.score >= 55, 'a Spanish bank-and-gift-card text with a .top link is not Safe');
  ok(es.reasons.some(r => r.category === 'Gift card request') && es.reasons.some(r => r.category === 'Urgency pressure'), 'Spanish urgency and gift cards are recognized');
  ok(!note(es), 'Spanish text does not get the other-language caution');

  const top = analyze({ text: 'The notes are here: https://files.top/report' });
  ok(top.verdict === 'Suspicious' && top.score >= 25, 'a .top link is at least Suspicious');
  ok(top.reasons.some(r => r.category === 'Risky link domain'), 'the .top link is called out');

  const fr = analyze({ text: 'Votre compte bancaire est suspendu. Cliquez ici immediatement pour verifier votre identite.' });
  ok(note(fr), 'French text gets the English-and-Spanish caution');
  const en = analyze({ text: 'Hello, lunch on Friday? The agenda is attached for you and the team.' });
  ok(en.verdict === 'Safe' && !note(en), 'ordinary English does not get the language caution');

  const home = read('public/index.html');
  ok(!home.includes('>Free to try. Solo or Business.<'), 'the pricing heading does not lead with Solo');
  ok(home.includes('data-offer="either" hidden>Solo or Business.'), 'Solo in the heading stays hidden until that plan can be bought');
  ok(/<span data-offer="solo" hidden> Solo is for one person:/.test(home), 'the FAQ Solo sentence is hidden by default');
  const terms = read('public/terms.html');
  ok(terms.includes('Business is $29 per month') && terms.includes('data-offer="solo" hidden') && !terms.includes('Solo is $9 per month or $90 per year, for one person.'), 'terms lead with Business and hide Solo');
  const mailed = welcomeEmail({ name: 'Pat Lee', key: 'SS-test' });
  ok(!mailed.html.includes('Solo') && !mailed.text.includes('Solo'), 'the welcome email does not mention Solo when its links are unset');
  process.env.SOLO_MONTHLY_PAYMENT_LINK = 'https://buy.stripe.com/solo_month';
  const mailedSolo = welcomeEmail({ name: 'Pat Lee', key: 'SS-test' });
  ok(mailedSolo.text.includes('On Solo'), 'the welcome email mentions Solo only when a Solo link is set');
  delete process.env.SOLO_MONTHLY_PAYMENT_LINK;

  const pages = fs.readdirSync(path.join(root, 'public')).filter(f => f.endsWith('.html'));
  ok(pages.every(f => !/<script(?![^>]*\bsrc=)/.test(read('public/' + f)) && !/<style[\s>]/.test(read('public/' + f))), 'pages have no inline scripts or style blocks');
  ok(!read('public/site.js').includes('style=') && !read('public/app.js').includes('style=') && !read('public/home.js').includes('style='), 'page scripts do not write style attributes');

  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  try{
    let r = await fetch(B + '/api/analyze', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text:[1] }) });
    let j = await r.json();
    ok(r.status === 400 && /plain text/i.test(j.error), 'non-string message text is rejected');
    r = await fetch(B + '/');
    const csp = r.headers.get('content-security-policy') || '';
    ok(csp.includes("script-src 'self'") && csp.includes("style-src 'self'") && csp.includes('https://fonts.googleapis.com') && !csp.includes('unsafe-inline'), 'CSP allows our files and Google fonts, not inline code');
    ok((await r.text()).includes('theme.js'), 'the homepage loads the theme script from a file');
    console.log(`Live bug tests passed (${pass})`);
  } finally { srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
