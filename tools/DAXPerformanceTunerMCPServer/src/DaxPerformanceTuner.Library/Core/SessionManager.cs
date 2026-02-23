using DaxPerformanceTuner.Library.Models;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Thread-safe in-memory session manager. Tracks one active optimization session at a time.
/// </summary>
public class SessionManager
{
    private readonly object _lock = new();
    private SessionState? _currentSession;

    /// <summary>
    /// Create a new session with the given connection info, replacing any existing session.
    /// </summary>
    public SessionState CreateSession(ConnectionInfo connectionInfo)
    {
        lock (_lock)
        {
            _currentSession = new SessionState
            {
                ConnectionInfo = connectionInfo,
                CreatedAt = DateTime.UtcNow,
                LastUpdated = DateTime.UtcNow
            };
            return _currentSession;
        }
    }

    /// <summary>
    /// Get the current active session, or null if none exists.
    /// </summary>
    public SessionState? GetCurrentSession()
    {
        lock (_lock)
        {
            return _currentSession;
        }
    }

    /// <summary>
    /// Update the session's query data (baseline, optimization results, etc.)
    /// </summary>
    public void UpdateQueryData(Action<QueryData> updateAction)
    {
        lock (_lock)
        {
            if (_currentSession == null)
                throw new InvalidOperationException("No active session");

            _currentSession.QueryData ??= new QueryData();
            updateAction(_currentSession.QueryData);
            _currentSession.LastUpdated = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Check if there is an active session with a valid connection.
    /// </summary>
    public bool HasActiveSession => _currentSession?.ConnectionInfo != null;

    /// <summary>
    /// Validate that a session exists and has a connection. Returns (isValid, session, errorMessage).
    /// </summary>
    public (bool IsValid, SessionState? Session, string? Error) ValidateSession()
    {
        lock (_lock)
        {
            if (_currentSession == null)
                return (false, null, "No active optimization session. Use connect_to_dataset first.");

            if (_currentSession.ConnectionInfo == null)
                return (false, null, "Session exists but no connection info. Use connect_to_dataset first.");

            return (true, _currentSession, null);
        }
    }

    /// <summary>
    /// Track a query execution as either baseline or optimization attempt.
    /// </summary>
    public string? TrackQueryExecution(
        string daxQuery, string executionMode,
        Dictionary<string, object?>? performanceData = null,
        object? resultData = null,
        string? error = null,
        Dictionary<string, object>? performanceAnalysis = null,
        Dictionary<string, object>? semanticEquivalence = null)
    {
        lock (_lock)
        {
            if (_currentSession == null) return null;
            _currentSession.QueryData ??= new QueryData();
            var qd = _currentSession.QueryData;

            // Determine query ID
            string queryId;
            if (executionMode == "baseline")
            {
                queryId = "baseline";
            }
            else
            {
                var currentCount = qd.Optimizations.Count + 1;
                queryId = $"optimization_{currentCount}";
            }

            // Build results dict
            var queryResults = new Dictionary<string, object?>
            {
                ["performance_metrics"] = performanceData,
                ["results"] = resultData
            };
            if (performanceAnalysis != null) queryResults["performance_analysis"] = performanceAnalysis;
            if (semanticEquivalence != null) queryResults["semantic_equivalence"] = semanticEquivalence;

            // Create record
            var record = new QueryRecord
            {
                QueryId = queryId,
                QueryText = daxQuery,
                ExecutionMode = executionMode,
                ExecutedAt = DateTime.UtcNow.ToString("o"),
                Results = queryResults,
                Error = error,
                Success = error == null
            };

            // Store
            if (executionMode == "baseline")
            {
                qd.Baseline = record;
                if (error == null) qd.BaselineEstablished = true;
            }
            else
            {
                qd.Optimizations[queryId] = record;
            }

            // Track original query
            if (string.IsNullOrEmpty(qd.OriginalQuery))
                qd.OriginalQuery = daxQuery;

            // Update performance summary for optimization attempts
            if (executionMode != "baseline" && performanceAnalysis != null)
            {
                if (performanceAnalysis.TryGetValue("improvement_percent", out var impObj) && impObj is double improvement)
                {
                    if (improvement > qd.BestImprovementPercent)
                    {
                        qd.BestImprovementPercent = improvement;
                        qd.BestOptimizationQueryId = queryId;
                        qd.BestMeetsThreshold = performanceAnalysis.TryGetValue("meets_threshold", out var mt) && mt is true;
                        qd.BestIsEquivalent = semanticEquivalence != null &&
                            semanticEquivalence.TryGetValue("is_equivalent", out var eq) && eq is true;
                    }
                }
            }

            _currentSession.LastUpdated = DateTime.UtcNow;
            return queryId;
        }
    }

    /// <summary>
    /// Reset query data and establish a new baseline for the current session.
    /// </summary>
    public bool EstablishNewBaseline(string query)
    {
        lock (_lock)
        {
            if (_currentSession == null) return false;

            _currentSession.QueryData = new QueryData { OriginalQuery = query };
            _currentSession.LastUpdated = DateTime.UtcNow;
            return true;
        }
    }
}
