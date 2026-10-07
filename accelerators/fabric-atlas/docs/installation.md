# Installation and deployment

Fabric Atlas 2.0 is a Rayfin Data App deployed inside Microsoft Fabric.
`rayfin up` publishes the app, applies the MSSQL schema and deploys typed Rayfin
Functions. A small Python User Data Function remains for documented
compatibility gaps.

## Prerequisites

### Local preview

- Node.js 24
- npm 11

### Fabric deployment

- Microsoft Fabric capacity
- Fabric Apps enabled for the target users
- Rayfin CLI 1.36.2
- Permission to create items in the target workspace
- One Entra SPA registration for delegated compatibility calls
- Fabric Administrator support for the Power BI metadata scanner settings
- One configured Atlas synchronizer

The synchronized catalog is shared with the complete authenticated Fabric App
audience. Personal saved views, review decisions and acknowledgements remain
user-scoped.

## 1. Clone and validate

```powershell
git clone https://github.com/fredgis/FabricAtlas.git
Set-Location FabricAtlas
npm ci
npm test
npm run lint
npm run build
```

The root install also restores `rayfin/functions` through `postinstall`, so the
typed collector imports resolve on a fresh clone.

## 2. Run the local preview

```powershell
$env:VITE_RAYFIN_ATLAS_DEMO_MODE = "true"
npm run dev
```

Open <http://localhost:5173>.

Preview mode uses the bundled sample estate. Fabric brokered authentication and
live synchronization only work inside the Fabric portal.

## 3. Enable Fabric Apps

Enable the Fabric Apps workload for the users who will open Atlas. Restrict the
audience to people allowed to read the complete selected workspace scope.

## 4. Configure the synchronizer

The synchronizer is the only identity allowed to publish snapshots, change the
shared workspace scope, update governance targets or prune retained snapshots.

Set these values in the deployment shell:

```powershell
$env:RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL = "<authorized-sync-user>"
$env:RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT = "<entra-object-id>"
```

Use the immutable Entra subject as the authorization key. The email remains the
visible contact and historical writer label.

## 5. Deploy Fabric Atlas

```powershell
npx rayfin login --tenant <tenant-id> --select
npx rayfin up `
  --tenant <tenant-id> `
  --workspace-id <workspace-id> `
  --item-name fabric-atlas `
  --yes
```

This command:

- creates or updates the Fabric AppBackend;
- creates or updates the Fabric SQL database;
- applies the Rayfin schema and policies;
- deploys typed Rayfin Functions;
- builds and publishes the React application;
- records the hosting origin in `rayfin/.deployments.json`;
- adds the hosting origin to `allowedRedirectUris` in `rayfin/rayfin.yml`.

The committed manifest contains only local development redirects. Each
deployment adds its own hosting origin locally, which keeps repository
templates independent from the maintainer's deployed app.

If the old Fabric App was deleted, remove the stale local deployment registry
before creating the replacement:

```powershell
Remove-Item rayfin\.deployments.json -Force
```

Do not use `--force` unless a destructive schema change has been reviewed.

## 6. Register the Entra SPA

Create a single-tenant SPA registration for the deployed Atlas origin and local
development.

Register these redirect URIs:

```text
https://<atlas-host>.webapp.fabricapps.net
http://localhost:5173
http://127.0.0.1:5173
```

The delegated compatibility path requires the reviewed Power BI and Fabric
permissions used by the published UDF:

- `UserDataFunction.Execute.All`
- `Workspace.Read.All`
- `Item.Read.All`
- `Report.Read.All`
- `Dataset.Read.All`
- `Tenant.Read.All`

Kusto live metadata requires the delegated Azure Data Explorer audience.
Rayfin Functions now own SQL catalog collection, so the normal 2.0 path does
not forward a browser SQL token.

Grant admin consent where required. Keep optional audiences separate so a
missing enrichment permission remains an explicit capability gap instead of
blocking the complete catalog.

## 7. Configure public runtime values

Store public deployment values in the git-ignored `rayfin/.env` file:

```dotenv
RAYFIN_PUBLIC_ATLAS_SPA_CLIENT_ID=<entra-client-id>
RAYFIN_PUBLIC_ATLAS_UDF_URL=https://<host>/functions/sync_all/invoke
RAYFIN_PUBLIC_ATLAS_WORKSPACE_NAME=<workspace-display-name>
RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_EMAIL=<authorized-sync-user>
RAYFIN_PUBLIC_ATLAS_SYNC_ADMIN_SUBJECT=<entra-object-id>
RAYFIN_PUBLIC_ATLAS_SNAPSHOT_RETENTION_COUNT=12
VITE_ATLAS_COLLECTOR_ROLLBACK=false
```

Optional values:

```dotenv
RAYFIN_PUBLIC_ATLAS_PREVIOUS_SYNC_WRITERS=<former-user@example.com>
RAYFIN_PUBLIC_ATLAS_SENSITIVITY_RANKS='{"<label-id>":3}'
```

The configured URL is the published `sync_all` endpoint. Atlas derives the
`sync_compatibility` and rollback endpoints from the same trusted UDF origin.

## 8. Publish the compatibility UDF

The source is in:

```text
fabric/udf/atlas_sync_functions/function_app.py
```

Create or open the `atlas_sync_functions` User Data Function in the target
workspace and publish it once.

For updates, never send a partial hand-built definition:

1. Call the complete Fabric `getDefinition` operation.
2. Poll the operation and preserve every returned definition part.
3. Replace only the Base64 payload of `function_app.py`.
4. Call `updateDefinition` with the complete definition.
5. Poll the update.
6. Read the complete definition back.
7. Compare the local and deployed SHA-256 hashes.

The deployed definition currently contains `definition.json`,
`function_app.py` and `.platform`. It does not contain a separate
`requirements.txt` part.

The active 2.0 flow calls `sync_compatibility` only for:

- Power BI admin scanner evidence;
- PBIR-Legacy report pages;
- Kusto live metadata;
- explicit rollback.

`sync_all` and `sync_items` remain available for rollback and compatibility,
not as the normal Rayfin-first collection path.

## 9. Register the final hosting origin

Every newly created AppBackend receives a new hosting origin. Add that exact
origin to the Entra SPA redirect URIs before testing Sync.

A normal `rayfin up` reuses the existing AppBackend and origin. Deleting and
recreating the app requires registering the new origin.

## 10. Run the first synchronization

Open Atlas through its Fabric portal item. The configured synchronizer sees the
first-sync gate.

The browser:

1. discovers the selected workspace scope;
2. invokes bounded Rayfin collectors;
3. requests the exact Python compatibility plan;
4. validates and merges every envelope;
5. writes snapshot rows;
6. reads the persisted rows back;
7. publishes the workspace manifest last.

Keep the browser tab open until publication completes. A failed or cancelled
run preserves the last validated snapshot.

After the first snapshot, use Workspace Hub to select additional workspaces and
synchronize them independently.

## 11. Verify the deployment

```powershell
npx rayfin up status
```

Verify:

- the AppBackend is healthy;
- the hosting URL opens in Fabric;
- typed Functions respond;
- the expected Rayfin schema exists in the new SQL database;
- the registered SPA redirect matches the hosting origin;
- the compatibility UDF hash matches the repository source.

`rayfin up status` can retain a historical SQL database reference. When a
deployment was recreated, identify the active app database from the new Fabric
item IDs, display name and deployed Atlas schema.

## 12. Update an existing deployment

```powershell
git pull
npm ci
npx rayfin up `
  --tenant <tenant-id> `
  --workspace-id <workspace-id> `
  --item-name fabric-atlas `
  --yes
```

Republish `function_app.py` only when the compatibility source changed.

## Current platform limits

- Synchronization still runs in the synchronizer's browser tab.
- Scheduled refresh is disabled.
- Atlas does not store or replay delegated user tokens.
- Rayfin Functions expose no documented Power BI or Kusto application audience.
- Distributed claims and transactional fencing are not available for an
  unattended multi-host workflow.

See [Rayfin platform gaps](rayfin-platform-gaps.md) for the exact contracts
required to remove the remaining Python compatibility layer.

## Useful commands

```powershell
npm test
npm run lint
npm run build
npm run build:mcp
npm --prefix rayfin\functions run build
npx rayfin up status
```
