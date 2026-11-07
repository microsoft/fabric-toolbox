import type { PreviewFeatureId } from "./preview-api";

export interface AtlasFeatureFlag {
  id: PreviewFeatureId;
  environmentVariable: string;
  enabled: boolean;
  defaultEnabled: boolean;
}

const RAW_FLAGS: Record<PreviewFeatureId, string | undefined> = {
  "fabric-app-functions":
    import.meta.env.VITE_ATLAS_FEATURE_FABRIC_APP_FUNCTIONS,
  "fabric-policies": import.meta.env.VITE_ATLAS_FEATURE_FABRIC_POLICIES,
  "item-relations": import.meta.env.VITE_ATLAS_FEATURE_ITEM_RELATIONS,
  "catalog-search": import.meta.env.VITE_ATLAS_FEATURE_CATALOG_SEARCH,
  ontology: import.meta.env.VITE_ATLAS_FEATURE_ONTOLOGY,
  "event-schema-set":
    import.meta.env.VITE_ATLAS_FEATURE_EVENT_SCHEMA_SET,
  "monitor-hub-alerts":
    import.meta.env.VITE_ATLAS_FEATURE_MONITOR_HUB_ALERTS,
  "deployment-plans":
    import.meta.env.VITE_ATLAS_FEATURE_DEPLOYMENT_PLANS,
  "iq-sharing": import.meta.env.VITE_ATLAS_FEATURE_IQ_SHARING,
  "spark-runtime-lineage":
    import.meta.env.VITE_ATLAS_FEATURE_SPARK_RUNTIME_LINEAGE,
};

const ENVIRONMENT_VARIABLES: Record<PreviewFeatureId, string> = {
  "fabric-app-functions": "VITE_ATLAS_FEATURE_FABRIC_APP_FUNCTIONS",
  "fabric-policies": "VITE_ATLAS_FEATURE_FABRIC_POLICIES",
  "item-relations": "VITE_ATLAS_FEATURE_ITEM_RELATIONS",
  "catalog-search": "VITE_ATLAS_FEATURE_CATALOG_SEARCH",
  ontology: "VITE_ATLAS_FEATURE_ONTOLOGY",
  "event-schema-set": "VITE_ATLAS_FEATURE_EVENT_SCHEMA_SET",
  "monitor-hub-alerts": "VITE_ATLAS_FEATURE_MONITOR_HUB_ALERTS",
  "deployment-plans": "VITE_ATLAS_FEATURE_DEPLOYMENT_PLANS",
  "iq-sharing": "VITE_ATLAS_FEATURE_IQ_SHARING",
  "spark-runtime-lineage": "VITE_ATLAS_FEATURE_SPARK_RUNTIME_LINEAGE",
};

const DEFAULTS: Record<PreviewFeatureId, boolean> = {
  "fabric-app-functions": true,
  "fabric-policies": false,
  "item-relations": false,
  "catalog-search": false,
  ontology: false,
  "event-schema-set": false,
  "monitor-hub-alerts": false,
  "deployment-plans": false,
  "iq-sharing": false,
  "spark-runtime-lineage": false,
};

function flagValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null || !value.trim()) return fallback;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

export const ATLAS_FEATURE_FLAGS: Record<
  PreviewFeatureId,
  AtlasFeatureFlag
> = Object.fromEntries(
  (Object.keys(DEFAULTS) as PreviewFeatureId[]).map((id) => [
    id,
    {
      id,
      environmentVariable: ENVIRONMENT_VARIABLES[id],
      defaultEnabled: DEFAULTS[id],
      enabled: flagValue(RAW_FLAGS[id], DEFAULTS[id]),
    },
  ]),
) as Record<PreviewFeatureId, AtlasFeatureFlag>;

export function isFeatureEnabled(id: PreviewFeatureId): boolean {
  return ATLAS_FEATURE_FLAGS[id].enabled;
}

export function atlasFeatureFlags(): AtlasFeatureFlag[] {
  return Object.values(ATLAS_FEATURE_FLAGS);
}
