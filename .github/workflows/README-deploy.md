# Auto-deploy for Cloud Functions — one-time setup

The `deploy-functions.yml` workflow deploys `functions/` to Firebase whenever a
change under `functions/` merges to `main`. It authenticates to Google **keylessly**
via Workload Identity Federation (WIF) — no service-account key file, which the
org policy `constraints/iam.disableServiceAccountKeyCreation` blocks anyway.

You run these steps yourself (they require project-owner access). The service
account `github-functions-deployer` already exists with the needed deploy roles;
these steps just let the GitHub repo impersonate it via short-lived OIDC tokens.

## Values used below

```
PROJECT=micah-amari-angie-os
PROJECT_NUM=243784491046
POOL=github-pool
PROVIDER=github-provider
REPO=sixafterseven/Angie-API
SA_EMAIL=github-functions-deployer@micah-amari-angie-os.iam.gserviceaccount.com
```

## 1. Enable the required APIs (safe to re-run)

```bash
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project micah-amari-angie-os
```

## 2. Create the Workload Identity Pool

```bash
gcloud iam workload-identity-pools create github-pool \
  --project=micah-amari-angie-os --location=global \
  --display-name="GitHub Actions pool"
```

## 3. Create the GitHub OIDC provider

The attribute condition restricts token exchange to this GitHub org, so no other
repo can use the pool.

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=micah-amari-angie-os --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='sixafterseven'"
```

## 4. Let the repo impersonate the deploy service account

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-functions-deployer@micah-amari-angie-os.iam.gserviceaccount.com \
  --project=micah-amari-angie-os \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/243784491046/locations/global/workloadIdentityPools/github-pool/attribute.repository/sixafterseven/Angie-API"
```

## 5. Done

No GitHub secret is needed — the provider resource name and service-account
email are baked into `deploy-functions.yml`. The next push to `main` that
touches `functions/` will lint, build, test, and deploy automatically. You can
also trigger it manually from the **Actions** tab (`workflow_dispatch`).

## Rotating / revoking

- Revoke the repo's access: remove the `roles/iam.workloadIdentityUser` binding
  from step 4, or delete the pool (`gcloud iam workload-identity-pools delete
  github-pool --location=global`).
- The deploy service account's roles are managed in Google Cloud Console →
  IAM & Admin → Service Accounts.
