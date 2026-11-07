# Item Relations Preview evidence

Fabric Atlas keeps the Fabric Item Relations API in a separate Beta evidence
path. Preview never overwrites trusted Atlas snapshot lineage.

## API contract

The Rayfin Function calls only the documented Beta routes:

```text
GET /v1/workspaces/{workspaceId}/items/{itemId}/relations/upstream?beta=true
GET /v1/workspaces/{workspaceId}/items/{itemId}/relations/downstream?beta=true
```

The collector:

- validates workspace and item UUIDs;
- rejects redirects;
- validates continuation origin and path;
- bounds pages, records, bytes, attempts and execution time;
- honours bounded `Retry-After`;
- stores fixed failure codes without upstream response bodies;
- preserves unknown item and relation types as raw values.

## Identity and direction

Node identity is:

```text
workspaceId:itemId
```

This prevents collisions when the same item ID appears in different workspace
contexts.

Relationships are normalized from source to consumer for layout, while the raw
Fabric `relationType` stays visible as evidence.

Observed relation types include:

- `Association`;
- `CascadeDelete`;
- `Datasource`;
- `PushData`;
- `Shortcut`;
- `WeakAssociation`.

Unknown values remain visible and are not coerced into a known family.

## UI behaviour

Map & lineage has one Preview switch.

- Preview off: draw trusted Atlas snapshot lineage.
- Preview on: hide Atlas edges and draw Item Relations evidence only.
- Object mode remains an Atlas view.
- Evidence lists the raw relation, source, target, workspace boundary and
  observation time.
- Reset clears selection, focus, impact, drag state and Preview expansion.

Atlas and Preview are never drawn as competing edges in the same graph.

## Persisted evidence

`ItemRelationsEvidenceSnapshot` stores one chunked, checksummed envelope per
workspace snapshot.

The envelope contains:

- relationship records;
- per-item upstream and downstream query status;
- complete, failed and preserved query counts;
- collection time and stop reason;
- source and target workspace IDs;
- raw relation types;
- schema and contract versions.

The entity is non-authoritative. No code path copies these rows into
`LineageEdge`.

## Failure behaviour

A failed Preview query does not invalidate the Atlas snapshot.

When a query fails or collection stops early:

- successful current responses remain;
- compatible prior evidence can be preserved;
- failure and throttling counts remain visible;
- the graph never falls back silently to Atlas edges while Preview is enabled.

Cycles remain evidence. The layout may not be fully left-to-right when a cycle
exists.

## Cross-workspace evidence

Preview can show stored external nodes and expand stored neighbours one bounded
hop at a time. The graph uses the real external workspace and item IDs.

Live external expansion is not implemented. Atlas does not crawl reachable
workspaces in the background.

The shared workspace scope and the Preview graph remain separate:

- selected workspaces can publish trusted independent snapshots;
- external Preview nodes remain Beta evidence until that workspace is selected
  and synchronized through the normal Atlas path.

## Privacy boundary

Item Relations collection stores relationship metadata only. It does not read:

- table rows;
- notebook or pipeline source;
- prompts or Data Agent answers;
- credentials or connection payloads;
- report visual field bindings.

## Source files

| Path | Responsibility |
|---|---|
| `rayfin/functions/src/workspace-item-relations.ts` | Bounded Fabric API collector |
| `src/atlas/item-relations-evidence.ts` | Contract, normalization and merge rules |
| `src/atlas/item-relations-evidence-store.ts` | Chunked persistence |
| `src/atlas/item-relations-evidence-source.ts` | Active workspace evidence loading |
| `src/atlas/lineage-evidence.ts` | Preview graph and Evidence model |
| `src/atlas/views/Map.tsx` | Graph, Evidence, expansion and Reset behaviour |
