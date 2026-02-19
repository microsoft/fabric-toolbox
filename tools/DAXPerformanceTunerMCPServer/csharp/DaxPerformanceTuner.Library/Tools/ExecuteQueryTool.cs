using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using DaxPerformanceTuner.Library.Core;
using ModelContextProtocol.Server;

namespace DaxPerformanceTuner.Library.Tools;

public class ExecuteQueryRequest
{
    [Description("The DAX query to execute. Optimize MEASURE AND USER-DEFINED FUNCTION DEFINITIONS, not query structure. " +
                 "Keep same SUMMARIZECOLUMNS grouping as baseline. Must return identical results for valid optimization.")]
    [Required]
    public required string DaxQuery { get; set; }
}

[McpServerToolType]
public class ExecuteQueryTool
{
    private readonly ExecutionService _executionService;

    public ExecuteQueryTool(ExecutionService executionService)
    {
        _executionService = executionService;
    }

    [McpServerTool(Name = "execute_dax_query"), Description(
        "Execute optimized DAX queries with performance measurement and comparison to baseline. " +
        "CRITICAL WORKFLOW REQUIREMENT: " +
        "BEFORE EVERY QUERY EXECUTION, YOU MUST: " +
        "1. REVIEW THE prepare_query_for_optimization OUTPUT - To formulate an optimization plan based on deep analysis of the baseline results and research articles. " +
        "AFTER EVERY QUERY EXECUTION, YOU MUST: " +
        "1. ANALYZE THE COMPLETE RESPONSE - Don't just look at status/performance summary. " +
        "2. EXAMINE THE Performance OBJECT - Look at FE/SE split, SE_Queries count, SE_Par values. " +
        "3. EXAMINE EVERY EVENT IN EventDetails - Look for CallbackDataID, large Rows/KB values, FE/SE patterns. " +
        "4. IDENTIFY SPECIFIC BOTTLENECKS - What's causing poor performance? Callbacks? Large materializations? Too many SE queries? " +
        "5. PROPOSE CONCRETE OPTIMIZATIONS - Based on the analysis framework, what specific DAX patterns should be changed? " +
        "DO NOT PROCEED TO NEXT OPTIMIZATION WITHOUT COMPLETING THIS ANALYSIS. " +
        "OPTIMIZATION TARGET CLARITY: " +
        "OPTIMIZE THE MEASURE AND USER-DEFINED FUNCTION DEFINITIONS, NOT THE QUERY STRUCTURE. " +
        "Keep the same SUMMARIZECOLUMNS grouping structure from baseline. " +
        "Focus on replacing inefficient patterns in measures and functions with optimized DAX. " +
        "Must return IDENTICAL results to baseline for valid optimization. " +
        "HANDLING DAX SYNTAX ERRORS: " +
        "If you encounter a syntax error, don't immediately abandon the optimization approach. " +
        "Attempt to understand the root cause and adjust syntax before abandoning the optimization approach. " +
        "Only abandon the optimization approach after it is clear that all reasonable syntax variations have been exhausted. " +
        "INPUT: dax_query (string)")]
    public async Task<string> Execute(ExecuteQueryRequest request)
    {
        return await _executionService.ExecuteQueryAsync(request.DaxQuery);
    }
}
