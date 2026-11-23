// Privacy-friendly counters: page views, unique visitors, checks, feedback, reviews, and owner-only /api/stats.
const assert = require('assert'); const crypto = require('crypto'); const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-stats-'));
const day = offset => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
const oldDay = day(90), recentDay = day(10);
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'stats.json'), JSON.stringify({ days: {
  [oldDay]: { views: 9, paths: { '/': 9 }, uniques: 4, visitors: ['deadbeefdeadbeef'], checks: 1, feedback: 0, reviews: 0 },
  [recentDay]: { views: 2, paths: { '/about': 2 }, uniques: 1, visitors: ['abc123abc123abcd'], checks: 0, feedback: 0, reviews: 0 }
}}));
Object.assign(process.env, { DATA_DIR: tmp, FREE_CHECKS_PER_DAY: '5', ACCESS_KEY_SECRET: 'test-secret' });
for(const k of ['STRIPE_SECRET_KEY','RESEND_API_KEY','OWNER_EMAIL','OPENAI_API_KEY','STRIPE_PORTAL_LOGIN_URL','FEEDBACK_FILE','FEEDBACK_TOKEN']) delete process.env[k];
const logs = []; const orig = console.log; console.log = (...a) => { logs.push(a.join(' ')); orig(...a); };
const app = require('../server');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
const browser = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const hash = (ip, ua, date) => crypto.createHash('sha256').update(date + '\n' + ip + '\n' + ua).digest('hex').slice(0, 16);

(async () => {
  const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const ip = n => '203.0.113.' + n;
  const get = (p, n, ua) => fetch(B + p, { headers: { 'X-Forwarded-For': ip(n), 'User-Agent': ua === undefined ? browser : ua } });
  const post = (p, body, n, ua = browser) => fetch(B + p, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Forwarded-For': ip(n), 'User-Agent': ua }, body: JSON.stringify(body) });
  const stats = (token) => fetch(B + '/api/stats', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const todayRow = (j) => j.days.find(d => d.date === day(0));
  try{
    let r = await stats(); ok(r.status === 404, 'stats without a token is 404');
    r = await stats('nope'); ok(r.status === 404, 'stats with the wrong token is 404');
    process.env.FEEDBACK_TOKEN = 'owner-token';
    r = await stats('owner-token'); ok(r.status === 200, 'stats with the feedback token is allowed');
    let j = await r.json();
    ok(j.days.some(d => d.date === recentDay && d.views === 2 && d.uniques === 1), 'stats returns a day inside the last 60');
    ok(!j.days.some(d => d.date === oldDay), 'stats omits a day older than 60');
    ok(!JSON.stringify(j).includes('abc123abc123abcd') && !JSON.stringify(j).includes('deadbeefdeadbeef'), 'stats response has no visitor hashes');

    r = await get('/', 10); ok(r.status === 200, 'homepage loads for a browser');
    r = await get('/', 10); ok(r.status === 200, 'second homepage view loads');
    r = await get('/about', 10); ok(r.status === 200, 'about page loads');
    r = await get('/welcome', 11); ok(r.status === 200, 'welcome page loads for a second visitor');
    const beforeBots = (await (await stats('owner-token')).json());
    const snap = todayRow(beforeBots);
    ok(snap.views === 4 && snap.uniques === 2 && snap.paths['/'] === 2 && snap.paths['/about'] === 1 && snap.paths['/welcome'] === 1, 'page views and uniques count browsers only');

    for(const ua of ['', 'curl/8.4.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'python-requests/2.31', 'HeadlessChrome/120', 'Uptime-Monitor']){
      r = await get('/check', 12, ua); ok(r.status === 200, 'page still served to skipped client ' + (ua || '(empty)'));
    }
    r = await get('/logo.svg', 10); ok(r.status === 200, 'logo still served');
    r = await get('/api/health', 10); ok(r.status === 200, 'health still served');
    r = await get('/nope', 10); ok(r.status === 404, 'missing page is a 404');
    j = await (await stats('owner-token')).json();
    const after = todayRow(j);
    ok(after.views === snap.views && after.uniques === snap.uniques && !after.paths['/check'] && !after.paths['/logo.svg'], 'bots, assets, health, and 404s are not page views');

    r = await post('/api/analyze', { text:'Hello, lunch on Friday?' }, 10); ok(r.status === 200, 'successful check counted');
    r = await post('/api/analyze', { text:'' }, 10); ok(r.status === 400, 'empty check rejected');
    r = await post('/api/feedback', { message:'Great tool, small bug on mobile' }, 10); ok(r.status === 200, 'feedback counted');
    r = await post('/api/feedback', { message:'spam message here', website:'http://spam.test' }, 10); ok(r.status === 200, 'honeypot still silently dropped');
    r = await post('/api/reviews', { name:'Pat', rating:5, comment:'Caught a fake invoice for us.' }, 10); ok(r.status === 200, 'review counted');
    r = await post('/api/reviews', { name:'Pat', rating:9, comment:'Bad rating' }, 10); ok(r.status === 400, 'bad review rejected');
    j = await (await stats('owner-token')).json();
    const done = todayRow(j);
    ok(done.checks === 1 && done.feedback === 1 && done.reviews === 1, 'checks, feedback, and reviews increment once each');
    ok(done.views === 4 && done.uniques === 2, 'API calls do not add page views');

    const raw = fs.readFileSync(path.join(tmp, 'stats.json'), 'utf8');
    const stored = JSON.parse(raw);
    const today = stored.days[day(0)];
    ok(!raw.includes('203.0.113.10') && !raw.includes(browser), 'stored stats do not contain the raw IP or user agent');
    ok(today.visitors.includes(hash(ip(10), browser, day(0))) && today.visitors.includes(hash(ip(11), browser, day(0))), 'visitor ids are the daily salted hash');
    ok(hash(ip(10), browser, day(0)) !== hash(ip(10), browser, day(1)), 'the hash changes with the day');
    ok(!stored.days[oldDay], 'a save drops days older than 60 from the file');
    ok(logs.some(l => l.startsWith('[stats] ' + day(0) + ' pages=4 uniques=2 checks=1 feedback=1 reviews=1')), 'a one-line daily summary is logged');
    ok(!logs.some(l => l.includes('203.0.113.')), 'the summary log does not include an IP');

    const privacy = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
    ok(privacy.includes('We count anonymous page views without cookies'), 'privacy page says page views are counted without cookies');
    console.log(`Stats tests passed (${pass})`);
  } finally { srv.close(); fs.rmSync(tmp, { recursive:true, force:true }); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
