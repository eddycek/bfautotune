# PIDlab Infrastructure

Cloud infrastructure for PIDlab backend services. All services run on **Cloudflare** (Workers, R2, D1).

All resources are managed via **Terraform** with state in Cloudflare R2. CI/CD deploys automatically on merge to main.

## Services

| Service | Status | Description | Design Doc |
|---------|--------|-------------|------------|
| **Telemetry Worker** | Live (dev + prod) | Upload + admin stats + cron report | [docs/TELEMETRY_COLLECTION.md](../docs/TELEMETRY_COLLECTION.md) |
| **License Worker** | Planned | Offline-first license key validation | [docs/LICENSE_KEY_SYSTEM.md](../docs/LICENSE_KEY_SYSTEM.md) |
| **Payment Worker** | Planned | Stripe checkout + invoice generation | [docs/PAYMENT_AND_INVOICING.md](../docs/PAYMENT_AND_INVOICING.md) |

## Environments

| | Dev | Prod |
|---|---|---|
| Worker URL | `pidlab-telemetry-dev.eddycek-ve.workers.dev` | `pidlab-telemetry.eddycek-ve.workers.dev` |
| R2 bucket | `pidlab-telemetry-dev` | `pidlab-telemetry` |
| Cron trigger | Disabled | Daily 07:00 UTC |
| Custom domain | — | (configurable) |
| Terraform state | `pidlab-tfstate` → `dev/terraform.tfstate` | `pidlab-tfstate` → `prod/terraform.tfstate` |

Data is fully isolated — dev and prod never share a bucket.

## Directory Structure

```
infrastructure/
├── README.md
├── terraform/                     ← Infrastructure-as-code
│   ├── main.tf                    ← R2 bucket, Worker, cron, DNS
│   ├── backend-dev.hcl            ← Backend config: dev state key
│   ├── backend-prod.hcl           ← Backend config: prod state key
│   ├── dev.tfvars                 ← Dev variables (non-secret)
│   ├── prod.tfvars                ← Prod variables (non-secret)
│   ├── terraform.tfvars.example   ← Full template (local use)
│   ├── build-worker.sh            ← Build TS → JS bundle
│   └── .gitignore                 ← Excludes state, secrets, bundle
├── telemetry-worker/              ← CF Worker TypeScript source
│   ├── wrangler.toml              ← Local dev + manual deploy
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               ← Router + CORS + cron entry
│       ├── types.ts               ← Env bindings, bundle schema
│       ├── upload.ts              ← POST /v1/collect
│       ├── admin.ts               ← GET /admin/stats/*
│       ├── validation.ts          ← UUID, schema, rate-limit
│       └── cron.ts                ← Daily report → Resend email
├── license-worker/                ← (planned)
└── payment-worker/                ← (planned)

.github/workflows/
└── infrastructure.yml             ← CI/CD: build → plan (PR) → apply (main)

scripts/
├── telemetry-stats.sh             ← Quick admin stats
└── telemetry-report.sh            ← Full report with breakdowns
```

## CI/CD Pipeline

```
PR opened/updated (infrastructure/** changed)
  └─ build-worker → plan dev → plan prod     ← review in PR

Merge to main
  └─ build-worker → deploy dev → deploy prod  ← sequential, prod after dev
```

- **`build-worker`**: `esbuild` compiles TypeScript source into `worker-bundle.js`
- **`plan`** (PR only): `terraform plan` for both environments — review changes before merge
- **`deploy-dev`** (main push): `terraform apply` to dev
- **`deploy-prod`** (main push): `terraform apply` to prod (runs after dev succeeds)

GitHub environments `dev` and `prod` can have protection rules (e.g. required approval for prod).

### GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_PROVISIONING` | Terraform provider — Workers + R2 provisioning |
| `TERRAFORM_STATE_R2_ACCESS_KEY_ID` | Terraform S3 backend — R2 access key for tfstate |
| `TERRAFORM_STATE_R2_SECRET_ACCESS_KEY` | Terraform S3 backend — R2 secret key for tfstate |
| `TELEMETRY_ADMIN_KEY_DEV` | Admin API key for dev Worker |
| `TELEMETRY_ADMIN_KEY_PROD` | Admin API key for prod Worker |
| `RESEND_API_KEY` | Resend email delivery (both environments) |

## Bootstrap (One-Time Setup)

These R2 buckets were created manually (chicken-and-egg — Terraform can't manage its own state bucket):

```bash
# Already done:
npx wrangler r2 bucket create pidlab-tfstate        # Terraform state
npx wrangler r2 bucket create pidlab-telemetry-dev   # Dev telemetry data
npx wrangler r2 bucket create pidlab-telemetry       # Prod telemetry data
```

After bootstrap, everything is managed by Terraform + CI/CD. No more manual commands.

### R2 API Token for Terraform Backend

Created in **Cloudflare Dashboard → R2 → Manage R2 API Tokens**:
- Permissions: Object Read & Write
- Bucket: `pidlab-tfstate`
- Set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in GitHub secrets

### Cloudflare API Token for Terraform Provider

Created in **Cloudflare Dashboard → My Profile → API Tokens**:
- Template: Edit Cloudflare Workers
- Additional: R2 Storage Edit
- Set `CLOUDFLARE_API_TOKEN` in GitHub secrets

## Manual Operations

### Local Terraform (emergency / debugging)

```bash
cd infrastructure/terraform

# Dev
terraform init -backend-config=backend-dev.hcl
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars

# Prod
terraform init -reconfigure -backend-config=backend-prod.hcl
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

Requires `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (R2 credentials) and `TF_VAR_cloudflare_api_token`, `TF_VAR_admin_key` env vars.

### Local Worker Testing

```bash
cd infrastructure/telemetry-worker
npm install
npx wrangler dev
# Worker runs at http://localhost:8787
```

### Pointing App to Dev Worker

```bash
TELEMETRY_URL=https://pidlab-telemetry-dev.eddycek-ve.workers.dev/v1/collect npm run dev
```

## Telemetry Worker Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/collect` | None | Upload telemetry bundle (gzip, rate-limited 1/hr) |
| `GET` | `/admin/stats` | `X-Admin-Key` | Summary: installs, active 24h/7d/30d, modes |
| `GET` | `/admin/stats/versions` | `X-Admin-Key` | BF version distribution |
| `GET` | `/admin/stats/drones` | `X-Admin-Key` | Drone size + flight style distribution |
| `GET` | `/admin/stats/quality` | `X-Admin-Key` | Quality score histogram (5 buckets) |
| `GET` | `/health` | None | Health check |

### R2 Storage Layout

```
pidlab-telemetry[-dev]/
├── {installationId}/
│   ├── latest.json       ← Most recent bundle (overwritten each upload)
│   └── metadata.json     ← { firstSeen, lastSeen, uploadCount }
└── ...
```

## Stack

| Component | Service | Free Tier |
|-----------|---------|-----------|
| API endpoints | CF Workers | 100K req/day |
| Telemetry storage | CF R2 | 10 GB, 1M writes/month |
| Terraform state | CF R2 | (shared bucket) |
| License database | CF D1 (SQLite) | 5 GB, 5M reads/day |
| Email reports | Resend | 3K emails/month |
| Payments | Stripe | Pay-as-you-go |
| IaC | Terraform + Cloudflare provider | Free |
| CI/CD | GitHub Actions | 2,000 min/month |

**Estimated cost**: $0/month up to ~5,000 active users.

## Client-Side Integration

The Electron app's `TelemetryManager` (`src/main/telemetry/`) handles:
- Bundle assembly from local managers (profiles, tuning history, blackbox, snapshots)
- FC serial anonymization (SHA-256 salted with installation ID)
- gzip compression + `net.fetch` POST with retry (1s/2s/4s)
- Daily heartbeat on app start, post-session trigger, manual "Send Now"
- Default URL: `TELEMETRY.UPLOAD_URL` in `src/shared/constants.ts` (prod)
- **Override**: `TELEMETRY_URL` env var points app to dev Worker
