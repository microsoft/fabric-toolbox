using System.Text.Json;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Infrastructure;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Retrieves model metadata via INFO.TABLES / INFO.COLUMNS / INFO.MEASURES / INFO.RELATIONSHIPS.
/// Port of Python metadata.py.
/// </summary>
public class MetadataService
{
    private readonly IAuthService _auth;

    public MetadataService(IAuthService auth)
    {
        _auth = auth;
    }

    /// <summary>
    /// Execute a DMV query and return parsed rows (list of dicts).
    /// Uses auth retry for service connections.
    /// </summary>
    public async Task<List<Dictionary<string, string?>>> ExecuteDmvQueryAsync(
        string xmlaEndpoint, string datasetName, string dmvQuery)
    {
        var token = await GetTokenIfNeeded(xmlaEndpoint);
        var raw = await XmlaClient.ExecuteQueryWithRetryAsync(xmlaEndpoint, datasetName, dmvQuery, token, _auth);

        if (raw.StartsWith("Error:"))
            throw new InvalidOperationException($"DMV query failed: {raw}");

        var doc = JsonDocument.Parse(raw);
        var rows = doc.RootElement.GetProperty("rows");
        var result = new List<Dictionary<string, string?>>();

        foreach (var row in rows.EnumerateArray())
        {
            var d = new Dictionary<string, string?>();
            foreach (var prop in row.EnumerateObject())
            {
                // Strip DMV column prefixes like [@...] → clean name
                var key = prop.Name.Replace("[@", "").Replace("]", "");
                d[key] = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.ToString();
            }
            result.Add(d);
        }
        return result;
    }

    /// <summary>
    /// Get complete model definition (tables, columns, measures, relationships) — clean output.
    /// </summary>
    public async Task<Dictionary<string, object>> GetCompleteModelDefinitionAsync(
        string xmlaEndpoint, string datasetName)
    {
        try
        {
            var token = await GetTokenIfNeeded(xmlaEndpoint);

            var tablesRaw = await RunMetadataQueryAsync(xmlaEndpoint, datasetName, token, @"
                EVALUATE SELECTCOLUMNS(INFO.TABLES(),
                    ""@table_id"", [ID], ""@table_name"", [Name],
                    ""@description"", [Description], ""@is_hidden"", [IsHidden])");

            var columnsRaw = await RunMetadataQueryAsync(xmlaEndpoint, datasetName, token, @"
                EVALUATE SELECTCOLUMNS(INFO.COLUMNS(),
                    ""@column_id"", [ID], ""@table_id"", [TableID],
                    ""@column_name"", [ExplicitName], ""@description"", [Description],
                    ""@data_type"", [ExplicitDataType],
                    ""@is_hidden"", [IsHidden], ""@format_string"", [FormatString])");

            var measuresRaw = await RunMetadataQueryAsync(xmlaEndpoint, datasetName, token, @"
                EVALUATE SELECTCOLUMNS(INFO.MEASURES(),
                    ""@measure_id"", [ID], ""@table_id"", [TableID],
                    ""@measure_name"", [Name], ""@description"", [Description],
                    ""@expression"", [Expression],
                    ""@format_string"", [FormatString], ""@is_hidden"", [IsHidden],
                    ""@display_folder"", [DisplayFolder])");

            var relationshipsRaw = await RunMetadataQueryAsync(xmlaEndpoint, datasetName, token, @"
                EVALUATE SELECTCOLUMNS(INFO.RELATIONSHIPS(),
                    ""@from_table_id"", [FromTableID], ""@from_column_id"", [FromColumnID],
                    ""@to_table_id"", [ToTableID], ""@to_column_id"", [ToColumnID],
                    ""@cross_filtering_behavior"", [CrossFilteringBehavior],
                    ""@is_active"", [IsActive],
                    ""@from_cardinality"", [FromCardinality], ""@to_cardinality"", [ToCardinality])");

            if (tablesRaw == null || columnsRaw == null || measuresRaw == null || relationshipsRaw == null)
                return new Dictionary<string, object> { ["status"] = "error", ["error"] = "Failed to retrieve metadata" };

            // Build table ID → name mapping
            var tableMap = new Dictionary<string, string>();
            foreach (var t in tablesRaw)
                if (t.TryGetValue("table_id", out var tid) && t.TryGetValue("table_name", out var tname) && tid != null && tname != null)
                    tableMap[tid] = tname;

            // Build column ID → name mapping
            var columnMap = new Dictionary<string, string>();
            foreach (var c in columnsRaw)
                if (c.TryGetValue("column_id", out var cid) && c.TryGetValue("column_name", out var cname) && cid != null && cname != null)
                    columnMap[cid] = cname;

            // Clean measures for output
            var measures = measuresRaw.Select(m => new Dictionary<string, string?>
            {
                ["table_name"] = m.TryGetValue("table_id", out var mid) && mid != null && tableMap.TryGetValue(mid, out var mn) ? mn : "Unknown",
                ["measure_name"] = m.GetValueOrDefault("measure_name"),
                ["description"] = m.GetValueOrDefault("description"),
                ["expression"] = m.GetValueOrDefault("expression"),
                ["format_string"] = m.GetValueOrDefault("format_string"),
                ["is_hidden"] = m.GetValueOrDefault("is_hidden"),
                ["display_folder"] = m.GetValueOrDefault("display_folder")
            }).ToList();

            // Clean columns
            var columns = columnsRaw.Select(c => new Dictionary<string, string?>
            {
                ["table_name"] = c.TryGetValue("table_id", out var ctid) && ctid != null && tableMap.TryGetValue(ctid, out var ctn) ? ctn : "Unknown",
                ["column_name"] = c.GetValueOrDefault("column_name"),
                ["description"] = c.GetValueOrDefault("description"),
                ["data_type"] = c.GetValueOrDefault("data_type"),
                ["is_hidden"] = c.GetValueOrDefault("is_hidden"),
                ["format_string"] = c.GetValueOrDefault("format_string")
            }).ToList();

            // Clean relationships
            var relationships = relationshipsRaw.Select(r =>
            {
                var fromTableId = r.GetValueOrDefault("from_table_id") ?? "";
                var toTableId = r.GetValueOrDefault("to_table_id") ?? "";
                var fromColumnId = r.GetValueOrDefault("from_column_id") ?? "";
                var toColumnId = r.GetValueOrDefault("to_column_id") ?? "";
                var crossFilter = r.GetValueOrDefault("cross_filtering_behavior");

                return new Dictionary<string, string?>
                {
                    ["from_table"] = tableMap.GetValueOrDefault(fromTableId, "Unknown"),
                    ["from_column"] = columnMap.GetValueOrDefault(fromColumnId, "Unknown"),
                    ["to_table"] = tableMap.GetValueOrDefault(toTableId, "Unknown"),
                    ["to_column"] = columnMap.GetValueOrDefault(toColumnId, "Unknown"),
                    ["cross_filtering"] = crossFilter == "2" ? "Both" : "Single",
                    ["is_active"] = r.GetValueOrDefault("is_active"),
                    ["from_cardinality"] = r.GetValueOrDefault("from_cardinality") == "2" ? "Many" : "One",
                    ["to_cardinality"] = r.GetValueOrDefault("to_cardinality") == "2" ? "Many" : "One"
                };
            }).ToList();

            // Clean tables
            var tables = tablesRaw.Select(t => new Dictionary<string, string?>
            {
                ["table_name"] = t.GetValueOrDefault("table_name"),
                ["description"] = t.GetValueOrDefault("description"),
                ["is_hidden"] = t.GetValueOrDefault("is_hidden")
            }).ToList();

            return new Dictionary<string, object>
            {
                ["status"] = "success",
                ["summary"] = new Dictionary<string, int>
                {
                    ["table_count"] = tables.Count,
                    ["column_count"] = columns.Count,
                    ["measure_count"] = measures.Count,
                    ["relationship_count"] = relationships.Count
                },
                ["tables"] = tables,
                ["columns"] = columns,
                ["measures"] = measures,
                ["relationships"] = relationships
            };
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object>
            {
                ["status"] = "error",
                ["error"] = $"Failed to get model metadata: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Get metadata limited to tables/columns/measures relevant to the given query.
    /// Uses INFO.CALCDEPENDENCY to find which tables the query touches,
    /// then expands through active relationships (BFS) before filtering.
    /// Port of Python get_limited_metadata + expand_tables_through_relationships.
    /// </summary>
    public async Task<Dictionary<string, object>> GetLimitedMetadataAsync(
        string targetQuery, string xmlaEndpoint, string datasetName)
    {
        try
        {
            var token = await GetTokenIfNeeded(xmlaEndpoint);

            // Get query dependencies
            var escapedQuery = targetQuery.Replace("\"", "\"\"");
            var depQuery = $@"
                EVALUATE
                VAR source_query = ""{escapedQuery}""
                VAR all_dependencies = SELECTCOLUMNS(
                    INFO.CALCDEPENDENCY(""QUERY"", source_query),
                    ""@referenced_table"", [REFERENCED_TABLE],
                    ""@referenced_object"", [REFERENCED_OBJECT],
                    ""@referenced_object_type"", [REFERENCED_OBJECT_TYPE])
                RETURN all_dependencies";

            var depRaw = await RunMetadataQueryAsync(xmlaEndpoint, datasetName, token, depQuery);
            var tablesUsed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (depRaw != null)
            {
                foreach (var dep in depRaw)
                {
                    var table = dep.GetValueOrDefault("referenced_table");
                    if (!string.IsNullOrEmpty(table))
                        tablesUsed.Add(table);
                }
            }

            // Get full metadata then filter to relevant tables
            var full = await GetCompleteModelDefinitionAsync(xmlaEndpoint, datasetName);
            if (full.TryGetValue("status", out var s) && s?.ToString() == "error")
                return full;

            if (tablesUsed.Count == 0) return full; // can't filter, return all

            // Expand tables through active relationships (BFS)
            if (full.TryGetValue("relationships", out var relsObj) && relsObj is List<Dictionary<string, string?>> rels)
            {
                tablesUsed = ExpandTablesThroughRelationships(tablesUsed, rels);
            }

            // Filter tables, columns, measures, relationships to only those touching used tables
            var filteredTables = FilterByTableName(full["tables"], tablesUsed);
            var filteredColumns = FilterByTableName(full["columns"], tablesUsed);
            var filteredMeasures = FilterByTableName(full["measures"], tablesUsed);
            var filteredRelationships = FilterRelationships(full["relationships"], tablesUsed);

            return new Dictionary<string, object>
            {
                ["status"] = "success",
                ["summary"] = new Dictionary<string, int>
                {
                    ["table_count"] = filteredTables.Count,
                    ["column_count"] = filteredColumns.Count,
                    ["measure_count"] = filteredMeasures.Count,
                    ["relationship_count"] = filteredRelationships.Count
                },
                ["tables"] = filteredTables,
                ["columns"] = filteredColumns,
                ["measures"] = filteredMeasures,
                ["relationships"] = filteredRelationships
            };
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object>
            {
                ["status"] = "error",
                ["error"] = $"Failed to get limited metadata: {ex.Message}"
            };
        }
    }

    // ---- helpers ----

    private async Task<string?> GetTokenIfNeeded(string xmlaEndpoint)
    {
        return XmlaClient.IsDesktopConnection(xmlaEndpoint) ? null : await _auth.GetAccessTokenAsync();
    }

    private async Task<List<Dictionary<string, string?>>?> RunMetadataQueryAsync(
        string xmlaEndpoint, string datasetName, string? token, string query)
    {
        var raw = await XmlaClient.ExecuteQueryWithRetryAsync(xmlaEndpoint, datasetName, query, token, _auth);
        if (raw.StartsWith("Error:")) return null;

        try
        {
            var doc = JsonDocument.Parse(raw);
            var rows = doc.RootElement.GetProperty("rows");
            return rows.EnumerateArray().Select(row =>
            {
                var d = new Dictionary<string, string?>();
                foreach (var prop in row.EnumerateObject())
                {
                    var key = prop.Name.Replace("[@", "").Replace("]", "").TrimStart('@');
                    d[key] = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.ToString();
                }
                return d;
            }).ToList();
        }
        catch { return null; }
    }

    private static List<Dictionary<string, string?>> FilterByTableName(object items, HashSet<string> tables)
    {
        if (items is not List<Dictionary<string, string?>> list) return [];
        return list.Where(d => d.TryGetValue("table_name", out var tn) && tn != null && tables.Contains(tn)).ToList();
    }

    private static List<Dictionary<string, string?>> FilterRelationships(object items, HashSet<string> tables)
    {
        if (items is not List<Dictionary<string, string?>> list) return [];
        return list.Where(d =>
        {
            var ft = d.GetValueOrDefault("from_table");
            var tt = d.GetValueOrDefault("to_table");
            return ft != null && tt != null && tables.Contains(ft) && tables.Contains(tt);
        }).ToList();
    }

    /// <summary>
    /// BFS expansion through active relationships.
    /// For single-direction (cross_filtering "1" / "Single"): follows from→to.
    /// For bidirectional (cross_filtering "2" / "Both"): follows both directions.
    /// Port of Python expand_tables_through_relationships.
    /// </summary>
    private static HashSet<string> ExpandTablesThroughRelationships(
        HashSet<string> initialTables, List<Dictionary<string, string?>> relationships)
    {
        var expanded = new HashSet<string>(initialTables, StringComparer.OrdinalIgnoreCase);
        bool changed = true;

        while (changed)
        {
            changed = false;
            var current = new HashSet<string>(expanded, StringComparer.OrdinalIgnoreCase);

            foreach (var rel in relationships)
            {
                var isActive = rel.GetValueOrDefault("is_active");
                if (isActive != "True" && isActive != "true") continue;

                var fromTable = rel.GetValueOrDefault("from_table") ?? "";
                var toTable = rel.GetValueOrDefault("to_table") ?? "";
                var crossFilter = rel.GetValueOrDefault("cross_filtering") ?? "";

                if (string.IsNullOrEmpty(fromTable) || string.IsNullOrEmpty(toTable)) continue;

                if (crossFilter == "Single")
                {
                    // Single direction: from → to
                    if (current.Contains(fromTable) && !expanded.Contains(toTable))
                    {
                        expanded.Add(toTable);
                        changed = true;
                    }
                }
                else if (crossFilter == "Both")
                {
                    // Bidirectional
                    if (current.Contains(fromTable) && !expanded.Contains(toTable))
                    {
                        expanded.Add(toTable);
                        changed = true;
                    }
                    else if (current.Contains(toTable) && !expanded.Contains(fromTable))
                    {
                        expanded.Add(fromTable);
                        changed = true;
                    }
                }
            }
        }

        return expanded;
    }
}
