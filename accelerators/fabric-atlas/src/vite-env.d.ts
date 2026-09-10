/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Rayfin API base URL (e.g. http://localhost:5168). */
  readonly VITE_RAYFIN_API_URL?: string;
  /** Rayfin publishable key (pk-...). */
  readonly VITE_RAYFIN_PUBLISHABLE_KEY?: string;
  /** Fabric workspace ID — maps to FabricAuthOptions.workspaceId. */
  readonly VITE_FABRIC_WORKSPACE_ID?: string;
  /** Fabric/Rayfin item ID — maps to FabricAuthOptions.projectId. */
  readonly VITE_FABRIC_ITEM_ID?: string;
  /** Fabric portal base URL (e.g. https://app.fabric.microsoft.com/). */
  readonly VITE_FABRIC_PORTAL_URL?: string;
  /** Fabric Atlas semantic version injected by Vite. */
  readonly VITE_APP_VERSION?: string;
  /** Source repository URL injected by Vite. */
  readonly VITE_APP_REPOSITORY_URL?: string;
  /** Short Git commit used for this build. */
  readonly VITE_APP_BUILD_COMMIT?: string;
  /** ISO timestamp for this build. */
  readonly VITE_APP_BUILD_DATE?: string;
  /** Rayfin-mapped public Entra application client ID used by Atlas Sync. */
  readonly VITE_RAYFIN_ATLAS_SPA_CLIENT_ID?: string;
  /** Rayfin-mapped public invoke URL for the Atlas sync_all UDF. */
  readonly VITE_RAYFIN_ATLAS_UDF_URL?: string;
  /** Rayfin-mapped display name for the deployment workspace. */
  readonly VITE_RAYFIN_ATLAS_WORKSPACE_NAME?: string;
  /** Rayfin-mapped email allowed to publish synchronized snapshots. */
  readonly VITE_RAYFIN_ATLAS_SYNC_ADMIN_EMAIL?: string;
  /** Number of trusted workspace snapshots retained after synchronization. */
  readonly VITE_RAYFIN_ATLAS_SNAPSHOT_RETENTION_COUNT?: string;
  /** Comma-separated former synchronizers trusted during writer rotation. */
  readonly VITE_RAYFIN_ATLAS_PREVIOUS_SYNC_WRITERS?: string;
  /** Tenant-specific sensitivity label rank map as JSON. */
  readonly VITE_RAYFIN_ATLAS_SENSITIVITY_RANKS?: string;
  /** Legacy local override for the Atlas Entra application client ID. */
  readonly VITE_ATLAS_SPA_CLIENT_ID?: string;
  /** Legacy local override for the Atlas sync_all UDF invoke URL. */
  readonly VITE_ATLAS_UDF_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}