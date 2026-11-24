import type { AtlasData } from './model';
import {
  buildFabricIndex,
  datasetIdFor,
  importOpenLineageFile,
  loadExternalLineage,
  setLink,
  type ExternalRepo,
} from './external-lineage';
import { datasetKey } from './openlineage';

/**
 * Preview-only sample: three imported OpenLineage files around the sample
 * workspace (a data source file, a Databricks file and a rejected non-OpenLineage file).
 */
const PRODUCER = 'https://github.com/OpenLineage/OpenLineage/tree/1.24.0/integration/demo';
const SCHEMA = 'https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent';
const SOURCE_NS = 'source://pricing-db/pricing';
const ORACLE_NS = 'oracle://crm-db:1521';
const DBX_NS = 'databricks://adb-7421';
const DW_NS = 'mssql://alpinerent-dw.datawarehouse.fabric.microsoft.com';

function oneLake(workspaceId: string): string {
  return `abfss://${workspaceId}@onelake.dfs.fabric.microsoft.com`;
}

function event(
  time: Date,
  runId: string,
  job: { namespace: string; name: string },
  inputs: { namespace: string; name: string }[],
  outputs: { namespace: string; name: string; columns?: Record<string, { namespace: string; name: string; field: string }[]> }[],
  eventType = 'COMPLETE',
) {
  return {
    eventType,
    eventTime: time.toISOString(),
    producer: PRODUCER,
    schemaURL: SCHEMA,
    run: { runId },
    job,
    inputs,
    outputs: outputs.map(({ columns, ...o }) =>
      columns
        ? {
            ...o,
            facets: {
              columnLineage: {
                _producer: PRODUCER,
                _schemaURL: 'https://openlineage.io/spec/facets/1-2-0/ColumnLineageDatasetFacet.json',
                fields: Object.fromEntries(
                  Object.entries(columns).map(([field, inputFields]) => [field, { inputFields }]),
                ),
              },
            },
          }
        : o,
    ),
  };
}

export function previewOpenLineageFiles(workspaceId: string, now: Date) {
  const lake = oneLake(workspaceId);
  const day = (n: number, h = 6) => new Date(now.getTime() - n * 86_400_000 - h * 3_600_000);
  const source = [
    event(day(0), '0198d4f2-1a0c-7c1e-9a55-3f0c2d1b7c1e', { namespace: SOURCE_NS, name: 'pricing.score_members' },
      [
        { namespace: ORACLE_NS, name: 'CRM.MEMBERS' },
        { namespace: SOURCE_NS, name: 'PRICINGLIB.MEMBER_SCORE_INPUT' },
      ],
      [{
        namespace: lake,
        name: 'alpinerent_lakehouse/Tables/gold/member_segments',
        columns: {
          segment: [{ namespace: SOURCE_NS, name: 'PRICINGLIB.MEMBER_SCORE_INPUT', field: 'SCORE_BAND' }],
          member_id: [{ namespace: ORACLE_NS, name: 'CRM.MEMBERS', field: 'MEMBER_ID' }],
        },
      }]),
    event(day(0, 5), '0198d4f2-2b1d-7c1e-9a55-3f0c2d1b7c1f', { namespace: SOURCE_NS, name: 'pricing.revenue_forecast' },
      [
        { namespace: lake, name: 'alpinerent_lakehouse/Tables/gold/revenue_by_month' },
        { namespace: DW_NS, name: 'alpinerent_dw.dbo.fact_rentals' },
      ],
      [{ namespace: SOURCE_NS, name: 'PRICINGLIB.REVENUE_FORECAST' }]),
  ];
  const dbx = [
    event(day(7), '0198c0aa-9e11-7d42-8b10-5a7e7f0c1d01', { namespace: DBX_NS, name: 'pricing_lineage.dynamic_prices' },
      [
        { namespace: lake, name: 'alpinerent_lakehouse/Tables/gold/station_utilization' },
        { namespace: DBX_NS, name: 'pricing.competitor_prices' },
      ],
      [{ namespace: DBX_NS, name: 'pricing.dynamic_prices' }]),
    event(day(7, 4), '0198c0aa-9e11-7d42-8b10-5a7e7f0c1d02', { namespace: DBX_NS, name: 'pricing_lineage.publish_prices' },
      [{ namespace: DBX_NS, name: 'pricing.dynamic_prices' }],
      [{ namespace: lake, name: 'alpinerent_lakehouse/Tables/silver/station_prices' }]),
  ];
  const notOl = { format: 'export_lineage', version: 1, nodes: [{ id: 'a' }], links: [] };
  return [
    { name: 'export_lineage_v1.json', text: JSON.stringify(notOl, null, 2), at: day(8), by: 'frgisber' },
    { name: 'pricing_lineage.json', text: JSON.stringify(dbx, null, 2), at: day(7), by: 'data-eng' },
    { name: 'pricing_source_2026-10-28.ndjson', text: source.map((e) => JSON.stringify(e)).join('\n'), at: day(0, -3), by: 'frgisber' },
  ];
}

const seeded = new WeakMap<ExternalRepo, Set<string>>();

/** Seeds the preview repository once per workspace. */
export async function seedPreviewExternalLineage(
  repo: ExternalRepo,
  data: Pick<AtlasData, 'workspace' | 'items' | 'schema'>,
  now = new Date(),
): Promise<void> {
  const ws = data.workspace.fabricId;
  const done = seeded.get(repo) ?? new Set<string>();
  seeded.set(repo, done);
  if (done.has(ws)) return;
  done.add(ws);
  if ((await repo.list('OpenLineageImport', ws)).length) return;

  const index = buildFabricIndex(data);
  for (const file of previewOpenLineageFiles(ws, now)) {
    const actor = { id: `preview-${file.by}`, email: `${file.by}@alpinerent.example` };
    const current = await loadExternalLineage(repo, ws);
    await importOpenLineageFile(
      repo, ws, actor,
      { name: file.name, size: file.text.length, text: file.text },
      index, current, file.at,
    );
  }
  const steward = { id: 'preview-frgisber', email: 'frgisber@alpinerent.example' };
  const dw = data.items.find((i) => i.itemType === 'Warehouse');
  if (dw) {
    await setLink(repo, await datasetIdFor(ws, datasetKey(DW_NS, 'alpinerent_dw.dbo.fact_rentals')),
      { state: 'linked', fabricItemId: dw.fabricId, fabricObjectName: 'dbo.fact_rentals' }, steward, now);
  }
  await setLink(repo, await datasetIdFor(ws, datasetKey(ORACLE_NS, 'CRM.MEMBERS')), { state: 'external' }, steward, now);
  await setLink(repo, await datasetIdFor(ws, datasetKey(DBX_NS, 'pricing.competitor_prices')), { state: 'external' }, steward, now);
}
