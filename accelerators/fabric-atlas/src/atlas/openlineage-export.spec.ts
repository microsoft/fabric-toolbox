/* eslint-disable @typescript-eslint/no-explicit-any -- assertions walk untyped OpenLineage JSON */
import { describe, expect, it } from 'vitest';
import { buildFabricIndex, matchOneLakePath, resolveLinks, type ExternalLineage } from './external-lineage';
import type { AtlasData, Item, ItemType } from './model';
import { exportOpenLineage, oneLakeName, oneLakeNamespace, parseOpenLineage } from './openlineage';

const WS = '7c1d2e3f-0000-4000-8000-00000000aa01';
const id = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const item = (fabricId: string, displayName: string, itemType: ItemType): Item => ({
  fabricId,
  displayName,
  itemType,
  health: 'healthy',
  endorsement: 'none',
  tags: [],
});

const LH = id(1);
const NB = id(2);
const DW = id(3);
const SM = id(4);
const RP = id(5);
const ISO = id(6);
const data: AtlasData = {
  workspace: { fabricId: WS, displayName: 'Finance Bronze', capacity: 'F64', region: 'westeurope' },
  items: [
    item(LH, 'sales', 'Lakehouse'),
    item(NB, 'nb_transform', 'Notebook'),
    item(DW, 'dw_gold', 'Warehouse'),
    item(SM, 'sales', 'SemanticModel'), // same name as the lakehouse, different type
    item(RP, 'Sales report', 'Report'),
    item(ISO, 'orphan', 'Lakehouse'),
  ],
  edges: [
    { source: LH, target: NB, relation: 'reads' },
    { source: NB, target: DW, relation: 'writes' },
    { source: DW, target: SM, relation: 'source' },
    { source: SM, target: RP, relation: 'source' },
  ],
} as AtlasData;

const external: ExternalLineage = {
  imports: [],
  datasets: [
    { id: 'd1', workspaceId: WS, key: 'k1', namespace: 'mssql://erp', name: 'dbo.orders', platform: 'SQL Server', state: 'external' },
    { id: 'd2', workspaceId: WS, key: 'k2', namespace: 'abfss://x@onelake.dfs.fabric.microsoft.com', name: 'sales/Tables/orders', platform: 'Fabric', state: 'linked', fabricItemId: LH, fabricObjectName: 'dbo.orders' },
    { id: 'd3', workspaceId: WS, key: 'k3', namespace: 'source://grid', name: 'WORK.A', platform: 'Data source', state: 'external' },
    { id: 'd4', workspaceId: WS, key: 'k4', namespace: 'source://grid', name: 'WORK.B', platform: 'Data source', state: 'to_link' },
  ],
  edges: [
    { id: 'e1', workspaceId: WS, importId: 'i', sourceDatasetId: 'd1', targetDatasetId: 'd2', jobNamespace: 'adf://erp', jobName: 'copy_orders', columns: [{ from: 'id', to: 'order_id', transform: 'IDENTITY' }] },
    { id: 'e2', workspaceId: WS, importId: 'i', sourceDatasetId: 'd3', targetDatasetId: 'd4', jobNamespace: 'source://grid', jobName: 'x' },
  ],
} as unknown as ExternalLineage;

const lines = (text: string) => text.trim().split('\n').map((l) => JSON.parse(l) as Record<string, any>);

/** Required fields of the OpenLineage 2-0-2 spec for JobEvent / DatasetEvent. */
function specErrors(ev: Record<string, any>): string[] {
  const errs: string[] = [];
  const nsName = (o: any, where: string) => {
    if (typeof o?.namespace !== 'string' || !o.namespace) errs.push(`${where}.namespace`);
    if (typeof o?.name !== 'string' || !o.name) errs.push(`${where}.name`);
  };
  const facets = (f: any, where: string) => {
    for (const [k, v] of Object.entries(f ?? {})) {
      if (typeof (v as any)?._producer !== 'string' || typeof (v as any)?._schemaURL !== 'string') errs.push(`${where}.${k}`);
    }
  };
  if (Number.isNaN(Date.parse(ev.eventTime))) errs.push('eventTime');
  if (typeof ev.producer !== 'string' || !/^https?:\/\//.test(ev.producer)) errs.push('producer');
  if (typeof ev.schemaURL !== 'string' || !/^https?:\/\//.test(ev.schemaURL)) errs.push('schemaURL');
  if (ev.job) {
    nsName(ev.job, 'job');
    facets(ev.job.facets, 'job.facets');
    for (const k of ['inputs', 'outputs'] as const) {
      if (!Array.isArray(ev[k])) errs.push(k);
      else ev[k].forEach((d: any, i: number) => (nsName(d, `${k}[${i}]`), facets(d.facets, `${k}[${i}].facets`)));
    }
    if (ev.run) errs.push('run must be absent on a JobEvent');
  } else if (ev.dataset) {
    nsName(ev.dataset, 'dataset');
    facets(ev.dataset.facets, 'dataset.facets');
  }
  else errs.push('neither job nor dataset');
  return errs;
}

const project = (text: string) => {
  const parsed = parseOpenLineage(text);
  const links = resolveLinks(parsed.datasets, buildFabricIndex(data));
  return { parsed, links };
};

describe('exportOpenLineage', () => {
  const eventTime = '2026-10-29T08:00:00.000Z';
  const all = exportOpenLineage(data, { eventTime });

  it('writes spec-valid JobEvents and DatasetEvents with OneLake names', () => {
    const events = lines(all.text);
    expect(events).toHaveLength(all.eventCount);
    for (const ev of events) expect(specErrors(ev)).toEqual([]);
    const ns = oneLakeNamespace(data.workspace);
    expect(ns).toBe(`abfss://${WS}@onelake.dfs.fabric.microsoft.com`);
    const nb = events.find((e) => e.job?.name === 'nb_transform.Notebook');
    expect(nb?.job.facets.jobType).toMatchObject({ processingType: 'BATCH', integration: 'FABRIC', jobType: 'NOTEBOOK' });
    expect(nb?.inputs).toEqual([{ namespace: ns, name: 'sales.Lakehouse' }]);
    expect(nb?.outputs).toEqual([{ namespace: ns, name: 'dw_gold.Warehouse' }]);
    expect(events.filter((e) => e.dataset).map((e) => e.dataset.name)).toContain('orphan.Lakehouse');
    expect(all.jobCount).toBe(3);
    expect(all.fileName).toBe('fabric-atlas-Finance-Bronze-openlineage-2026-10-29.ndjson');
  });

  it('round-trips: re-import links 100 % of datasets by exact path and restores the item graph', () => {
    const { parsed, links } = project(all.text);
    expect(parsed.status).toBe('accepted');
    const byKey = new Map(parsed.datasets.map((d) => [d.key, d]));
    for (const d of parsed.datasets) expect(links.get(d.key), d.name).toMatchObject({ state: 'linked', linkedBy: 'exact_path' });
    const toItem = (key: string) => links.get(key)!.fabricItemId!;
    const got = new Set(parsed.edges.map((e) => `${toItem(e.sourceKey)}>${toItem(e.targetKey)}`));
    // Job items are collapsed: their inputs feed their outputs.
    expect(got).toEqual(new Set([`${LH}>${DW}`, `${DW}>${SM}`, `${SM}>${RP}`]));
    expect(links.get([...byKey.keys()].find((k) => byKey.get(k)!.name === 'sales.SemanticModel')!)!.fabricItemId).toBe(SM);
    expect(links.get([...byKey.keys()].find((k) => byKey.get(k)!.name === 'sales.Lakehouse')!)!.fabricItemId).toBe(LH);
  });

  it('limits the export to the map selection', () => {
    const sel = exportOpenLineage(data, { eventTime, itemIds: new Set([DW, SM]) });
    const events = lines(sel.text);
    expect(events.filter((e) => e.job).map((e) => e.job.name)).toEqual(['sales.SemanticModel#source']);
    expect(events.filter((e) => e.dataset).map((e) => e.dataset.name).sort()).toEqual(['dw_gold.Warehouse', 'sales.SemanticModel']);
  });

  it('adds external edges touching a linked item, with column lineage, and skips the rest', () => {
    const withExt = exportOpenLineage(data, { eventTime, includeExternal: true, external });
    expect(withExt.externalEdgeCount).toBe(1);
    const ev = lines(withExt.text).find((e) => e.job?.name === 'copy_orders')!;
    expect(specErrors(ev)).toEqual([]);
    expect(ev.inputs).toEqual([{ namespace: 'mssql://erp', name: 'dbo.orders' }]);
    expect(ev.outputs[0].name).toBe('sales.Lakehouse/Tables/dbo/orders');
    expect(ev.outputs[0].facets.columnLineage.fields.order_id.inputFields[0]).toMatchObject({ field: 'id', name: 'dbo.orders' });
    const { parsed, links } = project(withExt.text);
    const out = parsed.datasets.find((d) => d.name === 'sales.Lakehouse/Tables/dbo/orders')!;
    expect(links.get(out.key)).toMatchObject({ state: 'linked', fabricItemId: LH, fabricObjectName: 'dbo.orders' });
    expect(exportOpenLineage(data, { eventTime, includeExternal: true, external, itemIds: new Set([DW]) }).externalEdgeCount).toBe(0);
  });

  it('exports notebook lineage at table level, Eventstreams as STREAMING, and dataset facets', () => {
    const ES = id(7);
    const KQL = id(8);
    const rich = {
      ...data,
      items: [
        ...data.items.map((i) =>
          i.fabricId === LH
            ? { ...i, description: 'Raw sales', ownerEmail: 'ana@contoso.com', updatedAt: '2026-10-01T10:00:00.000Z' }
            : i,
        ),
        item(ES, 'telemetry', 'Eventstream'),
        item(KQL, 'kql', 'KQLDatabase'),
      ],
      edges: [...data.edges, { source: LH, target: NB, relation: 'reads' }, { source: NB, target: LH, relation: 'writes' }, { source: ES, target: KQL, relation: 'writes' }],
      objectEdges: [
        { source: { itemId: LH, kind: 'sourceObject', id: 'b', name: 'bronze.orders', tableName: 'bronze.orders' }, target: { itemId: NB, kind: 'notebookObject', id: 'b', name: 'bronze.orders' }, relation: 'reads' },
        { source: { itemId: NB, kind: 'notebookObject', id: 's', name: 'sales.silver.orders' }, target: { itemId: LH, kind: 'sourceObject', id: 's', name: 'sales.silver.orders', tableName: 'sales.silver.orders' }, relation: 'writes' },
        // Unknown store (notebook itself): ignored.
        { source: { itemId: NB, kind: 'sourceObject', id: 'x', name: 'tmp' }, target: { itemId: NB, kind: 'notebookObject', id: 'x', name: 'tmp' }, relation: 'reads' },
      ],
      schema: { [LH]: [{ name: 'silver.orders', description: 'Clean orders', columns: [{ name: 'order_id', dataType: 'int' }], measures: [] }] },
    } as unknown as AtlasData;
    const events = lines(exportOpenLineage(rich, { eventTime }).text);
    for (const ev of events) expect(specErrors(ev)).toEqual([]);
    const nb = events.find((e) => e.job?.name === 'nb_transform.Notebook')!;
    expect(nb.inputs.map((d: any) => d.name)).toEqual(['sales.Lakehouse/Tables/bronze/orders']);
    expect(nb.outputs.map((d: any) => d.name)).toEqual(['dw_gold.Warehouse', 'sales.Lakehouse/Tables/silver/orders']);
    expect(events.find((e) => e.job?.name === 'telemetry.Eventstream')!.job.facets.jobType.processingType).toBe('STREAMING');
    const ds = (name: string) => events.find((e) => e.dataset?.name === name)!;
    expect(ds('sales.Lakehouse')).toMatchObject({
      eventTime: '2026-10-01T10:00:00.000Z',
      dataset: { facets: { documentation: { description: 'Raw sales' }, ownership: { owners: [{ name: 'user:ana@contoso.com', type: 'OWNER' }] } } },
    });
    expect(ds('sales.Lakehouse/Tables/silver/orders').dataset.facets).toMatchObject({
      documentation: { description: 'Clean orders' },
      schema: { fields: [{ name: 'order_id', type: 'int' }] },
    });
    expect(ds('dw_gold.Warehouse')).toMatchObject({ eventTime });
    expect(ds('dw_gold.Warehouse').dataset.facets).toEqual({
      fabricAtlas_item: expect.objectContaining({ platform: 'MICROSOFT_FABRIC', itemType: 'Warehouse', itemId: DW, workspaceId: WS }),
    });
    expect(ds('sales.SemanticModel').dataset.facets.datasetType).toMatchObject({ datasetType: 'MODEL', subType: 'SEMANTIC_MODEL' });
    expect(ds('sales.Lakehouse').dataset.facets.datasetType).toBeUndefined();
    expect(events.find((e) => e.job?.name === 'telemetry.Eventstream')!.job.facets.fabricAtlas_item).toMatchObject({ itemType: 'Eventstream', itemId: ES });
  });

  it('returns an empty file when nothing is in scope', () => {
    expect(exportOpenLineage(data, { itemIds: new Set() })).toMatchObject({ text: '', eventCount: 0 });
  });
});

describe('matchOneLakePath on exported names', () => {
  const index = buildFabricIndex(data);
  const ns = oneLakeNamespace(data.workspace);
  it('links an item root path of any type and resolves same-name items by type', () => {
    expect(matchOneLakePath(ns, oneLakeName(data.items[4]), index)).toEqual({ fabricItemId: RP, fabricObjectName: '' });
    expect(matchOneLakePath(ns, 'sales.SemanticModel', index)?.fabricItemId).toBe(SM);
    expect(matchOneLakePath(ns, 'sales.Lakehouse/Tables/dbo/orders', index)?.fabricItemId).toBe(LH);
    expect(matchOneLakePath(ns, 'sales.SemanticModel/Tables/orders', index)).toBeNull();
    expect(matchOneLakePath(ns, 'unknown.Report', index)).toBeNull();
  });
});
