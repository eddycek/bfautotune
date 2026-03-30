# Environment Variables & Secret Rotation

## Telemetry Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEMETRY_BUCKET` | Yes | — | R2 bucket binding |
| `ADMIN_KEY` | Yes | — | Admin API authentication key |
| `RESEND_API_KEY` | No | — | Resend email delivery (cron reports, diagnostic notifications) |
| `REPORT_EMAIL` | No | — | Recipient for diagnostic report notifications |
| `REPORT_FROM_EMAIL` | No | — | Sender address for email delivery |
| `DIAGNOSTIC_RATE_LIMIT_MAX` | No | `5` | Max diagnostic reports per window |
| `DIAGNOSTIC_RATE_LIMIT_WINDOW_MIN` | No | `60` | Rate limit window in minutes |
| `TELEMETRY_RATE_LIMIT_WINDOW_MIN` | No | `60` | Telemetry upload rate limit window in minutes |
| `BBL_MAX_SIZE_BYTES` | No | `52428800` (50 MB) | Max BBL file upload size |

## License Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LICENSE_DB` | Yes | — | D1 database binding |
| `ADMIN_KEY` | Yes | — | Admin API authentication key |
| `ED25519_PRIVATE_KEY` | Yes | — | License signing private key |
| `ED25519_PUBLIC_KEY` | Yes | — | License verification public key |
| `RESEND_API_KEY` | No | — | Resend email delivery (beta program emails) |
| `RESEND_FROM_EMAIL` | No | — | Sender address for beta program emails |

## Rotate Secrets

1. Generate new value (`openssl rand -hex 32` for admin keys, CF dashboard for API tokens)
2. Update GitHub secret: `gh secret set SECRET_NAME --body "new-value"`
3. Update `.env.local` locally
4. Update 1Password vault
5. Push any infra change to trigger CI/CD redeploy
