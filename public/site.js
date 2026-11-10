// Shared on every page: the slide-out Menu (Your plan, About, Customer comments, Help, Settings) and theme handling.
(function(){
const STRIPE_TRIAL = 'https://buy.stripe.com/7sY7sL3WAdh23e80D0asg04';
const CONTACT = 'hello@scamspotter.app';
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ v==null ? localStorage.removeItem(k) : localStorage.setItem(k,v); }catch(e){} }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sv = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  plan: sv('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  user: sv('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  chat: sv('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"/>'),
  help: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>')
};

// ---- theme ----
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme(){ const t = store.get('ss-theme') || 'light'; const dark = t === 'dark' || (t === 'auto' && mq && mq.matches);
  if(dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme; }
applyTheme(); if(mq && mq.addEventListener) mq.addEventListener('change', applyTheme);

// ---- team key + plan ----
const getKey = () => store.get('ss-team-key') || '';
const headers = (extra) => Object.assign({}, extra || {}, getKey() ? { 'X-Team-Key': getKey() } : {});
let lastPlan = null; const listeners = [];
async function refreshPlan(){
  try{ const r = await fetch('/api/plan', { headers: headers() }); const j = await r.json(); j.httpStatus = r.status; lastPlan = j; }
  catch(e){ lastPlan = { error:'offline' }; }
  renderPlan(); listeners.forEach(f => f(lastPlan)); return lastPlan;
}
// The checker reports quota after each check so the menu stays in sync without another request.
function updateQuota(plan){ if(!plan) return; if(plan.type === 'free'){ lastPlan = Object.assign({}, lastPlan || {}, { plan:'free', remaining: plan.remaining, limit: plan.limit }); renderPlan(); listeners.forEach(f => f(lastPlan)); } }
const fmtDate = s => s ? new Date(s * 1000).toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' }) : '';

function renderPlan(){
  const el = document.getElementById('dm-plan'); if(!el) return; const p = lastPlan;
  if(!p){ el.innerHTML = '<p>Loading your plan…</p>'; return; }
  if(p.error === 'offline'){ el.innerHTML = '<p>Couldn’t load your plan. Check your connection and try again.</p>'; return; }
  const keyForm = (label) => `<form class="keyform"><label for="dm-key">${label}</label><div class="keyrow"><input id="dm-key" placeholder="SS-cus_…" autocomplete="off" spellcheck="false" value="${esc(getKey())}"><button class="btn sm" type="submit">Save</button></div><p class="formmsg" role="status" style="font-size:13.5px;margin-top:6px"></p></form>`;
  let h = '';
  if(p.plan === 'team' && p.httpStatus !== 401){
    const st = p.status, map = { active:['Active','ok'], trialing:['Free trial','ok'], past_due:['Payment due','warn'], unpaid:['Unpaid','bad'], canceled:['Canceled','bad'], none:['No subscription','bad'], unknown:['Checking…','free'] };
    const [label, cls] = map[st] || [st, 'warn'];
    let detail = '';
    if(st === 'trialing' && p.trialEnd) detail = `Your free trial ends ${fmtDate(p.trialEnd)}. ${p.cancelAtPeriodEnd ? 'It won’t renew.' : 'Then $29/month.'}`;
    else if(st === 'active' && p.periodEnd) detail = p.cancelAtPeriodEnd ? `Canceled. Access ends ${fmtDate(p.periodEnd)}.` : `Renews ${fmtDate(p.periodEnd)}${p.amount ? ' at $' + (p.amount/100).toFixed(2) : ''}.`;
    else if(st === 'past_due') detail = 'Your last payment didn’t go through. Update your card to keep unlimited checks.';
    else if(st === 'canceled' || st === 'none') detail = 'This team no longer has an active plan. Start a new trial or contact us.';
    else if(!p.details) detail = 'Unlimited checks for your whole team.';
    h += `<div class="plan-card"><div class="pt"><b>Team plan</b><span class="status ${cls}">${esc(label)}</span></div><div class="pd">${esc(detail)}</div></div>`;
    h += `<a class="btn ghost block" href="/agent" style="margin-bottom:12px">Open the Agent: emails, deepfakes, calls</a>`;
    h += `<div class="stack">${p.canManage ? `<button class="btn block" type="button" data-portal>Manage subscription</button>` : ''}
      <p style="font-size:13px;margin:0">${p.canManage ? 'Update your card, download invoices, or cancel. Opens Stripe’s secure billing page.' : `To update your card or cancel, email <a href="mailto:${CONTACT}">${CONTACT}</a> and we’ll take care of it.`}</p></div>`;
    h += `<details style="margin-top:12px"><summary style="cursor:pointer;font-size:14px">Team access key</summary><div style="padding-top:8px">${keyForm('Saved on this device')}<button class="linkbtn" type="button" data-copy style="font-size:13.5px">Copy key to share with your team</button> · <button class="linkbtn" type="button" data-forget style="font-size:13.5px">Remove from this device</button></div></details>`;
  } else {
    const left = p.remaining ?? 0, lim = p.limit ?? 5;
    h += `<div class="plan-card"><div class="pt"><b>Free</b><span class="status free">${left} of ${lim} left today</span></div>
      <div class="meter" aria-hidden="true"><span style="width:${lim ? Math.round(left/lim*100) : 0}%"></span></div>
      <div class="pd">${lim} free checks a day on this connection. The team plan is unlimited for everyone at your business.</div></div>`;
    if(p.httpStatus === 401) h += `<p class="formmsg err" style="font-size:13.5px">${esc(p.error)}</p>`;
    h += `<div class="stack"><a class="btn block" href="${STRIPE_TRIAL}">Start 14-day free trial</a></div>`;
    h += `<div style="margin-top:16px">${keyForm('Already subscribed? Paste your team access key')}</div>`;
    h += `<p style="font-size:13.5px;margin-top:6px">Lost your key or need to manage billing? ${p.portalLogin ? `<a href="${esc(p.portalLogin)}">Sign in to billing</a> with your email, or e` : 'E'}mail <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`;
  }
  el.innerHTML = h;
  const f = el.querySelector('.keyform');
  if(f) f.addEventListener('submit', async e => { e.preventDefault(); const v = f.querySelector('input').value.trim(); const m = f.querySelector('.formmsg');
    if(!v){ store.set('ss-team-key', null); refreshPlan(); return; }
    if(!/^SS-cus_[A-Za-z0-9]+\.[A-Za-z0-9_-]{22}$/.test(v)){ m.className='formmsg err'; m.textContent = 'That doesn’t look like a ScamSpotter key. It starts with “SS-cus_”.'; return; }
    store.set('ss-team-key', v); m.className='formmsg'; m.textContent = 'Checking…';
    const p2 = await refreshPlan(); if(p2.httpStatus === 401){ store.set('ss-team-key', null); } });
  const portal = el.querySelector('[data-portal]');
  if(portal) portal.addEventListener('click', async () => { portal.disabled = true; portal.textContent = 'Opening billing…';
    try{ const r = await fetch('/api/billing-portal', { method:'POST', headers: headers() }); const j = await r.json(); if(j.url){ location.href = j.url; return; } throw new Error(j.error || 'Couldn’t open billing.'); }
    catch(err){ portal.disabled = false; portal.textContent = 'Manage subscription'; alert(friendly(err)); } });
  const copy = el.querySelector('[data-copy]');
  if(copy) copy.addEventListener('click', async () => { try{ await navigator.clipboard.writeText(getKey()); copy.textContent = 'Copied!'; }catch(e){ copy.textContent = 'Select the key above and copy it'; } });
  const forget = el.querySelector('[data-forget]');
  if(forget) forget.addEventListener('click', () => { store.set('ss-team-key', null); refreshPlan(); });
}

// ---- reviews ----
async function loadReviews(){
  const el = document.getElementById('dm-reviews'); if(!el) return;
  let list = []; try{ const r = await fetch('/reviews.json', { cache:'no-cache' }); if(r.ok) list = await r.json(); }catch(e){}
  el.innerHTML = list.length ? list.map(r => `<div class="review"><div class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div><p>“${esc(r.comment)}”</p><small>${esc(r.name)}${r.business ? ', ' + esc(r.business) : ''}</small></div>`).join('')
    : '<p>No reviews yet. ScamSpotter is new, so yours could be the first.</p>';
}

// ---- drawer ----
function build(){
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.close = '';
  const d = document.createElement('aside'); d.className = 'drawer'; d.id = 'menu'; d.setAttribute('aria-label','Menu'); d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.hidden = true;
  const theme = store.get('ss-theme') || 'light';
  d.innerHTML = `<div class="dh"><b>Menu</b><button class="x" type="button" data-close aria-label="Close menu">${I.x}</button></div>
<div class="db">
 <details class="dsec" id="m-plan" open><summary>${I.plan}Your plan &amp; subscription</summary><div class="in" id="dm-plan"><p>Loading your plan…</p></div></details>
 <details class="dsec" id="m-about"><summary>${I.user}About the owner</summary><div class="in">
  <div class="owner"><img src="/img/houston-avatar.jpg" alt="Houston Cook" width="64" height="64"><div><b>Houston Cook</b>Founder · Anchorage, Alaska</div></div>
  <p>I built ScamSpotter so the people who pay the bills at small businesses have a quick, plain-English way to check a suspicious message before they act.</p>
  <p>Questions or ideas? I read every message: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
  <a href="/about">Read the full story →</a></div></details>
 <details class="dsec" id="m-reviews"><summary>${I.chat}Customer comments</summary><div class="in"><div id="dm-reviews"><p>Loading…</p></div>
  <details style="margin-top:6px"><summary style="cursor:pointer;color:var(--accent);font-weight:600">Leave a review</summary>
  <form class="dform" id="rv" novalidate style="margin-top:10px">
   <div><span style="display:block;font-size:14px;color:var(--ink);font-weight:500;margin-bottom:4px">Your rating</span><div class="rate">${[5,4,3,2,1].map(n=>`<input type="radio" name="rating" id="rv${n}" value="${n}"><label for="rv${n}" title="${n} star${n>1?'s':''}">★<span class="sr">${n} stars</span></label>`).join('')}</div></div>
   <div><label for="rv-name">Name</label><input id="rv-name" name="name" maxlength="80" autocomplete="given-name"></div>
   <div><label for="rv-biz">Business (optional)</label><input id="rv-biz" name="business" maxlength="120" autocomplete="organization"></div>
   <div><label for="rv-c">Comment</label><textarea id="rv-c" name="comment" maxlength="1000"></textarea></div>
   <div class="hp" aria-hidden="true"><label for="rv-w">Leave this empty</label><input id="rv-w" name="website" tabindex="-1" autocomplete="off"></div>
   <button class="btn" type="submit">Send review</button><p class="formmsg" role="status" style="font-size:13.5px"></p>
   <p style="font-size:12.5px;margin:0">Reviews are read by Houston before they’re posted.</p></form></details></div></details>
 <details class="dsec" id="m-help"><summary>${I.help}Help</summary><div class="in">
  <p><b style="color:var(--ink)">How to check a message</b></p>
  <ol class="helplist"><li>Copy the text, email, or link, or take a screenshot of it.</li><li>Paste it into the <a href="/check">checker</a>, or tap <b>Upload a screenshot</b>.</li><li>Read the reasons, then follow “What to do”.</li></ol>
  <p style="margin-top:12px"><b style="color:var(--ink)">Deeper checks (Team plan)</b></p><p>The <a href="/agent">Agent</a> investigates full emails, photos and videos that might be deepfakes, and suspicious phone calls.</p>
  <p style="margin-top:12px"><b style="color:var(--ink)">Put ScamSpotter on your phone</b></p>
  <div id="install-box"></div>
  <ul class="helplist"><li><b>iPhone:</b> open scamspotter.app in Safari, tap Share, then “Add to Home Screen”.</li>
  <li><b>Android:</b> open it in Chrome, tap ⋮ then “Install app” or “Add to Home screen”. Then you can share a text or screenshot straight to ScamSpotter from the Share menu.</li></ul>
  <p style="margin-top:12px"><b style="color:var(--ink)">Already clicked, paid, or replied?</b></p>
  <ul class="helplist"><li>Money sent: call your bank right away and ask them to stop or recall it. Then report it at <a href="https://www.ic3.gov" rel="noopener">ic3.gov</a>.</li>
  <li>Entered a password: change it now, and turn on two-step login.</li><li>Report the scam at <a href="https://reportfraud.ftc.gov" rel="noopener">reportfraud.ftc.gov</a>.</li>
  <li>Forward phishing emails to <a href="mailto:reportphishing@apwg.org">reportphishing@apwg.org</a> and scam texts to 7726 (SPAM).</li></ul>
  <p style="margin-top:12px"><a href="/#faq">Read the FAQ</a> · <a href="/#feedback">Report a wrong result</a> · <a href="mailto:${CONTACT}">Email us</a></p></div></details>
 <details class="dsec" id="m-settings"><summary>${I.gear}Settings</summary><div class="in">
  <p style="color:var(--ink);font-weight:500;margin-bottom:6px">Appearance</p>
  <div class="seg" role="radiogroup" aria-label="Appearance">${['light','dark','auto'].map(t=>`<input type="radio" name="theme" id="th-${t}" value="${t}"${t===theme?' checked':''}><label for="th-${t}">${t==='auto'?'Match device':t[0].toUpperCase()+t.slice(1)}</label>`).join('')}</div>
  <p style="color:var(--ink);font-weight:500;margin:16px 0 6px">This device</p>
  <p>Your team key and theme are saved in this browser only. Messages you check are never saved.</p>
  <button class="btn ghost sm" type="button" data-reset>Clear saved settings</button></div></details>
</div>`;
  document.body.append(scrim, d);
  let lastFocus = null;
  const open = (sec) => { lastFocus = document.activeElement; d.hidden = false; requestAnimationFrame(() => document.body.classList.add('menu-open'));
    if(sec){ const s = d.querySelector('#m-' + sec); if(s){ s.open = true; setTimeout(() => s.scrollIntoView({ block:'start' }), 50); } }
    d.querySelector('.x').focus(); if(!lastPlan) refreshPlan(); loadReviews(); };
  const close = () => { document.body.classList.remove('menu-open'); setTimeout(() => { if(!document.body.classList.contains('menu-open')) d.hidden = true; }, 260); if(lastFocus) lastFocus.focus(); };
  document.addEventListener('click', e => { const t = e.target.closest('[data-menu]'); if(t){ e.preventDefault(); open(t.dataset.menu || null); } else if(e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('menu-open')) close();
    if(e.key === 'Tab' && document.body.classList.contains('menu-open')){ const f = [...d.querySelectorAll('a,button,input,textarea,summary')].filter(x => x.offsetParent); if(!f.length) return;
      if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); } else if(!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); } } });
  d.querySelectorAll('input[name=theme]').forEach(r => r.addEventListener('change', () => { store.set('ss-theme', r.value); applyTheme(); }));
  d.querySelector('[data-reset]').addEventListener('click', () => { if(!confirm('Remove your saved team key and theme from this browser?')) return; store.set('ss-team-key', null); store.set('ss-theme', null); applyTheme(); d.querySelector('#th-light').checked = true; refreshPlan(); });
  const rv = d.querySelector('#rv');
  rv.addEventListener('submit', async e => { e.preventDefault(); const m = rv.querySelector('.formmsg'), b = rv.querySelector('button[type=submit]');
    const data = { rating: (rv.querySelector('input[name=rating]:checked') || {}).value, name: rv.elements.name.value, business: rv.elements.business.value, comment: rv.elements.comment.value, website: rv.elements.website.value };
    b.disabled = true; m.className = 'formmsg'; m.textContent = 'Sending…';
    try{ const r = await fetch('/api/reviews', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(data) }); const j = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(j.error || 'Couldn’t send. Please try again.'); rv.reset(); m.className = 'formmsg ok'; m.textContent = 'Thank you! Houston will read it soon.'; }
    catch(err){ m.className = 'formmsg err'; m.textContent = friendly(err); } finally { b.disabled = false; } });
  const q = new URLSearchParams(location.search).get('menu'); if(q) open(q);
  renderInstall();
}

// ---- install as an app (home screen + Share menu) ----
let installEvt = null;
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; renderInstall(); });
function renderInstall(){
  const box = document.getElementById('install-box'); if(!box) return;
  if(standalone()){ box.innerHTML = '<p style="color:var(--safe)">ScamSpotter is installed on this device.</p>'; return; }
  box.innerHTML = installEvt ? '<button class="btn sm" type="button" id="install-btn" style="margin-bottom:8px">Install ScamSpotter</button>' : '';
  const b = document.getElementById('install-btn');
  if(b) b.onclick = async () => { installEvt.prompt(); try{ await installEvt.userChoice; }catch(e){} installEvt = null; renderInstall(); };
}
// One-time tip on phones, on the checker page only.
function installTip(){
  const app = document.querySelector('.app'); if(!app || standalone() || store.get('ss-tip-done')) return;
  if(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const w = document.createElement('div'); w.className = 'wrap'; w.style.paddingTop = '18px'; const t = document.createElement('div'); t.className = 'install-tip'; t.setAttribute('role','note'); w.appendChild(t);
  t.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 18.5h3"/></svg><div><b>Tip:</b> add ScamSpotter to your home screen${ios ? ' (Share → Add to Home Screen)' : ''} to check texts and screenshots in one tap. <button class="linkbtn" type="button" data-menu="help">How</button></div><button class="x2" type="button" aria-label="Dismiss tip">×</button>`;
  t.querySelector('.x2').onclick = () => { store.set('ss-tip-done','1'); w.remove(); };
  app.parentNode.insertBefore(w, app);
}
if('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
const boot = () => { build(); installTip(); };
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

// Plain-English error text: network failures and unreadable replies shouldn't show browser jargon like "Failed to fetch".
const friendly = err => (err instanceof TypeError || /fetch|network|load failed/i.test(err && err.message || '')) ? 'Couldn’t reach ScamSpotter. Check your internet connection and try again.'
  : err instanceof SyntaxError ? 'Something went wrong on our end. Please try again in a minute.' : (err && err.message) || 'Something went wrong. Please try again.';
window.SS = { friendly, getKey, headers, refreshPlan, updateQuota, onPlan: f => listeners.push(f), setKey: k => { store.set('ss-team-key', k); refreshPlan(); }, trialUrl: STRIPE_TRIAL };
})();
