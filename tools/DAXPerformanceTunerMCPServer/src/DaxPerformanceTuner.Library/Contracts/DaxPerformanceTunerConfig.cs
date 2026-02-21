namespace DaxPerformanceTuner.Library.Contracts;

/// <summary>
/// Configuration loaded from appsettings.json, bound to the "DaxPerformanceTuner" section.
/// </summary>
public class DaxPerformanceTunerConfig
{
    public string ClientId { get; set; } = "ea0616ba-638b-4df5-95b9-636659ae5121";
    public string Authority { get; set; } = "https://login.microsoftonline.com/common";
    public string[] Scopes { get; set; } = ["https://analysis.windows.net/powerbi/api/.default"];
    public int TokenRefreshBufferSeconds { get; set; } = 300;
    public PerformanceThresholdsConfig PerformanceThresholds { get; set; } = new();
    public int DaxExecutionRuns { get; set; } = 3;
    public int DaxExecutionTimeoutSeconds { get; set; } = 600;
    public int DaxFormatterTimeoutSeconds { get; set; } = 30;
    public int ResearchRequestTimeout { get; set; } = 30;
    public int ResearchMaxWorkers { get; set; } = 8;
    public int ResearchMinContentLength { get; set; } = 200;
}

public class PerformanceThresholdsConfig
{
    public double ImprovementThresholdPercent { get; set; } = 10.0;
    public int MaxTotalTimeMs { get; set; } = 120000;
    public double SignificantImprovementPercent { get; set; } = 20.0;
}
