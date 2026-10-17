# String Functions and Operators

> 💡 **Prefer running full scripts?** See the `sql/` subfolder for complete .sql files instead of the step-by-step walkthrough.


> **Combine scalar UDFs with T-SQL string analytics functions** —
> `EDIT_DISTANCE`, `EDIT_DISTANCE_SIMILARITY`, `JARO_WINKLER_DISTANCE`,
> `JARO_WINKLER_SIMILARITY`, `UNISTR`, and pipe operators.
>
> ⏱️ **Estimated time:** 15-20 minutes

> ⚠️ **Public preview.** The string analytics functions below (`EDIT_DISTANCE`, `EDIT_DISTANCE_SIMILARITY`, `JARO_WINKLER_DISTANCE`, `JARO_WINKLER_SIMILARITY`, `UNISTR`, `||` / `||=`) are in **public preview** in Fabric Data Warehouse, as are Scalar UDFs themselves. Syntax, behavior, and regional availability may change before GA — confirm against the official documentation linked below before relying on them.

## Functions Covered

Get familiar with these built-in functions:

| Function | Purpose | Example | Docs |
|----------|---------|---------|------|
| `EDIT_DISTANCE(str1, str2)` | Damerau-Levenshtein distance with the Optimal String Alignment restriction (includes adjacent transpositions) | `EDIT_DISTANCE('cat', 'car')` → 1 | [📘 Docs](https://learn.microsoft.com/sql/t-sql/functions/edit-distance-transact-sql?view=fabric) |
| `EDIT_DISTANCE_SIMILARITY(str1, str2)` | 0-100 similarity score | `EDIT_DISTANCE_SIMILARITY('test', 'tset')` → 75 | [📘 Docs](https://learn.microsoft.com/sql/t-sql/functions/edit-distance-similarity-transact-sql?view=fabric) |
| `JARO_WINKLER_DISTANCE(str1, str2)` | 0-1 distance favoring prefix matches | `JARO_WINKLER_DISTANCE('John', 'Jon')` → approximately 0.0667 | [📘 Docs](https://learn.microsoft.com/sql/t-sql/functions/jaro-winkler-distance-transact-sql?view=fabric) |
| `JARO_WINKLER_SIMILARITY(str1, str2)` | 0-100 Jaro-Winkler similarity | `JARO_WINKLER_SIMILARITY('John', 'Jon')` → 93 | [📘 Docs](https://learn.microsoft.com/sql/t-sql/functions/jaro-winkler-similarity-transact-sql?view=fabric) |
| `UNISTR('\xxxx')` | Unicode escapes → characters | `UNISTR('\2713')` → ✓ | [📘 Docs](https://learn.microsoft.com/sql/t-sql/functions/unistr-transact-sql?view=fabric) |
| `str1 \|\| str2` | ANSI string concat (NULL-propagating) | `'Hello' \|\| ' World'` → 'Hello World' | [📘 Docs](https://learn.microsoft.com/sql/t-sql/language-elements/string-concatenation-pipes-transact-sql?view=fabric) |
| `@var \|\|= str` | Compound assignment append | `SET @s \|\|= ' more'` | [📘 Docs](https://learn.microsoft.com/sql/t-sql/language-elements/compound-assignment-pipes-transact-sql?view=fabric) |

## Choosing the Right Function

> 💡 **Quick Reference Guide** — This section compares the functions through common usage scenarios. These educational examples are not product guidance. For complete specifications and edge cases, always refer to the official [Microsoft Learn documentation](https://learn.microsoft.com/sql/t-sql/functions/?view=fabric) linked in the table above.

### Distance vs Similarity

| Type | Functions | Returns | Interpretation |
|------|-----------|---------|----------------|
| **Distance** | EDIT_DISTANCE, JARO_WINKLER_DISTANCE | Lower = more similar | 0 = identical |
| **Similarity** | EDIT_DISTANCE_SIMILARITY, JARO_WINKLER_SIMILARITY | Higher = more similar | 100 = identical |

### Damerau-Levenshtein OSA (EDIT_DISTANCE) vs Jaro-Winkler

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Typos anywhere in string | EDIT_DISTANCE | Counts all edits equally |
| Prefix matters (names, codes) | JARO_WINKLER | Weights prefix matches higher |
| Fixed-length data (SKUs, codes) | EDIT_DISTANCE | Absolute edit count is meaningful |
| Variable-length strings | EDIT_DISTANCE_SIMILARITY | Percentage normalizes for length |
| Human names | JARO_WINKLER | Better for transpositions, prefix bias |
| Address/city matching | Either | Test both, pick based on your data |

### Quick Decision Guide

```
Need a threshold-based check?
├─ Yes, fixed max edits (e.g., "≤2 typos") → EDIT_DISTANCE
├─ Yes, percentage (e.g., "≥80% match") → EDIT_DISTANCE_SIMILARITY or JARO_WINKLER_SIMILARITY
└─ No, need raw score for ranking → Normalize if comparing different-length strings

Does prefix accuracy matter more?
├─ Yes (names, product codes) → JARO_WINKLER family
└─ No (general typos) → EDIT_DISTANCE family
```

### Illustrative Examples

The thresholds below are illustrative examples, not product guidance. Calibrate
matching thresholds against labeled data that represents your domain and the
acceptable cost of false matches and missed matches.

| Use Case | Function | Threshold |
|----------|----------|-----------|
| Deduplicating customer names | JARO_WINKLER_SIMILARITY | ≥ 85 |
| Validating city spelling | EDIT_DISTANCE | ≤ 2 |
| Fuzzy product search | EDIT_DISTANCE_SIMILARITY | ≥ 70 |
| Matching company names | JARO_WINKLER_SIMILARITY | ≥ 80 |

## Scripts

| Script | What You'll Learn |
|--------|-------------------|
| [01_string_analytics_udfs.md](01_string_analytics_udfs.md) | Combine string built-in functions with user-defined functions |

## What the Script Does

The walkthrough creates four focused UDFs:

- fixed edit-distance validation;
- Jaro-Winkler duplicate detection;
- typo-severity aggregation;
- Unicode export labels with pipe concatenation.

Each function introduces either a distinct string algorithm or a distinct
warehouse query shape.

---

➡️ **Start:** Run [01_string_analytics_udfs.md](01_string_analytics_udfs.md).

---

➡️ Continue to [Fuzzy String Matching](../06_FuzzyStringMatching/00_ReadMe.md).

⬅️ [Back to Combining Inlining Techniques](../04_CombiningInliningTechniques/00_ReadMe.md) |
🏠 [Back to Main](../README.md)
