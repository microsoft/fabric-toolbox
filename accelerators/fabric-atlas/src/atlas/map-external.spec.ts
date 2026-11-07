import { describe, expect, it } from 'vitest';
import { EXACT_PATH, mergeLineageEdges, type ExternalDatasetRecord, type ExternalEdgeRecord, type ExternalLineage } from './external-lineage';
import { createLineageIndex, getLineageImpact } from './lineage';
import { buildExternalOverlay, EMPTY_EXTERNAL_OVERLAY, externalDatasetsIn, externalDownstream, externalItemImpact, jobKeyOf } from './map-external';
import type { Edge, Item, ItemType } from './model';

const LH = 'lh-1';
const DW = 'dw-1';
const SM = 'sm-1';
const RPT = 'rpt-1';

const item = (fabricId: string, displayName: string, itemType: ItemType): Item => ({
  fabricId,
  displayName,
  itemType,
  health: 'healthy',
  endorsement: 'none',
  tags: [],
});

const ds = (id: string, extra: Partial<ExternalDatasetRecord> = {}): ExternalDatasetRecord => ({
  id,
  namespace: 'source://acme/pricing',
  name: id.toUpperCase(),
  platform: 'Data source',
  lastSeenAt: '2026-10-29T00:00:00Z',
  state: 'to_link',
  ...extra,
});

const edge = (id: string, source: string, target: string, jobName = 'score_members'): ExternalEdgeRecord => ({
  id,
  importId: 'imp-1',
  sourceDatasetId: source,
  targetDatasetId: target,
  jobNamespace: 'source://acme/pricing',
  jobName,
  columns: [],
  columnTruncated: false,
});

const exactLh = (id: string) => ds(id, { state: 'linked', fabricItemId: LH, linkedBy: EXACT_PATH });

const lineage: ExternalLineage = {
  imports: [],
  datasets: [
    ds('crm', { platform: 'Oracle', namespace: 'oracle://crm', state: 'external' }),
    ds('input'),
    exactLh('seg'),
    exactLh('util'),
    ds('fact', { state: 'linked', fabricItemId: DW, linkedBy: 'frgisber@contoso.com' }),
  ],
  edges: [
    edge('e1', 'crm', 'seg'),
    edge('e2', 'input', 'seg'),
    edge('e3', 'util', 'fact', 'load_dw'),
  ],
};

const opts = (visible: string[]) => ({
  visibleItemIds: new Set(visible),
  nodeWidth: 100,
  nodeHeight: 40,
  columnGap: 150,
  rowGap: 60,
  top: 10,
});

describe('buildExternalOverlay', () => {
  it('draws exact links as badges and keeps other datasets in the lane', () => {
    const overlay = buildExternalOverlay(lineage, opts([LH, DW]));
    const keys = overlay.nodes.map((n) => n.key);
    expect(keys).toContain('ext:crm');
    expect(keys).toContain('ext:input');
    expect(keys).not.toContain('ext:seg');
    expect(overlay.badges.find((b) => b.itemId === LH)).toMatchObject({
      kind: 'exact',
      label: 'Linked · exact OneLake path +1',
      datasetIds: ['seg', 'util'],
    });
  });

  it('gives a manual link a lane node, a link edge and a steward badge', () => {
    const overlay = buildExternalOverlay(lineage, opts([LH, DW]));
    expect(overlay.nodes.find((n) => n.key === 'ext:fact')?.linkedItemId).toBe(DW);
    expect(overlay.edges).toContainEqual(expect.objectContaining({ kind: 'link', source: 'ext:fact', target: DW }));
    expect(overlay.badges.find((b) => b.itemId === DW)).toMatchObject({ kind: 'manual', label: 'Linked · manual (frgisber)' });
  });

  it('places jobs after their lane inputs and wires source → job → target', () => {
    const overlay = buildExternalOverlay(lineage, opts([LH, DW]));
    const job = jobKeyOf(lineage.edges[0]);
    const x = (key: string) => overlay.nodes.find((n) => n.key === key)!.x;
    expect(x(job)).toBeGreaterThan(x('ext:crm'));
    expect(overlay.edges).toContainEqual(expect.objectContaining({ source: 'ext:crm', target: job }));
    expect(overlay.edges).toContainEqual(expect.objectContaining({ source: job, target: LH }));
    expect(overlay.platforms).toEqual(['Data source', 'Oracle']);
  });

  it('drops edges whose exact-linked item is filtered out of the Map', () => {
    // Every edge touches the hidden lakehouse, so nothing is left to draw.
    expect(buildExternalOverlay(lineage, opts([DW]))).toBe(EMPTY_EXTERNAL_OVERLAY);
    const withLh = buildExternalOverlay(lineage, opts([LH]));
    expect(withLh.nodes.find((n) => n.key === 'ext:fact')?.linkedItemId).toBeUndefined();
    expect(withLh.badges.map((b) => b.itemId)).toEqual([LH]);
  });
});

describe('externalDownstream', () => {
  const items = [item(LH, 'lakehouse', 'Lakehouse'), item(SM, 'model', 'SemanticModel'), item(RPT, 'report', 'Report'), item(DW, 'dw', 'Warehouse')];
  const itemById = new Map(items.map((i) => [i.fabricId, i]));
  const snapshot: Edge[] = [
    { source: LH, target: SM, relation: 'feeds' },
    { source: SM, target: RPT, relation: 'feeds' },
  ];

  it('crosses the link point and follows Fabric lineage to reports', () => {
    const impact = externalDownstream(lineage, snapshot, ['crm'], itemById);
    expect(impact.items.map((i) => i.fabricId).sort()).toEqual([DW, LH, RPT, SM].sort());
    expect(impact).toMatchObject({ workspaces: 1, reports: 1 });
  });

  it('returns nothing for a dataset without a path into Fabric', () => {
    expect(externalDownstream(lineage, snapshot, ['missing'], itemById)).toEqual({ items: [], workspaces: 0, reports: 0 });
  });

  it('crosses the boundary both ways: data source input → Power BI report, report → external inputs', () => {
    const index = createLineageIndex(mergeLineageEdges(snapshot, lineage));
    const down = getLineageImpact(index, 'ext:input');
    expect([...down.downstream.ids]).toEqual(expect.arrayContaining([LH, SM, RPT]));
    const up = getLineageImpact(index, RPT);
    expect(externalDatasetsIn(up.upstream.ids, lineage).map((d) => d.id)).toEqual(['crm', 'input']);
    expect(externalDatasetsIn(getLineageImpact(createLineageIndex(snapshot), RPT).upstream.ids, lineage)).toEqual([]);
  });
});

describe('externalItemImpact', () => {
  const snapshot: Edge[] = [
    { source: LH, target: SM, relation: 'feeds' },
    { source: SM, target: RPT, relation: 'feeds' },
  ];

  it('lists external upstream datasets with distance and the jobs feeding a report', () => {
    const impact = externalItemImpact(lineage, snapshot, RPT);
    expect(impact.upstream.map((e) => [e.dataset.id, e.distance])).toEqual([
      ['crm', 3],
      ['input', 3],
    ]);
    expect(impact.downstream).toEqual([]);
    expect(impact.jobs).toEqual(['score_members']);
  });

  it('returns nothing without imported edges', () => {
    expect(externalItemImpact({ ...lineage, edges: [] }, snapshot, RPT)).toEqual({ upstream: [], downstream: [], jobs: [] });
  });
});