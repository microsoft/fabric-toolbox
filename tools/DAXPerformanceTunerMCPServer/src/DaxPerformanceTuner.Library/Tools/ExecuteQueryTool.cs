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
        "Execute an optimized DAX query and compare performance to baseline. " +
        "WHEN: After prepare_query_for_optimization, to test optimization attempts. " +
        "INPUT: Full DAX query with optimized measure definitions. Keep same SUMMARIZECOLUMNS grouping as baseline — optimize measure/function logic only. " +
        "OUTPUT: Result (for semantic equivalence check), Performance (compared to baseline), EventDetails (execution waterfall). " +
        "Analyze Performance and EventDetails after each attempt before trying the next optimization. " +
        "On syntax errors, adjust syntax before abandoning the approach.")]
    public async Task<string> Execute(ExecuteQueryRequest request)
    {
        return await _executionService.ExecuteQueryAsync(request.DaxQuery);
    }
}
