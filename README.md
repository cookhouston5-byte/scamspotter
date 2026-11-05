# ScamSpotter

An AI scam checker for small businesses, live at https://scamspotter.app. Staff paste a suspicious text, email, or link, or upload a screenshot, and get a **verdict (Safe / Suspicious / Scam)**, a **0–100 risk score**, and **plain-English reasons**.

Founder: Houston Cook, Anchorage, Alaska.

## Stack
- Node 18+ / Express (`server.js`), with no database
- Static frontend in `public/` (plain HTML/CSS/JS, no build step)
- `engine.js`: rule-based heuristic engine that needs no API key
- `llm.js`: optional OpenAI second opinion, used only if `OPENAI_API_KEY` is set
- `access.js`: team access keys (signed with `ACCESS_KEY_SECRET`) and Stripe helpers; Stripe is the source of truth for subscriptions
- `emails.js`: welcome email and owner notifications through Resend

```
server.js            Express app: pages + /api/*
public/index.html    Landing page with a built-in quick checker (home.js)
public/check.html    Full checker (app.js, samples.js)
public/about.html    About the owner
public/welcome.html  Shown after Stripe checkout; displays the team key
public/site.js       Slide-out Menu on every page: Your plan, About, Customer comments, Help, Settings
public/reviews.json  Approved reviews shown in the Menu (edit by hand)
test/                Engine tests + API tests
```

## Run locally
```bash
npm install
npm start                 # http://localhost:3000  (checker at /check)
npm test                  # engine + API tests
```

## Screenshots and phone sharing
- **Upload a screenshot** (checker and homepage): the image is read *on the user's device* by Tesseract OCR, served from
  `public/vendor/tesseract/` (tesseract.js 5.1.1, Apache-2.0, English data). The image never leaves the device; only the
  recognized text is sent to `/api/analyze` with `source: "screenshot"`. Drag-and-drop and pasting an image also work.
- **Install + Share menu:** `manifest.webmanifest` + `sw.js` make the site installable ("Add to Home Screen"). On Android,
  ScamSpotter then appears in the Share menu; `sw.js` receives the shared text/image, holds it in the browser cache only until
  `/check?shared=1` reads it, then deletes it. (iPhone doesn't support web share targets; iPhone users upload the screenshot.)
- Text-message rules in `engine.js`: toll/delivery texts, card/account lock alerts, "reply YES to unlock", job/easy-money
  offers, and "wrong number" openers, in English and Spanish (matched without accents).

## Plans
- **Free:** `FREE_CHECKS_PER_DAY` (default 5) checks per IP per day, counted in memory.
- **Team ($29/mo):** unlimited checks. After checkout the customer gets a **team access key** (`SS-cus_….signature`) on `/welcome` and by email.
  Staff paste it under **Menu → Your plan**. The browser sends it as `X-Team-Key`. The server checks the signature and, if
  `STRIPE_SECRET_KEY` is set, that the Stripe subscription is active or trialing.
- **Menu → Your plan** shows the free checks left, or the team plan's status (trial end date, renewal date, payment problems), plus
  **Manage subscription**, which opens the Stripe customer portal (update card, invoices, cancel).

## Environment variables (set these on Render)
| Variable | What it's for |
|---|---|
| `ACCESS_KEY_SECRET` | **Required for team keys.** Any long random string. Never change it once customers have keys. |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…`). Shows plan details, opens the billing portal, shows the key on /welcome. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) of the webhook below. Sends the welcome email. |
| `STRIPE_PORTAL_LOGIN_URL` | Optional: Stripe's no-code customer portal login link, for customers who lost their key. |
| `RESEND_API_KEY` | Resend API key, for sending email from hello@scamspotter.app. |
| `OWNER_EMAIL` | Your own inbox. Gets a copy of every feedback message, review, new trial, and cancellation. |
| `DATA_DIR` | Folder for feedback/reviews files. Point it at a Render persistent disk, e.g. `/var/data`. |
| `FREE_CHECKS_PER_DAY` | Free daily limit (default 5). |
| `FEEDBACK_TOKEN` | Lets you read stored feedback at `GET /api/feedback` (add `?type=reviews` for reviews). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional AI second opinion. |

## Go-live checklist
1. **Stripe → Payment Link → After payment:** redirect to `https://scamspotter.app/welcome?session_id={CHECKOUT_SESSION_ID}`.
2. **Stripe → Developers → Webhooks:** add endpoint `https://scamspotter.app/api/stripe/webhook` with events
   `checkout.session.completed` and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. **Stripe → Settings → Billing → Customer portal:** turn it on (allow cancel, update payment method, invoices). Optionally copy the
   portal login link into `STRIPE_PORTAL_LOGIN_URL`.
4. **Resend:** create an account, add the domain `scamspotter.app`, add the DNS records it shows in Cloudflare, then set `RESEND_API_KEY`.
5. **Receive mail at hello@scamspotter.app:** Cloudflare → Email → Email Routing → forward `hello@` to your personal inbox.
6. **Render disk:** add a persistent disk (mount path `/var/data`) and set `DATA_DIR=/var/data`. With `OWNER_EMAIL` set,
   feedback and reviews are emailed to you too, so nothing is lost even without a disk.
7. **Publishing reviews:** reviews arrive by email and in `reviews.jsonl`. To show one, add it to `public/reviews.json`:
   `[{"name":"Pat","business":"Harbor Plumbing","rating":5,"comment":"…"}]`, then commit and deploy.

## How the engine works
It adds up weighted signals and caps the total at 100. A score of 55 or more is **Scam**, 25 to 54 is **Suspicious**, and under 25 is **Safe**.
- Content: urgency, secrecy ("I'm in a meeting"), gift cards, bank/payment-detail changes, wire/crypto/Zelle, invoice pressure, credential and sensitive-data requests (W-2, SSN, MFA codes), fake tech support and renewals, prizes, threats, risky attachments (.html/.zip/.iso/macros), generic greetings, QR lures
- Sender: display-name spoofing (says "Microsoft", but the address isn't), lookalike domains (`micros0ft`, `paypa1`, `brand-secure-login`), free webmail used for exec/vendor requests, abused TLDs
- Links: lookalike/brand-in-subdomain, raw IPs, punycode, shorteners, risky TLDs, link vs. sender domain mismatch
- Combinations: gift card + secrecy/urgency, bank change + invoice/deadline, deceptive link + pressure, phone number + "cancel/refund" (callback scams)

With an LLM, the final score is the average of the two scores, and it can never drop below a strong rule-based Scam score. The AI's reasons are shown separately.

## API
- `POST /api/analyze` `{ text, sender?, subject? }` (+ optional `X-Team-Key`) → `{ verdict, score, reasons[], advice, links[], engine, llm, plan }`; `402` when the free limit is used up
- `GET /api/plan` → free checks left, or team plan status; `POST /api/billing-portal` → `{ url }` of the Stripe portal
- `GET /api/welcome?session_id=` → team key for a completed checkout
- `POST /api/stripe/webhook` → welcome email + owner notifications
- `POST /api/feedback`, `POST /api/reviews` → stored in `DATA_DIR` and emailed to `OWNER_EMAIL`

## Deploy
**Render (recommended):** create a new Web Service from the repo. Set Build to `npm install` and Start to `npm start`. Add `OPENAI_API_KEY` if you want AI analysis. See the go-live checklist above.

**Vercel:** `vercel.json` is included and `server.js` exports the app. Vercel's filesystem is ephemeral, so rely on `OWNER_EMAIL` for feedback and reviews there.

**Domain:** scamspotter.app is live (Render behind Cloudflare). `.app` requires HTTPS.

## Adding the email-forwarding inbox (later)
1. Pick an inbound email provider: Postmark Inbound, SendGrid Inbound Parse, Mailgun Routes, or Cloudflare Email Workers.
2. Set MX records for a subdomain such as `check.scamspotter.app`, and give each business an address like `acme@check.scamspotter.app`.
3. Add `POST /api/inbound` that verifies the provider's signature and pulls out the forwarded message. Parse the original sender, subject, and body from the forwarded block. Also read the raw headers when available: SPF/DKIM/DMARC results, Reply-To vs From mismatch, Return-Path. These add strong signals that pasted text can't provide.
4. Run `analyze()` (plus the LLM if enabled), then email the verdict back to the forwarder through the provider's send API. Only accept forwarders from the business's registered domain/allow-list.
5. Add a shared team history. Retain or delete message bodies according to a published privacy policy.

## Known limitations
- Rules cover English and Spanish messages; results are explained in English. Screenshot text can contain small reading errors (e.g. l vs 1):
  common link misreads are repaired, a lookalike link that differs only by an OCR-confusable letter is flagged more gently, and the
  result lists the links it read so users can compare.
- Heuristics are pattern-based. They can miss novel or well-written scams and can flag legit messages that discuss payments urgently. A result is guidance, not a guarantee.
- Pasted text has no email headers, so real SPF/DKIM spoof checks aren't possible yet.
- Links aren't fetched or checked against threat-intel feeds (e.g. Google Safe Browsing).
- No individual accounts: a whole team shares one access key.
- Rate limits and the free daily count are in memory per IP and reset on restart.
