using System.Text.Json;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Infrastructure;
using DaxPerformanceTuner.Library.Models;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Smart connection routing — connects, discovers, or guides the user.
/// </summary>
public class ConnectionService
{
    private readonly IAuthService _auth;
    private readonly SessionManager _sessionManager;
    private readonly PowerBIApiClient _powerBIApi;

    public ConnectionService(IAuthService auth, SessionManager sessionManager, PowerBIApiClient powerBIApi)
    {
        _auth = auth;
        _sessionManager = sessionManager;
        _powerBIApi = powerBIApi;
    }

    public async Task<string> ConnectAsync(
        string? datasetName, string? workspaceName, string? xmlaEndpoint,
        int? desktopPort, string? location)
    {
        try
        {
            if (location != null && location != "desktop" && location != "service")
                return Error($"Invalid location '{location}'. Must be 'desktop' or 'service'.");

            var effectiveLocation = DetermineLocation(location, desktopPort, workspaceName, xmlaEndpoint);

            if (effectiveLocation == "desktop")
                return await HandleDesktopAsync(datasetName, desktopPort);
            else
                return await HandleServiceAsync(datasetName, workspaceName, xmlaEndpoint);
        }
        catch (Exception ex)
        {
            return Error($"Unexpected error: {ex.Message}");
        }
    }

    // ---- location detection ----

    private static string DetermineLocation(string? location, int? desktopPort, string? workspaceName, string? xmlaEndpoint)
    {
        if (location != null) return location;
        if (desktopPort.HasValue) return "desktop";
        if (workspaceName != null) return "service";
        if (xmlaEndpoint != null && xmlaEndpoint.Contains("powerbi://")) return "service";
        return "desktop"; // default
    }

    // ---- desktop ----

    private async Task<string> HandleDesktopAsync(string? datasetName, int? desktopPort)
    {
        var endpoint = desktopPort.HasValue ? $"localhost:{desktopPort}" : null;

        // Have endpoint + dataset → direct connect
        if (endpoint != null && datasetName != null)
            return await AttemptConnectionAsync(datasetName, null, endpoint);

        // Have endpoint only → discover datasets on that port
        if (endpoint != null)
        {
            var datasets = DesktopDiscovery.ListDatabases(endpoint);
            return Json(new
            {
                status = "discovery",
                action = "needs_dataset_name",
                available_datasets = datasets.Select(d => new { name = d.Name, id = d.Id }),
                location = endpoint,
                message = $"Found {datasets.Count} dataset(s) on desktop instance (port {desktopPort}). Specify dataset_name to connect."
            });
        }

        // Have dataset name only → search all desktop instances
        if (datasetName != null)
            return await SearchAndConnectDesktopAsync(datasetName);

        // Nothing → discover all desktop instances
        var instances = DesktopDiscovery.DiscoverInstances();
        return Json(new
        {
            status = "discovery",
            action = "needs_connection_info",
            desktop_instances = instances.Select(i => new
            {
                port = i.Port,
                window_title = i.WindowTitle,
                datasets = i.Datasets.Select(d => new { name = d.Name, id = d.Id })
            }),
            message = $"Found {instances.Count} desktop instance(s). Specify desktop_port + dataset_name, or just dataset_name to search."
        });
    }

    private async Task<string> SearchAndConnectDesktopAsync(string datasetName)
    {
      try
      {
        var instances = DesktopDiscovery.DiscoverInstances();
        if (instances.Count == 0)
            return Error("No desktop instances found. Please open Power BI Desktop with a model loaded.");

        var matches = new List<(int Port, string? WindowTitle, DesktopDiscovery.DatabaseInfo Dataset)>();
        foreach (var inst in instances)
        {
            foreach (var ds in inst.Datasets)
            {
                if (ds.Name.Contains(datasetName, StringComparison.OrdinalIgnoreCase) ||
                    ds.Id.Contains(datasetName, StringComparison.OrdinalIgnoreCase))
                {
                    matches.Add((inst.Port, inst.WindowTitle, ds));
                }
            }
        }

        if (matches.Count == 0)
        {
            return Json(new
            {
                status = "discovery",
                action = "no_matches",
                desktop_instances = instances.Select(i => new { port = i.Port, window_title = i.WindowTitle, datasets = i.Datasets.Select(d => new { name = d.Name, id = d.Id }) }),
                searched_for = datasetName,
                message = $"No datasets matching '{datasetName}' found on desktop instances."
            });
        }

        if (matches.Count == 1)
        {
            var m = matches[0];
            return await AttemptConnectionAsync(m.Dataset.Name, null, $"localhost:{m.Port}");
        }

        return Json(new
        {
            status = "discovery",
            action = "multiple_matches",
            matches = matches.Select(m => new { port = m.Port, window_title = m.WindowTitle, dataset = new { name = m.Dataset.Name, id = m.Dataset.Id } }),
            searched_for = datasetName,
            message = $"Found {matches.Count} datasets matching '{datasetName}'. Specify desktop_port or exact dataset_name."
        });
      }
      catch (Exception ex)
      {
          return Error($"Desktop search failed: {ex.Message}");
      }
    }

    // ---- service ----

    private async Task<string> HandleServiceAsync(string? datasetName, string? workspaceName, string? xmlaEndpoint)
    {
        // Have workspace/endpoint + dataset → direct connect
        if ((workspaceName != null || xmlaEndpoint != null) && datasetName != null)
            return await AttemptConnectionAsync(datasetName, workspaceName, xmlaEndpoint);

        // Have workspace/endpoint only → discover datasets
        if (workspaceName != null || xmlaEndpoint != null)
        {
            var (endpoint, resolved) = XmlaClient.DetermineXmlaEndpoint(workspaceName, xmlaEndpoint);
            var token = await _auth.GetAccessTokenAsync();
            var datasets = DesktopDiscovery.ListDatabases(endpoint, token);

            if (datasets.Count == 0 && workspaceName != null)
            {
                var wsResult = await _powerBIApi.ListWorkspacesAsync();
                var wsList = wsResult.TryGetValue("workspaces", out var wsObj) ? wsObj : new List<object>();
                var wsCount = wsList is System.Collections.ICollection c ? c.Count : 0;
                return Json(new
                {
                    status = "discovery",
                    action = "workspace_not_found",
                    searched_for = workspaceName,
                    workspaces = wsList,
                    message = $"Workspace '{workspaceName}' not found. Found {wsCount} available workspace(s)."
                });
            }

            return Json(new
            {
                status = "discovery",
                action = "needs_dataset_name",
                available_datasets = datasets.Select(d => new { name = d.Name, id = d.Id }),
                location = workspaceName ?? xmlaEndpoint,
                message = $"Found {datasets.Count} dataset(s) in workspace. Specify dataset_name to connect."
            });
        }

        // Dataset only (service) → error
        if (datasetName != null)
            return Error("Cannot search for datasets in Power BI Service without workspace_name. Provide workspace_name, or use location='desktop'.");

        // Nothing → list workspaces
        var result = await _powerBIApi.ListWorkspacesAsync();
        if (result.TryGetValue("status", out var s) && s?.ToString() == "error")
            return JsonHelper.Serialize(result);

        var wsList2 = result.TryGetValue("workspaces", out var workspaces) ? workspaces : new List<object>();
        var wsCount2 = wsList2 is System.Collections.ICollection wc ? wc.Count : 0;
        return Json(new
        {
            status = "discovery",
            action = "needs_connection_info",
            workspaces = wsList2,
            message = $"Found {wsCount2} workspace(s). Specify workspace_name + dataset_name to connect."
        });
    }

    // ---- connection test ----

    private async Task<string> AttemptConnectionAsync(string datasetName, string? workspaceName, string? xmlaEndpoint)
    {
        try
        {
            var (endpoint, resolved) = XmlaClient.DetermineXmlaEndpoint(workspaceName, xmlaEndpoint);
            var isDesktop = XmlaClient.IsDesktopConnection(endpoint);

            string? token = null;
            if (!isDesktop)
            {
                token = await _auth.GetAccessTokenAsync();
                if (token == null)
                    return Error("Authentication required – please sign in to Power BI");
            }

            // Test connection — parse JSON and verify rows (matches Python)
            var testResult = XmlaClient.ExecuteQuery(endpoint, datasetName, "EVALUATE { 1 }", token);
            if (testResult.StartsWith("Error:"))
                return Error($"Failed to connect to dataset '{datasetName}' at {endpoint}");

            try
            {
                var testData = JsonSerializer.Deserialize<JsonElement>(testResult);
                if (!testData.TryGetProperty("rows", out var rows) || rows.GetArrayLength() == 0)
                    return Error($"Failed to connect to dataset '{datasetName}' at {endpoint}");
            }
            catch
            {
                return Error($"Failed to connect to dataset '{datasetName}' at {endpoint}");
            }

            // Create session
            try
            {
                _sessionManager.CreateSession(new ConnectionInfo
                {
                    XmlaEndpoint = endpoint,
                    DatasetName = datasetName,
                    WorkspaceName = resolved,
                    IsDesktop = isDesktop
                });
            }
            catch (Exception exc)
            {
                return Error($"Session initialization failed: {exc.Message}");
            }

            return Json(new
            {
                status = "success",
                action = "connected",
                workspace_name = resolved,
                dataset_name = datasetName,
                xmla_endpoint = endpoint,
                is_desktop = isDesktop,
                message = $"\u2705 Connected to '{datasetName}' at {resolved}"
            });
        }
        catch (Exception ex)
        {
            return Error($"Connection failed: {ex.Message}");
        }
    }

    // ---- helpers ----

    private static string Json(object obj) => JsonHelper.Serialize(obj);
    private static string Error(string msg) => JsonHelper.ErrorJson(msg);
}
