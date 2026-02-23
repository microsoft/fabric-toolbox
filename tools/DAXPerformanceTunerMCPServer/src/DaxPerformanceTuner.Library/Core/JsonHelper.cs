using System.Text.Json;

namespace DaxPerformanceTuner.Library.Core;

/// <summary>
/// Shared JSON serialization helpers used across all services and tools.
/// Centralizes the common WriteIndented serialization pattern and error response formatting.
/// </summary>
public static class JsonHelper
{
    private static readonly JsonSerializerOptions _options = new() { WriteIndented = true };

    /// <summary>
    /// Serialize an object to indented JSON.
    /// </summary>
    public static string Serialize(object obj) => JsonSerializer.Serialize(obj, _options);

    /// <summary>
    /// Create a standard JSON error response: { "status": "error", "error": "message" }
    /// </summary>
    public static string ErrorJson(string msg) => Serialize(new { status = "error", error = msg });
}
