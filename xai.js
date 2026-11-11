// Grok (xAI) client: Responses API, stateless (store:false), with an optional tool loop.
// Only used when XAI_API_KEY is set. Message content is untrusted: prompts say so, and tools are read-only lookups.
const BASE = 'https://api.x.ai/v1';
const model = () => process.env.XAI_MODEL || 'grok-4.7';
const enabled = () => !!process.env.XAI_API_KEY;

async function call(body, timeoutMs){
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(BASE + '/responses', { method:'POST', signal:ctrl.signal,
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + process.env.XAI_API_KEY },
      body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if(!r.ok){ const e = new Error('Grok request failed (' + r.status + ')'); e.status = r.status; e.detail = j && j.error; throw e; }
    return j;
  } finally { clearTimeout(t); }
}

// Pull the first JSON object out of the model's text answer.
function parseJson(text){
  try{ return JSON.parse(text); }catch{}
  const m = /\{[\s\S]*\}/.exec(String(text || '')); if(m){ try{ return JSON.parse(m[0]); }catch{} }
  return null;
}
const outputText = j => (j.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('') || j.output_text || '';

/**
 * Ask Grok for a JSON answer.
 *  system, user: prompt text (user may also be an array of content parts, e.g. images)
 *  schema: JSON schema for the answer
 *  tools: [{ name, description, parameters, run: async args => result }]
 *  onStep: called with { tool, args, result } for each tool call (shown to the user as "what the agent checked")
 */
async function ask({ system, user, schema, schemaName = 'answer', tools = [], maxTurns = 4, timeoutMs = 45000, onStep }){
  if(!enabled()) return null;
  const input = [{ role:'system', content: system }, { role:'user', content: user }];
  const toolDefs = tools.map(t => ({ type:'function', name:t.name, description:t.description, parameters:t.parameters }));
  let useFormat = true; const started = Date.now();
  for(let turn = 0; turn <= maxTurns; turn++){
    const body = { model: model(), input, store:false, temperature:0 };
    if(toolDefs.length && turn < maxTurns) body.tools = toolDefs;
    if(useFormat && schema) body.text = { format:{ type:'json_schema', name:schemaName, schema, strict:true } };
    let j;
    const left = () => Math.max(5000, timeoutMs - (Date.now() - started));
    try{ j = await call(body, left()); }
    catch(e){
      if(e.status === 400 && useFormat){ useFormat = false; turn--; continue; } // older models: retry without the schema option
      if((e.status >= 500 || e.status === 429) && timeoutMs - (Date.now() - started) > 15000){ await new Promise(r => setTimeout(r, 1500)); j = await call(body, left()); } // one retry on a passing server error
      else throw e;
    }
    const calls = (j.output || []).filter(o => o.type === 'function_call');
    if(calls.length && turn < maxTurns){
      for(const c of calls.slice(0, 4)){
        input.push({ type:'function_call', call_id:c.call_id, name:c.name, arguments:c.arguments });
        const tool = tools.find(t => t.name === c.name); let args = {}; try{ args = JSON.parse(c.arguments || '{}'); }catch{}
        let result; try{ result = tool ? await tool.run(args) : { error:'unknown tool' }; }catch(e){ result = { error: e.message }; }
        onStep && onStep({ tool:c.name, args, result });
        input.push({ type:'function_call_output', call_id:c.call_id, output: JSON.stringify(result).slice(0, 4000) });
      }
      continue;
    }
    const out = parseJson(outputText(j));
    if(!out) throw new Error('Grok returned an unreadable answer');
    return { ...out, model: j.model || model() };
  }
  throw new Error('Grok did not finish');
}

module.exports = { ask, enabled, model };
