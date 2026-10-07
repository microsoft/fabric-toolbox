# Fuzzy String Matching

## Purpose

This lab demonstrates an end-to-end scenario for matching incoming supplier
product names with a product catalog. It shows three ways to build fuzzy
matching logic in Fabric Data Warehouse:

1. Use native `EDIT_DISTANCE`, `EDIT_DISTANCE_SIMILARITY`, and Jaro-Winkler
   functions directly to measure how closely two strings match.
2. Combine the native functions inside `dbo.BlogFuzzy_MatchDisposition` to
   create a reusable, parameter-driven policy with `EXACT`, `AUTO_MATCH`,
   `REVIEW`, and `NO_MATCH` outcomes.
3. Implement a custom weighted classic Levenshtein algorithm entirely in a
   T-SQL scalar UDF. `dbo.BlogFuzzy_WeightedLevenshtein` uses nested `WHILE`
   loops and configurable insertion, deletion, and substitution costs for the
   sample's bounded string inputs.

The scenario applies these approaches to algorithm comparison, candidate
ranking, match validation, review routing, and data-quality summaries.

If you completed
[String Functions and Operators](../05_StringFunctions_and_Operators/00_ReadMe.md),
you can skim the introductions to the native functions. Run all Lab 06 scripts
because this scenario creates its own tables and UDFs.

## Run order

| Script | Purpose |
|---|---|
| [`sql/00_setup.sql`](sql/00_setup.sql) | Create the product catalog, controlled name variants, matching policy, and incoming listings |
| [`sql/01_create_udfs.sql`](sql/01_create_udfs.sql) | Create the weighted classic Levenshtein and reusable matching-policy UDFs |
| [`sql/02_fuzzy_matching_queries.sql`](sql/02_fuzzy_matching_queries.sql) | Compare algorithms, rank candidates, validate results, and produce a review queue |
| [`sql/99_cleanup.sql`](sql/99_cleanup.sql) | Remove all Lab 06 objects |

## How to read the algorithm comparison

The first query in `02_fuzzy_matching_queries.sql` runs several algorithms
against the same controlled examples:

| Output | Produced by | How to interpret it |
|---|---|---|
| `CustomClassicDistance` | Custom scalar UDF | `dbo.BlogFuzzy_WeightedLevenshtein` with insert, delete, and substitution costs set to `1` |
| `CustomWeightedDistance` | Custom scalar UDF | The same UDF with substitution cost set to `3`; the algorithm can choose a cheaper delete-plus-insert path costing `2` |
| `NativeOsaDistance` | Fabric built-in | `EDIT_DISTANCE`; lower is closer and `0` is exact |
| `NativeOsaSimilarity` | Fabric built-in | `EDIT_DISTANCE_SIMILARITY` on a `0`-`100` scale; higher is closer |
| `JaroWinklerDistance` | Fabric built-in | `JARO_WINKLER_DISTANCE` on a `0`-`1` scale; lower is closer |
| `JaroWinklerSimilarity` | Fabric built-in | `JARO_WINKLER_SIMILARITY` on a `0`-`100` scale; higher is closer |
| `WhatThisRowShows` | Scenario setup data | The specific algorithm behavior demonstrated by that row |

The controlled rows highlight different behaviors:

- **Substitution:** classic Levenshtein and native OSA both count `CAT` →
  `CUT` as one edit. The weighted version returns `2` because delete plus
  insert is cheaper than a substitution costing `3`.
- **Insertion:** `HEADPHONE` → `HEADPHONES` costs one insertion.
- **Adjacent transposition:** classic Levenshtein counts `CA` → `AC` as two
  edits, while OSA recognizes one adjacent swap.
- **Common prefix:** Jaro-Winkler gives `MARTHA` and `MARHTA` a high similarity
  because most characters and the prefix align.
- **Weighted business cost:** repeats the substitution input intentionally to
  isolate the effect of changing operation costs.

The default setup creates 960 known product-name variations and 80 unknown
products. The validation queries confirm that known listings select the
expected candidate and that unknown products aren't automatically matched.

The thresholds are illustrative. Production values require calibration with
labeled examples from the target data.

⬅️ [Back to String Functions and Operators](../05_StringFunctions_and_Operators/00_ReadMe.md) |
🏠 [Back to Main](../README.md)
