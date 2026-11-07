// Minimal Markdown block parser for Atlas Scout answers. Output is rendered as
// React elements (never raw HTML), so agent text cannot inject markup.

export type ScoutBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: ScoutListItem[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "code"; language: string; text: string };

export interface ScoutListItem {
  text: string;
  ordered: boolean;
  /** Display number for ordered items, renumbered sequentially among siblings. */
  number?: number;
  children: ScoutListItem[];
}

export type ScoutInline = { kind: "text" | "strong" | "code"; text: string };

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const CONTINUATION = /^\s{2,}\S/;
// The agent sometimes prints its method steps as bare lines ("Audit", "Explain:").
const STEP_LABEL = /^\**(audit|explain|recommend|recommendations?)\**\s*:?\**\s*$/i;

function indentWidth(value: string): number {
  return value.replace(/\t/g, "    ").length;
}

function renumber(items: ScoutListItem[]): ScoutListItem[] {
  let next: number | undefined;
  for (const item of items) {
    if (item.ordered) {
      next ??= item.number ?? 1;
      item.number = next;
      next += 1;
    }
    renumber(item.children);
  }
  return items;
}

/** Parses a (possibly nested, possibly blank-line separated) list starting at `start`. */
function parseList(lines: string[], start: number): { block: ScoutBlock; end: number } {
  const root: ScoutListItem = { text: "", ordered: false, children: [] };
  const stack: { item: ScoutListItem; indent: number }[] = [{ item: root, indent: -1 }];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const match = LIST_ITEM.exec(line);
    if (match) {
      const indent = indentWidth(match[1]);
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const node: ScoutListItem = { text: match[4].trim(), ordered: !match[2], children: [] };
      if (match[3]) node.number = Number(match[3]);
      stack[stack.length - 1].item.children.push(node);
      stack.push({ item: node, indent });
      index += 1;
      continue;
    }
    if (!line.trim()) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (next < lines.length && (LIST_ITEM.test(lines[next]) || CONTINUATION.test(lines[next]))) {
        index = next;
        continue;
      }
      break;
    }
    if (CONTINUATION.test(line) && stack.length > 1) {
      const last = stack[stack.length - 1].item;
      last.text = `${last.text} ${line.trim()}`;
      index += 1;
      continue;
    }
    break;
  }
  const items = renumber(root.children);
  return { block: { kind: "list", ordered: items[0]?.ordered ?? false, items }, end: index - 1 };
}

export function parseScoutMarkdown(source: string): ScoutBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ScoutBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const fence = /^```\s*([\w-]*)/.exec(trimmed);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", language: fence[1] ?? "", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      if (!STEP_LABEL.test(heading[2].trim())) {
        blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      }
      continue;
    }
    if (trimmed.includes("|") && TABLE_SEPARATOR.test(lines[index + 1]?.trim() ?? "")) {
      flushParagraph();
      const header = tableCells(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && !LIST_ITEM.test(lines[index])) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      flushParagraph();
      const list = parseList(lines, index);
      blocks.push(list.block);
      index = list.end;
      continue;
    }
    if (STEP_LABEL.test(trimmed)) {
      flushParagraph();
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

/** Splits "Label: value" list items so the view can emphasise the label. */
export function splitScoutLabel(text: string): { label: string; value: string } | null {
  const match = /^\**([A-Za-z][\w /&().'-]{0,40}?)\**\s*:\**\s+(.*)$|^\**([A-Za-z][\w /&().'-]{0,40}?)\**\s*:\**\s*$/.exec(text);
  if (!match) return null;
  return match[1] !== undefined ? { label: match[1].trim(), value: match[2] } : { label: match[3].trim(), value: "" };
}

export type ScoutTone = "healthy" | "warning" | "failing";

export type ScoutCell =
  | { kind: "percent"; value: number; text: string }
  | { kind: "status"; tone: ScoutTone; text: string }
  | { kind: "number"; text: string }
  | { kind: "text"; text: string };

const STATUS_TONES: Record<string, ScoutTone> = {
  failed: "failing",
  failing: "failing",
  critical: "failing",
  error: "failing",
  high: "failing",
  blocked: "failing",
  warning: "warning",
  medium: "warning",
  stale: "warning",
  partial: "warning",
  unknown: "warning",
  pending: "warning",
  healthy: "healthy",
  succeeded: "healthy",
  success: "healthy",
  completed: "healthy",
  ok: "healthy",
  low: "healthy",
  pass: "healthy",
  passed: "healthy",
  certified: "healthy",
  promoted: "healthy",
};

const SCORE_HEADER = /score|health|protect|trust|coverage/i;

/** Classifies a table cell so the view can render gauges, pills and numbers. */
export function classifyScoutCell(raw: string, header = ""): ScoutCell {
  const text = raw.replace(/\*\*/g, "").trim();
  const percent = /^(-?\d+(?:[.,]\d+)?)\s?%$/.exec(text);
  if (percent) {
    const value = Math.max(0, Math.min(100, Number(percent[1].replace(",", "."))));
    return { kind: "percent", value, text };
  }
  // Pillar and overall scores are on a 0-100 scale; render them as gauges too.
  const score = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*100)?$/.exec(text);
  if (score && SCORE_HEADER.test(header)) {
    const value = Number(score[1].replace(",", "."));
    if (value <= 100) return { kind: "percent", value, text: String(Math.round(value)) };
  }
  const tone = STATUS_TONES[text.toLowerCase()];
  if (tone) return { kind: "status", tone, text };
  if (/^-?\d[\d\s,.]*$/.test(text)) return { kind: "number", text };
  return { kind: "text", text: raw };
}

export interface ScoutLineageNode {
  id: string;
  label: string;
  type: string;
  tone: ScoutTone | "neutral";
  layer: number;
  row: number;
}

export interface ScoutLineageEdge {
  from: string;
  to: string;
  relation: string;
  broken: boolean;
}

export interface ScoutLineage {
  nodes: ScoutLineageNode[];
  edges: ScoutLineageEdge[];
  layers: number;
  rows: number;
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const plainCell = (value: string | undefined) => (value ?? "").replace(/\*\*|__|`/g, "").trim();
const TRUTHY = /^(1|true|yes|broken|y)$/i;

function findColumn(header: string[], names: string[]): number {
  const normalized = header.map(normalizeHeader);
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Turns a lineage edge table (Source | Relation | Target ...) into a layered graph.
 * Returns null when the table is not lineage. Cycles are allowed: layers come from a
 * breadth-first walk starting at the first source, so back edges simply point left.
 */
export function scoutLineage(header: string[], rows: string[][]): ScoutLineage | null {
  const source = findColumn(header, ["source", "sourceitem", "sourcename", "from", "upstream", "upstreamitem"]);
  const target = findColumn(header, ["target", "targetitem", "targetname", "to", "downstream", "downstreamitem"]);
  if (source < 0 || target < 0 || !rows.length) return null;
  const sourceType = findColumn(header, ["sourcetype", "sourceitemtype", "fromtype"]);
  const targetType = findColumn(header, ["targettype", "targetitemtype", "totype"]);
  const relation = findColumn(header, ["relation", "relationship", "relationtype", "edgetype", "link"]);
  const broken = findColumn(header, ["broken", "isbroken", "brokenedge"]);
  const health = findColumn(header, ["targethealth", "targetstatus", "health", "status"]);
  const failed = header.map(normalizeHeader).findIndex((name) => name.includes("failed") || name.includes("failure"));

  const nodes = new Map<string, ScoutLineageNode>();
  const node = (label: string, type: string) => {
    const id = `${label}\u0000${type}`;
    if (!nodes.has(id)) nodes.set(id, { id, label, type, tone: "neutral", layer: -1, row: 0 });
    return nodes.get(id)!;
  };
  const edges: ScoutLineageEdge[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const from = plainCell(row[source]);
    const to = plainCell(row[target]);
    if (!from || !to) continue;
    const a = node(from, plainCell(row[sourceType]));
    const b = node(to, plainCell(row[targetType]));
    const edge = { from: a.id, to: b.id, relation: plainCell(row[relation]), broken: TRUTHY.test(plainCell(row[broken])) };
    const key = `${edge.from}\u0001${edge.to}\u0001${edge.relation}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(edge);
    }
    const status = plainCell(row[health]).toLowerCase();
    const failedRuns = Number(plainCell(row[failed]).replace(",", "."));
    if (edge.broken || STATUS_TONES[status] === "failing" || failedRuns > 0) b.tone = "failing";
    else if (b.tone === "neutral" && STATUS_TONES[status] === "healthy") b.tone = "healthy";
  }
  if (!edges.length) return null;

  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    if (edge.from !== edge.to) incoming.add(edge.to);
  }
  const walk = (start: ScoutLineageNode) => {
    start.layer = 0;
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of outgoing.get(current.id) ?? []) {
        const target = nodes.get(next)!;
        if (target.layer < 0) {
          target.layer = current.layer + 1;
          queue.push(target);
        }
      }
    }
  };
  walk(nodes.get(edges[0].from)!);
  for (const candidate of nodes.values()) if (candidate.layer < 0 && !incoming.has(candidate.id)) walk(candidate);
  for (const candidate of nodes.values()) if (candidate.layer < 0) walk(candidate);

  // Order each layer by the average row of its parents to limit crossings.
  const layers = Math.max(...[...nodes.values()].map((item) => item.layer)) + 1;
  let maxRows = 0;
  for (let layer = 0; layer < layers; layer += 1) {
    const members = [...nodes.values()].filter((item) => item.layer === layer);
    const weight = (item: ScoutLineageNode) => {
      const parents = edges
        .filter((edge) => edge.to === item.id)
        .map((edge) => nodes.get(edge.from)!)
        .filter((parent) => parent.layer < layer);
      return parents.length ? parents.reduce((sum, parent) => sum + parent.row, 0) / parents.length : 0;
    };
    members
      .map((item) => ({ item, weight: weight(item) }))
      .sort((a, b) => a.weight - b.weight)
      .forEach(({ item }, index) => {
        item.row = index;
      });
    maxRows = Math.max(maxRows, members.length);
  }
  return { nodes: [...nodes.values()], edges, layers, rows: maxRows };
}

export type SqlToken = { kind: "keyword" | "string" | "number" | "comment" | "text"; text: string };

const SQL_KEYWORDS = new Set(
  (
    "select from where and or not in is null as join left right inner outer full cross on group by order " +
    "having top distinct count sum avg min max case when then else end with union all desc asc like between " +
    "exists cast convert coalesce isnull over partition row_number limit offset fetch next rows only"
  ).split(" "),
);

/** Splits SQL into tokens for lightweight, markup-free syntax highlighting. */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const pattern = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)|([\s\S])/g;
  for (const match of sql.matchAll(pattern)) {
    const [text, comment, string, number, word] = match;
    const kind: SqlToken["kind"] = comment
      ? "comment"
      : string
        ? "string"
        : number
          ? "number"
          : word && SQL_KEYWORDS.has(word.toLowerCase())
            ? "keyword"
            : "text";
    const previous = tokens[tokens.length - 1];
    if (kind === "text" && previous?.kind === "text") previous.text += text;
    else tokens.push({ kind, text });
  }
  return tokens;
}

export function parseScoutInline(text: string): ScoutInline[] {
  const parts: ScoutInline[] = [];
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    if (match[3] !== undefined) parts.push({ kind: "code", text: match[3] });
    else parts.push({ kind: "strong", text: match[1] ?? match[2] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
