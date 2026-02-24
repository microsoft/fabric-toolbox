namespace DaxPerformanceTuner.Library.Contracts;

/// <summary>
/// Provides Azure AD authentication tokens for XMLA and Power BI API access.
/// </summary>
public interface IAuthService
{
    /// <summary>
    /// Get a valid access token, refreshing silently if needed.
    /// Returns null if no token is available and interactive auth hasn't been performed.
    /// </summary>
    Task<string?> GetAccessTokenAsync();

    /// <summary>
    /// Force an interactive authentication flow.
    /// </summary>
    Task<string?> AcquireTokenInteractiveAsync();

}
