export const PREVIEW_DATA_DASH = "8 5";
export const PREVIEW_CONTROL_DASH = "10 4 2 4";

function LegendLine({
  label,
  color,
  dash,
}: {
  label: string;
  color: string;
  dash?: string;
}) {
  return (
    <li className="flex items-center gap-s">
      <svg width="28" height="6" aria-hidden="true" className="shrink-0">
        <line
          x1="0"
          y1="3"
          x2="28"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dash}
        />
      </svg>
      {label}
    </li>
  );
}

/**
 * Graph legend. Source entries say where an edge comes from; the path
 * entries explain the selection highlight.
 */
export function LineageSourceLegend({
  mode,
  previewIncluded,
  previewControl = false,
}: {
  mode: "items" | "objects";
  previewIncluded: boolean;
  /** True when Beta control or lifecycle edges are drawn. */
  previewControl?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Lineage legend"
      className="sticky bottom-m left-m z-20 ml-m w-fit max-w-[calc(100%_-_var(--spacing-xxl))] rounded-lg border border-border bg-card px-m py-s text-200 text-foreground shadow-fabric-4"
    >
      <p className="mb-xs font-semibold">Sources and paths</p>
      <ul className="flex flex-wrap items-center gap-x-l gap-y-s">
        {mode === "items" && (
          <>
            {!previewIncluded && (
              <LegendLine
                label="Atlas snapshot (verified)"
                color="var(--color-lineage-downstream)"
              />
            )}
            {previewIncluded && (
              <>
                <LegendLine
                  label="Item Relations API (Beta, observed)"
                  color="var(--color-lineage-upstream)"
                  dash={PREVIEW_DATA_DASH}
                />
                {previewControl && (
                  <LegendLine
                    label="Beta control relation"
                    color="var(--color-lineage-upstream)"
                    dash={PREVIEW_CONTROL_DASH}
                  />
                )}
              </>
            )}
          </>
        )}
        <LegendLine
          label="Upstream path"
          color="var(--color-lineage-upstream)"
          dash="2 5"
        />
        {mode === "objects" && (
          <LegendLine
            label="Downstream path"
            color="var(--color-lineage-downstream)"
          />
        )}
      </ul>
      {mode === "items" && (
        <p className="mt-s border-t border-border pt-s text-muted-foreground">
          {previewIncluded
            ? "Only Item Relations API (Beta) lineage is drawn. Line labels use the API relationType."
            : "Only Atlas snapshot lineage is drawn."}
        </p>
      )}
    </div>
  );
}
