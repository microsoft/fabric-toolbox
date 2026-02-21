using System.Net.Http.Headers;
using System.Text.Json;
using DaxPerformanceTuner.Library.Contracts;

namespace DaxPerformanceTuner.Library.Infrastructure;

/// <summary>
/// Thin wrapper around the Power BI REST API for workspace discovery.
/// Port of Python powerbi_api.py.
/// </summary>
public class PowerBIApiClient
{
    private const string ApiBase = "https://api.powerbi.com/v1.0/myorg";
    private readonly IAuthService _auth;
    private readonly HttpClient _httpClient;

    public PowerBIApiClient(IAuthService auth, HttpClient httpClient)
    {
        _auth = auth;
        _httpClient = httpClient;
    }

    public async Task<Dictionary<string, object>> ListWorkspacesAsync()
    {
        try
        {
            var token = await _auth.GetAccessTokenAsync();
            if (token == null)
                return Error("Authentication required – please sign in to Power BI");

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/groups");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await _httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return Error($"Failed to list workspaces: HTTP {(int)response.StatusCode}");

            var json = await response.Content.ReadAsStringAsync();
            var data = JsonDocument.Parse(json);
            var workspaces = data.RootElement.GetProperty("value").EnumerateArray()
                .Select(ws => new Dictionary<string, string?>
                {
                    ["name"] = ws.GetProperty("name").GetString(),
                    ["id"] = ws.GetProperty("id").GetString()
                }).ToList();

            return new Dictionary<string, object>
            {
                ["status"] = "success",
                ["workspaces"] = workspaces,
                ["message"] = $"Found {workspaces.Count} workspace(s)"
            };
        }
        catch (HttpRequestException ex)
        {
            return Error($"Network error while listing workspaces: {ex.Message}");
        }
        catch (Exception ex)
        {
            return Error($"Unexpected error listing workspaces: {ex.Message}");
        }
    }

    private static Dictionary<string, object> Error(string msg) =>
        new() { ["status"] = "error", ["error"] = msg };
}
