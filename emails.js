// Outgoing email via Resend (https://resend.com). Needs RESEND_API_KEY and a verified scamspotter.app domain.
// Without a key, emails are logged instead of sent, so nothing breaks in development.
const FROM = process.env.EMAIL_FROM || 'Houston at ScamSpotter <hello@scamspotter.app>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@scamspotter.app';
const SITE = process.env.SITE_URL || 'https://scamspotter.app';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function sendEmail({ to, subject, html, text, replyTo }){
  const key = process.env.RESEND_API_KEY;
  if(!key || !to){ console.log('[email:not-sent]', JSON.stringify({ to, subject })); return { sent:false }; }
  try{
    const r = await fetch('https://api.resend.com/emails', { method:'POST',
      headers:{ Authorization:'Bearer ' + key, 'Content-Type':'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text, reply_to: replyTo || REPLY_TO }) });
    if(!r.ok){ console.error('email failed', r.status, (await r.text()).slice(0, 300)); return { sent:false }; }
    return { sent:true };
  }catch(e){ console.error('email failed:', e.message); return { sent:false }; }
}

// Copies feedback, reviews and new subscribers to the owner's inbox, so nothing is lost if the server's disk is wiped.
function notifyOwner(subject, fields){
  const to = process.env.OWNER_EMAIL; if(!to) return Promise.resolve({ sent:false });
  const rows = Object.entries(fields).filter(([,v]) => v !== undefined && v !== '');
  const text = rows.map(([k,v]) => `${k}: ${v}`).join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#2b211a">${rows.map(([k,v]) =>
    `<p style="margin:0 0 10px"><b>${esc(k)}</b><br>${esc(v).replace(/\n/g,'<br>')}</p>`).join('')}</div>`;
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.Email || '') ? fields.Email : undefined;
  return sendEmail({ to, subject: '[ScamSpotter] ' + subject, html, text, replyTo });
}

function welcomeEmail({ name, key }){
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const subject = 'Welcome to ScamSpotter. Here’s your team access key';
  const keyBlock = key ? `
  <tr><td style="padding:0 32px 8px">
    <p style="margin:0 0 8px;font-size:15px;color:#2b211a"><b>Your team access key</b></p>
    <div style="font-family:Menlo,Consolas,monospace;font-size:14px;background:#fbf7f1;border:1px dashed #e4572e;border-radius:10px;padding:14px 16px;color:#2b211a;word-break:break-all">${esc(key)}</div>
    <p style="margin:8px 0 0;font-size:13px;color:#6f6257">Share it with anyone on your team. They paste it once under <b>Menu → Your plan</b> on scamspotter.app and get unlimited checks.</p>
  </td></tr>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5eee3;padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fffdf9;border:1px solid #ebe1d3;border-radius:16px;font-family:Arial,Helvetica,sans-serif;color:#2b211a">
  <tr><td style="padding:28px 32px 8px">
    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td style="width:30px;height:30px;border:2px solid #e4572e;border-radius:50%;text-align:center;vertical-align:middle;color:#e4572e;font-size:16px;line-height:26px">+</td>
      <td style="padding-left:10px;font-size:18px;font-weight:bold">ScamSpotter</td></tr></table>
  </td></tr>
  <tr><td style="padding:12px 32px 0">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-family:Georgia,serif;font-weight:normal">Welcome aboard, ${esc(first)}.</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Thanks for starting your 14-day free trial. From today, everyone on your team has a quick way to check a suspicious email or text <i>before</i> anyone clicks, pays, or replies.</p>
  </td></tr>${keyBlock}
  <tr><td style="padding:16px 32px 0">
    <p style="margin:0 0 8px;font-size:15px"><b>Three ways to get the most out of it</b></p>
    <ol style="margin:0 0 6px;padding-left:20px;font-size:15px;line-height:1.6">
      <li>Bookmark <a href="${SITE}/check" style="color:#e4572e">scamspotter.app/check</a> on every work computer and phone.</li>
      <li>Make one rule for the team: <b>any request to change bank details, pay by gift card, or log in from a link gets checked first.</b></li>
      <li>For anything involving money, still call the person or company on a number you already have.</li>
    </ol>
  </td></tr>
  <tr><td style="padding:18px 32px 0" align="left">
    <a href="${SITE}/check" style="display:inline-block;background:#e4572e;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">Check a message now</a>
  </td></tr>
  <tr><td style="padding:22px 32px 0">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">You won’t be charged until your trial ends, and you can see or cancel your plan anytime under <b>Menu → Your plan → Manage subscription</b>.</p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.6">If anything’s confusing, or a result looks wrong, just reply to this email. It comes straight to me.</p>
  </td></tr>
  <tr><td style="padding:16px 32px 28px">
    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td><img src="${SITE}/img/houston-avatar.jpg" width="48" height="48" alt="" style="border-radius:50%;display:block"></td>
      <td style="padding-left:12px;font-size:14px;line-height:1.4">Houston Cook<br><span style="color:#6f6257">Founder, ScamSpotter · Anchorage, Alaska</span></td></tr></table>
  </td></tr>
</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#9a8c7f;margin:14px 0 0">ScamSpotter · Anchorage, Alaska · <a href="${SITE}/privacy" style="color:#9a8c7f">Privacy</a></p>
</td></tr></table></body></html>`;
  const text = `Welcome aboard, ${first}.

Thanks for starting your 14-day free trial. From today, everyone on your team has a quick way to check a suspicious email or text before anyone clicks, pays, or replies.
${key ? `\nYour team access key:\n${key}\nShare it with your team. Paste it once under Menu > Your plan on scamspotter.app for unlimited checks.\n` : ''}
Three ways to get the most out of it:
1. Bookmark ${SITE}/check on every work computer and phone.
2. Make one rule: any request to change bank details, pay by gift card, or log in from a link gets checked first.
3. For anything involving money, still call the person or company on a number you already have.

You won't be charged until your trial ends. See or cancel your plan anytime under Menu > Your plan > Manage subscription.

If anything's confusing, just reply to this email. It comes straight to me.

Houston Cook
Founder, ScamSpotter, Anchorage, Alaska`;
  return { subject, html, text };
}

module.exports = { sendEmail, notifyOwner, welcomeEmail };
