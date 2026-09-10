import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  ExternalLink,
  FolderTree,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Waypoints,
  X,
} from "lucide-react";
import { useThemeContext } from "@/hooks/theme.context";
import { ATLAS_CONFIG } from "../config";
import { SynchronizationProgress } from "../components/SynchronizationProgress";
import { REPOSITORY_URL } from "../release";
import { useAtlas } from "../store";
import { syncContactMessage } from "../sync-contact";

const CAPABILITIES = [
  {
    icon: FolderTree,
    title: "Catalog",
    detail: "Items, ownership and metadata",
  },
  {
    icon: Waypoints,
    title: "Lineage",
    detail: "Dependencies and impact paths",
  },
  {
    icon: ShieldCheck,
    title: "Access",
    detail: "Principals, shares and risks",
  },
  {
    icon: Settings2,
    title: "Configuration",
    detail: "Schemas, settings and jobs",
  },
];

function safeText(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return !normalized || normalized === "undefined" || normalized === "null"
    ? fallback
    : normalized;
}

export function AtlasBootView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-m">
        <span className="atlas-brand-mark flex icon-size-700 items-center justify-center rounded-xl text-primary-foreground">
          <Compass className="icon-size-400" />
        </span>
        <div className="text-300 font-semibold">Loading Fabric Atlas</div>
        <span className="h-xs w-32 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </span>
      </div>
    </div>
  );
}

export function FirstSyncView() {
  const reduceMotion = useReducedMotion();
  const { isDark, toggleTheme } = useThemeContext();
  const {
    data,
    configured,
    canSync,
    sync,
    cancelSync,
    syncing,
    syncError,
    syncProgress,
    syncStage,
    syncStartedAt,
    hasData,
    requiresDeploymentSync,
  } = useAtlas();
  const deploymentRefresh = hasData && requiresDeploymentSync;
  const workspaceName = safeText(
    data.workspace.displayName,
    ATLAS_CONFIG.workspaceName,
  );
  return (
    <div className="relative min-h-screen overflow-auto bg-background text-foreground">
      <div className="atlas-first-sync-bg pointer-events-none fixed inset-0" />
      <div className="atlas-sync-grid pointer-events-none fixed inset-0 opacity-40" />
      <motion.div
        aria-hidden="true"
        className="atlas-sync-orb pointer-events-none fixed rounded-full bg-primary/20 blur-3xl"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={
          reduceMotion
            ? { opacity: 0.28, scale: 1 }
            : { opacity: [0.2, 0.55, 0.28], scale: [0.9, 1.08, 0.95] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 9, repeat: Infinity, ease: "easeInOut" }
        }
      />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        className="fixed right-l top-l z-20 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-fabric-4 hover:bg-accent hover:text-foreground"
      >
        {isDark ? (
          <Sun className="icon-size-200" />
        ) : (
          <Moon className="icon-size-200" />
        )}
      </button>

      <main className="atlas-sync-frame relative z-10 mx-auto flex min-h-screen flex-col justify-center py-xxl">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, ease: "easeOut" }}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-fabric-16"
        >
          <header className="flex flex-wrap items-center justify-between gap-m border-b border-border/70 px-xl py-l sm:px-xxl">
            <div className="flex items-center gap-m">
              <span className="atlas-brand-mark flex icon-size-600 items-center justify-center rounded-lg text-primary-foreground">
                <Compass className="icon-size-300" />
              </span>
              <span>
                <span className="block font-heading text-400 font-bold">
                  Fabric Atlas
                </span>
                <span className="block text-200 text-muted-foreground">
                  Workspace intelligence · deployment sync
                </span>
              </span>
            </div>
            <div className="flex items-center gap-s rounded-full border border-status-healthy/25 bg-status-healthy/10 px-m py-s text-200 font-semibold text-status-healthy">
              <span className="h-xs w-xs rounded-full bg-current shadow-[0_0_12px_currentColor]" />
              Sync services ready
            </div>
          </header>

          <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: reduceMotion ? 0 : 0.12,
                duration: reduceMotion ? 0 : 0.55,
                ease: "easeOut",
              }}
              className="flex flex-col border-b border-border p-xl sm:p-xxxl lg:border-b-0 lg:border-r"
            >
              <div className="atlas-sync-copy">
                <span className="inline-flex items-center gap-s rounded-full border border-primary/30 bg-primary/10 px-m py-s text-200 font-semibold text-primary">
                  <Sparkles className="icon-size-100" />
                  {deploymentRefresh
                    ? "New deployment detected"
                    : "Your first workspace map"}
                </span>

                <h1 className="atlas-sync-title mt-xl text-balance font-heading text-hero-800 font-bold leading-hero-800 sm:text-hero-900 sm:leading-hero-900">
                  {deploymentRefresh
                    ? "Refresh the map. Start from truth."
                    : "Turn your Fabric workspace into a living atlas."}
                </h1>
                <p className="atlas-sync-copy mt-l text-300 leading-500 text-muted-foreground">
                  One synchronization discovers the estate, orients its lineage,
                  resolves effective access and prepares the governance dashboard.
                  Business data never leaves Fabric.
                </p>

                <div className="mt-xl flex flex-wrap gap-s">
                  <span className="rounded-full border border-border bg-secondary px-m py-s text-200 font-semibold">
                    {data.items.length || "No"} indexed items
                  </span>
                  <span className="rounded-full border border-border bg-secondary px-m py-s text-200 font-semibold">
                    {data.edges.length || "No"} lineage links
                  </span>
                  <span className="rounded-full border border-border bg-secondary px-m py-s text-200 font-semibold">
                    {data.principals.length || "No"} principals
                  </span>
                </div>
              </div>

              <div className="mt-auto grid gap-s pt-xxxl sm:grid-cols-2">
                {CAPABILITIES.map(({ icon: Icon, title, detail }, index) => (
                  <motion.div
                    key={title}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: reduceMotion ? 0 : 0.22 + index * 0.07,
                      duration: reduceMotion ? 0 : 0.4,
                    }}
                    className="group flex items-start gap-m rounded-lg border border-border bg-secondary p-m transition-colors hover:border-primary/35 hover:bg-accent"
                  >
                    <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:-translate-y-xxs">
                      <Icon className="icon-size-200" />
                    </span>
                    <span>
                      <span className="block text-300 font-semibold">{title}</span>
                      <span className="mt-xxs block text-200 leading-200 text-muted-foreground">
                        {detail}
                      </span>
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: reduceMotion ? 0 : 0.18,
                duration: reduceMotion ? 0 : 0.55,
                ease: "easeOut",
              }}
              className="flex flex-col gap-l bg-secondary/65 p-xl sm:p-xxl"
            >
              <SynchronizationProgress
                key={syncStartedAt ?? "ready"}
                progress={syncing ? syncProgress : 0}
                stage={
                  syncing
                    ? syncStage
                    : deploymentRefresh
                      ? "Ready to refresh the map"
                      : "Ready to build the first atlas"
                }
                active={syncing}
              />

              <div className="mt-auto rounded-xl border border-border bg-card p-l shadow-fabric-4">
                <div className="flex items-start justify-between gap-m">
                  <div className="min-w-0">
                    <div className="text-100 font-bold uppercase tracking-[0.14em] text-primary">
                      Target workspace
                    </div>
                    <div className="mt-xs truncate font-heading text-500 font-bold">
                      {workspaceName}
                    </div>
                  </div>
                  <div className="font-numeric text-500 font-bold text-primary">
                    {syncing ? `${syncProgress}%` : "01"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (syncing) cancelSync();
                    else void sync();
                  }}
                  disabled={!syncing && (!configured || !canSync)}
                  className="mt-l flex h-10 w-full items-center justify-center gap-s rounded-md bg-primary px-l text-300 font-semibold text-primary-foreground shadow-fabric-2 transition-colors hover:bg-primary-hover disabled:opacity-55"
                >
                  {syncing ? (
                    <X className="icon-size-200" />
                  ) : (
                    <Waypoints className="icon-size-200" />
                  )}
                  {syncing
                    ? "Cancel synchronization"
                    : deploymentRefresh
                      ? "Sync this deployment"
                      : "Start first sync"}
                </button>
              </div>

              {!configured && (
                <div className="rounded-xl border border-status-warning/35 bg-status-warning/10 p-m text-200 leading-300 text-status-warning">
                  <div className="flex items-center gap-s font-semibold">
                    <AlertTriangle className="icon-size-200" />
                    Atlas Sync is not configured
                  </div>
                  <a
                    href={`${REPOSITORY_URL}/blob/main/docs/installation.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-s inline-flex items-center gap-xs font-semibold underline underline-offset-4"
                  >
                    Open installation guide
                    <ExternalLink className="icon-size-100" />
                  </a>
                </div>
              )}

              {syncError && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/35 bg-destructive/10 p-m text-200 leading-300 text-destructive"
                >
                  <div className="flex items-center gap-s font-semibold">
                    <AlertTriangle className="icon-size-200" />
                    Sync failed
                  </div>
                  <p className="mt-xs break-words">{syncError}</p>
                </div>
              )}

              {configured && !canSync && !syncError && !syncing && (
                <div className="rounded-xl border border-status-warning/35 bg-status-warning/10 p-m text-200 leading-300 text-status-warning">
                  <div className="flex items-center gap-s font-semibold">
                    <AlertTriangle className="icon-size-200" />
                    Synchronization requires the configured publisher account
                  </div>
                  <p className="mt-xs">
                    {syncContactMessage(ATLAS_CONFIG.syncAdminEmail)}
                  </p>
                </div>
              )}

              {configured && canSync && !syncError && !syncing && (
                <div className="flex items-center gap-s text-200 text-muted-foreground">
                  <CheckCircle2 className="icon-size-200 text-status-healthy" />
                  Sync endpoint, Entra client and publisher identity are configured.
                </div>
              )}
            </motion.section>
          </div>

        </motion.div>
      </main>
    </div>
  );
}
