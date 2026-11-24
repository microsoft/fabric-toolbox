import type { GovernanceEvidence } from "./governance-evidence";
import type { Item } from "./model";

// Catalog facets (#68) and tag scope resolution (#69). Facets combine with
// AND, values inside one facet with OR. A signal Atlas could not read is the
// value "unknown", never silently dropped or counted as healthy.

export const CATALOG_FACETS = ["domain", "tag", "endorsement", "label"] as const;
export type CatalogFacetKey = (typeof CATALOG_FACETS)[number];
export type CatalogFacetSelection = Partial<Record<CatalogFacetKey, string[]>>;

export const UNKNOWN_FACET_VALUE = "unknown";
export const NO_DOMAIN_FACET_VALUE = "unassigned";
export const NO_TAGS_FACET_VALUE = "__none";

export const CATALOG_FACET_LABELS: Record<CatalogFacetKey, string> = {
  domain: "Domain",
  tag: "Tags",
  endorsement: "Endorsement",
  label: "Sensitivity label",
};

export type TagScope = "tenant" | "domain" | "unknown";

export interface ResolvedTag {
  key: string;
  label: string;
  scope: TagScope;
  domainName?: string;
  hint: string;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export type CatalogFacets = Record<CatalogFacetKey, FacetValue[]>;

export interface FacetContext {
  workspace: { fabricDomainId?: string };
  governanceEvidence?: GovernanceEvidence;
}

function domainNames(evidence: GovernanceEvidence | undefined): Map<string, string> {
  const names = new Map<string, string>();
  if (evidence?.domains.status.status !== "complete") return names;
  for (const domain of evidence.domains.entries) names.set(domain.id.toLowerCase(), domain.displayName);
  return names;
}

function tagHint(scope: TagScope, domainName: string | undefined, definitionsReadable: boolean): string {
  if (scope === "tenant") return "Tenant";
  if (scope === "domain") return `Domain: ${domainName ?? "Unknown domain"}`;
  return definitionsReadable
    ? "Scope unknown: tag not in the collected definitions"
    : "Scope unknown: tag definitions not readable";
}

/**
 * Resolves the tags applied to an item against the admin tag definitions.
 * Without readable definitions the tag names are kept and the scope is Unknown.
 */
export function resolveItemTags(
  item: Pick<Item, "tags" | "tagIds">,
  evidence: GovernanceEvidence | undefined,
): ResolvedTag[] {
  const definitionsReadable = evidence?.tags.status.status === "complete";
  const byId = new Map<string, GovernanceEvidence["tags"]["entries"][number]>();
  const byName = new Map<string, GovernanceEvidence["tags"]["entries"][number]>();
  if (definitionsReadable) {
    for (const tag of evidence.tags.entries) {
      byId.set(tag.id.toLowerCase(), tag);
      byName.set(tag.displayName.trim().toLowerCase(), tag);
    }
  }
  const domains = domainNames(evidence);
  const result = new Map<string, ResolvedTag>();
  const add = (label: string, definition: GovernanceEvidence["tags"]["entries"][number] | undefined) => {
    const key = label.trim().toLowerCase();
    if (!key || result.has(key)) return;
    const scope: TagScope = definition?.scope ?? "unknown";
    const domainName =
      scope === "domain" && definition?.domainId ? domains.get(definition.domainId.toLowerCase()) : undefined;
    result.set(key, {
      key,
      label: label.trim(),
      scope,
      ...(domainName ? { domainName } : {}),
      hint: tagHint(scope, domainName, definitionsReadable),
    });
  };
  for (const id of item.tagIds ?? []) {
    const definition = byId.get(id.toLowerCase());
    if (definition) add(definition.displayName, definition);
  }
  for (const name of item.tags) add(name, byName.get(name.trim().toLowerCase()));
  // Names and IDs come from the same tag entries; only IDs beyond the
  // collected names lack a readable name.
  const missingNames = (item.tagIds?.length ?? 0) - item.tags.length;
  if (missingNames > 0) {
    const unresolvedIds = (item.tagIds ?? []).filter((id) => !byId.has(id.toLowerCase()));
    for (const id of unresolvedIds.slice(0, missingNames)) add(`Tag ${id.slice(0, 8)}`, undefined);
  }
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function endorsementValue(item: Item): { value: string; label: string } {
  if (item.endorsementMetadataAvailable === false) return { value: UNKNOWN_FACET_VALUE, label: "Unknown" };
  const raw = (item.endorsementRaw ?? item.endorsement).trim().toLowerCase().replace(/[\s_-]/g, "");
  if (raw === "certified") return { value: "certified", label: "Certified" };
  if (raw === "promoted") return { value: "promoted", label: "Promoted" };
  if (raw === "masterdata") return { value: "masterdata", label: "Master data" };
  if (!raw || raw === "none") return { value: "none", label: "None" };
  return { value: raw, label: item.endorsementRaw ?? raw };
}

function labelValue(item: Item): { value: string; label: string } {
  if (item.sensitivity) return { value: item.sensitivity.trim().toLowerCase(), label: item.sensitivity.trim() };
  if (item.sensitivityLabelId) return { value: `id:${item.sensitivityLabelId.toLowerCase()}`, label: "Label applied" };
  if (item.sensitivityMetadataAvailable === false) return { value: UNKNOWN_FACET_VALUE, label: "Unknown" };
  return { value: "unlabeled", label: "Unlabeled" };
}

function domainValue(context: FacetContext): { value: string; label: string } {
  const id = context.workspace.fabricDomainId;
  if (!id) return { value: UNKNOWN_FACET_VALUE, label: "Unknown" };
  if (id === NO_DOMAIN_FACET_VALUE) return { value: NO_DOMAIN_FACET_VALUE, label: "No domain" };
  return { value: id.toLowerCase(), label: domainNames(context.governanceEvidence).get(id.toLowerCase()) ?? "Unnamed domain" };
}

/** Facet values of one item; an item has exactly one value per facet except tags. */
export function itemFacetValues(item: Item, context: FacetContext): Record<CatalogFacetKey, Array<{ value: string; label: string }>> {
  const tags = resolveItemTags(item, context.governanceEvidence);
  return {
    domain: [domainValue(context)],
    tag: tags.length
      ? tags.map((tag) => ({ value: tag.key, label: tag.label }))
      : item.tagMetadataAvailable === false
        ? [{ value: UNKNOWN_FACET_VALUE, label: "Unknown" }]
        : [{ value: NO_TAGS_FACET_VALUE, label: "No tags" }],
    endorsement: [endorsementValue(item)],
    label: [labelValue(item)],
  };
}

function matches(values: Array<{ value: string }>, selected: string[] | undefined): boolean {
  if (!selected?.length) return true;
  return values.some((entry) => selected.includes(entry.value));
}

/** Applies every facet except `skip`; used both for the list and for counts. */
function filterItems(
  items: readonly Item[],
  values: Map<string, ReturnType<typeof itemFacetValues>>,
  selection: CatalogFacetSelection,
  skip?: CatalogFacetKey,
): Item[] {
  return items.filter((item) => {
    const itemValues = values.get(item.fabricId)!;
    return CATALOG_FACETS.every((facet) => facet === skip || matches(itemValues[facet], selection[facet]));
  });
}

export interface CatalogFacetResult {
  items: Item[];
  facets: CatalogFacets;
}

/**
 * Filters items by the selection and counts each facet value over the items
 * matching every other facet, so a count is what selecting the value adds.
 */
export function applyCatalogFacets(
  items: readonly Item[],
  selection: CatalogFacetSelection,
  context: FacetContext,
): CatalogFacetResult {
  const values = new Map(items.map((item) => [item.fabricId, itemFacetValues(item, context)]));
  const facets = {} as CatalogFacets;
  for (const facet of CATALOG_FACETS) {
    const counts = new Map<string, FacetValue>();
    for (const item of filterItems(items, values, selection, facet)) {
      for (const entry of values.get(item.fabricId)![facet]) {
        const current = counts.get(entry.value) ?? { ...entry, count: 0 };
        current.count += 1;
        counts.set(entry.value, current);
      }
    }
    for (const value of selection[facet] ?? []) {
      if (value && !counts.has(value)) counts.set(value, { value, label: value, count: 0 });
    }
    facets[facet] = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return { items: filterItems(items, values, selection), facets };
}

export function hasFacetSelection(selection: CatalogFacetSelection): boolean {
  return CATALOG_FACETS.some((facet) => (selection[facet]?.length ?? 0) > 0);
}

export function toggleFacetValue(
  selection: CatalogFacetSelection,
  facet: CatalogFacetKey,
  value: string,
): CatalogFacetSelection {
  const current = selection[facet] ?? [];
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  const result = { ...selection };
  if (next.length) result[facet] = next;
  else delete result[facet];
  return result;
}

const MAX_VALUES = 20;
const MAX_VALUE_LENGTH = 200;

/** Reads a facet selection from saved-view or navigation filters. */
export function facetSelectionFromFilters(filters: Record<string, unknown> | undefined): CatalogFacetSelection {
  const selection: CatalogFacetSelection = {};
  for (const facet of CATALOG_FACETS) {
    const raw = filters?.[`facet.${facet}`];
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
    const values = [
      ...new Set(
        list.filter((value): value is string => typeof value === "string").map((value) => value.trim().slice(0, MAX_VALUE_LENGTH)),
      ),
    ].filter(Boolean).slice(0, MAX_VALUES);
    if (values.length) selection[facet] = values;
  }
  return selection;
}

export function facetSelectionToFilters(selection: CatalogFacetSelection): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const facet of CATALOG_FACETS) {
    if (selection[facet]?.length) filters[`facet.${facet}`] = [...selection[facet]!];
  }
  return filters;
}
