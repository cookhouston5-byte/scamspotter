// Regression tests for the rule-based checker: common business/consumer scams must be flagged,
// and ordinary messages must stay Safe.
const assert = require('assert'); const { analyze } = require('../engine');
const LEVEL = { Safe:0, Suspicious:1, Scam:2 };
let n = 0;
function check(label, input, min, max = min){
  const o = typeof input === 'string' ? { text: input } : input; const r = analyze(o);
  assert.ok(LEVEL[r.verdict] >= LEVEL[min] && LEVEL[r.verdict] <= LEVEL[max], `${label}: expected ${min}${max!==min?'..'+max:''}, got ${r.verdict} (${r.score}) [${r.reasons.map(x=>x.category).join(', ')}]`);
  n++; console.log('PASS ', r.verdict.padEnd(10), String(r.score).padStart(3), '|', label);
}
// Scams (13)
check('wire transfer today + new bank account', 'Please send the wire transfer today to the new bank account.', 'Scam');
check('process a wire transfer today to our new bank account', 'Hi, can you process a wire transfer today to our new bank account? Details below.', 'Scam');
check('IRS: pay today or face arrest', 'This is the IRS. You owe $4,280 in back taxes. Pay today or face arrest by local police.', 'Scam');
check('send me the verification code', 'Hey, I just sent a code to your phone by mistake. Can you send me the verification code?', 'Suspicious', 'Scam');
check('send me the W-2s for all employees', { sender:'"Dana Whitfield" <dana.ceo.office@gmail.com>', subject:'Request', text:'I need you to send me the W-2s for all employees as a PDF. Thanks.' }, 'Suspicious', 'Scam');
check('Hi mom, new number, send $500 on Zelle', 'Hi mom, this is my new number, I broke my phone. Can you send $500 on Zelle? I will explain later.', 'Scam');
check('overdue invoice, remit via ACH', 'Your invoice #8812 is overdue. Please remit via ACH to the account below.', 'Suspicious', 'Scam');
check("it's the CEO, need a quick favor", "Hi, it's the CEO. I need a quick favor, are you at your desk?", 'Suspicious', 'Scam');
check('pay with Bitcoin to avoid suspension', 'Your account has a problem. Pay with Bitcoin to avoid suspension.', 'Scam');
check('gift card request', "I'm in a meeting. Buy 4 Google Play gift cards for a client and send me the codes. Keep this between us.", 'Scam');
check('bank details update', { sender:'Accounts <billing@acme-supply-co.com>', subject:'Bank details update', text:'Please note we have updated our bank details. Use the new account information below for all future payments.' }, 'Suspicious', 'Scam');
check('fake package redelivery', 'USPS: Your package could not be delivered. Pay the $1.99 redelivery fee within 24 hours at https://usps-redeliver.info/pay', 'Scam');
check('Zelle payment immediately or account closed', 'Pay the balance immediately through Cash App or your account will be closed.', 'Scam');
// The exact short phrases from the review
for(const [t, min] of [['wire transfer today new bank account','Scam'],['process a wire transfer today to our new bank account','Scam'],['IRS notice: pay today or face arrest','Scam'],
  ['send me the verification code','Suspicious'],['send me the W-2s for all employees','Suspicious'],['Hi mom new number send $500 on Zelle','Scam'],['Invoice overdue, remit via ACH','Suspicious'],
  ["it's the CEO, need a quick favor",'Suspicious'],['pay with Bitcoin to avoid suspension','Scam'],['update our bank details','Suspicious']]) check('phrase: ' + t, t, min, 'Scam');
// Benign (5)
check('benign: lunch today', 'Want to grab lunch today at noon? The new place on 5th looks good.', 'Safe');
check('benign: agenda for today', { sender:'Pat <pat@harborview.com>', subject:'Agenda', text:'Can you send me the agenda for this afternoon’s staff meeting? Thanks!' }, 'Safe');
check('benign: payment received', { sender:'Sam <sam@acmeplumbing.com>', subject:'Thanks', text:'Thanks, we received your payment today for invoice 2231. Have a great week.' }, 'Safe');
check('benign: mom running late', 'Hi mom, running late today, I will be home by 7. Save me some dinner.', 'Safe');
check('benign: call me immediately after', 'The client call moved to 3pm. I will call you immediately after to recap.', 'Safe');
// The checker never says "No red flags" when it found something: Safe with points gets low-risk advice.
const low = analyze({ text:'The client call moved to 3pm. I will call you immediately after to recap.' });
assert.ok(low.verdict === 'Safe' && low.reasons.some(r => r.points > 0) && /^Low risk/.test(low.advice), 'Safe-with-warning advice says Low risk'); n++;
console.log(`Regression tests passed (${n})`);
