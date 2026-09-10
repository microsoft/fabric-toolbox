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
import { Card, SectionLabel } from "../ui";
import {
  APP_VERSION,
  BUILD_COMMIT,
  REPOSITORY_URL,
  releaseUrl,
} from "../release";

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

  return (
    <div className="atlas-content-frame flex min-h-full items-center p-xl lg:p-xxl">
      <Card className="atlas-fabric-hero relative isolate w-full overflow-hidden border-border shadow-fabric-4">
        <div className="atlas-overview-beam" aria-hidden="true" />
        <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
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
              An open-source workspace explorer for catalog, lineage, effective
              access, sensitivity and operations — built as a Rayfin Data App and
              deployed directly into Microsoft Fabric.
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
            <SectionLabel>Clone &amp; run</SectionLabel>
            <div className="mt-m overflow-hidden rounded-xl border border-border bg-secondary">
              <div className="flex items-center gap-s border-b border-border px-m py-s text-200 text-muted-foreground">
                <span className="h-xs w-xs rounded-full bg-status-failing" />
                <span className="h-xs w-xs rounded-full bg-status-warning" />
                <span className="h-xs w-xs rounded-full bg-status-healthy" />
                <span className="ml-s">terminal</span>
              </div>
              <div className="flex items-center gap-m p-m">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-200 text-foreground">
                  {CLONE_COMMAND}
                </code>
                <button
                  type="button"
                  onClick={() => void copyCloneCommand()}
                  aria-label="Copy clone command"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <Check className="icon-size-200 text-status-healthy" />
                  ) : (
                    <Copy className="icon-size-200" />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-l grid grid-cols-2 gap-s">
              {[
                ["License", "MIT"],
                ["Build", BUILD_COMMIT],
                ["Runtime", "Rayfin"],
                ["Language", "TypeScript"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-card/65 p-m"
                >
                  <div className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <div className="mt-xs truncate text-300 font-semibold" title={value}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </Card>
    </div>
  );
}
