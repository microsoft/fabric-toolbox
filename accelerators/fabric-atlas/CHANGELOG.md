# Changelog

All notable changes to Fabric Atlas are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.1] - 2026-09-10

### Fixed

- External Fabric metadata is normalized to the Rayfin entity limits before
  snapshot writes, with explicit truncation markers for display values and
  stable shortened keys for long identifiers.
- Schema objects keep their original names after chunked persistence even when
  the storage key must be shortened.
- Live synchronization is reported as unconfigured when the tenant is missing,
  and the application shell disables Sync when required settings are invalid.
- Saved views cannot be created while their initial personal state is loading.
- Team-note documentation now matches the authenticated email and subject
  binding used by the application.

## [1.12.0] - 2026-09-05

### Added

- Durable synchronization attempts with correlation IDs, running/completed/failed states, duration and failure metadata.
- User-controlled synchronization cancellation, per-request browser deadlines and silent token renewal between resumable slices.
- Explicit demo mode, immutable synchronizer subject configuration and tri-state external-principal evidence.
- Node.js 24 runtime pins and grouped Dependabot updates for npm and UDF Python dependencies.

### Changed

- Fabric synchronization now uses a read-oriented token by default and acquires `Item.ReadWrite.All` separately only for optional item-definition discovery.
- Snapshot publication verifies every persisted child row through the production pagination path before publishing the workspace manifest.
- Team notes load independently from the shared catalog and retain their own loading, retry and error states.
- Upgraded MSAL Browser to 4.30.0 and the Rayfin package family to 1.34.0.

### Fixed

- Slow requests and deferred `Retry-After` responses now produce resumable continuations instead of invalid completed items.
- KQL schema discovery and Rayfin reads no longer silently truncate at fixed page or object limits; continuation cycles and response-size limits fail explicitly.
- Deterministic item metadata failures are isolated without hiding retryable timing failures.
- Scanner responses without user information no longer publish an authoritative empty access snapshot.
- Lakehouse detail fallback now tolerates expected permission/not-found responses without swallowing server or timing failures.
- Legacy workspace roles round-trip deterministically, and failed or abandoned snapshot rows are cleaned only after a grace period.

### Security

- UDF destinations are restricted to matching HTTPS Fabric User Data Function endpoints before delegated tokens are acquired, and redirects are rejected in both browser and UDF transports.
- Catalog publication policies use the authenticated immutable subject instead of a mutable email claim.
- Team-note author labels are derived from the authenticated email, and client-supplied UUIDs are validated.
- Removed public diagnostic metadata functions; only `ping`, `sync_all` and `sync_items` remain published.
- Production dependency audit is clean; known vulnerable transitive build dependencies are pinned where compatible.

## [1.11.5] - 2026-09-05

### Fixed

- Impact mode no longer changes the layout focus, reorders disconnected graph components or moves a selected middle item toward the top.
- The lineage viewport and every node coordinate remain unchanged when Impact mode is toggled; only path highlighting and non-impact opacity change.

## [1.11.4] - 2026-09-05

### Changed

- Impact mode now renders non-impacted items and links at very low opacity while preserving the complete graph and its positions.
- Object item grouping is shown in a dedicated, persistent bar with per-item counts and prominent global expand/collapse controls.
- Reduced item and object lineage arrowhead size without removing directional clarity.

### Fixed

- Lakehouse, Warehouse, SQL Database and Semantic Model object views now prioritize their local schema graph when they also participate in Ontology lineage.
- Ontology, Graph Model, Data Agent and KQL Database items continue to use their verified metadata-native object graph.

## [1.11.3] - 2026-09-05

### Added

- Object lineage groups connected objects by Fabric item, keeps the active item expanded and exposes Expand item groups / Collapse item groups controls.
- The complete lineage canvas can be panned by holding the left mouse button on its background and dragging.

### Changed

- Impact mode now preserves the complete graph, node positions and scroll context while changing only dependency highlighting.
- Replaced the README Governance Center, Access Review and impact-report screenshots.

### Fixed

- Selecting a collapsed connected-item group now switches the active item and rebuilds object lineage instead of retaining the previous Ontology graph.

## [1.11.2] - 2026-09-05

### Changed

- Replaced the README guided deployment, workspace overview, interactive lineage, object lineage and Asset Catalog screenshots with the current Fabric deployment.
- Added Expand all and Collapse all controls to the deep-lineage table inspector.

### Fixed

- Selecting an object node owned by another Fabric item now switches the active item, clears stale object filters and rebuilds object lineage for the new item.
- Item changes now reset stale object selection and drag state consistently across Map navigation paths.

## [1.11.1] - 2026-09-05

### Changed

- Initial deployment sync and later workspace refreshes now share the same five-phase progress display with the active stage and elapsed time.
- Workspace discovery no longer uses a product-level object-lineage relation count cap. Every verified relation returned by the collector is validated, mapped and persisted.
- The UDF execution budget is now 180 seconds, leaving a 20-second completion reserve below Fabric's documented 200-second function timeout.
- Deep discovery now runs as an authoritative base scan followed by resumable item batches grouped by Fabric type, with actual completed-item progress.

### Fixed

- Large valid object-lineage payloads no longer fail validation after crossing the parser's internal traversal budget.
- Synchronization no longer advances to an artificial 42% while the Fabric metadata request is still running.
- A deadline state returned outside the resumable slice protocol cannot publish a snapshot.
- Timed-out or oversized enrichment batches now continue automatically, split into smaller batches, or retry a single slow item in an isolated UDF slice.
- Deterministic single-item size failures and repeated no-progress slices now stop explicitly instead of leaving synchronization in an infinite retry loop.
- Active synchronization now warns before a browser refresh can discard the in-memory continuation queue.

## [1.11.0] - 2026-09-05

### Added

- Generic deep discovery for every KQL Database in the configured workspace, including tables, columns, stored functions and materialized views.
- Generic Fabric SQL Database discovery through workspace-resolved endpoints and constant read-only system-catalog queries.
- First-class Ontology, Graph Model, Data Agent, KQL Queryset and KQL Dashboard item types.
- Ontology entity, property, time-series property, relationship, binding and contextualization inventory.
- Graph Model node, edge, property and physical-source mapping inventory.
- Data Agent draft/published source inventory and selected table, column, measure, KQL, ontology and graph objects.
- Verified object lineage for physical source bindings, ontology relationships, Graph Model mappings and Data Agent selections.
- Object-level impact, filtering, search, deep links and historical comparison for the new metadata types.
- A cited Fabric metadata coverage audit in `docs/fabric-metadata-coverage-audit.md`.

### Changed

- Asset Catalog now uses workload-specific object labels instead of presenting every object as a table or column.
- Map object mode uses verified metadata edges when available and retains the existing DAX graph as the Semantic Model fallback.
- Snapshot persistence stores safe item metadata and verified object edges in bounded hidden `ConfigEntry` chunks.
- Synchronization acquires separate optional Kusto and Azure SQL audience tokens for the same authenticated Fabric user.

### Security

- SQL discovery uses allowlisted `*.database.fabric.microsoft.com` endpoints, a constant `sys.*` query, read-only application intent and token-based authentication.
- KQL discovery runs only fixed read-only metadata commands against allowlisted Fabric Kusto endpoints.
- Definition sanitization removes Data Agent instructions and few-shots, KQL function bodies, SQL module definitions, graph filter literals and instances, and Ontology documents or resource links.
- Optional metadata failures remain visible as capability status and never replace the last validated snapshot with fabricated or partial success.

### Documentation

- Updated the README coverage matrix, installation permissions, architecture and data model for generic workspace discovery.

## [1.10.1] - 2026-09-05

### Changed

- Reduced item and object node widths and restored clear horizontal and vertical spacing in lineage views.
- Made the standard governance baseline explicit: 70% for each of the six pillars.

### Fixed

- Item type and health filters now replace an incompatible selection instead of retaining it outside the filtered type.
- Changing the object table filter now selects that table and clears the previous incompatible object selection.

## [1.10.0] - 2026-09-05

### Added

- A grouped Catalog table with sorting by item name, health, documented owner and last refresh, alongside the existing cards.
- Personal compact and comfortable display density, with browser-local settings separated by user and workspace.
- A resizable lineage inspector with keyboard controls and a remembered width.
- Evidence-bound access-review history. Changed permissions require a fresh decision, while earlier decisions remain visible.
- Shared workspace governance targets, with a default of 70% for each of the six posture pillars.
- Justified, expiring governance exceptions, separate from personal Radar acknowledgements and mutes.
- Full before/after schema and DAX details, with impact evaluated from the selected historical snapshot, including removed objects.

### Changed

- Reduced page-header space and standardized toolbar typography and density-aware rows.
- Improved lineage label readability and the visibility of inactive context without moving nodes when selection changes.
- Kept Radar compact when it has no new priority risk, preserving the first-snapshot baseline and the exact comparison link.
- Distinguished Owner permissions from documented item ownership.

### Fixed

- Overview health now excludes unknown statuses from its denominator and displays health coverage separately.
- Unavailable visibility and source metadata no longer appear as confirmed visibility or a recorded source.

### Security

- Added governance policy and exception entities with shared authenticated reads and writes restricted to the configured synchronization administrator.
- Added personal, append-only access-review events without deleting legacy review records or synchronized snapshots.

### Documentation

- Updated the README for the P1 features and browser-local display settings.
- Recorded all deferred P2 and P3 work in the v2 roadmap, including scheduled synchronization and the shared action plan.

## [1.9.2] - 2026-08-30

### Fixed

- Team notes now resolve a unique synchronized Fabric principal display name and preserve it through persistence and reload instead of reverting to the author's email address.
- Notes show the policy-bound authenticated email beside any distinct display label so readers can verify the author.
- The first-sync gate names the configured synchronization account when another user cannot start the refresh.

### Security

- Comment creation now binds both `authorEmail` to `claims.email` and `authorId` to `claims.sub`.
- Documentation explicitly states that every authenticated app user can read the complete synchronized governance graph and shared team notes.

### Documentation

- Documented the append-only note model and the user-scoped boundaries for saved views, access reviews and Radar acknowledgements.
- Documented the current bundle/code-splitting tradeoff without treating it as a correctness failure.
- Confirmed that `npm run typecheck` runs strict `tsc -b --force` with `noEmit`; TypeScript `noCheck` is not enabled.

## [1.9.1] - 2026-08-30

### Added

- A visible Governance Radar baseline immediately after the first validated snapshot.
- A clear-state link for non-risky workspace changes, bound to the exact latest adjacent snapshot pair.
- Synchronized Asset Catalog groups for schema-capable items even when Fabric exposes no objects yet.

### Changed

- Successful synchronization replaces current data and history atomically and remounts the active view against the new snapshot.
- Patch releases within the same major/minor snapshot contract reuse existing history instead of forcing another deployment sync.
- The deployment identity now carries an explicit `snapshot-v1` contract marker; existing legacy snapshots receive one guided synchronization without being deleted.
- Asset searches by item name or type retain all real child assets.

### Fixed

- Freshly persisted snapshots now retain their deployment identity in memory, preventing Radar from resetting to a baseline after every sync.
- New Fabric items, including Warehouses, become visible across the application immediately after synchronization.
- Radar’s non-risky change action now opens the same adjacent snapshots used to calculate its count.

## [1.9.0] - 2026-08-30

### Added

- Governance Radar showing only new high/critical findings and risky changes since the latest adjacent snapshot.
- Personal Radar acknowledgement and mute state through the user-scoped `FindingAck` entity.
- Six reproducible posture pillars with targets, deltas, historical trends and actionable drill-downs.
- Departure/removal packs with ownership coverage, sole-owner risk, downstream blast radius, reassignment suggestions and three exports.
- Dependency-free DAX reference parsing and schema-object lineage for resolved measure-to-column and measure-to-measure dependencies.
- Explicit confidence labels for verified DAX dependencies and inferred unique source-table hops.

### Changed

- Initial synchronization replaces the topology illustration with an accessible progress donut driven by the real sync percentage.
- Impact reports switch to object granularity when DAX evidence resolves and keep unrelated item-level consumers out of object results.
- Asset Catalog shows **Depends on** and **Used by** relationships for synchronized schema objects.
- Overview includes posture-target attainment and per-pillar deltas.
- Governance Center adds Radar and Posture experiences while preserving summary-first lazy history.
- Radar uses a target-and-shield watermark to show exactly which monitored signals have no new high-priority regression.

### Fixed

- UUID-like capacity identifiers are no longer displayed in the sidebar or Overview workspace summary.
- The global Search empty-state copy uses a stable readable width instead of collapsing into one-word lines.
- Radar personalization failures no longer hide governance alerts.
- Failed canonical Radar snapshots expose an explicit retry instead of remaining in an indefinite loading state.
- Radar actions wait for personal acknowledgement hydration, preventing a stale load from replacing a newer choice.
- Departure packs display ownership metadata coverage in both the dialog and Markdown evidence.
- Quoted table arguments and table-qualified measures no longer stop or disappear from DAX parsing.
- Radar evidence actions consistently open the matching Change Center evidence.

### Security

- Finding acknowledgements are isolated by authenticated subject and use a SHA-256 composite record key.
- Acknowledge and Mute writes are serialized per finding to prevent out-of-order final state.
- Unknown sensitivity rank mappings deliberately produce no downgrade alert instead of a false positive.

## [1.8.0] - 2026-08-30

### Added

- Configurable trusted snapshot retention, defaulting to 12 and bounded between 2 and 50.
- Versioned governance summaries in Workspace manifests for fast trend and ledger loading.
- Lazy loading and caching of historical catalogs selected in Change Center.
- Browser-native render containment for large Access, Asset Catalog and Jobs collections.

### Changed

- Lineage traversal, impact reports, connected components and staged layout now share adjacency indexes instead of repeatedly scanning every edge.
- Map selection reuses the same lineage index and avoids rebuilding the default layout when the visible graph has not changed.
- Access Review uses one responsive selectable list instead of mounting separate desktop and mobile copies.
- Jobs history uses one responsive timeline: compact cards on mobile and a dense aligned grid on desktop.
- Active job filters are individually visible and removable.

### Security

- Only the configured synchronizer can delete synchronized snapshot entities.
- Retention runs only after the new Workspace manifest is published, scopes every read and deletion by workspace, snapshot and writer, and deletes each stale manifest last.
- Synchronizer rotation can explicitly trust former writer emails so their validated history remains readable and eligible for retention cleanup.
- Partial cleanup retries are idempotent; a cleanup failure never changes a successful synchronization into a failed one.

### Fixed

- Historical lazy loads are discarded when a newer synchronization generation starts.
- Retention and visible history use the same configured snapshot count.
- Access rows retain complete programmatic labels and listbox keyboard navigation.
- Job fields retain programmatic Status, Item, Job, Started, Duration and Detail labels at every breakpoint.

## [1.7.0] - 2026-08-30

### Added

- Shareable, namespaced URL state for Catalog, Asset Catalog, Governance Center, Access Review, Jobs, Workspace Hub and Map inspector tabs.
- Accessible textual relationship summaries and non-color direction patterns for item and object lineage.
- Visible context chips for focused job routes.

### Changed

- Command search builds its workspace index once per snapshot and debounces queries without exposing stale results.
- Access Review and Asset Catalog automatically open matching groups during active searches, then restore the previous collapsed state.
- Overview governance signals and item-type rows open their destination with actionable filters already applied.
- First-sync motion respects reduced-motion preferences and synchronization stages use live status announcements.

### Accessibility

- Command search, impact reports and mobile navigation now use managed modal focus, Escape handling, background inerting and focus restoration.
- Governance Center, Map inspector and Workspace Hub tabs support Arrow keys, Home and End with linked tab panels.
- The application shell adds a skip control, route-aware document titles, focus transfer and one main landmark per route.
- Mobile navigation closes safely when the layout crosses into the desktop breakpoint.

### Fixed

- Active navigation no longer creates duplicate browser-history entries.
- Catalog item routes keep focus inside the open detail drawer.
- Access Review URLs now track the visible review row and clear stale row focus when the detail closes.
- Asset filter kind and selected object kind are serialized independently.
- Change Center URLs preserve both compared snapshot IDs.

## [1.6.1] - 2026-08-30

### Added

- Official ID-based lineage for upstream Dataflows, Datamarts and Semantic Models, including same-type dependency chains.
- Workspace-boundary validation for scanner lineage references.

### Changed

- Snapshot rows are written in bounded batches of eight requests while entity groups, the sync audit and the workspace manifest remain ordered.

### Fixed

- Datamarts are now a first-class catalog type with the correct lineage stage.
- Authoritative scanner relationships preserve their source-to-consumer direction even when valid dependencies cross the visual stage order.
- Malformed lineage collections or workspace identifiers fail closed instead of publishing partial authoritative lineage.

## [1.6.0] - 2026-08-30

### Added

- Versioned synchronization contract with required and optional section status plus metadata capability evidence.
- Persisted ownership, configuration, modification, endorsement, sensitivity-label and tag provenance.
- Explicit `N/A` states when Fabric did not collect a metadata family, rather than reporting a false zero or gap.

### Changed

- The User Data Function now runs inside a shared 92-second deadline, retries throttled and transient requests within that budget, and rejects payloads above 25 MiB.
- Client response reading is streamed and bounded before JSON parsing; empty workspaces remain valid when every required section completes.
- Principal identities use Fabric IDs when supplied and correlate legacy name or email references without creating false access-history churn.
- Ownership is derived only from documented type-specific fields: `configuredBy` for Semantic Models, Dataflows and Datamarts, and `createdBy` for Reports.
- Optional job, item-detail, Lakehouse-table and report-page failures no longer invalidate otherwise authoritative metadata.

### Security

- Snapshot reads and creates are constrained to the configured synchronization account through server-side filters and Rayfin create policies.
- Scanner output is allowlisted to governance metadata. Business rows, datasource details, connection data and Power Query or source expressions are not serialized or persisted.
- UDF dependencies are pinned and production builds now run the complete TypeScript project check.

## [1.5.1] - 2026-08-30

### Changed

- Light mode is now the default so Fabric Atlas fits naturally inside the Fabric portal.
- Semantic colors align with Fabric UX and Fluent 2 neutral, brand, status and focus tokens.
- The application shell uses a lighter Fabric-style sidebar, subtle selected navigation rail and compact command header.
- Cards, dialogs, filters, inspectors and first-sync surfaces use Fluent spacing, radii and elevation.
- Atlas keeps its product identity through a restrained purple-to-teal spectrum on the logo and lineage.
- Dark mode remains available with corrected text and status contrast.

## [1.5.0] - 2026-08-29

### Added

- Governance Center with grouped Findings, Change Center, History and Coverage views.
- Validated snapshot history with configurable comparisons across items, schema, access, sensitivity, lineage and jobs.
- Governance findings for explicit access, metadata, operational and lineage evidence.
- Access Review matrix with additive permission calculation, persisted review decisions, notes and CSV export.
- Global `Ctrl+K` search across items, schema objects, principals, jobs, configuration and team notes.
- Exportable impact reports for Fabric items, tables, columns and measures.
- User-scoped saved views for Governance Center, Access Review and Jobs filters.
- Metadata coverage diagnostics and historical trend charts.

### Changed

- Governance capabilities are grouped under one Governance Center instead of adding separate navigation entries.
- Access now uses one shared effective-permission engine across the review screen, Asset Catalog and lineage inspector.
- Sensitivity details are available inside Governance Center coverage.
- Catalog, Asset Catalog, Jobs, Workspace Hub and comments accept targeted navigation from global search.

## [1.4.0] - 2026-08-29

### Added

- Immutable workspace snapshots with manifest validation and fallback to the last complete index.
- Multi-selection and group movement in item and object lineage.
- Expanded object metadata for Lakehouse, Warehouse, SQL Database, Semantic Model and Report items.
- Focused regression tests for snapshot integrity, account selection and UDF schema derivation.

### Changed

- Synchronization now rejects incomplete Fabric responses before persistence.
- Lineage Reset restores positions, zoom, selection and scroll; lifecycle spacing is wider.
- Governance Overview is reduced to one hero and three operational sections.
- README and `/docs` now describe snapshot behavior, object coverage and contribution paths.
- Security handling was hardened following an OWASP Top 10:2025 and ASVS 5.0 review.

## [1.3.1] - 2026-08-29

### Changed

- Object lineage nodes are now draggable.
- Object selection highlights upstream and downstream nodes without moving the layout.
- Connected object edges use the same animated violet/teal treatment as item lineage.
- Object mode now dims unrelated objects and exposes relationship names through native tooltips.

## [1.3.0] - 2026-08-29

### Added

- Workspace Hub combining configuration and persistent team notes.
- MIT license and repository-specific contribution and security guidance.

### Changed

- Impact mode now starts disabled so the complete workspace is visible by default.
- Lineage relationship names moved to native SVG tooltips, leaving animated edges unobstructed.
- Deployment sync content aligns at the bottom of both hero columns and no longer displays the workspace ID.
- About now focuses only on the open-source project, clone command and essential build context.
- README rebuilt as an open-source project landing page.

### Removed

- Separate Config and Comments navigation entries.
- Unused semantic-model starter hook, Fabric client, DataTable helpers, preview screen and related tests/assets.
- Unused Fabric visual, DataGrid and app-data runtime dependencies.
- Unused `components.json` and empty `fabric.yaml`.

## [1.2.0] - 2026-08-29

### Changed

- Redesigned Catalog and Asset Catalog with clearer command headers, grouped navigation, denser cards and structured inspectors.
- Redesigned Access and Sensitivity as higher-signal governance and risk workspaces.
- Redesigned Jobs, Config and Comments for faster operational scanning and better empty states.
- Simplified About into an open-source project page with clone, source, release and license context.
- Grouped the sidebar navigation into Explore, Govern, Operate and System sections.
- Added a shared content-width frame and strengthened shared cards, chips and section labels.

## [1.1.2] - 2026-08-29

### Changed

- Rebuilt the first-sync experience as a responsive full-width hero with animated lineage, live workspace metrics and a stronger synchronization panel.
- Enhanced Governance Overview with animated depth and a circular health pulse.
- Replaced conflicting named `max-w-*` utilities with dedicated layout classes.
- Added a Rayfin workspace-name variable and robust fallbacks so deployment screens never show `undefined`.

## [1.1.1] - 2026-08-29

### Changed

- Every newly deployed build now opens on the synchronization screen once, even when an older catalog already exists.
- Lineage selection no longer recalculates the focused layout or moves the selected node.
- Added an explicit **Focus selection** action for intentionally rebuilding the visible path.

## [1.1.0] - 2026-08-29

### Added

- First-sync command screen with real synchronization stages and progress.
- Synchronization progress and status in the persistent application header.
- Connected-component grouping for large lineage maps.

### Changed

- Dark theme is now the default; a light preference is stored when selected.
- Scanner lineage is normalized into source-to-consumer direction.
- Impact mode shows only the selected dependency path instead of dimming the entire workspace.
- The lifecycle layout now separates orchestration, transformation, storage, serving and consumption.
- Catalog, Asset Catalog, Config and Sensitivity groups start collapsed.
- Governance Overview uses a stronger workspace banner and clearer operational hierarchy.

## [1.0.0] - 2026-08-29

### Added

- Transitive upstream and downstream impact analysis in Map & lineage.
- Directional arrows and relationship labels for active lineage paths.
- Staged `Ingest & transform → Store → Model → Consume` layout.
- Minimap, zoom, fit, type, health and search controls.
- Item and object lineage modes for tables, columns, measures and consumers.
- Inspector tabs for summary, schema, effective access and run history.
- Deep-linkable lineage item, mode, filters and selected table.
- About page with version, build, repository, workspace and release information.

### Changed

- Polished the existing Fabric Atlas shell without replacing its navigation model.
- Improved responsive layouts across catalog, access, jobs, configuration and sensitivity views.
- Centralized lineage, object and status colors in the shared theme.
- Improved keyboard focus, semantic control states, scrollbars and reduced-motion behavior.

[1.9.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.9.0
[1.8.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.8.0
[1.7.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.7.0
[1.6.1]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.6.1
[1.6.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.6.0
[1.5.1]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.5.1
[1.5.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.5.0
[1.4.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.4.0
[1.3.1]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.3.1
[1.3.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.3.0
[1.2.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.2.0
[1.1.2]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.1.2
[1.1.1]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.1.1
[1.1.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.1.0
[1.0.0]: https://github.com/fredgis/FabricAtlas/releases/tag/v1.0.0
