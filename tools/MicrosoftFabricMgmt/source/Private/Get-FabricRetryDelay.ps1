<#
.SYNOPSIS
    Computes the number of seconds to wait before retrying a transient API failure.

.DESCRIPTION
    Honors an API-provided Retry-After header when present; otherwise falls back to
    exponential backoff with sub-second jitter. The result is clamped to a sane range
    so a missing, zero, or hostile Retry-After value cannot hang the caller.

    This logic is factored out of Invoke-FabricAPIRequest so it can be unit tested
    directly (the backoff path previously threw an OverflowException).

.PARAMETER ResponseHeader
    Optional hashtable of response headers. If it contains a 'Retry-After' entry
    (int or single-element array), that value is used.

.PARAMETER RetryCount
    The current retry attempt number (1-based), used for the exponential backoff exponent.

.PARAMETER BackoffMultiplier
    Base for the exponential backoff (delay = BackoffMultiplier ^ RetryCount). Default 2.

.PARAMETER MaxDelaySeconds
    Upper clamp for the returned delay. Default 120.

.OUTPUTS
    System.Int32 - seconds to wait (>= 1, <= MaxDelaySeconds).
#>
function Get-FabricRetryDelay {
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [Parameter()]
        [hashtable]$ResponseHeader,

        [Parameter(Mandatory = $true)]
        [int]$RetryCount,

        [Parameter()]
        [int]$BackoffMultiplier = 2,

        [Parameter()]
        [int]$MaxDelaySeconds = 120
    )

    # Use $null check (not truthiness) so an explicit Retry-After of 0 is honored (then clamped).
    $delay = if ($ResponseHeader -and $null -ne $ResponseHeader['Retry-After']) {
        $retryAfterValue = $ResponseHeader['Retry-After']
        if ($retryAfterValue -is [array]) { [int]$retryAfterValue[0] } else { [int]$retryAfterValue }
    }
    else {
        # Exponential backoff with sub-second jitter.
        # NOTE: do NOT seed Get-Random with (Get-Date).Ticks - casting the Int64 tick
        # count to [int] overflows and throws, which previously broke this path.
        $baseDelay = [Math]::Pow($BackoffMultiplier, $RetryCount)
        $jitterSeconds = (Get-Random -Minimum 0 -Maximum 1000) / 1000.0
        [int][Math]::Ceiling($baseDelay + $jitterSeconds)
    }

    # Clamp so a missing/zero/hostile Retry-After can't hang (or busy-loop) the caller.
    if ($delay -lt 1) { $delay = 1 }
    if ($delay -gt $MaxDelaySeconds) { $delay = $MaxDelaySeconds }

    return $delay
}
