# Operations runbook

## Routine checks

| Frequency | Check | Owner |
|---|---|---|
| Before each release | GitHub Pages workflow succeeds; sign-up and login work on production domain | Deployer |
| Weekly | Stripe webhook delivery results; failed event retries | Product owner / developer |
| Monthly | Supabase Auth activity, Edge Function errors, database security advisers | Developer |
| Quarterly | Stripe restricted-key permissions, access to GitHub/Cloudflare/Supabase/Stripe | Product owner |

## Safe release procedure

1. Create a branch from `main`.
2. Make and review the frontend change.
3. Test authentication, paywall and a completed-lesson flow.
4. Merge to `main`.
5. Confirm the GitHub Pages workflow succeeds.
6. Repeat the production smoke test from the deployment guide.

## Incident playbooks

### Customer paid but remains locked out

1. Find the Stripe Checkout session and corresponding webhook event.
2. Confirm the event was delivered successfully to `stripe-webhook`.
3. Check the Supabase function log for a signature, permission or database error.
4. Confirm the event metadata/client reference identifies the correct Supabase user.
5. Repair the entitlement record only through a controlled backend/admin process; do not ask the learner to repay.

### Confirmation email opens the wrong address

1. Check **Supabase Authentication → URL Configuration**.
2. Ensure the final HTTPS custom domain is both the Site URL and allowed redirect URL.
3. Check that the exact domain in the email link is not `localhost` or a retired host.
4. Send a fresh confirmation email and test again.

### Stripe key exposure suspected

1. Roll/revoke the exposed key immediately in Stripe.
2. Review Stripe request logs for unexpected activity.
3. Replace the Supabase secret with a new restricted key and validate the functions.
4. Search Git history and deployment logs, then remove exposed values from all reachable locations.

### Website is unavailable

1. Check the most recent GitHub Actions deployment.
2. Check GitHub Pages custom-domain status.
3. Check Cloudflare DNS record and SSL mode.
4. Bypass Cloudflare temporarily only if needed to isolate whether the issue is DNS/proxy or GitHub Pages.

## Offboarding a developer

Remove the person's access from GitHub, Cloudflare, Supabase and Stripe. Rotate any credential they could have accessed. Verify the webhook signing secret and Stripe restricted key have not been copied outside the secrets vault.
