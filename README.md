# DealerReply

WhatsApp lead response and follow-up for pre-owned car dealers in India.
The product spec and working rules are in [CLAUDE.md](./CLAUDE.md).

## Run it locally

You need Node 22.12+, pnpm 10 and PostgreSQL 16.

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET at least
createdb dealerreply
pnpm db:migrate
SEED_OPERATOR_EMAIL=you@example.com pnpm db:seed
pnpm dev
```

Open http://localhost:3000 and log in with the operator email. Without
`AUTH_EMAIL_SERVER`, the login link is printed in the terminal running
`pnpm dev`; open it in the same browser.

The seed also creates the demo dealer "Demo Motors" (Andheri branch) with the
owner login `admin@demomotors.example`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm db:generate` | Create a migration after changing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Operator account + demo dealer (safe to re-run) |
| `pnpm worker` | Background worker. Processes incoming WhatsApp messages; keep it running next to `pnpm dev` |
| `pnpm test` | Unit tests. Database tests run only when `TEST_DATABASE_URL` is set |
| `pnpm e2e` | Playwright checks (needs the database) |
| `pnpm lint && pnpm typecheck` | Lint and type check |

## Where things are

- `app/` routes: `/login`, `/operator/dealers` (operator console), `/dashboard` (dealer users)
- `src/db/schema.ts` tables; `src/db/tenant.ts` `forDealer()` for all dealer data; `src/db/operator.ts` cross-dealer queries for the operator console
- `src/auth/` Auth.js setup and `requireOperator()` / `requireDealerUser()` guards
- `src/lib/` env validation, logger (masks phone numbers), phone and IST time helpers, `crypto.ts` (encrypts stored tokens)
- `src/whatsapp/` WhatsApp Cloud API: `webhook.ts` (signature check, parsing), `inbound.ts` (stores messages, STOP/START), `client.ts` (sending), `window.ts` (24-hour window, opt-out and quiet-hours rules every send goes through), `templates.ts` (approved templates and system copy)
- `src/jobs/` pg-boss queue and the worker
- `app/api/webhooks/whatsapp` Meta's webhook; `/operator/dealers/[id]` connects a dealer's number and sends a test message

To connect a real WhatsApp number, follow [docs/whatsapp-setup.md](./docs/whatsapp-setup.md).
