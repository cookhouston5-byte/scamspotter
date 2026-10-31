const assert=require('assert');const {analyze}=require('../engine');
const c=(o,v)=>{const r=analyze(o);assert.strictEqual(r.verdict,v,JSON.stringify(o).slice(0,60)+' -> '+r.verdict+' '+r.score);console.log('PASS ',v.padEnd(10),r.score,'|',(o.subject||o.text).slice(0,50));};
c({sender:'Microsoft <account-security-noreply@accountprotection.microsoft.com>',subject:'New sign-in',text:'We noticed a new sign-in to your Microsoft account. If this was you, you can ignore this email. Review activity at https://account.microsoft.com/activity'},'Safe');
c({text:'USPS: Your package is on hold due to an incomplete address. Update here within 24 hours: https://usps-redelivery.top/track'},'Scam');
c({sender:'Jake Moss <jake.moss.84@gmail.com>',subject:'direct deposit',text:'Hi, I switched banks and need to update my direct deposit information before the next payroll. Can you make the change today?'},'Suspicious');
c({sender:'Sam <sam@acmeplumbing.com>',subject:'Invoice 2231',text:'Hi, attached is invoice number 2231 for last week\'s repair. Payment is due in 30 days, same as always. Thanks!'},'Safe');
console.log('Extra tests passed');
