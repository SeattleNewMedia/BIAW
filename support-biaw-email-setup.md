# BIAW production email — `support@biaw.com`

Documentation of the **Microsoft Graph OAuth2** setup completed for the member form API to send mail as **support@biaw.com** (BIAW tenant).

For general OAuth concepts and personal @outlook.com testing, see [office365-oauth-setup.md](./office365-oauth-setup.md).

---

## Summary

| Item | Value |
|------|--------|
| **Mailbox** | `support@biaw.com` |
| **Tenant** | `biaw.com` |
| **Send method** | Microsoft Graph `POST /v1.0/me/sendMail` |
| **Send method** | Microsoft Graph only (no Nodemailer / SMTP password) |
| **Azure app name** | BIAW MAIL |
| **Account type** | Single tenant (BIAW organization only) |

Password / app-password SMTP **does not work** on Microsoft 365 (`535 basic authentication is disabled`). This integration uses a **refresh token** obtained once via device login.

---

## What we built

1. Registered Azure app **BIAW MAIL** in the BIAW Microsoft Entra tenant.
2. Granted **Microsoft Graph** delegated permissions **Mail.Send** and **User.Read**.
3. Enabled **Allow public client flows** for device-code login.
4. Configured project `.env` with BIAW tenant ID, client ID, and mailbox addresses.
5. Ran `npm run microsoft-oauth-login` signed in as **support@biaw.com** and stored `MICROSOFT_REFRESH_TOKEN`.
6. Verified with `npm run email:verify` and Postman test endpoints.

---

## Architecture

```
Member signup / Postman
        │
        ▼
  POST /send-otp  or  POST /email/test-send
        │
        ▼
  controllers/memberController.js  →  services/emailService.js
        │
        ▼
  services/microsoftMailAuth.js
    • Refresh token (in .env) → short-lived access token
    • POST https://graph.microsoft.com/v1.0/me/sendMail
        │
        ▼
  support@biaw.com mailbox (Microsoft 365)
```

---

## Azure — BIAW MAIL app registration

### Tenant

| Field | Value |
|-------|--------|
| **Organization** | biaw.com |
| **Directory (tenant) ID** | `36b56419-7ec3-499a-909e-8329d4bfe20e` |

Found under: **Microsoft Entra ID** → **Overview** → Basic information.

### App registration

| Field | Value |
|-------|--------|
| **Display name** | BIAW MAIL |
| **Application (client) ID** | `a39b84ee-a9d6-474c-9bd8-a1a6491f643a` |
| **Supported account types** | Single tenant — **My organization only** |
| **State** | Activated |

### Authentication

- **Allow public client flows:** **Yes** (required for `npm run microsoft-oauth-login`)
- **Redirect URI:** not required for device code flow
- **Client secret:** not used for current setup

### API permissions

Use tab **Microsoft APIs** → **Microsoft Graph** → **Delegated** (not “APIs my organization uses” — Exchange Online does not appear there for this flow).

| Permission | Type | Purpose |
|------------|------|---------|
| **Mail.Send** | Delegated | Send email as signed-in user |
| **User.Read** | Delegated | Sign-in / profile |

**Grant admin consent** for BIAW if your role allows it.

---

## Project `.env` configuration

Store secrets only in `.env` on the server — **never commit** `.env` to git.

```env
# BIAW production email
EMAIL_AUTH=microsoft-graph
EMAIL_FROM=support@biaw.com
EMAIL_FROM_NAME=BIAW Support
EMAIL_USER=support@biaw.com

SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false

MICROSOFT_TENANT_ID=36b56419-7ec3-499a-909e-8329d4bfe20e
MICROSOFT_CLIENT_ID=a39b84ee-a9d6-474c-9bd8-a1a6491f643a
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REFRESH_TOKEN=<from npm run microsoft-oauth-login — keep secret>
```

Do **not** set `EMAIL_PASSWORD` for Office 365.

Do **not** use `MICROSOFT_TENANT_ID=consumers` (that is only for personal @outlook.com test apps).

---

## Setup steps (completed)

### Phase 1 — Azure

1. Sign in to [Azure Portal](https://portal.azure.com) as **support@biaw.com** (BIAW directory).
2. **Microsoft Entra ID** → **App registrations** → **New registration**.
3. Name: **BIAW MAIL** → **Single tenant only – biaw.com** → Register.
4. Copy **Application (client) ID** and **Directory (tenant) ID** into `.env`.
5. **Authentication** → **Allow public client flows** = **Yes** → Save.
6. **API permissions** → Add **Microsoft Graph** delegated **Mail.Send** + **User.Read** → Add permissions → Grant admin consent (if available).

### Phase 2 — Device login (one-time per token)

```bash
npm run microsoft-oauth-login
```

1. Open `https://login.microsoft.com/device` (or link shown in terminal).
2. Enter the displayed code.
3. Sign in as **support@biaw.com**.
4. Accept permissions.
5. Copy `MICROSOFT_REFRESH_TOKEN=...` from terminal into `.env`.

### Phase 3 — Verify

```bash
npm run email:verify
```

Expected output includes:

- `authMode: microsoft-graph`
- `from: BIAW <support@biaw.com>`
- `microsoftOAuthConfigured: true`
- `SMTP OK`

### Phase 4 — Run API and test

```bash
npm start
```

Default: `http://localhost:5000`

---

## Postman test endpoints

| # | Method | URL | Body |
|---|--------|-----|------|
| 1 | GET | `/email/config` | — |
| 2 | GET | `/email/verify-smtp` | — |
| 3 | POST | `/email/test-send` | `{ "to": "your@email.com" }` |

**POST** `/email/test-send` headers:

- `Content-Type: application/json`

Success example:

```json
{
  "ok": true,
  "message": "Test email sent to ...",
  "from": "BIAW <support@biaw.com>",
  "response": "graph /me/sendMail accepted"
}
```

Import collection: `postman-email-collection.json` (set `baseUrl` and `testEmail` variables).

---

## Production member flow

After test send works, signup emails use the same stack:

**POST** `/send-otp`

```json
{
  "email": "member@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "companyName": "Example Co"
}
```

Implemented in `controllers/memberController.js` via `sendEmail()` from `services/emailService.js`.

---

## Maintenance

### Routine (low effort)

| Task | Frequency | Command / action |
|------|-----------|------------------|
| Health check | After deploy or monthly | `npm run email:verify` |
| Test send | After env change | Postman POST `/email/test-send` |
| Restart server | After any `.env` change | `npm start` (or restart host process) |

Access tokens refresh automatically on each send (~1 hour lifetime). No daily Azure login required.

### When to re-run device login

```bash
npm run microsoft-oauth-login
```

Then update `MICROSOFT_REFRESH_TOKEN` in `.env` and restart the server.

Do this if you see:

- `invalid_grant` / token errors
- `MICROSOFT_NOT_CONFIGURED`
- Permissions revoked in Azure
- Deliberate security rotation

### Azure / IT

- Do not delete **BIAW MAIL** app while the API is in use.
- Keep **Mail.Send** delegated permission.
- Keep **public client flows** enabled if using device login.
- Ensure **support@biaw.com** mailbox remains licensed and allowed to send.

### Secrets

- Treat `MICROSOFT_REFRESH_TOKEN` like a password.
- Backup `.env` securely for disaster recovery.
- Copy full email block when moving to a new server.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `535 basic authentication is disabled` | Password SMTP | Use `microsoft-graph`, not `EMAIL_PASSWORD` |
| `Set MICROSOFT_REFRESH_TOKEN` | Empty token on server | Device login → update `.env` |
| `AADSTS70002` mobile client | Public client off | Authentication → Allow public client flows = Yes |
| Exchange “No results” in API permissions | Wrong tab | Use **Microsoft APIs** → **Graph**, not “APIs my organization uses” |
| `consumers` tenant error | Wrong tenant for BIAW | Use directory ID `36b56419-7ec3-499a-909e-8329d4bfe20e` |
| Works locally, fails in production | Old `.env` on server | Sync BIAW `.env` + restart |
| Mail not in inbox | Delivery / spam | Check junk; verify `to` address |
| Inbox shows "Support" not "BIAW Support" | M365 mailbox display name | Set `EMAIL_FROM_NAME=BIAW Support` in `.env` **and** update **support@biaw.com** display name in Microsoft Entra / Exchange admin to **BIAW Support**, then restart API |

---

## Related project files

| File | Role |
|------|------|
| `services/emailService.js` | `sendEmail()` → Graph |
| `services/microsoftMailAuth.js` | Token exchange; Graph `sendMail` |
| `routes/emailTestRoutes.js` | `/email/config`, `/email/verify-smtp`, `/email/test-send` |
| `scripts/microsoft-oauth-device-login.js` | One-time browser login |
| `scripts/verify-email-smtp.js` | `npm run email:verify` |
| `controllers/memberController.js` | `/send-otp` production emails |
| `postman-email-collection.json` | Postman import |
| `.env` | Secrets (not in git) |
| `.env.example` | Template without secrets |

---

## Difference: personal test vs BIAW production

| | Personal test (`abinjoseph12303@outlook.com`) | BIAW production (`support@biaw.com`) |
|---|---------------------------------------------|--------------------------------------|
| Azure app | Email Testing (personal accounts) | BIAW MAIL (single tenant) |
| `MICROSOFT_TENANT_ID` | `consumers` | `36b56419-7ec3-499a-909e-8329d4bfe20e` |
| Sign-in at device login | Personal Outlook | support@biaw.com |
| Refresh token | Separate; do not mix with BIAW token | Current production token in `.env` |

---

## Status

| Step | Status |
|------|--------|
| Azure app BIAW MAIL registered | Done |
| Graph Mail.Send + User.Read | Done (confirm in Azure portal) |
| Public client flows | Done (confirm in Azure portal) |
| `.env` BIAW tenant + client ID | Done |
| Device login as support@biaw.com | Done |
| `npm run email:verify` | Done (SMTP OK) |
| Postman `/email/test-send` | Run after server start |

---

*Last updated: production setup for support@biaw.com — Microsoft Graph OAuth2.*
