import { isItemMetadataSchemaEntry } from "./item-metadata";
import type { ModelTableSchema } from "./model";

export interface DescriptionDraft {
  target: string;
  kind: "measure" | "column" | "table";
  text: string;
}

const UNITS: Record<string, string> = { chf: "in CHF", eur: "in EUR", usd: "in USD", pct: "as a percentage" };

function humanize(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[_\s]+/).filter(Boolean);
  const unit = words.length > 1 ? UNITS[words[words.length - 1].toLowerCase()] : undefined;
  const base = (unit ? words.slice(0, -1) : words).join(" ").toLowerCase();
  return unit ? `${base} ${unit}` : base;
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const AGGREGATES: Record<string, string> = {
  SUM: "Sum of",
  AVERAGE: "Average",
  AVERAGEX: "Average",
  MIN: "Lowest",
  MAX: "Highest",
  COUNT: "Number of",
  COUNTROWS: "Number of rows in",
  DISTINCTCOUNT: "Distinct count of",
};

function measureDraft(name: string, expr: string | undefined, table: string): string {
  const call = expr?.trim().match(/^([A-Z]+)\s*\(\s*'?([\w\s]+?)'?\s*(?:\[([^\]]+)\])?\s*\)$/i);
  if (call) {
    const fn = call[1].toUpperCase();
    const prefix = AGGREGATES[fn];
    if (prefix) {
      const subject = call[3] ? `${humanize(call[3])} in ${call[2]}` : call[2];
      return sentence(`${prefix} ${subject}`);
    }
  }
  if (expr && /^DIVIDE\s*\(/i.test(expr.trim())) {
    return sentence(`${humanize(name)}, computed as a ratio in ${table}`);
  }
  return sentence(`${humanize(name)} measure in ${table}`);
}

/**
 * Deterministic draft descriptions for undocumented model objects, derived
 * from object names and DAX expressions only. Measures come first because
 * they are what report consumers and Copilot read most.
 */
export function draftObjectDescriptions(tables: readonly ModelTableSchema[]): DescriptionDraft[] {
  const visible = tables.filter((table) => !isItemMetadataSchemaEntry(table) && table.isHidden !== true);
  const measures: DescriptionDraft[] = [];
  const columns: DescriptionDraft[] = [];
  const tableDrafts: DescriptionDraft[] = [];
  for (const table of visible) {
    for (const measure of table.measures) {
      if (measure.isHidden || measure.description?.trim()) continue;
      measures.push({ target: `[${measure.name}]`, kind: "measure", text: measureDraft(measure.name, measure.expr, table.name) });
    }
    for (const column of table.columns) {
      if (column.isHidden || column.description?.trim()) continue;
      columns.push({ target: `${table.name}[${column.name}]`, kind: "column", text: sentence(`${humanize(column.name)} of each ${humanize(table.name)} row`) });
    }
    if (!table.description?.trim()) {
      tableDrafts.push({ target: table.name, kind: "table", text: sentence(`one row per ${humanize(table.name)} record, with ${table.columns.length} columns`) });
    }
  }
  return [...measures, ...columns, ...tableDrafts];
}
