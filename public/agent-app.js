// Agent page (/agent): Team plan investigations for emails, photos/videos, and voice calls.
(function(){
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const out = $('ag-out'), colors = { Scam:'var(--bad)', Suspicious:'var(--warn)', Safe:'var(--safe)' };
const reticle = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>';
let isTeam = false;

// ---- tabs ----
const tabs = [...document.querySelectorAll('[role=tab]')];
function select(t, focus){ tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $(x.getAttribute('aria-controls')).hidden = !on; }); if(focus) t.focus();
  try{ history.replaceState(null, '', '#' + t.id.slice(2)); }catch(e){} }
tabs.forEach((t, i) => { t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if(d){ e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); } }); });
const start = tabs.find(t => '#' + t.id.slice(2) === location.hash); if(start) select(start);

// ---- plan ----
const lockHtml = (msg) => `<div class="limit">${reticle.replace('class="i"', 'class="i" style="width:56px;height:56px;color:var(--accent);stroke-width:1.2"')}
  <h2>The Agent is part of the Team plan</h2><p>${esc(msg || '')} Deeper email investigations, deepfake checks for photos and videos, and voice-call checks, for everyone at your business. 14 days free.</p>
  <div class="ctas"><a class="btn" href="${SS.trialUrl}">Start 14-day free trial</a><button class="btn ghost" type="button" data-menu="plan">I have a team key</button></div></div>`;
SS.onPlan(p => { if(!p) return; isTeam = p.plan === 'team' && p.httpStatus !== 401 && p.active !== false;
  $('ag-plan').textContent = isTeam ? 'Team plan · Agent included' : 'Agent needs the Team plan';
  if(!isTeam && !out.dataset.used) out.innerHTML = lockHtml(); else if(isTeam && out.querySelector('.limit')) out.innerHTML = '<div class="empty">' + reticle + 'You’re all set. Choose what to check.</div>'; });
SS.refreshPlan();

// ---- shared submit ----
async function send(kind, body, btn){
  const label = btn.querySelector('span'), was = label.textContent; btn.disabled = true; label.textContent = 'Investigating…'; out.dataset.used = '1';
  out.innerHTML = '<div class="empty">' + reticle.replace('class="i"', 'class="i spin"') + (kind === 'media' ? 'Looking closely at the file…' : 'The Agent is investigating…') + '<br><small>This can take up to a minute.</small></div>';
  try{
    const r = await fetch('/api/agent/' + kind, { method:'POST', headers: SS.headers({ 'Content-Type':'application/json' }), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: r.status === 413 ? 'That file is too large.' : 'Something went wrong.' }));
    if(r.status === 402){ out.innerHTML = lockHtml(j.badKey ? 'Your saved team key wasn’t accepted.' : ''); return; }
    if(!r.ok) throw new Error(j.error || 'Something went wrong.');
    render(j);
  }catch(err){ out.innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; }
  finally{ btn.disabled = false; label.textContent = was; if(innerWidth < 900) out.scrollIntoView({ behavior:'smooth' }); }
}

function render(j){
  const c = colors[j.verdict];
  let h = `<div class="verdict"><div class="gauge" style="--p:${j.score};--c:${c}"><div>${j.score}</div></div><div><span class="pill ${j.verdict}">${esc(j.verdict === 'Safe' ? 'Low risk' : j.verdict)}</span><h2 style="color:${c};margin-top:6px">${esc(j.label)}</h2><div class="sub">Risk score ${j.score}/100 · ${j.engine === 'checks+grok' ? 'Agent checks + Grok' : 'Agent checks'}</div></div></div>`;
  if(j.ai && j.ai.summary) h += `<div class="ai-sum"><b>Agent summary</b><p>${esc(j.ai.summary)}</p></div>`;
  const fs = j.findings.filter(f => f.points > 0 || f.severity === 'info');
  h += fs.length ? '<b class="why">What we found</b>' + fs.map(f => `<div class="reason"><span class="dot ${f.severity}"></span><div><b>${esc(f.label)}</b><p>${esc(f.detail)}</p></div></div>`).join('') : '<p style="color:var(--muted)">No warning signs found in the checks.</p>';
  if(j.ai && j.ai.reasons && j.ai.reasons.length) h += `<div class="llm"><b>Grok’s reasons:</b><ul>${j.ai.reasons.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>`;
  h += `<div class="advice"><b>What to do:</b> ${esc(j.advice)}${j.ai && j.ai.nextSteps && j.ai.nextSteps.length ? '<ul style="margin:8px 0 0">' + j.ai.nextSteps.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : ''}</div>`;
  if(j.steps && j.steps.length) h += `<details class="ag-steps"><summary>What the Agent checked (${j.steps.length})</summary><ol>${j.steps.map(s => `<li><b>${esc(s.title)}</b>${s.detail ? '<span>' + esc(s.detail) + '</span>' : ''}</li>`).join('')}</ol></details>`;
  if(j.aiError) h += `<div class="llm">${esc(j.aiError)}. Showing the Agent’s automatic checks.</div>`;
  if(j.kind === 'media') h += '<p class="disclaimer">No tool can prove a photo or video is real: good fakes can pass every check. If it’s being used to ask for money or access, confirm with the person on a call you start.</p>';
  else h += '<p class="disclaimer">Wrong result? <a href="/#feedback">Tell us</a> and we’ll improve the Agent.</p>';
  out.innerHTML = h;
}

// ---- email ----
$('ae-up').addEventListener('click', () => $('ae-file').click());
$('ae-file').addEventListener('change', async e => { const f = e.target.files[0]; if(!f) return;
  if(f.size > 3e6){ $('ae-fname').textContent = 'That file is too large (3 MB max).'; return; }
  $('ae-raw').value = await f.text(); $('ae-fname').textContent = f.name; e.target.value = ''; });
$('p-email').addEventListener('submit', e => { e.preventDefault(); const raw = $('ae-raw').value.trim();
  if(raw.length < 10){ $('ae-raw').focus(); return; } send('email', { raw }, e.submitter || e.target.querySelector('button[type=submit]')); });

// ---- photo / video ----
let media = null; const st = $('am-status');
const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for(let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
function toJpeg(src, w, h){ const k = Math.min(1, 1600 / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.88); }
async function imageFrames(file){ try{ const bmp = await createImageBitmap(file); return [toJpeg(bmp, bmp.width, bmp.height)]; }catch(e){ return []; } }
function videoFrames(file){ return new Promise(resolve => {
  const v = document.createElement('video'), url = URL.createObjectURL(file), frames = []; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  const done = () => { URL.revokeObjectURL(url); resolve(frames); }; const timer = setTimeout(done, 20000);
  v.onerror = () => { clearTimeout(timer); done(); };
  v.onloadedmetadata = async () => {
    const d = isFinite(v.duration) ? v.duration : 0; const times = d ? [0.1, 0.35, 0.6, 0.85].map(x => x * d) : [0];
    for(const t of times){ await new Promise(ok => { v.onseeked = ok; v.currentTime = t; setTimeout(ok, 4000); }); if(v.videoWidth) frames.push(toJpeg(v, v.videoWidth, v.videoHeight)); }
    clearTimeout(timer); done(); };
}); }
async function pick(file){
  if(!/^(image|video)\//.test(file.type)){ st.className = 'ocr-status err'; st.textContent = 'Choose a photo or video file.'; return; }
  const isVideo = file.type.startsWith('video/');
  if(!isVideo && file.size > 25e6){ st.className = 'ocr-status err'; st.textContent = 'That image is too large (25 MB max).'; return; }
  if(isVideo && file.size > 500e6){ st.className = 'ocr-status err'; st.textContent = 'That video is too large (500 MB max).'; return; }
  st.className = 'ocr-status'; st.textContent = isVideo ? 'Taking still frames from the video…' : 'Preparing the image…';
  // The start of the file holds its hidden details (camera, editing app, AI labels). Only the first few MB are sent.
  const head = await file.slice(0, isVideo ? 4e6 : 6e6).arrayBuffer();
  const frames = isVideo ? await videoFrames(file) : await imageFrames(file);
  media = { file: b64(head), mime: file.type, name: file.name, frames };
  const p = $('am-prev'); p.hidden = false;
  p.innerHTML = frames.length ? frames.map(f => `<img src="${f}" alt="">`).join('') : '';
  st.className = frames.length ? 'ocr-status ok' : 'ocr-status err';
  st.textContent = frames.length ? `${esc(file.name)} is ready to check.` : 'Your browser couldn’t open this file to look at it, so only its hidden details will be checked. Try a JPG, PNG, or MP4.';
}
$('am-up').addEventListener('click', () => $('am-file').click());
$('am-file').addEventListener('change', e => { const f = e.target.files[0]; if(f) pick(f); e.target.value = ''; });
const drop = $('am-drop');
['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('drag')));
drop.addEventListener('drop', e => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])][0]; if(f) pick(f); });
$('p-media').addEventListener('submit', e => { e.preventDefault();
  if(!media){ st.className = 'ocr-status err'; st.textContent = 'Choose a photo or video first.'; $('am-up').focus(); return; }
  send('media', { ...media, note: $('am-note').value.trim() }, e.submitter || e.target.querySelector('button[type=submit]')); });

// ---- voice ----
$('p-voice').addEventListener('submit', e => { e.preventDefault(); const t = $('av-t').value.trim();
  if(t.length < 10){ $('av-t').focus(); return; } send('voice', { transcript: t, caller: $('av-caller').value.trim() }, e.submitter || e.target.querySelector('button[type=submit]')); });
})();
