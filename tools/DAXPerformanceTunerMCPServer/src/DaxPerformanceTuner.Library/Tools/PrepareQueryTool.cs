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
        "Prepare a DAX query for optimization: inlines measures, runs baseline, fetches metadata and research articles. " +
        "WHEN: Always call FIRST before any optimization. Re-run only if query structure (grouping columns) changes, not for measure-level optimization iterations. " +
        "INPUT: Raw DAX query with measure references (e.g. EVALUATE SUMMARIZECOLUMNS('Product'[Category], \"Total Sales\", [Total Sales])). Do NOT pass already-optimized queries. " +
        "OUTPUT: (1) prepared_query — original + enhanced query with inlined measures. " +
        "(2) baseline_execution — Result (row/column counts, data sample), Performance (Total ms, FE/SE split, SE_Queries, SE_Par), EventDetails (execution waterfall with xmSQL, Rows, KB, callbacks). " +
        "(3) research_articles — general optimization framework + pattern-matched articles with matched_patterns. Cross-validate matches against EventDetails before applying; false positives will occur. " +
        "(4) model_metadata — relationships, columns referenced by the query. Measures are already inlined in enhanced_query.")]
    public async Task<string> Execute(PrepareQueryRequest request)
    {
        return await _executionService.PrepareQueryAsync(request.Query);
    }
}
