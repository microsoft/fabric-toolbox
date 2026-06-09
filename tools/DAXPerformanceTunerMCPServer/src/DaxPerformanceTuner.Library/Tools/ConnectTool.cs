using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using DaxPerformanceTuner.Library.Core;
using ModelContextProtocol.Server;

namespace DaxPerformanceTuner.Library.Tools;

/// <summary>
/// Request DTO for the connect_to_dataset tool.
/// </summary>
public class ConnectRequest
{
    [Description("Dataset to connect to (or partial name to search)")]
    public string? DatasetName { get; set; }

    [Description("Power BI workspace name (service only)")]
    public string? WorkspaceName { get; set; }

    [Description("Full XMLA endpoint URL")]
    public string? XmlaEndpoint { get; set; }

    [Description("Desktop instance port (desktop only)")]
    public int? DesktopPort { get; set; }

    [Description("Explicit location - 'desktop' or 'service' (optional, auto-detects if not provided)")]
    public string? Location { get; set; }
}

[McpServerToolType]
public class ConnectTool
{
    private readonly ConnectionService _connectionService;

    public ConnectTool(ConnectionService connectionService)
    {
        _connectionService = connectionService;
    }

    [McpServerTool(Name = "connect_to_dataset"), Description(
        "Smart connection tool - connects if enough info, discovers if not. " +
        "IMPORTANT: Connecting always resets any existing optimization session. Call this to start a new optimization workflow. " +
        "DIRECT CONNECT (has dataset_name + location): " +
        "connect_to_dataset(dataset_name='Sales Model', workspace_name='Sales Analytics') or " +
        "connect_to_dataset(dataset_name='ae86...', desktop_port=57466) or " +
        "connect_to_dataset(dataset_name='Sales Model', xmla_endpoint='powerbi://...') => Connected! " +
        "AUTO-MATCH (has dataset_name only): " +
        "connect_to_dataset(dataset_name='Sales') => Searches desktop instances for matches. " +
        "If 1 match: Auto-connects! If multiple: Shows options to disambiguate. " +
        "DISCOVER DATASETS (has location, no dataset_name): " +
        "connect_to_dataset(workspace_name='Sales Analytics') or connect_to_dataset(desktop_port=57466) " +
        "=> Returns list of available datasets at that location. " +
        "DISCOVER DESKTOP INSTANCES (no parameters): " +
        "connect_to_dataset() => Returns all desktop instances with their datasets. " +
        "Use location='service' to discover Power BI Service workspaces instead. " +
        "PARAMETERS (all optional): dataset_name (dataset to connect to or partial name to search), " +
        "workspace_name (Power BI workspace name, service only), desktop_port (desktop instance port, desktop only), " +
        "xmla_endpoint (full XMLA endpoint URL), location ('desktop' or 'service', auto-detects if not provided). " +
        "The tool will guide you on next steps if more info is needed!")]
    public async Task<string> Execute(ConnectRequest request)
    {
        return await _connectionService.ConnectAsync(
            request.DatasetName, request.WorkspaceName, request.XmlaEndpoint,
            request.DesktopPort, request.Location);
    }
}
