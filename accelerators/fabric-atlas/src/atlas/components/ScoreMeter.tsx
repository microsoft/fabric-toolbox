import { scoreBand, scoreStyle } from "./score-style";

export function ScoreMeter({ label, value }: { label: string; value: number | null }) {
  const known = value != null && Number.isFinite(value);
  const score = known ? Math.max(0, Math.min(100, value)) : undefined;
  return (
    <div
      role={known ? "meter" : undefined}
      aria-label={label}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={score}
      data-score-band={scoreBand(value)}
      className="h-s overflow-hidden rounded-full bg-muted"
      style={scoreStyle(value)}
    >
      <div className="atlas-score-fill h-full rounded-full" style={{ width: `${score ?? 0}%` }} />
      {!known && <span className="sr-only">{label}: not assessed</span>}
    </div>
  );
}
