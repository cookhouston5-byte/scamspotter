# ScamSpotter

An AI scam checker for small businesses, live at https://scamspotter.app. Staff paste a suspicious email or text and get a **verdict (Safe / Suspicious / Scam)**, a **0–100 risk score**, and **plain-English reasons**.

Founder: Houston Cook, Anchorage, Alaska.

## Stack
- Node 18+ / Express (`server.js`), with no database
- Static frontend in `public/` (plain HTML/CSS/JS, no build step)
- `engine.js`: rule-based heuristic engine that needs no API key
- `llm.js`: optional OpenAI second opinion, used only if `OPENAI_API_KEY` is set

```
server.js          Express app: static files + /api/analyze, /api/signup, /api/health
engine.js          Heuristic scam engine
llm.js             Optional LLM analysis
public/index.html  Landing page
public/check.html  Checker app (+ app.js, samples.js, styles.css)
data/signups.json  Trial signups (created on first signup, gitignored)
test/              Engine tests
shots.js           Playwright screenshot script
```

## Run locally
```bash
npm install
npm start                 # http://localhost:3000  (checker at /check)
npm test                  # engine tests (samples + legit emails)
OPENAI_API_KEY=sk-... npm start   # optional AI second opinion (OPENAI_MODEL defaults to gpt-4o-mini)
```

## How the engine works
It adds up weighted signals and caps the total at 100. A score of 55 or more is **Scam**, 25 to 54 is **Suspicious**, and under 25 is **Safe**.
- Content: urgency, secrecy ("I'm in a meeting"), gift cards, bank/payment-detail changes, wire/crypto/Zelle, invoice pressure, credential and sensitive-data requests (W-2, SSN, MFA codes), fake tech support and renewals, prizes, threats, risky attachments (.html/.zip/.iso/macros), generic greetings, QR lures
- Sender: display-name spoofing (says "Microsoft", but the address isn't), lookalike domains (`micros0ft`, `paypa1`, `brand-secure-login`), free webmail used for exec/vendor requests, abused TLDs
- Links: lookalike/brand-in-subdomain, raw IPs, punycode, shorteners, risky TLDs, link vs. sender domain mismatch
- Combinations: gift card + secrecy/urgency, bank change + invoice/deadline, deceptive link + pressure, phone number + "cancel/refund" (callback scams)

With an LLM, the final score is the average of the two scores, and it can never drop below a strong rule-based Scam score. The AI's reasons are shown separately.

## API
`POST /api/analyze` `{ text, sender?, subject? }` → `{ verdict, score, reasons[], advice, links[], engine, llm }`
`POST /api/signup` `{ name, email, business? }` stores the signup in `data/signups.json`

## Deploy
**Render (recommended, because the signup file needs a disk):** create a new Web Service from the repo. Set Build to `npm install` and Start to `npm start`. Add `OPENAI_API_KEY` if you want AI analysis. Attach a persistent disk at `/opt/render/project/src/data`, or swap signups to a database.

**Vercel:** `vercel.json` is included and `server.js` exports the app. Vercel's filesystem is read-only/ephemeral, so before relying on signups, move them to a hosted store (Vercel Postgres/KV, Supabase, Airtable, or a form service).

**Domain:** scamspotter.app is live (Render behind Cloudflare). `.app` requires HTTPS.

## Adding the email-forwarding inbox (later)
1. Pick an inbound email provider: Postmark Inbound, SendGrid Inbound Parse, Mailgun Routes, or Cloudflare Email Workers.
2. Set MX records for a subdomain such as `check.scamspotter.app`, and give each business an address like `acme@check.scamspotter.app`.
3. Add `POST /api/inbound` that verifies the provider's signature and pulls out the forwarded message. Parse the original sender, subject, and body from the forwarded block. Also read the raw headers when available: SPF/DKIM/DMARC results, Reply-To vs From mismatch, Return-Path. These add strong signals that pasted text can't provide.
4. Run `analyze()` (plus the LLM if enabled), then email the verdict back to the forwarder through the provider's send API. Only accept forwarders from the business's registered domain/allow-list.
5. Add accounts, billing (Stripe, $29/mo, 14-day trial), and a shared team history. Retain or delete message bodies according to a published privacy policy.

## Known limitations
- Heuristics are pattern-based and English-only. They can miss novel or well-written scams and can flag legit messages that discuss payments urgently. A result is guidance, not a guarantee.
- Pasted text has no email headers, so real SPF/DKIM spoof checks aren't possible yet.
- Links aren't fetched or checked against threat-intel feeds (e.g. Google Safe Browsing).
- No auth or accounts. Signups go to a local JSON file.
- Rate limiting is in-memory per IP (30 checks/min, 5 signups and 5 feedback messages per 10 min) and resets on restart.

## Feedback / suggested fixes
The homepage has a "Suggest a fix or leave feedback" form (`#feedback`). Submissions go to `POST /api/feedback`
(optional name/email, message 5–2000 chars, honeypot field, 5 per IP per 10 min, HTML-escaped) and are appended as
JSON Lines to `data/feedback.jsonl` (override with `FEEDBACK_FILE`, e.g. a Render persistent disk path). Each entry is
also logged to stdout as `[feedback] {...}`. Nothing is shown publicly. To read them, set `FEEDBACK_TOKEN` and call
`GET /api/feedback` with `Authorization: Bearer <token>` (the endpoint returns 404 when the token is unset).
Note: on Render's free plan the filesystem is ephemeral and is wiped on every deploy/restart, so rely on the logs or a disk.
