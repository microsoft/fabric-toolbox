import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFabricIndex,
  createMemoryRepo,
  defaultImportLabel,
  deleteImport,
  EXACT_PATH,
  importOpenLineageFile,
  loadExternalLineage,
  matchOneLakePath,
  mergeLineageEdges,
  OPENLINEAGE_RELATION,
  resolveLinks,
  setLink,
  type ExternalRepo,
  type LinkDecision,
} from './external-lineage';
import type { Item, ItemType } from './model';
import { parseOpenLineage } from './openlineage';

const WS_ID = '7c1d2e3f-0000-4000-8000-00000000aa01';
const LH_BRONZE = '11111111-1111-4111-8111-111111111111';
const LH_SILVER = '22222222-2222-4222-8222-222222222222';
const DW_GOLD = '33333333-3333-4333-8333-333333333333';

const item = (fabricId: string, displayName: string, itemType: ItemType): Item => ({
  fabricId,
  displayName,
  itemType,
  health: 'healthy',
  endorsement: 'none',
  tags: [],
});

const data = {
  workspace: { fabricId: WS_ID, displayName: 'Finance-Bronze', capacity: 'F64', region: 'westeurope' },
  items: [
    item(LH_BRONZE, 'lh_bronze', 'Lakehouse'),
    item(LH_SILVER, 'lh_silver', 'Lakehouse'),
    item(DW_GOLD, 'dw_gold', 'Warehouse'),
    item('44444444-4444-4444-8444-444444444444', 'Risk report', 'Report'),
  ],
  schema: {
    [LH_SILVER]: [{ name: 'price_curves', columns: [], measures: [] }],
  },
};
const index = buildFabricIndex(data);
const NS = 'abfss://finance-bronze@onelake.dfs.fabric.microsoft.com';

describe('matchOneLakePath', () => {
  it('links name and GUID paths, with or without the item type suffix', () => {
    expect(matchOneLakePath(NS, 'lh_bronze/Tables/risk_scores', index)).toEqual({ fabricItemId: LH_BRONZE, fabricObjectName: 'risk_scores' });
    expect(matchOneLakePath(NS, '/lh_bronze.Lakehouse/Tables/dbo/risk_scores/', index)).toEqual({
      fabricItemId: LH_BRONZE,
      fabricObjectName: 'dbo.risk_scores',
    });
    expect(matchOneLakePath(`abfss://${WS_ID}@onelake.dfs.fabric.microsoft.com`, `${LH_BRONZE}/Tables/x`, index)?.fabricItemId).toBe(LH_BRONZE);
    expect(matchOneLakePath('abfss://Finance%2DBronze@westeurope-onelake.dfs.fabric.microsoft.com', 'LH_BRONZE/Files/raw/a.csv', index)).toEqual({
      fabricItemId: LH_BRONZE,
      fabricObjectName: 'Files/raw/a.csv',
    });
  });

  it('refuses anything that is not an exact OneLake path of a loaded item', () => {
    expect(matchOneLakePath(NS, 'lh_bronze.Warehouse/Tables/x', index)).toBeNull();
    expect(matchOneLakePath(NS, 'lh_unknown/Tables/x', index)).toBeNull();
    expect(matchOneLakePath(NS, 'Risk report/Tables/x', index)).toBeNull();
    expect(matchOneLakePath('abfss://other-ws@onelake.dfs.fabric.microsoft.com', 'lh_bronze/Tables/x', index)).toBeNull();
    expect(matchOneLakePath('abfss://raw@stpricing.dfs.core.windows.net', 'lh_bronze/Tables/x', index)).toBeNull();
    expect(matchOneLakePath('mssql://x.datawarehouse.fabric.microsoft.com', 'dw_gold.dbo.fact_exposure', index)).toBeNull();
    // Table list known for lh_silver: unknown table does not link.
    expect(matchOneLakePath(NS, 'lh_silver/Tables/nope', index)).toBeNull();
    expect(matchOneLakePath(NS, 'lh_silver/Tables/price_curves', index)?.fabricItemId).toBe(LH_SILVER);
  });
});

describe('resolveLinks', () => {
  it('matches the mockup on the mock scenario', () => {
    const parsed = parseOpenLineage(readFileSync(resolve('src/atlas/__fixtures__/openlineage/mock-scenario.ndjson'), 'utf8'));
    const links = resolveLinks(parsed.datasets, index);
    const byName = new Map(parsed.datasets.map((d) => [d.name, links.get(d.key)]));
    expect(byName.get('lh_bronze/Tables/risk_scores')).toEqual({
      state: 'linked',
      fabricItemId: LH_BRONZE,
      fabricObjectName: 'risk_scores',
      linkedBy: EXACT_PATH,
      linkedAt: undefined,
    });
    expect(byName.get('RISKLIB.CUSTOMER_PD')?.state).toBe('to_link');
    expect(byName.get('RISKLIB.LIMITS')?.state).toBe('to_link');
    expect(byName.get('dw_gold.dbo.fact_exposure')?.state).toBe('to_link');
  });

  it('keeps manual and external decisions, recomputes automatic ones', () => {
    const ds = [
      { key: 'a', namespace: 'source://x', name: 'A' },
      { key: 'b', namespace: 'source://x', name: 'B' },
      { key: 'c', namespace: NS, name: 'lh_gone/Tables/t' },
      { key: 'd', namespace: NS, name: 'lh_bronze/Tables/t' },
    ];
    const existing = new Map<string, LinkDecision>([
      ['a', { state: 'linked', fabricItemId: LH_SILVER, linkedBy: 'frgisber@contoso.com', linkedAt: '2026-10-28T00:00:00Z' }],
      ['b', { state: 'external', linkedBy: 'frgisber@contoso.com' }],
      ['c', { state: 'linked', fabricItemId: 'old', linkedBy: EXACT_PATH }],
      ['d', { state: 'to_link' }],
    ]);
    const out = resolveLinks(ds, index, existing);
    expect(out.get('a')).toBe(existing.get('a'));
    expect(out.get('b')).toBe(existing.get('b'));
    expect(out.get('c')).toEqual({ state: 'to_link' });
    expect(out.get('d')).toMatchObject({ state: 'linked', fabricItemId: LH_BRONZE, linkedBy: EXACT_PATH });
  });
});

describe('persistence', () => {
  const actor = { id: 'sub-1', email: 'frgisber@contoso.com' };
  const fixture = (name: string) =>
    readFileSync(resolve(__dirname, '__fixtures__/openlineage', name), 'utf8');
  const fileOf = (name: string, text = fixture(name)) => ({ name, size: text.length, text });
  const MOCK = 'mock-scenario.ndjson';

  async function importInto(repo: ExternalRepo, file: { name: string; size: number; text: string }) {
    const current = await loadExternalLineage(repo, WS_ID);
    const outcome = await importOpenLineageFile(repo, WS_ID, actor, file, index, current);
    return { outcome, state: await loadExternalLineage(repo, WS_ID) };
  }

  it('imports a file: import row, datasets with links, edges', async () => {
    const repo = createMemoryRepo();
    const { outcome, state } = await importInto(repo, fileOf(MOCK));
    expect(outcome).toMatchObject({ status: 'accepted', replaced: false });
    expect(state.imports).toHaveLength(1);
    expect(state.imports[0]).toMatchObject({ fileName: MOCK, label: defaultImportLabel(MOCK), status: 'accepted', importedByEmail: actor.email });
    expect(state.imports[0].edgeCount).toBe(state.edges.length);
    const risk = state.datasets.find((d) => d.name.endsWith('risk_scores'))!;
    expect(risk).toMatchObject({ state: 'linked', fabricItemId: LH_BRONZE, linkedBy: EXACT_PATH });
    expect(state.datasets.find((d) => d.name === 'RISKLIB.LIMITS')?.state).toBe('to_link');
    expect(state.datasets.find((d) => d.name.includes('fact_exposure'))?.state).toBe('to_link');
  });

  it('re-import replaces edges and keeps manual decisions', async () => {
    const repo = createMemoryRepo();
    const first = await importInto(repo, fileOf(MOCK));
    const limits = first.state.datasets.find((d) => d.name === 'RISKLIB.LIMITS')!;
    await setLink(repo, limits.id, { state: 'linked', fabricItemId: DW_GOLD, fabricObjectName: 'dbo.limits' }, actor);
    const { outcome, state } = await importInto(repo, fileOf(MOCK));
    expect(outcome.replaced).toBe(true);
    expect(state.imports).toHaveLength(1);
    expect(state.edges.map((e) => e.id).sort()).toEqual(first.state.edges.map((e) => e.id).sort());
    expect(state.datasets.find((d) => d.id === limits.id)).toMatchObject({
      state: 'linked',
      fabricItemId: DW_GOLD,
      linkedBy: actor.email,
    });
  });

  it('records a rejected file with zero counts and removes the edges it replaced', async () => {
    const repo = createMemoryRepo();
    await importInto(repo, fileOf(MOCK));
    const { outcome, state } = await importInto(repo, fileOf(MOCK, fixture('export_lineage_v1.json')));
    expect(outcome).toMatchObject({ status: 'rejected', replaced: true, rejectReason: 'Not OpenLineage' });
    expect(state.imports[0]).toMatchObject({ status: 'rejected', eventCount: 0, datasetCount: 0, edgeCount: 0 });
    expect(state.edges).toHaveLength(0);
    const bad = await importInto(repo, { name: 'notes.txt', size: 3, text: 'abc' });
    expect(bad.outcome.rejectReason).toMatch(/Unsupported file type/);
  });

  it('delete cascades to edges and unreferenced datasets, keeping manual ones', async () => {
    const repo = createMemoryRepo();
    const first = await importInto(repo, fileOf(MOCK));
    const loans = first.state.datasets.find((d) => d.name === 'CBS.LOANS')!;
    await setLink(repo, loans.id, { state: 'external' }, actor);
    await importInto(repo, fileOf('pricing_lineage.json'));
    const before = await loadExternalLineage(repo, WS_ID);
    const mockImport = before.imports.find((i) => i.fileName === MOCK)!;
    await deleteImport(repo, mockImport.id, before);
    const after = await loadExternalLineage(repo, WS_ID);
    expect(after.imports.map((i) => i.fileName)).toEqual(['pricing_lineage.json']);
    expect(after.edges.every((e) => e.importId !== mockImport.id)).toBe(true);
    expect(after.edges.length).toBeGreaterThan(0);
    const ids = new Set(after.datasets.map((d) => d.id));
    expect(ids.has(loans.id)).toBe(true);
    expect(after.datasets.some((d) => d.name === 'RISKLIB.LIMITS')).toBe(false);
  });

  it('read path merges external edges on top of snapshot edges', async () => {
    const repo = createMemoryRepo();
    const { state } = await importInto(repo, fileOf(MOCK));
    const snapshot = [{ source: LH_BRONZE, target: LH_SILVER, relation: 'feeds' }];
    const merged = mergeLineageEdges(snapshot, state);
    expect(merged[0]).toBe(snapshot[0]);
    const ext = merged.filter((e) => e.relation === OPENLINEAGE_RELATION);
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.some((e) => e.target === LH_BRONZE && e.source.startsWith('ext:'))).toBe(true);
    expect(snapshot).toHaveLength(1);
  });
});
