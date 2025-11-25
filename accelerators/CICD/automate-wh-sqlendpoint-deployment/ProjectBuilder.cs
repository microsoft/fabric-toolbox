using System.Diagnostics;

namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// Project Builder Module
// -------------------------------------------------------------
internal static class ProjectBuilder
{
    public static void Build(string sqlprojPath)
    {
        Console.WriteLine("=== Building SQL Project with dotnet CLI ===");
        
        if (!File.Exists(sqlprojPath))
            throw new FileNotFoundException("SQL project file not found.", sqlprojPath);
        
        string? projectDir = Path.GetDirectoryName(sqlprojPath);
        if (projectDir == null)
            throw new ArgumentException("The provided SQL project path does not contain directory information.", nameof(sqlprojPath));
        
        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            WorkingDirectory = projectDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        
        psi.Environment["DOTNET_ROLL_FORWARD"] = "Major";
        
        psi.ArgumentList.Add("build");
        psi.ArgumentList.Add(sqlprojPath);
        psi.ArgumentList.Add("-c");
        psi.ArgumentList.Add("Release");
        psi.ArgumentList.Add("-v:minimal");
        
        using var process = new Process { StartInfo = psi };
        
        var outputBuffer = new List<string>();
        var errorBuffer = new List<string>();
        
        process.OutputDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                Console.WriteLine(e.Data);
                outputBuffer.Add(e.Data);
            }
        };
        process.ErrorDataReceived += (sender, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                Console.WriteLine("ERROR: " + e.Data);
                errorBuffer.Add(e.Data);
            }
        };
        
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        process.WaitForExit();
        
        if (process.ExitCode != 0)
        {
            Console.WriteLine("\n=== BUILD FAILURE DETAILS ===");
            Console.WriteLine("Exit Code: " + process.ExitCode);
            if (errorBuffer.Count > 0)
            {
                Console.WriteLine("\nError Output:");
                foreach (var line in errorBuffer)
                    Console.WriteLine("  " + line);
            }
            if (outputBuffer.Count > 0)
            {
                Console.WriteLine("\nLast Output Lines:");
                foreach (var line in outputBuffer.TakeLast(10))
                    Console.WriteLine("  " + line);
            }
            throw new Exception($"dotnet build failed with exit code {process.ExitCode}. See details above.");
        }
        
        Console.WriteLine("=== dotnet build completed successfully ===");
    }
}