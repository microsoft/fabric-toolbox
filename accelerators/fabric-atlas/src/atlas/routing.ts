import type {
  AtlasFocusRequest,
  AtlasNavigation,
  GovernanceSection,
  Tab,
} from "./navigation";
import type { SavedViewFilters } from "./saved-views";
import { ITEM_TYPES } from "./model";
import { ASSET_OBJECT_KINDS } from "./catalog-objects";

interface AtlasLocation {
  hash: string;
  pathname: string;
  search: string;
}

const TABS = new Set<Tab>([
  "overview",
  "map",
  "catalog",
  "assets",
  "governance",
  "access",
  "jobs",
  "workspace",
  "about",
]);

const KNOWN_KEYS = new Set([
  "lineage",
  "item",
  "q",
  "type",
  "health",
  "impact",
  "table",
  "source",
  "objectKind",
  "inspector",
]);
const KNOWN_PREFIXES = [
  "catalog.",
  "assets.",
  "governance.",
  "access.",
  "jobs.",
  "workspace.",
];
const ASSET_KINDS = new Set<string>(ASSET_OBJECT_KINDS);
const GOVERNANCE_SECTIONS = new Set([
  "findings",
  "changes",
  "history",
  "coverage",
  "posture",
]);
const GOVERNANCE_SEVERITIES = new Set([
  "all",
  "critical",
  "high",
  "medium",
  "low",
]);
const GOVERNANCE_CATEGORIES = new Set([
  "all",
  "access",
  "metadata",
  "operations",
  "lineage",
]);
const CHANGE_DOMAINS = new Set([
  "all",
  "item",
  "schema",
  "access",
  "sensitivity",
  "lineage",
  "job",
]);
const HISTORY_METRICS = new Set([
  "items",
  "labels",
  "externalPrincipals",
  "failedJobs",
  "stale",
  "failing",
  "lineage",
  "brokenEdges",
  "tables",
  "columns",
  "measures",
]);
const ACCESS_MODES = new Set(["matrix", "principals"]);
const ACCESS_LEVELS = new Set(["all", "owner", "edit", "view", "none"]);
const ACCESS_ORIGINS = new Set(["all", "workspace", "item", "mixed"]);
const ACCESS_RISKS = new Set([
  "all",
  "flagged",
  "external",
  "broad",
  "servicePrincipal",
  "admin",
  "resolution",
]);
const JOB_STATUSES = new Set([
  "all",
  "completed",
  "failed",
  "running",
  "cancelled",
]);
const WORKSPACE_SECTIONS = new Set(["configuration", "notes"]);
const POSTURE_PILLARS = new Set([
  "documentation",
  "ownership",
  "sensitivity",
  "access",
  "lineage",
  "operations",
]);

function request(
  values: Omit<AtlasFocusRequest, "requestId">,
): AtlasFocusRequest | undefined {
  const populated = Object.values(values).some((value) => {
    if (value == null) return false;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return String(value).length > 0;
  });
  return populated ? { requestId: crypto.randomUUID(), ...values } : undefined;
}

function value(params: URLSearchParams, key: string): string | undefined {
  const result = params.get(key)?.trim();
  return result || undefined;
}

function allowed(
  params: URLSearchParams,
  key: string,
  values: ReadonlySet<string>,
): string | undefined {
  const result = value(params, key);
  return result && values.has(result) ? result : undefined;
}

function filters(
  entries: Array<[string, string | undefined]>,
): SavedViewFilters | undefined {
  const result = Object.fromEntries(
    entries.filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return Object.keys(result).length ? result : undefined;
}

function parseTab(hash: string): {
  tab: Tab;
  legacySection?: "configuration" | "notes" | "coverage";
} {
  const raw = hash.replace(/^#/, "").split("?")[0];
  if (raw === "config") return { tab: "workspace", legacySection: "configuration" };
  if (raw === "comments") return { tab: "workspace", legacySection: "notes" };
  if (raw === "sensitivity") return { tab: "governance", legacySection: "coverage" };
  const tab = raw as Tab;
  return { tab: TABS.has(tab) ? tab : "overview" };
}

export function parseAtlasLocation(
  location: Pick<AtlasLocation, "hash" | "search">,
): AtlasNavigation {
  const params = new URLSearchParams(location.search);
  const { tab, legacySection } = parseTab(location.hash);

  if (tab === "map") {
    const hasMapState = [
      "lineage",
      "item",
      "q",
      "type",
      "health",
      "impact",
      "table",
      "source",
      "objectKind",
      "inspector",
    ].some((key) => params.has(key));
    return {
      tab,
      focus: hasMapState
        ? { requestId: crypto.randomUUID() }
        : undefined,
    };
  }
  if (tab === "catalog") {
    return {
      tab,
      focus: request({
        itemId: value(params, "catalog.item"),
        query: value(params, "catalog.q"),
        filters: filters([
          [
            "type",
            allowed(
              params,
              "catalog.type",
              new Set(Object.keys(ITEM_TYPES)),
            ),
          ],
          [
            "posturePillar",
            allowed(params, "catalog.posture", POSTURE_PILLARS),
          ],
        ]),
      }),
    };
  }
  if (tab === "assets") {
    const objectName = value(params, "assets.object");
    const filterKind = allowed(params, "assets.kind", ASSET_KINDS);
    const objectKind = allowed(
      params,
      "assets.objectKind",
      ASSET_KINDS,
    );
    return {
      tab,
      focus: request({
        itemId: value(params, "assets.item"),
        tableName: value(params, "assets.table"),
        objectName,
        objectId: value(params, "assets.objectId"),
        objectKind: objectName
          ? (objectKind as AtlasFocusRequest["objectKind"] | undefined)
          : undefined,
        query: value(params, "assets.q"),
        filters: filters([["kind", filterKind]]),
      }),
    };
  }
  if (tab === "governance") {
    const section =
      (legacySection as GovernanceSection | undefined) ??
      (allowed(
        params,
        "governance.section",
        GOVERNANCE_SECTIONS,
      ) as GovernanceSection | undefined);
    return {
      tab,
      focus: request({
        governanceSection: section,
        filters: filters([
          ["section", section],
          ["search", value(params, "governance.q")],
          [
            "severity",
            allowed(
              params,
              "governance.severity",
              GOVERNANCE_SEVERITIES,
            ),
          ],
          [
            "category",
            allowed(
              params,
              "governance.category",
              GOVERNANCE_CATEGORIES,
            ),
          ],
          ["changeSearch", value(params, "governance.changeq")],
          [
            "domain",
            allowed(params, "governance.domain", CHANGE_DOMAINS),
          ],
          [
            "metric",
            allowed(params, "governance.metric", HISTORY_METRICS),
          ],
          [
            "pillar",
            allowed(params, "governance.pillar", POSTURE_PILLARS),
          ],
          ["currentSnapshotId", value(params, "governance.current")],
          ["previousSnapshotId", value(params, "governance.baseline")],
        ]),
      }),
    };
  }
  if (tab === "access") {
    return {
      tab,
      focus: request({
        itemId: value(params, "access.item"),
        principalId: value(params, "access.principal"),
        query: value(params, "access.q"),
        filters: filters([
          ["mode", allowed(params, "access.mode", ACCESS_MODES)],
          ["search", value(params, "access.q")],
          [
            "accessLevel",
            allowed(params, "access.level", ACCESS_LEVELS),
          ],
          ["origin", allowed(params, "access.origin", ACCESS_ORIGINS)],
          ["risk", allowed(params, "access.risk", ACCESS_RISKS)],
        ]),
      }),
    };
  }
  if (tab === "jobs") {
    return {
      tab,
      focus: request({
        itemId: value(params, "jobs.item"),
        jobId: value(params, "jobs.job"),
        query: value(params, "jobs.q"),
        filters: filters([
          ["search", value(params, "jobs.q")],
          ["status", allowed(params, "jobs.status", JOB_STATUSES)],
        ]),
      }),
    };
  }
  if (tab === "workspace") {
    return {
      tab,
      focus: request({
        itemId: value(params, "workspace.item"),
        commentId: value(params, "workspace.comment"),
        workspaceSection:
          legacySection === "notes" || legacySection === "configuration"
            ? legacySection
            : (allowed(
                params,
                "workspace.section",
                WORKSPACE_SECTIONS,
              ) as
                | "configuration"
                | "notes"
                | undefined),
      }),
    };
  }
  return { tab };
}

function filterValue(
  focus: AtlasFocusRequest | undefined,
  key: string,
): string | undefined {
  const value = focus?.filters?.[key];
  return typeof value === "string" && value !== "all" && value.trim()
    ? value.trim()
    : undefined;
}

function set(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value) params.set(key, value);
}

export function urlForNavigation(
  location: Pick<AtlasLocation, "pathname" | "search">,
  navigation: AtlasNavigation,
): string {
  const params = new URLSearchParams(location.search);
  for (const key of [...params.keys()]) {
    if (
      KNOWN_KEYS.has(key) ||
      KNOWN_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      params.delete(key);
    }
  }
  const focus = navigation.focus;

  if (navigation.tab === "catalog") {
    set(params, "catalog.q", focus?.query ?? filterValue(focus, "search"));
    set(params, "catalog.type", filterValue(focus, "type"));
    set(params, "catalog.posture", filterValue(focus, "posturePillar"));
    set(params, "catalog.item", focus?.itemId);
  } else if (navigation.tab === "assets") {
    set(params, "assets.q", focus?.query);
    set(params, "assets.kind", filterValue(focus, "kind"));
    set(params, "assets.objectKind", focus?.objectKind);
    set(params, "assets.item", focus?.itemId);
    set(params, "assets.table", focus?.tableName);
    set(params, "assets.object", focus?.objectName);
    set(params, "assets.objectId", focus?.objectId);
  } else if (navigation.tab === "governance") {
    set(
      params,
      "governance.section",
      focus?.governanceSection ?? filterValue(focus, "section"),
    );
    set(params, "governance.q", filterValue(focus, "search"));
    set(params, "governance.severity", filterValue(focus, "severity"));
    set(params, "governance.category", filterValue(focus, "category"));
    set(params, "governance.changeq", filterValue(focus, "changeSearch"));
    set(params, "governance.domain", filterValue(focus, "domain"));
    set(params, "governance.metric", filterValue(focus, "metric"));
    set(params, "governance.pillar", filterValue(focus, "pillar"));
    set(
      params,
      "governance.current",
      filterValue(focus, "currentSnapshotId"),
    );
    set(
      params,
      "governance.baseline",
      filterValue(focus, "previousSnapshotId"),
    );
  } else if (navigation.tab === "access") {
    set(params, "access.mode", filterValue(focus, "mode"));
    set(params, "access.q", focus?.query ?? filterValue(focus, "search"));
    set(params, "access.level", filterValue(focus, "accessLevel"));
    set(params, "access.origin", filterValue(focus, "origin"));
    set(params, "access.risk", filterValue(focus, "risk"));
    set(params, "access.item", focus?.itemId);
    set(params, "access.principal", focus?.principalId);
  } else if (navigation.tab === "jobs") {
    set(params, "jobs.q", focus?.query ?? filterValue(focus, "search"));
    set(params, "jobs.status", filterValue(focus, "status"));
    set(params, "jobs.item", focus?.itemId);
    set(params, "jobs.job", focus?.jobId);
  } else if (navigation.tab === "workspace") {
    set(params, "workspace.section", focus?.workspaceSection);
    set(params, "workspace.item", focus?.itemId);
    set(params, "workspace.comment", focus?.commentId);
  }

  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}#${navigation.tab}`;
}
