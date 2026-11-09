// Agent tests: email parsing, header checks, media metadata, voice checks, Team-plan gating, and the Grok tool loop (mocked).
const assert = require('assert'); const zlib = require('zlib');
Object.assign(process.env, { ACCESS_KEY_SECRET: 'test-secret', FREE_CHECKS_PER_DAY: '50' });
for(const k of ['STRIPE_SECRET_KEY','XAI_API_KEY','RESEND_API_KEY','OWNER_EMAIL']) delete process.env[k];
const { parseEmail, looksLikeEmail } = require('../mail');
const { inspectMedia } = require('../media');
const agent = require('../agent');
const { makeKey } = require('../access');
const { analyze } = require('../engine');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS ', m); };
const has = (r, label) => r.findings.some(f => f.label === label);
// No network in tests: pre-fill the domain cache.
const fake = (d, v) => agent._cache.set(d, { at: Date.now(), v: { domain: d, ...v } });

// Real fetch is kept for calling our own test server; Grok and RDAP calls are answered by mocks.
const realFetch = global.fetch; let grokScript = null, grokCalls = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  if(u.startsWith('https://api.x.ai/')){ const body = JSON.parse(opts.body); grokCalls.push(body); const next = grokScript.shift(); if(next && next.status) return new Response('{}', { status: next.status }); return new Response(JSON.stringify(typeof next === 'function' ? next(body) : next), { status: 200 }); }
  if(u.startsWith('https://rdap.org/')){ const d = u.split('/').pop(); return new Response(JSON.stringify({ events:[{ eventAction:'registration', eventDate: d.startsWith('new') ? new Date(Date.now() - 3 * 864e5).toISOString() : '2001-01-01T00:00:00Z' }] }), { status: 200 }); }
  return realFetch(url, opts);
};

const PHISH = `Received: from mail.evil.top (1.2.3.4)
Authentication-Results: mx.google.com; spf=softfail smtp.mailfrom=paypal.com; dkim=none; dmarc=fail (p=REJECT) header.from=paypal.com
From: "service@paypal.com" <alerts@paypa1-billing.top>
Reply-To: help@secure-mailbox.ru
Subject: =?UTF-8?B?WW91ciBhY2NvdW50IGlzIGxpbWl0ZWQ=?=
Date: Mon, 2 Nov 2026 10:00:00 +0000
Message-ID: <x@evil.top>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="BB"

--BB
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<p>Dear customer, your account is limited. Verify your account within 24 h=
ours.</p><a href=3D"http://paypa1-billing.top/login">https://www.paypal.com/signin</a>
--BB
Content-Type: text/html; name="invoice.html"
Content-Disposition: attachment; filename="invoice.html"
Content-Transfer-Encoding: base64

PGh0bWw+PC9odG1sPg==
--BB--
`;
const GOOD = `Received: from mail-sor-f41.google.com
Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=acmeplumbing.com; dkim=pass header.d=acmeplumbing.com; dmarc=pass header.from=acmeplumbing.com
From: Dana Lee <dana@acmeplumbing.com>
To: you@yourshop.com
Subject: Thursday install
Date: Tue, 3 Nov 2026 09:12:00 -0900
Message-ID: <abc@acmeplumbing.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Hi Sam, we're still on for the water heater install Thursday at 9. See you then. Dana`;

// minimal PNG with a tEXt chunk
function png(chunks){
  const crc = b => { let c, t = []; for(let n = 0; n < 256; n++){ c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for(const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const ch = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ch('IHDR', ihdr), ...chunks.map(([t, d]) => ch(t, Buffer.from(d, 'latin1'))), ch('IDAT', zlib.deflateSync(Buffer.from([0, 0]))), ch('IEND', Buffer.alloc(0))]);
}
// minimal JPEG with an EXIF block (Make, Model, Software)
function jpeg(tags, tail = Buffer.alloc(0)){
  const entries = Object.entries(tags); const ifdLen = 2 + entries.length * 12 + 4; let data = Buffer.alloc(0); const ent = [];
  for(const [tag, val] of entries){ const v = Buffer.from(val + '\0', 'latin1'); const off = 8 + ifdLen + data.length; ent.push([Number(tag), v.length, off]); data = Buffer.concat([data, v]); }
  const tiff = Buffer.alloc(8 + ifdLen); tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(entries.length, 8);
  ent.forEach(([tag, n, off], i) => { const e = 10 + i * 12; tiff.writeUInt16LE(tag, e); tiff.writeUInt16LE(2, e + 2); tiff.writeUInt32LE(n, e + 4); tiff.writeUInt32LE(off, e + 8); });
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, data]); const hdr = Buffer.from([0xff, 0xe1, 0, 0]); hdr.writeUInt16BE(app1.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), hdr, app1, Buffer.from([0xff, 0xda, 0, 2]), tail, Buffer.from([0xff, 0xd9])]);
}

(async () => {
  // ---- mail parsing ----
  ok(looksLikeEmail(PHISH) && !looksLikeEmail('Dear customer, verify your account'), 'detects a full email vs a pasted body');
  const em = parseEmail(PHISH);
  ok(em.subject === 'Your account is limited', 'decodes encoded subject');
  ok(/within 24 hours/.test(em.text), 'decodes quoted-printable HTML body (soft line break)');
  ok(em.anchors[0].href === 'http://paypa1-billing.top/login' && /paypal\.com\/signin/.test(em.anchors[0].text), 'reads link href and shown text');
  ok(em.attachments[0].name === 'invoice.html', 'finds attachment name');

  // ---- email agent ----
  fake('paypa1-billing.top', { registered: true, created: '2026-11-05', ageDays: 3, mailServers: 0 });
  fake('secure-mailbox.ru', { registered: true, created: '2026-10-01', ageDays: 38 });
  let r = await agent.emailAgent({ raw: PHISH });
  ok(r.verdict === 'Scam' && r.score >= 90, `phishing email is Scam (${r.score})`);
  for(const l of ['Failed sender check (DMARC)','Fake address in the sender name','Replies go somewhere else','Link goes somewhere other than it says','Dangerous attachment','Brand-new domain','Sender domain can’t receive mail'])
    ok(has(r, l), 'email finding: ' + l);
  ok(!has(r, 'Spoofed sender'), 'no duplicate spoofed-sender finding');
  ok(/header|paypal\.com/.test(r.findings.find(f => f.label.includes('DMARC')).detail), 'DMARC finding names the claimed domain');
  ok(r.steps.some(s => /Looked up paypa1-billing\.top/.test(s.title)) && r.engine === 'checks', 'reports its steps; works without AI');

  fake('acmeplumbing.com', { registered: true, created: '2009-04-01', ageDays: 6400, mailServers: 2 });
  r = await agent.emailAgent({ raw: GOOD });
  ok(r.verdict === 'Safe' && has(r, 'Sender checks passed'), `normal business email is Safe (${r.score})`);
  r = await agent.emailAgent({ raw: 'Hi, please buy 5 Apple gift cards for a client today and send me photos of the codes. Keep this between us.', sender: 'CEO <ceo.office@gmail.com>' });
  ok(r.verdict !== 'Safe' && r.steps[0].title === 'Read the message', 'body-only paste still checked');

  // ---- media ----
  let m = inspectMedia(png([['tEXt', 'parameters\0a cat, Steps: 30, Sampler: Euler a, CFG scale: 7']]), 'image/png');
  ok(m.clues.some(c => c.label === 'AI generation settings found'), 'PNG with Stable Diffusion settings flagged');
  m = inspectMedia(png([['iTXt', 'XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>']]), 'image/png');
  ok(m.aiTag && m.clues[0].points >= 40, 'IPTC "trainedAlgorithmicMedia" label flagged');
  m = inspectMedia(jpeg({ 0x010f:'Apple', 0x0110:'iPhone 15', 0x0131:'FaceApp' }), 'image/jpeg');
  ok(m.camera === 'Apple iPhone 15' && m.software === 'FaceApp' && m.clues.some(c => c.label === 'Edited in an app' && c.points >= 20), 'JPEG EXIF read; face app flagged');
  m = inspectMedia(jpeg({ 0x010f:'Canon', 0x0110:'EOS R6' }, Buffer.from('random image bytes Sora Veo Grok Midjourney trainedAlgorithmicMedia', 'latin1')), 'image/jpeg');
  ok(!m.generator && !m.aiTag && m.camera === 'Canon EOS R6', 'words inside picture data are ignored (no false alarm)');
  m = inspectMedia(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]), 'image/jpeg');
  ok(m.clues.some(c => c.label === 'No metadata to go on'), 'stripped image: neutral note');
  r = await agent.mediaAgent({ file: png([['tEXt', 'Software\0Midjourney v7']]), mime: 'image/png', frames: [] });
  ok(r.kind === 'media' && r.verdict !== 'Safe' && r.label && r.steps.some(s => /Visual review not available/.test(s.title)), 'media agent works without AI');

  // ---- voice ----
  r = await agent.voiceAgent({ transcript: 'Grandma it\'s me, I was in a car accident and I\'m in jail. I need bail money, can you get gift cards? Please don\'t tell Mom. Stay on the line.' });
  ok(r.verdict === 'Scam' && has(r, 'Family emergency script') && has(r, 'Pay in a hard-to-trace way'), `voice-clone family scam is Scam (${r.score})`);
  r = await agent.voiceAgent({ transcript: 'Hi, this is Dr. Patel’s office confirming your appointment Tuesday at 3pm. Call us back if you need to reschedule.' });
  ok(r.verdict === 'Safe', 'normal voicemail is Safe');

  // ---- engine fixes from this round ----
  ok(analyze({ text: 'Your order https://www.amazon.co.uk/orders', sender: 'orders@amazon.co.uk' }).verdict === 'Safe', 'amazon.co.uk is not a lookalike');
  ok(analyze({ text: 'x', subject: 'verify now at paypa1.com' }).reasons.some(x => x.category === 'Lookalike link'), 'links in the subject are checked');
  ok(analyze({ text: 'hello', sender: 123, subject: {} }).verdict === 'Safe' && analyze(null).verdict === 'Safe', 'odd input types don’t crash');

  // ---- Grok tool loop (mocked) ----
  process.env.XAI_API_KEY = 'test-key';
  fake('evil-invoices.top', { registered: true, created: '2026-11-06', ageDays: 2 });
  grokScript = [
    { output: [{ type:'function_call', call_id:'c1', name:'lookup_domain', arguments: JSON.stringify({ domain:'evil-invoices.top' }) }] },
    body => ({ model:'grok-4.7', output: [{ type:'message', content: [{ type:'output_text', text: JSON.stringify({ verdict:'Scam', score:95, summary:'Invoice link goes to a two-day-old domain.', reasons:['Brand-new domain'], next_steps:['Call the vendor'] }) }] }] })
  ];
  grokCalls = [];
  r = await agent.emailAgent({ raw: 'Please pay the attached invoice today at evil-invoices.top/pay', sender: 'Accounts <billing@acmeplumbing.com>' });
  ok(grokCalls.length === 2 && grokCalls[0].tools && grokCalls[0].store === false, 'Grok called with tools, store:false');
  ok(grokCalls[1].input.some(i => i.type === 'function_call_output' && /ageDays/.test(i.output)), 'tool result sent back to Grok');
  ok(grokCalls[0].text && grokCalls[0].text.format.type === 'json_schema', 'structured JSON answer requested');
  ok(r.engine === 'checks+grok' && r.ai.summary && r.steps.some(s => s.title === 'Agent looked up evil-invoices.top') && has(r, 'Brand-new domain'), 'Grok result and tool step included');

  grokScript = [{ output: [{ type:'message', content: [{ type:'output_text', text: JSON.stringify({ verdict:'Safe', score:0, summary:'ok', reasons:[], next_steps:[] }) }] }] }];
  r = await agent.emailAgent({ raw: PHISH });
  ok(r.verdict === 'Scam', 'Grok saying "Safe" can’t override strong evidence');

  grokScript = [{ output: [{ type:'message', content: [{ type:'output_text', text: JSON.stringify({ verdict:'Scam', score:88, summary:'Face edges blur and the hands are malformed.', reasons:['Warped hands'], next_steps:[] }) }] }] }];
  grokCalls = [];
  r = await agent.mediaAgent({ file: jpeg({}), mime: 'image/jpeg', frames: ['data:image/jpeg;base64,/9j/AAAA'], note: 'CEO video asking me to wire money' });
  ok(grokCalls[0].input[1].content.some(c => c.type === 'input_image'), 'image sent to Grok as input_image');
  ok(r.verdict === 'Scam' && r.engine === 'checks+grok', 'Grok visual review drives deepfake verdict');

  grokScript = [{ output: [{ type:'message', content: [{ type:'output_text', text: '{"verdict":"Scam","score":"98","summary":"Boss gift card scam","reasons":[],"next_steps":[]}' }] }] }];
  r = await agent.voiceAgent({ transcript: 'Hi this is your CEO, I am stuck in a meeting, buy gift cards and keep this between us.' });
  ok(r.engine === 'checks+grok' && r.score >= 90 && r.ai.score === 98, `Grok score sent as text still counts (${r.score})`);
  grokScript = [{ status: 502 }, { output: [{ type:'message', content: [{ type:'output_text', text: '{"verdict":"Scam","score":95,"summary":"retried","reasons":[],"next_steps":[]}' }] }] }];
  r = await agent.voiceAgent({ transcript: 'This is the IRS, pay with gift cards now or be arrested.' });
  ok(r.ai && r.ai.summary === 'retried', 'one retry after a Grok server error');
  grokScript = [() => { throw new Error('boom'); }];
  r = await agent.voiceAgent({ transcript: 'This is the IRS, you will be arrested unless you pay with gift cards right now.' });
  ok(r.verdict === 'Scam' && r.aiError, 'Grok failure falls back to the automatic checks');

  // ---- API gating ----
  delete process.env.XAI_API_KEY;
  const app = require('../server'); const srv = app.listen(0); const B = 'http://127.0.0.1:' + srv.address().port;
  const post = (p, body, h = {}) => realFetch(B + p, { method:'POST', headers:{ 'Content-Type':'application/json', ...h }, body: JSON.stringify(body) });
  const team = { 'X-Team-Key': makeKey('cus_AGENT1') };
  try{
    let res = await post('/api/agent/email', { raw: PHISH });
    ok(res.status === 402 && (await res.json()).locked, 'Agent locked without the Team plan');
    res = await post('/api/agent/email', { raw: PHISH }, { 'X-Team-Key': 'SS-cus_FAKE.aaaaaaaaaaaaaaaaaaaaaa' });
    ok(res.status === 402 && (await res.json()).badKey, 'bad key is reported');
    res = await realFetch(B + '/api/agent/media', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ mime:'image/png', file: 'A'.repeat(3e6) }) });
    ok(res.status === 402, 'large upload refused before it is read when not on Team plan');
    res = await post('/api/agent/email', { raw: PHISH }, team); let j = await res.json();
    ok(res.status === 200 && j.verdict === 'Scam', 'Team plan: email agent works over the API');
    res = await post('/api/agent/email', { raw: 'hi' }, team); ok(res.status === 400, 'too-short email rejected');
    res = await post('/api/agent/media', { mime: 'image/png', file: png([['tEXt', 'parameters\0Steps: 20, Sampler: DPM']]).toString('base64'), frames: [] }, team); j = await res.json();
    ok(res.status === 200 && j.findings.some(f => f.label === 'AI generation settings found'), 'Team plan: media agent works over the API');
    res = await post('/api/agent/media', { mime: 'application/pdf', file: 'AAAA' }, team); ok(res.status === 400, 'non-image/video rejected');
    res = await post('/api/agent/voice', { transcript: 'Hi this is your CEO, I am stuck in a meeting, buy gift cards and keep this between us.' }, team); j = await res.json();
    ok(res.status === 200 && j.verdict === 'Scam', 'Team plan: voice agent works over the API');
    res = await post('/api/analyze', { text: 'hello there friend', sender: 42, subject: ['x'] }); ok(res.status === 200, 'checker accepts odd field types without a server error');
    res = await realFetch(B + '/agent'); ok(res.status === 200 && /The ScamSpotter Agent/.test(await res.text()), 'GET /agent page');
    res = await realFetch(B + '/api/health'); j = await res.json(); ok(j.agent === true && j.ai === false, 'health reports agent and AI status');
  } finally { srv.close(); }
  console.log(`Agent tests passed (${pass})`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
