using System.Text.Json;

namespace DaxPerformanceTuner.Library.Models;

/// <summary>
/// In-memory session state tracking connection, baseline, and optimization progress.
/// Thread-safe via locking in SessionManager.
/// </summary>
public class SessionState
{
    public string SessionId { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    public ConnectionInfo? ConnectionInfo { get; set; }
    public QueryData? QueryData { get; set; }
}

/// <summary>
/// Tracks query state across the optimization workflow.
/// Stores raw DaxTraceRunner output as JsonDocument so we can compare runs.
/// </summary>
public class QueryData
{
    /// <summary>The very first raw query the user submitted, before any measure/function inlining. Survives re-baselines.</summary>
    public string? UserInputQuery { get; set; }
    public string? OriginalQuery { get; set; }
    public string? EnhancedQuery { get; set; }
    public bool BaselineEstablished { get; set; }

    /// <summary>Raw DaxTraceRunner JSON output for the baseline run (fastest of N).</summary>
    public JsonDocument? BaselineRawResult { get; set; }

    /// <summary>Baseline performance metrics extracted for quick access.</summary>
    public PerformanceSnapshot? BaselinePerformance { get; set; }

    /// <summary>Performance snapshot from the very first baseline. Survives re-baselines so cumulative improvement can be tracked.</summary>
    public PerformanceSnapshot? OriginalBaselinePerformance { get; set; }

    /// <summary>Best optimization so far.</summary>
    public double BestImprovementPercent { get; set; }
    public bool BestMeetsThreshold { get; set; }
    public bool BestIsEquivalent { get; set; }
    public string? BestOptimizationQueryId { get; set; }

    /// <summary>Per-attempt history: baseline record. Port of Python query_data["baseline"].</summary>
    public QueryRecord? Baseline { get; set; }

    /// <summary>Per-attempt history: optimization records keyed by "optimization_1", etc. Port of Python query_data["optimizations"].</summary>
    public Dictionary<string, QueryRecord> Optimizations { get; set; } = new();
}

/// <summary>
/// Individual query execution record.
/// Port of Python SessionState.track_query_execution record structure.
/// </summary>
public class QueryRecord
{
    public string QueryId { get; set; } = "";
    public string QueryText { get; set; } = "";
    public string ExecutionMode { get; set; } = "";
    public string ExecutedAt { get; set; } = DateTime.UtcNow.ToString("o");
    public Dictionary<string, object?>? Results { get; set; }
    public string? Error { get; set; }
    public bool Success { get; set; }
}

/// <summary>
/// Lightweight performance snapshot for quick comparisons.
/// </summary>
public class PerformanceSnapshot
{
    public double TotalMs { get; set; }
    public double FormulaEngineMs { get; set; }
    public double StorageEngineMs { get; set; }
    public double StorageEngineCpuMs { get; set; }
    public double StorageEngineParallelism { get; set; }
    public int StorageEngineQueries { get; set; }
    public int StorageEngineCache { get; set; }

    public static PerformanceSnapshot FromJson(JsonElement perf)
    {
        return new PerformanceSnapshot
        {
            TotalMs = perf.TryGetProperty("Total", out var t) ? t.GetDouble() : 0,
            FormulaEngineMs = perf.TryGetProperty("FE", out var fe) ? fe.GetDouble() : 0,
            StorageEngineMs = perf.TryGetProperty("SE", out var se) ? se.GetDouble() : 0,
            StorageEngineCpuMs = perf.TryGetProperty("SE_CPU", out var sc) ? sc.GetDouble() : 0,
            StorageEngineParallelism = perf.TryGetProperty("SE_Par", out var sp) ? sp.GetDouble() : 0,
            StorageEngineQueries = perf.TryGetProperty("SE_Queries", out var sq) ? sq.GetInt32() : 0,
            StorageEngineCache = perf.TryGetProperty("SE_Cache", out var scache) ? scache.GetInt32() : 0,
        };
    }
}
