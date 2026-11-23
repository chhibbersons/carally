# CLAUDE.md — DealerReply (working name)

AI lead-response and follow-up platform for **pre-owned car dealers in India**.
Every enquiry gets a WhatsApp reply in under 60 seconds, is qualified by AI, and is followed up automatically until it becomes a showroom visit. A solo founder sells this as a managed service: setup fee plus a monthly retainer (₹15k / ₹35k / ₹60k tiers). The app must let **one person run 25+ dealer accounts**.

Read this file fully before writing code. If something here conflicts with a request, ask before deviating.

---

## 1. Product in one picture

```
Lead sources ──► Ingest ──► Lead record ──► AI WhatsApp reply (≤60 s)
(OLX, CarDekho,             (dedupe by     │  answers ONLY from stock + FAQ
 CarWale emails,             phone)        ▼
 Meta Lead Ads,                       Hot lead? ──yes──► Book visit + alert salesperson + reminder
 website form,                           │no
 direct WhatsApp)                        ▼
                               Follow-up sequence (day 1, 3, 7, 15) + new-stock alerts
                                         │ buyer replies → back to AI
                               After sale ► Google review request + referral offer
```

Monthly per-dealer report: leads by source, median first-reply time, visits booked, cars sold.

## 2. Users and tenancy

- **Tenant = one dealer** (may have several branches). Strict tenant isolation: every table that holds dealer data has `dealer_id`, and every query is scoped by it. Never write a query without the tenant filter.
- **Roles**
  - `operator`: the founder; sees all tenants, onboards dealers, edits prompts.
  - `dealer_admin`: dealer owner; sees their own dashboard, stock, leads and staff.
  - `salesperson`: gets hot-lead alerts on their personal WhatsApp, can take over chats and mark outcomes.
- Buyers never log in. They only use WhatsApp.

## 3. Scope

### MVP (build first, in this order)
1. Tenant + user auth, operator console to create a dealer.
2. WhatsApp Cloud API integration: webhook receive (with signature check), send text, media and templates, and track the 24-hour window per contact.
3. Stock (inventory): CRUD in the dashboard plus CSV / Google Sheet import. Fields are in §6.
4. Dealer knowledge base (FAQ): loan partners, exchange policy, documents, warranty, address, timings.
5. AI reply engine (Claude API with tool use), see §7.
6. Lead ingestion: direct WhatsApp, website form endpoint, Meta Lead Ads webhook, and parsing of portal lead emails (inbound email webhook).
7. Hot-lead detection, then a WhatsApp alert template to the assigned salesperson, plus a visit booking with reminders.
8. Follow-up scheduler (day 1/3/7/15), stopped by reply, opt-out, booking or sale.
9. Human takeover: a salesperson or operator can pause the AI on a conversation and reply from the inbox.
10. Dashboard: leads list, conversation view, stock, KPIs (first-reply time, visits, sales by source).

### Phase 2
- "Sell your car" bot (collects car details, photos and expected price from people selling).
- AI listing-description and social-caption generator from photos and specs.
- Post-sale review request plus referral flow.
- Monthly PDF/email report per dealer.
- Multi-branch routing, and round-robin salesperson assignment.

### Phase 3
- Missed-call → AI voice call-back (via an Indian telephony provider).
- Finance/insurance lead routing to partners.
- Billing: UPI AutoPay / e-mandate subscription status per dealer.

### Out of scope (do not build)
- Scraping listing portals. Use only leads the dealer legally receives.
- Payments from buyers.
- A buyer-facing app or website builder.

## 4. Tech stack (decided; ask before changing)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language for a solo dev |
| Web app + API | Next.js (App Router), route handlers for webhooks | Dashboard and API in one deploy |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent |
| DB | PostgreSQL | Relational, multi-tenant, JSONB for flexible bits |
| ORM / migrations | Drizzle ORM + drizzle-kit | Typed SQL, simple migrations |
| Background jobs | pg-boss (Postgres-backed queue) | No Redis to run; delayed jobs for follow-ups |
| Auth | Auth.js (email magic link) | Simple, no passwords |
| AI | Anthropic Claude API, `@anthropic-ai/sdk` | Tool use, multilingual |
| WhatsApp | Meta WhatsApp Cloud API, called directly (no BSP) | Lowest cost per message, full control |
| Inbound email | Postmark or SendGrid inbound parse webhook | Portal lead emails → JSON |
| File storage | S3-compatible (Cloudflare R2) | Car photos |
| Validation | Zod at every boundary (webhooks, forms, AI tool inputs) | |
| Tests | Vitest (unit), Playwright (a few e2e) | |
| Hosting | One VPS or Railway/Render in an India region + managed Postgres | Keep data in India where possible |
| Errors/logs | Sentry + structured JSON logs (pino) | |

AI models: `claude-haiku-5-5` for routine replies and classification (cheap and fast), and `claude-sonnet-5-5` for hard cases and for writing listing copy. Keep model names in config, not hard-coded.

## 5. Repository layout

```
/app                 Next.js routes
  /(dashboard)       dealer + operator UI
  /api/webhooks/whatsapp      GET verify, POST receive
  /api/webhooks/meta-leads
  /api/webhooks/inbound-email
  /api/leads                  public website-form endpoint (per-dealer key)
/src
  /db                schema.ts, migrations, tenant-scoped query helpers
  /whatsapp          client.ts (send), webhook.ts (parse/verify), templates.ts, window.ts
  /ai                engine.ts, prompts/, tools/ (one file per tool), guardrails.ts
  /leads             ingest.ts, dedupe.ts, parsers/ (olx.ts, cardekho.ts, carwale.ts)
  /jobs              queue.ts, followups.ts, reminders.ts, reports.ts
  /inventory         import.ts (CSV/Sheets), search.ts
  /lib               env.ts (zod-validated env), logger.ts, phone.ts (E.164 +91), i18n
/tests
CLAUDE.md
```

## 6. Data model (starting point)

- `dealers`: id, name, city, plan (`starter|growth|pro`), whatsapp_phone_number_id, waba_id, timezone (`Asia/Kolkata`), languages[], ai_enabled, created_at
- `branches`: id, dealer_id, name, address, maps_url, hours (jsonb)
- `users`: id, dealer_id (null for operator), role, name, email, whatsapp_number
- `vehicles`: id, dealer_id, branch_id, make, model, variant, year, km, fuel, transmission, owners, colour, price_inr, negotiable (bool), insurance_valid_till, registration_state, photos[] (urls), video_url, status (`available|reserved|sold`), notes, updated_at
- `kb_entries`: id, dealer_id, topic, question, answer
- `contacts`: id, dealer_id, phone_e164, name, language_pref, opted_out (bool), opted_out_at, last_inbound_at (drives the 24-hour window)
- `leads`: id, dealer_id, contact_id, source (`whatsapp|olx|cardekho|carwale|meta_ads|website|walkin|other`), vehicle_id (nullable), budget_min/max, timeline, has_exchange, needs_loan, score (0–100), stage (`new|engaged|hot|visit_booked|visited|won|lost`), assigned_user_id, first_response_at, created_at
- `conversations`: id, dealer_id, contact_id, ai_paused (bool), paused_by, paused_until
- `messages`: id, dealer_id, conversation_id, direction (`in|out`), sender (`buyer|ai|staff|system`), type, body, wa_message_id, template_name, status (`sent|delivered|read|failed`), cost_category (`service|utility|marketing`), created_at
- `visits`: id, dealer_id, lead_id, vehicle_id, branch_id, scheduled_at, status, reminder_sent_at
- `followup_runs`: id, dealer_id, lead_id, step, scheduled_for, status, stopped_reason
- `audit_log`: id, dealer_id, actor, action, payload, created_at

Index `(dealer_id, …)` on every table. Store all times in UTC and show them in IST.

## 7. AI reply engine (most important module)

**Pipeline per inbound buyer message:**
1. Load: dealer profile, branch info, KB entries, the last ~20 messages, lead fields, and whether `ai_paused` is set (if paused, store the message and notify staff only).
2. Call Claude with a system prompt (in `/src/ai/prompts/`) and these **tools**:
   - `search_inventory(filters)`: make/model/budget/fuel/year/body type; returns **only** `available` vehicles of this dealer.
   - `get_vehicle(vehicle_id)`
   - `send_vehicle_media(vehicle_id)`: photos/video.
   - `update_lead(fields)`: budget, timeline, exchange, loan, preferred model.
   - `book_visit(vehicle_id?, branch_id, datetime)`: only inside branch hours.
   - `handoff_to_human(reason)`
3. Run tools, then send the final text through `whatsapp/client.ts`.
4. Re-score the lead and set the stage. Crossing the hot threshold triggers an alert to the salesperson.

**Hard guardrails (enforce in code, not just the prompt):**
- Never state a price, km, year, owner count or availability that is not in the tool result. Validate figures in the draft reply against the DB before sending.
- Never offer discounts, promise loan approval, quote EMIs as final, or guarantee condition. For negotiation, offer a visit or callback, or hand off.
- Hand off immediately for: price negotiation beyond the listed price, complaints, legal or document disputes, abusive messages, explicit requests for a human, or anything the KB doesn't cover.
- Reply in the buyer's language: English, Hindi, Hinglish or Marathi (detect it and store it in `contacts.language_pref`). Keep replies short and WhatsApp-style, with at most one question per message.
- Be honest that it is the dealer's virtual assistant if asked; never claim to be a human.
- If the model or a tool errors, send a safe fallback ("Thanks! Our team will reply shortly.") and alert staff. A buyer must never be left without a reply.
- Log the prompt version, model, tokens and latency per reply.

**Hot-lead score (start simple, tune later):** specific vehicle asked +20, budget fits stock +15, timeline ≤ 2 weeks +20, asked about visit/test drive/location +25, loan or exchange details given +10, replied within 1 hour twice +10. Hot = 60 or more.

## 8. WhatsApp Cloud API rules (must follow)

- Verify the webhook `GET` with `hub.verify_token`; check `X-Hub-Signature-256` (HMAC-SHA256 with the app secret) on every `POST`, and reject if invalid.
- Webhooks can arrive twice or out of order. Dedupe on `wa_message_id` and make handlers idempotent. Return 200 fast and do the work in a pg-boss job.
- **24-hour customer-service window:** free-form messages are allowed only within 24 hours of the buyer's last inbound message. Outside it, send **approved templates** only. `window.ts` decides this, and every send goes through it.
- Template categories affect cost: follow-ups and new-stock alerts are **marketing**; visit reminders and booking confirmations are **utility**. Tag `messages.cost_category` so the per-dealer cost report and pass-through billing are accurate.
- Opt-out: honour "STOP", "unsubscribe", "band karo" and similar at once (set `opted_out`, cancel follow-ups, confirm once). Never message opted-out contacts.
- Protect the number's quality rating: at most 4 marketing follow-ups per lead, never between 21:00 and 09:00 IST, and stop on any negative reply.
- Message only people who enquired or messaged the dealer. No cold broadcasts to bought lists.
- Meta's per-message prices change (they did in Jan and Oct 2026). Keep rates in a config table, not code.

## 9. Lead ingestion

- Normalise phones to E.164 (+91). Dedupe a lead per (dealer, phone) within 30 days; a repeat enquiry updates the existing lead and records the new source.
- Portal emails: one parser per portal in `/src/leads/parsers/`, each with fixture-based tests using real sample emails (anonymised). If parsing fails, store the raw email and alert the operator. Never drop a lead.
- On a new non-WhatsApp lead: send the dealer's approved **welcome template** within 60 seconds (lead forms imply consent; keep the consent text and source on the lead).

## 10. Privacy and security (India DPDP Act)

- The dealer is the data owner; we process data on their behalf. Collect the minimum, and let the operator export or delete a contact's data.
- Never put buyer phone numbers or names in logs, URLs or error-tracker payloads. Mask them as `+91******1234`.
- Secrets only via env (`src/lib/env.ts` validates them with Zod on boot). Encrypt per-dealer WhatsApp tokens at rest.
- Rate-limit public endpoints and require a per-dealer API key on `/api/leads`.
- Retention: messages 24 months by default, configurable per dealer.

## 11. Coding conventions

- TypeScript strict, no `any`. Zod schemas sit next to the code that uses them.
- Every DB access goes through tenant-scoped helpers in `src/db` (`forDealer(dealerId).leads.find…`).
- Keep functions small and pure where possible; side effects (send, enqueue) sit at the edges.
- All times use the IST display helper; store UTC.
- Write user-facing copy (dashboard) in plain English. Keep WhatsApp copy and templates in `/src/whatsapp/templates.ts` with a version for each language.
- Every new module comes with unit tests. Changes to the AI engine need a test in `tests/ai/` with recorded fixtures (mock the Claude client; no live API calls in CI).
- Small commits with clear messages. Don't add dependencies without saying why.

## 12. Commands (set these up in package.json)

```
pnpm dev            # Next.js dev server
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations
pnpm db:seed        # demo dealer "Demo Motors, Andheri" with 20 cars + KB
pnpm worker         # pg-boss worker (follow-ups, reminders, reports)
pnpm test           # vitest
pnpm e2e            # playwright
pnpm lint && pnpm typecheck
```

For local WhatsApp testing, expose the webhook with a tunnel (e.g. cloudflared) and use Meta's test number.

## 13. Environment variables

See `.env.example`. Required: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `WA_SYSTEM_USER_TOKEN`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `R2_*`, `INBOUND_EMAIL_SECRET`, `SENTRY_DSN`.

## 14. Definition of done for the MVP

A demo dealer can:
1. Receive a WhatsApp enquiry about "Creta under 10 lakh", and get an accurate reply with photos from stock in under 60 seconds.
2. Have a portal email lead turned into a WhatsApp welcome template automatically.
3. See a buyer who asks for a Saturday test drive become `visit_booked`, with an alert to the salesperson and a reminder the day before.
4. See a buyer who goes quiet receive day-1/3/7 follow-ups that stop the moment they reply or send STOP.
5. Let a salesperson pause the AI and reply manually from the inbox.
6. Show the dashboard's median first-reply time, leads by source, visits and sales for the month.

## 15. How to work with me (the founder)

- I'm a solo, part-time founder. Prefer simple, boring, well-tested solutions over clever ones.
- Before a large change, give a short plan (files to touch, approach) and wait for my OK.
- After each feature: summarise what changed, how to test it manually, and any follow-up needed.
- If a requirement here looks wrong or risky (cost, WhatsApp policy, privacy), say so.
