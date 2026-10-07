import { useId } from "react";

export interface TrendDatum {
  label: string;
  value: number | null;
}

export function TrendChart({
  title,
  data,
  valueLabel,
  maxValue,
  referenceValue,
}: {
  title: string;
  data: TrendDatum[];
  valueLabel: (value: number) => string;
  maxValue?: number;
  referenceValue?: number;
}) {
  const titleId = useId();
  const width = 720;
  const height = 220;
  const padding = { top: 22, right: 24, bottom: 44, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = data
    .map((point) => point.value)
    .filter((value): value is number => value != null);
  const max = Math.max(maxValue ?? 0, ...values, 1);
  const x = (index: number) =>
    padding.left +
    (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (value: number) =>
    padding.top + innerHeight - (value / max) * innerHeight;
  const segments: string[][] = [];
  let currentSegment: string[] = [];
  data.forEach((point, index) => {
    if (point.value == null) {
      if (currentSegment.length) segments.push(currentSegment);
      currentSegment = [];
      return;
    }
    currentSegment.push(`${x(index)},${y(point.value)}`);
  });
  if (currentSegment.length) segments.push(currentSegment);

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        className="h-auto w-full"
      >
        <title id={titleId}>{title}</title>
        {[0, 0.5, 1].map((ratio) => {
          const value = Math.round(max * ratio);
          const lineY = y(value);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={lineY}
                x2={width - padding.right}
                y2={lineY}
                stroke="var(--color-border)"
                strokeDasharray={ratio === 0 ? undefined : "3 6"}
              />
              <text
                x={padding.left - 10}
                y={lineY + 4}
                textAnchor="end"
                fill="var(--color-muted-foreground)"
                fontSize="11"
              >
                {valueLabel(value)}
              </text>
            </g>
          );
        })}
        {referenceValue != null && (
          <line
            x1={padding.left}
            y1={y(referenceValue)}
            x2={width - padding.right}
            y2={y(referenceValue)}
            stroke="var(--color-status-warning)"
            strokeWidth="2"
            strokeDasharray="7 5"
          >
            <title>Target: {valueLabel(referenceValue)}</title>
          </line>
        )}
        {segments.length === 1 &&
          segments[0].length === data.length &&
          data.length > 1 && (
            <polygon
              points={[
                `${x(0)},${y(0)}`,
                ...segments[0],
                `${x(data.length - 1)},${y(0)}`,
              ].join(" ")}
              fill="color-mix(in srgb, var(--color-primary) 12%, transparent)"
            />
          )}
        {segments.map((points, index) => (
          <polyline
            key={index}
            points={points.join(" ")}
            fill="none"
            stroke="var(--color-brand-foreground)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {data.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            {point.value != null && (
              <circle
                cx={x(index)}
                cy={y(point.value)}
                r="5"
                fill="var(--color-card)"
                stroke="var(--color-brand-foreground)"
                strokeWidth="3"
              />
            )}
            {(index === 0 ||
              index === data.length - 1 ||
              data.length <= 6) && (
              <text
                x={x(index)}
                y={height - 17}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize="11"
              >
                {point.label}
              </text>
            )}
            <title>
              {point.label}:{" "}
              {point.value == null ? "Not evaluable" : valueLabel(point.value)}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}
