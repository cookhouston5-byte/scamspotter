// Homepage: the quick checker in the hero, and the feedback form.
(function(){
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const form = $('hs'), ta = $('hs-text'), out = $('hs-out'), go = $('hs-go'), quota = $('hs-quota');

function showQuota(p){ if(!p) return;
  if(p.plan === 'team' && p.httpStatus !== 401) quota.textContent = 'Team plan · unlimited';
  else if(p.remaining != null) quota.textContent = `${p.remaining} of ${p.limit} free checks left today`; }
if(window.SS){ SS.onPlan(showQuota); SS.refreshPlan(); }

document.querySelector('[data-focus-scan]').addEventListener('click', e => { e.preventDefault(); $('scan').scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(() => ta.focus({ preventScroll:true }), 350); });
let si = 0;
$('hs-sample').addEventListener('click', () => { const s = SAMPLES[si++ % SAMPLES.length];
  ta.value = `From: ${s.sender}\nSubject: ${s.subject}\n\n${s.text}`; ta.focus(); });

// Pull "From:" and "Subject:" lines out of a pasted email so the sender checks can run.
function split(raw){
  let sender = '', subject = ''; const lines = raw.split('\n'); let i = 0;
  for(; i < Math.min(lines.length, 6); i++){
    const m = /^\s*(from|subject)\s*:\s*(.+)$/i.exec(lines[i]);
    if(m){ if(m[1].toLowerCase() === 'from') sender = m[2].trim(); else subject = m[2].trim(); } else if(lines[i].trim()) break;
  }
  return { sender, subject, text: (sender || subject) ? lines.slice(i).join('\n').trim() : raw.trim() };
}

form.addEventListener('submit', async e => {
  e.preventDefault(); const raw = ta.value.trim(); if(!raw){ ta.focus(); return; }
  const input = split(raw); if(!input.text) input.text = raw;
  go.disabled = true; go.lastChild.textContent = 'Scanning…'; out.innerHTML = '';
  try{
    const r = await fetch('/api/analyze', { method:'POST', headers: SS.headers({ 'Content-Type':'application/json' }), body: JSON.stringify(input) });
    const j = await r.json();
    if(r.status === 402){ out.innerHTML = `<div class="mini"><p style="margin:0 0 10px"><b>${esc(j.error)}</b> Come back tomorrow, or get unlimited checks for your whole team.</p>${SS.billingChoiceHtml()}<div class="ctas"><a class="btn sm" data-plan-link href="${esc(SS.planUrl())}">Start 14-day free trial</a><button class="btn ghost sm" type="button" data-menu="plan">I have a team key</button></div></div>`; SS.updateQuota(j.plan); return; }
    if(!r.ok) throw new Error(j.error || 'Something went wrong.');
    SS.updateQuota(j.plan);
    try{ sessionStorage.setItem('ss-last', JSON.stringify({ input, result: j })); }catch(e){}
    const top = j.reasons.filter(x => x.points > 0).slice(0, 3);
    out.innerHTML = `<div class="mini"><div class="res"><span class="pill ${j.verdict}">${j.verdict}</span><span class="score">Risk ${j.score}/100</span></div>
      ${top.length ? '<ul>' + top.map(x => '<li>' + esc(x.category) + '</li>').join('') + '</ul>' : '<p style="margin:10px 0 0;color:var(--muted);font-size:14px">No common scam patterns found.</p>'}
      <a class="more" href="/check?from=home">See the full report and what to do →</a></div>`;
  }catch(err){ out.innerHTML = `<div class="mini"><p style="margin:0;color:var(--bad)">${esc(err.message)}</p></div>`; }
  finally{ go.disabled = false; go.lastChild.textContent = 'Check it'; }
});

// Feedback form
const fb = $('fb'), fm = $('fb-msg'), fo = $('fb-msgout'), fc = $('fb-count');
fm.addEventListener('input', () => { fc.textContent = fm.value.length + ' / 2000'; });
fb.addEventListener('submit', async e => { e.preventDefault(); const msg = fm.value.trim();
  if(msg.length < 5){ fo.className = 'formmsg err'; fo.textContent = 'Please write a message (at least 5 characters).'; fm.focus(); return; }
  const b = $('fb-go'); b.disabled = true; b.textContent = 'Sending…';
  try{ const r = await fetch('/api/feedback', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ name: fb.elements.name.value, email: fb.elements.email.value, message: msg, website: fb.elements.website.value, page: location.pathname }) });
    const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || 'Could not send. Please try again.');
    fb.reset(); fc.textContent = '0 / 2000'; fo.className = 'formmsg ok'; fo.textContent = 'Thanks! Your feedback was sent to Houston.'; }
  catch(err){ fo.className = 'formmsg err'; fo.textContent = err.message; }
  finally{ b.disabled = false; b.textContent = 'Send feedback'; } });

// Old Stripe redirect (?subscribed=1) → the welcome page
if(new URLSearchParams(location.search).get('subscribed') === '1') location.replace('/welcome');
})();
