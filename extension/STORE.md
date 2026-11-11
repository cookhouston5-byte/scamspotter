# Chrome Web Store listing (copy and paste)

Upload `scamspotter-extension.zip` (the contents of this folder, without this file) at https://chrome.google.com/webstore/devconsole. There's a one-time $5 developer registration fee. Review usually takes a few days.

**Name:** ScamSpotter: Scam Checker

**Summary (132 characters max):**
Check a suspicious email, text, or link in one click. Plain-English answers for small business teams.

**Category:** Productivity (or Tools)

**Description:**
ScamSpotter checks suspicious messages before you click, pay, or reply.

• Right-click any selected text or link and choose "Check with ScamSpotter"
• In Gmail or Outlook on the web, click "Check the email I have open"
• Paste anything into the toolbar popup
• See Safe, Suspicious, or Scam, with the reasons in plain English and what to do next

It catches fake invoices and bank-detail changes, boss gift-card requests, Microsoft 365 and PayPal login phishing, disguised and look-alike links, unpaid toll and package texts, and fake tech support.

Free: 5 checks a day. Team plan ($29/month per business, 14 days free): unlimited checks for everyone, a Grok AI second opinion, and the ScamSpotter Agent for deeper email, deepfake, and phone-call checks. Add your team key in the extension's settings.

Privacy: the extension only reads what you choose to check, only when you click. It doesn't watch your browsing. Messages are checked and not saved. Built by a small business in Anchorage, Alaska.

**Privacy policy URL:** https://scamspotter.app/privacy
**Homepage URL:** https://scamspotter.app
**Support:** hello@scamspotter.app

## Privacy practices tab (answers for the form)

**Single purpose:** Check messages, emails, and links the user selects for signs of scams.

**Permission justifications:**
- `contextMenus`: adds "Check with ScamSpotter" to the right-click menu for selected text and links.
- `activeTab`: when the user clicks "Check the email I have open", reads the email open in the current Gmail or Outlook tab. Nothing is read without that click.
- `scripting`: runs the one-time reader for that open email (used together with activeTab).
- `storage`: saves the user's optional team key and passes a right-click selection to the popup.
- Host permission `https://scamspotter.app/*`: sends the text the user chose to check to the ScamSpotter service and gets the result.

**Remote code:** No. All code is in the package.

**Data usage:** Website content (only the text, email, or link the user chooses to check) is sent to scamspotter.app to provide the check. Not sold, not used for advertising or credit decisions, not transferred for unrelated purposes.

**Screenshots:** use 1280x800 images of the popup on a Gmail page and a result (see the screenshots in the repo's pull request, or take new ones once it's installed).
