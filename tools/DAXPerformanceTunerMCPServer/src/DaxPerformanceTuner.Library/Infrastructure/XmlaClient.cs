using System.Data;
using System.Net;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Core;
using Microsoft.AnalysisServices.AdomdClient;

namespace DaxPerformanceTuner.Library.Infrastructure;

/// <summary>
/// Static helpers for XMLA connections and simple (non-traced) DAX/DMV query execution.
/// For traced execution, use <see cref="DaxTraceRunner"/> directly.
/// </summary>
public static class XmlaClient
{
    public static bool IsDesktopConnection(string endpoint)
        => endpoint.Contains("localhost:", StringComparison.OrdinalIgnoreCase);

    public static string BuildConnectionString(string xmlaEndpoint, string? datasetName = null, string? accessToken = null)
    {
        var sb = new System.Text.StringBuilder($"Data Source={xmlaEndpoint};");
        if (!string.IsNullOrEmpty(datasetName))
            sb.Append($"Initial Catalog={datasetName};");
        if (!IsDesktopConnection(xmlaEndpoint) && !string.IsNullOrEmpty(accessToken))
            sb.Append($"Password={accessToken};");
        return sb.ToString();
    }

    /// <summary>
    /// Resolve workspace name / endpoint into canonical (endpoint, workspaceName) pair.
    /// </summary>
    public static (string Endpoint, string WorkspaceName) DetermineXmlaEndpoint(
        string? workspaceName, string? xmlaEndpoint)
    {
        if (!string.IsNullOrEmpty(workspaceName))
        {
            if (IsDesktopConnection(workspaceName))
                return (workspaceName, $"Desktop ({workspaceName})");

            var encoded = Uri.EscapeDataString(workspaceName);
            return ($"powerbi://api.powerbi.com/v1.0/myorg/{encoded}", workspaceName);
        }

        if (string.IsNullOrEmpty(xmlaEndpoint))
            throw new ArgumentException("Either workspaceName or xmlaEndpoint must be provided.");

        string resolved;
        if (IsDesktopConnection(xmlaEndpoint))
            resolved = $"Desktop ({xmlaEndpoint})";
        else if (xmlaEndpoint.Contains("myorg/"))
            resolved = Uri.UnescapeDataString(xmlaEndpoint.Split("myorg/")[1]);
        else
            resolved = "Unknown";

        return (xmlaEndpoint, resolved);
    }

    /// <summary>
    /// Execute a lightweight DAX or DMV query and return a JSON string with columns, rows, row_count.
    /// No tracing – use this for metadata / connection tests only.
    /// </summary>
    public static string ExecuteQuery(string xmlaEndpoint, string datasetName, string query, string? accessToken = null)
    {
        try
        {
            var connStr = BuildConnectionString(xmlaEndpoint, datasetName, accessToken);
            using var connection = new AdomdConnection(connStr);
            connection.Open();

            using var command = new AdomdCommand(query, connection);
            using var adapter = new AdomdDataAdapter(command);
            var ds = new DataSet();
            adapter.Fill(ds);

            if (ds.Tables.Count == 0)
                return JsonHelper.Serialize(new { columns = Array.Empty<string>(), rows = Array.Empty<object>(), row_count = 0 });

            var table = ds.Tables[0];
            var columns = table.Columns.Cast<DataColumn>().Select(c => c.ColumnName).ToList();
            var rows = new List<Dictionary<string, object?>>();

            foreach (DataRow row in table.Rows)
            {
                var d = new Dictionary<string, object?>();
                foreach (var col in columns)
                {
                    var val = row[col];
                    d[col] = val == DBNull.Value ? null : val?.ToString();
                }
                rows.Add(d);
            }

            return JsonHelper.Serialize(new { columns, rows, row_count = rows.Count });
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}\nDetails: {ex}";
        }
    }

    /// <summary>
    /// Execute a query with automatic auth retry on failure for service connections.
    /// Auth retry logic for service connections.
    /// </summary>
    public static async Task<string> ExecuteQueryWithRetryAsync(
        string xmlaEndpoint, string datasetName, string query,
        string? accessToken, IAuthService? authService)
    {
        var result = ExecuteQuery(xmlaEndpoint, datasetName, query, accessToken);

        if (!result.StartsWith("Error:"))
            return result;

        // Desktop connections don't need auth retry
        if (IsDesktopConnection(xmlaEndpoint))
            return result;

        // Check if it's an auth error and we have an auth service to retry with
        if (authService != null && AuthService.IsAuthError(result))
        {
            // Force token refresh and retry
            try
            {
                var newToken = await authService.AcquireTokenInteractiveAsync();
                if (!string.IsNullOrEmpty(newToken))
                {
                    var retryResult = ExecuteQuery(xmlaEndpoint, datasetName, query, newToken);
                    if (!retryResult.StartsWith("Error:"))
                        return retryResult;

                    if (AuthService.IsAuthError(retryResult))
                        return $"Error: Authentication failed even after token refresh. Please reconnect. Details: {retryResult}";

                    return retryResult;
                }
            }
            catch
            {
                return $"Error: Token refresh failed. Please reconnect and re-authenticate. Original error: {result}";
            }
        }

        return $"Error: DAX query execution failed - {result}";
    }
}
