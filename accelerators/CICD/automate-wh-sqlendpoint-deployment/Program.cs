using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.SqlServer.Dac;
using Microsoft.SqlServer.Dac.Model;
using Microsoft.SqlServer.Dac.Extensions;
using Azure.Identity;
using Azure.Core;
using System.Xml;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace AutomateWarehouseProject;



// -------------------------------------------------------------
// Main Program
// -------------------------------------------------------------
internal class Program
{
    // Single timestamp for the entire run to keep all warehouses organized together
    private static readonly string RunTimestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");

    static async Task<int> Main(string[] args)
    {
        try
        {
            var options = AppOptions.Parse(args);
            var context = new BuildContext(options, RunTimestamp);

            WarehouseIdentificationResult? warehouseTypes = null;

            PrintHeader(options);
            
            // Step 1: Analyze warehouse dependencies via SQL queries
            var analysisResult = await AnalyzeWarehouseDependencies(options);

            // Step 1.5: Check for cyclic dependencies
            if (analysisResult.HasCyclicDependencies)
            {
                Console.Error.WriteLine("❌ Cannot proceed due to cyclic dependencies.");
                return 1;
            }
            
            // Step 2: Analyze Fabric workspace for warehouses and SQL endpoints (if workspace ID provided)
            if (!string.IsNullOrEmpty(options.SourceFabricWorkspaceId))
            {
                using var fabricClient = new FabricApiClient(options.BaseUrl);
            
                // Analyze both source and target workspaces to identify warehouses and SQL endpoints
                warehouseTypes = await fabricClient.ScanWorkspaceForWarehouseTypes(
                    options.SourceFabricWorkspaceId!, 
                    options.TargetFabricWorkspaceId);
            }
            
            // Step 3: Get processing order based on dependency chain
            var processingOrder = analysisResult.GetProcessingOrder();
            
            // Step 4: Extract DACPACs in dependency order
            await ExtractAllDacpacs(context, processingOrder);
            
            // Step 5: Process each warehouse in dependency order
            await ProcessAllWarehouses(context, processingOrder, analysisResult.DependencyChain, warehouseTypes);

            Console.WriteLine("\n==== Done. ====");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("❌ Error:");
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static void PrintHeader(AppOptions options)
    {
        Console.WriteLine("==== Warehouse Project Builder ====");
        Console.WriteLine($"Source:  {options.SourceServer} / {options.SourceDatabase}");
        Console.WriteLine($"Working: {options.WorkingDir}");
        Console.WriteLine($"Project: {options.ProjectName}");
        if (!string.IsNullOrEmpty(options.SourceFabricWorkspaceId))
        {
            Console.WriteLine($"Source Fabric Workspace: {options.SourceFabricWorkspaceId}");
        }
        if (!string.IsNullOrEmpty(options.TargetFabricWorkspaceId))
        {
            Console.WriteLine($"Target Fabric Workspace: {options.TargetFabricWorkspaceId}");
        }
        if (!string.IsNullOrEmpty(options.TargetServer))
        {
            Console.WriteLine($"Target Server: {options.TargetServer}");
        }
        Console.WriteLine();
    }


    private static async Task<DependencyAnalysisResult> AnalyzeWarehouseDependencies(AppOptions options)
    {
        Console.WriteLine("\n== Step 1: Analyze Warehouse Dependencies ==");
        
        var analysisResult = await WarehouseDependencyAnalyzer.AnalyzeDependencies(options.SourceServer, options.SourceDatabase, options.AccessToken!);
        analysisResult.PrintAnalysisResults();
        
        return analysisResult;
    }


    private static async Task ExtractAllDacpacs(BuildContext context, List<string> processingOrder)
    {
        Console.WriteLine($"\n== Step 2: Extract DACPACs in Dependency Order ==");
        Console.WriteLine($"Processing order: {string.Join(" -> ", processingOrder)}");
        
        // Create timestamped run folder for all artifacts
        string runFolder = Path.Combine(context.Options.WorkingDir, $"Run_{RunTimestamp}");
        Directory.CreateDirectory(runFolder);
        Console.WriteLine($"Created run folder: {runFolder}");
        
        foreach (var warehouse in processingOrder)
        {
            string dacpacPath = Path.Combine(runFolder, $"{warehouse}.dacpac");
            
            if (!File.Exists(dacpacPath) || context.Options.ForceExtract)
            {
                Console.WriteLine($"\nExtracting DACPAC for warehouse: {warehouse}");

                //check for warehouse type. If lakehouse, call sql endpoint of lakehouse refresh and then call extract. else call extract directly.
                DacpacExtractor.Extract(
                    context.Options.SourceServer,
                    warehouse,
                    context.Options.AccessToken!,
                    dacpacPath,
                    context.Options.SqlPackagePath
                );
            }
            else
            {
                Console.WriteLine($"DACPAC for {warehouse} already exists, skipping extract.");
            }
        }
    }

    private static async Task ProcessAllWarehouses(BuildContext context, List<string> processingOrder, Dictionary<string, HashSet<string>> dependencyChain, WarehouseIdentificationResult? warehouseTypes)
    {
        Console.WriteLine($"\n== Step 3: Process Each Warehouse in Dependency Order ==");
        
        foreach (var warehouse in processingOrder)
        {
            Console.WriteLine($"\n=== Processing Warehouse: {warehouse} ===");
            
            // Get warehouse-specific paths
            var (dacpacPath, projectRoot, sqlProjPath, builtDacpacPath) = GetWarehousePaths(context, warehouse);
            
            // Get dependencies for this warehouse
            var warehouseDependencies = dependencyChain.ContainsKey(warehouse) ? dependencyChain[warehouse] : new HashSet<string>();
            
            // Generate scripts and find dependencies
            var warehouseRefs = GenerateScriptsForWarehouse(dacpacPath, projectRoot, warehouse, warehouseDependencies);
            
            // Create SQL project for this warehouse
            CreateSqlProjectForWarehouse(sqlProjPath, projectRoot, warehouse, warehouseRefs, context.Options.WorkingDir);
            
            // Build project
            BuildSqlProjectForWarehouse(sqlProjPath, builtDacpacPath, warehouse);
            
            // Optional publish
            if (context.Options.Publish)
            {
                bool isSqlEndpoint = false;

                if (warehouseTypes != null &&
                   warehouseTypes.ItemsByName.TryGetValue(warehouse, out var itemInfo) &&
                   itemInfo.Type.Equals("SQLEndpoint", StringComparison.OrdinalIgnoreCase))
                {
                    isSqlEndpoint = true;
                    Console.WriteLine($"  Publishing SQL Endpoint: {warehouse}");
                    
                    // For SQL endpoints, refresh metadata first, then publish
                    if (!string.IsNullOrEmpty(context.Options.TargetFabricWorkspaceId))
                    {
                        using var fabricClient = new FabricApiClient(context.Options.BaseUrl);
                        // Use target ID if available, otherwise use source ID
                        var endpointId = itemInfo.TargetId;
                        bool refreshSuccess = await fabricClient.RefreshSqlEndpointAndWait(
                            context.Options.TargetFabricWorkspaceId, 
                            endpointId, 
                            warehouse);
                        
                        if (!refreshSuccess)
                        {
                            Console.WriteLine($"⚠️  Target SQL endpoint refresh failed for {warehouse}, but continuing with publish...");
                        }
                    }
                }
                
                PublishWarehouseProject(context.Options, builtDacpacPath, warehouse, warehouseRefs, isSqlEndpoint);
            }
        }
    }


    private static (string dacpacPath, string projectRoot, string sqlProjPath, string builtDacpacPath) GetWarehousePaths(BuildContext baseContext, string warehouseName)
    {
        // Use the shared run timestamp folder for all warehouses
        string runFolder = Path.Combine(baseContext.Options.WorkingDir, $"Run_{RunTimestamp}");
        string dacpacPath = Path.Combine(runFolder, $"{warehouseName}.dacpac");
        string projectRoot = Path.Combine(runFolder, $"{warehouseName}");
        string sqlProjPath = Path.Combine(projectRoot, $"{warehouseName}.sqlproj");
        string builtDacpacPath = Path.Combine(projectRoot, "bin", "Release", $"{warehouseName}.dacpac");
        
        return (dacpacPath, projectRoot, sqlProjPath, builtDacpacPath);
    }

    private static HashSet<string> GenerateScriptsForWarehouse(string dacpacPath, string projectRoot, string warehouseName, HashSet<string> dependencies)
    {
        Console.WriteLine($"  Generating scripts for warehouse: {warehouseName}");
        var warehouseRefs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        
        // Add known dependencies
        foreach (var dep in dependencies)
        {
            warehouseRefs.Add(dep);
        }
        
        var generatedFiles = GenerateScriptsFromDacpac(
            dacpacPath,
            warehouseName,
            projectRoot,
            warehouseRefs
        );

        Console.WriteLine($"  Generated {generatedFiles.Count} object scripts for {warehouseName}.");
        
        if (warehouseRefs.Count > 0)
        {
            Console.WriteLine($"  Cross-warehouse references for {warehouseName}: {string.Join(", ", warehouseRefs)}");
        }
        
        return warehouseRefs;
    }

    private static void CreateSqlProjectForWarehouse(string sqlProjPath, string projectRoot, string warehouseName, HashSet<string> warehouseRefs, string workingDir)
    {
        Console.WriteLine($"  Creating SQL project for warehouse: {warehouseName}");
        // Use the run folder for DACPAC references
        string runFolder = Path.Combine(workingDir, $"Run_{RunTimestamp}");
        SqlProjectBuilder.CreateProject(
            sqlProjPath,
            warehouseName,
            warehouseRefs,
            runFolder
        );
    }

    private static void BuildSqlProjectForWarehouse(string sqlProjPath, string builtDacpacPath, string warehouseName)
    {
        Console.WriteLine($"  Building SQL project for warehouse: {warehouseName}");
        ProjectBuilder.Build(sqlProjPath);

        if (!File.Exists(builtDacpacPath))
        {
            throw new Exception($"Build succeeded but DACPAC not found at {builtDacpacPath} for warehouse {warehouseName}");
        }
        Console.WriteLine($"  Build produced DACPAC for {warehouseName}: {builtDacpacPath}");
    }

    private static void PublishWarehouseProject(AppOptions options, string builtDacpacPath, string warehouseName, HashSet<string> warehouseRefs, bool isSqlEndpoint = false)
    {
        Console.WriteLine($"  Publishing warehouse: {warehouseName}");
        if (string.IsNullOrWhiteSpace(options.TargetServer))
        {
            throw new Exception($"Publish requested but TargetServer is missing for warehouse {warehouseName}.");
        }

        PublishDacpac(options, builtDacpacPath, warehouseName, warehouseRefs, isSqlEndpoint);
    }



    // -------------------------------------------------------------
    // Step 2: Load DACPAC and generate object scripts
    // -------------------------------------------------------------
    private static List<string> GenerateScriptsFromDacpac(
        string dacpacPath,
        string sourceDatabaseName,
        string projectRoot,
        HashSet<string> warehouseRefs)
    {
        Console.WriteLine("=== Generating scripts from DACPAC ===");

        using var model = new TSqlModel(dacpacPath);
        
        var allObjects = model.GetObjects(DacQueryScopes.UserDefined);

        var (tableScripts, constraintScripts, otherObjects) = ProcessDacpacObjects(allObjects, sourceDatabaseName, warehouseRefs);

        var generatedFiles = new List<string>();
        generatedFiles.AddRange(WriteTableScripts(tableScripts, constraintScripts, projectRoot));
        generatedFiles.AddRange(WriteOtherObjectScripts(otherObjects, sourceDatabaseName, projectRoot, warehouseRefs));

        Console.WriteLine("=== Script generation complete ===");
        return generatedFiles;
    }

    private static (Dictionary<(string, string), string> tables, Dictionary<(string, string), List<string>> constraints, List<TSqlObject> others)
        ProcessDacpacObjects(IEnumerable<TSqlObject> allObjects, string sourceDatabaseName, HashSet<string> warehouseRefs)
    {
        var tableScripts = new Dictionary<(string Schema, string Name), string>();
        var constraintScripts = new Dictionary<(string Schema, string Name), List<string>>();
        var otherObjects = new List<TSqlObject>();

        foreach (var obj in allObjects)
        {
            var (schemaName, objectName) = ParseObjectName(obj);
            if (schemaName == null || objectName == null) continue;

            var objectType = obj.ObjectType.Name;
            if (ShouldSkipObject(objectType, schemaName, objectName)) continue;

            var script = GetObjectScript(obj, schemaName, objectName, objectType);
            if (script == null) continue;

            var updatedScript = RewriteCrossWarehouseReferences(script, sourceDatabaseName, warehouseRefs);

            if (IsTable(objectType))
            {
                tableScripts[(schemaName, objectName)] = updatedScript;
            }
            else if (IsConstraint(objectType))
            {
                var parentTableKey = GetConstraintTableKey(obj);
                if (parentTableKey.HasValue)
                {
                    if (!constraintScripts.ContainsKey(parentTableKey.Value))
                        constraintScripts[parentTableKey.Value] = new List<string>();
                    constraintScripts[parentTableKey.Value].Add(updatedScript);
                }
            }
            else
            {
                otherObjects.Add(obj);
            }
        }

        return (tableScripts, constraintScripts, otherObjects);
    }

    private static (string? schema, string? name) ParseObjectName(TSqlObject obj)
    {
        var parts = obj.Name?.Parts ?? new List<string>();

        if (parts.Count == 0)
        {
            Console.WriteLine($"  - Skipped unnamed object of type {obj.ObjectType.Name}");
            return (null, null);
        }

        string schemaName = parts.Count == 1 ? "dbo" : parts[0];
        string objectName = parts.Count == 1 ? parts[0] : parts[1];

        if (string.IsNullOrWhiteSpace(objectName))
        {
            Console.WriteLine($"  - Skipped empty-name object: {obj.ObjectType.Name}");
            return (null, null);
        }

        return (schemaName, objectName);
    }

    private static bool ShouldSkipObject(string objectType, string schemaName, string objectName)
    {
        if (objectType.Equals("User", StringComparison.OrdinalIgnoreCase) ||
            objectType.Contains("Permission", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine($"  - Skipped {objectType}: {schemaName}.{objectName}");
            return true;
        }
        return false;
    }

    private static string? GetObjectScript(TSqlObject obj, string schemaName, string objectName, string objectType)
    {
        try
        {
            return obj.GetScript();
        }
        catch
        {
            Console.WriteLine($"  ! Failed to script {schemaName}.{objectName} ({objectType})");
            return null;
        }
    }

    private static bool IsTable(string objectType) =>
        objectType.EndsWith("Table", StringComparison.OrdinalIgnoreCase);

    private static bool IsConstraint(string objectType) =>
        objectType.Equals("PrimaryKeyConstraint", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("ForeignKeyConstraint", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("CheckConstraint", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("DefaultConstraint", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("UniqueConstraint", StringComparison.OrdinalIgnoreCase);

    private static (string Schema, string Name)? GetConstraintTableKey(TSqlObject constraintObj)
    {
        try
        {
            // Get the parent table for this constraint
            var parentTable = constraintObj.GetReferenced(DacQueryScopes.UserDefined)
                .FirstOrDefault(r => r.ObjectType.Name.EndsWith("Table", StringComparison.OrdinalIgnoreCase));
            
            if (parentTable?.Name?.Parts != null)
            {
                var parts = parentTable.Name.Parts;
                string schemaName = parts.Count == 1 ? "dbo" : parts[0];
                string tableName = parts.Count == 1 ? parts[0] : parts[1];
                return (schemaName, tableName);
            }
        }
        catch
        {
            // If we can't determine the parent table, skip this constraint
        }
        
        return null;
    }

    private static List<string> WriteTableScripts(
        Dictionary<(string Schema, string Name), string> tableScripts,
        Dictionary<(string Schema, string Name), List<string>> constraintScripts,
        string projectRoot)
    {
        var generatedFiles = new List<string>();

        foreach (var kvp in tableScripts)
        {
            string schemaName = kvp.Key.Schema;
            string objectName = kvp.Key.Name;

            string folder = Path.Combine(projectRoot, schemaName, "Tables");
            Directory.CreateDirectory(folder);

            string tablePath = Path.Combine(folder, $"{objectName}.sql");

            using var writer = new StreamWriter(tablePath, false, Encoding.UTF8);
            writer.WriteLine(kvp.Value.Trim());
            writer.WriteLine();
            writer.WriteLine("GO");

            // Append constraints if any
            if (constraintScripts.TryGetValue((schemaName, objectName), out var constraints))
            {
                foreach (var constraint in constraints)
                {
                    writer.WriteLine();
                    writer.WriteLine("-- Constraint");
                    writer.WriteLine(constraint.Trim());
                    writer.WriteLine();
                    writer.WriteLine("GO");
                }
            }

            generatedFiles.Add(tablePath);
            Console.WriteLine($"  + Table (with constraints): {Path.GetRelativePath(projectRoot, tablePath)}");
        }

        return generatedFiles;
    }

    private static List<string> WriteOtherObjectScripts(
        List<TSqlObject> otherObjects,
        string sourceDatabaseName,
        string projectRoot,
        HashSet<string> warehouseRefs)
    {
        var generatedFiles = new List<string>();

        foreach (var obj in otherObjects)
        {
            var (schemaName, objectName) = ParseObjectName(obj);
            if (schemaName == null || objectName == null) continue;

            string objectType = obj.ObjectType.Name;
            bool isSecurityObject = IsSecurityObject(objectType);

            string script = RewriteCrossWarehouseReferences(
                obj.GetScript(),
                sourceDatabaseName,
                warehouseRefs);

            string fileName = $"{objectName}.sql";
            string folder = isSecurityObject
                ? Path.Combine(projectRoot, "Security")
                : Path.Combine(projectRoot, schemaName, GetObjectFolderName(obj));

            Directory.CreateDirectory(folder);
            string fullPath = Path.Combine(folder, fileName);

            // Add GO statement after the script
            string scriptWithGo = script.TrimEnd() + Environment.NewLine + Environment.NewLine + "GO" + Environment.NewLine;
            File.WriteAllText(fullPath, scriptWithGo, Encoding.UTF8);
            generatedFiles.Add(fullPath);

            Console.WriteLine($"  + Generated: {Path.GetRelativePath(projectRoot, fullPath)}");
        }

        return generatedFiles;
    }

    private static bool IsSecurityObject(string objectType) =>
        objectType.Equals("Role", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("Schema", StringComparison.OrdinalIgnoreCase) ||
        objectType.Equals("User", StringComparison.OrdinalIgnoreCase) ||
        objectType.Contains("Permission", StringComparison.OrdinalIgnoreCase);

    private static string GetObjectFolderName(TSqlObject obj)
    {
        string type = obj.ObjectType.Name;

        // Schemas and Roles go to Security folder
        if (type.Equals("Schema", StringComparison.OrdinalIgnoreCase) ||
            type.Equals("Role", StringComparison.OrdinalIgnoreCase))
        {
            return "Security";
        }

        // Roles / users / permissions → root
        if (
            type.Equals("User", StringComparison.OrdinalIgnoreCase) ||
            type.IndexOf("Permission", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return "__SKIP__";  // project root
        }

        // Constraints handled separately (inside table file) → no folder
        if (type.EndsWith("Constraint", StringComparison.OrdinalIgnoreCase))
            return "";

        // Tables
        if (type.EndsWith("Table", StringComparison.OrdinalIgnoreCase))
            return "Tables";

        // Views
        if (type.EndsWith("View", StringComparison.OrdinalIgnoreCase))
            return "Views";

        // Procedures
        if (type.EndsWith("Procedure", StringComparison.OrdinalIgnoreCase))
            return "StoredProcedures";

        // Functions
        if (type.EndsWith("Function", StringComparison.OrdinalIgnoreCase))
            return "Functions";

        // Default: unknown objects → root
        return "";
    }

    // Detect cross-warehouse references and rewrite them
    private static string RewriteCrossWarehouseReferences(
        string script,
        string sourceDatabase,
        HashSet<string> warehouseRefs)
    {
        // Patterns to match all 8 possible cross-warehouse reference bracketing combinations:
        // 1. Warehouse.Schema.Object (unbraced)
        // 2. [Warehouse].Schema.Object (warehouse bracketed)
        // 3. Warehouse.[Schema].Object (schema bracketed) 
        // 4. Warehouse.Schema.[Object] (object bracketed)
        // 5. [Warehouse].[Schema].Object (warehouse + schema bracketed)
        // 6. [Warehouse].Schema.[Object] (warehouse + object bracketed)
        // 7. Warehouse.[Schema].[Object] (schema + object bracketed)
        // 8. [Warehouse].[Schema].[Object] (all bracketed)
        
        var patterns = new[]
        {
            // 1. Unbraced: Warehouse.Schema.Object
            new Regex(@"\b(\w+)\.(\w+)\.(\w+)", RegexOptions.IgnoreCase),
            
            // 2. Warehouse bracketed: [Warehouse].Schema.Object
            new Regex(@"\[\s*(\w+)\s*\]\.(\w+)\.(\w+)", RegexOptions.IgnoreCase),
            
            // 3. Schema bracketed: Warehouse.[Schema].Object  
            new Regex(@"\b(\w+)\.\[\s*(\w+)\s*\]\.(\w+)", RegexOptions.IgnoreCase),
            
            // 4. Object bracketed: Warehouse.Schema.[Object]
            new Regex(@"\b(\w+)\.(\w+)\.\[\s*(\w+)\s*\]", RegexOptions.IgnoreCase),
            
            // 5. Warehouse + Schema bracketed: [Warehouse].[Schema].Object
            new Regex(@"\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]\.(\w+)", RegexOptions.IgnoreCase),
            
            // 6. Warehouse + Object bracketed: [Warehouse].Schema.[Object]
            new Regex(@"\[\s*(\w+)\s*\]\.(\w+)\.\[\s*(\w+)\s*\]", RegexOptions.IgnoreCase),
            
            // 7. Schema + Object bracketed: Warehouse.[Schema].[Object]
            new Regex(@"\b(\w+)\.\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]", RegexOptions.IgnoreCase),
            
            // 8. All bracketed: [Warehouse].[Schema].[Object]
            new Regex(@"\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]", RegexOptions.IgnoreCase)
        };

        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Check all patterns for cross-warehouse references
        foreach (var pattern in patterns)
        {
            foreach (Match m in pattern.Matches(script))
            {
                var wh = m.Groups[1].Value;
                var schema = m.Groups[2].Value;
                
                if (!string.IsNullOrWhiteSpace(wh) &&
                    !wh.Equals(sourceDatabase, StringComparison.OrdinalIgnoreCase) &&
                    !wh.Equals(schema, StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(schema))
                {
                    found.Add(wh);
                }
            }
        }

        // Replace found warehouses with SQLCMD variables
        foreach (var wh in found)
        {
            warehouseRefs.Add(wh);
            string escaped = Regex.Escape(wh);

            // Replace all 8 bracketing variations with SQLCMD variable format
            var replacements = new[]
            {
                // 8. [Warehouse].[Schema].[Object] -> [$(Warehouse_ref)].[Schema].[Object]
                ($@"\[\s*{escaped}\s*\]\.\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]", $"[$({wh}_ref)].[$1].[$2]"),
                
                // 7. Warehouse.[Schema].[Object] -> [$(Warehouse_ref)].[Schema].[Object]
                ($@"\b{escaped}\.\[\s*(\w+)\s*\]\.\[\s*(\w+)\s*\]", $"[$({wh}_ref)].[$1].[$2]"),
                
                // 6. [Warehouse].Schema.[Object] -> [$(Warehouse_ref)].Schema.[Object]
                ($@"\[\s*{escaped}\s*\]\.(\w+)\.\[\s*(\w+)\s*\]", $"[$({wh}_ref)].$1.[$2]"),
                
                // 5. [Warehouse].[Schema].Object -> [$(Warehouse_ref)].[Schema].Object
                ($@"\[\s*{escaped}\s*\]\.\[\s*(\w+)\s*\]\.(\w+)", $"[$({wh}_ref)].[$1].$2"),
                
                // 4. Warehouse.Schema.[Object] -> [$(Warehouse_ref)].Schema.[Object]
                ($@"\b{escaped}\.(\w+)\.\[\s*(\w+)\s*\]", $"[$({wh}_ref)].$1.[$2]"),
                
                // 3. Warehouse.[Schema].Object -> [$(Warehouse_ref)].[Schema].Object
                ($@"\b{escaped}\.\[\s*(\w+)\s*\]\.(\w+)", $"[$({wh}_ref)].[$1].$2"),
                
                // 2. [Warehouse].Schema.Object -> [$(Warehouse_ref)].Schema.Object
                ($@"\[\s*{escaped}\s*\]\.(\w+)\.(\w+)", $"[$({wh}_ref)].$1.$2"),
                
                // 1. Warehouse.Schema.Object -> [$(Warehouse_ref)].Schema.Object
                ($@"\b{escaped}\.(\w+)\.(\w+)", $"[$({wh}_ref)].$1.$2")
            };

            foreach (var (pattern, replacement) in replacements)
            {
                script = Regex.Replace(script, pattern, replacement, RegexOptions.IgnoreCase);
            }
        }

        return script;
    }


    private static void PublishDacpac(AppOptions options, string dacpacPath, string targetDatabase, HashSet<string> warehouseRefs, bool isSqlEndpoint = false)
    {
        var sqlPackageExe = string.IsNullOrWhiteSpace(options.SqlPackagePath)
            ? "sqlpackage"
            : options.SqlPackagePath;

        var args = new StringBuilder();
        args.Append($"/Action:Publish ");
        args.Append($"/SourceFile:\"{dacpacPath}\" ");
        args.Append($"/TargetServerName:\"{options.TargetServer}\" ");
        args.Append($"/TargetDatabaseName:\"{targetDatabase}\" ");
        args.Append($"/AccessToken:\"{options.AccessToken}\" ");
        args.Append($"/p:BlockOnPossibleDataLoss=false ");
        args.Append($"/p:DropObjectsNotInSource=false ");
        args.Append($"/p:IgnorePermissions=true ");
        args.Append($"/p:IgnoreUserSettingsObjects=true ");

        if (isSqlEndpoint)
        {
            args.Append($"/p:ExcludeObjectTypes=Tables;Permissions ");
        }

        // SqlCmd vars (warehouse references)
        foreach (var wh in warehouseRefs)
        {
            args.Append($"/v:{wh}_ref=\"{wh}\" ");
        }

        ProcessRunner.Run(sqlPackageExe, args.ToString());
    }


}

// -------------------------------------------------------------
// Simple option parser
// -------------------------------------------------------------
internal sealed class AppOptions
{
    public string SourceServer { get; private set; } = "";
    public string SourceDatabase { get; private set; } = "";
    public string WorkingDir { get; private set; } = "";
    public string ProjectName { get; private set; } = "";
    public string SqlPackagePath { get; private set; } = "";
    public bool ForceExtract { get; private set; }
    public bool Publish { get; private set; }

    public string BaseUrl { get; private set; } = string.Empty;

    public string? TargetServer { get; private set; }
    public string? TargetDatabase { get; private set; }

    public string? AccessToken { get; private set; }
    public string? MsBuildPath { get; private set; }
    public string? SourceFabricWorkspaceId { get; private set; }
    public string? TargetFabricWorkspaceId { get; private set; }

    public static AppOptions Parse(string[] args)
    {
        var opts = new AppOptions();

        string? getArgValue(string key)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase))
                    return args[i + 1];
            }
            return null;
        }



        opts.SourceServer = getArgValue("--server")
            ?? throw new ArgumentException("Missing required argument: --server <serverName>");

        opts.SourceDatabase = getArgValue("--database")
            ?? throw new ArgumentException("Missing required argument: --database <databaseName>");

        opts.WorkingDir = getArgValue("--working-dir")
            ?? throw new ArgumentException("Missing required argument: --working-dir <path>");

        opts.ProjectName = opts.SourceDatabase;

        opts.SourceFabricWorkspaceId = getArgValue("--source-fabric-workspace-id");
        opts.TargetFabricWorkspaceId = getArgValue("--target-fabric-workspace-id");

        opts.TargetServer = getArgValue("--target-server");
        // opts.TargetDatabase = getArgValue("--target-database");

        // opts.SqlPackagePath = getArgValue("--sqlpackage-path");
        // opts.MsBuildPath = getArgValue("--msbuild-path");

        // opts.ForceExtract = hasFlag("--force-extract");
        opts.Publish = args.Contains("--publish", StringComparer.OrdinalIgnoreCase);

        opts.BaseUrl = getArgValue("--base-url") ?? "https://api.fabric.microsoft.com/v1";

        var credential = new AzureCliCredential();

        var token = credential
            .GetToken(new TokenRequestContext(
                new[] { "https://database.windows.net/.default" }))
            .Token;

        opts.AccessToken = token;


        return opts;
    }
}
