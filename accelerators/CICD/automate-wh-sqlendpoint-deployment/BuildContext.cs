namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// Build Context - holds all paths and configuration
// -------------------------------------------------------------
internal class BuildContext
{
    public AppOptions Options { get; }
    public string ProjectRoot { get; }
    public string DacpacPath { get; }
    public string SqlProjPath { get; }
    public string BuiltDacpacPath { get; }

    public BuildContext(AppOptions options, string runTimestamp)
    {
        Options = options;
        // Use the same run folder structure as the main program
        string runFolder = Path.Combine(options.WorkingDir, $"Run_{runTimestamp}");
        ProjectRoot = Path.Combine(runFolder, options.ProjectName);
        DacpacPath = Path.Combine(runFolder, $"{options.SourceDatabase}.dacpac");
        SqlProjPath = Path.Combine(ProjectRoot, $"{options.ProjectName}.sqlproj");
        BuiltDacpacPath = Path.Combine(ProjectRoot, "bin", "Release", $"{options.ProjectName}.dacpac");
        
        Directory.CreateDirectory(ProjectRoot);
    }
}