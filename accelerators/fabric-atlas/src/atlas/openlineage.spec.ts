import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkOpenLineageFile,
  datasetKey,
  decodeColumns,
  encodeColumns,
  OL_LIMITS,
  parseOpenLineage,
  platformOf,
} from './openlineage';

const fixture = (name: string) => readFileSync(resolve('src/atlas/__fixtures__/openlineage', name), 'utf8');

describe('parseOpenLineage', () => {
  it('reads the mock scenario NDJSON with the job, datasets, run and column lineage', () => {
    const r = parseOpenLineage(fixture('mock-scenario.ndjson'));
    expect(r.status).toBe('accepted');
    expect(r.format).toBe('ndjson');
    expect(r.eventCount).toBe(6);
    expect(r.namespace).toBe('source://acme-prod/risk');
    expect(r.platform).toBe('Data source');
    expect(r.warnings).toEqual([{ line: 7, message: 'Invalid JSON, line skipped' }]);

    const target = datasetKey('abfss://finance-bronze@onelake.dfs.fabric.microsoft.com', 'lh_bronze/Tables/risk_scores');
    const into = r.edges.filter((e) => e.targetKey === target);
    expect(into.map((e) => e.sourceKey).sort()).toEqual([
      'oracle://core-bank:1521|CBS.LOANS',
      'source://acme-prod/risk|RISKLIB.MODEL_INPUT',
    ]);
    for (const e of into) {
      expect(e.jobName).toBe('risk.score_customers');
      expect(e.lastRunState).toBe('COMPLETE');
      expect(e.lastRunTime).toBe('2026-10-28T06:12:44Z');
      expect(e.runId).toBe('0198d4f2-5b7a-7c3e-9a41-2f6d8e1b7c1e');
    }
    const cols = into.flatMap((e) => e.columns.map((c) => `${c.from}->${c.to}`)).sort();
    expect(cols).toEqual(['CUST_ID->customer_id', 'LGD->lgd', 'PD_12M->pd_12m', 'SEGMENT->risk_segment']);

    const platforms = new Set(r.datasets.map((d) => d.platform));
    expect(platforms).toEqual(new Set(['Data source', 'Oracle', 'Fabric']));
    expect(r.edges.find((e) => e.jobName === 'risk.export_exposure')?.lastRunState).toBe('FAIL');
  });

  it('never keeps SQL text, source code or other facets', () => {
    const r = parseOpenLineage(fixture('mock-scenario.ndjson'));
    const kept = JSON.stringify(r);
    expect(kept).not.toMatch(/SELECT|sourceCode|dataQualityMetrics|dataSource|PROC /i);
  });

  it('reads a JSON array and a single event', () => {
    const arr = parseOpenLineage(fixture('pricing_lineage.json'));
    expect(arr.status).toBe('accepted');
    expect(arr.format).toBe('json-array');
    expect(arr.platform).toBe('Databricks');
    expect(arr.edges.some((e) => e.targetKey.endsWith('lh_silver.Lakehouse/Tables/price_curves'))).toBe(true);

    const one = parseOpenLineage(fixture('column-lineage.json'));
    expect(one.format).toBe('json-object');
    expect(one.eventCount).toBe(1);
    const fromLoans = one.edges.find((e) => e.sourceKey === 'oracle://core-bank:1521|CBS.LOANS');
    expect(fromLoans?.columns).toEqual([{ from: 'OUTSTANDING', to: 'exposure', transform: 'TRANSFORMATION' }]);
    const fromModel = one.edges.find((e) => e.sourceKey.endsWith('RISKLIB.MODEL_INPUT'));
    expect(fromModel?.columns.map((c) => c.to).sort()).toEqual(['customer_id', 'exposure']);
  });

  it('rejects a non-OpenLineage JSON export', () => {
    const r = parseOpenLineage(fixture('export_lineage_v1.json'));
    expect(r.status).toBe('rejected');
    expect(r.rejectReason).toBe('Not OpenLineage');
    expect(r.eventCount).toBe(0);
  });

  it('rejects empty and broken files', () => {
    expect(parseOpenLineage('  ').rejectReason).toBe('Empty file');
    expect(parseOpenLineage('[{"a":').rejectReason).toBe('Invalid JSON');
    expect(parseOpenLineage('not json\nstill not').rejectReason).toBe('Invalid JSON');
  });

  it('warns on events without a job and datasets without a name', () => {
    const text = [
      JSON.stringify({ eventTime: '2026-01-01T00:00:00Z', run: { runId: 'r' } }),
      JSON.stringify({
        eventTime: '2026-01-01T00:00:00Z',
        eventType: 'COMPLETE',
        job: { namespace: 'source://x', name: 'j' },
        inputs: [{ namespace: 'source://x' }, { namespace: 'source://x', name: 'A' }],
        outputs: [{ namespace: 'source://x', name: 'B' }],
      }),
    ].join('\n');
    const r = parseOpenLineage(text);
    expect(r.status).toBe('accepted');
    expect(r.warnings).toEqual([
      { line: 1, message: 'Event without job namespace or name, skipped' },
      { line: 2, message: 'Input dataset without namespace or name, skipped' },
    ]);
    expect(r.edges).toHaveLength(1);
  });

  it('normalises dataset keys and dedups edges, keeping the latest run', () => {
    const ev = (time: string, type: string, ns: string, runId: string) =>
      JSON.stringify({
        eventTime: time,
        eventType: type,
        run: { runId },
        job: { namespace: 'SOURCE://Acme/', name: 'j' },
        inputs: [{ namespace: ns, name: 'A/' }],
        outputs: [{ namespace: 'source://acme', name: 'B' }],
      });
    const r = parseOpenLineage(
      [
        ev('2026-01-02T00:00:00Z', 'COMPLETE', 'SOURCE://ACME/', 'r2'),
        ev('2026-01-01T00:00:00Z', 'FAIL', 'source://acme', 'r1'),
        ev('2026-01-02T00:00:00Z', 'START', 'source://acme', 'r3'),
      ].join('\n'),
    );
    expect(r.datasets.map((d) => d.key)).toEqual(['source://acme|A', 'source://acme|B']);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toMatchObject({ lastRunState: 'COMPLETE', runId: 'r2', jobNamespace: 'source://acme' });
  });

  it('enforces the event and dataset limits', () => {
    const line = JSON.stringify({ eventTime: 't', job: { namespace: 'a://b', name: 'j' } });
    const many = Array.from({ length: OL_LIMITS.maxEvents + 1 }, () => line).join('\n');
    expect(parseOpenLineage(many).rejectReason).toBe('Too many events (max 50,000)');

    const outputs = Array.from({ length: OL_LIMITS.maxDatasets + 1 }, (_, i) => ({ namespace: 'a://b', name: `t${i}` }));
    const big = JSON.stringify({ eventTime: 't', job: { namespace: 'a://b', name: 'j' }, outputs });
    expect(parseOpenLineage(big).rejectReason).toBe('Too many datasets (max 5,000)');
  });
});

describe('file checks and helpers', () => {
  it('accepts .json/.ndjson up to 20 MB', () => {
    expect(checkOpenLineageFile('a.ndjson', 10)).toBeNull();
    expect(checkOpenLineageFile('A.JSON', OL_LIMITS.maxBytes)).toBeNull();
    expect(checkOpenLineageFile('a.csv', 10)).toMatch(/Unsupported/);
    expect(checkOpenLineageFile('a.json', OL_LIMITS.maxBytes + 1)).toBe('File too large (max 20 MB)');
  });

  it('derives platforms from namespaces', () => {
    expect(platformOf('source://acme-prod/risk')).toBe('Data source');
    expect(platformOf('oracle://core-bank:1521')).toBe('Oracle');
    expect(platformOf('abfss://ws@onelake.dfs.fabric.microsoft.com')).toBe('Fabric');
    expect(platformOf('mssql://x.datawarehouse.fabric.microsoft.com')).toBe('Fabric');
    expect(platformOf('abfss://raw@stpricing.dfs.core.windows.net')).toBe('ADLS');
    expect(platformOf('weird')).toBe('Other');
  });

  it('encodes column lineage within the storage cap', () => {
    const cols = Array.from({ length: 200 }, (_, i) => ({ from: `in_${i}`, to: `out_${i}`, transform: 'IDENTITY' }));
    const { text, truncated } = encodeColumns(cols);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(1800);
    const back = decodeColumns(text);
    expect(back[0]).toEqual(cols[0]);
    expect(encodeColumns(cols.slice(0, 2))).toEqual({ text: JSON.stringify([['in_0', 'out_0', 'IDENTITY'], ['in_1', 'out_1', 'IDENTITY']]), truncated: false });
    expect(decodeColumns('garbage')).toEqual([]);
  });
});
