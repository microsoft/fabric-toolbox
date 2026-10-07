export type PreviewMaturity =
  | "preview"
  | "beta"
  | "private-preview"
  | "unconfirmed";

export type PreviewFeatureId =
  | "fabric-app-functions"
  | "fabric-policies"
  | "item-relations"
  | "catalog-search"
  | "ontology"
  | "event-schema-set"
  | "monitor-hub-alerts"
  | "deployment-plans"
  | "iq-sharing"
  | "spark-runtime-lineage";

export interface PreviewApiDescriptor {
  id: PreviewFeatureId;
  productName: string;
  maturity: PreviewMaturity;
  apiVersion: string;
  documentationUrl: string;
  evidenceBoundary: string;
  limitations: string[];
  lastVerifiedAt: string;
}

export const PREVIEW_API_REGISTRY: Record<
  PreviewFeatureId,
  PreviewApiDescriptor
> = {
  "fabric-app-functions": {
    id: "fabric-app-functions",
    productName: "Fabric Apps backend Functions",
    maturity: "preview",
    apiVersion: "Rayfin 1.36.2",
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/apps/functions",
    evidenceBoundary:
      "Functions are bounded invocations, not a documented scheduler or durable workflow engine.",
    limitations: [
      "Application connections currently use the AppBackend owner identity.",
      "Concurrency and outbound-network limits are not documented.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "fabric-policies": {
    id: "fabric-policies",
    productName: "Policies in Fabric",
    maturity: "preview",
    apiVersion: "Workspace settings REST v1; central evaluation contract unverified",
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/governance/fabric-policies-rest-api",
    evidenceBoundary:
      "Verified workspace settings are context only. Central evaluation remains blocked until its operation contract is published and verified.",
    limitations: [
      "OneLake role membership and DLP restriction state have no public read API.",
      "Tenant and region availability must be verified.",
      "The conceptual evaluation guide does not specify an endpoint, request/response schema or operation-specific permission contract.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "item-relations": {
    id: "item-relations",
    productName: "Fabric Item Relations",
    maturity: "beta",
    apiVersion: "Fabric REST v1, beta=true",
    documentationUrl:
      "https://learn.microsoft.com/en-us/rest/api/fabric/core/items/get-upstream-relations%28beta%29",
    evidenceBoundary:
      "Item-level Beta evidence remains separate from authoritative Atlas lineage.",
    limitations: [
      "Microsoft does not recommend the Beta API for production use.",
      "The API does not provide object, column, measure or report-visual lineage.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "catalog-search": {
    id: "catalog-search",
    productName: "OneLake Catalog Search",
    maturity: "preview",
    apiVersion: "Fabric REST v1",
    documentationUrl:
      "https://learn.microsoft.com/en-us/rest/api/fabric/core/catalog/search",
    evidenceBoundary:
      "Search is a permission-filtered discovery source, not authoritative snapshot enumeration.",
    limitations: [
      "An empty or missing result does not prove that an asset is absent.",
      "Results are filtered for the Atlas application identity, not the signed-in user, and grant no access to item content.",
      "A continuation token cannot be combined with search or filter values.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  ontology: {
    id: "ontology",
    productName: "Fabric IQ Ontology",
    maturity: "preview",
    apiVersion: "Fabric REST v1",
    documentationUrl:
      "https://learn.microsoft.com/en-us/rest/api/fabric/ontology/items",
    evidenceBoundary:
      "Atlas collects definition metadata only and never reads ontology instances.",
    limitations: [
      "Metric and inheritance fields must be confirmed in real definition payloads.",
      "Definition access requires elevated item permissions.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "event-schema-set": {
    id: "event-schema-set",
    productName: "Event Schema Set",
    maturity: "preview",
    apiVersion: "Fabric REST v1",
    documentationUrl:
      "https://learn.microsoft.com/en-us/rest/api/fabric/eventschemaset/items/create-event-schema-set",
    evidenceBoundary:
      "Atlas stores structural schema metadata, not event payloads.",
    limitations: [
      "The documented REST operation supports user identity only.",
      "Service principals and managed identities are not supported.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "monitor-hub-alerts": {
    id: "monitor-hub-alerts",
    productName: "Monitor Hub job alerts",
    maturity: "preview",
    apiVersion: "Portal experience, no public alerts read API",
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/admin/monitoring-hub-alerts",
    evidenceBoundary:
      "Atlas links to native alerts and only imports supported workspace-monitoring telemetry.",
    limitations: [
      "Alert configuration and incident reads are not exposed through a public REST API.",
      "Workspace monitoring can add capacity cost and regional prerequisites.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "deployment-plans": {
    id: "deployment-plans",
    productName: "Fabric Deployment Plans",
    maturity: "preview",
    apiVersion: "Fabric REST contract, version not stated",
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/cicd/deployment-plan/deployment-plan-overview",
    evidenceBoundary:
      "Atlas reports only component support verified by the current deployment matrix.",
    limitations: [
      "Fabric Apps and AppBackend are not in the documented deployment-pipeline support matrix.",
      "Plans cannot be scheduled or configured as a default.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "iq-sharing": {
    id: "iq-sharing",
    productName: "IQ Sharing",
    maturity: "unconfirmed",
    apiVersion: "No public API contract",
    documentationUrl:
      "https://azure.microsoft.com/en-us/blog/fabcon-and-sqlcon-2026-in-barcelona-building-the-data-foundation-for-microsoft-copilot-and-agents/",
    evidenceBoundary:
      "No Atlas collection is enabled until availability and disclosure boundaries are documented.",
    limitations: [
      "Microsoft announcements conflict between preview and preview soon.",
      "No dedicated public metadata API was found.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
  "spark-runtime-lineage": {
    id: "spark-runtime-lineage",
    productName: "Spark Runtime Lineage",
    maturity: "private-preview",
    apiVersion: "Private __private route, no Microsoft public contract",
    documentationUrl:
      "https://docs.atlan.com/apps/connectors/business-intelligence/microsoft-fabric/how-tos/set-up-spark-runtime-lineage",
    evidenceBoundary:
      "Observed runtime events remain separate from snapshot-derived lineage.",
    limitations: [
      "Tenant and workspace enrollment are required.",
      "No Microsoft-authored public API, cost or retention contract is available.",
    ],
    lastVerifiedAt: "2026-10-02",
  },
};

export function previewMaturityLabel(
  maturity: PreviewMaturity,
): string {
  switch (maturity) {
    case "private-preview":
      return "Private Preview";
    case "unconfirmed":
      return "Availability unconfirmed";
    case "beta":
      return "Beta";
    default:
      return "Preview";
  }
}

export function previewApiDescriptors(
  featureIds: readonly PreviewFeatureId[],
): PreviewApiDescriptor[] {
  return [...new Set(featureIds)].map(
    (featureId) => PREVIEW_API_REGISTRY[featureId],
  );
}
