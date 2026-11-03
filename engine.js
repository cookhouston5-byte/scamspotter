// ScamSpotter rule-based heuristic engine. No network, no keys.
const FREE_MAIL = ['gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','icloud.com','proton.me','protonmail.com','gmx.com','mail.com','yandex.com'];
const BRANDS = ['paypal','microsoft','office365','apple','amazon','google','netflix','docusign','dropbox','wellsfargo','chase','bankofamerica','fedex','ups','usps','dhl','intuit','quickbooks','irs','coinbase','zelle','venmo','geeksquad','norton','mcafee','alaskausa','facebook','meta','linkedin'];
const SHORTENERS = ['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','rebrand.ly','cutt.ly','shorturl.at','rb.gy','t.ly'];
const BAD_TLDS = ['zip','mov','xyz','top','click','link','gq','tk','ml','cf','ga','work','support','rest','cam','icu','buzz','live','shop'];

function rx(list){ return new RegExp('\\b(' + list.join('|') + ')\\b','i'); }

const RULES = [
  { id:'urgency', cat:'Urgency pressure', w:12, re: rx(['urgent','urgently','immediately','asap','right away','within 24 hours','within 48 hours','today only','final notice','last warning','act now','time.sensitive','expires? today','before end of day','by end of day','eod','account (?:will be|is|has been) (?:closed|suspended|locked|terminated|on hold)','suspended','suspension','deactivated','right now','avoid (?:suspension|closure|cancellation|penalt(?:y|ies)|late fees|arrest|legal action)','or face','no later than today','before (?:it\'?s|its) too late']),
    why:'Creates time pressure ("urgent", "immediately", "final notice"). Scammers rush people so they skip verification.' },
  { id:'secrecy', cat:'Secrecy request', w:14, re: rx(["don'?t tell","do not tell","keep this (?:between us|confidential|quiet)","confidential matter","don'?t (?:call|phone) me","i'?m in a meeting","can'?t talk","in a conference","discreet"]),
    why:'Asks for secrecy or says the sender can\'t be reached by phone — classic CEO / boss impersonation.' },
  { id:'giftcard', cat:'Gift card request', w:30, re: /\b(gift ?cards?|itunes cards?|google play cards?|steam cards?|apple cards?|amazon cards?|scratch (?:off )?the (?:back|code)|send (?:me )?(?:the )?(?:card )?(?:codes?|pictures? of the (?:cards?|back)))\b/i,
    why:'Mentions buying gift cards or sending card codes. Legitimate businesses and vendors never ask to be paid in gift cards.' },
  { id:'paychange', cat:'Payment / bank change', w:30, re: /\b(new (?:bank(?:ing)?|account|wire|payment) (?:details|information|info|instructions)|updated? (?:our )?(?:bank(?:ing)?|payment|remittance|wire) (?:details|information|info|instructions)|chang(?:e|ed|ing) (?:of |our |in )?(?:bank(?:ing)?|account|payment|remittance)|(?:bank|account) (?:has )?changed|new remittance|routing (?:and|&) account|switch(?:ed)? banks?|direct deposit (?:change|update|information)|new (?:bank(?:ing)? )?account(?: number)?(?: details| info(?:rmation)?)?|(?:bank(?:ing)?|account|payment|wire) details (?:have |has )?(?:changed|updated)|updated? (?:the |our |my )?(?:bank(?:ing)?|account|payment) (?:details|information|info|on file)|update (?:the |our |my )?(?:bank(?:ing)? )?account (?:on file|details|number)|updated account|banking details|bank details)\b/i,
    why:'Requests a change to bank, wire, or direct-deposit details. This is one of the most common business email compromise patterns — always confirm by phone using a number you already have.' },
  { id:'wire', cat:'Wire / unusual payment', w:14, re: /\b(wire transfer|wire the|send a wire|ach transfer|crypto(?:currency)?|bitcoin|btc|usdt|zelle|western union|moneygram|bitcoin atm|payment via (?:crypto|zelle)|venmo|cash ?app|paypal\.me|ach (?:transfer|payment|deposit)|(?:via|by|through) ach|tether|ethereum|crypto (?:wallet|atm)|wallet address)\b/i,
    why:'Asks for a wire, ACH, crypto, Zelle/Venmo/Cash App, or money-transfer payment — methods that are hard or impossible to reverse.' },
  { id:'invoice', cat:'Invoice / payment demand', w:10, re: /\b(overdue|past due|outstanding (?:invoice|balance|payment)|unpaid invoice|invoice (?:#|no\.?|number)|payment (?:is )?(?:due|required|overdue)|remit payment|remit (?:the )?(?:balance|amount|funds|payment)?|final invoice|collections?)\b/i,
    why:'Pushes an invoice or overdue payment. Fake invoices are common — check that the vendor, amount, and PO match your records.' },
  { id:'credentials', cat:'Credential request', w:20, re: /\b(verify your (?:account|identity|password|login|information)|confirm your (?:password|login|credentials|account|identity)|(?:re-?)?enter your (?:password|credentials|login)|login to (?:avoid|restore|verify)|reset your password|update your (?:password|payment (?:method|information)|billing)|unusual (?:sign-?in|login|activity)|validate your)\b/i,
    why:'Asks you to log in, verify, or "confirm" your account or password — the core move of phishing.' },
  { id:'sensitive', cat:'Sensitive data request', w:18, re: /\b(social security|ssn|w-?2s?|tax forms?|employee (?:list|records|data)|bank (?:login|password)|pin (?:number|code)|one.time (?:code|passcode)|verification code|2fa code|mfa code|security code|card number|cvv)\b/i,
    why:'Asks for sensitive information (SSNs, W-2s, passwords, one-time codes, card numbers). Never send these by email or text.' },
  { id:'techsupport', cat:'Fake tech support', w:22, re: /\b(your (?:computer|pc|device|system) (?:is|has been) (?:infected|compromised|hacked|locked)|virus(?:es)? (?:detected|found)|call (?:our )?(?:support|technician|microsoft|apple|help desk)|toll.free|remote access|anydesk|teamviewer|ultraviewer|logmein|renewal (?:of|for) (?:your )?(?:subscription|norton|mcafee|geek squad)|auto.?renew(?:ed|al)|subscription (?:has been )?renewed|refund department)\b/i,
    why:'Looks like a fake tech-support or fake subscription-renewal scam (virus warnings, "call this number", remote-access tools).' },
  { id:'prize', cat:'Too good to be true', w:14, re: /\b(you(?:'ve| have)? won|winner|congratulations,? you|claim your (?:prize|reward|refund)|lottery|free (?:gift|iphone)|inheritance|unclaimed (?:funds|refund)|grant approved)\b/i,
    why:'Promises a prize, refund, or windfall — a common hook to collect fees or personal info.' },
  { id:'threat', cat:'Threats / consequences', w:10, re: /\b(legal action|lawsuit|arrest|warrant|police|penalt(?:y|ies)|fined|fines|late fees?|service (?:will be )?(?:interrupted|disconnected|shut off)|power (?:will be )?(?:shut off|disconnected)|disconnection)\b/i,
    why:'Threatens penalties, legal action, or service shut-off to scare you into acting quickly.' },
  { id:'today', cat:'Same-day deadline', w:6, re: /\b(today|tonight)\b/i,
    why:'Sets a same-day deadline. On its own this is often normal, but combined with a payment or data request it is a classic pressure tactic.' },
  { id:'govthreat', cat:'Government / IRS impersonation', w:22, re: /\b(irs|internal revenue service|social security administration|ssa|treasury department|department of (?:justice|revenue)|us marshals?|sheriff'?s (?:office|department)|federal (?:agent|agents|officer)|customs and border|homeland security|tax (?:debt|owed|due|lien)|back taxes)\b/i,
    why:'Claims to be the IRS, Social Security, police, or another agency. Government agencies don\'t demand payment or threaten arrest by text, email, or phone call.' },
  { id:'family', cat:'"New number" family impersonation', w:20, re: /\b((?:this is|it'?s) my new (?:phone |cell )?number|(?:i |i'?ve )?(?:got|have) a new (?:phone |cell )?number|new (?:phone |cell )?number,? (?:save|delete|it'?s me)|(?:lost|broke|dropped|cracked) my phone|(?:hi|hey|hello) (?:mom|mum|dad|grandma|grandpa|nana)[\s,.!]+(?:it'?s me|this is|new (?:phone |cell )?number|i lost|i broke)|(?:this is|it'?s) (?:your )?(?:son|daughter|grandson|granddaughter))\b/i,
    why:'Says they are a family member on a "new number". Scammers use this to ask for urgent money by Zelle, Venmo, or Cash App. Call the person on the number you already have.' },
  { id:'authority', cat:'Boss / executive impersonation', w:14, re: /\b((?:it'?s|this is|i'?m) (?:the |your )?(?:ceo|cfo|coo|boss|owner|president|director|managing partner)|(?:ceo|cfo|president|owner) here)\b/i,
    why:'The sender says they are the CEO, owner, or your boss. Executive impersonation usually leads to a gift card, wire, or payroll request.' },
  { id:'favor', cat:'Unusual favor request', w:14, re: /\b((?:quick|small|urgent|personal|discreet) (?:favou?r|task|errand)|need (?:a |you to do (?:me )?a )?favou?r|are you (?:available|free|around|at your desk|in the office)\b(?! (?:for|on|at|this|next|to|tomorrow|today)))/i,
    why:'Opens with a vague "quick favor" or "are you available?". This is how boss-impersonation scams start before asking for gift cards or a payment.' },
  { id:'coderequest', cat:'Verification code request', w:38, re: /\b((?:send|text|give|tell|read|forward|share|reply with)(?: it)? (?:me|us|back)? ?(?:the|that|your|this)? ?(?:\d[- ]digit )?(?:verification|security|login|confirmation|one[- ]time|otp|2fa|mfa|auth(?:entication)?|access|google voice|whatsapp|pin)? ?codes?|codes? (?:i|we) (?:just )?sent (?:you|to your (?:phone|email))|what(?:'s| is) the code)\b/i,
    why:'Asks you to send or read back a code. Verification codes let someone break into your accounts. Never share one, even with someone who says they\'re from the company.' },
  { id:'payroll', cat:'W-2 / payroll data request', w:30, re: /\b((?:send|email|forward|provide|need|get|share|pull|export)\b[^.\n]{0,40}\b(?:w-?2s?|w-?4s?|1099s?|payroll (?:records|data|report|reports|list|info(?:rmation)?|register|summary)|employee (?:list|records|data|ssns?|tax (?:forms|records|info))|staff (?:ssns?|tax forms))|(?:w-?2s?|payroll (?:records|data|report)) (?:for|of) (?:all|every|each) (?:employees?|staff))\b/i,
    why:'Asks for W-2s, payroll records, or employee tax data. This "W-2 scam" lets criminals file fake tax returns for your whole staff. Confirm in person or by a known phone number.' },
  { id:'delivery', cat:'Delivery fee / redelivery lure', w:15, re: /\b((?:re-?deliver(?:y)?|redelivery|package|parcel|shipment)\b[^.\n]{0,80}\b(?:fee|pay|update (?:your )?(?:address|details)|confirm (?:your )?(?:address|details)|reschedule)|(?:could not|couldn'?t|unable to) (?:be )?deliver(?:ed)?)\b/i,
    why:'Says a package can\'t be delivered and asks for a fee or address update. Carriers don\'t text links asking for redelivery fees.' },
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
// Brand names as people write them in display names ("Wells Fargo", "Geek Squad").
const BRAND_WORDS = { wellsfargo:'wells fargo', bankofamerica:'bank of america', geeksquad:'geek squad', office365:'office 365', alaskausa:'alaska usa' };
// Long brands match anywhere ("MicrosoftSupport"); short ones need a whole word, so "First National" doesn't match "irs" and "Support Groups" doesn't match "ups".
function nameHasBrand(nameLc, b){ if(b.length>=5 && nameLc.replace(/[^a-z0-9]/g,'').includes(b)) return true; const w=(BRAND_WORDS[b]||b).split(' ').join('[\\s-]*'); return new RegExp('(^|[^a-z0-9])'+w+'($|[^a-z0-9])').test(nameLc); }
// Brand embedded in a domain label. Short brands (ups, irs, meta…) must be a whole hyphen-separated part,
// so "my-startups.com" isn't treated as UPS but "ups-redelivery.com" is.
function labelHasBrand(label, b){ return b.length>=5 ? label.includes(b) : label.split('-').includes(b); }
// Brands that are also common first names: only count them in a display name with a company-style word nearby.
const NAME_LIKE = { chase: /\b(bank|banking|alerts?|online|card|cards|secur\w*|service|support|team|fraud|account|notifications?|jpmorgan)\b/ };
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
    const nameLc = (s.name||'').toLowerCase();
    for(const b of BRANDS){
      if(nameHasBrand(nameLc, b) && !label.includes(b) && (!NAME_LIKE[b] || NAME_LIKE[b].test(nameLc))) { add('Spoofed sender', 22, `Display name claims to be "${s.name}" but the email actually comes from ${d}.`); break; }
    }
    const dl = deLeet(label);
    for(const b of BRANDS){
      if(label!==b && (dl===b || (labelHasBrand(dl,b) && !label.includes(b)) || (b.length>=5 && lev(label,b)<=1) || (labelHasBrand(label,b) && label!==b && /[-]|secure|verify|login|support|billing|account/.test(label)))){ add('Lookalike sender domain', 25, `Sender domain "${d}" imitates ${b} but isn't the real one.`); break; }
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
      if(dl===b || (labelHasBrand(dl,b) && !label.includes(b)) || (b.length>=5 && lev(label,b)<=1) || (labelHasBrand(label,b) && /[-]|secure|verify|login|support|billing|account|update/.test(label)) || sub.split('.').some(part=>labelHasBrand(part,b))){
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

  // Same-day deadline only adds weight when it isn't already counted as urgency.
  if(has('Urgency pressure') && has('Same-day deadline')){ const i = reasons.findIndex(r=>r.category==='Same-day deadline'); score -= reasons[i].points; reasons.splice(i,1); }
  const urgent = has('Urgency pressure') || has('Same-day deadline') || has('Threats / consequences');
  const payment = has('Wire / unusual payment') || has('Gift card request');
  const dataAsk = has('Verification code request') || has('W-2 / payroll data request') || has('Credential request') || has('Sensitive data request');
  if(has('W-2 / payroll data request') && /\b(all|every|each|entire|whole)\b[^.\n]{0,20}\b(employees?|staff|team|payroll)\b/i.test(all)) add('Combination: bulk employee data', 12, 'Asks for tax or payroll data for every employee at once, the signature of the W-2 phishing scam.');
  if((has('Boss / executive impersonation') || has('Unusual favor request')) && (payment || dataAsk || has('Secrecy request'))) add('Combination: boss impersonation', 15, 'A "boss" asking for a favor plus a payment, gift cards, codes, or secrecy is classic executive impersonation.');
  if(has('Invoice / payment demand') && has('Wire / unusual payment')) add('Combination: invoice + bank transfer', 10, 'An overdue or pressing invoice that asks to be paid by wire or ACH matches fake-invoice fraud. Check the invoice and the bank details against your records.');
  // Strong combinations are always at least Scam level (55).
  const floor = (cat, why) => add(cat, Math.max(15, 55 - score), why);
  if(payment && urgent) floor('Combination: payment under pressure', 'A hard-to-reverse payment (wire, ACH, crypto, Zelle, gift cards) demanded on a deadline is the core of most payment scams.');
  else if(payment && dataAsk) floor('Combination: payment + data request', 'Asks for a hard-to-reverse payment and for codes or sensitive data in the same message.');
  else if(has('Government / IRS impersonation') && (urgent || payment || /\b(pay|payment|owe|owed|balance)\b/i.test(all))) floor('Combination: government threat', 'A government agency demanding payment or threatening arrest is an impersonation scam. The IRS contacts people by mail first and never demands immediate payment.');
  else if(has('"New number" family impersonation') && (payment || /\$\s?\d|\b(send|need|borrow|transfer)\b[^.\n]{0,30}\b(money|cash|\d+)\b/i.test(all))) floor('Combination: family emergency money request', 'A relative on a "new number" asking for money is a common impersonation scam. Call them on their old number first.');
  else if(has('Gift card request') && has('Verification code request')) floor('Combination: gift card codes', 'Asks for gift card codes, which is how gift card scams take the money.');

  if((has('Lookalike link')||has('Raw IP link')||has('Disguised characters in link')) && (has('Urgency pressure')||has('Credential request')||has('Threats / consequences'))) add('Combination: deceptive link + pressure', 10, 'A disguised link combined with pressure to act is the standard phishing recipe.');
  if(body.trim().length < 15) reasons.push({ category:'Very little text', points:0, detail:'There isn\'t much to analyze. Paste the full message, including the sender and subject, for a better result.', severity:'info' });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 55 ? 'Scam' : score >= 25 ? 'Suspicious' : 'Safe';
  reasons.sort((a,b)=>b.points-a.points);
  const advice = verdict==='Scam' ? 'Do not click links, reply, pay, or send information. Verify with the person or company using contact details you already have (not ones in this message), then report or delete it.'
    : verdict==='Suspicious' ? 'Be careful. Before you act, confirm the request through a separate channel you trust, like a known phone number or by visiting the website directly.'
    : reasons.some(r=>r.points>0) ? 'Low risk, but we noticed something worth a second look (see the reasons). If it asks for money, logins, codes, or a payment change, verify it independently.' : 'No strong scam signals found. Stay alert anyway: if it asks for money, logins, or a payment change, verify it independently.';
  return { verdict, score, reasons, advice, links: urls, engine:'heuristic' };
}
module.exports = { analyze };
