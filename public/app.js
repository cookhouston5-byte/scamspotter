const $=id=>document.getElementById(id);
const box=document.querySelector('.samples');
[...SAMPLES,LEGIT_SAMPLE].forEach(s=>{const b=document.createElement('button');b.type='button';b.textContent=s.label.replace('Example scam: ','🚩 ').replace('Example: ','✅ ');b.dataset.id=s.id;
 b.onclick=()=>{$('sender').value=s.sender;$('subject').value=s.subject;$('text').value=s.text;run();};box.appendChild(b);});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const colors={Scam:'var(--bad)',Suspicious:'var(--warn)',Safe:'var(--safe)'};const icons={Scam:'⚠',Suspicious:'?',Safe:'✓'};
async function run(e){e&&e.preventDefault();const out=$('out');if(!$('text').value.trim()){$('text').focus();return;}
 $('go').disabled=true;$('go').textContent='Checking…';out.innerHTML='<div class="empty">Analyzing…</div>';
 try{const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('text').value,sender:$('sender').value,subject:$('subject').value})});
  const j=await r.json();if(!r.ok)throw new Error(j.error);render(j);}
 catch(err){out.innerHTML='<div class="empty">'+esc(err.message||'Something went wrong.')+'</div>';}
 finally{$('go').disabled=false;$('go').textContent='Check message';if(innerWidth<900)out.scrollIntoView({behavior:'smooth'});}}
function render(j){const c=colors[j.verdict];
 let h=`<div class="verdict"><div class="gauge" style="--p:${j.score};--c:${c}"><div>${j.score}</div></div><div><span class="pill ${j.verdict}">${icons[j.verdict]} ${j.verdict}</span><h2 style="color:${c};margin-top:6px">${j.verdict==='Scam'?'Likely a scam':j.verdict==='Suspicious'?'Be careful':'No red flags found'}</h2><div class="sub">Risk score ${j.score}/100 · ${j.engine==='heuristic+llm'?'rules + AI':'rule-based check'}</div></div></div>`;
 const rs=j.reasons.filter(r=>r.points>0||r.severity==='info');
 h+= rs.length? '<b style="color:var(--navy)">Why:</b>'+rs.map(r=>`<div class="reason"><span class="dot ${r.severity}"></span><div><b>${esc(r.category)}</b><p>${esc(r.detail)}</p></div></div>`).join('') : '<p style="color:var(--muted)">We didn\'t find common scam patterns in this message.</p>';
 h+=`<div class="advice"><b>What to do:</b> ${esc(j.advice)}</div>`;
 if(j.llm&&!j.llm.error) h+=`<div class="llm"><b>AI second opinion (${esc(j.llm.model)}):</b> ${esc(j.llm.verdict)} · ${j.llm.score}/100<ul>${j.llm.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`;
 else if(j.llm&&j.llm.error) h+=`<div class="llm">AI analysis unavailable: ${esc(j.llm.error)}. Showing rule-based result.</div>`;
 $('out').innerHTML=h;}
$('f').addEventListener('submit',run);
