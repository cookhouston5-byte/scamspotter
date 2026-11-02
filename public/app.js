const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sv=d=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON={Scam:sv('<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>'),Suspicious:sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),Safe:sv('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>'),flag:sv('<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>')};
const box=document.querySelector('.samples');
[...SAMPLES,LEGIT_SAMPLE].forEach(s=>{const b=document.createElement('button');b.type='button';const legit=s.expect==='Safe';b.className=legit?'s-safe':'s-scam';b.innerHTML=(legit?ICON.Safe:ICON.flag)+esc(s.label.replace('Example scam: ','').replace('Example: ',''));b.dataset.id=s.id;
 b.onclick=()=>{$('sender').value=s.sender;$('subject').value=s.subject;$('text').value=s.text;run();};box.appendChild(b);});
const colors={Scam:'var(--bad)',Suspicious:'var(--warn)',Safe:'var(--safe)'};const icons=ICON;
async function run(e){e&&e.preventDefault();const out=$('out');if(!$('text').value.trim()){$('text').focus();return;}
 $('go').disabled=true;$('go').textContent='Checking…';out.innerHTML='<div class="empty">'+ICON.flag.replace('class="i"','class="i spin"')+'Scanning…</div>';
 try{const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('text').value,sender:$('sender').value,subject:$('subject').value})});
  const j=await r.json();if(!r.ok)throw new Error(j.error);render(j);}
 catch(err){out.innerHTML='<div class="empty">'+esc(err.message||'Something went wrong.')+'</div>';}
 finally{$('go').disabled=false;$('go').textContent='Check message';if(innerWidth<900)out.scrollIntoView({behavior:'smooth'});}}
function render(j){const c=colors[j.verdict];
 let h=`<div class="verdict"><div class="gauge" style="--p:${j.score};--c:${c}"><div>${j.score}</div></div><div><span class="pill ${j.verdict}">${icons[j.verdict]} ${j.verdict}</span><h2 style="color:${c};margin-top:6px">${j.verdict==='Scam'?'Likely a scam':j.verdict==='Suspicious'?'Be careful':'No red flags found'}</h2><div class="sub">Risk score ${j.score}/100 · ${j.engine==='heuristic+llm'?'rules + AI':'rule-based check'}</div></div></div>`;
 const rs=j.reasons.filter(r=>r.points>0||r.severity==='info');
 h+= rs.length? '<b class="why">Why</b>'+rs.map(r=>`<div class="reason"><span class="dot ${r.severity}"></span><div><b>${esc(r.category)}</b><p>${esc(r.detail)}</p></div></div>`).join('') : '<p style="color:var(--muted)">We didn\'t find common scam patterns in this message.</p>';
 h+=`<div class="advice"><b>What to do:</b> ${esc(j.advice)}</div>`;
 if(j.llm&&!j.llm.error) h+=`<div class="llm"><b>AI second opinion (${esc(j.llm.model)}):</b> ${esc(j.llm.verdict)} · ${j.llm.score}/100<ul>${j.llm.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></div>`;
 else if(j.llm&&j.llm.error) h+=`<div class="llm">AI analysis unavailable: ${esc(j.llm.error)}. Showing rule-based result.</div>`;
 $('out').innerHTML=h;}
$('f').addEventListener('submit',run);
