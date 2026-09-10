# Deployment guide: GitHub Pages + Cloudflare

This guide moves the existing static frontend from the current host to GitHub Pages. It does **not** move the Supabase or Stripe backends.

## Before starting

The deployer needs administrator access to:

- the destination GitHub repository;
- the Cloudflare zone for the chosen domain;
- the existing Supabase project; and
- the Jobudo Stripe account only for verification, not for key sharing.

Choose the final domain before deployment, for example `app.example.com`. This guide uses `app.example.com` as a placeholder; replace it everywhere with the real domain.

## 1. Create the GitHub repository

1. Create a **private** GitHub repository called `computador-facil`.
2. Do not add a GitHub README, `.gitignore` or licence at creation time.
3. Upload/push this package as the repository's `main` branch.
4. In GitHub, open **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source.
5. Open the **Actions** tab and allow the `Deploy static site to GitHub Pages` workflow to finish successfully.

The workflow publishes exactly the `dist/` folder. A new push to `main` deploys a new version.

## 2. Set the GitHub Pages custom domain

1. In **Settings → Pages**, enter the final domain under **Custom domain** and save it.
2. In the same screen, enable **Enforce HTTPS** once GitHub reports that the certificate is ready.
3. Create a file named `dist/CNAME` containing exactly the final domain, for example:

   ```text
   app.example.com
   ```

4. Commit and push that file. It prevents a future deployment from removing the custom-domain setting.

For a subdomain, GitHub Pages normally uses a CNAME record. An apex/root domain has different GitHub DNS requirements; use the official GitHub Pages custom-domain guidance before changing the record type.

## 3. Point Cloudflare DNS to GitHub Pages

For a **subdomain** such as `app.example.com`:

| Cloudflare DNS field | Value |
|---|---|
| Type | `CNAME` |
| Name | `app` |
| Target | `<GitHub Pages hostname shown in Settings → Pages>` |
| Proxy status | **DNS only** while GitHub validates the domain |
| TTL | Auto |

After GitHub shows the custom domain as configured and HTTPS works, Cloudflare proxying can be evaluated. Leave it as **DNS only** if any GitHub certificate or validation issue appears.

Set Cloudflare SSL/TLS encryption mode to **Full (strict)** only after the GitHub Pages certificate is active. Do not use Cloudflare's Flexible mode.

## 4. Update Supabase authentication URLs

This step is mandatory. Without it, confirmation and password-reset links may send customers to an old domain or `localhost`.

In **Supabase → Authentication → URL Configuration** set:

| Setting | Value |
|---|---|
| Site URL | `https://app.example.com` |
| Redirect URLs | `https://app.example.com` |

During the switchover, retain both the old site URL and the new GitHub Pages URL in the allowed Redirect URLs list where Supabase permits multiple URLs. After all tests pass, remove the old hosted-site URL.

The current frontend uses `location.origin` for signup and password-recovery redirects, so no source change is required for the final custom domain.

## 5. Update Supabase Edge Function CORS settings

The functions `create-checkout` and `customer-portal` must allow requests from the final domain. The Stripe webhook does not need browser CORS.

Confirm the function allow-list includes:

```text
https://app.example.com
```

If a temporary GitHub Pages address is used before the domain is live, allow that origin temporarily too. Do not use `*` for production authenticated payment endpoints.

## 6. End-to-end acceptance test

Run these checks from a normal browser session, preferably using a Stripe test configuration or a controlled low-risk test account. Do not create a live customer charge merely to test routing unless the business owner approves it.

- Visit `https://app.example.com` and confirm the login screen loads.
- Create a new account and confirm the email link returns to `https://app.example.com`, not `localhost`.
- Sign in and confirm the £5 paywall appears before lesson access.
- Start Checkout and confirm Stripe displays the correct offer.
- Confirm the Stripe webhook is delivered successfully.
- Confirm the learner is granted access only after the webhook updates the subscription record.
- Open the customer portal and confirm the user can manage/cancel the subscription.
- Sign out, sign back in and confirm only the same learner's progress appears.

## Rollback

If the new domain causes a problem, revert the last GitHub commit from the GitHub web interface, wait for the Pages workflow to complete, then restore the previous working domain entries in Supabase Auth and Edge Function CORS settings. Do not change Stripe products, prices or webhook events as part of a frontend rollback.

## References

- GitHub: [Deploying to GitHub Pages with Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- GitHub: [Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- Supabase: [Redirect URLs and auth email flow](https://supabase.com/docs/guides/auth/redirect-urls)
- Cloudflare: [SSL/TLS encryption modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
