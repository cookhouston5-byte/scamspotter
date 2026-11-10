// ScamSpotter extension popup. Sends text to scamspotter.app only when the person asks for a check.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SITE = 'https://scamspotter.app';
const TRIAL = 'https://buy.stripe.com/7sY7sL3WAdh23e80D0asg04';
const colors = { Scam:'var(--bad)', Suspicious:'var(--warn)', Safe:'var(--safe)' };
const titles = { Scam:'Likely a scam', Suspicious:'Be careful', Safe:'No red flags found' };
const MAIL_HOSTS = /^(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$/;
if(new URLSearchParams(location.search).get('window')) document.body.classList.add('win');

let api = SITE, key = '';
const ready = chrome.storage.local.get(['teamKey', 'apiBase']).then(s => { key = s.teamKey || ''; api = s.apiBase || SITE; $('key').value = key; });

// ---- settings: team key ----
$('gear').addEventListener('click', () => { const s = $('settings'); s.hidden = !s.hidden; $('gear').setAttribute('aria-expanded', String(!s.hidden)); if(!s.hidden) $('key').focus(); });
$('save').addEventListener('click', async () => {
  const v = $('key').value.trim(); const m = $('keymsg');
  if(v && !/^SS-cus_[A-Za-z0-9]+\.[A-Za-z0-9_-]{22}$/.test(v)){ m.className = 'msg err'; m.textContent = 'That doesn’t look like a team key. It starts with SS-cus_ and is copied in full from your welcome email.'; return; }
  m.className = 'msg'; m.textContent = 'Checking…';
  try{
    const r = await fetch(api + '/api/plan', { headers: v ? { 'X-Team-Key': v } : {} }); const j = await r.json();
    if(v && (r.status === 401 || j.active === false)){ m.className = 'msg err'; m.textContent = j.error || 'That key isn’t active. Check your plan on scamspotter.app.'; return; }
    key = v; await chrome.storage.local.set({ teamKey: v });
    m.className = 'msg ok'; m.textContent = v ? 'Saved. Unlimited checks are on.' : 'Key removed.'; showQuota(j);
  }catch(e){ m.className = 'msg err'; m.textContent = 'Couldn’t reach ScamSpotter. Check your internet connection.'; }
});

function showQuota(p){
  if(!p) return; const q = $('quota');
  if(p.plan === 'team' || p.type === 'team') q.textContent = 'Team plan · unlimited';
  else if(p.remaining != null) q.textContent = `${p.remaining} of ${p.limit} free checks left today`;
}

// ---- checking ----
async function check(input){
  await ready;
  const out = $('out'), go = $('go'); go.disabled = true; $('tip').hidden = true;
  out.innerHTML = '<p class="note"><svg class="spin" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-4px;margin-right:6px"><circle cx="12" cy="12" r="7"/><path d="M12 2.5v4"/></svg>Checking…</p>';
  try{
    const r = await fetch(api + '/api/analyze', { method:'POST', headers: { 'Content-Type':'application/json', ...(key ? { 'X-Team-Key': key } : {}) }, body: JSON.stringify(input) });
    const j = await r.json().catch(() => ({ error:'Something went wrong on our end. Please try again in a minute.' }));
    if(r.status === 402){ showQuota(j.plan); out.innerHTML = `<p><b>${esc(j.error)}</b> Free checks reset tomorrow.</p><div class="links"><a class="btn sm" href="${TRIAL}" target="_blank" rel="noopener">Start 14-day free trial</a></div>${j.plan && j.plan.badKey ? '<p class="err small">Your saved team key wasn’t accepted. Check it under Settings (the gear).</p>' : ''}`; return; }
    if(!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    showQuota(j.plan); render(j);
  }catch(e){ out.innerHTML = '<p class="err">' + esc(e instanceof TypeError ? 'Couldn’t reach ScamSpotter. Check your internet connection and try again.' : e.message) + '</p>'; }
  finally{ go.disabled = false; }
}

function render(j){
  const c = colors[j.verdict]; const rs = j.reasons.filter(r => r.points > 0).slice(0, 4);
  let h = `<div class="res"><div class="gauge" style="--p:${j.score};--c:${c}"><div>${j.score}</div></div><div><span class="pill ${j.verdict}">${j.verdict}</span><h2 style="color:${c}">${titles[j.verdict]}</h2></div></div>`;
  h += rs.length ? '<ul class="why">' + rs.map(r => `<li><b>${esc(r.category)}</b><span>${esc(r.detail.replace(/ \(matched: .*\)$/, ''))}</span></li>`).join('') + '</ul>' : '<p class="note">We didn’t find common scam patterns.</p>';
  if(j.llm && !j.llm.error && j.llm.reasons && j.llm.reasons.length) h += `<p class="note" style="margin:8px 0 0"><b>Grok:</b> ${esc(j.llm.reasons[0])}</p>`;
  h += `<div class="advice"><b>What to do:</b> ${esc(j.advice)}</div>`;
  h += `<div class="links">${key ? `<a href="${SITE}/agent#email" target="_blank" rel="noopener">Investigate with the Agent</a>` : ''}<a href="https://reportfraud.ftc.gov" target="_blank" rel="noopener">Report a scam</a></div>`;
  $('out').innerHTML = h;
}

$('f').addEventListener('submit', e => { e.preventDefault(); const t = $('text').value.trim(); if(!t){ $('text').focus(); return; } check({ text: t }); });
$('text').addEventListener('keydown', e => { if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); $('f').requestSubmit(); } });

// ---- "Check the email I have open" (Gmail / Outlook on the web) ----
// Runs only when clicked, only on the current tab (Chrome's activeTab permission), and reads only the open email.
function readOpenEmail(){
  const unwrap = u => { try{ const x = new URL(u, location.href);
      if(/(^|\.)google\.com$/.test(x.hostname) && x.pathname === '/url') return x.searchParams.get('q') || u;
      if(/safelinks\.protection\.outlook\.com$/.test(x.hostname)) return x.searchParams.get('url') || u;
      return x.href; }catch(e){ return u; } };
  const linksOf = el => [...new Set([...(el ? el.querySelectorAll('a[href]') : [])].map(a => unwrap(a.getAttribute('href'))).filter(h => /^https?:/i.test(h)))].slice(0, 20);
  const h = location.hostname; let sender = '', subject = '', body = null;
  if(h === 'mail.google.com'){
    const msgs = [...document.querySelectorAll('div.adn')]; const open = msgs.filter(m => m.querySelector('div.a3s')).pop();
    const s = open && open.querySelector('span.gD'); if(s) sender = `${s.getAttribute('name') || s.innerText} <${s.getAttribute('email') || ''}>`;
    subject = (document.querySelector('h2.hP') || {}).innerText || ''; body = open && [...open.querySelectorAll('div.a3s')].pop();
  } else {
    body = [...document.querySelectorAll('div[aria-label="Message body"], div[role="document"]')].pop();
    const from = document.querySelector('[aria-label^="From"], [data-testid="SenderPersona"], span[title*="@"]');
    if(from) sender = from.getAttribute('title') || from.innerText || '';
    const subj = document.querySelector('[role="main"] [role="heading"][aria-level="2"], [data-testid="subjectLine"]'); subject = subj ? subj.innerText : '';
  }
  let text = body ? body.innerText.trim() : '';
  if(!text){ text = String(window.getSelection() || '').trim(); }
  const links = linksOf(body);
  if(links.length) text += '\n\nLinks in this email (where they really go):\n' + links.join('\n');
  return { sender: String(sender).trim().slice(0, 300), subject: String(subject).trim().slice(0, 500), text: text.slice(0, 50000) };
}

(async () => {
  await ready;
  try{ const r = await fetch(api + '/api/plan', { headers: key ? { 'X-Team-Key': key } : {} }); showQuota(await r.json()); }catch(e){}
  // Something sent from the right-click menu?
  const { pending } = await chrome.storage.session.get('pending');
  if(pending && Date.now() - pending.at < 60000){
    await chrome.storage.session.remove('pending'); $('text').value = pending.text; check({ text: pending.text }); return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = ''; try{ host = new URL(tab.url).hostname; }catch(e){}
  if(MAIL_HOSTS.test(host)){
    const b = $('grab'); b.hidden = false;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try{
        const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readOpenEmail });
        const m = res && res.result;
        if(!m || !m.text){ $('out').innerHTML = '<p class="note">Open the email first, then click again. Or select the email’s text, right-click, and choose <b>Check this text with ScamSpotter</b>.</p>'; return; }
        $('text').value = (m.sender ? 'From: ' + m.sender + '\n' : '') + (m.subject ? 'Subject: ' + m.subject + '\n\n' : '') + m.text;
        check(m);
      }catch(e){ $('out').innerHTML = '<p class="err">Couldn’t read this page. Select the email’s text, right-click, and choose Check this text with ScamSpotter.</p>'; }
      finally{ b.disabled = false; }
    });
  }
})();
