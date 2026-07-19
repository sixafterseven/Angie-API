# Auto-deploy for Cloud Functions — one-time setup

The `deploy-functions.yml` workflow deploys `functions/` to Firebase whenever a
change under `functions/` merges to `main`. It needs a Google service-account
key stored as a GitHub secret. Do this once.

You run these steps yourself: they create a credential and paste it into GitHub,
which must be done by an account owner (not automatable safely).

## 1. Create a deploy service account

In a terminal authenticated as a project owner (`gcloud auth login` first if
needed):

```bash
PROJECT=micah-amari-angie-os
SA=github-functions-deployer

gcloud iam service-accounts create "$SA" \
  --project "$PROJECT" \
  --display-name "GitHub Actions functions deployer"

SA_EMAIL="$SA@$PROJECT.iam.gserviceaccount.com"

# Roles needed to deploy gen-2 functions (incl. the scheduled sweeper):
for ROLE in \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/cloudscheduler.admin \
  roles/eventarc.admin \
  roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor \
  roles/iam.serviceAccountUser \
  roles/firebase.admin \
  roles/serviceusage.serviceUsageConsumer ; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA_EMAIL" --role "$ROLE" --condition=None
done
```

## 2. Create a key file

```bash
gcloud iam service-accounts keys create key.json \
  --iam-account "$SA_EMAIL" --project "$PROJECT"
```

This writes `key.json`. Treat it as a secret — do **not** commit it.

## 3. Add it as a GitHub secret

- GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: paste the entire contents of `key.json`

Then delete the local copy:

```bash
rm key.json
```

## 4. Done

The next push to `main` that touches `functions/` will lint, build, test, and
deploy automatically. You can also trigger it manually from the **Actions** tab
(the workflow has `workflow_dispatch`).

To rotate or revoke access later, delete the key or the service account in the
Google Cloud Console (IAM & Admin → Service Accounts).
