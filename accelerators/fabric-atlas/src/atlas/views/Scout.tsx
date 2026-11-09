import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Code2,
  Copy,
  Database,
  Eye,
  Globe,
  Loader2,
  Lock,
  Maximize2,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Square,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ScoutEvidence, ScoutPhase } from "../scout";
import { useScoutChat, type ScoutChatTurn } from "../scout-chat-context";
import {
  classifyScoutCell,
  parseScoutInline,
  parseScoutMarkdown,
  scoutLineage,
  tokenizeSql,
  splitScoutLabel,
  type ScoutBlock,
  type ScoutLineage,
  type ScoutLineageNode,
  type ScoutListItem,
  type ScoutTone,
} from "../scout-markdown";
import { useAtlas } from "../store";
import { Card, cn } from "../ui";

interface Suggestion {
  pillar: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  question: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    pillar: "Scorecard",
    icon: Sparkles,
    tone: "text-fabric-purple bg-fabric-purple/10",
    title: "Governance scorecard",
    question: "Give me the governance scorecard of each workspace with the top 3 priority findings.",
  },
  {
    pillar: "Health",
    icon: Activity,
    tone: "text-status-failing bg-status-failing/10",
    title: "Failures and blast radius",
    question: "Which items are failing and what lineage do they break downstream?",
  },
  {
    pillar: "Protect",
    icon: Globe,
    tone: "text-status-warning bg-status-warning/10",
    title: "External exposure",
    question: "Which items are shared with external users or guests?",
  },
  {
    pillar: "Protect",
    icon: Lock,
    tone: "text-fabric-blue bg-fabric-blue/10",
    title: "Label coverage",
    question: "What is the sensitivity label and endorsement coverage per workspace?",
  },
  {
    pillar: "Trust",
    icon: BadgeCheck,
    tone: "text-status-healthy bg-status-healthy/10",
    title: "Endorsement gaps",
    question: "Which semantic models and reports are used most but are not endorsed?",
  },
  {
    pillar: "Ownership",
    icon: UserRound,
    tone: "text-fabric-teal bg-fabric-teal/10",
    title: "Orphan items",
    question: "Which items have no owner or no description?",
  },
];

const PHASES: { id: ScoutPhase; label: string }[] = [
  { id: "connecting", label: "Opening a secure session" },
  { id: "thinking", label: "Understanding the question" },
  { id: "querying", label: "Querying the Atlas store" },
  { id: "writing", label: "Writing the answer" },
];

const TONE_PILL: Record<ScoutTone, string> = {
  healthy: "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
  warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  failing: "border-status-failing/30 bg-status-failing/10 text-status-failing",
};


function ScoutOrb({ size, busy = false }: { size: number; busy?: boolean }) {
  return (
    <div className="atlas-scout-orb" style={{ width: size, height: size }} aria-hidden="true">
      <div className={cn("atlas-scout-sweep", busy && "atlas-scout-sweep-fast")} />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" className="text-border" strokeWidth="0.6" />
        <circle
          cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 5"
          className="atlas-scout-ring text-fabric-teal"
        />
        <circle
          cx="50" cy="50" r="24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="10 6"
          className="atlas-scout-ring atlas-scout-ring-reverse text-fabric-purple"
        />
        {[
          [22, 30, 0],
          [76, 26, 0.6],
          [80, 68, 1.2],
          [28, 74, 1.8],
          [50, 12, 0.9],
        ].map(([cx, cy, delay]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx} cy={cy} r="2.4"
            className="atlas-scout-node fill-fabric-blue"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Sparkles className="text-primary" style={{ width: size * 0.26, height: size * 0.26 }} />
      </div>
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseScoutInline(text).map((part, index) =>
        part.kind === "strong" ? (
          <strong key={index} className="font-semibold text-foreground">{part.text}</strong>
        ) : part.kind === "code" ? (
          <code key={index} className="rounded-sm bg-muted px-xxs font-mono text-[0.92em]">{part.text}</code>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function SqlCode({ sql }: { sql: string }) {
  return (
    <code>
      {tokenizeSql(sql).map((token, index) =>
        token.kind === "text" ? (
          <Fragment key={index}>{token.text}</Fragment>
        ) : (
          <span key={index} className={`atlas-scout-sql-${token.kind}`}>{token.text}</span>
        ),
      )}
    </code>
  );
}

function Cell({ value, header }: { value: string; header?: string }) {
  const cell = classifyScoutCell(value, header);
  if (cell.kind === "percent") {
    const tone = cell.value >= 80 ? "bg-status-healthy" : cell.value >= 50 ? "bg-status-warning" : "bg-status-failing";
    return (
      <div className="flex min-w-[110px] items-center gap-s">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full", tone)}
            initial={{ width: 0 }}
            animate={{ width: `${cell.value}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className="w-[44px] text-right font-semibold tabular-nums">{cell.text}</span>
      </div>
    );
  }
  if (cell.kind === "status") {
    return (
      <span className={cn("inline-flex rounded-full border px-s py-[1px] text-100 font-semibold", TONE_PILL[cell.tone])}>
        {cell.text}
      </span>
    );
  }
  if (cell.kind === "number") return <span className="block text-right font-semibold tabular-nums">{cell.text}</span>;
  return <Inline text={cell.text} />;
}

function ItemText({ text }: { text: string }) {
  const split = splitScoutLabel(text);
  if (!split) return <Inline text={text} />;
  const status = split.value ? classifyScoutCell(split.value) : null;
  return (
    <>
      <span className="font-semibold text-foreground">{split.label}</span>
      {split.value && <span className="text-muted-foreground">: </span>}
      {status?.kind === "status" ? (
        <span className={cn("inline-flex rounded-full border px-s py-[1px] align-middle text-100 font-semibold", TONE_PILL[status.tone])}>
          {status.text}
        </span>
      ) : (
        split.value && <Inline text={split.value} />
      )}
    </>
  );
}

function ListItems({ items, depth }: { items: ScoutListItem[]; depth: number }) {
  return (
    <ul className={cn("flex flex-col", depth === 0 ? "gap-s" : "gap-xxs")}>
      {items.map((item, index) => {
        const section = depth === 0 && item.children.length > 0;
        return (
          <li key={index} className="flex flex-col gap-xxs">
            <div className="flex gap-s">
              <span
                className={cn(
                  "mt-[3px] flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  item.ordered ? "bg-primary/10 text-primary" : "bg-transparent",
                )}
                aria-hidden="true"
              >
                {item.ordered ? item.number : <span className={cn("rounded-full", depth === 0 ? "h-[6px] w-[6px] bg-primary/60" : "h-[5px] w-[5px] bg-muted-foreground/50")} />}
              </span>
              <span className={cn("min-w-0", section && "font-semibold text-foreground")}>
                <ItemText text={item.text} />
              </span>
            </div>
            {item.children.length > 0 && (
              <div className="ml-[8px] border-l border-border pl-l">
                <ListItems items={item.children} depth={depth + 1} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
        <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-background/60">
        <table className="w-full border-collapse text-200">
          <thead>
            <tr className="bg-muted/60">
              {header.map((cell, index) => (
                <th key={index} scope="col" className="whitespace-nowrap px-m py-s text-left text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                  <Inline text={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <motion.tr
                key={rowIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(rowIndex, 12) * 0.035 }}
                className="border-t border-border transition-colors hover:bg-accent/50"
              >
                {row.map((cell, index) => (
                  <td key={index} className="px-m py-s align-middle"><Cell value={cell} header={header[index]} /></td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}

const NODE_TONE: Record<ScoutLineageNode["tone"], string> = {
  neutral: "border-border",
  healthy: "border-status-healthy/50",
  warning: "border-status-warning/50",
  failing: "border-status-failing/60 bg-status-failing/[0.06]",
};

const NODE_DOT: Record<ScoutLineageNode["tone"], string> = {
  neutral: "bg-muted-foreground/40",
  healthy: "bg-status-healthy",
  warning: "bg-status-warning",
  failing: "bg-status-failing",
};

function LineageGraph({ lineage, compact }: { lineage: ScoutLineage; compact: boolean }) {
  const markerId = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const nodeW = compact ? 150 : 184;
  const nodeH = 46;
  const colGap = compact ? 52 : 76;
  const rowGap = 14;
  const pad = 10;
  const width = pad * 2 + lineage.layers * nodeW + (lineage.layers - 1) * colGap;
  const height = pad * 2 + lineage.rows * nodeH + (lineage.rows - 1) * rowGap;
  const perLayer = new Map<number, number>();
  for (const node of lineage.nodes) perLayer.set(node.layer, (perLayer.get(node.layer) ?? 0) + 1);
  const position = new Map(
    lineage.nodes.map((node) => {
      const offset = ((lineage.rows - (perLayer.get(node.layer) ?? 1)) * (nodeH + rowGap)) / 2;
      return [node.id, { x: pad + node.layer * (nodeW + colGap), y: pad + offset + node.row * (nodeH + rowGap) }];
    }),
  );
  const links = new Map<string, { from: string; to: string; relations: string[]; broken: boolean }>();
  for (const edge of lineage.edges) {
    if (edge.from === edge.to) continue;
    const key = `${edge.from}\u0001${edge.to}`;
    const link = links.get(key) ?? { from: edge.from, to: edge.to, relations: [], broken: false };
    if (edge.relation && !link.relations.includes(edge.relation)) link.relations.push(edge.relation);
    link.broken ||= edge.broken;
    links.set(key, link);
  }
  const showLabels = !compact && links.size <= 16;
  const failing = lineage.nodes.filter((node) => node.tone === "failing").length;
  const broken = [...links.values()].filter((link) => link.broken).length;

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-m text-100 text-muted-foreground">
        <span className="inline-flex items-center gap-xs font-semibold text-foreground">
          <Share2 className="icon-size-100 text-primary" aria-hidden="true" />
          Lineage graph
        </span>
        <span>{lineage.nodes.length} items · {links.size} links</span>
        {broken > 0 && <span className="text-status-failing">{broken} broken</span>}
        {failing > 0 && <span className="text-status-failing">{failing} failing</span>}
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-background/60">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Lineage graph with ${lineage.nodes.length} items and ${links.size} links`}
          className="block"
        >
          <defs>
            {(["ok", "broken"] as const).map((kind) => (
              <marker
                key={kind}
                id={`${markerId}-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className={kind === "broken" ? "fill-status-failing" : "fill-muted-foreground/60"} />
              </marker>
            ))}
          </defs>
          {[...links.values()].map((link, index) => {
            const a = position.get(link.from)!;
            const b = position.get(link.to)!;
            const x1 = a.x + nodeW;
            const y1 = a.y + nodeH / 2;
            const x2 = b.x;
            const y2 = b.y + nodeH / 2;
            const forward = x2 > x1;
            const bend = forward ? (x2 - x1) / 2 : 56;
            const drop = forward ? 0 : nodeH;
            const d = `M${x1},${y1} C${x1 + bend},${y1 + drop} ${x2 - bend},${y2 + drop} ${x2 - 2},${y2}`;
            const label = link.relations.join(" · ");
            return (
              <g key={`${link.from}-${link.to}`}>
                <motion.path
                  d={d}
                  fill="none"
                  strokeWidth={link.broken ? 1.6 : 1.3}
                  strokeDasharray={link.broken ? "5 4" : undefined}
                  className={link.broken ? "stroke-status-failing" : "stroke-muted-foreground/45"}
                  markerEnd={`url(#${markerId}-${link.broken ? "broken" : "ok"})`}
                  initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.15 + Math.min(index, 20) * 0.04, ease: "easeOut" }}
                >
                  {label && <title>{label}</title>}
                </motion.path>
                {showLabels && label && forward && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                    style={{ paintOrder: "stroke", stroke: "var(--color-background)", strokeWidth: 4 }}
                  >
                    {label.length > 22 ? `${label.slice(0, 21)}…` : label}
                  </text>
                )}
              </g>
            );
          })}
          {lineage.nodes.map((node, index) => {
            const { x, y } = position.get(node.id)!;
            return (
              <motion.foreignObject
                key={node.id}
                x={x}
                y={y}
                width={nodeW}
                height={nodeH}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: node.layer * 0.12 + Math.min(index, 20) * 0.015 }}
              >
                <div
                  title={node.type ? `${node.label} (${node.type})` : node.label}
                  className={cn(
                    "flex h-full flex-col justify-center rounded-lg border bg-card px-s shadow-fabric-2",
                    NODE_TONE[node.tone],
                    node.layer === 0 && node.tone === "neutral" && "border-primary/50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-xs">
                    <span className={cn("h-[6px] w-[6px] shrink-0 rounded-full", NODE_DOT[node.tone])} aria-hidden="true" />
                    <span className="truncate text-100 font-semibold text-foreground">{node.label}</span>
                  </span>
                  {node.type && <span className="truncate pl-[10px] text-[10px] text-muted-foreground">{node.type}</span>}
                </div>
              </motion.foreignObject>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function Block({ block, compact }: { block: ScoutBlock; compact: boolean }): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <div className={cn("flex items-center gap-s font-semibold", block.level <= 2 ? "text-400" : "text-300")}>
          <span className="h-[14px] w-[3px] rounded-full bg-primary/50" aria-hidden="true" />
          <Inline text={block.text} />
        </div>
      );
    case "list":
      return <ListItems items={block.items} depth={0} />;
    case "table": {
      const lineage = scoutLineage(block.header, block.rows);
      if (!lineage) return <TableBlock header={block.header} rows={block.rows} />;
      return (
        <div className="flex flex-col gap-s">
          <LineageGraph lineage={lineage} compact={compact} />
          <details className="group rounded-lg border border-border bg-muted/20">
            <summary className="cursor-pointer select-none px-m py-s text-100 font-semibold text-muted-foreground hover:text-foreground">
              Lineage table ({block.rows.length} edges)
            </summary>
            <div className="p-s pt-0">
              <TableBlock header={block.header} rows={block.rows} />
            </div>
          </details>
        </div>
      );
    }
    case "code":
      return (
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40 p-m font-mono text-100 leading-200">
          {block.language.toLowerCase() === "sql" ? <SqlCode sql={block.text} /> : block.text}
        </pre>
      );
    default:
      return <p><Inline text={block.text} /></p>;
  }
}

function ScoutAnswerText({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = useMemo(() => parseScoutMarkdown(text), [text]);
  return (
    <div className={cn("flex flex-col text-foreground/90", compact ? "gap-s text-200 leading-300" : "gap-m text-300 leading-400")}>
      {blocks.map((block, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index, 10) * 0.06, duration: 0.3 }}
        >
          <Block block={block} compact={compact} />
        </motion.div>
      ))}
    </div>
  );
}

function Evidence({ evidence }: { evidence: ScoutEvidence }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  if (!evidence.sql.length && !evidence.results.length) return null;
  const copy = (sql: string, index: number) => {
    void navigator.clipboard?.writeText(sql).then(() => {
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-s px-m py-s text-left text-200 font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Code2 className="icon-size-100 text-fabric-purple" aria-hidden="true" />
        Evidence
        <span className="rounded-full bg-fabric-purple/10 px-s text-100 text-fabric-purple">
          {evidence.sql.length} SQL
        </span>
        {evidence.results.length > 0 && (
          <span className="rounded-full bg-fabric-teal/10 px-s text-100 text-fabric-teal">
            {evidence.results.length} result{evidence.results.length > 1 ? "s" : ""}
          </span>
        )}
        <motion.span className="ml-auto" animate={{ rotate: open ? 90 : 0 }} aria-hidden="true">
          <ArrowUpRight className="icon-size-100" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-m border-t border-border p-m">
              {evidence.sql.map((sql, index) => (
                <div key={`sql-${index}`} className="relative">
                  <button
                    type="button"
                    onClick={() => copy(sql, index)}
                    className="absolute right-s top-s inline-flex items-center gap-xxs rounded-md border border-border bg-card px-s py-[2px] text-100 hover:bg-accent"
                  >
                    {copied === index ? <Check className="icon-size-100 text-status-healthy" /> : <Copy className="icon-size-100" />}
                    {copied === index ? "Copied" : "Copy"}
                  </button>
                  <pre className="max-w-full overflow-x-auto rounded-md border border-border bg-background p-m pr-[84px] font-mono text-100 leading-200">
                    <SqlCode sql={sql} />
                  </pre>
                </div>
              ))}
              {evidence.results.map((table, index) => (
                <ScoutAnswerText key={`result-${index}`} text={table} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Thinking({ phase, startedAt }: { phase: ScoutPhase; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const current = PHASES.findIndex((item) => item.id === phase);
  return (
    <Card className="relative flex flex-col gap-s overflow-hidden p-l">
      <div className="atlas-scout-shimmer absolute inset-x-0 top-0 h-[2px]" aria-hidden="true" />
      {PHASES.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: done || active ? 1 : 0.4, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-s text-200"
          >
            <span
              className={cn(
                "flex h-[20px] w-[20px] items-center justify-center rounded-full border",
                done && "border-status-healthy bg-status-healthy text-white",
                active && "border-primary text-primary",
                !done && !active && "border-border",
              )}
            >
              {done ? <Check className="h-[12px] w-[12px]" /> : active ? <Loader2 className="h-[12px] w-[12px] animate-spin" /> : null}
            </span>
            <span className={cn(active && "font-semibold")}>{item.label}</span>
            {active && (
              <span className="ml-auto tabular-nums text-100 text-muted-foreground">
                {Math.max(0, Math.round((now - startedAt) / 1000))}s
              </span>
            )}
          </motion.div>
        );
      })}
    </Card>
  );
}

function NotConfigured({ reason }: { reason: string }) {
  return (
    <Card className="flex flex-col gap-s p-l">
      <div className="flex items-center gap-s text-300 font-semibold">
        <AlertTriangle className="icon-size-200 text-status-warning" aria-hidden="true" />
        Atlas Scout is not available
      </div>
      <p className="text-200 leading-300 text-muted-foreground">{reason}</p>
      <ol className="list-decimal pl-l text-200 leading-300 text-muted-foreground">
        <li>Run <code className="font-mono">fabric/data-agent/atlas-scout/provision.py</code> to create and publish the Data Agent on the Atlas SQL database.</li>
        <li>Set <code className="font-mono">RAYFIN_PUBLIC_ATLAS_SCOUT_AGENT_ID</code> in <code className="font-mono">rayfin/.env</code> and redeploy with <code className="font-mono">rayfin up</code>.</li>
      </ol>
    </Card>
  );
}

function TurnList({ turns, compact = false }: { turns: ScoutChatTurn[]; compact?: boolean }) {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 };
  return (
    <div className={cn("flex flex-col", compact ? "gap-m" : "gap-l")} aria-live="polite">
      <AnimatePresence initial={false}>
        {turns.map((turn) => (
          <motion.div key={turn.id} layout initial={enter} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-s">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "max-w-[85%] self-end rounded-2xl rounded-br-sm border border-primary/15 bg-primary/[0.07] text-foreground",
                compact ? "px-m py-xs text-200" : "px-l py-s text-300",
              )}
            >
              {turn.question}
            </motion.div>
            {turn.answer !== undefined ? (
              <Card className={cn("flex flex-col gap-m", compact ? "p-m text-200" : "p-l")}>
                <ScoutAnswerText text={turn.answer} compact={compact} />
                {turn.evidence && <Evidence evidence={turn.evidence} />}
                {turn.durationMs !== undefined && (
                  <span className="text-100 text-muted-foreground">
                    Answered in {(turn.durationMs / 1000).toFixed(1)}s from the Atlas store
                  </span>
                )}
              </Card>
            ) : turn.error ? (
              <motion.div
                role="alert"
                initial={reduceMotion ? false : { x: -6 }}
                animate={{ x: [-6, 6, -3, 0] }}
                className="flex items-start gap-s rounded-lg border border-status-failing/30 bg-status-failing/10 px-m py-s text-200 leading-300"
              >
                <AlertTriangle className="icon-size-200 mt-[2px] shrink-0 text-status-failing" aria-hidden="true" />
                {turn.error}
              </motion.div>
            ) : (
              <Thinking phase={turn.phase} startedAt={turn.startedAt} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Composer({ id, compact = false, className }: { id: string; compact?: boolean; className?: string }) {
  const { ask, stop, busy } = useScoutChat();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (!busy && asked.current) inputRef.current?.focus();
  }, [busy]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    asked.current = true;
    void ask(draft);
    setDraft("");
  };

  return (
    <form
      className={cn("flex items-end gap-s rounded-2xl border border-border bg-card p-s", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">Ask Atlas Scout</label>
      {!compact && <Sparkles className="icon-size-200 mb-[11px] ml-s shrink-0 text-primary/70" aria-hidden="true" />}
      <textarea
        ref={inputRef}
        id={id}
        value={draft}
        rows={compact ? 1 : 2}
        maxLength={2000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={compact ? "Ask Scout…" : "Ask about health, access, labels, lineage…"}
        className={cn(
          "flex-1 resize-none bg-transparent px-xs py-xs outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
          compact ? "min-h-[36px] text-200" : "min-h-[44px] text-300",
        )}
      />
      {busy ? (
        <button
          type="button"
          onClick={stop}
          aria-label="Stop"
          className={cn(
            "inline-flex items-center justify-center rounded-xl border border-border bg-background transition-colors hover:bg-accent",
            compact ? "h-[34px] w-[34px]" : "h-[40px] w-[40px]",
          )}
        >
          <Square className="icon-size-100 fill-current" aria-hidden="true" />
        </button>
      ) : (
        <motion.button
          type="submit"
          disabled={!draft.trim()}
          whileTap={{ scale: 0.9 }}
          aria-label="Send question"
          className={cn(
            "inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-35",
            compact ? "h-[34px] w-[34px]" : "h-[40px] w-[40px]",
          )}
        >
          <Send className={compact ? "icon-size-100" : "icon-size-200"} aria-hidden="true" />
        </motion.button>
      )}
    </form>
  );
}

function useAutoScroll(dependency: unknown) {
  const reduceMotion = useReducedMotion();
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
  }, [dependency, reduceMotion]);
  return bottomRef;
}

export function ScoutView() {
  const { isPreview } = useAtlas();
  const { configured, turns, busy, ask, reset } = useScoutChat();
  const reduceMotion = useReducedMotion();
  const started = turns.length > 0;
  const bottomRef = useAutoScroll(turns);
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 };

  return (
    <div className="atlas-content-frame flex min-h-full flex-col gap-l p-l sm:p-xxl">
      <motion.section
        layout
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="atlas-scout-hero relative overflow-hidden rounded-2xl border border-border shadow-fabric-4"
      >
        <div className="atlas-sync-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <motion.div
          layout
          className={cn("relative flex items-center", started ? "gap-m p-m sm:px-l" : "flex-col gap-l p-xl text-center sm:flex-row sm:p-xxl sm:text-left")}
        >
          <motion.div
            layout
            initial={reduceMotion ? false : { scale: 0.4, rotate: -40, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}
          >
            <ScoutOrb size={started ? 48 : 148} busy={busy} />
          </motion.div>
          <motion.div layout className="flex min-w-0 flex-1 flex-col gap-xs">
            <motion.div
              initial={enter}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={cn("flex flex-wrap items-center gap-s", !started && "justify-center sm:justify-start")}
            >
              <h1 className={cn("font-semibold tracking-tight text-foreground", started ? "text-500" : "text-[2.25rem] leading-tight")}>
                Atlas Scout
              </h1>
              <span className="inline-flex items-center gap-xxs rounded-full border border-status-healthy/30 bg-status-healthy/10 px-s py-[2px] text-100 font-semibold text-status-healthy">
                <Database className="h-[12px] w-[12px]" aria-hidden="true" />
                Fabric Data Agent · read-only
              </span>
            </motion.div>
            {!started && (
              <motion.p
                initial={enter}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38 }}
                className="max-w-[640px] text-300 leading-400 text-muted-foreground"
              >
                Ask governance questions in plain language. Scout queries the Atlas store, explains what it
                found across Health, Protect and Trust, and shows the SQL behind every answer.
              </motion.p>
            )}
          </motion.div>
          {started && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-xs rounded-md border border-border bg-background px-m py-xs text-200 font-semibold transition-colors hover:bg-accent"
            >
              <RotateCcw className="icon-size-100" aria-hidden="true" />
              New conversation
            </motion.button>
          )}
        </motion.div>
      </motion.section>

      {isPreview ? (
        <NotConfigured reason="Atlas Scout queries the live Atlas SQL database and is not available in preview mode." />
      ) : !configured ? (
        <NotConfigured reason="No Data Agent is configured for this deployment." />
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center gap-s text-100 text-muted-foreground"
          >
            <Eye className="icon-size-100 shrink-0 text-status-warning" aria-hidden="true" />
            v1 sees every synchronized workspace in the Atlas store, regardless of your workspace roles.
          </motion.div>

          <AnimatePresence>
            {!started && (
              <motion.div
                key="suggestions"
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                className="grid gap-m sm:grid-cols-2 xl:grid-cols-3"
              >
                {SUGGESTIONS.map((suggestion, index) => {
                  const Icon = suggestion.icon;
                  return (
                    <motion.button
                      key={suggestion.title}
                      type="button"
                      initial={enter}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 + index * 0.07, duration: 0.35 }}
                      whileHover={reduceMotion ? undefined : { y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => void ask(suggestion.question)}
                      className="group flex flex-col gap-s rounded-xl border border-border bg-card p-l text-left shadow-fabric-2 transition-colors hover:border-primary/40 hover:shadow-fabric-4"
                    >
                      <div className="flex items-center gap-s">
                        <span className={cn("flex h-[32px] w-[32px] items-center justify-center rounded-lg", suggestion.tone)}>
                          <Icon className="icon-size-200" aria-hidden="true" />
                        </span>
                        <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">{suggestion.pillar}</span>
                        <ArrowUpRight className="icon-size-100 ml-auto text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      </div>
                      <span className="text-300 font-semibold">{suggestion.title}</span>
                      <span className="text-200 leading-300 text-muted-foreground">{suggestion.question}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <TurnList turns={turns} />
          <div ref={bottomRef} />

          <motion.div initial={enter} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="sticky bottom-0 mt-auto">
            <Composer id="atlas-scout-question" className="atlas-scout-composer shadow-fabric-4" />
          </motion.div>
        </>
      )}
    </div>
  );
}

const DOCK_SUGGESTIONS = [
  "Which items are failing and what do they break downstream?",
  "Which items have no owner or no description?",
  "Which workspaces have the lowest governance score?",
];

/** Collapsed Atlas Scout bubble (bottom-right) that opens a compact chat on any page. */
export function ScoutDock({ onExpand }: { onExpand: () => void }) {
  const { available, turns, busy, ask, reset, dockOpen: open, setDockOpen: setOpen } = useScoutChat();
  const reduceMotion = useReducedMotion();
  const bottomRef = useAutoScroll(open ? turns : null);
  if (!available) return null;

  return (
    <div className="fixed bottom-l right-l z-50 flex flex-col items-end gap-m">
      <AnimatePresence>
        {open && (
          <motion.section
            key="scout-dock"
            role="dialog"
            aria-label="Atlas Scout"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(600px,calc(100vh-120px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-fabric-16"
          >
            <header className="atlas-scout-dock-header flex items-center gap-s px-m py-s text-white">
              <ScoutOrb size={32} busy={busy} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-300 font-semibold leading-tight">Atlas Scout</span>
                <span className="text-100 text-white/80">Governance answers from the Atlas store</span>
              </div>
              {turns.length > 0 && (
                <button type="button" onClick={reset} aria-label="New conversation" title="New conversation" className="rounded-md p-xs text-white/80 transition-colors hover:bg-white/15 hover:text-white">
                  <RotateCcw className="icon-size-100" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={onExpand} aria-label="Open full Atlas Scout" title="Open full view" className="rounded-md p-xs text-white/80 transition-colors hover:bg-white/15 hover:text-white">
                <Maximize2 className="icon-size-100" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Atlas Scout" className="rounded-md p-xs text-white/80 transition-colors hover:bg-white/15 hover:text-white">
                <X className="icon-size-100" aria-hidden="true" />
              </button>
            </header>
            <div className="atlas-scout-dock-body flex-1 overflow-y-auto p-m">
              {turns.length === 0 ? (
                <div className="flex flex-col gap-s">
                  <p className="text-200 leading-300 text-muted-foreground">
                    Ask a governance question in plain language. Try one of these:
                  </p>
                  {DOCK_SUGGESTIONS.map((question, index) => (
                    <motion.button
                      key={question}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + index * 0.06 }}
                      onClick={() => void ask(question)}
                      className="flex items-center gap-s rounded-lg border border-primary/20 bg-card px-m py-s text-left text-200 shadow-fabric-2 transition-colors hover:border-primary/50 hover:bg-primary/[0.05]"
                    >
                      <Sparkles className="icon-size-100 shrink-0 text-primary" aria-hidden="true" />
                      {question}
                    </motion.button>
                  ))}
                </div>
              ) : (
                <TurnList turns={turns} compact />
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-border bg-card p-s">
              <Composer id="atlas-scout-dock-question" compact className="atlas-scout-composer rounded-xl border-border bg-background p-xs" />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close Atlas Scout" : "Open Atlas Scout"}
        aria-expanded={open}
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={reduceMotion ? undefined : { scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
        className="atlas-scout-bubble relative flex h-[56px] w-[56px] items-center justify-center rounded-full text-white shadow-fabric-8"
      >
        {busy && <span className="atlas-scout-bubble-pulse absolute inset-0 rounded-full" aria-hidden="true" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex"
          >
            {open ? <X className="icon-size-200" aria-hidden="true" /> : <Sparkles className="icon-size-300" aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
