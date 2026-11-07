export const MAX_EXPANDED_OBJECT_TABLES = 8;

export type ObjectLineageDaxScope = "direct" | "transitive" | "off";
export type ObjectLineageNotice =
  | "linked-object-missing"
  | "linked-table-ambiguous"
  | "expansion-limit";

export interface FieldBlockPlacement {
  table: string;
  y: number;
  height: number;
}

export interface ObjectLineageState {
  itemId: string;
  blocks: FieldBlockPlacement[];
  focus?: string;
  dax: ObjectLineageDaxScope;
  notice?: ObjectLineageNotice;
}

export type ObjectLineageAction =
  | {
      type: "expand";
      table: string;
      anchorY: number;
      height: number;
    }
  | { type: "collapse"; table: string }
  | { type: "focus"; key?: string }
  | { type: "setDax"; scope: ObjectLineageDaxScope }
  | { type: "setNotice"; notice?: ObjectLineageNotice }
  | { type: "reset"; itemId: string };

export interface ObjectLineageLocation {
  itemId: string;
  tables: string[];
  focus?: string;
  dax: ObjectLineageDaxScope;
}

export interface ObjectLineageTableGeometry {
  key: string;
  anchorY: number;
  height: number;
}

export function normalizeObjectName(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function tableObjectKey(table: string): string {
  return `table\u0000${normalizeObjectName(table)}`;
}

export function modelObjectKey(itemId: string): string {
  return `item\u0000${itemId}`;
}

export function objectKeyTable(key: string | undefined): string | undefined {
  const [kind, table] = key?.split("\u0000") ?? [];
  return kind === "measure" || kind === "column" ? table : undefined;
}

export function placeBlock(
  open: readonly Pick<FieldBlockPlacement, "y" | "height">[],
  anchorY: number,
  height: number,
  gap = 16,
): number {
  let y = anchorY;
  for (const block of [...open].sort((left, right) => left.y - right.y)) {
    if (
      y < block.y + block.height + gap &&
      block.y < y + height + gap
    ) {
      y = block.y + block.height + gap;
    }
  }
  return y;
}

export function objectLineageReducer(
  state: ObjectLineageState,
  action: ObjectLineageAction,
): ObjectLineageState {
  switch (action.type) {
    case "expand": {
      if (state.blocks.some((block) => block.table === action.table)) {
        return state;
      }
      if (state.blocks.length >= MAX_EXPANDED_OBJECT_TABLES) {
        return { ...state, notice: "expansion-limit" };
      }
      return {
        ...state,
        blocks: [
          ...state.blocks,
          {
            table: action.table,
            y: placeBlock(state.blocks, action.anchorY, action.height),
            height: action.height,
          },
        ],
        notice: undefined,
      };
    }
    case "collapse":
      return {
        ...state,
        blocks: state.blocks.filter((block) => block.table !== action.table),
        focus:
          objectKeyTable(state.focus) === action.table
            ? undefined
            : state.focus,
        notice: undefined,
      };
    case "focus":
      return { ...state, focus: action.key, notice: undefined };
    case "setDax":
      return { ...state, dax: action.scope };
    case "setNotice":
      return { ...state, notice: action.notice };
    case "reset":
      return {
        itemId: action.itemId,
        blocks: [],
        dax: "direct",
      };
  }
}

function decodedTables(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => {
          try {
            return normalizeObjectName(decodeURIComponent(entry));
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ].slice(0, MAX_EXPANDED_OBJECT_TABLES);
}

export function parseObjectLineageLocation(
  params: URLSearchParams,
  fallbackItemId: string,
): ObjectLineageLocation {
  const itemId =
    params.get("item")?.trim() ||
    params.get("xray.model")?.trim() ||
    fallbackItemId;
  const xrayModel = params.get("xray.model")?.trim();
  const xrayObject =
    !xrayModel || xrayModel === itemId
      ? params.get("xray.object")?.trim()
      : undefined;
  const legacyTable = normalizeObjectName(params.get("table") ?? "");
  const tables = decodedTables(params.get("tables"));
  if (tables.length === 0 && legacyTable) tables.push(legacyTable);
  const focus = params.get("object")?.trim() || xrayObject || undefined;
  const focusedTable = objectKeyTable(focus);
  if (focusedTable && !tables.includes(focusedTable)) {
    tables.push(focusedTable);
  }
  const requestedDax = params.get("dax");
  const dax: ObjectLineageDaxScope =
    requestedDax === "transitive" || requestedDax === "off"
      ? requestedDax
      : "direct";
  return { itemId, tables, focus, dax };
}

export function restoreObjectLineageState(
  location: ObjectLineageLocation,
  geometries: readonly ObjectLineageTableGeometry[],
): ObjectLineageState {
  let state: ObjectLineageState = {
    itemId: location.itemId,
    blocks: [],
    focus: location.focus,
    dax: location.dax,
  };
  for (const table of location.tables) {
    const matches = geometries.filter((geometry) => geometry.key === table);
    if (matches.length !== 1) {
      state = {
        ...state,
        notice:
          matches.length > 1
            ? "linked-table-ambiguous"
            : "linked-object-missing",
      };
      continue;
    }
    state = objectLineageReducer(state, {
      type: "expand",
      table,
      anchorY: matches[0].anchorY,
      height: matches[0].height,
    });
  }
  return state;
}

export function writeObjectLineageLocation(
  url: URL,
  state: ObjectLineageState,
): void {
  url.searchParams.set("lineage", "objects");
  if (state.itemId) url.searchParams.set("item", state.itemId);
  if (state.blocks.length > 0) {
    url.searchParams.set(
      "tables",
      state.blocks
        .map((block) => encodeURIComponent(block.table))
        .join(","),
    );
  } else {
    url.searchParams.delete("tables");
  }
  if (
    state.focus?.startsWith("measure\u0000") ||
    state.focus?.startsWith("column\u0000")
  ) {
    url.searchParams.set("object", state.focus);
  } else {
    url.searchParams.delete("object");
  }
  if (state.dax !== "direct") url.searchParams.set("dax", state.dax);
  else url.searchParams.delete("dax");
  url.searchParams.delete("table");
  url.searchParams.delete("xray.model");
  url.searchParams.delete("xray.object");
}
