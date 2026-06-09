using System.Data;
using Microsoft.Data.SqlClient;

namespace AutomateWarehouseProject;

// -------------------------------------------------------------
// Warehouse Dependency Analyzer
// -------------------------------------------------------------
public static class WarehouseDependencyAnalyzer
{
    public static async Task<DependencyAnalysisResult> AnalyzeDependencies(string serverName, string sourceWarehouse, string accessToken)
    {
        var dependencyChain = await BuildFullDependencyChain(serverName, sourceWarehouse, accessToken);
        var cyclicDependencies = DetectCyclicDependencies(dependencyChain);
        
        return new DependencyAnalysisResult
        {
            SourceWarehouse = sourceWarehouse,
            DependencyChain = dependencyChain,
            CyclicDependencies = cyclicDependencies,
            HasCyclicDependencies = cyclicDependencies.Count > 0
        };
    }

    private static async Task<Dictionary<string, HashSet<string>>> BuildFullDependencyChain(string serverName, string sourceWarehouse, string accessToken)
    {
        var allDependencies = new Dictionary<string, HashSet<string>>();
        var warehousesToProcess = new Queue<string>();
        var processedWarehouses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        warehousesToProcess.Enqueue(sourceWarehouse);

        while (warehousesToProcess.Count > 0)
        {
            var currentWarehouse = warehousesToProcess.Dequeue();
            
            if (processedWarehouses.Contains(currentWarehouse))
                continue;

            Console.WriteLine($"Analyzing dependencies for warehouse: {currentWarehouse}");
            
            var dependencies = await GetWarehouseDependencies(serverName, currentWarehouse, accessToken);
            allDependencies[currentWarehouse] = dependencies;
            processedWarehouses.Add(currentWarehouse);

            // Add newly discovered warehouses to the processing queue
            foreach (var dependency in dependencies)
            {
                if (!processedWarehouses.Contains(dependency) && !warehousesToProcess.Contains(dependency))
                {
                    warehousesToProcess.Enqueue(dependency);
                }
            }

            if (dependencies.Count > 0)
            {
                Console.WriteLine($"  Found dependencies: {string.Join(", ", dependencies)}");
            }
            else
            {
                Console.WriteLine("  No dependencies found");
            }
        }

        return allDependencies;
    }

    private static async Task<HashSet<string>> GetWarehouseDependencies(string serverName, string warehouseName, string accessToken)
    {
        var dependencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Simple query using sys.sql_expression_dependencies
        var query = @"
            SELECT 
                OBJECT_NAME(referencing_id) AS ReferencingObject,
                referenced_database_name AS ExternalWarehouse,
                referenced_schema_name,
                referenced_entity_name
            FROM sys.sql_expression_dependencies
            WHERE referenced_database_name IS NOT NULL  -- Filters to cross-warehouse only
            ORDER BY ReferencingObject";

        try
        {
            // Build connection string for the specific warehouse using access token
            var connectionString = $"Server={serverName};Database={warehouseName};";

            using var connection = new SqlConnection(connectionString)
            {
                AccessToken = accessToken
            };
            await connection.OpenAsync();

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();
            
            while (await reader.ReadAsync())
            {
                var referencingObject = reader.GetString("ReferencingObject");
                var externalWarehouse = reader.GetString("ExternalWarehouse");
                var schemaName = reader.IsDBNull("referenced_schema_name") ? "dbo" : reader.GetString("referenced_schema_name");
                var entityName = reader.IsDBNull("referenced_entity_name") ? "" : reader.GetString("referenced_entity_name");
                
                dependencies.Add(externalWarehouse);
                Console.WriteLine($"  {referencingObject} -> {externalWarehouse}.{schemaName}.{entityName}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Could not analyze dependencies for warehouse '{warehouseName}': {ex.Message}");
            // Return empty dependencies for warehouses we can't access
        }

        return dependencies;
    }

    private static List<CyclicDependency> DetectCyclicDependencies(Dictionary<string, HashSet<string>> dependencyChain)
    {
        var cycles = new List<CyclicDependency>();
        var visited = new HashSet<string>();
        var recursionStack = new HashSet<string>();

        foreach (var warehouse in dependencyChain.Keys)
        {
            if (!visited.Contains(warehouse))
            {
                var path = new List<string>();
                DetectCyclicDependenciesRecursive(warehouse, dependencyChain, visited, recursionStack, path, cycles);
            }
        }

        return cycles;
    }

    private static void DetectCyclicDependenciesRecursive(
        string warehouse, 
        Dictionary<string, HashSet<string>> dependencyChain,
        HashSet<string> visited,
        HashSet<string> recursionStack,
        List<string> path,
        List<CyclicDependency> cycles)
    {
        visited.Add(warehouse);
        recursionStack.Add(warehouse);
        path.Add(warehouse);

        if (dependencyChain.TryGetValue(warehouse, out var dependencies))
        {
            foreach (var dependency in dependencies)
            {
                if (!visited.Contains(dependency))
                {
                    DetectCyclicDependenciesRecursive(dependency, dependencyChain, visited, recursionStack, path, cycles);
                }
                else if (recursionStack.Contains(dependency))
                {
                    // Found a cycle
                    var cycleStart = path.IndexOf(dependency);
                    var cyclePath = path.Skip(cycleStart).Concat(new[] { dependency }).ToList();
                    cycles.Add(new CyclicDependency
                    {
                        CyclePath = cyclePath,
                        Description = string.Join(" -> ", cyclePath)
                    });
                }
            }
        }

        path.RemoveAt(path.Count - 1);
        recursionStack.Remove(warehouse);
    }
}

// -------------------------------------------------------------
// Result Models
// -------------------------------------------------------------
public class DependencyAnalysisResult
{
    public required string SourceWarehouse { get; init; }
    public required Dictionary<string, HashSet<string>> DependencyChain { get; init; }
    public required List<CyclicDependency> CyclicDependencies { get; init; }
    public required bool HasCyclicDependencies { get; init; }

    public void PrintAnalysisResults()
    {
        Console.WriteLine("\n=== DEPENDENCY ANALYSIS RESULTS ===");
        Console.WriteLine($"Source Warehouse: {SourceWarehouse}");
        Console.WriteLine($"Total Warehouses in Chain: {DependencyChain.Count}");
        
        Console.WriteLine("\n--- Dependency Chain ---");
        foreach (var warehouse in DependencyChain.Keys.OrderBy(x => x))
        {
            var deps = DependencyChain[warehouse];
            if (deps.Count > 0)
            {
                Console.WriteLine($"{warehouse} -> [{string.Join(", ", deps.OrderBy(x => x))}]");
            }
            else
            {
                Console.WriteLine($"{warehouse} -> [no dependencies]");
            }
        }

        if (HasCyclicDependencies)
        {
            Console.WriteLine("\n❌ CYCLIC DEPENDENCIES DETECTED:");
            foreach (var cycle in CyclicDependencies)
            {
                Console.WriteLine($"  🔄 {cycle.Description}");
            }
            Console.WriteLine("\nProcess cannot continue with cyclic dependencies!");
        }
        else
        {
            Console.WriteLine("\n✅ No cyclic dependencies found. Safe to proceed.");
        }
    }

    public List<string> GetProcessingOrder()
    {
        if (HasCyclicDependencies)
            throw new InvalidOperationException("Cannot determine processing order when cyclic dependencies exist.");

        // Topological sort to determine processing order
        var inDegree = new Dictionary<string, int>();
        var allWarehouses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Collect all warehouses (both keys and their dependencies)
        foreach (var (warehouse, dependencies) in DependencyChain)
        {
            allWarehouses.Add(warehouse);
            foreach (var dependency in dependencies)
            {
                allWarehouses.Add(dependency);
            }
        }

        // Initialize in-degree count for all warehouses
        foreach (var warehouse in allWarehouses)
        {
            inDegree[warehouse] = 0;
        }

        // Calculate in-degrees: count dependencies for each warehouse
        foreach (var (warehouse, dependencies) in DependencyChain)
        {
            inDegree[warehouse] = dependencies.Count;
        }

        // Topological sort
        var queue = new Queue<string>();
        var result = new List<string>();

        // Start with warehouses that have no dependencies (in-degree = 0)
        foreach (var (warehouse, degree) in inDegree)
        {
            if (degree == 0)
            {
                queue.Enqueue(warehouse);
            }
        }

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            result.Add(current);

            // For each warehouse that depends on the current one, reduce its in-degree
            foreach (var (warehouse, dependencies) in DependencyChain)
            {
                if (dependencies.Contains(current))
                {
                    inDegree[warehouse]--;
                    if (inDegree[warehouse] == 0)
                    {
                        queue.Enqueue(warehouse);
                    }
                }
            }
        }

        // Verify all warehouses are included
        if (result.Count != allWarehouses.Count)
        {
            var missing = allWarehouses.Except(result).ToList();
            throw new InvalidOperationException($"Topological sort failed. Missing warehouses: {string.Join(", ", missing)}");
        }

        return result;
    }
}

public class CyclicDependency
{
    public required List<string> CyclePath { get; init; }
    public required string Description { get; init; }
}