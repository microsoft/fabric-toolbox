using System.Diagnostics;

namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// Process Runner Utility
// -------------------------------------------------------------
internal static class ProcessRunner
{
    public static void Run(string exe, string args)
    {
        Console.WriteLine($"> {exe} {args}");
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        
        using var proc = Process.Start(psi);
        if (proc == null)
            throw new InvalidOperationException($"Failed to start process: {exe}");
        
        proc.OutputDataReceived += (_, e) =>
        {
            if (e.Data != null) Console.WriteLine(e.Data);
        };
        proc.ErrorDataReceived += (_, e) =>
        {
            if (e.Data != null) Console.Error.WriteLine(e.Data);
        };
        
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();
        proc.WaitForExit();
        
        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"{exe} exited with code {proc.ExitCode}");
    }
}