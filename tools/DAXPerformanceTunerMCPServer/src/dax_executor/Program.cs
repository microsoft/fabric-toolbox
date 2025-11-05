// ============================================================================
// DAX Executor - Command Line Interface
// ============================================================================
// This file is part of the DAX Executor component which contains code derived
// from DAX Studio (https://github.com/DaxStudio/DaxStudio)
// Licensed under: Microsoft Reciprocal License (Ms-RL)
// See LICENSE-MSRL.txt in this directory for full license text
// ============================================================================

using System;
using System.CommandLine;
using System.Threading.Tasks;

namespace DaxExecutor
{
    class Program
    {
        static async Task<int> Main(string[] args)
        {
            var workspaceOption = new Option<string>("--workspace", "Power BI workspace name");
            var xmlaOption = new Option<string>("--xmla", "XMLA server connection string (alternative to --workspace)");
            var datasetOption = new Option<string>("--dataset", "Power BI dataset name") { IsRequired = true };
            var queryOption = new Option<string>("--query", "DAX query to execute") { IsRequired = true };
            var verboseOption = new Option<bool>("--verbose", "Enable verbose logging");

            var rootCommand = new RootCommand("DAX Executor - Execute DAX queries with server timing traces")
            {
                workspaceOption,
                xmlaOption,
                datasetOption,
                queryOption,
                verboseOption
            };

            rootCommand.SetHandler(async (workspaceName, xmlaServer, datasetName, daxQuery, verbose) =>
            {
                try
                {
                    // Validate that either workspace or xmla is provided, but not both
                    if (string.IsNullOrEmpty(workspaceName) && string.IsNullOrEmpty(xmlaServer))
                    {
                        Console.Error.WriteLine("Error: Either --workspace or --xmla parameter must be provided");
                        Environment.Exit(1);
                        return;
                    }
                    
                    if (!string.IsNullOrEmpty(workspaceName) && !string.IsNullOrEmpty(xmlaServer))
                    {
                        Console.Error.WriteLine("Error: Cannot specify both --workspace and --xmla parameters");
                        Environment.Exit(1);
                        return;
                    }

                    if (verbose)
                    {
                        Console.Error.WriteLine("Verbose logging enabled");
                        Console.Error.WriteLine("Reading access token from stdin...");
                    }

                    // Read access token from stdin (more secure than command-line args)
                    string accessToken = Console.In.ReadToEnd().Trim();
                    
                    if (string.IsNullOrEmpty(accessToken))
                    {
                        Console.Error.WriteLine("Error: No access token provided via stdin");
                        Environment.Exit(1);
                        return;
                    }

                    if (verbose)
                    {
                        Console.Error.WriteLine($"Token received (length: {accessToken.Length})");
                    }

                    // Convert workspace name to XMLA endpoint if needed
                    string xmlaEndpoint = xmlaServer;
                    if (!string.IsNullOrEmpty(workspaceName))
                    {
                        xmlaEndpoint = $"powerbi://api.powerbi.com/v1.0/myorg/{workspaceName}";
                    }

                    // Execute trace with XMLA endpoint
                    string result = await DaxTraceRunner.RunTraceWithXmlaAsync(accessToken, xmlaEndpoint, datasetName, daxQuery);
                    Console.WriteLine(result);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Error: {ex.Message}");
                    Environment.Exit(1);
                }
            }, workspaceOption, xmlaOption, datasetOption, queryOption, verboseOption);

            return await rootCommand.InvokeAsync(args);
        }
    }
}
