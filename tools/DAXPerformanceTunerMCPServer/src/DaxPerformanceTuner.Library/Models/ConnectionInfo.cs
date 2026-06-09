namespace DaxPerformanceTuner.Library.Models;

/// <summary>
/// Holds connection details for the current optimization session.
/// </summary>
public class ConnectionInfo
{
    public required string XmlaEndpoint { get; set; }
    public required string DatasetName { get; set; }
    public string? WorkspaceName { get; set; }
    public bool IsDesktop { get; set; }
}
