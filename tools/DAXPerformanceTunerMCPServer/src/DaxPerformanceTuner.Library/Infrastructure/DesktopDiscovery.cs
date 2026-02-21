using System.Diagnostics;
using System.Management;
using System.Text.RegularExpressions;
using TabularServer = Microsoft.AnalysisServices.Tabular.Server;

namespace DaxPerformanceTuner.Library.Infrastructure;

/// <summary>
/// Discovers local Power BI Desktop instances and enumerates their datasets.
/// Uses WMI + TOM for process discovery and dataset enumeration.
/// </summary>
public static class DesktopDiscovery
{
    public record DesktopInstance(int Port, string? WindowTitle, string? ParentProcessName, List<DatabaseInfo> Datasets);
    public record DatabaseInfo(string Name, string Id);

    /// <summary>
    /// Find all running Power BI Desktop instances and list their datasets.
    /// </summary>
    public static List<DesktopInstance> DiscoverInstances()
    {
        var instances = new List<DesktopInstance>();

        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'msmdsrv.exe'");

            foreach (var obj in searcher.Get())
            {
                try
                {
                    var pid = Convert.ToInt32(obj["ProcessId"]);
                    var cmdLine = obj["CommandLine"]?.ToString() ?? "";

                    // Extract -s parameter (data directory) where msmdsrv.port.txt lives
                    var match = Regex.Match(cmdLine, @"-s\s+""?([^""]+)""?");
                    if (!match.Success) continue;

                    var dataDir = match.Groups[1].Value.TrimEnd('\\');
                    var portFile = Path.Combine(dataDir, "msmdsrv.port.txt");

                    if (!File.Exists(portFile)) continue;
                    if (!int.TryParse(File.ReadAllText(portFile).Trim(), out var port)) continue;

                    // Get parent process info (PBIDesktop.exe window title)
                    string? windowTitle = null;
                    string? parentName = null;
                    try
                    {
                        using var parentSearcher = new ManagementObjectSearcher(
                            $"SELECT ParentProcessId FROM Win32_Process WHERE ProcessId = {pid}");
                        foreach (var parentObj in parentSearcher.Get())
                        {
                            var parentPid = Convert.ToInt32(parentObj["ParentProcessId"]);
                            try
                            {
                                var parentProc = Process.GetProcessById(parentPid);
                                parentName = parentProc.ProcessName;
                                windowTitle = parentProc.MainWindowTitle;
                                if (string.IsNullOrEmpty(windowTitle))
                                    windowTitle = $"{parentName} (PID: {parentPid})";
                            }
                            catch { }
                        }
                    }
                    catch { }

                    var datasets = ListDatabases($"localhost:{port}");
                    instances.Add(new DesktopInstance(port, windowTitle, parentName, datasets));
                }
                catch { continue; }
            }
        }
        catch { }

        instances.Sort((a, b) => a.Port.CompareTo(b.Port));
        return instances;
    }

    /// <summary>
    /// List all databases on an XMLA endpoint using TOM Server.
    /// </summary>
    public static List<DatabaseInfo> ListDatabases(string endpoint, string? accessToken = null)
    {
        var databases = new List<DatabaseInfo>();
        try
        {
            var connStr = XmlaClient.BuildConnectionString(endpoint, accessToken: accessToken);
            using var server = new TabularServer();
            server.Connect(connStr);

            foreach (Microsoft.AnalysisServices.Tabular.Database db in server.Databases)
            {
                databases.Add(new DatabaseInfo(db.Name, db.ID));
            }
            server.Disconnect();
        }
        catch { }
        return databases;
    }
}
