addEventListener('DOMContentLoaded', async function(){
  const b = document.getElementById('wk-body');
  const id = new URLSearchParams(location.search).get('session_id');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let j = { ok:false };
  if(id){ try{ j = await (await fetch('/api/welcome?session_id=' + encodeURIComponent(id))).json(); }catch(e){} }
  if(j.ok && j.key){
    SS.setKey(j.key);
    b.innerHTML = '<p class="muted mt0">' + (j.name ? 'Thanks, ' + esc(j.name.split(' ')[0]) + '! ' : '') + 'This browser is already set up. Share this key with your team (we also emailed it' + (j.email ? ' to ' + esc(j.email) : '') + '):</p><div class="keybox" id="kb">' + esc(j.key) + '</div><button class="btn sm" type="button" id="cp">Copy key</button>';
    document.getElementById('cp').onclick = async e => { try{ await navigator.clipboard.writeText(j.key); e.target.textContent = 'Copied!'; }catch(_){ e.target.textContent = 'Select the key and copy it'; } };
  } else b.innerHTML = '<p class="muted">We’re emailing your key now. It should arrive within a few minutes from <b>hello@scamspotter.app</b>. Check your spam folder if you don’t see it, or email us and we’ll send it right away.</p>';
});
