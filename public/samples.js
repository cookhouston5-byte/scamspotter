// Example messages (fictional). Used by the checker UI and the test suite.
const SAMPLES = [
  { id:'invoice', label:'Example scam: Vendor bank change', expect:'Scam',
    sender:'"Northline Supply Accounts" <accounts@northline-supply-billing.com>', subject:'URGENT: Updated banking details for invoice #4471',
    text:`Hello,\n\nPlease note our bank account has changed due to an ongoing audit. Kindly use the new banking details below for invoice #4471 ($18,240.00), which is now past due.\n\nBank: First Coastal Bank\nRouting and account numbers attached in Remittance_Update.html\n\nPlease process the wire transfer today to avoid late fees. Do not use the old account on file.\n\nThank you,\nAccounts Receivable` },
  { id:'giftcard', label:'Example scam: Boss wants gift cards', expect:'Scam',
    sender:'"Dana Whitfield, CEO" <dana.whitfield.ceo@gmail.com>', subject:'Quick favor',
    text:`Are you available? I'm in a meeting and can't talk right now. I need you to pick up 5 Apple gift cards ($200 each) for a client appreciation thing. Keep this between us, it's a surprise. Scratch the back and send me pictures of the codes ASAP. I'll reimburse you today.` },
  { id:'phish', label:'Example scam: Microsoft 365 login phish', expect:'Scam',
    sender:'"Microsoft 365 Security" <no-reply@micros0ft-secure-login.xyz>', subject:'Unusual sign-in activity detected',
    text:`Dear user,\n\nWe detected unusual sign-in activity on your Office 365 account. Your mailbox will be suspended within 24 hours unless you verify your account.\n\nVerify now: https://login.microsoft.com.account-verify.top/auth\n\nMicrosoft Account Team` },
  { id:'techsupport', label:'Example scam: Fake subscription renewal', expect:'Scam',
    sender:'"Geek Squad Billing" <gs.renewals.dept@outlook.com>', subject:'Your subscription has been renewed - $499.99',
    text:`Dear Customer,\n\nThank you for your purchase. Your Geek Squad Total Protection subscription has been renewed and $499.99 will be charged to your account today.\n\nIf you did not authorize this charge, call our refund department immediately at +1 (808) 555-0143 within 24 hours to cancel. A technician will connect via AnyDesk to process your refund.` },
];
const LEGIT_SAMPLE = { id:'legit', label:'Example: Normal business email', expect:'Safe',
  sender:'"Maria Lopez" <maria@harborviewcatering.com>', subject:'Menu for Friday lunch',
  text:`Hi Houston,\n\nThanks for the call this morning. Attached is the menu we talked about for Friday's staff lunch for 25 people. We can do the salmon or the chicken option, whichever you prefer. Let me know by Wednesday and I'll confirm the headcount with the kitchen.\n\nThe invoice will come through the usual way after the event.\n\nBest,\nMaria` };
if (typeof module !== 'undefined') module.exports = { SAMPLES, LEGIT_SAMPLE };
