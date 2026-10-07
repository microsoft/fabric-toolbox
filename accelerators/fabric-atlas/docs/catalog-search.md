# OneLake Catalog Search (Preview) discovery

Fabric Atlas can append optional OneLake Catalog Search results to the global
`Ctrl+K` search. Catalog Search is a Preview discovery source: it never
replaces, reorders or deletes local snapshot search results, never writes
Rayfin rows and never becomes authoritative evidence.

## Capability boundary

- Feature ID `catalog-search`, registered in `src/atlas/preview-api.ts` with
  maturity `preview` and API version `Fabric REST v1`.
- Flag `VITE_ATLAS_FEATURE_CATALOG_SEARCH`, **off by default**
  (`src/atlas/feature-flags.ts`). With the flag off the palette is unchanged
  and the browser never invokes the Function.
- Synchronizer only. The Function runs with the Fabric application identity,
  so results reflect what that identity can discover, not what the signed-in
  user can open. The browser shows the action only to the configured
  synchronizer, and the Function enforces the same rule through the
  `SynchronizerAuthority` gate.
- Metadata only. Catalog entries prove discoverability for the application
  identity. They grant no access to item content and carry no business rows.
- Search absence is not evidence. An empty, partial or failed Catalog Search
  never removes, hides or contradicts synchronized snapshot items, and nothing
  is persisted from it.

## Function contract

`searchCatalogPreview` in `rayfin/functions/src/catalog-search.ts` declares
only `AudienceType.Fabric` and calls exactly one fixed endpoint:
`POST https://api.fabric.microsoft.com/v1/catalog/search`. Fabric REST
redirects are rejected, and the bearer token never appears in results or logs.

```ts
await client.functions.searchCatalogPreview.invoke({
  protocolVersion: 1,
  search: "sales",
  itemTypes: [],
  workspaceIds: [],
  pageSize: 25,
  continuationToken: null,
});
```

Strict input rules (`validateCatalogSearchInput`):

| Input | Rule |
| --- | --- |
| `protocolVersion` | Exactly `1` |
| `search` | 1-200 characters after whitespace collapse, at least one letter or number, no control or bidirectional override characters |
| `itemTypes` | Unique values from the documented `ItemType` list plus `Workspace` (`CATALOG_SEARCH_FILTER_TYPES`) |
| `workspaceIds` | At most 12 unique strict UUIDs (the documented API maximum) |
| `pageSize` | `null` (25) or an integer from 1 to 50 |
| `continuationToken` | `null`, or 1-4,096 printable ASCII characters sent **alone**: `search` must be `null`, filters empty and `pageSize` `null` |

The Function builds the documented filter itself, for example
`(Type eq 'Report' or Type eq 'Lakehouse') and (WorkspaceId eq '<uuid>')`.
Callers never supply raw filter text.

## Bounds

| Bound | Value |
| --- | --- |
| Execution budget per invocation | 45 seconds; no new page starts with less than 3 seconds left |
| Request timeout | 15 seconds |
| Attempts per page | 3 (at most two retries for throttling, 5xx, timeouts or unreachable hosts) |
| `Retry-After` honored | Up to 5 seconds; longer waits stop with `throttled` |
| Pages per invocation | 4 |
| Results per invocation | 200 (`maxPages * maxPageSize`) |
| Entries per page | 100 hard guard |
| Page body | 1 MiB |
| Envelope | 2 MiB |
| Browser accumulation across "Load more" | 200 entries |
| Browser invocation timeout | 60 seconds |

When the page bound or the deadline stops an invocation, the envelope returns
the next `continuationToken` and `coverage.moreAvailable: true`. If a page would
exceed the result bound, the remaining entries are dropped and no continuation
is returned, because resuming would skip them silently.

## Response envelope

`CatalogSearchEnvelope` (contract version 1) carries:

- `source: "onelake-catalog-search"`, `apiVersion: "v1-preview"`,
  `authoritative: false` and `identity: "fabric-application"`.
- `status`: `complete` (every attempted page succeeded), `partial` (earlier
  pages kept after a later failure) or `failed`.
- `failureCode` and `retryable` from a fixed vocabulary: `invalid-input`,
  `not-authorized`, `token-unavailable`, `permission-denied` (HTTP 401/403),
  `rejected-request` (HTTP 400/409/422, for example an expired continuation),
  `throttled`, `timeout`, `unavailable`, `malformed-response`,
  `response-too-large` and `cancelled`. Error bodies are never read.
- `scope`: the validated search, filters and page size, or `continued: true`.
- `coverage`: pages fetched, entries received, returned, skipped as malformed,
  merged as duplicates and descriptions truncated, plus `moreAvailable` and
  `stopReason` (`page-limit`, `deadline-exhausted`, `result-limit`, `failure`).
- `entries`: allowlisted fields only — `id`, `catalogEntryType`, `type`,
  `displayName`, `description` (control characters removed, at most 500
  characters), `workspaceId` and `workspaceDisplayName`. Unknown upstream
  fields are dropped. IDs are lowercased and each entry has a stable
  `key` (`item:{id}`, `workspace:{id}` or `entry:{kind}:{id}`), first-wins
  across pages. Future `type` and `catalogEntryType` values are preserved
  verbatim, including dotted Workload Hub item types such as
  `Microsoft.WaaS.BusinessProcessSolutions` (observed in the reference tenant
  on 2026-10-02). Malformed entries are skipped and counted instead of failing
  the page.
- `continuationToken` for the next page, kept after a retryable stop so the
  failed page can be retried.

## Search palette integration

`src/atlas/catalog-search.ts` holds the browser contract, and
`CommandPalette` renders it:

- Local snapshot results keep their deterministic ranking and stay first.
- The catalog search is user-initiated with **Search catalog**, never on each
  keystroke. **Load more** sends only the continuation token, and **Retry**
  appears only for retryable failures.
- Catalog results form a separate `OneLake catalog · Preview` option group in
  the same listbox, so arrow keys and Enter work across both sources. Each
  option names its source for assistive technology.
- A stable ID that matches a synchronized item or workspace opens the
  authoritative Atlas view. Other entries open their workspace in the Fabric
  portal in a new tab; Atlas does not guess item-type portal routes.
- The `PreviewApiNotice` and a source-coverage line appear with results.
  Results reset when the query changes or the palette closes.
- Honest states: flag off (hidden), preview data (no backend call),
  non-synchronizer (explained, no action), empty result (not proof of
  absence), permission denied, throttled, timeout, unavailable and malformed
  responses.

## Real-tenant status (2026-10-02)

Verified against FGI-MAIN with a **delegated user** token: response shape,
`continuationToken` format, the four-page bound and resumption without
overlap, Type filtering, zero skipped entries for real payloads and HTTP 401
mapping to `permission-denied`.

Not yet verified: the deployed Function under the **Rayfin Functions
application identity**. The API documents service principal and managed
identity support, but the identity behind `ctx.Tokens.Fabric`, its catalog
visibility and any tenant setting it needs are confirmed only by deploying this
Function with `npx rayfin up` and invoking it as the synchronizer. Keep the
flag off until that check passes.

## Validation

```powershell
npx --no-install rayfin functions init
npm test -- src\atlas\catalog-search-function.spec.ts src\atlas\catalog-search.spec.ts src\atlas\components\CommandPalette.spec.tsx src\atlas\durable-sync.spec.ts src\lib\rayfin-client.spec.ts
npm --prefix rayfin\functions run build
```
