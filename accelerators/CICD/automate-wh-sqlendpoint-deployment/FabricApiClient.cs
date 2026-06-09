using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutomateWarehouseProject;

/// <summary>
/// Represents an item in a Fabric workspace
/// </summary>
public class FabricItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("workspaceId")]
    public string WorkspaceId { get; set; } = string.Empty;

    [JsonPropertyName("folderId")]
    public string? FolderId { get; set; }
}

/// <summary>
/// Response from the Fabric Items API
/// </summary>
public class FabricItemsResponse
{
    [JsonPropertyName("value")]
    public FabricItem[] Value { get; set; } = Array.Empty<FabricItem>();

    [JsonPropertyName("continuationToken")]
    public string? ContinuationToken { get; set; }

    [JsonPropertyName("continuationUri")]
    public string? ContinuationUri { get; set; }
}

/// <summary>
/// Item information containing IDs from source and target workspaces and Type
/// </summary>
public class ItemInfo
{
    public string SourceId { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
}

/// <summary>
/// Result of warehouse and lakehouse identification analysis
/// </summary>
public class WarehouseIdentificationResult
{
    public Dictionary<string, ItemInfo> ItemsByName { get; set; } = new();
}

/// <summary>
/// Timeout configuration for SQL endpoint refresh
/// </summary>
public class TimeoutConfig
{
    [JsonPropertyName("timeUnit")]
    public string TimeUnit { get; set; } = "Minutes";

    [JsonPropertyName("value")]
    public int Value { get; set; } = 15;
}

/// <summary>
/// Request body for SQL endpoint refresh metadata
/// </summary>
public class SqlEndpointRefreshRequest
{
    [JsonPropertyName("timeout")]
    public TimeoutConfig Timeout { get; set; } = new();
}

/// <summary>
/// Client for interacting with Microsoft Fabric REST APIs
/// </summary>
public class FabricApiClient : IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private bool _disposed = false;

    public FabricApiClient(string BaseUrl)
    {
        _baseUrl = BaseUrl;
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        
        // Get Fabric-scoped token
        var fabricToken = GetFabricToken();
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fabricToken);
    }

    private static string GetFabricToken()
    {
        try
        {
            var credential = new Azure.Identity.AzureCliCredential();
            var token = credential.GetToken(new Azure.Core.TokenRequestContext(
                new[] { "https://api.fabric.microsoft.com/.default" })).Token;
            return token;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Failed to get Fabric API token: {ex.Message}");
            Console.WriteLine("Make sure you're logged in with 'az login' and have the necessary Fabric permissions.");
            throw;
        }
    }

    /// <summary>
    /// Lists warehouses and SQL endpoints in source and optionally target workspaces
    /// </summary>
    /// <param name="sourceWorkspaceId">The source Fabric workspace ID</param>
    /// <param name="targetWorkspaceId">The target Fabric workspace ID (optional)</param>
    /// <param name="recursive">Whether to include items in nested folders (default: true)</param>
    /// <returns>Analysis result containing warehouses and SQL endpoints with source and target IDs</returns>
    public async Task<WarehouseIdentificationResult> ScanWorkspaceForWarehouseTypes(
        string sourceWorkspaceId, 
        string? targetWorkspaceId = null,
        bool recursive = true)
    {
        Console.WriteLine($"🔍 Analyzing Fabric workspaces for warehouses and SQL endpoints");
        Console.WriteLine($"   Source workspace: {sourceWorkspaceId}");
        if (!string.IsNullOrEmpty(targetWorkspaceId))
        {
            Console.WriteLine($"   Target workspace: {targetWorkspaceId}");
        }
        Console.WriteLine($"   Recursive search: {recursive}");
        
        var result = new WarehouseIdentificationResult();
        
        // Get all items from source workspace
        Console.WriteLine($"   Scanning source workspace...");
        var sourceItems = await GetAllItemsInWorkspace(sourceWorkspaceId, null, recursive);
        
        // Filter source items by type
        var sourceRelevantItems = sourceItems.Where(item => 
            item.Type.Equals("Warehouse", StringComparison.OrdinalIgnoreCase) ||
            item.Type.Equals("SQLEndpoint", StringComparison.OrdinalIgnoreCase)
        ).ToList();
        
        // Create initial dictionary with source items
        result.ItemsByName = sourceRelevantItems.ToDictionary(
            item => item.DisplayName,
            item => new ItemInfo { SourceId = item.Id, Type = item.Type },
            StringComparer.OrdinalIgnoreCase
        );
        
        // Get target workspace items if target workspace is provided
        List<FabricItem> targetRelevantItems;
        if (!string.IsNullOrEmpty(targetWorkspaceId))
        {
            Console.WriteLine($"   Scanning target workspace...");
            var targetItems = await GetAllItemsInWorkspace(targetWorkspaceId, null, recursive);
            
            targetRelevantItems = targetItems.Where(item => 
                item.Type.Equals("Warehouse", StringComparison.OrdinalIgnoreCase) ||
                item.Type.Equals("SQLEndpoint", StringComparison.OrdinalIgnoreCase)
            ).ToList();
            
            // Merge target items with source items
            foreach (var targetItem in targetRelevantItems)
            {
                if (result.ItemsByName.TryGetValue(targetItem.DisplayName, out var existingItem))
                {
                    // Update existing item with target ID
                    existingItem.TargetId = targetItem.Id;
                }
                else
                {
                    // Add new item that only exists in target
                    result.ItemsByName[targetItem.DisplayName] = new ItemInfo 
                    { 
                        TargetId = targetItem.Id, 
                        Type = targetItem.Type 
                    };
                }
            }
        }
       
        return result;
    }

    /// <summary>
    /// Gets all items in a workspace, handling pagination automatically
    /// </summary>
    /// <param name="workspaceId">The Fabric workspace ID</param>
    /// <param name="itemType">Optional: filter by specific item type</param>
    /// <param name="recursive">Whether to include items in nested folders</param>
    /// <returns>Complete list of all items in the workspace</returns>
    public async Task<List<FabricItem>> GetAllItemsInWorkspace(
        string workspaceId, 
        string? itemType = null, 
        bool recursive = true)
    {
        var allItems = new List<FabricItem>();
        string? continuationToken = null;

        do
        {
            var response = await GetItemsPage(workspaceId, itemType, recursive, continuationToken);
            
            if (response?.Value != null)
            {
                allItems.AddRange(response.Value);
                Console.WriteLine($"   Retrieved {response.Value.Length} items (Total so far: {allItems.Count})");
            }
            
            continuationToken = response?.ContinuationToken;
            
        } while (!string.IsNullOrEmpty(continuationToken));

        return allItems;
    }

    /// <summary>
    /// Gets a single page of items from the Fabric workspace
    /// </summary>
    private async Task<FabricItemsResponse?> GetItemsPage(
        string workspaceId, 
        string? itemType, 
        bool recursive, 
        string? continuationToken)
    {
        var queryParams = new List<string>();
        
        if (!string.IsNullOrEmpty(itemType))
        {
            queryParams.Add($"type={Uri.EscapeDataString(itemType)}");
        }
        
        queryParams.Add($"recursive={recursive.ToString().ToLower()}");
        
        if (!string.IsNullOrEmpty(continuationToken))
        {
            queryParams.Add($"continuationToken={Uri.EscapeDataString(continuationToken)}");
        }

        var queryString = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : "";
        var requestUri = $"{_baseUrl}/workspaces/{workspaceId}/items{queryString}";

        try
        {
            var response = await _httpClient.GetAsync(requestUri);
            
            if (response.IsSuccessStatusCode)
            {
                var jsonOptions = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                };
                
                return await response.Content.ReadFromJsonAsync<FabricItemsResponse>(jsonOptions);
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"❌ API Error: {response.StatusCode} - {response.ReasonPhrase}");
                Console.WriteLine($"   Error details: {errorContent}");
                throw new HttpRequestException($"Failed to get items from workspace {workspaceId}: {response.StatusCode} - {response.ReasonPhrase}");
            }
        }
        catch (HttpRequestException)
        {
            throw;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Unexpected error calling Fabric API: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Refreshes SQL endpoint metadata and waits for completion
    /// </summary>
    /// <param name="workspaceId">The Fabric workspace ID</param>
    /// <param name="sqlEndpointId">The SQL endpoint item ID</param>
    /// <param name="sqlEndpointName">The SQL endpoint display name (for logging)</param>
    /// <returns>True if refresh completed successfully</returns>
    public async Task<bool> RefreshSqlEndpointAndWait(string workspaceId, string sqlEndpointId, string sqlEndpointName)
    {
        Console.WriteLine($"🔄 Refreshing SQL endpoint metadata: {sqlEndpointName}");
                
        try
        {
            // Prepare request body with timeout configuration
            var requestBody = new SqlEndpointRefreshRequest
            {
                Timeout = new TimeoutConfig
                {
                    TimeUnit = "Minutes",
                    Value = 15
                }
            };
            
            // Debug: Log the request details
            Console.WriteLine($"   Request URL: {_baseUrl}/workspaces/{workspaceId}/sqlEndpoints/{sqlEndpointId}/refreshMetadata");
            Console.WriteLine($"   SQL Endpoint ID: {sqlEndpointId}");
            Console.WriteLine($"   Workspace ID: {workspaceId}");
            
            // Start the refresh
            var refreshUri = $"{_baseUrl}/workspaces/{workspaceId}/sqlEndpoints/{sqlEndpointId}/refreshMetadata";
            
            var jsonContent = JsonSerializer.Serialize(requestBody, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            Console.WriteLine($"   Request body: {jsonContent}");
            
            var refreshResponse = await _httpClient.PostAsJsonAsync(refreshUri, requestBody);
            
            Console.WriteLine($"   Response status: {refreshResponse.StatusCode}");
            
            // Handle different status codes appropriately
            switch (refreshResponse.StatusCode)
            {
                case System.Net.HttpStatusCode.OK: // 200 - Operation completed synchronously
                    Console.WriteLine($"✅ SQL endpoint refresh completed successfully (synchronous)");
                    return true;
                
                case System.Net.HttpStatusCode.Accepted: // 202 - Operation accepted, need to poll for completion
                    Console.WriteLine($"✅ SQL endpoint refresh started (asynchronous). Monitoring progress...");
                    
                    // Extract operation ID from Location header
                    var locationHeader = refreshResponse.Headers.Location?.ToString();
                    if (string.IsNullOrEmpty(locationHeader))
                    {
                        Console.WriteLine("❌ No Location header returned from async refresh request");
                        return false;
                    }
                    
                    Console.WriteLine($"   Polling URL: {locationHeader}");
                    
                    // Poll for completion
                    return await WaitForOperationCompletion(locationHeader, sqlEndpointName);
                
                default: // All other status codes are errors
                    var errorContent = await refreshResponse.Content.ReadAsStringAsync();
                    Console.WriteLine($"❌ Failed to start SQL endpoint refresh: {refreshResponse.StatusCode} - {refreshResponse.ReasonPhrase}");
                    Console.WriteLine($"   Error details: {errorContent}");
                    return false;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Error refreshing SQL endpoint {sqlEndpointName}: {ex.Message}");
            return false;
        }
    }
    
    /// <summary>
    /// Waits for a long-running operation to complete by polling the status
    /// </summary>
    /// <param name="operationUri">The operation URI to poll</param>
    /// <param name="operationName">Name for logging purposes</param>
    /// <returns>True if operation completed successfully</returns>
    private async Task<bool> WaitForOperationCompletion(string operationUri, string operationName)
    {
        var maxWaitTime = TimeSpan.FromMinutes(10); // Maximum wait time
        var pollInterval = TimeSpan.FromSeconds(5); // Poll every 5 seconds
        var startTime = DateTime.UtcNow;
        
        Console.WriteLine($"   Polling operation status every {pollInterval.TotalSeconds} seconds...");
        
        while (DateTime.UtcNow - startTime < maxWaitTime)
        {
            try
            {
                var statusResponse = await _httpClient.GetAsync(operationUri);
                
                if (statusResponse.IsSuccessStatusCode)
                {
                    var statusContent = await statusResponse.Content.ReadAsStringAsync();
                    var statusJson = JsonDocument.Parse(statusContent);
                    
                    if (statusJson.RootElement.TryGetProperty("status", out var statusElement))
                    {
                        var status = statusElement.GetString();
                        Console.WriteLine($"   Operation status: {status}");
                        
                        switch (status?.ToLower())
                        {
                            case "succeeded":
                                Console.WriteLine($"✅ {operationName} refresh completed successfully");
                                return true;
                            
                            case "failed":
                                Console.WriteLine($"❌ {operationName} refresh failed");
                                if (statusJson.RootElement.TryGetProperty("error", out var errorElement))
                                {
                                    Console.WriteLine($"   Error: {errorElement}");
                                }
                                return false;
                            
                            case "running":
                            case "inprogress":
                                // Continue polling
                                break;
                            
                            default:
                                Console.WriteLine($"⚠️  Unknown status: {status}");
                                break;
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"⚠️  Failed to get operation status: {statusResponse.StatusCode}");
                }
                
                // Wait before next poll
                await Task.Delay(pollInterval);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️  Error polling operation status: {ex.Message}");
                await Task.Delay(pollInterval);
            }
        }
        
        Console.WriteLine($"❌ Operation timeout after {maxWaitTime.TotalMinutes} minutes");
        return false;
    }

  
    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposed && disposing)
        {
            _httpClient?.Dispose();
            _disposed = true;
        }
    }
}