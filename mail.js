// Minimal email (RFC 822 / MIME) reader: headers, text and HTML bodies, links, attachment names.
// Good enough for a pasted "Show original" email or an uploaded .eml file. No dependencies.

function splitHead(raw){
  const s = String(raw).replace(/\r\n/g, '\n');
  const i = s.search(/\n\n/); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 2)];
}
function decodeWords(v){
  return String(v).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
    try{
      const buf = /b/i.test(enc) ? Buffer.from(txt, 'base64') : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
      return new TextDecoder(/utf-?8/i.test(cs) ? 'utf-8' : 'latin1').decode(buf);
    }catch{ return m; }
  }).replace(/\?=\s+=\?/g, '');
}
function parseHeaders(head){
  const out = []; let cur = null;
  for(const line of head.split('\n')){
    if(/^[ \t]/.test(line) && cur){ cur.value += ' ' + line.trim(); continue; }
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line); if(!m){ cur = null; continue; }
    cur = { name: m[1].toLowerCase(), value: m[2] }; out.push(cur);
  }
  for(const h of out) h.value = decodeWords(h.value);
  return out;
}
const param = (v, p) => { const m = new RegExp(p + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))', 'i').exec(v || ''); return m ? (m[1] ?? m[2]) : ''; };
function decodeBody(body, cte, charset){
  let buf;
  if(/base64/i.test(cte || '')) buf = Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  else if(/quoted-printable/i.test(cte || '')) buf = Buffer.from(body.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
  else return body;
  try{ return new TextDecoder(/utf-?8/i.test(charset || 'utf-8') ? 'utf-8' : 'latin1').decode(buf); }catch{ return buf.toString('utf8'); }
}

function walk(head, body, acc, depth = 0){
  const hs = parseHeaders(head); const get = n => (hs.find(h => h.name === n) || {}).value || '';
  const ct = get('content-type') || 'text/plain', cte = get('content-transfer-encoding'), disp = get('content-disposition');
  const fname = param(disp, 'filename') || param(ct, 'name');
  if(/^multipart\//i.test(ct) && depth < 8){
    const b = param(ct, 'boundary'); if(!b) return;
    const parts = body.split(new RegExp('\\n?--' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\n?'));
    for(const p of parts.slice(1)){ if(!p.trim()) continue; const [ph, pb] = splitHead(p); walk(ph, pb, acc, depth + 1); }
    return;
  }
  if(/^message\/rfc822/i.test(ct) && depth < 8){ const [ph, pb] = splitHead(body); walk(ph, pb, acc, depth + 1); return; }
  if(fname || /attachment/i.test(disp)){ acc.attachments.push({ name: decodeWords(fname || 'unnamed'), type: ct.split(';')[0].trim().toLowerCase() }); return; }
  const txt = decodeBody(body, cte, param(ct, 'charset'));
  if(/text\/html/i.test(ct)) acc.html.push(txt); else if(/text\//i.test(ct) || !ct) acc.text.push(txt);
}

const htmlToText = h => String(h).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

// Links in HTML: where they really go (href) and what they say (text).
function anchors(html){
  const out = []; const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m = re.exec(html)) && out.length < 200) out.push({ href: (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim(), text: htmlToText(m[4]).slice(0, 200) });
  return out;
}

// Does this look like a full email with headers (not just a pasted body)?
function looksLikeEmail(raw){
  const head = splitHead(raw)[0];
  const names = parseHeaders(head).map(h => h.name);
  return names.includes('from') && (names.includes('received') || names.includes('message-id') || names.includes('authentication-results') || names.includes('mime-version') || names.includes('date'));
}

function parseEmail(raw){
  const [head, body] = splitHead(raw); const hs = parseHeaders(head);
  const all = n => hs.filter(h => h.name === n).map(h => h.value); const get = n => all(n)[0] || '';
  const acc = { text:[], html:[], attachments:[] }; walk(head, body, acc);
  const html = acc.html.join('\n');
  const text = (acc.text.join('\n').trim() || htmlToText(html)).slice(0, 50000);
  return { from:get('from'), replyTo:get('reply-to'), returnPath:get('return-path'), to:get('to'), subject:get('subject'), date:get('date'), messageId:get('message-id'),
    authResults: all('authentication-results').concat(all('arc-authentication-results')), receivedSpf: all('received-spf'), received: all('received'),
    text, anchors: anchors(html), attachments: acc.attachments };
}

const addrOf = v => { const m = /<([^>]+)>/.exec(v || '') || /([^\s<>"]+@[^\s<>"]+)/.exec(v || ''); return m ? m[1].trim().toLowerCase() : ''; };
const domainOf = a => (a.split('@')[1] || '').replace(/[>\s]/g, '').toLowerCase();

module.exports = { parseEmail, looksLikeEmail, addrOf, domainOf, htmlToText };
