# Computador Fácil

Mobile-first Portuguese learning platform for beginner computer skills. It uses:

- **GitHub Pages** for the public website;
- **Cloudflare** for the custom domain, DNS and edge protection;
- **Supabase** for email/password accounts, learner data, database security and protected payment functions;
- **Stripe** for the £5 initial four-day access and £15.99/month membership.

## Start here

Give the deployer these documents in order:

1. [Deployment guide](DEPLOYMENT.md) — GitHub Pages, Cloudflare and post-deployment checks.
2. [Backend handover](BACKEND-HANDOVER.md) — Supabase and Stripe configuration that must be retained.
3. [Architecture](ARCHITECTURE.md) — system boundaries and data flow.
4. [Operations runbook](OPERATIONS.md) — routine checks, incident response and change procedure.

## Repository layout

```text
site/                         Editable static website source
  index.html                  Single-page app shell
  app.js                      Browser app and public Supabase configuration
  styles.css, auth.css        Styling
dist/                         Generated Pages artifact (ignored by Git)
.github/workflows/            GitHub Pages deployment workflow
```

## Frontend development

Use Node.js 24 and pnpm 11. Run `pnpm install`, then `pnpm check` to lint, type-check, test, and build the static site. Edit files in `site/`; `pnpm build` copies them into ignored `dist/` for deployment. The browser entry point is an ES module, with DOM rendering in `site/views.js` and state helpers in `site/model.js`.

## Important security boundary

GitHub Pages is intentionally only the website host. Never add Stripe secret/restricted keys, Stripe webhook signing secrets, or Supabase service-role keys to this repository, GitHub Pages settings, browser JavaScript or a `CNAME` file.

The visible `sb_publishable_...` key in `site/app.js` is designed to be public. It is not a Stripe secret and must be protected by the database Row Level Security policies described in the backend handover.

## Commercial offer

Customers create an email/password account, pay **£5** for four days of full access, then continue at **£15.99 per month** until they cancel. Stripe Checkout starts payments and Stripe’s signed webhooks update the access record. The browser redirect after payment is never treated as proof of payment.

## Ownership

The production Supabase project and Stripe account are already set up for Jobudo. The deployer should reuse them and should not create replacement products, functions, or webhooks unless a controlled migration is agreed first.
