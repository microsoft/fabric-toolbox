# Local development and browser automation

This page covers running Fabric Atlas locally inside the Fabric portal and
driving it with Playwright. Everything here is **development only**. None of it
changes the deployed Rayfin Data App.

## Local Network Access boundary

The Fabric portal embeds the local Vite server (`http://localhost`) in an
iframe. Chromium's Local Network Access (LNA) rules then require:

- the `Access-Control-Allow-Private-Network: true` opt-in header, and
- an answer to the private-network `OPTIONS` preflight.

The Vite dev server applies that boundary through
`src/dev/local-network-access.ts`:

| Request | Answer |
|---|---|
| Navigation without an `Origin` header | Private-network opt-in only |
| Request from an approved origin | Opt-in plus normal response |
| Private-network preflight from an approved origin | `204` with origin-specific, credentialed CORS headers and `Vary: Origin` |
| Private-network preflight from any other origin | `403` with no CORS headers |

Approved origins:

- `https://*.fabric.microsoft.com`
- `https://*.powerbi.com`
- `http(s)://localhost` and `http(s)://127.0.0.1` on any port
- any extra origin listed in `ATLAS_DEV_ALLOWED_ORIGINS`, comma-separated:

```powershell
$env:ATLAS_DEV_ALLOWED_ORIGINS = "https://my-tenant.example.com"
npm run dev
```

The server never answers with `Access-Control-Allow-Origin: *`.

## Persistent Edge profile for Playwright

`.playwright-config.json` launches Microsoft Edge with LNA checks relaxed so the
portal can reach the local server:

```text
--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks
```

Recommended workflow:

1. Use a **dedicated** Edge profile for automation, never your daily profile.
   The flags above weaken a browser security control for the whole profile.
2. Sign in to Fabric once in that profile. Playwright reuses the session, so
   tests do not need stored credentials.
3. For one-off or shared machines, prefer a disposable profile (a temporary
   `--user-data-dir`) and delete it after the run.
4. Do not browse unrelated sites in the automation profile.

## Security boundary

- The LNA helper only runs inside the Vite dev server. Production builds and
  `rayfin up` deployments do not include it.
- `localhost` redirect URIs in the Entra app registration are for development
  only. Remove them from production app registrations.
- Do not add broad origins to `ATLAS_DEV_ALLOWED_ORIGINS`; list exact origins.
