using System.ComponentModel;
using DaxPerformanceTuner.Library.Core;
using DaxPerformanceTuner.Library.Models;
using ModelContextProtocol.Server;

namespace DaxPerformanceTuner.Library.Tools;

[McpServerToolType]
public class SessionStatusTool
{
    private readonly SessionManager _sessionManager;

    public SessionStatusTool(SessionManager sessionManager)
    {
        _sessionManager = sessionManager;
    }

    [McpServerTool(Name = "get_session_status"), Description(
        "Review comprehensive session status and get intelligent next step recommendations. " +
        "Provides comprehensive session overview including performance progress, analysis history, and context-aware recommendations for next steps. " +
        "GUIDANCE: Use frequently to stay oriented and avoid duplication of completed work. " +
        "Essential for understanding current analysis status and progress toward optimization goals. " +
        "Purely informational for strategic planning. " +
        "INPUT: No parameters required.")]
    public string Execute()
    {
        var session = _sessionManager.GetCurrentSession();
        if (session == null)
            return JsonHelper.Serialize(new { status = "no_session", message = "No active session. Use connect_to_dataset first." });

        var conn = session.ConnectionInfo;
        var qd = session.QueryData;

        var result = new Dictionary<string, object?>
        {
            ["status"] = "success",
            ["session_id"] = session.SessionId,
            ["created_at"] = session.CreatedAt.ToString("o"),
            ["last_updated"] = session.LastUpdated.ToString("o"),
            ["connection"] = conn == null ? null : new
            {
                workspace_name = conn.WorkspaceName,
                dataset_name = conn.DatasetName,
                xmla_endpoint = conn.XmlaEndpoint,
                is_desktop = conn.IsDesktop
            },
            ["query_data"] = qd == null ? null : new Dictionary<string, object?>
            {
                ["summary"] = new Dictionary<string, object?>
                {
                    ["original_query"] = qd.OriginalQuery,
                    ["baseline_established"] = qd.BaselineEstablished,
                    ["best_optimization_query_id"] = qd.BestOptimizationQueryId,
                    ["best_improvement_percentage"] = qd.BestImprovementPercent,
                    ["meets_improvement_threshold"] = qd.BestMeetsThreshold,
                    ["best_optimization_equivalent"] = qd.BestIsEquivalent
                },
                ["baseline"] = qd.Baseline == null ? new Dictionary<string, object?>() : QueryRecordToDict(qd.Baseline),
                ["optimizations"] = qd.Optimizations.Count == 0
                    ? new Dictionary<string, object?>()
                    : qd.Optimizations.ToDictionary(
                        kvp => kvp.Key,
                        kvp => (object?)QueryRecordToDict(kvp.Value)),
                // Additional C# fields for backwards compat
                ["enhanced_query"] = qd.EnhancedQuery,
                ["baseline_performance"] = qd.BaselinePerformance == null ? null : new
                {
                    total_ms = qd.BaselinePerformance.TotalMs,
                    fe_ms = qd.BaselinePerformance.FormulaEngineMs,
                    se_ms = qd.BaselinePerformance.StorageEngineMs,
                    se_queries = qd.BaselinePerformance.StorageEngineQueries
                },
                ["original_baseline_performance"] = qd.OriginalBaselinePerformance == null
                    || qd.OriginalBaselinePerformance == qd.BaselinePerformance ? null : new
                {
                    total_ms = qd.OriginalBaselinePerformance.TotalMs,
                    fe_ms = qd.OriginalBaselinePerformance.FormulaEngineMs,
                    se_ms = qd.OriginalBaselinePerformance.StorageEngineMs,
                    se_queries = qd.OriginalBaselinePerformance.StorageEngineQueries
                }
            }
        };

        return JsonHelper.Serialize(result);
    }

    private static Dictionary<string, object?> QueryRecordToDict(QueryRecord record)
    {
        return new Dictionary<string, object?>
        {
            ["query_id"] = record.QueryId,
            ["query_text"] = record.QueryText,
            ["execution_mode"] = record.ExecutionMode,
            ["executed_at"] = record.ExecutedAt,
            ["results"] = record.Results,
            ["error"] = record.Error,
            ["success"] = record.Success
        };
    }
}
