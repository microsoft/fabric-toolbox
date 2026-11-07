import type { CSSProperties } from "react";

export function scoreBand(value: number | null): "low" | "mid" | "high" | "unknown" {
  if (value == null || !Number.isFinite(value)) return "unknown";
  return value < 40 ? "low" : value < 70 ? "mid" : "high";
}

export function scoreStyle(value: number | null): CSSProperties & { "--atlas-score-fill": string } {
  if (value == null || !Number.isFinite(value)) return { "--atlas-score-fill": "var(--color-muted)" };
  const score = Math.max(0, Math.min(100, value));
  const lower = score <= 50 ? "low" : "mid";
  const upper = score <= 50 ? "mid" : "high";
  const mix = score <= 50 ? score * 2 : (score - 50) * 2;
  return {
    "--atlas-score-fill": `color-mix(in srgb, var(--color-score-${lower}), var(--color-score-${upper}) ${mix}%)`,
  };
}
