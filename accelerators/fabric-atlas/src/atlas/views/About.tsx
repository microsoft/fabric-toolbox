import { useState } from "react";
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Map,
  Package,
} from "lucide-react";
import { pythonCollectorRollbackEnabled } from "../browser-collector-sync";
import { PageHeader } from "../components/PageHeader";
import {
  APP_VERSION,
  BUILD_COMMIT,
  BUILD_DATE,
  FUNCTIONS_API_VERSION,
  RAYFIN_SDK_VERSION,
  REPOSITORY_URL,
  SNAPSHOT_CONTRACT_ID,
  releaseUrl,
} from "../release";
import { Card, SectionLabel } from "../ui";

const CLONE_COMMAND = `git clone ${REPOSITORY_URL}.git`;

function ProjectLink({
  href,
  icon: Icon,
  children,
  primary = false,
}: {
  href: string;
  icon: typeof Code2;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? "inline-flex items-center justify-center gap-s rounded-lg bg-primary px-l py-m text-300 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
          : "inline-flex items-center justify-center gap-s rounded-lg border border-border bg-background px-l py-m text-300 font-semibold transition-colors hover:border-primary/50 hover:bg-accent"
      }
    >
      <Icon className="icon-size-200" aria-hidden="true" />
      {children}
      <ExternalLink className="icon-size-100" aria-hidden="true" />
    </a>
  );
}

export function AboutView() {
  const [copied, setCopied] = useState(false);

  const copyCloneCommand = async () => {
    try {
      await navigator.clipboard.writeText(CLONE_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy the clone command", CLONE_COMMAND);
    }
  };

  const syncMode = pythonCollectorRollbackEnabled()
    ? "Python rollback"
    : "Rayfin collectors with Python compatibility";

  return (
    <div className="atlas-content-frame flex min-h-full flex-col gap-l p-l sm:p-xxl">
      <PageHeader
        title="About Fabric Atlas"
        purpose="Version, runtime and project links."
      />
      <Card className="atlas-fabric-hero relative isolate w-full overflow-hidden border-border shadow-fabric-4">
        <div className="atlas-overview-beam" aria-hidden="true" />
        <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
          <section className="flex flex-col justify-center p-xl sm:p-xxxl">
            <div className="flex flex-wrap items-center gap-s">
              <span className="inline-flex items-center gap-s rounded-full border border-status-healthy/30 bg-status-healthy/10 px-m py-s text-200 font-semibold text-status-healthy">
                <GitBranch className="icon-size-100" aria-hidden="true" />
                Open source
              </span>
              <span className="rounded-full border border-border bg-background/55 px-m py-s text-200 font-semibold">
                MIT licensed
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-m py-s font-mono text-200 font-semibold text-primary">
                v{APP_VERSION}
              </span>
            </div>

            <div className="mt-xl flex items-center gap-l">
              <span className="atlas-brand-mark flex icon-size-700 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                <Map className="icon-size-400" aria-hidden="true" />
              </span>
              <div>
                <SectionLabel>Microsoft Fabric governance</SectionLabel>
                <h1 className="mt-xs font-heading text-hero-800 font-bold leading-hero-800 sm:text-hero-900 sm:leading-hero-900">
                  Fabric Atlas
                </h1>
              </div>
            </div>

            <p className="atlas-overview-copy mt-l text-300 leading-500 text-muted-foreground">
              Workspace catalog, lineage, access evidence and operations in one
              Fabric app. Atlas stores metadata only.
            </p>

            <div className="mt-xl flex flex-col gap-s sm:flex-row sm:flex-wrap">
              <ProjectLink href={REPOSITORY_URL} icon={Code2} primary>
                View source
              </ProjectLink>
              <ProjectLink href={releaseUrl()} icon={Package}>
                Latest release
              </ProjectLink>
              <ProjectLink
                href={`${REPOSITORY_URL}/blob/main/CHANGELOG.md`}
                icon={GitCommitHorizontal}
              >
                Changelog
              </ProjectLink>
            </div>
          </section>

          <aside className="flex flex-col justify-center border-t border-border bg-secondary/70 p-xl sm:p-xxl lg:border-l lg:border-t-0">
            <SectionLabel>Runtime</SectionLabel>
            <dl className="mt-m grid grid-cols-2 gap-s">
              {[
                ["Rayfin SDK", RAYFIN_SDK_VERSION],
                ["Functions API", `v${FUNCTIONS_API_VERSION}`],
                ["Snapshot", SNAPSHOT_CONTRACT_ID],
                ["Build", BUILD_COMMIT],
                ["Built", BUILD_DATE],
                ["Sync", `${syncMode}, browser-run`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-xl border border-border bg-card/70 p-m"
                >
                  <dt className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-xs break-words text-200 font-semibold" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-xl">
              <SectionLabel>Clone</SectionLabel>
            </div>
            <div className="mt-m flex items-center gap-m rounded-xl border border-border bg-card p-m">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-200 text-foreground">
                {CLONE_COMMAND}
              </code>
              <button
                type="button"
                onClick={() => void copyCloneCommand()}
                aria-label="Copy clone command"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="icon-size-200 text-status-healthy" />
                ) : (
                  <Copy className="icon-size-200" />
                )}
              </button>
            </div>
          </aside>
        </div>
      </Card>
    </div>
  );
}
