const express = require('express'); const fs = require('fs'); const path = require('path');
const { analyze } = require('./engine'); const { llmAnalyze } = require('./llm');
const crypto = require('crypto');
const app = express(); app.set('trust proxy', 1); app.use(express.json({ limit:'200kb' }));
app.use(express.static(path.join(__dirname,'public'), { extensions:['html'] }));
const DATA = path.join(__dirname,'data','signups.json');

app.get('/api/health', (req,res)=>res.json({ ok:true, llm: !!process.env.OPENAI_API_KEY }));
app.post('/api/analyze', async (req,res)=>{
  const { text='', sender='', subject='' } = req.body||{};
  if(!String(text).trim()) return res.status(400).json({ error:'Paste the message text to check.' });
  if(String(text).length > 50000) return res.status(413).json({ error:'Message too long (50,000 characters max).' });
  const h = analyze({ text, sender, subject });
  const llm = await llmAnalyze({ text, sender, subject }, h);
  let result = { ...h, llm };
  if(llm && !llm.error && llm.verdict){
    // blend: weighted average, never lower than a strong rule-based hit
    const blended = Math.round(h.score*0.5 + llm.score*0.5);
    result.score = h.score >= 55 ? Math.max(h.score, blended) : blended;
    result.verdict = result.score>=55?'Scam':result.score>=25?'Suspicious':'Safe';
    result.engine = 'heuristic+llm';
  }
  res.json(result);
});
app.post('/api/signup', (req,res)=>{
  const name = String(req.body?.name||'').trim().slice(0,100); const email = String(req.body?.email||'').trim().toLowerCase().slice(0,200);
  if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error:'Please enter your name and a valid email.' });
  let list=[]; try{ list = JSON.parse(fs.readFileSync(DATA,'utf8')); }catch{}
  if(!list.some(x=>x.email===email)) list.push({ name, email, business: String(req.body?.business||'').slice(0,150), at:new Date().toISOString() });
  fs.mkdirSync(path.dirname(DATA),{recursive:true}); fs.writeFileSync(DATA, JSON.stringify(list,null,2));
  res.json({ ok:true });
});
// Feedback / suggested fixes. Stored server-side only (JSON Lines), never shown publicly.
const FEEDBACK = process.env.FEEDBACK_FILE || path.join(__dirname,'data','feedback.jsonl');
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = (v, max) => escHtml(String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0, max));
const fbHits = new Map(); // simple per-IP rate limit: 5 per 10 minutes
app.post('/api/feedback', (req,res)=>{
  const b = req.body || {};
  if(String(b.website||'').trim()) return res.json({ ok:true }); // honeypot filled: silently drop
  const raw = String(b.message ?? '').trim();
  if(raw.length < 5) return res.status(400).json({ error:'Please write a message (at least 5 characters).' });
  if(raw.length > 2000) return res.status(400).json({ error:'Message too long (2,000 characters max).' });
  const email = String(b.email ?? '').trim().toLowerCase();
  if(email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error:'That email doesn\'t look right. Leave it blank or fix it.' });
  const now = Date.now(), ip = req.ip || 'unknown';
  const hits = (fbHits.get(ip) || []).filter(t => now - t < 600000);
  if(hits.length >= 5) return res.status(429).json({ error:'Thanks! You\'ve sent a few already. Please try again later.' });
  hits.push(now); fbHits.set(ip, hits); if(fbHits.size > 5000) fbHits.clear();
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), name: clean(b.name,100), email: clean(email,200),
    page: clean(b.page,200), message: clean(raw,2000), ip: crypto.createHash('sha256').update(ip).digest('hex').slice(0,12) };
  try{ fs.mkdirSync(path.dirname(FEEDBACK),{recursive:true}); fs.appendFileSync(FEEDBACK, JSON.stringify(entry)+'\n'); }
  catch(e){ console.error('feedback write failed:', e.message); }
  console.log('[feedback]', JSON.stringify(entry)); // also lands in the Render log stream
  res.json({ ok:true });
});
// Owner-only read: disabled unless FEEDBACK_TOKEN is set; send it as "Authorization: Bearer <token>".
app.get('/api/feedback', (req,res)=>{
  const tok = process.env.FEEDBACK_TOKEN; const got = String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!tok || got.length !== tok.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(tok))) return res.status(404).json({ error:'Not found' });
  let items = []; try{ items = fs.readFileSync(FEEDBACK,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)); }catch{}
  res.json({ count: items.length, items });
});
app.use('/api', (req,res)=>res.status(404).json({ error:'Not found' }));
// JSON errors for API calls (malformed JSON, oversized body) instead of an HTML error page / stack trace
app.use((err, req, res, next)=>{
  const status = err.status || err.statusCode || 500;
  if(status >= 500) console.error(err);
  res.status(status).json({ error: status===413 ? 'Request too large.' : status===400 ? 'Invalid request.' : 'Something went wrong.' });
});
const PORT = process.env.PORT || 3000;
if(require.main===module) app.listen(PORT, ()=>console.log('ScamSpotter on http://localhost:'+PORT));
module.exports = app;
