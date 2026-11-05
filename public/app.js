// Checker page (/check)
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sv = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = { Scam: sv('<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 17h.01"/>'),
  Suspicious: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),
  Safe: sv('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>'),
  flag: sv('<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>') };
const colors = { Scam:'var(--bad)', Suspicious:'var(--warn)', Safe:'var(--safe)' };
const goLabel = $('go').querySelector('span');
let source = ''; // 'screenshot' when the message text came from an image
$('text').addEventListener('input', () => { if(!$('text').value.trim()) source = ''; });

const box = document.querySelector('.samples');
[...SAMPLES, LEGIT_SAMPLE].forEach(s => { const b = document.createElement('button'); b.type = 'button'; const legit = s.expect === 'Safe';
  b.className = legit ? 's-safe' : 's-scam'; b.innerHTML = (legit ? ICON.Safe : ICON.flag) + esc(s.label.replace('Example scam: ','').replace('Example: ',''));
  b.dataset.id = s.id; b.onclick = () => { source = ''; $('ocr-status').textContent = ''; $('sender').value = s.sender; $('subject').value = s.subject; $('text').value = s.text; run(); }; box.appendChild(b); });

function showQuota(p){ if(!p) return; const q = $('quota');
  if(p.plan === 'team' && p.httpStatus !== 401) q.textContent = 'Team plan · unlimited checks';
  else if(p.remaining != null) q.textContent = `${p.remaining} of ${p.limit} free checks left today`; }
SS.onPlan(showQuota); SS.refreshPlan();

async function run(e){ e && e.preventDefault(); const out = $('out'); if(!$('text').value.trim()){ $('text').focus(); return; }
  $('go').disabled = true; goLabel.textContent = 'Checking…'; out.innerHTML = '<div class="empty">' + ICON.flag.replace('class="i"','class="i spin"') + 'Scanning…</div>';
  try{
    const r = await fetch('/api/analyze', { method:'POST', headers: SS.headers({ 'Content-Type':'application/json' }), body: JSON.stringify({ text: $('text').value, sender: $('sender').value, subject: $('subject').value, source }) });
    const j = await r.json();
    if(r.status === 402){ SS.updateQuota(j.plan); out.innerHTML = limitHtml(j); return; }
    if(!r.ok) throw new Error(j.error); SS.updateQuota(j.plan); render(j);
  }catch(err){ out.innerHTML = '<div class="empty">' + esc(err.message || 'Something went wrong.') + '</div>'; }
  finally{ $('go').disabled = false; goLabel.textContent = 'Check message'; if(innerWidth < 900) out.scrollIntoView({ behavior:'smooth' }); } }

function limitHtml(j){
  return `<div class="limit"><svg class="i" viewBox="0 0 24 24" style="width:56px;height:56px;color:var(--accent);stroke-width:1.2" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>
  <h2>That’s today’s free checks</h2><p>${esc(j.error)} Free checks reset tomorrow. For unlimited checks for your whole team, start the 14-day free trial.</p>
  ${j.plan && j.plan.badKey ? '<p style="color:var(--bad)">Your saved team key wasn’t accepted. Check it under Your plan.</p>' : ''}
  <div class="ctas"><a class="btn" href="${SS.trialUrl}">Start 14-day free trial</a><button class="btn ghost" type="button" data-menu="plan">I have a team key</button></div></div>`;
}

const REPORT = `<div class="report"><b>Report it (takes a minute, and it helps stop the next one)</b><ul>
<li>Email: forward it to <a href="mailto:reportphishing@apwg.org">reportphishing@apwg.org</a>, then delete it.</li>
<li>Text message: forward it to <b>7726</b> (SPAM).</li>
<li>Report the scam to the FTC at <a href="https://reportfraud.ftc.gov" rel="noopener" target="_blank">reportfraud.ftc.gov</a>.</li>
<li>Already sent money? Call your bank right away, then report it at <a href="https://www.ic3.gov" rel="noopener" target="_blank">ic3.gov</a>.</li></ul></div>`;

function render(j){ const c = colors[j.verdict];
  let h = `<div class="verdict"><div class="gauge" style="--p:${j.score};--c:${c}"><div>${j.score}</div></div><div><span class="pill ${j.verdict}">${ICON[j.verdict]} ${j.verdict}</span><h2 style="color:${c};margin-top:6px">${j.verdict==='Scam'?'Likely a scam':j.verdict==='Suspicious'?'Be careful':'No red flags found'}</h2><div class="sub">Risk score ${j.score}/100 · ${j.engine==='heuristic+llm'?'rules + AI':'rule-based check'}</div></div></div>`;
  const rs = j.reasons.filter(r => r.points > 0 || r.severity === 'info');
  h += rs.length ? '<b class="why">Why</b>' + rs.map(r => `<div class="reason"><span class="dot ${r.severity}"></span><div><b>${esc(r.category)}</b><p>${esc(r.detail)}</p></div></div>`).join('') : '<p style="color:var(--muted)">We didn’t find common scam patterns in this message.</p>';
  if(j.reasons.some(r => r.category === 'Read from a screenshot') && j.links && j.links.length)
    h += `<div class="linkcheck"><b>Links we read from your screenshot</b><p>Compare each one letter by letter with the original message:</p><ul>${j.links.slice(0, 5).map(l => '<li><code>' + esc(l) + '</code></li>').join('')}</ul></div>`;
  h += `<div class="advice"><b>What to do:</b> ${esc(j.advice)}</div>`;
  if(j.verdict !== 'Safe') h += REPORT;
  if(j.llm && !j.llm.error) h += `<div class="llm"><b>AI second opinion (${esc(j.llm.model)}):</b> ${esc(j.llm.verdict)} · ${j.llm.score}/100<ul>${j.llm.reasons.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>`;
  else if(j.llm && j.llm.error) h += `<div class="llm">AI analysis unavailable: ${esc(j.llm.error)}. Showing rule-based result.</div>`;
  h += `<p class="disclaimer">Wrong result? <a href="/#feedback">Tell us</a> and we’ll improve the checker.</p>`;
  $('out').innerHTML = h; }
$('f').addEventListener('submit', run);

// Arriving from the homepage quick check: show that result without using another check.
if(new URLSearchParams(location.search).get('from') === 'home'){
  try{ const last = JSON.parse(sessionStorage.getItem('ss-last') || 'null');
    if(last){ $('sender').value = last.input.sender || ''; $('subject').value = last.input.subject || ''; $('text').value = last.input.text || ''; render(last.result); } }catch(e){}
}

// ---- Screenshots: read on this device, then checked like pasted text ----
const st = $('ocr-status'), shotBtn = $('shot-btn');
async function fromImage(file){
  st.className = 'ocr-status'; shotBtn.disabled = true;
  try{
    const text = await SSOCR.read(file, msg => { st.textContent = msg; });
    $('text').value = text; $('sender').value = ''; $('subject').value = ''; source = 'screenshot';
    st.className = 'ocr-status ok'; st.textContent = 'Text read from your screenshot. Fix anything that looks off and check again.';
    run();
  }catch(err){ st.className = 'ocr-status err'; st.textContent = err.message; }
  finally{ shotBtn.disabled = false; $('shot').value = ''; }
}
shotBtn.addEventListener('click', () => $('shot').click());
['pointerenter','focus','touchstart'].forEach(t => shotBtn.addEventListener(t, () => SSOCR.warm(), { once:true, passive:true }));
$('shot').addEventListener('change', e => { const f = e.target.files[0]; if(f) fromImage(f); });
SSOCR.attach($('f'), fromImage);

// ---- Shared from the phone's Share menu (see sw.js) ----
(async () => {
  const q = new URLSearchParams(location.search);
  if(q.get('shared') === '0'){ st.className = 'ocr-status err'; st.textContent = 'Sharing didn’t finish. Open ScamSpotter from your home screen once, then try sharing again.'; return; }
  if(q.get('shared') !== '1' || !('caches' in window)) return;
  history.replaceState(null, '', '/check');
  try{
    const c = await caches.open('ss-share');
    const [img, txt] = await Promise.all([c.match('/shared/image'), c.match('/shared/text')]);
    await Promise.all([c.delete('/shared/image'), c.delete('/shared/text')]);
    if(img){ const blob = await img.blob(); return fromImage(new File([blob], 'shared', { type: blob.type || 'image/png' })); }
    const text = txt ? (await txt.text()).trim() : '';
    if(text){ $('text').value = text; source = ''; run(); }
  }catch(e){ st.className = 'ocr-status err'; st.textContent = 'Couldn’t open what you shared. Try uploading the screenshot instead.'; }
})();
