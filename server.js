const express = require('express'); const fs = require('fs'); const path = require('path');
const { analyze } = require('./engine'); const { llmAnalyze } = require('./llm');
const app = express(); app.use(express.json({ limit:'200kb' }));
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
const PORT = process.env.PORT || 3000;
if(require.main===module) app.listen(PORT, ()=>console.log('ScamSpotter on http://localhost:'+PORT));
module.exports = app;
