# Supabase and Stripe backend handover

## Existing production backend

The static site is already connected to one production Supabase project. The public client configuration lives in `site/app.js`:

- Supabase URL: `https://nhmzuqhjhkdklezimmll.supabase.co`
- A Supabase **publishable** key: intentionally visible in browser code
- Functions called by the frontend: `create-checkout` and `customer-portal`
- Stripe webhook endpoint: `https://nhmzuqhjhkdklezimmll.supabase.co/functions/v1/stripe-webhook`

Do not replace this public configuration unless moving to a new Supabase project. If it changes, redeploy the frontend and repeat the full acceptance test.

## Required Supabase configuration

### Authentication

- Email/password provider enabled.
- Google OAuth provider enabled (Authentication → Providers → Google), using a Google Cloud OAuth Client ID/Secret with authorized redirect URI `https://nhmzuqhjhkdklezimmll.supabase.co/auth/v1/callback`. The frontend redirects the browser to `/auth/v1/authorize?provider=google&redirect_to=<site origin>` and reads the returned access token from the URL fragment on return — no additional frontend secret is needed.
- Confirm-email enabled.
- Final custom domain configured as the Site URL and allowed redirect URL.
- Password recovery redirects to the same final custom domain.
- Default Supabase sender addresses are acceptable for early testing. Before public launch, configure branded SMTP or an approved Auth Send Email Hook so customers receive a recognisable sender name and domain.

### Database model

The active application expects these public-schema tables:

| Table | Purpose | Browser permission |
|---|---|---|
| `profiles` | One learner profile per authenticated user | Own row only |
| `lessons` | Published learning content | Only while access entitlement is valid |
| `lesson_progress` | A learner's completed lessons | Own rows only |
| `subscriptions` | Stripe-derived access entitlement | Read own row only; no browser writes |

Every exposed table must have Row Level Security enabled. The browser must never be able to insert, update or delete `subscriptions`; only the trusted Stripe webhook can change access.

### Adaptive learning tables (AI feature, Stage 1)

| Table | Purpose | Browser permission |
|---|---|---|
| `learner_mastery` | One row per learner + skill; tracks mastery score, attempts | Own rows only (select/insert/update) |
| `learner_interactions` | Append-only log of quizzes, practice, help requests, hints | Own rows only (select/insert) |
| `ai_learning_sessions` | Append-only log of AI-tutor recommendations | Own rows only (select/insert) |

These are scoped by ownership only (not by paid entitlement) and follow the same
`auth.uid() = user_id` RLS pattern as the tables above. `lessons` also gained four nullable
columns (`skill_key`, `learning_objective`, `mastery_threshold`, `prerequisite_skill`) that
existing lessons leave `null`. See `supabase/README.md` for full detail and rollback SQL.

## Required Edge Functions

| Function | Called by | Responsibility |
|---|---|---|
| `create-checkout` | Authenticated browser | Creates a Stripe Checkout Session for the named user, attaches `user_id` metadata/client reference and returns only the hosted Checkout URL. |
| `customer-portal` | Authenticated browser | Creates a Stripe Billing Portal session for the caller's Stripe customer. |
| `stripe-webhook` | Stripe only | Verifies the `Stripe-Signature`, receives lifecycle events and updates `subscriptions`. |
| `ai-tutor` | Authenticated browser (Lia chat, Stage 3) | Derives the caller from their JWT, re-checks active entitlement server-side, builds a bounded context (current lesson, mastery, last 5 interactions) and calls the configured LLM provider. See below. |
| `quiz-generate` | Authenticated browser (mini quizzes, Stage 5) | Same JWT-only pattern as `ai-tutor`. Generates 2–3 multiple-choice questions strictly scoped to one lesson, strictly validates the model's JSON before returning it, and writes nothing — grading, scoring and the `learner_mastery` update happen entirely in the frontend (`site/quizEngine.js`), never from the model's own judgement. |
| `practice-mission` | Authenticated browser (AI practice missions, Stage 7) | Same JWT-only pattern. Generates one short, safe, learner-specific practice exercise for the lesson's skill. The difficulty (`easy`/`standard`/`challenge`) is computed by application code from the caller's own `learner_mastery.mastery_score` — never taken from the model's response, even if it includes one. Sends only lesson/objective/skill/difficulty/prior-attempt-count to the model, never the learner's name or email. Writes nothing; the frontend records the learner's chosen outcome (`Consegui`/`Preciso de ajuda`/`Não consegui`) directly. |

### `ai-tutor` (AI adaptive learning, Stage 3)

Source lives in this repo under `supabase/functions/ai-tutor/` (`logic.js` is pure and
unit-tested under Node in `tests/aiTutorLogic.test.js`; `index.ts` is the thin Deno adapter
that wires in the real Supabase client and `fetch`). Deployed with `verify_jwt: true`.

Unlike `create-checkout`/`customer-portal`, this function uses **only the caller's own JWT**
to build its Supabase client — never the service-role key. Every read (`subscriptions`,
`lessons`, `learner_mastery`, `learner_interactions`) and write (`learner_interactions`,
`ai_learning_sessions`) is therefore enforced by the same own-row RLS policies the rest of
the app already relies on, so this function carries no elevated database access at all.

It re-checks `hasActiveAccess` itself (mirroring the same `status`/`access_ends_at` rule as
`has_active_access()` in Postgres) rather than trusting the browser to have gated access —
the frontend only ever reaches Lia after the paywall, but the function does not assume that.

The LLM never decides mastery: it may return a `recommended_action`, which is logged to
`ai_learning_sessions` as an advisory record, but `learner_mastery.mastery_score` is only
ever moved by graded (`quiz`/`practice`) interactions per Stage 2's `masteryEngine.js` — Lia's
chat interaction types (`help_request`, `explanation_request`, `hint`) never touch it.

A malformed or non-JSON model response never breaks Lia: `parseTutorResponse` degrades to a
safe fallback shape (see `logic.js`) rather than propagating untrusted fields. A missing
`AI_API_KEY` returns a clear 503 rather than crashing.

**Repeated `explanation_request` escalation (Stage 4).** When a learner asks Lia for another
explanation of the *same lesson* more than once, the function counts prior
`explanation_request` interactions for that `lesson_id` itself (`countInteractionsByType`) and
picks the strategy — `alternative` (1st), `simpler` (2nd), `guided_exercise` (3rd+) — by that
count, never by asking the model to decide. The chosen strategy is folded into the system
prompt and echoed back to the frontend as `strategy`/`attempt_number` so the lesson view can
keep surfacing each new explanation inline without navigating away. Each request also bumps
`learner_mastery.help_requests` for the lesson's `skill_key` (Stage 4's help-request signal) —
`mastery_score` itself still only moves for graded `quiz`/`practice` interactions.

#### Required secrets

`quiz-generate` (Stage 5) and `practice-mission` (Stage 7) reuse these same three secrets and
the same fallback behaviour — neither needs its own configuration.

Set these only in **Supabase Edge Function Secrets** (in addition to the auto-injected
`SUPABASE_URL`/`SUPABASE_ANON_KEY`, which every Edge Function already receives):

| Secret name | Purpose |
|---|---|
| `AI_API_KEY` | API key for the chosen LLM provider. Without it, `ai-tutor` returns a friendly "temporarily unavailable" response instead of erroring. |
| `AI_MODEL` | Model identifier to request from that provider (e.g. an Anthropic, OpenAI, or Gemini model name). |
| `AI_PROVIDER` | Optional. One of `anthropic` (default), `openai`, `gemini`. Selects which HTTP API `providerRequest` builds a request for. |

These three were **not** set as part of deploying this function — it was deployed and is live,
but will answer with the safe fallback ("A Lia está temporariamente indisponível…") until a
project administrator sets them via the Supabase Dashboard (Edge Functions → Secrets) or the
Supabase CLI (`supabase secrets set`).

### Required secrets

Set these only in **Supabase Edge Function Secrets**:

| Secret name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Restricted Stripe key used by trusted payment functions |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret, beginning `whsec_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server key for webhook writes, if the deployed functions use it |

Never store any of these in GitHub, Cloudflare, the website JavaScript, browser storage or a `.env` file committed to the repository.

## Stripe configuration to retain

The Jobudo live account contains the existing offer:

| Item | Charge |
|---|---|
| Computador Fácil initial access | £5 once |
| Computador Fácil membership | £15.99/month after the four-day period |

Use a Stripe Billing subscription through Checkout and preserve the four-day schedule. The customer portal must remain enabled for payment-method updates and cancellations.

The webhook should subscribe to at least:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### Webhook rules

1. Verify the Stripe signature against `STRIPE_WEBHOOK_SECRET` before reading the event.
2. Make the update process idempotent because Stripe may retry an event.
3. Link Stripe data to the learner using trusted Checkout metadata/client reference, not a browser-supplied email alone.
4. Grant/revoke access from webhook events, not from the success-page redirect.
5. Log event IDs and errors without logging customer secrets or keys.

## Restricted Stripe key permissions

Create a separate restricted live key for this backend and allow only the resources/actions required by the deployed code—for example Checkout Session creation, Customer Portal session creation, and Subscription/Customer reads. Test the restricted key before revoking an old broader key.

## Tax and compliance note

Before accepting customers outside the UK or EU, confirm the business's VAT and digital-services obligations with a qualified adviser. Do not enable Stripe automatic tax collection until the appropriate registrations are active; enabling a setting alone does not create a tax registration.
