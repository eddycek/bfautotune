# Code Signing, Notarization & Auto-Updates

> **Status**: Active

## Overview

PIDlab uses electron-builder for packaging and electron-updater for automatic updates. Code signing is optional — when secrets are not configured, the CI pipeline builds unsigned releases (usable for testing).

## Auto-Updater

Built into the app via `electron-updater`. On startup (packaged builds only):
1. Waits 10 seconds after launch
2. Checks GitHub Releases for a newer version
3. Downloads in the background
4. Shows a green notification in the header: "v0.X.0 available — Restart"
5. User clicks Restart or the update installs on next normal quit

**Never interrupts an active tuning session.**

Implementation: `src/main/updater.ts`, `src/renderer/components/UpdateNotification/`

## Release Process

1. Bump version in `package.json`
2. Create and push a git tag: `git tag v0.2.0 && git push origin v0.2.0`
3. GitHub Actions builds for macOS + Windows + Linux in parallel
4. Artifacts published to GitHub Releases automatically
5. Running apps detect the new release via electron-updater

## macOS Code Signing & Notarization

### Prerequisites

1. **Apple Developer Program membership** — $99/year at [developer.apple.com](https://developer.apple.com/programs/)
2. Create a **Developer ID Application** certificate in the Apple Developer portal
3. Export the certificate as `.p12` file from Keychain Access

### Setup Steps

1. **Export certificate**:
   - Open Keychain Access → My Certificates
   - Find "Developer ID Application: Your Name"
   - Right-click → Export → save as `.p12` with a password

2. **Generate app-specific password**:
   - Go to [appleid.apple.com](https://appleid.apple.com) → Security → App-Specific Passwords
   - Generate one for "PIDlab CI"

3. **Find your Team ID**:
   - Go to [developer.apple.com/account](https://developer.apple.com/account) → Membership Details
   - Copy the 10-character Team ID

4. **Add GitHub secrets**:

   | Secret | Value |
   |--------|-------|
   | `APPLE_CERTIFICATE` | `base64 -i certificate.p12` output |
   | `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting .p12 |
   | `APPLE_ID` | Your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from step 2 |
   | `APPLE_TEAM_ID` | 10-character Team ID from step 3 |

5. **Push a tag** — the release workflow will automatically sign and notarize.

### Verification

After a signed release:
```bash
# Check code signing
codesign -dvv /Applications/PIDlab.app

# Check notarization
spctl --assess --type execute /Applications/PIDlab.app
```

## Windows Code Signing

### Prerequisites

1. **OV (Organization Validation) code signing certificate** — ~$70-200/year from DigiCert, Sectigo, etc.
   - EV certificates require hardware tokens and don't work in CI
   - OV certificates work as `.pfx` files in CI

### Setup Steps

1. Purchase and download a `.pfx` certificate file
2. Add GitHub secrets:

   | Secret | Value |
   |--------|-------|
   | `WIN_CSC_LINK` | `base64 -i certificate.pfx` output |
   | `WIN_CSC_KEY_PASSWORD` | Password for the .pfx file |

3. Push a tag — electron-builder auto-detects `CSC_LINK` and signs the NSIS installer.

## Linux

No code signing needed. AppImage is the standard distribution format. Auto-updater works by downloading a new AppImage and replacing the old one.

## Unsigned Builds (Current State)

When signing secrets are not configured:
- macOS: `CSC_IDENTITY_AUTO_DISCOVERY: false` — builds unsigned DMG/zip
- Windows: No `CSC_LINK` — builds unsigned NSIS installer
- Users see security warnings but can bypass them

**macOS**: Right-click → Open (or `xattr -cr /Applications/PIDlab.app`)
**Windows**: Click "More info" → "Run anyway" in SmartScreen dialog

## GitHub Secrets Summary

| Secret | Required for | Status |
|--------|-------------|--------|
| `APPLE_CERTIFICATE` | macOS signing | Not yet configured |
| `APPLE_CERTIFICATE_PASSWORD` | macOS signing | Not yet configured |
| `APPLE_ID` | macOS notarization | Not yet configured |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization | Not yet configured |
| `APPLE_TEAM_ID` | macOS notarization | Not yet configured |
| `WIN_CSC_LINK` | Windows signing | Not yet configured |
| `WIN_CSC_KEY_PASSWORD` | Windows signing | Not yet configured |

## Architecture

```
Tag push (v*)
  → GitHub Actions (release.yml)
  → Matrix: macOS / Windows / Linux
  → macOS: keychain import → electron-builder (sign + notarize) → DMG + ZIP
  → Windows: CSC_LINK → electron-builder (sign) → NSIS .exe
  → Linux: electron-builder → AppImage
  → All: publish to GitHub Releases
  → Running apps: electron-updater checks → downloads → "Restart" notification
```
