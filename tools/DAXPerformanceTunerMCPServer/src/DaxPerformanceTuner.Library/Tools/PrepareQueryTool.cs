using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using DaxPerformanceTuner.Library.Core;
using ModelContextProtocol.Server;

namespace DaxPerformanceTuner.Library.Tools;

public class PrepareQueryRequest
{
    [Description("Raw DAX query with measure references (e.g. EVALUATE SUMMARIZECOLUMNS('Product'[Category], \"Total Sales\", [Total Sales])). " +
                 "Do NOT pass already inlined or modified optimization attempts here — use only the original user intent query.")]
    [Required]
    public required string Query { get; set; }
}

[McpServerToolType]
public class PrepareQueryTool
{
    private readonly ExecutionService _executionService;

    public PrepareQueryTool(ExecutionService executionService)
    {
        _executionService = executionService;
    }

    [McpServerTool(Name = "prepare_query_for_optimization"), Description(
        "Comprehensive DAX query preparation, baseline execution, and analysis setup. " +
        "WHEN TO USE: " +
        "Always call FIRST before any optimization attempts. " +
        "Re-run ONLY if the original query text (grouping columns / structural query shape) changes. " +
        "Do NOT re-run just because you changed measure internals for optimization - use execute_dax_query for those iterations. " +
        "OUTPUT OBJECTS & HOW TO READ THEM (LLM MUST STUDY CAREFULLY): " +
        "1. prepared_query: original_query (user-provided raw DAX), enhanced_query (same query with all dependent measures inlined - canonical text for analysis), measures_added (count of inlined measures appended), formatting (whether automatic reformatting succeeded). " +
        "2. baseline_execution: Result (row/column counts and data sample for semantic comparison later). " +
        "Performance (high-level metrics): Total (ms) overall baseline time; FE vs SE distribution (high FE% => formula engine heavy patterns like iterators, callbacks, context transition); " +
        "SE_Queries count (goal: minimize by enabling fusion); SE_CPU & SE_Par (parallelism; low parallelism might indicate FE bottlenecks or serialized callbacks). " +
        "EventDetails (execution waterfall - MUST analyze line-by-line): Look for large Rows/KB, repeated scans of same grain, presence of CallbackDataID, EncodeCallback, long FE gaps between SE scans. " +
        "Compare early vs late scans to detect semi-joins (IN tuples / VAND lists) created by FE shaping. Identify redundant similar xmSQL patterns for consolidation or vertical fusion. " +
        "3. research_articles: articles array containing (a) general optimization framework (ALWAYS include) and (b) targeted pattern articles. " +
        "Each article may have matched_patterns showing exact substrings from the query triggering it - treat these as hypothesis seeds, not guaranteed issues. " +
        "WARNING: POTENTIAL OPTIMIZATIONS, NOT GUARANTEES. Articles represent potential optimization opportunities based on pattern detection. They are NOT guaranteed to improve performance in your specific query context. " +
        "Pattern matching is intentionally broad to avoid missing opportunities, which means false positives will occur. " +
        "WARNING: VALIDATION REQUIRED. Articles may be flagged even when the detected pattern is not problematic. " +
        "ALWAYS cross-validate pattern matches against actual query behavior in EventDetails before applying optimizations. " +
        "A pattern match without corresponding performance symptoms in EventDetails should NOT be optimized. " +
        "LLM MUST read ALL returned articles before proposing an optimization plan. Skipping this step leads to incomplete or incorrect optimization reasoning. " +
        "RESEARCH UTILIZATION (MANDATORY - DO NOT IGNORE): " +
        "The research section is NOT supplemental; it is a first-class input to your reasoning process. " +
        "The general optimization framework article provides the canonical method to interpret Performance + EventDetails (follow it step-by-step: high-level metrics => scan/event decomposition => callback / materialization diagnosis => fusion opportunities). " +
        "Each additional article was surfaced because pattern matching detected code fragments or structural hints of potential anti-patterns in the query. " +
        "CRITICAL VALIDATION STEP: For each flagged article, analyze BOTH the matched pattern AND the baseline execution symptoms. " +
        "A pattern match alone does NOT confirm the issue exists - you must find corresponding evidence in EventDetails (callbacks, large materializations, excessive SE queries, poor parallelism, etc.) that aligns with the article's described symptoms. " +
        "You must explicitly map: (a) observed symptoms in EventDetails (Rows, KB, callbacks, repeated scans, IN tuple explosions) TO (b) relevant research article sections and (c) concrete optimization tactics. " +
        "If an article's suspected pattern is ultimately a false positive, state WHY (e.g. small cardinality, additive measure reuse already fused, benign context transition, pattern exists but doesn't manifest as bottleneck in EventDetails) so it is not retried in later iterations. " +
        "Prioritize optimizations where: (1) article guidance aligns with multiple observed symptoms AND (2) pattern match corresponds to actual performance issue in EventDetails AND (3) change can be confined to measure body without altering query grouping. " +
        "Document (internally or aloud) a short plan: Pattern Match => Symptom Validation in EventDetails => Article Reference => Proposed Rewrite Pattern => Expected Impact (e.g. fewer SE_Queries, reduced FE time, elimination of VAND list, improved fusion). " +
        "Only after forming that plan with validated symptoms should you produce an optimized measure version for execution. " +
        "4. model_metadata: summary (table/column counts), relationships (cardinality + direction for filter propagation and join reduction reasoning), columns (only those referenced by the query, for validating names and data types). Measures are NOT included here — they are already fully inlined in the enhanced_query DEFINE block. " +
        "LLM MUST THINK ALOUD (OPTIONAL BUT ENCOURAGED): It may output a reasoning section enumerating baselines metrics, suspected bottlenecks, article references, proposed changes, and risk of semantic drift. " +
        "INPUT REQUIRED: Raw DAX query with measure references (e.g. EVALUATE SUMMARIZECOLUMNS('Product'[Category], \"Total Sales\", [Total Sales])). " +
        "DO NOT PASS already inlined / modified optimization attempts here\u2014use only original user intent query.")]
    public async Task<string> Execute(PrepareQueryRequest request)
    {
        return await _executionService.PrepareQueryAsync(request.Query);
    }
}
