using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using DaxPerformanceTuner.Library.Contracts;
using DaxPerformanceTuner.Library.Core;
using DaxPerformanceTuner.Library.Infrastructure;
using DaxPerformanceTuner.Library.Tools;

const string serverInstructions = """
This is an MCP tool that enables a workflow-driven, research-driven, and testing-driven DAX optimization framework with specialized tools.

**CRITICAL WORKFLOW ENFORCEMENT:**
- ALWAYS read the complete JSON response from EVERY tool call
- Follow the 2-stage optimization workflow systematically
- Complete each stage fully before advancing to the next
- **ANALYZE QUERY RESULTS IN DEPTH** - Don't just look at status, examine Performance object and EventDetails array

**2-STAGE OPTIMIZATION WORKFLOW:**

**STAGE 1 - CONNECTION ESTABLISHMENT:**
**CALL THIS TOOL FIRST TO ESTABLISH CONNECTION**
- Use connect_to_dataset with workspace_name + dataset_name or xmla_endpoint + dataset_name
- Verify successful connection to Power BI dataset
- Only proceed once connection is confirmed

**STAGE 2 - COMPREHENSIVE BASELINE & OPTIMIZATION:**
- **SINGLE COMPREHENSIVE STEP: Call prepare_query_for_optimization** with the original user query
  - Automatically inlines all measure and user-defined function definitions from the original query
  - Executes baseline performance measurement with comprehensive trace analysis
  - Extracts relevant model metadata for the specific query context
  - Retrieves targeted DAX research articles based on detected patterns
  - Provides complete foundation for optimization work
- **CRITICAL: Focus on the measure and user-defined function definitions shown in the prepared query - these are what you'll optimize, not the query structure**
- **MANDATORY: Perform deep analysis of all baseline results based on research articles provided**
- Baseline provides: performance metrics, complete measure and function definitions to optimize, server timings, model context, and research guidance

**OPTIMIZATION ITERATIONS:**
- **OPTIMIZATION TARGET: Optimize the MEASURE AND USER-DEFINED FUNCTION DEFINITIONS from baseline, not the query structure**
- Keep the same SUMMARIZECOLUMNS grouping as baseline - focus on optimizing measure and function logic
- **OPTIMIZATION STRATEGY:** Use the performance data, model metadata, research articles, and DAX Optimization Guidance returned by prepare_query_for_optimization to develop specific optimizations that address identified bottlenecks
- **Semantic Equivalence Requirement:**
  - Optimized query MUST return identical row count, column structure, and values to baseline
  - Changing aggregation levels or grouping structure = automatic failure
- Use execute_dax_query for testing optimization attempts with automatic baseline comparison
- **After each optimization attempt, analyze results deeply:**
  - Compare Performance metrics to baseline
  - Check if bottlenecks were addressed
  - Identify additional optimization opportunities if needed
- **Success Criteria:** >=10% performance improvement + semantic equivalence
- **Continue until optimization goals are achieved**

**ITERATIVE OPTIMIZATION WORKFLOW:**
- **After Successful Optimization**: When you achieve >=10% improvement with semantic equivalence:
  - Present the optimized results to the user
  - Ask if they would like to use the optimized query as a new baseline for further optimization
  - If user agrees, call prepare_query_for_optimization with the optimized query
  - This establishes the optimized query as the new baseline for additional optimization rounds
  - Continue this iterative process to achieve cumulative performance improvements
- **Iterative Benefits**: Multiple optimization rounds can achieve compound improvements (e.g., 79% to 83% to potentially higher)
- **Stop Conditions**: When improvements fall below 10% threshold or user declines further optimization
""";

var builder = Host.CreateApplicationBuilder(args);

// Load embedded appsettings.json
var asm = Assembly.GetEntryAssembly()!;
using (var stream = asm.GetManifestResourceStream("appsettings.json"))
{
    if (stream is null)
    {
        Console.Error.WriteLine("ERROR: Unable to load configuration from embedded appsettings.json.");
        return;
    }
    builder.Configuration.AddJsonStream(stream);
}
builder.Configuration.AddEnvironmentVariables();

// Parse CLI args
var startArg = args.Any(a => a.Equals("--start", StringComparison.OrdinalIgnoreCase));
var versionArg = args.Any(a => a.Equals("--version", StringComparison.OrdinalIgnoreCase));
var helpArg = args.Any(a => a.Equals("--help", StringComparison.OrdinalIgnoreCase) || a.Equals("-h", StringComparison.OrdinalIgnoreCase));

var version = asm.GetName().Version?.ToString() ?? "0.1.0";

if (versionArg)
{
    Console.WriteLine(version);
    return;
}

if (helpArg)
{
    PrintUsage();
    return;
}

if (!startArg)
{
    PrintWelcomeInfo(version);
    return;
}

// Bind configuration
var config = new DaxPerformanceTunerConfig();
builder.Configuration.GetSection("DaxPerformanceTuner").Bind(config);

// Register services
builder.Services.AddSingleton(config);
builder.Services.AddSingleton<SessionManager>();
builder.Services.AddSingleton<IAuthService, AuthService>();
builder.Services.AddHttpClient<PowerBIApiClient>();
builder.Services.AddHttpClient<ResearchService>();
builder.Services.AddSingleton<MetadataService>();
builder.Services.AddSingleton<ConnectionService>();
builder.Services.AddSingleton<ExecutionService>();

// Configure logging to stderr (stdout is used for MCP JSON-RPC)
builder.Logging.AddConsole(options =>
{
    options.LogToStandardErrorThreshold = LogLevel.Trace;
});
builder.Logging.SetMinimumLevel(LogLevel.Information);

// Configure MCP server with stdio transport
// Use snake_case naming policy for MCP wire parameter names
// (e.g. dataset_name, dax_query, workspace_name).
var snakeCaseOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver()
};

var mcpBuilder = builder.Services
    .AddMcpServer(options =>
    {
        options.ServerInfo = new()
        {
            Name = "DAX Performance Tuner",
            Version = version
        };
        options.ServerInstructions = serverInstructions;
    })
    .WithStdioServerTransport()
    .WithTools<ConnectTool>(snakeCaseOptions)
    .WithTools<PrepareQueryTool>(snakeCaseOptions)
    .WithTools<ExecuteQueryTool>(snakeCaseOptions)
    .WithTools<SessionStatusTool>(snakeCaseOptions);

await builder.Build().RunAsync();

// --- Helper methods ---

static void PrintUsage()
{
    Console.WriteLine("DAX Performance Tuner MCP Server");
    Console.WriteLine();
    Console.WriteLine("Usage: dax-performance-tuner [options]");
    Console.WriteLine();
    Console.WriteLine("Options:");
    Console.WriteLine("  --start      Start the MCP server (required for MCP clients)");
    Console.WriteLine("  --version    Print version and exit");
    Console.WriteLine("  --help, -h   Show this help message");
    Console.WriteLine();
    Console.WriteLine("When run without --start, prints MCP configuration JSON for client setup.");
}

static void PrintWelcomeInfo(string version)
{
    Console.WriteLine($"DAX Performance Tuner MCP Server v{version}");
    Console.WriteLine();
    Console.WriteLine("MCP Configuration (add to your .vscode/mcp.json):");
    Console.WriteLine();

    var exePath = Environment.ProcessPath ?? "dax-performance-tuner.exe";
    var configJson = $$"""
    {
        "servers": {
            "dax-performance-tuner": {
                "command": "{{exePath.Replace("\\", "\\\\")}}",
                "args": ["--start"]
            }
        }
    }
    """;
    Console.WriteLine(configJson);
    Console.WriteLine();
    Console.WriteLine("To start the server: dax-performance-tuner --start");
}
