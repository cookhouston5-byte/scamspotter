// Optional LLM second opinion. Only used when OPENAI_API_KEY is set.
async function llmAnalyze({ text, sender, subject }, heuristic){
  const key = process.env.OPENAI_API_KEY; if(!key) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = `You are a fraud analyst for small businesses. Analyze this message for phishing, invoice fraud, payment-change fraud, gift card scams, and fake tech support.\nSender: ${sender||'(none)'}\nSubject: ${subject||'(none)'}\nMessage:\n"""${String(text).slice(0,8000)}"""\nA rule engine scored it ${heuristic.score}/100 (${heuristic.verdict}).\nReturn JSON: {"verdict":"Safe|Suspicious|Scam","score":0-100,"reasons":["short plain-English reason", ...]}`;
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 20000);
  try{
    const r = await fetch('https://api.openai.com/v1/chat/completions',{ method:'POST', signal:ctrl.signal,
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+key },
      body: JSON.stringify({ model, response_format:{type:'json_object'}, temperature:0, messages:[{role:'user',content:prompt}] }) });
    if(!r.ok) return { error:'LLM request failed ('+r.status+')' };
    const j = await r.json(); const o = JSON.parse(j.choices[0].message.content);
    const score = Math.max(0,Math.min(100,Number(o.score)||0));
    return { verdict:['Safe','Suspicious','Scam'].includes(o.verdict)?o.verdict:null, score, reasons:(o.reasons||[]).slice(0,6).map(String), model };
  }catch(e){ return { error:'LLM unavailable: '+e.message }; } finally { clearTimeout(t); }
}
module.exports = { llmAnalyze };
