# Security policy

## Supported version

The website deployed from the latest `main` branch receives security fixes. Older commits and deployments are not maintained.

## Reporting a vulnerability

Please report vulnerabilities privately through the repository's [GitHub security advisory page](https://github.com/JOBUDO/computador-facil-gitHub-pages-package/security/advisories/new). If private reporting is unavailable, contact the repository maintainers through an existing private channel. Do not include exploit details, personal data, or credentials in a public issue.

Include the affected component, steps to reproduce, the potential impact, and a safe way to contact you. A maintainer will acknowledge the report, assess its impact, and coordinate a fix and disclosure with you. We do not promise a fixed response time.

## Client keys

The Supabase `sb_publishable_...` key in the browser is public by design. Access to learner data must be enforced by Supabase Auth and Row Level Security. Supabase secret/service-role keys, Stripe secret keys, and webhook signing secrets must never be committed or sent to the browser. If one of those secrets is exposed, revoke it in the relevant dashboard and investigate affected access.
