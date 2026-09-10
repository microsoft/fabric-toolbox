# Installation & deployment

Fabric Atlas is a [Rayfin](https://www.npmjs.com/package/@microsoft/rayfin-cli) Data App: a Vite + React front end
served by Rayfin static hosting, backed by a Fabric SQL database (the Rayfin data model) and Fabric
brokered authentication. It runs as an item inside a Microsoft Fabric workspace.

> All identifiers below (tenant, workspace, client id, hosting URL, emails) are shown as
> **placeholders** like `<tenant-id>`. Fill in your own — nothing in this repo is tied to a specific
> tenant.

## Prerequisites

### To run locally (preview)
- Node.js 24 (`node --version`). The repository pins the tested runtime in
  `.nvmrc` and `.node-version`.

### To deploy and use the live Sync
1. A Microsoft Fabric workspace on a capacity in a **region that supports Fabric Apps (preview)**.
2. **Fabric Apps (preview)** enabled by a tenant admin (see below), otherwise `rayfin up` returns
   `403 The feature is not available`.
3. An **Entra ID app registration** (SPA) used by the Sync button, **and an account with enough Entra
   privileges to create and manage it** — ownership of the app registration, or a directory role such
   as *Application Administrator* / *Cloud Application Administrator*. You need this to grant admin
   consent and to add SPA redirect URIs; without it, Microsoft Graph returns
   `Authorization_RequestDenied — Insufficient privileges`. See
   [Live Sync setup](#5-live-sync-setup-app-registration--udf).
4. The **read-only admin APIs** tenant settings enabled, so the Sync can read per-item access and
   lineage from the Fabric admin scanner:
   - *Service principals / users can access read-only admin APIs*
   - *Enhance admin APIs responses with detailed metadata* and *…with user information*
5. The `atlas_sync_functions` **User Data Function published** in the workspace. Initial publication
   can be done in the portal; later source updates can use the full-definition
   `getDefinition` / `updateDefinition` REST flow described in
   [`fabric/udf/atlas_sync_functions/`](../fabric/udf/atlas_sync_functions/).
   Keep its pinned `fabric-user-data-functions` version from `requirements.txt`.

| Responsibility | Required identity or role |
|---|---|
| Run scanner-backed synchronization | A **Fabric Administrator** using the configured synchronizer account |
| Enable Fabric Apps and enhanced read-only admin API metadata | Fabric tenant administrator |
| Create the SPA, add redirects and grant delegated consent | Entra application/consent administrator or application owner with sufficient directory permissions |
| Deploy the Rayfin app into the target workspace | Workspace contributor or higher with Fabric App creation rights |

## 1. Clone and install

```bash
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox/accelerators/fabric-atlas
npm ci
```

## 2. Run it locally (preview mode, no Fabric needed)

Preview data is explicit and never activates because production authentication
failed. Enable it only for local exploration:

```bash
export VITE_RAYFIN_ATLAS_DEMO_MODE=true
npm run dev
# open http://localhost:5173
```

In PowerShell, use
`$env:VITE_RAYFIN_ATLAS_DEMO_MODE = "true"` before `npm run dev`.

Everything works against the sample dataset: overview, map, catalog, asset catalog, access matrix,
sensitivity, jobs and Workspace Hub. Nothing is written anywhere.

## 3. Enable the Fabric Apps workload (tenant admin, one-time)

Creating a Fabric App item requires a tenant admin to turn the workload on.

1. Open the [Fabric admin portal](https://app.fabric.microsoft.com/admin-portal) → Tenant settings.
2. Under **Fabric Apps (preview)**, set the switch to Enabled.
3. Scope it to the whole organization, or a security group that includes the deploying account.
4. Apply, wait a few minutes for it to propagate.

The workspace's capacity must also sit in a region that supports Fabric Apps (preview). Some regions
are not supported — see
[region availability](https://learn.microsoft.com/en-us/fabric/admin/region-availability).

## 4. Deploy to Fabric

Deployment provisions the backend (Fabric SQL database + Rayfin Data API, storage, static hosting,
Fabric auth), applies the schema, and publishes the app — in one command.

```powershell
npx rayfin login                       # sign in with Entra ID (target the tenant that owns the workspace)
$env:RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL = "<authorized-sync-user>"
$env:RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT = "<authorized-sync-subject>"
npx rayfin up --workspace "<workspace-name>"
```

`rayfin up` writes the runtime configuration (`VITE_RAYFIN_*`, `VITE_FABRIC_*`) into `.env.local`
(git-ignored), records the deployment in `rayfin/.deployments.json` (git-ignored), and prints the
live hosting URL (`https://<app>.fabricapps.net`). Open that URL from inside the Fabric portal —
Fabric brokered auth only works embedded in the portal.

> `rayfin login` must target the tenant that owns the workspace:
> `npx rayfin login --tenant <tenant-id> --select`.

The deployed app uses a shared authenticated catalog read scope. Every user
admitted to the Fabric app can read the complete synchronized governance graph
and team notes for the configured workspace. Restrict the Fabric app audience
accordingly. Personal saved views, review decisions and Radar acknowledgements
remain user-scoped.

## 5. Live Sync setup (app registration + UDF)

The **Sync** button reads the live workspace. A deployed Rayfin app can't call the Fabric REST APIs
directly (no token in app code, no browser CORS), so Sync acquires a Power BI token with **MSAL** and
calls the `atlas_sync_functions` **User Data Function**, which calls Fabric on the user's behalf. See
the [How it works](../README.md#how-it-works) section in the root README.

### 5a. Create the Entra app registration (once)

Create a **single-page application** registration and grant it delegated Power BI/Fabric scopes. With
the Azure CLI (replace nothing that is already a placeholder):

```bash
# 1. Create the SPA app
appId=$(az ad app create --display-name "Fabric Atlas Sync" --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)

# 2. Add the required delegated Power BI permissions:
#    UserDataFunction.Execute.All, Workspace.Read.All, Item.Read.All,
#    Report.Read.All, Dataset.Read.All and Tenant.Read.All.
#    Item.ReadWrite.All is requested separately and only for optional Ontology,
#    Graph Model and Data Agent definition enrichment.
#    (add each with: az ad app permission add --id $appId --api 00000009-0000-0000-c000-000000000000
#     --api-permissions <scope-id>=Scope), then grant admin consent:
#
# 3. Add delegated user_impersonation permissions for Azure Data Explorer
#    and Azure SQL Database to enable KQL and SQL system-catalog discovery.
az ad sp create --id $appId
az ad app permission admin-consent --id $appId

# 4. Register the SPA redirect URIs (your app origin + localhost) via Microsoft Graph:
#    PATCH https://graph.microsoft.com/v1.0/applications/<object-id>
#    body: { "spa": { "redirectUris": [ "https://<app>.fabricapps.net", "http://localhost:5173" ] } }
```

> The tenant, client and workspace ids are **not secrets**, but they are also not committed. Provide
> them to the build through git-ignored env vars (next step).

### 5b. Point the app at your registration and UDF

Copy the supplied example, then add the public deployment values to
`rayfin/.env` (git-ignored). `rayfin env` maps custom
`RAYFIN_PUBLIC_*` values to Vite variables, and `rayfin up` supplies the Fabric workspace and tenant:

```bash
cp .env.example rayfin/.env

RAYFIN_PUBLIC_ATLAS_SPA_CLIENT_ID=<client-id>
RAYFIN_PUBLIC_ATLAS_UDF_URL=https://<...>/functions/sync_all/invoke
RAYFIN_PUBLIC_ATLAS_WORKSPACE_NAME=<workspace-display-name>
RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL=<authorized-sync-user>
RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT=<authorized-sync-subject>
RAYFIN_PUBLIC_ATLAS_SNAPSHOT_RETENTION_COUNT=12
# Optional during synchronizer rotation:
RAYFIN_PUBLIC_ATLAS_PREVIOUS_SYNC_WRITERS=<former-user@example.com>
RAYFIN_PUBLIC_ATLAS_SENSITIVITY_RANKS='{"<label-id>":3,"<lower-label-id>":1}'
```

Then `npx rayfin up` again so the values are baked into the deployed bundle, and add the new hosting
origin to the app registration's SPA redirect URIs.

`RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT` is compiled into Rayfin create, update
and delete policies and must match the authenticated Rayfin `session.user.id`
(`claims.sub`). The email is retained as the visible contact and historical
snapshot writer. Set both before schema generation and deployment; changing
either requires another `npx rayfin up`. Snapshot retention defaults to 12 and
is clamped between 2 and 50.

The synchronizer setting must also be available to the CLI process that
compiles these policies. Keep it in `rayfin/.env` for frontend generation and
export it in the deployment shell as shown above. Confirm that the database
configuration phase succeeds: some CLI versions continue publishing static
content after a database configuration failure.

Only the configured immutable subject can run the first synchronization or
publish later snapshots. Resolve the account's stable object identifier through
Entra or the authenticated Rayfin session and keep the email for contact.

Deep discovery is capability-based. Without optional definition, Kusto or Azure SQL delegated
consent, those items remain visible and Atlas reports their deep schema as
unavailable. Ontology, Graph Model and Data Agent definitions require
the separately acquired `Item.ReadWrite.All` token and read/write permission on
the item because that is the current Fabric API contract. Encrypted sensitivity
labels can block Ontology definition retrieval.

`rayfin up` adds the deployment origin to Rayfin's authentication allowlist.
The Entra SPA redirect URI is managed separately and must contain the same
hosting origin.

Atlas uses these permissions only for read operations. It never calls
definition update/delete APIs, never elevates the signed-in user and never
stores rows, prompts, few-shots or graph instances.

Sensitivity downgrade alerts are tenant-specific. Optionally map Purview label
IDs or normalized aliases to numeric ranks in
`RAYFIN_PUBLIC_ATLAS_SENSITIVITY_RANKS`; higher numbers mean stronger
protection. Unknown labels intentionally produce no downgrade alert.

> **One SPA redirect URI per hosting origin.** MSAL signs in against the app's own origin
> (`https://<app>.fabricapps.net`), so that exact origin must be listed under the app registration's
> **Authentication → Single-page application** redirect URIs — otherwise the Sync popup fails with an
> `AADSTS` redirect-mismatch error. `rayfin up` gives a **new** origin every time the app is *deleted
> and re-created*, which means re-registering it. **Don't delete the app**: a plain `npx rayfin up`
> reuses the same item and origin, so you register the redirect URI only once. Adding it (portal →
> App registration → Authentication → SPA, or the Graph `PATCH` in step 5a) requires the Entra
> privilege listed in the prerequisites.

### 5c. Publish the UDF and run Sync

1. Open the `atlas_sync_functions` item in your workspace (Fabric portal). Make sure its code matches
   [`function_app.py`](../fabric/udf/atlas_sync_functions/function_app.py), then click **Publish** and
   confirm both `sync_all` and `sync_items` are public endpoints. Copy the `sync_all` invoke URL; the
   app derives the sibling `sync_items` URL for resumable per-type enrichment.
2. Put the `sync_all` invoke URL in `RAYFIN_PUBLIC_ATLAS_UDF_URL` as shown above, redeploy, open the
   app and click **Start first sync**. The first-run screen shows live progress but never asks users
   to paste configuration values. After a successful index, future visits open the dashboard
   directly and later refreshes use the header Sync button.

For an existing published UDF, retrieve the complete definition, replace only
the Base64 `function_app.py` and `requirements.txt` payloads, submit every
definition part to `updateDefinition`, then read the definition back and
compare both hashes before invoking `sync_all`.

## 6. Redeploy after a change

Any change, including the `SavedView` and `AccessReview` entities introduced in
Fabric Atlas 1.5, ships the same way:

```bash
npx rayfin up
```

Use `--force` only when you have reviewed a destructive schema change (drop column / alter type). If
the app was deleted and re-created, remove `rayfin/.deployments.json` first so a fresh item is
created, then re-add the new hosting origin to the app registration.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (preview mode with sample data) |
| `npm run build` | Type-check and build the production bundle to `dist/` |
| `npm run typecheck` | Run the full TypeScript project check |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npx rayfin up` | Deploy app + apply schema to Fabric |

Team notes are shared and append-only in v1.x. Atlas stores the authenticated
session email as the author label and binds the note to the authenticated
subject. That label survives reload, but notes cannot currently be edited or
deleted.

See [architecture.md](architecture.md) for how it all fits together.
