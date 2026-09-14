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

## Required Edge Functions

| Function | Called by | Responsibility |
|---|---|---|
| `create-checkout` | Authenticated browser | Creates a Stripe Checkout Session for the named user, attaches `user_id` metadata/client reference and returns only the hosted Checkout URL. |
| `customer-portal` | Authenticated browser | Creates a Stripe Billing Portal session for the caller's Stripe customer. |
| `stripe-webhook` | Stripe only | Verifies the `Stripe-Signature`, receives lifecycle events and updates `subscriptions`. |

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
