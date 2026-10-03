# Lineage depth

Fabric Atlas exposes four read-only depth views in **Map & lineage**. Each one uses only
evidence that Atlas already synchronizes or persists. Where the evidence does
not exist, the UI and `src/atlas/lineage-capabilities.ts` state a dated
capability gap instead of approximating it.

| Capability | State (2026-10-02) | Evidence |
| --- | --- | --- |
| #34 Lineage time machine | Available | Two validated snapshots from retained history |
| #32 Breaking change guard | Available | Snapshot comparison, historical item lineage, verified DAX dependencies |
| #31 Semantic model X-Ray | Available | Synchronized tables, columns, measures and measure DAX |
| #33 Cross-workspace expansion | Partial | Persisted Item Relations (Beta) evidence only |
| Ontology metrics | Deferred | Not present in collected Ontology definitions |
| Ontology entity inheritance | Deferred | Not present in collected Ontology definitions |

## #34 Lineage time machine

**Changes → Time machine.** `src/atlas/lineage-time-machine.ts` compares two
retained snapshots, always from the older to the newer one.

- **Snapshots.** Any two entries of `history.summaries`; missing catalogs are
  loaded with `loadHistorySnapshot`. The tab shows explicit loading,
  unavailable-history (a snapshot failed to load) and "needs a second
  snapshot" states.
- **Union graph.** Items and normalized source-to-consumer edges of both
  snapshots are laid out once with `buildStagedLayout`. The Before, Changes and
  After views only hide or restyle elements, so positions never change.
- **States.** Items are retained, added, removed (drawn as dashed historical
  ghosts) or changed (name, type, health, documented owner, owner email,
  sensitivity or endorsement). Relationships are retained, added, removed,
  reversed (same endpoints, opposite direction) or changed (relation label or
  broken state). Normalization runs first, so a stored edge that only differs
  by orientation rules is not reported as reversed.
- **Inspector.** Selecting an item shows before and after values, its changed
  relationships and an **Open in Change Center** link that pre-selects both
  snapshots and the item name. Removed items stay inspectable from the older
  snapshot.
- **Deep links.** `tm.from`, `tm.to`, `tm.section`, `tm.view`, `tm.item` and
  `tm.candidate`. Navigation away clears them.
- **Limits.** Item level only. Item Relations (Beta) evidence has no history and
  is never compared across time.

## #32 Breaking change guard

**Changes → Breaking changes.** `src/atlas/breaking-changes.ts` classifies the
`compareSnapshots` result between the selected snapshots.

| Kind | Rule | Base score |
| --- | --- | --- |
| Item removed | `item-removed` | 2 |
| Table, column or measure removed | `schema-object-removed` for table/view, column or measure kinds | 2 |
| Lineage direction reversed | a `lineage-removed` edge paired with a `lineage-added` edge between the same items in the opposite direction | 2 |
| Column data type changed | `schema-object-modified` on a column whose `dataType` changed | 1 |
| Measure expression changed | `schema-object-modified` on a measure whose `expression` changed | 1 |
| Lineage relationship removed | `lineage-removed` without a reversal | 1 |
| Lineage relationship marked broken | `lineage-broken-state-changed` to broken | 1 |
| Documented owner removed | owner name and email cleared on an item with downstream consumers | 1 |
| Owner permission removed | item-level `owner` grant removed on an item with downstream consumers | 1 |

- **Impact.** Downstream items come from the older snapshot's normalized
  lineage, where the removed or changed evidence still existed. Dependent model
  objects are the direct consumers in the older snapshot's verified (and
  labelled inferred) DAX dependencies. Changes that belong to a removed item are
  folded into that item's candidate.
- **Severity.** Base score, plus 1 when any downstream item or dependent object
  exists, plus 1 when downstream impact reaches two hops or more. 3 or more is
  high, 2 medium, 1 low. Usage is never estimated.
- **Detail.** Exact before and after values, documented owner, downstream path
  with hop counts, dependent objects, the three most recent jobs, an **Open in
  Change Center** link and a Markdown **Export brief**.
- **Filters.** Domain, severity, documented owner and affected item type.
- **Limits.** Impact is item-level and DAX-object-level. Report visual field
  usage is not exposed by Fabric APIs and is never claimed.

## #31 Semantic model X-Ray

**X-Ray tab.** `src/atlas/semantic-xray.ts` builds the complete dependency
evidence of one semantic model from the active snapshot.

- Every table, measure and column is listed, grouped by table. Groups are
  collapsed by default and open while searching.
- The table groups never shrink vertically to fit a large model. The object
  list and evidence pane scroll independently on desktop; narrow layouts stack
  them with a bounded object list.
- A DAX reference becomes an edge only when it resolves to exactly one
  synchronized object, with the same rules as `buildSchemaDependencies`:
  unqualified `[Name]` must match exactly one measure; `'Table'[Name]` must
  match exactly one table and exactly one column or measure in it. Other
  references are listed as unresolved or ambiguous with their candidates.
- **Depends on** and **Used by**, direct or transitive, highlight objects with
  hop counts without reordering the list. Cycles and self references are
  detected and traversal stops on repeated objects.
- **Depends on** means inputs; **Used by** means consumers. **Direct** follows
  one resolved hop and **Transitive** follows every reachable resolved hop.
  Arrow keys operate these controls. The evidence pane lists direct
  references, while the selected direction and scope control list highlights.
- Measures without DAX consumers say "No DAX consumers in this model"; report
  and visual usage is not exposed by Fabric APIs, so they are not called
  unused.
- The selected object's dependency evidence can be exported as Markdown.
- View state is shareable through `xray.model`, `xray.object`, `xray.dir`,
  `xray.scope`, `xray.kind` and `xray.q`.
- **Limits.** The first iteration is a grouped dependency explorer, not a node
  canvas. Cross-item lineage stays on the Graph tab.

## #33 Cross-workspace expansion

**Graph tab, Preview evidence on.** `buildPreviewOverlay` in
`src/atlas/lineage-evidence.ts` places endpoints outside the snapshot in lanes
right of the staged layout.

- Graph uses one source at a time: Preview on draws only Item Relations API
  edges, including those agreeing with Atlas. Preview off draws only Atlas
  snapshot lineage. Loading, missing or failed Preview evidence never falls
  back to Atlas. Evidence can still compare both sources.
- Preview disables object mode because Item Relations provides item-level
  lineage only. Data flow relations and Control relations retain their
  independent filtering behavior and existing visual treatment in both sources.
- Column 0 shows only outside endpoints next to visible snapshot items. A lane
  node with hidden stored neighbours shows an **Expand** button with the hidden
  count.
- Expansion reveals that node's other stored neighbours in the next column,
  appended below existing nodes, so nothing already shown moves. Identities are
  composite `workspaceId:itemId` keys; repeating an expansion is a no-op.
- Bounds: 12 revealed nodes per expansion, 60 lane nodes and 20 expansions in
  total. Withheld counts are shown in the exploration path.
- The path (workspace and item per step) and a reset action appear under the
  Preview status. Expansions persist in the `expand` URL parameter; malformed
  keys are ignored.
- **Deferred: live expansion.** Atlas does not query external items on demand.
  The collector Function is synchronizer-only, the evidence envelope and its
  merge rules are scoped to one workspace's root items, and disclosure of
  unselected workspaces through shared evidence has not been reviewed.
  Unavailable or locked external items therefore cannot be distinguished from
  items Atlas never queried, and the UI only says how many stored relations
  remain hidden.

## Ontology metrics and inheritance (deferred)

Decision date: 2026-10-02. `OntologyMetadata` parses entity types, properties,
relationships, data bindings and contextualizations. No metric or entity
inheritance fields have been observed in real Ontology definition payloads, so
Atlas shows no metric nodes, no DAX-to-metric lineage and no inherited
properties. Re-open when a captured definition (with its schema version)
contains documented metric or base-type fields; each new edge must come from a
documented binding, not a name match.

## Validation

```powershell
npm test -- src\atlas\lineage-time-machine.spec.ts src\atlas\breaking-changes.spec.ts src\atlas\semantic-xray.spec.ts src\atlas\lineage-evidence.spec.ts src\atlas\components\LineageChangesPanel.spec.tsx src\atlas\components\SemanticXRayPanel.spec.tsx src\atlas\views\Map.evidence.spec.tsx src\atlas\routing.spec.ts
```
