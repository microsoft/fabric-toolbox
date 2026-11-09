import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "../ui";

const PLATFORM_STYLE: Record<string, { label: string; color: string }> = {
  Databricks: { label: "DB", color: "#e5482f" },
  Oracle: { label: "ORA", color: "#c74634" },
  Snowflake: { label: "SF", color: "#29b5e8" },
  "Data source": { label: "SRC", color: "#605e5c" },
  Fabric: { label: "FAB", color: "#117865" },
};

export function PlatformBadge({ platform }: { platform?: string }) {
  const style = platform ? PLATFORM_STYLE[platform] : undefined;
  return (
    <span
      className="inline-flex h-[22px] min-w-[30px] shrink-0 items-center justify-center rounded-sm px-xs text-[10px] font-bold text-white"
      style={{ background: style?.color ?? "#8a8886" }}
      title={platform ?? "Unknown platform"}
    >
      {style?.label ?? (platform ? platform.slice(0, 3).toUpperCase() : "?")}
    </span>
  );
}

export function ExternalPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-xs rounded-full border border-[#0078d4]/40 bg-[#0078d4]/5 px-s py-[1px] text-100 font-semibold text-[#0078d4]">
      {children}
    </span>
  );
}

export function Note({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div
      className={cn(
        "flex items-start gap-s rounded-md p-s text-200 leading-300",
        tone === "info"
          ? "bg-signal-info-background text-signal-info-foreground"
          : "bg-signal-warning-background text-signal-warning-foreground",
        className,
      )}
    >
      <Icon className="mt-[1px] size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
