import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties, ReactNode } from "react";
import {
  typeMeta,
  HEALTH_COLOR,
  avatarColor,
  initials,
  type Health,
  type ItemType,
  type PrincipalKind,
} from "./model";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round user avatar with deterministic colour + initials. */
export function Avatar({
  name,
  size = 28,
  title,
}: {
  name: string;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: avatarColor(name),
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(name)}
    </span>
  );
}

const KIND_ICON: Record<PrincipalKind, string> = {
  user: "",
  group: "▦",
  servicePrincipal: "⚙",
  guest: "★",
};

/** Avatar that adapts to the principal kind (user / group / SP / guest). */
export function PrincipalAvatar({
  name,
  kind,
  size = 28,
}: {
  name: string;
  kind: PrincipalKind;
  size?: number;
}) {
  if (kind === "user") return <Avatar name={name} size={size} />;
  const bg =
    kind === "guest" ? "#8a5a1e" : kind === "servicePrincipal" ? "#0f5f5a" : "#475569";
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.45),
        border: kind === "guest" ? "2px solid #f5a524" : undefined,
      }}
    >
      {KIND_ICON[kind] || initials(name)}
    </span>
  );
}

/** Colored rounded square with the 2-letter Fabric item-type code. */
export function TypeGlyph({ type, size = 32 }: { type: ItemType; size?: number }) {
  const meta = typeMeta(type);
  return (
    <span
      title={meta.label}
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-fabric-2 ring-1 ring-white/10"
      style={{
        width: size,
        height: size,
        background: meta.color,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {meta.code}
    </span>
  );
}

export function HealthDot({ health, size = 9 }: { health: Health; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: HEALTH_COLOR[health] }}
    />
  );
}

export function Chip({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-xxl items-center gap-xs rounded-md border border-transparent px-s py-xxs text-[length:var(--text-200)] font-semibold",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-fabric-2",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-200 font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  );
}

const ENDORSE_STYLE: Record<string, string> = {
  certified:
    "border-endorsement-certified/30 bg-endorsement-certified-background text-endorsement-certified",
  promoted:
    "border-endorsement-promoted/30 bg-endorsement-promoted-background text-endorsement-promoted",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function EndorsementChip({ endorsement }: { endorsement: string }) {
  const normalizedEndorsement = endorsement.trim().toLowerCase();
  if (normalizedEndorsement === "none" || !normalizedEndorsement) return null;
  const label =
    normalizedEndorsement === "certified"
      ? "Certified"
      : normalizedEndorsement === "promoted"
        ? "Promoted"
        : endorsement;
  return (
    <Chip
      className={
        ENDORSE_STYLE[normalizedEndorsement] ?? ENDORSE_STYLE.unknown
      }
    >
      {normalizedEndorsement === "certified" ? `✔ ${label}` : label}
    </Chip>
  );
}

export function HealthChip({ health }: { health: Health }) {
  const states: Record<Health, { label: string; tone: string }> = {
    healthy: { label: "Healthy", tone: "border-status-healthy/30 bg-status-healthy/10 text-status-healthy" },
    stale: { label: "Stale", tone: "border-status-warning/30 bg-status-warning/10 text-status-warning" },
    failing: { label: "Failing", tone: "border-status-failing/30 bg-status-failing/10 text-status-failing" },
    unknown: { label: "Health unknown", tone: "border-border bg-muted text-muted-foreground" },
  };
  const state = states[health];
  return (
    <span
      className={cn("inline-flex items-center gap-xs rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold", state.tone)}
    >
      <span className="size-s shrink-0 rounded-full bg-current" aria-hidden="true" />
      {state.label}
    </span>
  );
}
