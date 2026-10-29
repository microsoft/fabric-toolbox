//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  BarChart3,
  Boxes,
  Compass,
  FolderTree,
  Globe,
  Info,
  KeyRound,
  Menu,
  Moon,
  Plug,
  RefreshCw,
  Rows3,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
  Waypoints,
  X,
} from "lucide-react";

import { useThemeContext } from "@/hooks/theme.context";
import { useAtlas } from "./atlas/store";
import { ExternalLineageProvider } from "./atlas/external-lineage-store";
import { CommandPalette } from "./atlas/components/CommandPalette";
import { SyncRunCompact, SyncRunProgressLine } from "./atlas/components/SyncRunStatus";
import {
  navigationForSearch,
  type AtlasFocusRequest,
  navigationForSavedView,
  type AtlasNavigation,
  type Tab,
  type WorkspaceSection,
} from "./atlas/navigation";
import {
  parseAtlasLocation,
  urlForNavigation,
} from "./atlas/routing";
import { Avatar, cn } from "./atlas/ui";
import { type AtlasData } from "./atlas/model";
import { buildSearchIndex } from "./atlas/search";
import {
  CATALOG_SEARCH_FEATURE_ID,
  catalogSearchAvailability,
  searchOneLakeCatalog,
} from "./atlas/catalog-search";
import { isFeatureEnabled } from "./atlas/feature-flags";
import { workspaceDetailLabel } from "./atlas/workspace-display";
import {
  captureWorkspaceFocus,
  DRAWER_WORKSPACE_SELECT_ID,
  HEADER_WORKSPACE_SELECT_ID,
  restoreWorkspaceFocus,
  WorkspaceSwitchContext,
  type WorkspaceFocusCapture,
} from "./atlas/workspace-switch";
import { WorkspaceSelector } from "./atlas/components/WorkspaceSelector";
import { DomainFilter } from "./atlas/components/DomainFilterPopover";
import { SnapshotExportPopover } from "./atlas/components/SnapshotExportPopover";
import {
  isDisplayDensity,
  useDisplayPreference,
} from "./atlas/display-preferences";

import { AtlasBootView, FirstSyncView } from "./atlas/views/FirstSync";

export type { Tab } from "./atlas/navigation";

const overviewLoader = () => import("./atlas/views/Overview");
const mapLoader = () => import("./atlas/views/Map");
const externalLoader = () => import("./atlas/views/ExternalLineage");
const catalogLoader = () => import("./atlas/views/Catalog");
const assetCatalogLoader = () => import("./atlas/views/AssetCatalog");
const accessLoader = () => import("./atlas/views/Access");
const governanceLoader = () => import("./atlas/views/GovernanceCenter");
const jobsLoader = () => import("./atlas/views/Jobs");
const workspaceLoader = () => import("./atlas/views/WorkspaceHub");
const mcpLoader = () => import("./atlas/views/Mcp");
const aboutLoader = () => import("./atlas/views/About");

const OverviewView = lazy(() =>
  overviewLoader().then((module) => ({ default: module.OverviewView })),
);
const MapView = lazy(() =>
  mapLoader().then((module) => ({ default: module.MapView })),
);
const ExternalLineageView = lazy(() =>
  externalLoader().then((module) => ({ default: module.ExternalLineageView })),
);
const CatalogView = lazy(() =>
  catalogLoader().then((module) => ({ default: module.CatalogView })),
);
const AssetCatalogView = lazy(() =>
  assetCatalogLoader().then((module) => ({
    default: module.AssetCatalogView,
  })),
);
const AccessView = lazy(() =>
  accessLoader().then((module) => ({ default: module.AccessView })),
);
const GovernanceCenterView = lazy(() =>
  governanceLoader().then((module) => ({
    default: module.GovernanceCenterView,
  })),
);
const JobsView = lazy(() =>
  jobsLoader().then((module) => ({ default: module.JobsView })),
);
const WorkspaceHubView = lazy(() =>
  workspaceLoader().then((module) => ({
    default: module.WorkspaceHubView,
  })),
);
const McpView = lazy(() =>
  mcpLoader().then((module) => ({ default: module.McpView })),
);
const AboutView = lazy(() =>
  aboutLoader().then((module) => ({ default: module.AboutView })),
);

const VIEW_LOADERS: Partial<Record<Tab, () => Promise<unknown>>> = {
  overview: overviewLoader,
  map: mapLoader,
  external: externalLoader,
  catalog: catalogLoader,
  assets: assetCatalogLoader,
  access: accessLoader,
  governance: governanceLoader,
  jobs: jobsLoader,
  workspace: workspaceLoader,
  mcp: mcpLoader,
  about: aboutLoader,
};

const NAV_GROUPS: {
  label: string;
  items: { id: Tab; label: string; icon: typeof Compass; badge?: string }[];
}[] = [
  {
    label: "Explore",
    items: [
      { id: "overview", label: "Overview", icon: BarChart3 },
      { id: "map", label: "Map & lineage", icon: Waypoints },
      { id: "external", label: "External lineage", icon: Globe },
      { id: "catalog", label: "Catalog", icon: FolderTree },
      { id: "assets", label: "Asset Catalog", icon: Boxes },
    ],
  },
  {
    label: "Govern",
    items: [
      { id: "governance", label: "Governance Center", icon: ShieldCheck },
      { id: "access", label: "Access Review", icon: KeyRound },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "jobs", label: "Jobs & health", icon: Activity },
      { id: "workspace", label: "Workspace Hub", icon: Settings2 },
    ],
  },
  {
    label: "System",
    items: [
      { id: "mcp", label: "MCP", icon: Plug },
      { id: "about", label: "About", icon: Info },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((group) => group.items);

// Sidebar shortcut that opens Governance findings scoped to the user's items.
const MY_ITEMS_SHORTCUT = {
  group: "Govern",
  label: "My items",
  icon: UserRound,
  navigation: () =>
    navigationForSavedView("governance", { section: "findings", mine: true }),
};

function SidebarContent({
  tab,
  data,
  mobile = false,
  onNavigate,
}: {
  tab: Tab;
  data: AtlasData;
  mobile?: boolean;
  onNavigate: (target: Tab | AtlasNavigation) => void;
}) {
  const workspaceDetail = workspaceDetailLabel(data.workspace);
  const { workspaceScopes } = useAtlas();
  const switchable = workspaceScopes.length > 1;

  return (
    <>
      <div className="flex items-center gap-[11px] px-[14px] pb-[13px] pt-[16px]">
        <span className="atlas-brand-mark flex h-[34px] w-[34px] items-center justify-center rounded-lg text-primary-foreground">
          <Compass size={19} />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-none">
            Fabric Atlas
          </div>
          <div className="mt-[3px] text-[11px] text-muted-foreground">
            Workspace governance
          </div>
        </div>
        {mobile && (
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close navigation"
              className="ml-auto flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X size={17} />
            </button>
          </Dialog.Close>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-[10px] pb-[10px]">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && "mt-[12px]")}>
            <div className="px-[10px] pb-[5px] text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </div>
            <div className="flex flex-col gap-[2px]">
              {group.items.map(({ id, label, icon: Icon, badge }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  onMouseEnter={() => void VIEW_LOADERS[id]?.()}
                  onFocus={() => void VIEW_LOADERS[id]?.()}
                  aria-current={tab === id ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-[10px] rounded-md px-[10px] py-[7px] text-left text-[13px] font-medium transition-colors",
                    tab === id
                      ? "bg-primary/10 text-brand-foreground before:absolute before:bottom-[6px] before:left-0 before:top-[6px] before:w-[3px] before:rounded-full before:bg-primary"
                      : "text-foreground/75 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon size={17} />
                  {label}
                  {badge && (
                    <span className="ml-auto rounded-sm bg-primary/10 px-[5px] text-[10px] font-semibold text-brand-foreground">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
              {group.label === MY_ITEMS_SHORTCUT.group && (
                <button
                  type="button"
                  onClick={() => onNavigate(MY_ITEMS_SHORTCUT.navigation())}
                  onMouseEnter={() => void VIEW_LOADERS.governance?.()}
                  title="Governance findings, radar and coverage scoped to items you own"
                  className="relative flex items-center gap-[10px] rounded-md px-[10px] py-[7px] text-left text-[13px] font-medium text-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MY_ITEMS_SHORTCUT.icon size={17} />
                  {MY_ITEMS_SHORTCUT.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto p-[12px]">
        <div className="rounded-lg border border-border bg-secondary p-[11px] text-[12px] text-muted-foreground">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">
            Fabric workspace
          </div>
          {mobile && switchable ? (
            <WorkspaceSelector
              id={DRAWER_WORKSPACE_SELECT_ID}
              compact
              hideWhenSingle
              className="mt-[4px]"
            />
          ) : (
            <div className="mt-[2px] text-[13px] font-bold text-foreground">
              {data.workspace.displayName}
            </div>
          )}
          {workspaceDetail && (
            <div className="mt-[4px] text-[11px]">{workspaceDetail}</div>
          )}
          <div className="mt-[6px] flex items-center gap-[6px] text-[11px]">
            <span className="inline-block h-[7px] w-[7px] rounded-full bg-status-healthy" />
            {data.items.length} Fabric items
          </div>
          <div className="mt-[2px] text-[10px] text-muted-foreground">
            Latest validated snapshot
          </div>
        </div>
      </div>
    </>
  );
}

function App() {
  const [initialNavigation] = useState(() =>
    parseAtlasLocation(window.location),
  );
  const [tab, setTab] = useState<Tab>(initialNavigation.tab);
  const [focus, setFocus] = useState<AtlasFocusRequest | undefined>(
    initialNavigation.focus,
  );
  const [workspaceSection, setWorkspaceSection] = useState<
    WorkspaceSection | undefined
  >(initialNavigation.focus?.workspaceSection);
  const [commandOpen, setCommandOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const initialFocusPending = useRef(true);
  const desktopNavDismissal = useRef(false);
  const { isDark, toggleTheme } = useThemeContext();
  const {
    data,
    hydrating,
    sync,
    cancelSync,
    syncing,
    configured,
    canSync,
    currentUser,
    isPreview,
    hasData,
    requiresDeploymentSync,
    workspaceScopes,
    activeWorkspaceId,
    selectWorkspace,
  } = useAtlas();
  const workspaceSwitchable = workspaceScopes.length > 1;
  const pendingWorkspaceFocus = useRef<WorkspaceFocusCapture | undefined>(
    undefined,
  );
  const suppressRouteFocus = useRef(false);
  const density = useDisplayPreference(
    currentUser.id,
    data.workspace.fabricId,
    "density",
    "comfortable",
    isDisplayDensity,
  );
  useEffect(() => {
    document.documentElement.dataset.atlasDensity = density.value;
    return () => {
      delete document.documentElement.dataset.atlasDensity;
    };
  }, [density.value]);
  const workspaceSearchIndex = useMemo(
    () => (commandOpen ? buildSearchIndex(data) : []),
    [commandOpen, data],
  );
  const catalogAvailability = catalogSearchAvailability({
    enabled: isFeatureEnabled(CATALOG_SEARCH_FEATURE_ID),
    isPreview,
    canSync,
  });

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  useEffect(() => {
    const label = NAV.find((item) => item.id === tab)?.label ?? "Overview";
    document.title = `${label} | Fabric Atlas`;
    if (initialFocusPending.current) {
      initialFocusPending.current = false;
      return;
    }
    // A workspace switch re-reads the route; the switching control keeps focus.
    if (suppressRouteFocus.current) {
      suppressRouteFocus.current = false;
      return;
    }
    if (tab === "catalog" && focus?.itemId) return;
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, [focus?.itemId, focus?.requestId, tab]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      setNavOpen((open) => {
        if (open) desktopNavDismissal.current = true;
        return false;
      });
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (navOpen || !desktopNavDismissal.current) return;
    window.requestAnimationFrame(() => {
      mainRef.current?.focus();
      window.setTimeout(() => {
        mainRef.current?.focus();
        desktopNavDismissal.current = false;
      }, 0);
    });
  }, [navOpen]);

  useEffect(() => {
    const onHash = () => {
      const navigation = parseAtlasLocation(window.location);
      setTab(navigation.tab);
      setFocus(navigation.focus);
      setWorkspaceSection(navigation.focus?.workspaceSection);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  const navigate = useCallback(
    (
      navigation: AtlasNavigation | Tab,
      options: { replace?: boolean } = {},
    ) => {
      const next =
        typeof navigation === "string" ? { tab: navigation } : navigation;
      const url = urlForNavigation(window.location, next);
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url === currentUrl) {
        setNavOpen(false);
        return;
      }
      window.history[options.replace ? "replaceState" : "pushState"](
        null,
        "",
        url,
      );
      setTab(next.tab);
      setFocus(next.focus);
      setWorkspaceSection(next.focus?.workspaceSection);
      setNavOpen(false);
    },
    [],
  );

  const replaceViewState = useCallback((navigation: AtlasNavigation) => {
    if (navigation.tab === "workspace") {
      setWorkspaceSection(navigation.focus?.workspaceSection);
    }
    window.history.replaceState(
      null,
      "",
      urlForNavigation(window.location, navigation),
    );
  }, []);

  const switchWorkspace = useCallback(
    (workspaceId: string, focusId?: string) => {
      if (
        syncing ||
        workspaceId === activeWorkspaceId ||
        !workspaceScopes.some((scope) => scope.id === workspaceId)
      ) {
        selectWorkspace(workspaceId);
        return;
      }
      // Retain screen filters, but never replay entities from another workspace.
      const url = new URL(window.location.href);
      for (const key of [
        "item", "table", "tables", "object", "dax", "source", "objectKind", "expand",
        "catalog.item", "assets.item", "assets.table", "assets.object", "assets.objectId", "assets.objectKind",
        "access.item", "access.principal", "jobs.item", "jobs.job",
        "workspace.item", "workspace.comment", "governance.current", "governance.baseline",
        "xray.model", "xray.object", "tm.from", "tm.to", "tm.item", "tm.candidate",
      ]) url.searchParams.delete(key);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      const navigation = parseAtlasLocation(window.location);
      suppressRouteFocus.current = true;
      window.requestAnimationFrame(() => {
        suppressRouteFocus.current = false;
      });
      pendingWorkspaceFocus.current = captureWorkspaceFocus(focusId);
      setTab(navigation.tab);
      setFocus(navigation.focus);
      setWorkspaceSection(navigation.focus?.workspaceSection);
      setNavOpen(false);
      selectWorkspace(workspaceId);
    },
    [activeWorkspaceId, selectWorkspace, syncing, workspaceScopes],
  );

  const activeSnapshotLoaded =
    isPreview ||
    (!hydrating &&
      data.workspace.fabricId.toLowerCase() === activeWorkspaceId);
  useEffect(() => {
    const capture = pendingWorkspaceFocus.current;
    if (!capture || !activeSnapshotLoaded) return;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      if (pendingWorkspaceFocus.current !== capture) return;
      if (restoreWorkspaceFocus(capture)) {
        pendingWorkspaceFocus.current = undefined;
        return;
      }
      attempts += 1;
      if (attempts < 30) {
        frame = window.requestAnimationFrame(restore);
        return;
      }
      pendingWorkspaceFocus.current = undefined;
      const active = document.activeElement;
      if (!active || active === document.body) mainRef.current?.focus();
    };
    frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [activeSnapshotLoaded, activeWorkspaceId]);

  const nav = (target: Tab | AtlasNavigation) => navigate(target);

  if (!isPreview && hydrating) return <AtlasBootView />;
  if (!isPreview && (!hasData || requiresDeploymentSync)) {
    return (
      <WorkspaceSwitchContext.Provider value={switchWorkspace}>
        <FirstSyncView />
      </WorkspaceSwitchContext.Provider>
    );
  }

  return (
    <ExternalLineageProvider>
    <WorkspaceSwitchContext.Provider value={switchWorkspace}>
    <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
    <div className="atlas-shell-canvas relative flex h-screen overflow-hidden text-foreground">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-[200] rounded-md bg-primary px-m py-s text-primary-foreground focus:not-sr-only focus:fixed focus:left-m focus:top-m"
      >
        Skip to main content
      </button>
      <div
        className="atlas-brand-spectrum pointer-events-none absolute inset-x-0 top-0 z-[60] h-[3px]"
        aria-hidden="true"
      />
      <aside
        aria-label="Primary navigation"
        className="hidden w-[224px] shrink-0 flex-col border-r border-border bg-card lg:flex"
      >
        <SidebarContent tab={tab} data={data} onNavigate={nav} />
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="atlas-toolbar relative flex min-h-[52px] shrink-0 items-center justify-between border-b border-border bg-card px-m shadow-fabric-2 sm:px-l lg:px-xl">
          <div className="flex min-w-0 flex-1 items-center gap-[8px]">
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground lg:hidden"
              >
                <Menu size={17} />
              </button>
            </Dialog.Trigger>
            {workspaceSwitchable ? (
              <div className="flex min-w-0 items-center gap-xs text-[12px] text-muted-foreground sm:text-[13px]">
                <span className="hidden shrink-0 sm:inline">Fabric ·</span>
                <b className="min-w-0 truncate text-foreground md:hidden">
                  {data.workspace.displayName}
                </b>
                <WorkspaceSelector
                  id={HEADER_WORKSPACE_SELECT_ID}
                  compact
                  hideWhenSingle
                  className="hidden max-w-[36rem] md:flex"
                />
                <span className="hidden shrink-0 xl:inline">
                  · {NAV.find((n) => n.id === tab)?.label}
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-xs truncate text-[12px] text-muted-foreground sm:text-[13px]">
                <DomainFilter className="hidden md:inline-flex" />
                <span className="hidden sm:inline">Fabric · </span>
                <b className="text-foreground">{data.workspace.displayName}</b>
                <span className="hidden sm:inline">
                  {" "}
                  · {NAV.find((n) => n.id === tab)?.label}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-[8px] sm:gap-[12px] lg:gap-[14px]">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden h-[32px] items-center gap-s rounded-md border border-transparent bg-secondary px-m text-200 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground md:flex"
            >
              <Search className="icon-size-100" aria-hidden="true" />
              Search workspace
              <kbd className="rounded border border-border bg-muted px-xs py-xxs font-mono text-200">
                Ctrl K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search workspace"
              className="flex h-[32px] w-[32px] items-center justify-center rounded-md border border-transparent bg-secondary text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground md:hidden"
            >
              <Search className="icon-size-200" />
            </button>
            {hasData && <SnapshotExportPopover data={data} />}
            <SyncRunCompact
              onOpenDetails={() =>
                navigate({
                  tab: "workspace",
                  focus: {
                    requestId: crypto.randomUUID(),
                    workspaceSection: "synchronization",
                  },
                })
              }
            />
            <button
              type="button"
              onClick={() => {
                if (syncing) cancelSync();
                else void sync();
              }}
              disabled={
                !syncing &&
                (!canSync || (!isPreview && !configured))
              }
              title={
                syncing
                  ? "Cancel synchronization"
                  : !canSync
                    ? "Only the configured Atlas sync administrator can synchronize"
                    : !isPreview && !configured
                      ? "Atlas synchronization is not configured"
                      : undefined
              }
              className="flex h-[32px] items-center gap-[7px] rounded-md bg-primary px-[12px] text-[13px] font-semibold text-primary-foreground shadow-fabric-2 hover:bg-primary-hover disabled:opacity-70"
            >
              {syncing ? (
                <X size={15} />
              ) : (
                <RefreshCw size={15} />
              )}
              <span className="hidden sm:inline">
                {syncing ? "Cancel" : "Sync"}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                density.setValue(density.value === "compact" ? "comfortable" : "compact")
              }
              aria-label={density.value === "compact" ? "Switch to comfortable density" : "Switch to compact density"}
              aria-pressed={density.value === "compact"}
              title={density.value === "compact" ? "Use comfortable spacing" : "Use compact spacing"}
              className="flex items-center gap-s rounded-md border border-border bg-card px-s text-200 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Rows3 className="icon-size-200" aria-hidden="true" />
              <span className="hidden xl:inline">{density.value === "compact" ? "Compact" : "Comfortable"}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Avatar name={currentUser.name} size={30} />
          </div>
          <SyncRunProgressLine />
        </header>
        {density.error && (
          <p role="status" className="border-b border-status-warning/30 bg-status-warning/10 px-l py-s text-200 text-foreground">
            {density.error}
          </p>
        )}

        <main
          ref={mainRef}
          id="atlas-main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-auto bg-transparent"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${tab}:${focus?.requestId ?? "default"}:${data.workspace.snapshotId ?? "unsynced"}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="h-full"
            >
              <Suspense
                fallback={
                  <div
                    role="status"
                    className="flex h-full min-h-64 items-center justify-center text-300 text-muted-foreground"
                  >
                    Loading Fabric Atlas view...
                  </div>
                }
              >
              {tab === "overview" && <OverviewView onOpen={navigate} />}
              {tab === "map" && <MapView />}
              {tab === "external" && <ExternalLineageView />}
              {tab === "catalog" && (
                <CatalogView
                  focus={focus}
                  onStateChange={replaceViewState}
                />
              )}
              {tab === "assets" && (
                <AssetCatalogView
                  focus={focus}
                  onStateChange={replaceViewState}
                />
              )}
              {tab === "governance" && (
                <GovernanceCenterView
                  focus={focus}
                  onNavigate={navigate}
                  onStateChange={replaceViewState}
                />
              )}
              {tab === "access" && (
                <AccessView
                  initialItemId={focus?.itemId}
                  initialPrincipalId={focus?.principalId}
                  initialFilters={
                    focus?.query
                      ? { ...focus.filters, search: focus.query }
                      : focus?.filters
                  }
                  onStateChange={replaceViewState}
                />
              )}
              {tab === "jobs" && (
                <JobsView
                  focus={focus}
                  onStateChange={replaceViewState}
                  onNavigate={navigate}
                />
              )}
              {tab === "workspace" && (
                <WorkspaceHubView
                  focus={focus}
                  section={workspaceSection}
                  onStateChange={replaceViewState}
                />
              )}
              {tab === "mcp" && <McpView />}
              {tab === "about" && <AboutView />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette
        index={workspaceSearchIndex}
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onSelect={(result) => navigate(navigationForSearch(result))}
        onOpenXRay={(result) =>
          navigate({
            tab: "map",
            focus: {
              requestId: crypto.randomUUID(),
              itemId: result.target.itemId,
              tableName: result.target.tableName,
              objectName: result.target.objectName ?? result.title,
              objectKind: result.target.objectKind,
              filters: { view: "xray" },
            },
          })
        }
        catalogSearch={
          catalogAvailability === "disabled"
            ? undefined
            : { availability: catalogAvailability, search: searchOneLakeCatalog }
        }
      />
    </div>
      {navOpen && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-30 bg-black/45 lg:hidden" />
          <Dialog.Content
            asChild
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              if (desktopNavDismissal.current) event.preventDefault();
            }}
          >
            <aside
              aria-label="Primary navigation"
              className="fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col border-r border-border bg-card shadow-fabric-16 lg:hidden"
            >
              <Dialog.Title className="sr-only">
                Primary navigation
              </Dialog.Title>
              <SidebarContent
                tab={tab}
                data={data}
                mobile
                onNavigate={nav}
              />
            </aside>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
    </WorkspaceSwitchContext.Provider>
    </ExternalLineageProvider>
  );
}

export default App;
