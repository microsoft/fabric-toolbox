import type { ConnectionInventoryView, FabricConnectionRecord, WorkspaceProvenanceEvidence } from "./connections";

/*
 * Preview-only connection inventory for the local sample workspace. It is
 * never written to Rayfin; live deployments read the synchronized inventory.
 */

export const PREVIEW_CONNECTION_IDS = {
  adlsLanding: "30000000-0000-4000-8000-0000000000c1",
  s3Weather: "30000000-0000-4000-8000-0000000000c2",
  sqlBooking: "30000000-0000-4000-8000-0000000000c3",
  salesforce: "30000000-0000-4000-8000-0000000000c4",
  sharepoint: "30000000-0000-4000-8000-0000000000c5",
  snowApi: "30000000-0000-4000-8000-0000000000c6",
  adlsCurated: "30000000-0000-4000-8000-0000000000c7",
  personalExcel: "30000000-0000-4000-8000-0000000000c8",
} as const;

const PRINCIPALS = {
  tom: { principalId: "40000000-0000-4000-8000-0000000000a1", principalType: "User", displayName: "tom.berg@alpinerent.com" },
  lea: { principalId: "40000000-0000-4000-8000-0000000000a2", principalType: "User", displayName: "lea.martin@alpinerent.com" },
  dataEngineering: { principalId: "40000000-0000-4000-8000-0000000000b1", principalType: "Group", displayName: "Data Engineering" },
  etl: { principalId: "40000000-0000-4000-8000-0000000000c1", principalType: "ServicePrincipal", displayName: "svc-alpine-etl" },
} as const;

function daysAgo(days: number, now: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

function connections(now: number): FabricConnectionRecord[] {
  return [
    {
      id: PREVIEW_CONNECTION_IDS.adlsLanding, displayName: "adls-partner-landing", connectivityType: "ShareableCloud",
      connectorType: "AzureDataLakeStorage", path: "https://alpinerentlake.dfs.core.windows.net/landing",
      privacyLevel: "Organizational", credentialType: "Key", singleSignOnType: "None", connectionEncryption: "NotEncrypted",
      createdAt: daysAgo(410, now), lastBoundAt: daysAgo(36, now), lastCredentialUsedAt: daysAgo(1, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.tom, role: "Owner" }, { ...PRINCIPALS.dataEngineering, role: "User" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.s3Weather, displayName: "s3-weather-feed", connectivityType: "ShareableCloud",
      connectorType: "AmazonS3", path: "https://s3.eu-central-1.amazonaws.com/alpine-weather",
      privacyLevel: "Organizational", credentialType: "Key", singleSignOnType: "None",
      createdAt: daysAgo(220, now), lastBoundAt: daysAgo(90, now), lastCredentialUsedAt: daysAgo(0, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.dataEngineering, role: "Owner" }, { ...PRINCIPALS.lea, role: "Owner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.sqlBooking, displayName: "sql-booking-prod", connectivityType: "OnPremisesGateway",
      connectorType: "SQL", path: "alpine-sql01.corp.local;Booking", gatewayId: "50000000-0000-4000-8000-0000000000d1",
      privacyLevel: "Organizational", credentialType: "Basic", singleSignOnType: "None", connectionEncryption: "NotEncrypted",
      createdAt: daysAgo(700, now), lastBoundAt: daysAgo(12, now), lastCredentialUsedAt: daysAgo(0, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.tom, role: "Owner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.salesforce, displayName: "salesforce-crm", connectivityType: "ShareableCloud",
      connectorType: "Salesforce", path: "https://login.salesforce.com",
      privacyLevel: "Organizational", credentialType: "OAuth2", singleSignOnType: "None",
      createdAt: daysAgo(160, now), lastBoundAt: daysAgo(40, now), lastCredentialUsedAt: daysAgo(3, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.tom, role: "Owner" }, { ...PRINCIPALS.lea, role: "Owner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.sharepoint, displayName: "sharepoint-ops", connectivityType: "ShareableCloud",
      connectorType: "SharePoint", path: "https://alpinerent.sharepoint.com/sites/ops",
      privacyLevel: "Organizational", credentialType: "OAuth2", singleSignOnType: "None",
      createdAt: daysAgo(95, now), lastBoundAt: daysAgo(30, now), lastCredentialUsedAt: daysAgo(2, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.lea, role: "PendingOwner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.snowApi, displayName: "web-snow-report", connectivityType: "ShareableCloud",
      connectorType: "Web", path: "https://api.snowreport.example/v2",
      privacyLevel: "Public", credentialType: "Anonymous", singleSignOnType: "None", connectionEncryption: "NotEncrypted",
      createdAt: daysAgo(400, now), lastBoundAt: daysAgo(150, now), lastCredentialUsedAt: daysAgo(140, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.dataEngineering, role: "Owner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.adlsCurated, displayName: "adls-curated", connectivityType: "ShareableCloud",
      connectorType: "AzureDataLakeStorage", path: "https://alpinerentlake.dfs.core.windows.net/curated",
      privacyLevel: "Organizational", credentialType: "WorkspaceIdentity", singleSignOnType: "None",
      createdAt: daysAgo(60, now), lastBoundAt: daysAgo(5, now), lastCredentialUsedAt: daysAgo(0, now),
      rolesStatus: "complete", roles: [{ ...PRINCIPALS.dataEngineering, role: "Owner" }, { ...PRINCIPALS.etl, role: "Owner" }],
    },
    {
      id: PREVIEW_CONNECTION_IDS.personalExcel, displayName: "lea-pricing-workbook", connectivityType: "PersonalCloud",
      connectorType: "SharePoint", path: "https://alpinerent-my.sharepoint.com/personal/lea_martin",
      privacyLevel: "Private", credentialType: "OAuth2", singleSignOnType: "None",
      createdAt: daysAgo(20, now), lastBoundAt: daysAgo(20, now), lastCredentialUsedAt: daysAgo(4, now),
      rolesStatus: "personal", roles: [],
    },
  ];
}

export function previewConnectionInventory(now = Date.now()): ConnectionInventoryView {
  const list = connections(now);
  return {
    id: "30000000-0000-4000-8000-0000000000aa",
    collectedAt: daysAgo(0, now),
    status: "complete",
    truncated: false,
    roleLookups: { done: list.filter((entry) => entry.rolesStatus === "complete").length, skipped: 0, failed: 0 },
    connections: list,
  };
}

const PARTNER_WORKSPACE = "30000000-0000-4000-8000-0000000000e1";
const PARTNER_ITEMS = {
  lakehouse: "30000000-0000-4000-8000-0000000000e2",
  mirror: "30000000-0000-4000-8000-0000000000e3",
} as const;

/** A second synchronized workspace, so preview usage spans workspaces as in a real tenant. */
export function previewConnectionUsageEvidence(): WorkspaceProvenanceEvidence[] {
  const row = (itemId: string, relation: string, value: string) => ({
    itemFabricId: itemId, section: "Source provenance", label: relation, value,
  });
  return [{
    workspaceId: PARTNER_WORKSPACE,
    workspaceName: "AlpineRent Partners",
    config: [
      row(PARTNER_ITEMS.lakehouse, "external-shortcut",
        `provider=AdlsGen2; connection=${PREVIEW_CONNECTION_IDS.adlsLanding}; consumer=${PARTNER_ITEMS.lakehouse}; field=target.adlsGen2.connectionId; location=Files/landing/hotels`),
      row(PARTNER_ITEMS.lakehouse, "external-shortcut",
        `provider=AdlsGen2; connection=${PREVIEW_CONNECTION_IDS.adlsCurated}; consumer=${PARTNER_ITEMS.lakehouse}; field=target.adlsGen2.connectionId; location=Tables/gold_bookings`),
      row(PARTNER_ITEMS.mirror, "mirroring-source",
        `provider=SqlServer; connection=${PREVIEW_CONNECTION_IDS.sqlBooking}; consumer=${PARTNER_ITEMS.mirror}; field=properties.source.typeProperties.connection`),
    ],
    items: [
      { fabricId: PARTNER_ITEMS.lakehouse, displayName: "partner_lakehouse", itemType: "Lakehouse" },
      { fabricId: PARTNER_ITEMS.mirror, displayName: "booking_mirror", itemType: "MirroredDatabase" },
    ],
  }];
}

/** The inventory one week earlier, so the Changes tab has something to compare in preview. */
export function previewPreviousConnectionInventory(now = Date.now()): ConnectionInventoryView {
  const current = connections(now);
  const previous = current
    .filter((entry) => entry.id !== PREVIEW_CONNECTION_IDS.adlsCurated)
    .map((entry) =>
      entry.id === PREVIEW_CONNECTION_IDS.sharepoint
        ? { ...entry, roles: [{ ...PRINCIPALS.tom, role: "Owner" }] }
        : entry,
    );
  return {
    id: "30000000-0000-4000-8000-0000000000ab",
    collectedAt: daysAgo(7, now),
    status: "complete",
    truncated: false,
    roleLookups: { done: previous.filter((entry) => entry.rolesStatus === "complete").length, skipped: 0, failed: 0 },
    connections: [
      ...previous,
      {
        id: "30000000-0000-4000-8000-0000000000c9", displayName: "ftp-legacy-tariffs", connectivityType: "OnPremisesGateway",
        connectorType: "File", path: "\\\\alpine-fs01\\tariffs", credentialType: "Windows", singleSignOnType: "None",
        createdAt: daysAgo(1200, now), rolesStatus: "complete", roles: [{ ...PRINCIPALS.tom, role: "Owner" }],
      },
    ],
  };
}
