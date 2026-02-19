using Microsoft.Extensions.Logging;
using Microsoft.Identity.Client;
using DaxPerformanceTuner.Library.Contracts;

namespace DaxPerformanceTuner.Library.Infrastructure;

/// <summary>
/// Azure AD authentication via MSAL.NET PublicClientApplication.
/// Port of Python auth.py — supports interactive browser + silent token refresh.
/// </summary>
public class AuthService : IAuthService
{
    private readonly IPublicClientApplication _app;
    private readonly string[] _scopes;
    private readonly int _tokenRefreshBufferSeconds;
    private readonly ILogger<AuthService> _logger;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    private string? _accessToken;
    private DateTimeOffset? _tokenExpiry;

    /// <summary>
    /// Known error patterns that indicate an auth failure requiring re-authentication.
    /// </summary>
    private static readonly string[] AuthErrorPatterns =
    [
        "DMTS_OAuthTokenRefreshFailedError",
        "refresh token has expired",
        "AADSTS700082",
        "token was issued",
        "inactive for",
        "Authentication failed",
        "access token",
        "token has expired",
        "AADSTS700084",
        "token is invalid"
    ];

    public AuthService(DaxPerformanceTunerConfig config, ILogger<AuthService> logger)
    {
        _scopes = config.Scopes;
        _tokenRefreshBufferSeconds = config.TokenRefreshBufferSeconds;
        _logger = logger;

        _app = PublicClientApplicationBuilder
            .Create(config.ClientId)
            .WithAuthority(config.Authority)
            .WithDefaultRedirectUri()
            .Build();
    }

    public bool HasCachedToken => _accessToken != null && !IsTokenExpired();

    public async Task<string?> GetAccessTokenAsync()
    {
        await _tokenLock.WaitAsync();
        try
        {
            if (!IsTokenExpired())
                return _accessToken;

            // Try silent first
            var result = await TrySilentTokenAcquisitionAsync();
            if (UpdateTokenCache(result))
                return _accessToken;

            // Fall back to interactive
            return await AcquireTokenInteractiveInternalAsync("select_account");
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    public async Task<string?> AcquireTokenInteractiveAsync()
    {
        await _tokenLock.WaitAsync();
        try
        {
            // Clear existing token
            _accessToken = null;
            _tokenExpiry = null;

            // Try silent first
            var result = await TrySilentTokenAcquisitionAsync();
            if (UpdateTokenCache(result))
                return _accessToken;

            // Remove cached accounts and force login
            var accounts = await _app.GetAccountsAsync();
            foreach (var account in accounts)
            {
                await _app.RemoveAsync(account);
            }

            return await AcquireTokenInteractiveInternalAsync("login");
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    /// <summary>
    /// Check if an error message indicates an authentication failure.
    /// </summary>
    public static bool IsAuthError(string errorMessage)
    {
        var lower = errorMessage.ToLowerInvariant();
        return AuthErrorPatterns.Any(p => lower.Contains(p.ToLowerInvariant()));
    }

    private bool IsTokenExpired()
    {
        return _accessToken == null
            || _tokenExpiry == null
            || DateTimeOffset.UtcNow >= _tokenExpiry.Value.AddSeconds(-_tokenRefreshBufferSeconds);
    }

    private async Task<AuthenticationResult?> TrySilentTokenAcquisitionAsync()
    {
        try
        {
            var accounts = await _app.GetAccountsAsync();
            foreach (var account in accounts)
            {
                try
                {
                    var result = await _app.AcquireTokenSilent(_scopes, account).ExecuteAsync();
                    if (result?.AccessToken != null)
                        return result;
                }
                catch (MsalUiRequiredException)
                {
                    // Expected — need interactive auth
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Silent token acquisition failed");
        }

        return null;
    }

    private async Task<string?> AcquireTokenInteractiveInternalAsync(string prompt)
    {
        try
        {
            var builder = _app.AcquireTokenInteractive(_scopes);

            if (prompt == "login")
                builder = builder.WithPrompt(Prompt.ForceLogin);
            else
                builder = builder.WithPrompt(Prompt.SelectAccount);

            var result = await builder.ExecuteAsync();
            if (UpdateTokenCache(result))
                return _accessToken;
        }
        catch (MsalClientException ex) when (ex.ErrorCode == "authentication_canceled")
        {
            _logger.LogWarning("User cancelled authentication");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Interactive authentication failed");
        }

        return null;
    }

    private bool UpdateTokenCache(AuthenticationResult? result)
    {
        if (result?.AccessToken == null)
            return false;

        _accessToken = result.AccessToken;
        _tokenExpiry = result.ExpiresOn;
        _logger.LogDebug("Token acquired, expires at {ExpiresOn}", result.ExpiresOn);
        return true;
    }
}
