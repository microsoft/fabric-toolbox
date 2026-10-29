export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface AtlasRelease {
  version: string;
  date: string;
  title: string;
  sections: ReleaseSection[];
}

export const REPOSITORY_URL =
  (import.meta.env.VITE_APP_REPOSITORY_URL as string | undefined) ??
  "https://github.com/fredgis/FabricAtlas";

export const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ??
  "2.7.0";

export const BUILD_COMMIT =
  (import.meta.env.VITE_APP_BUILD_COMMIT as string | undefined) ?? "development";

export const BUILD_DATE =
  (import.meta.env.VITE_APP_BUILD_DATE as string | undefined) ??
  new Date(0).toISOString();

export const SNAPSHOT_CONTRACT_ID = "snapshot-v1";
export const RAYFIN_SDK_VERSION =
  (import.meta.env.VITE_RAYFIN_SDK_VERSION as string | undefined) ??
  "1.36.2";
export const FUNCTIONS_API_VERSION = "1";

export const DEPLOYMENT_ID =
  `${APP_VERSION}:${SNAPSHOT_CONTRACT_ID}:${BUILD_COMMIT}:${BUILD_DATE}`;

function deploymentGeneration(value: string | undefined): string | undefined {
  const match = /^(\d+)\.(\d+)(?:\.|:|$)/.exec(value?.trim() ?? "");
  if (!match) return undefined;
  const contract =
    /^\d+\.\d+\.\d+:(snapshot-v\d+):/.exec(value?.trim() ?? "")?.[1] ??
    "legacy";
  return `${match[1]}.${match[2]}:${contract}`;
}

export function sameDeploymentGeneration(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) return left === right;
  const leftGeneration = deploymentGeneration(left);
  const rightGeneration = deploymentGeneration(right);
  return leftGeneration && rightGeneration
    ? leftGeneration === rightGeneration
    : left === right;
}

export const RELEASES: AtlasRelease[] = [
  {
    version: "2.7.0",
    date: "2026-10-29",
    title: "External lineage (OpenLineage)",
    sections: [
      {
        title: "New",
        items: [
          "External lineage page: import OpenLineage files (.json or .ndjson) produced outside Fabric, with per-file status, counts and reject reasons.",
          "Link to Fabric: datasets on a OneLake path of the workspace link automatically; administrators link the others to a Fabric item or mark them External.",
          "Map & lineage: External lineage switch shows external datasets and jobs next to the Fabric graph, and impact follows edges across the boundary.",
          "Download OpenLineage: export the workspace or the map selection as NDJSON, optionally with linked external datasets. Importing it back links every item by exact path.",
          "Typed export: each Fabric item carries a fabricAtlas_item facet, Eventstreams are STREAMING jobs and user data functions SERVICE jobs.",
          "Impact report lists the external datasets upstream and downstream of the item; the Map details panel can be collapsed completely.",
        ],
      },
    ],
  },
  {
    version: "2.6.4",
    date: "2026-10-28",
    title: "Reliable incremental sync",
    sections: [
      {
        title: "Improvements",
        items: [
          "Workspace Hub: scan mode and synchronization start only from Selected workspaces; the validated snapshot banner keeps the last run summary.",
          "Governance Center shows the tenant settings baseline captured by the snapshot.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Incremental runs keep object-level lineage of reused items, so Changes no longer reports false added and removed KQL tables and columns.",
          "Browser snapshots saved by earlier releases are ignored; the next run is a full scan.",
        ],
      },
    ],
  },
  {
    version: "2.6.3",
    date: "2026-10-28",
    title: "Sync mode, MCP page and layout fixes",
    sections: [
      {
        title: "Improvements",
        items: [
          "System → MCP page explains how to build and configure the read-only Atlas MCP server and copies a ready mcp.json.",
          "Full or Incremental is one shared choice for Synchronize now and Sync selected; a notice names the workspaces that must run a full scan and why.",
          "Collection status uses plain section names and explains each missing section, including schema-enabled Lakehouses.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Run duration covers the whole synchronization instead of the first stage.",
          "Workspace Hub: Selected workspaces full width, Recent runs before Schedule, equal-height cards below.",
          "Header domain chip, sidebar My items alignment and rounded coverage percentages.",
          "Fabric policies explain why enforcement is unknown without a Fabric administrator sign-in.",
        ],
      },
    ],
  },
  {
    version: "2.6.2",
    date: "2026-10-28",
    title: "Domain posture and mockup alignment",
    sections: [
      {
        title: "Improvements",
        items: [
          "Domain posture: Governance Center coverage by domain, domain directory with parent/child rollups and a domain filter showing domain names.",
          "Workspace domain banner, incremental/full scan mode control and snapshot JSON export.",
          "My items view, findings explanations, Fabric policies card, network protection card and OneLake role filters aligned with the v2.5/v2.6 mockups.",
          "Command palette matches descriptions; suggested object descriptions are drafted for findings on undocumented objects.",
          "Posture radar maps Microsoft Health, Protect and Trust pillars to Fabric signal names.",
        ],
      },
    ],
  },
  {
    version: "2.6.1",
    date: "2026-10-28",
    title: "Governance evidence fixes",
    sections: [
      {
        title: "Fixes",
        items: [
          "Admin-only sections (domains, tags, tenant settings) now use the signed-in Fabric administrator's token, so domain names, domain posture and tenant drift are collected.",
          "Synchronization offers an Incremental or Full mode; incremental runs re-enrich only modified items and keep domain names from the previous snapshot.",
          "The Fabric domain filter appears as soon as a workspace belongs to a domain, and unnamed domains no longer show a full GUID.",
          "The posture radar shows the Microsoft Health, Protect and Trust pillars and the Fabric signals behind them.",
          "Catalog search matches item, table, column and measure descriptions and shows the object path.",
          "MCP governance findings return the domain name, path and parent.",
          "Security: UDF URLs are validated, governance tokens are acquired separately and webhook payloads are bounded.",
        ],
      },
      {
        title: "Upgrade",
        items: [
          "Run one synchronization as a Fabric administrator to collect domain names and admin-only sections.",
        ],
      },
    ],
  },
  {
    version: "2.6.0",
    date: "2026-10-28",
    title: "Unified governance gaps",
    sections: [
      {
        title: "Domains and catalog",
        items: [
          "Fabric domain names appear in the overview, catalog and MCP, with per-domain posture, coverage and a global domain filter.",
          "The catalog adds facets, tag scope chips, description snippets in search and a Request access link.",
          "My items scopes the app to items you own; snapshot export downloads the current inventory and findings.",
        ],
      },
      {
        title: "New governance signals",
        items: [
          "New rules: workspace without Admin, unlabeled against the domain default label, inactive items of any type, public workspace network access and sensitive external shares.",
          "Each finding has a Why panel and a deterministic priority score.",
          "Changes shows tenant settings drift; access review filters by principal type and role and lists OneLake data access roles with RLS/CLS.",
          "Policies & AI shows Fabric policies (preview) with enforcement Unknown and lists cataloged policy items.",
        ],
      },
      {
        title: "Operations",
        items: [
          "Incremental sync plans only changed workspaces and reports run mode counters.",
          "Optional Teams webhook (ATLAS_TEAMS_WEBHOOK_URL secret) posts new critical findings.",
          "Optional AI description suggestions (ATLAS_AI_* secrets, off by default) send names and schema only, never data values.",
          "Open in Fabric cards link to Govern and Admin monitoring; the MCP server exposes governance findings.",
        ],
      },
      {
        title: "Upgrade",
        items: [
          "Run one guided synchronization per workspace to collect the new evidence and start a new radar baseline.",
        ],
      },
    ],
  },
  {
    version: "2.2.0",
    date: "2026-10-28",
    title: "OneLake catalog alignment",
    sections: [
      {
        title: "Findings to action",
        items: [
          "Every finding opens the affected item or workspace in Fabric with Fix in Fabric.",
          "My items narrows the action queue to items whose recorded owner email matches your account.",
          "Each finding group shows its OneLake catalog pillar: Health, Protect or Trust.",
          "Export JSON downloads the filtered action queue with severity, pillar, owner and Fabric link.",
          "Teams card downloads an Adaptive Card with the posture and the top findings. Atlas stores no webhook.",
        ],
      },
      {
        title: "New governance rules",
        items: [
          "Certified items without a description or a sensitivity label are reported.",
          "Endorsed items without a run for 90 days and endorsed semantic models with undocumented tables, columns or measures are reported.",
          "Workspaces confirmed without a Fabric domain are reported; the workspace page shows the domain ID, no domain or not collected.",
        ],
      },
      {
        title: "Upgrade",
        items: [
          "Run one guided synchronization per workspace to collect domains and start a new radar baseline.",
          "Certified items without a label now use the certified-missing-sensitivity rule instead of missing-sensitivity.",
        ],
      },
    ],
  },
  {
    version: "2.1.3",
    date: "2026-10-17",
    title: "Notebook lineage fallback",
    sections: [
      {
        title: "Object Lineage",
        items: [
          "Notebooks with resolved literal references keep their detailed object graph.",
          "Notebooks whose object names are built dynamically now show their verified item-level upstream and downstream lineage instead of an empty canvas.",
          "The UI states when direct notebook object references were not resolved and never guesses dynamic objects.",
        ],
      },
    ],
  },
  {
    version: "2.1.2",
    date: "2026-10-17",
    title: "Stable lineage and notebook dependencies",
    sections: [
      {
        title: "Lineage interaction",
        items: [
          "Item-type filters retain matching items with their connected upstream and downstream context.",
          "Impact mode keeps the complete layout as its coordinate source, so the selected node and viewport no longer jump.",
        ],
      },
      {
        title: "Governance posture",
        items: [
          "The six radar pillars always form one closed green polygon.",
          "Unavailable scores remain labelled N/A and are anchored at zero instead of breaking the shape.",
        ],
      },
      {
        title: "Notebook object lineage",
        items: [
          "Rayfin Functions project direct literal notebook table and OneLake table-path references with read and write direction.",
          "Object Lineage displays the verified references while source code, cells, SQL text, secrets and dynamic expressions remain outside the snapshot.",
        ],
      },
    ],
  },
  {
    version: "2.1.1",
    date: "2026-10-17",
    title: "Reliable offboarding and workspace evidence",
    sections: [
      {
        title: "Departure Pack",
        items: [
          "Workspace-wide ownership coverage now separates documented ownership from items that still require manual review.",
          "Owner or Edit access and configured-by or modified-by references appear as distinct review evidence without being relabelled as business ownership.",
          "Markdown, reassignment and access exports retain evidence categories, limitations and downstream consumers.",
        ],
      },
      {
        title: "Ontology metadata",
        items: [
          "Ontology 2.0 TMDL definitions project bounded entity, property, key, time-series and relationship metadata.",
          "The collector recognizes supporting TMDL parts without returning expressions, rules, source rows or secrets.",
        ],
      },
      {
        title: "Workspace operations",
        items: [
          "Workspace Hub derives every scoped workspace status from persisted manifests and SyncRun evidence instead of the latest browser queue alone.",
          "Failed and unfinished runs retain the last valid snapshot, and known status survives workspace switches, later batches and partial refreshes.",
        ],
      },
    ],
  },
  {
    version: "2.1.0",
    date: "2026-10-17",
    title: "Complete Semantic Model object lineage",
    sections: [
      {
        title: "Lineage correctness",
        items: [
          "Semantic Model Object Lineage exposes the complete table inventory through bounded multi-table blocks, whole-model search and stable table-qualified object identities.",
          "Browser and Function DAX parsing now preserve common RETURN and NOT measure references, while X-Ray and impact analysis share one dependency index.",
          "Calculated-column expressions, expression coverage, model relationships and static dependency evidence survive synchronization and snapshot hydration.",
        ],
      },
      {
        title: "Navigation and performance",
        items: [
          "Object Lineage, X-Ray, Asset Catalog and global search cross-link to the same selected measure or column.",
          "The governance radar uses an accessible SVG instead of the Vega runtime, and application views load by route with snapshot-derived result caching.",
          "Local diagnostics report hydration, synchronization and lineage build timings without external telemetry.",
        ],
      },
      {
        title: "Operations and security",
        items: [
          "Snapshot hydration uses larger cursor pages and starts independent marker and SyncRun reads together.",
          "An optional break-glass synchronizer can publish snapshots through the same database-enforced policy boundary.",
          "CSV export neutralizes leading tab and carriage-return cells, and deployment redirect configuration is environment-scoped.",
        ],
      },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-10-03",
    title: "Rayfin-first multi-workspace governance",
    sections: [
      {
        title: "Collection and scope",
        items: [
          "Typed Rayfin Functions collect core inventory, definitions, Power BI structure, Item Relations, KQL structure, SQL catalogs, source provenance and policy evidence.",
          "Python compatibility is limited to the Power BI admin scanner, PBIR-Legacy pages, Kusto live metadata and explicit rollback.",
          "Selected workspaces publish independent manifests and switch through one shared active-workspace control.",
        ],
      },
      {
        title: "Lineage and governance",
        items: [
          "Atlas and Item Relations Preview are separate graph sources with stable source-to-consumer layouts, focused impact and complete reset behavior.",
          "Evidence, Changes and Semantic X-Ray expose relation provenance, historical deltas and resolved DAX consumers.",
          "Coverage and Policies & AI keep collected, unavailable, unsupported and not-applicable evidence distinct.",
        ],
      },
      {
        title: "Access and operations",
        items: [
          "Access Review adds read-only What-if scenarios while keeping restriction layers and evidence limits explicit.",
          "Jobs & health separates observed failures from inferred downstream impact and documents portal-only monitoring sources.",
          "The optional local Atlas MCP provides deterministic read-only tools over validated snapshots.",
        ],
      },
    ],
  },
  {
    version: "1.9.2",
    date: "2026-08-30",
    title: "Audit closure and access transparency",
    sections: [
      {
        title: "Collaboration correctness",
        items: [
          "Team notes preserve the authenticated session email as the author label through persistence and reload.",
          "Client-selected catalog labels cannot replace the authenticated note author.",
          "Comment creation binds both the authenticated email and subject to the stored author identity.",
          "The guided sync gate tells blocked users which configured synchronizer account to contact.",
        ],
      },
      {
        title: "Documented boundaries",
        items: [
          "README, architecture, data-model, installation, security and UDF documentation now state that the synchronized catalog is shared with the complete authenticated app audience.",
          "The append-only note model and user-scoped personal governance records are documented explicitly.",
          "Build documentation records the current bundle tradeoff and confirms that strict TypeScript checking runs without noCheck.",
        ],
      },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-08-30",
    title: "Immediate sync refresh and Radar baseline",
    sections: [
      {
        title: "Synchronization",
        items: [
          "Every successful sync replaces the active catalog and history immediately, then remounts the current view against the new snapshot.",
          "Fresh snapshots retain their deployment identity so Radar no longer resets to a baseline after every synchronization.",
          "Patch releases preserve the existing snapshot contract and do not force an unnecessary deployment sync.",
          "This deployment establishes the explicit snapshot-v1 marker through one guided synchronization without deleting validated history.",
        ],
      },
      {
        title: "Radar & Asset Catalog",
        items: [
          "The first validated snapshot now arms a visible Radar baseline with the monitored target signals.",
          "Non-risky workspace changes remain visible from the clear Radar state and open the exact adjacent comparison.",
          "Schema-capable Fabric items remain listed in Asset Catalog even when Fabric exposes no tables, views, columns or measures yet.",
        ],
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-08-30",
    title: "Governance intelligence and DAX object lineage",
    sections: [
      {
        title: "Governance intelligence",
        items: [
          "Governance Radar isolates new high-priority findings and dangerous changes, with personal acknowledge or mute actions and a monitored-goal watermark when the latest delta is clear.",
          "Posture targets score documentation, ownership, sensitivity, access, lineage and operations without treating unavailable evidence as zero.",
          "Departure packs combine ownership, orphan risk, blast radius, reassignment guidance and exportable evidence.",
        ],
      },
      {
        title: "Object lineage & experience",
        items: [
          "DAX references prove measure dependencies to real synchronized columns and measures, with inferred source hops clearly distinguished.",
          "Asset Catalog and impact reports expose Depends on and Used by evidence at object granularity.",
          "First sync uses a live progress donut, Search copy remains readable, and UUID-like workspace capacity IDs stay hidden.",
        ],
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-08-30",
    title: "Faster history, lineage and responsive operations",
    sections: [
      {
        title: "Scale & reliability",
        items: [
          "Trusted snapshot retention keeps a configurable history window and retries partial cleanup safely.",
          "Manifest summaries load governance trends immediately while detailed comparisons hydrate only when selected.",
          "Lineage traversal and layout reuse adjacency indexes instead of rescanning the complete graph.",
        ],
      },
      {
        title: "Responsive experience",
        items: [
          "Access Review renders one keyboard-navigable responsive ledger instead of duplicate desktop and mobile trees.",
          "Jobs history becomes a mobile timeline and an aligned desktop grid from the same semantic content.",
          "Large grouped collections use Chromium render containment and active job filters become individually removable.",
        ],
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-08-30",
    title: "Shareable and accessible workspace navigation",
    sections: [
      {
        title: "Navigation & productivity",
        items: [
          "Catalog, governance, access, jobs and workspace context now remain in shareable URLs.",
          "Overview signals open pre-filtered evidence, while active searches reveal matching grouped content.",
          "Global search is indexed once per snapshot and debounced without allowing stale selection.",
        ],
      },
      {
        title: "Accessible experience",
        items: [
          "Dialogs and mobile navigation manage focus, Escape dismissal, background inerting and restoration.",
          "Governance, lineage and workspace tabs support full keyboard navigation with linked panels.",
          "Skip navigation, route titles, live sync status, reduced motion and textual lineage evidence improve assistive access.",
        ],
      },
    ],
  },
  {
    version: "1.6.1",
    date: "2026-08-30",
    title: "Authoritative lineage and faster snapshots",
    sections: [
      {
        title: "Lineage",
        items: [
          "Documented Dataflow, Datamart and Semantic Model dependencies are mapped by immutable Fabric IDs.",
          "Authoritative scanner edges preserve source-to-consumer direction across visual stages.",
          "Malformed or cross-workspace lineage references fail closed.",
        ],
      },
      {
        title: "Synchronization",
        items: [
          "Snapshot rows are written in bounded batches of eight requests.",
          "Every in-flight batch is drained before failure, while the sync audit and workspace manifest remain strictly last.",
        ],
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-08-30",
    title: "Trusted metadata synchronization",
    sections: [
      {
        title: "Reliability & security",
        items: [
          "The versioned sync contract records required, optional and metadata-capability status for every validated snapshot.",
          "UDF requests, retries, response reads and payload size share bounded execution limits below the Fabric public endpoint ceiling.",
          "Server-side writer filters and Rayfin create policies restrict snapshot publication to the configured synchronizer.",
        ],
      },
      {
        title: "Metadata accuracy",
        items: [
          "Governance views distinguish metadata that was not collected from a real missing value or zero.",
          "Fabric IDs stabilize principal access history, while legacy email and name references remain compatible.",
          "Documented owner provenance, raw endorsement, sensitivity-label IDs and tag IDs are preserved without storing business data.",
        ],
      },
    ],
  },
  {
    version: "1.5.1",
    date: "2026-08-30",
    title: "Fabric UX visual alignment",
    sections: [
      {
        title: "Experience",
        items: [
          "Light mode is now the default, matching the surrounding Fabric portal.",
          "Shell, navigation, cards, dialogs, filters and first sync follow Fluent 2 surface, spacing and elevation patterns.",
          "Fabric interaction colors are paired with a restrained Atlas spectrum for lineage and product identity.",
        ],
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-08-29",
    title: "Governance Center and workspace intelligence",
    sections: [
      {
        title: "Governance",
        items: [
          "Governance Center groups actionable findings, snapshot changes, trends and metadata coverage.",
          "Access Review provides additive permission evidence, personal review decisions and CSV export.",
          "Validated snapshot history powers change detection without weakening last-known-good fallback.",
        ],
      },
      {
        title: "Productivity",
        items: [
          "Global Ctrl+K search opens items, schema objects, principals, jobs, configuration and notes.",
          "Impact reports export verified upstream and downstream evidence for items and schema objects.",
          "Personal saved views persist governance, access and job filters through Rayfin.",
        ],
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-08-29",
    title: "Reliable snapshots and deep inventory",
    sections: [
      {
        title: "Reliability",
        items: [
          "Validated immutable snapshots preserve the last complete workspace index.",
          "Hydration rejects incomplete or malformed rows instead of emptying the application.",
          "Synchronization identity and token handling were hardened after OWASP review.",
        ],
      },
      {
        title: "Inventory & experience",
        items: [
          "Expanded Lakehouse, Warehouse, SQL Database, Semantic Model and Report metadata coverage.",
          "Lineage supports group selection, group movement, reliable reset and wider paths.",
          "Governance Overview was simplified around one hero and three high-signal sections.",
        ],
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-08-29",
    title: "Interactive object lineage",
    sections: [
      {
        title: "Object mode",
        items: [
          "Object nodes can now be dragged and arranged like item nodes.",
          "Clicking an object highlights upstream and downstream paths in place.",
          "Connected object edges use the same animated lineage treatment as item mode.",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-29",
    title: "Workspace Hub and open-source cleanup",
    sections: [
      {
        title: "Experience",
        items: [
          "Configuration and team notes merged into one Workspace Hub.",
          "Impact mode now starts disabled and lineage edges remain visually clean.",
          "Deployment sync details align at the bottom without exposing the workspace ID.",
          "About reduced to the open-source project essentials.",
        ],
      },
      {
        title: "Repository",
        items: [
          "Removed the unused analytics starter, preview assets and Fabric visual dependencies.",
          "Moved community policy files into .github and added focused contributor guidance.",
          "Rebuilt the README as the public open-source project landing page.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-29",
    title: "Workspace experience refresh",
    sections: [
      {
        title: "Catalog & governance",
        items: [
          "Catalog and Asset Catalog redesigned for faster scanning and clearer master-detail navigation.",
          "Access and Sensitivity rebuilt as focused governance and risk workspaces.",
          "Grouped content remains collapsed until users choose the detail they need.",
        ],
      },
      {
        title: "Operations & project",
        items: [
          "Jobs, Config and Comments redesigned with stronger operational hierarchy.",
          "About simplified into an open-source project page with clone, source and release actions.",
          "Sidebar navigation grouped into Explore, Govern, Operate and System sections.",
        ],
      },
    ],
  },
  {
    version: "1.1.2",
    date: "2026-08-29",
    title: "Animated sync and overview heroes",
    sections: [
      {
        title: "First sync",
        items: [
          "Rebuilt the deployment sync screen as a full-width animated hero.",
          "Added an animated topology preview, live estate metrics and staged synchronization panel.",
          "Added robust workspace-name fallbacks for deployment refreshes.",
        ],
      },
      {
        title: "Overview",
        items: [
          "Enhanced the governance command banner with animated depth and a health dial.",
          "Removed named max-width utility collisions from hero and authentication surfaces.",
        ],
      },
    ],
  },
  {
    version: "1.1.1",
    date: "2026-08-29",
    title: "Deployment sync and stable selection",
    sections: [
      {
        title: "Synchronization",
        items: [
          "Every newly deployed build opens on its synchronization screen once.",
          "Completing the sync records the exact build locally before opening the dashboard.",
        ],
      },
      {
        title: "Lineage",
        items: [
          "Selecting a node highlights it without recalculating or moving the current layout.",
          "Focus selection is now an explicit action when a new centered path is wanted.",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-29",
    title: "Governance command center",
    sections: [
      {
        title: "Experience",
        items: [
          "Dark theme by default with a persistent light-theme preference.",
          "First-sync command screen with staged progress and configuration status.",
          "Live synchronization progress in the application header.",
          "Governance overview redesigned around a workspace command banner.",
        ],
      },
      {
        title: "Navigation",
        items: [
          "Lineage direction normalized from source to consumer.",
          "Focused lineage paths and connected-component layout reduce graph clutter.",
          "Catalog, assets, configuration and sensitivity groups start collapsed.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-29",
    title: "First public release",
    sections: [
      {
        title: "Lineage",
        items: [
          "Transitive upstream and downstream impact analysis.",
          "Directional arrows, relationship labels, staged layout, minimap, zoom and filters.",
          "Item and object lineage modes with tables, columns, measures and consumers.",
          "Tabbed inspector for summary, schema, access and run history.",
        ],
      },
      {
        title: "Experience",
        items: [
          "Responsive layouts that preserve the existing Fabric Atlas navigation.",
          "Keyboard focus, accessible interactive states and reduced-motion support.",
          "Deep-linkable lineage selection, filters and object context.",
          "Project information page with version, source and release history.",
        ],
      },
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0];

export function releaseUrl(version = APP_VERSION): string {
  return `${REPOSITORY_URL}/releases/tag/v${version}`;
}
