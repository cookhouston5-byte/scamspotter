const assert=require('assert');const {analyze}=require('../engine');
const c=(o,v)=>{const r=analyze(o);assert.strictEqual(r.verdict,v,JSON.stringify(o).slice(0,60)+' -> '+r.verdict+' '+r.score);console.log('PASS ',v.padEnd(10),r.score,'|',(o.subject||o.text).slice(0,50));};
c({sender:'Microsoft <account-security-noreply@accountprotection.microsoft.com>',subject:'New sign-in',text:'We noticed a new sign-in to your Microsoft account. If this was you, you can ignore this email. Review activity at https://account.microsoft.com/activity'},'Safe');
c({text:'USPS: Your package is on hold due to an incomplete address. Update here within 24 hours: https://usps-redelivery.top/track'},'Scam');
c({sender:'Jake Moss <jake.moss.84@gmail.com>',subject:'direct deposit',text:'Hi, I switched banks and need to update my direct deposit information before the next payroll. Can you make the change today?'},'Suspicious');
c({sender:'Sam <sam@acmeplumbing.com>',subject:'Invoice 2231',text:'Hi, attached is invoice number 2231 for last week\'s repair. Payment is due in 30 days, same as always. Thanks!'},'Safe');
// Brand names inside ordinary words/names must not count as impersonation
c({sender:'First National Bank <info@fnbalaska.com>',subject:'Statement',text:'Your monthly statement is ready in online banking.'},'Safe');
c({sender:'Support Groups <hello@helpers.org>',subject:'Tuesday',text:'Reminder: our meeting is Tuesday at 6. Please confirm if you can make it.'},'Safe');
c({sender:'Sam <sam@acme.com>',subject:'Site',text:'Have a look at https://my-startups.com and confirm you like the layout.'},'Safe');
c({sender:'Ana <ana@acme.com>',subject:'News',text:'Congratulations on the new baby! We had a fine time at lunch.'},'Safe');
c({sender:'Chase Smith <chase@smithlawak.com>',subject:'Monday',text:'See you Monday at 10 for the lease review.'},'Safe');
// ...while real impersonation still scores
c({sender:'Chase Bank Alerts <alerts@secure-mail-center.net>',subject:'Account locked',text:'Your account is locked. Verify your identity at https://chase-verify.top/login immediately.'},'Scam');
c({sender:'UPS Delivery <alerts@track-pkg.net>',subject:'Parcel on hold',text:'Your account is on hold. Pay the redelivery fee urgently at https://ups-redelivery.top/pay'},'Scam');
c({text:'Your Chase account is locked. Visit chase-alerts.com now to verify your identity.'},'Scam');
console.log('Extra tests passed');
