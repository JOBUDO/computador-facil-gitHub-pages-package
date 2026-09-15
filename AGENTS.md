# Computador Fácil — Project Guidelines & Invariants

## 1. Project Purpose & Audience
- **Concept**: Mobile-first Portuguese learning platform for beginner computer skills.
- **Target Audience**: Portuguese speakers (seniors, adults, digital beginners) seeking step-by-step digital literacy without intimidating technical jargon.
- **Pedagogical Persona**: "Lia", a virtual tutor explaining steps calmly and simply (*"sem pressa, sem palavras complicadas"*).
- **Core Learning Tracks**: "Começar do zero", "Internet e email", "Trabalho e documentos", "Segurança online".

## 2. Commercial Model & Pricing Invariants
- **Trial Offer**: £5 one-time payment for 4 days of full access.
- **Subscription**: £15.99/month recurring membership following the 4-day trial period.
- **Access Verification**:
  - Content access is strictly gated by the `subscriptions` table in Supabase.
  - Active entitlement requires `subscription.status IN ('trialing', 'active')` AND `access_ends_at > now()`.
  - Browser redirects after Stripe Checkout (e.g. `?checkout=success`) must NEVER be treated as proof of payment. Access is granted exclusively when the signed Stripe webhook updates Postgres.

## 3. Strict Security Boundaries
- **Static Host Constraint**: GitHub Pages is solely a static host. NEVER place Stripe secret/restricted keys, Stripe webhook signing secrets (`whsec_...`), or Supabase service-role keys in this repository, GitHub Actions secrets meant for Pages, or browser code.
- **Publishable Key**: The Supabase key in `site/app.js` is public (`sb_publishable_...`). All data security must be enforced by PostgreSQL Row Level Security (RLS) policies.
- **XSS Prevention**: DOM rendering in `site/views.js` must strictly construct elements using `document.createElement`, `replaceChildren`, and text nodes. NEVER parse backend or user-supplied strings via `innerHTML` or raw HTML templating.

## 4. Technology Stack & Development Guidelines
- **Frontend Core**: Vanilla HTML5, CSS3, and ES Modules (`site/`). No heavyweight bundlers or SPA frameworks.
- **Styling**: Vanilla CSS (`site/styles.css`, `site/auth.css`) with DM Sans and Manrope typography, mobile-first design.
- **Backend & Auth**: Supabase Auth (Email/Password + Google OAuth), Supabase Edge Functions (`create-checkout`, `customer-portal`, `stripe-webhook`), Stripe Billing.
- **Build & Artifacts**:
  - Source code resides in `site/`.
  - `dist/` is the generated artifact copied by `scripts/build.mjs` and deployed by GitHub Actions. NEVER edit `dist/` directly.
- **Testing**:
  - `node --test` test suite located in `tests/`.
  - Run checks with `pnpm check` (linting, typechecking, tests, build).
