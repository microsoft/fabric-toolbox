using System.Text.Json;
using System.Text.RegularExpressions;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Infrastructure;
using DaxPerformanceTuner.Library.Models;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// DAX query execution, measure inlining, and prepare-query orchestration.
/// </summary>
public class ExecutionService
{
    private readonly IAuthService _auth;
    private readonly SessionManager _sessionManager;
    private readonly MetadataService _metadata;
    private readonly ResearchService _research;
    private readonly DaxPerformanceTunerConfig _config;

    public ExecutionService(
        IAuthService auth, SessionManager sessionManager,
        MetadataService metadata, ResearchService research,
        DaxPerformanceTunerConfig config)
    {
        _auth = auth;
        _sessionManager = sessionManager;
        _metadata = metadata;
        _research = research;
        _config = config;
    }

    // =====================================================================
    // execute_dax_query
    // =====================================================================

    public async Task<string> ExecuteQueryAsync(string daxQuery, string executionMode = "optimization")
    {
        try
        {
            var (endpoint, dataset, token, err) = await GetConnectionDetails();
            if (err != null) return Error(err);

            // Execute multiple runs (warm-up + N timed runs)
            var (runs, ok, runErr) = await ExecuteMultipleRunsAsync(endpoint!, dataset!, token, daxQuery);
            if (!ok) return Error(runErr ?? "DAX query execution failed");

            var fastest = AnalysisHelper.SelectFastestRun(runs);
            if (fastest.ValueKind == JsonValueKind.Undefined)
                return Error("No valid run results");

            var performance = fastest.TryGetProperty("Performance", out var perf) ? perf : default;
            var results = fastest.TryGetProperty("Results", out var res) ? res : default;
            var eventDetails = fastest.TryGetProperty("EventDetails", out var ed) ? ed : default;

            // Performance analysis vs baseline
            Dictionary<string, object>? perfAnalysis = null;
            Dictionary<string, object>? semanticEquiv = null;

            var session = _sessionManager.GetCurrentSession();
            if (executionMode == "optimization" && session?.QueryData?.BaselineEstablished == true)
            {
                var baselinePerf = session.QueryData.BaselinePerformance;
                if (baselinePerf != null && performance.ValueKind != JsonValueKind.Undefined)
                {
                    var currentTotal = performance.TryGetProperty("Total", out var t) ? t.GetDouble() : 0;
                    var improvement = AnalysisHelper.CalculateImprovement(baselinePerf.TotalMs, currentTotal);

                    perfAnalysis = new Dictionary<string, object>
                    {
                        ["baseline_total_ms"] = baselinePerf.TotalMs,
                        ["current_total_ms"] = currentTotal,
                        ["improvement_percent"] = improvement,
                        ["meets_threshold"] = improvement >= _config.PerformanceThresholds.ImprovementThresholdPercent
                    };

                    // Include cumulative improvement vs original baseline when re-baselined
                    var originalPerf = session.QueryData.OriginalBaselinePerformance;
                    if (originalPerf != null && originalPerf != baselinePerf)
                    {
                        var cumulativeImprovement = AnalysisHelper.CalculateImprovement(originalPerf.TotalMs, currentTotal);
                        perfAnalysis["original_baseline_total_ms"] = originalPerf.TotalMs;
                        perfAnalysis["cumulative_improvement_percent"] = cumulativeImprovement;
                    }

                    // Semantic equivalence
                    if (session.QueryData.BaselineRawResult != null && results.ValueKind != JsonValueKind.Undefined)
                    {
                        var baselineResults = session.QueryData.BaselineRawResult.RootElement
                            .TryGetProperty("Results", out var br) ? br : default;
                        if (baselineResults.ValueKind != JsonValueKind.Undefined)
                            semanticEquiv = AnalysisHelper.ComputeSemanticEquivalence(baselineResults, results);
                    }

                    // Track best optimization
                    _sessionManager.UpdateQueryData(qd =>
                    {
                        if (improvement > qd.BestImprovementPercent)
                        {
                            qd.BestImprovementPercent = improvement;
                            qd.BestMeetsThreshold = improvement >= _config.PerformanceThresholds.ImprovementThresholdPercent;
                            qd.BestIsEquivalent = semanticEquiv != null &&
                                semanticEquiv.TryGetValue("is_equivalent", out var eq) && eq is true;
                        }
                    });
                }
            }

            // If baseline mode, store baseline data
            if (executionMode == "baseline")
            {
                _sessionManager.UpdateQueryData(qd =>
                {
                    qd.BaselineEstablished = true;
                    qd.BaselineRawResult = JsonDocument.Parse(fastest.GetRawText());
                    if (performance.ValueKind != JsonValueKind.Undefined)
                    {
                        qd.BaselinePerformance = PerformanceSnapshot.FromJson(performance);
                        // Seed original baseline on the very first run (not already set by EstablishNewBaseline carry-forward)
                        qd.OriginalBaselinePerformance ??= qd.BaselinePerformance;
                    }
                });
            }

            // Track query execution in session history
            var performanceDataDict = performance.ValueKind != JsonValueKind.Undefined
                ? new Dictionary<string, object?>
                {
                    ["total_ms"] = performance.TryGetProperty("Total", out var tot) ? tot.GetDouble() : 0,
                    ["fe_ms"] = performance.TryGetProperty("FE", out var fe) ? fe.GetDouble() : 0,
                    ["se_ms"] = performance.TryGetProperty("SE", out var se) ? se.GetDouble() : 0,
                    ["se_cpu_ms"] = performance.TryGetProperty("SE_CPU", out var sec) ? sec.GetDouble() : 0,
                    ["se_parallelism"] = performance.TryGetProperty("SE_Par", out var sep) ? sep.GetDouble() : 0,
                    ["se_queries"] = performance.TryGetProperty("SE_Queries", out var seq) ? seq.GetDouble() : 0,
                    ["se_cache"] = performance.TryGetProperty("SE_Cache", out var seca) ? seca.GetDouble() : 0,
                    ["query_end"] = performance.TryGetProperty("QueryEnd", out var qe) ? qe.GetString() ?? "" : ""
                }
                : null;

            object? resultDataForTracking = results.ValueKind != JsonValueKind.Undefined
                ? JsonSerializer.Deserialize<object>(results.GetRawText())
                : null;

            _sessionManager.TrackQueryExecution(
                daxQuery, executionMode,
                performanceDataDict,
                resultDataForTracking,
                error: null,
                performanceAnalysis: perfAnalysis,
                semanticEquivalence: semanticEquiv);

            // Build response
            var response = new Dictionary<string, object> { ["status"] = "success" };
            if (perfAnalysis != null) response["performance_analysis"] = perfAnalysis;
            if (semanticEquiv != null) response["semantic_equivalence"] = semanticEquiv;
            if (results.ValueKind != JsonValueKind.Undefined) response["Results"] = JsonSerializer.Deserialize<object>(results.GetRawText())!;
            if (performance.ValueKind != JsonValueKind.Undefined) response["Performance"] = JsonSerializer.Deserialize<object>(performance.GetRawText())!;
            if (eventDetails.ValueKind != JsonValueKind.Undefined) response["EventDetails"] = JsonSerializer.Deserialize<object>(eventDetails.GetRawText())!;

            return JsonHelper.Serialize(response);
        }
        catch (Exception ex)
        {
            return Error($"Query execution failed: {ex.Message}");
        }
    }

    // =====================================================================
    // prepare_query_for_optimization
    // =====================================================================

    public async Task<string> PrepareQueryAsync(string query)
    {
        try
        {
            var (endpoint, dataset, token, err) = await GetConnectionDetails();
            if (err != null) return Error(err);

            // Establish new baseline in session (resets query data)
            _sessionManager.EstablishNewBaseline(query);

            // Capture the very first raw user query (before inlining) — survives re-baselines
            _sessionManager.UpdateQueryData(qd =>
            {
                if (string.IsNullOrEmpty(qd.OriginalQuery))
                    qd.OriginalQuery = query;
            });

            // STEP 1: Inline measures
            var (enhancedQuery, functionsAdded, measuresAdded) = await InlineMeasuresAsync(
                query, endpoint!, dataset!, token);

            _sessionManager.UpdateQueryData(qd => qd.EnhancedQuery = enhancedQuery);

            // STEP 2: Execute baseline
            var baselineJson = await ExecuteQueryAsync(enhancedQuery, "baseline");

            // STEP 3: Get limited metadata
            Dictionary<string, object>? metadata = null;
            try
            {
                metadata = await _metadata.GetLimitedMetadataAsync(enhancedQuery, endpoint!, dataset!);
            }
            catch { metadata = new Dictionary<string, object> { ["status"] = "error", ["error"] = "Metadata retrieval failed" }; }

            // STEP 4: Get research articles
            Dictionary<string, object>? research = null;
            try
            {
                research = await _research.GetDaxResearchAsync(enhancedQuery);
            }
            catch { research = new Dictionary<string, object> { ["status"] = "error", ["error"] = "Research retrieval failed" }; }

            // Parse baseline back as object
            object? baselineObj = null;
            try { baselineObj = JsonSerializer.Deserialize<object>(baselineJson); } catch { }

            var result = new Dictionary<string, object>
            {
                ["status"] = "success",
                ["prepared_query"] = new Dictionary<string, object>
                {
                    ["enhanced_query"] = enhancedQuery,
                    ["functions_added"] = functionsAdded,
                    ["measures_added"] = measuresAdded
                },
                ["baseline_execution"] = baselineObj ?? new { status = "error", error = "Baseline parsing failed" },
                ["research_articles"] = research ?? new Dictionary<string, object>(),
                ["model_metadata"] = metadata ?? new Dictionary<string, object>()
            };

            return JsonHelper.Serialize(result);
        }
        catch (Exception ex)
        {
            return Error($"Query preparation failed: {ex.Message}");
        }
    }

    // =====================================================================
    // Multi-run execution (warm-up + N timed runs)
    // =====================================================================

    private async Task<(List<JsonElement> Runs, bool Ok, string? Error)> ExecuteMultipleRunsAsync(
        string endpoint, string dataset, string? token, string daxQuery)
    {
        // Warm-up run
        var warmup = await RunTraceAsync(endpoint, dataset, token, daxQuery);
        if (warmup == null) return ([], false, "DAX warm-up execution failed");

        var runs = new List<JsonElement>();
        for (int i = 0; i < _config.DaxExecutionRuns; i++)
        {
            var run = await RunTraceAsync(endpoint, dataset, token, daxQuery);
            if (run == null) return ([], false, $"DAX execution run {i + 1} failed");
            runs.Add(run.Value);
        }

        return (runs, true, null);
    }

    private async Task<JsonElement?> RunTraceAsync(string endpoint, string dataset, string? token, string daxQuery)
    {
        try
        {
            var json = await DaxTraceRunner.RunTraceWithXmlaAsync(
                token ?? "desktop-no-auth-needed", endpoint, dataset, daxQuery);

            var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Check for error
            if (root.TryGetProperty("Performance", out var perf) &&
                perf.TryGetProperty("Error", out var errFlag) &&
                errFlag.GetBoolean())
            {
                return null;
            }

            return root;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ExecutionService] RunTraceAsync failed: {ex.Message}");
            return null;
        }
    }

    // =====================================================================
    // Connection details from session
    // =====================================================================

    private async Task<(string? Endpoint, string? Dataset, string? Token, string? Error)> GetConnectionDetails()
    {
        var (valid, session, err) = _sessionManager.ValidateSession();
        if (!valid) return (null, null, null, err);

        var endpoint = session!.ConnectionInfo!.XmlaEndpoint;
        var dataset = session.ConnectionInfo.DatasetName;
        var isDesktop = XmlaClient.IsDesktopConnection(endpoint);

        string? token = null;
        if (!isDesktop)
        {
            token = await _auth.GetAccessTokenAsync();
            if (token == null)
                return (null, null, null, "No access token for Power BI Service connection. Please reconnect.");
        }

        return (endpoint, dataset, token, null);
    }

    // =====================================================================
    // Measure inlining (BFS dependency resolution)
    // =====================================================================

    private async Task<(string EnhancedQuery, int FunctionsAdded, int MeasuresAdded)> InlineMeasuresAsync(
        string originalQuery, string endpoint, string dataset, string? token)
    {
        // Parse DEFINE block
        var (defineBlock, mainQuery) = ParseDefineBlock(originalQuery);

        // Scan the FULL original query for existing definitions, not just the parsed
        // define block. ParseDefineBlock uses lazy matching to find the first EVALUATE,
        // which can truncate the define block if a function body contains EVALUATE.
        // Scanning the full query is safe because FUNCTION/MEASURE keywords only appear
        // in DEFINE blocks, never in EVALUATE clauses.
        var existingMeasures = FindExistingMeasures(originalQuery);
        var existingFunctions = FindExistingFunctions(originalQuery);

        // Get model measures
        List<Dictionary<string, string?>> measuresData;
        try
        {
            var modelDef = await _metadata.GetCompleteModelDefinitionAsync(endpoint, dataset);
            if (modelDef.TryGetValue("measures", out var m) && m is List<Dictionary<string, string?>> measures)
                measuresData = measures;
            else
                measuresData = [];
        }
        catch { measuresData = []; }

        // Get model functions
        List<Dictionary<string, string?>> functionsData;
        try
        {
            var funcRows = await _metadata.ExecuteDmvQueryAsync(endpoint, dataset,
                "SELECT * FROM $SYSTEM.TMSCHEMA_FUNCTIONS");
            functionsData = funcRows.Select(r => r as Dictionary<string, string?>).ToList()!;
        }
        catch { functionsData = []; }

        // Build catalogs
        var (measuresInfo, measureLookup) = BuildMeasureCatalog(measuresData);
        var (functionsInfo, functionLookup) = BuildFunctionCatalog(functionsData);

        // BFS dependency collection
        var fullQueryText = (defineBlock ?? "") + mainQuery;
        var (funcsToDef, measuresToDef) = CollectDependencies(
            fullQueryText, existingMeasures, existingFunctions,
            measuresInfo, measureLookup, functionsInfo, functionLookup);

        // Build enhanced query
        var enhanced = BuildEnhancedQuery(originalQuery, funcsToDef, measuresToDef);

        return (enhanced, funcsToDef.Count, measuresToDef.Count);
    }

    // ---- Helper: normalize name ----
    private static string NormalizeName(string name)
        => Regex.Replace(name, @"[^0-9A-Za-z]", "").ToLowerInvariant();

    // ---- Helper: extract [bracketed] tokens ----
    private static HashSet<string> ExtractBracketTokens(string text)
    {
        var result = new HashSet<string>();
        foreach (Match m in Regex.Matches(text, @"\[([^\]]+)\]"))
            result.Add(m.Groups[1].Value);
        return result;
    }

    // ---- Helper: extract function calls (Name.Space( patterns) ----
    private static HashSet<string> ExtractFunctionCalls(string text)
    {
        var result = new HashSet<string>();
        foreach (Match m in Regex.Matches(text, @"([\w\.]+)\s*\("))
        {
            var name = m.Groups[1].Value;
            if (name.Contains('.') || !name.All(char.IsUpper))
                result.Add(name);
        }
        return result;
    }

    // ---- Helper: parse DEFINE block ----
    private static (string DefineBlock, string MainQuery) ParseDefineBlock(string query)
    {
        var match = Regex.Match(query, @"(.*?\bDEFINE\b.*?)(\bEVALUATE\b.*)",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return match.Success ? (match.Groups[1].Value, match.Groups[2].Value) : ("", query);
    }

    // ---- Helper: find existing measures in DEFINE ----
    private static HashSet<string> FindExistingMeasures(string defineBlock)
    {
        var result = new HashSet<string>();
        foreach (Match m in Regex.Matches(defineBlock, @"MEASURE\s+(?:'[^']+'|\w+)\s*\[\s*([^\]]+)\]",
            RegexOptions.IgnoreCase))
            result.Add(NormalizeName(m.Groups[1].Value));
        return result;
    }

    // ---- Helper: find existing functions in DEFINE ----
    private static HashSet<string> FindExistingFunctions(string defineBlock)
    {
        var result = new HashSet<string>();
        foreach (Match m in Regex.Matches(defineBlock, @"FUNCTION\s+([\w\.]+)\s*=",
            RegexOptions.IgnoreCase))
            result.Add(NormalizeName(m.Groups[1].Value));
        return result;
    }

    // ---- Build measure catalog ----
    private static (Dictionary<string, (string Table, string Expr)> Info, Dictionary<string, string> Lookup)
        BuildMeasureCatalog(List<Dictionary<string, string?>> measuresData)
    {
        var info = new Dictionary<string, (string, string)>();
        var lookup = new Dictionary<string, string>();

        foreach (var m in measuresData)
        {
            var name = m.GetValueOrDefault("measure_name");
            var table = m.GetValueOrDefault("table_name") ?? "Unknown";
            var expr = m.GetValueOrDefault("expression");
            if (name == null || expr == null) continue;

            info[name] = (table, expr);
            lookup[NormalizeName(name)] = name;
        }

        return (info, lookup);
    }

    // ---- Build function catalog ----
    private static (Dictionary<string, string> Info, Dictionary<string, string> Lookup)
        BuildFunctionCatalog(List<Dictionary<string, string?>> functionsData)
    {
        var info = new Dictionary<string, string>();
        var lookup = new Dictionary<string, string>();

        foreach (var f in functionsData)
        {
            var name = f.GetValueOrDefault("Name");
            var expr = f.GetValueOrDefault("Expression");
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(expr)) continue;

            info[name] = expr;
            lookup[NormalizeName(name)] = name;
        }

        return (info, lookup);
    }

    // ---- BFS dependency collection ----
    private static (List<(string Name, string Expr)> Functions, List<(string Name, string Table, string Expr)> Measures)
        CollectDependencies(
            string queryText,
            HashSet<string> existingMeasures,
            HashSet<string> existingFunctions,
            Dictionary<string, (string Table, string Expr)> measuresInfo,
            Dictionary<string, string> measureLookup,
            Dictionary<string, string> functionsInfo,
            Dictionary<string, string> functionLookup)
    {
        var functionsToDefine = new List<(string Name, string Expr)>();
        var measuresToDefine = new List<(string Name, string Table, string Expr)>();

        var seenFunctions = new HashSet<string>(existingFunctions);
        var seenMeasures = new HashSet<string>(existingMeasures);
        var queue = new Queue<(string Type, string NormName)>();

        // Seed from query text
        foreach (var funcCall in ExtractFunctionCalls(queryText))
        {
            var norm = NormalizeName(funcCall);
            if (!seenFunctions.Contains(norm) && functionLookup.ContainsKey(norm))
                queue.Enqueue(("function", norm));
        }

        foreach (var bracketToken in ExtractBracketTokens(queryText))
        {
            var norm = NormalizeName(bracketToken);
            if (!seenMeasures.Contains(norm) && measureLookup.ContainsKey(norm))
                queue.Enqueue(("measure", norm));
        }

        while (queue.Count > 0)
        {
            var (type, normName) = queue.Dequeue();

            if (type == "function")
            {
                if (seenFunctions.Contains(normName)) continue;
                if (!functionLookup.TryGetValue(normName, out var actualName)) continue;
                seenFunctions.Add(normName);

                var expr = functionsInfo[actualName];
                functionsToDefine.Add((actualName, expr));

                // Find nested deps
                foreach (var fc in ExtractFunctionCalls(expr))
                {
                    var n = NormalizeName(fc);
                    if (!seenFunctions.Contains(n) && functionLookup.ContainsKey(n))
                        queue.Enqueue(("function", n));
                }
                foreach (var bt in ExtractBracketTokens(expr))
                {
                    var n = NormalizeName(bt);
                    if (!seenMeasures.Contains(n) && measureLookup.ContainsKey(n))
                        queue.Enqueue(("measure", n));
                }
            }
            else // measure
            {
                if (seenMeasures.Contains(normName)) continue;
                if (!measureLookup.TryGetValue(normName, out var actualName)) continue;
                seenMeasures.Add(normName);

                var (table, expr) = measuresInfo[actualName];
                measuresToDefine.Add((actualName, table, expr));

                foreach (var fc in ExtractFunctionCalls(expr))
                {
                    var n = NormalizeName(fc);
                    if (!seenFunctions.Contains(n) && functionLookup.ContainsKey(n))
                        queue.Enqueue(("function", n));
                }
                foreach (var bt in ExtractBracketTokens(expr))
                {
                    var n = NormalizeName(bt);
                    if (!seenMeasures.Contains(n) && measureLookup.ContainsKey(n))
                        queue.Enqueue(("measure", n));
                }
            }
        }

        return (functionsToDefine, measuresToDefine);
    }

    // ---- Build enhanced query with inlined definitions ----
    private static string BuildEnhancedQuery(
        string originalQuery,
        List<(string Name, string Expr)> functions,
        List<(string Name, string Table, string Expr)> measures)
    {
        if (functions.Count == 0 && measures.Count == 0)
            return originalQuery;

        var lines = new List<string>();
        foreach (var (name, expr) in functions)
            lines.Add($"\tFUNCTION {name} = {expr}");
        foreach (var (name, table, expr) in measures)
            lines.Add($"\tMEASURE '{table}'[{name}] = {expr}");

        var allDefs = string.Join("\n", lines);

        // Check if DEFINE block already exists
        var defineMatch = Regex.Match(originalQuery, @"^(\s*(?://.*\n)*\s*)DEFINE(\s)",
            RegexOptions.IgnoreCase | RegexOptions.Multiline);

        if (defineMatch.Success)
        {
            var prefix = defineMatch.Groups[1].Value;
            var suffix = defineMatch.Groups[2].Value;
            var replacement = prefix + "DEFINE\n" + allDefs + suffix;
            return Regex.Replace(originalQuery, @"^(\s*(?://.*\n)*\s*)DEFINE(\s)",
                replacement, RegexOptions.IgnoreCase | RegexOptions.Multiline);
        }

        // No DEFINE — find EVALUATE and prepend
        var evalIdx = originalQuery.IndexOf("EVALUATE", StringComparison.OrdinalIgnoreCase);
        if (evalIdx == -1) return originalQuery;

        var fromEvaluate = originalQuery[evalIdx..];
        return "DEFINE\n" + allDefs + "\n\n" + fromEvaluate;
    }

    // ---- helper ----
    private static string Error(string msg) => JsonHelper.ErrorJson(msg);
}
