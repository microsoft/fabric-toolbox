using System.Text.Json;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Pure-function helpers for performance comparison, semantic-equivalence checks,
/// and fastest-run selection.
/// </summary>
public static class AnalysisHelper
{
    /// <summary>
    /// Calculate percentage improvement (positive = faster).
    /// </summary>
    public static double CalculateImprovement(double baselineTotalMs, double optimizedTotalMs)
    {
        if (baselineTotalMs <= 0) return 0.0;
        return Math.Round(((baselineTotalMs - optimizedTotalMs) / baselineTotalMs) * 100, 2);
    }

    /// <summary>
    /// Compare results between baseline and current run for semantic equivalence.
    /// </summary>
    public static Dictionary<string, object> ComputeSemanticEquivalence(
        JsonElement baselineResults, JsonElement currentResults)
    {
        try
        {
            if (baselineResults.ValueKind != JsonValueKind.Array ||
                currentResults.ValueKind != JsonValueKind.Array)
            {
                return new Dictionary<string, object>
                {
                    ["evaluated"] = false,
                    ["is_equivalent"] = false,
                    ["reasons"] = new[] { "Results not available" }
                };
            }

            var baselineArr = baselineResults.EnumerateArray().ToList();
            var currentArr = currentResults.EnumerateArray().ToList();

            if (baselineArr.Count != currentArr.Count)
            {
                return new Dictionary<string, object>
                {
                    ["evaluated"] = true,
                    ["is_equivalent"] = false,
                    ["reasons"] = new[] {
                        $"Number of results differs (baseline={baselineArr.Count}, current={currentArr.Count})"
                    }
                };
            }

            var reasons = new List<string>();

            foreach (var current in currentArr)
            {
                var resultNum = current.TryGetProperty("ResultNumber", out var rn) ? rn.GetInt32() : 0;
                var baseline = baselineArr.FirstOrDefault(b =>
                    b.TryGetProperty("ResultNumber", out var brn) && brn.GetInt32() == resultNum);

                if (baseline.ValueKind == JsonValueKind.Undefined)
                {
                    reasons.Add($"Result #{resultNum}: No matching baseline found");
                    continue;
                }

                var curRows = current.TryGetProperty("RowCount", out var cr) ? cr.GetInt32() : 0;
                var basRows = baseline.TryGetProperty("RowCount", out var br) ? br.GetInt32() : 0;
                var curCols = current.TryGetProperty("ColumnCount", out var cc) ? cc.GetInt32() : 0;
                var basCols = baseline.TryGetProperty("ColumnCount", out var bc) ? bc.GetInt32() : 0;

                if (curRows != basRows)
                    reasons.Add($"Result #{resultNum}: Row count differs (baseline={basRows}, current={curRows})");
                if (curCols != basCols)
                    reasons.Add($"Result #{resultNum}: Column count differs (baseline={basCols}, current={curCols})");

                // Compare data if counts match
                if (curRows == basRows && curCols == basCols)
                {
                    var curData = current.TryGetProperty("Rows", out var crd) ? RowSignatures(crd) : [];
                    var basData = baseline.TryGetProperty("Rows", out var brd) ? RowSignatures(brd) : [];

                    if (!curData.SequenceEqual(basData))
                        reasons.Add($"Result #{resultNum}: Data values differ");
                }
            }

            return new Dictionary<string, object>
            {
                ["evaluated"] = true,
                ["is_equivalent"] = reasons.Count == 0,
                ["reasons"] = reasons
            };
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object>
            {
                ["evaluated"] = false,
                ["is_equivalent"] = false,
                ["reasons"] = new[] { $"Error: {ex.Message}" }
            };
        }
    }

    /// <summary>
    /// Given a list of runs (each a JSON string from DaxTraceRunner), pick the one with shortest Total time.
    /// </summary>
    public static JsonElement SelectFastestRun(List<JsonElement> runs)
    {
        JsonElement best = default;
        double bestTime = double.MaxValue;

        foreach (var run in runs)
        {
            if (run.TryGetProperty("Performance", out var perf) &&
                perf.TryGetProperty("Total", out var total))
            {
                var t = total.GetDouble();
                if (t < bestTime)
                {
                    bestTime = t;
                    best = run;
                }
            }
        }

        if (best.ValueKind == JsonValueKind.Undefined && runs.Count > 0)
            best = runs[0];

        return best;
    }

    /// <summary>
    /// Produce a sorted list of canonical row representations for comparison.
    /// Sorts JSON object keys within each row to match Python's json.dumps(sort_keys=True),
    /// then sorts the row list for order-independent comparison.
    /// </summary>
    private static List<string> RowSignatures(JsonElement rows)
    {
        var sigs = new List<string>();
        foreach (var row in rows.EnumerateArray())
        {
            sigs.Add(CanonicalizeRow(row));
        }
        sigs.Sort(StringComparer.Ordinal);
        return sigs;
    }

    /// <summary>
    /// Serialize a JSON object with its keys sorted alphabetically so that
    /// {"b":1,"a":2} and {"a":2,"b":1} produce the same string.
    /// Non-object values are returned as raw text.
    /// </summary>
    private static string CanonicalizeRow(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
            return element.GetRawText();

        var sorted = element.EnumerateObject()
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .Select(p => $"{JsonSerializer.Serialize(p.Name)}:{p.Value.GetRawText()}");

        return "{" + string.Join(",", sorted) + "}";
    }
}
