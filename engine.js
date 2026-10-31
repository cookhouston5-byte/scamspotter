// ScamSpotter rule-based heuristic engine. No network, no keys.
const FREE_MAIL = ['gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','icloud.com','proton.me','protonmail.com','gmx.com','mail.com','yandex.com'];
const BRANDS = ['paypal','microsoft','office365','apple','amazon','google','netflix','docusign','dropbox','wellsfargo','chase','bankofamerica','fedex','ups','usps','dhl','intuit','quickbooks','irs','coinbase','zelle','venmo','geeksquad','norton','mcafee','alaskausa','facebook','meta','linkedin'];
const SHORTENERS = ['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','rebrand.ly','cutt.ly','shorturl.at','rb.gy','t.ly'];
const BAD_TLDS = ['zip','mov','xyz','top','click','link','gq','tk','ml','cf','ga','work','support','rest','cam','icu','buzz','live','shop'];

function rx(list){ return new RegExp('\\b(' + list.join('|') + ')\\b','i'); }

const RULES = [
  { id:'urgency', cat:'Urgency pressure', w:12, re: rx(['urgent','urgently','immediately','asap','right away','within 24 hours','within 48 hours','today only','final notice','last warning','act now','time.sensitive','expires? today','before end of day','by end of day','eod','account will be (?:closed|suspended|locked|terminated)','suspended','deactivated']),
    why:'Creates time pressure ("urgent", "immediately", "final notice"). Scammers rush people so they skip verification.' },
  { id:'secrecy', cat:'Secrecy request', w:14, re: rx(["don'?t tell","do not tell","keep this (?:between us|confidential|quiet)","confidential matter","don'?t (?:call|phone) me","i'?m in a meeting","can'?t talk","in a conference","discreet"]),
    why:'Asks for secrecy or says the sender can\'t be reached by phone — classic CEO / boss impersonation.' },
  { id:'giftcard', cat:'Gift card request', w:30, re: /\b(gift ?cards?|itunes cards?|google play cards?|steam cards?|apple cards?|amazon cards?|scratch (?:off )?the (?:back|code)|send (?:me )?(?:the )?(?:card )?(?:codes?|pictures? of the (?:cards?|back)))\b/i,
    why:'Mentions buying gift cards or sending card codes. Legitimate businesses and vendors never ask to be paid in gift cards.' },
  { id:'paychange', cat:'Payment / bank change', w:30, re: /\b(new (?:bank(?:ing)?|account|wire|payment) (?:details|information|info|instructions)|updated? (?:our )?(?:bank(?:ing)?|payment|remittance|wire) (?:details|information|info|instructions)|chang(?:e|ed|ing) (?:of |our |in )?(?:bank(?:ing)?|account|payment|remittance)|(?:bank|account) (?:has )?changed|new remittance|routing (?:and|&) account|switch(?:ed)? banks?|direct deposit (?:change|update|information))\b/i,
    why:'Requests a change to bank, wire, or direct-deposit details. This is one of the most common business email compromise patterns — always confirm by phone using a number you already have.' },
  { id:'wire', cat:'Wire / unusual payment', w:14, re: /\b(wire transfer|wire the|send a wire|ach transfer|crypto(?:currency)?|bitcoin|btc|usdt|zelle|western union|moneygram|bitcoin atm|payment via (?:crypto|zelle))\b/i,
    why:'Asks for a wire, crypto, Zelle, or money-transfer payment — methods that are hard or impossible to reverse.' },
  { id:'invoice', cat:'Invoice / payment demand', w:10, re: /\b(overdue|past due|outstanding (?:invoice|balance|payment)|unpaid invoice|invoice (?:#|no\.?|number)|payment (?:is )?(?:due|required|overdue)|remit payment|final invoice|collections?)\b/i,
    why:'Pushes an invoice or overdue payment. Fake invoices are common — check that the vendor, amount, and PO match your records.' },
  { id:'credentials', cat:'Credential request', w:20, re: /\b(verify your (?:account|identity|password|login|information)|confirm your (?:password|login|credentials|account|identity)|(?:re-?)?enter your (?:password|credentials|login)|login to (?:avoid|restore|verify)|reset your password|update your (?:password|payment (?:method|information)|billing)|unusual (?:sign-?in|login|activity)|validate your)\b/i,
    why:'Asks you to log in, verify, or "confirm" your account or password — the core move of phishing.' },
  { id:'sensitive', cat:'Sensitive data request', w:18, re: /\b(social security|ssn|w-?2s?|tax forms?|employee (?:list|records|data)|bank (?:login|password)|pin (?:number|code)|one.time (?:code|passcode)|verification code|2fa code|mfa code|security code|card number|cvv)\b/i,
    why:'Asks for sensitive information (SSNs, W-2s, passwords, one-time codes, card numbers). Never send these by email or text.' },
  { id:'techsupport', cat:'Fake tech support', w:22, re: /\b(your (?:computer|pc|device|system) (?:is|has been) (?:infected|compromised|hacked|locked)|virus(?:es)? (?:detected|found)|call (?:our )?(?:support|technician|microsoft|apple|help desk)|toll.free|remote access|anydesk|teamviewer|ultraviewer|logmein|renewal (?:of|for) (?:your )?(?:subscription|norton|mcafee|geek squad)|auto.?renew(?:ed|al)|subscription (?:has been )?renewed|refund department)\b/i,
    why:'Looks like a fake tech-support or fake subscription-renewal scam (virus warnings, "call this number", remote-access tools).' },
  { id:'prize', cat:'Too good to be true', w:14, re: /\b(you(?:'ve| have)? won|winner|congratulations|claim your (?:prize|reward|refund)|lottery|free (?:gift|iphone)|inheritance|unclaimed (?:funds|refund)|grant approved)\b/i,
    why:'Promises a prize, refund, or windfall — a common hook to collect fees or personal info.' },
  { id:'threat', cat:'Threats / consequences', w:10, re: /\b(legal action|lawsuit|arrest|warrant|police|penalt(?:y|ies)|fine(?:d)?|late fees?|service (?:will be )?(?:interrupted|disconnected|shut off)|power (?:will be )?(?:shut off|disconnected)|disconnection)\b/i,
    why:'Threatens penalties, legal action, or service shut-off to scare you into acting quickly.' },
  { id:'attachment', cat:'Risky attachment', w:14, re: /\b[\w-]+\.(?:html?|exe|scr|js|vbs|iso|img|zip|rar|7z|docm|xlsm|lnk|svg)\b/i,
    why:'References an attachment type often used for malware or fake login pages (.html, .zip, .exe, .iso, macro documents).' },
  { id:'generic', cat:'Generic greeting', w:5, re: /\b(dear (?:customer|user|client|valued customer|sir|madam|sir\/madam|account holder)|hello (?:customer|user))\b/i,
    why:'Uses a generic greeting instead of your name — mass phishing rarely knows who you are.' },
  { id:'qr', cat:'QR code lure', w:12, re: /\b(scan (?:the|this) qr|qr code)\b/i,
    why:'Asks you to scan a QR code — "quishing" hides malicious links from email filters.' },
];

function extractUrls(text){
  const out = [];
  const re = /\b((?:https?:\/\/|www\.)[^\s<>"')\]]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|xyz|top|click|link|info|biz|us|ru|cn|zip|mov|support|live|shop|icu|online|site|me)(?:\/[^\s<>"')\]]*)?)/gi;
  let m; while((m = re.exec(text))){ if(!/@/.test(text[m.index-1]||'')) out.push(m[1].replace(/[.,;:!?]+$/,'')); }
  return [...new Set(out)];
}
function hostOf(u){ try{ return new URL(/^https?:/i.test(u)?u:'http://'+u).hostname.toLowerCase(); }catch{ return null; } }
function rootDomain(h){ const p=h.split('.'); return p.slice(-2).join('.'); }
function deLeet(s){ return s.replace(/0/g,'o').replace(/1/g,'l').replace(/3/g,'e').replace(/5/g,'s').replace(/rn/g,'m').replace(/vv/g,'w'); }
function lev(a,b){ const d=Array.from({length:a.length+1},(_,i)=>[i]); for(let j=1;j<=b.length;j++)d[0][j]=j; for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[a.length][b.length]; }

function parseSender(s){
  if(!s) return null;
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const name = m ? m[1].trim() : '';
  const email = (m ? m[2] : s).trim().toLowerCase();
  const dom = email.includes('@') ? email.split('@')[1] : null;
  return { name, email, domain: dom };
}

function analyze({ text = '', sender = '', subject = '' } = {}){
  const body = String(text||''); const subj = String(subject||'');
  const all = subj + '\n' + body;
  const reasons = []; let score = 0;
  const add = (cat, pts, why, sev) => { reasons.push({ category:cat, points:pts, detail:why, severity: sev || (pts>=20?'high':pts>=10?'medium':'low') }); score += pts; };

  for(const r of RULES){ const m = all.match(r.re); if(m) add(r.cat, r.w, r.why + ` (matched: "${m[0].trim()}")`); }

  // Sender analysis
  const s = parseSender(sender);
  if(s && s.domain){
    const d = s.domain, root = rootDomain(d), label = root.split('.')[0];
    const nameLc = (s.name||'').toLowerCase(); const nameNs = nameLc.replace(/[^a-z0-9]/g,'');
    for(const b of BRANDS){
      if(nameNs.includes(b) && !label.includes(b)) { add('Spoofed sender', 22, `Display name claims to be "${s.name}" but the email actually comes from ${d}.`); break; }
    }
    const dl = deLeet(label);
    for(const b of BRANDS){
      if(label!==b && (dl===b || (dl.includes(b) && !label.includes(b)) || (b.length>=5 && lev(label,b)<=1) || (label.includes(b) && label!==b && /[-]|secure|verify|login|support|billing|account/.test(label)))){ add('Lookalike sender domain', 25, `Sender domain "${d}" imitates ${b} but isn't the real one.`); break; }
    }
    if(FREE_MAIL.includes(d) && /\b(ceo|cfo|president|owner|director|accounts|billing|payroll|invoice|bank|microsoft|paypal|support)\b/i.test(nameLc + ' ' + all.slice(0,300)))
      add('Free email for business request', 10, `Sent from a free ${d} address while acting as an executive, vendor, or company. Real businesses usually use their own domain.`);
    if(BAD_TLDS.includes(d.split('.').pop())) add('Suspicious sender domain', 10, `Sender uses the .${d.split('.').pop()} domain ending, which is heavily abused by scammers.`);
  }

  // Link analysis
  const urls = extractUrls(body);
  const linkFlags = new Set();
  for(const u of urls){
    const h = hostOf(u); if(!h) continue;
    const root = rootDomain(h), label = root.split('.')[0], tld = h.split('.').pop();
    if(/^\d+\.\d+\.\d+\.\d+$/.test(h) && !linkFlags.has('ip')){ linkFlags.add('ip'); add('Raw IP link', 18, `Link points to a bare IP address (${h}) instead of a company website.`); }
    if(SHORTENERS.includes(h) && !linkFlags.has('short')){ linkFlags.add('short'); add('Shortened link', 8, `Uses a link shortener (${h}) that hides the real destination.`); }
    if(BAD_TLDS.includes(tld) && !linkFlags.has('tld')){ linkFlags.add('tld'); add('Risky link domain', 12, `Link goes to a .${tld} domain, an ending frequently used in phishing (${h}).`); }
    if(h.startsWith('xn--') || h.includes('.xn--')){ if(!linkFlags.has('puny')){ linkFlags.add('puny'); add('Disguised characters in link', 20, `Link uses look-alike international characters (${h}).`); } }
    const dl = deLeet(label);
    for(const b of BRANDS){
      const sub = h.slice(0, h.length-root.length);
      if(label===b) break;
      if(dl===b || (dl.includes(b) && !label.includes(b)) || (b.length>=5 && lev(label,b)<=1) || (label.includes(b) && /[-]|secure|verify|login|support|billing|account|update/.test(label)) || sub.includes(b+'.')){
        if(!linkFlags.has('look:'+h)){ linkFlags.add('look:'+h); add('Lookalike link', 25, `Link "${h}" pretends to be ${b} but goes to a different site (${root}).`); }
        break;
      }
    }
    if(s && s.domain && /\b(login|sign in|verify|confirm|update)\b/i.test(all) && rootDomain(s.domain)!==root && !linkFlags.has('mismatch') && !SHORTENERS.includes(h)){
      linkFlags.add('mismatch'); add('Link/sender mismatch', 8, `Asks you to log in or verify, but the link (${root}) doesn't match the sender's domain (${rootDomain(s.domain)}).`);
    }
  }
  // phone number + call to action (tech support/callback phishing)
  if(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(body) && /\b(call|contact|dial)\b/i.test(body) && /\b(cancel|refund|renew|charged|dispute|infected|support)\b/i.test(all))
    add('Callback scam pattern', 15, 'Gives a phone number to "cancel", "dispute", or get "support". Callback scams use these numbers to get remote access or payments. Look up the company\'s number yourself.');

  // Combos
  const has = id => reasons.some(r=>r.category===id);
  if(has('Gift card request') && (has('Urgency pressure')||has('Secrecy request'))) add('Combination: boss/gift-card scam', 15, 'Gift cards plus urgency or secrecy is the textbook "boss needs gift cards" scam.');
  if(has('Payment / bank change') && (has('Invoice / payment demand')||has('Urgency pressure'))) add('Combination: invoice redirection', 12, 'A bank-detail change paired with an invoice or deadline matches vendor-impersonation invoice fraud.');

  if((has('Lookalike link')||has('Raw IP link')||has('Disguised characters in link')) && (has('Urgency pressure')||has('Credential request')||has('Threats / consequences'))) add('Combination: deceptive link + pressure', 10, 'A disguised link combined with pressure to act is the standard phishing recipe.');
  if(body.trim().length < 15) reasons.push({ category:'Very little text', points:0, detail:'There isn\'t much to analyze. Paste the full message, including the sender and subject, for a better result.', severity:'info' });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 55 ? 'Scam' : score >= 25 ? 'Suspicious' : 'Safe';
  reasons.sort((a,b)=>b.points-a.points);
  const advice = verdict==='Scam' ? 'Do not click links, reply, pay, or send information. Verify with the person or company using contact details you already have (not ones in this message), then report or delete it.'
    : verdict==='Suspicious' ? 'Be careful. Before you act, confirm the request through a separate channel you trust, like a known phone number or by visiting the website directly.'
    : 'No strong scam signals found. Stay alert anyway: if it asks for money, logins, or a payment change, verify it independently.';
  return { verdict, score, reasons, advice, links: urls, engine:'heuristic' };
}
module.exports = { analyze };
