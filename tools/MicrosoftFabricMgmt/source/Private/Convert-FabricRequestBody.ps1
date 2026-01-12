<#
.SYNOPSIS
    Converts an object to JSON with consistent depth settings.

.DESCRIPTION
    This helper function standardizes JSON conversion across all public functions
    that send request bodies to the Fabric API. It uses the module's configured
    default depth to ensure consistent serialization.

.PARAMETER InputObject
    The object to convert to JSON.

.PARAMETER Depth
    Optional depth for JSON conversion. If not specified, uses the module's
    configured default depth from PSFramework configuration.

.OUTPUTS
    System.String
    Returns the JSON string representation of the input object.

.EXAMPLE
    $body = @{ displayName = "My Lakehouse"; description = "Test" }
    Convert-FabricRequestBody -InputObject $body

    Converts the hashtable to JSON with the default depth.

.EXAMPLE
    Convert-FabricRequestBody -InputObject $complexObject -Depth 15

    Converts the object to JSON with a custom depth of 15.

.NOTES
    This function eliminates inconsistent ConvertTo-Json depth usage across functions
    (which currently ranges from none specified to 10).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Convert-FabricRequestBody {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,

        [Parameter()]
        [int]$Depth
    )

    # Use provided depth or get from PSFramework configuration
    if (-not $Depth) {
        $Depth = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Json.DefaultDepth' -Fallback 10
    }

    Write-FabricLog -Message "Converting request body to JSON with depth: $Depth" -Level Debug

    try {
        $json = $InputObject | ConvertTo-Json -Depth $Depth -Compress

        # Log the JSON for debugging (truncate if very long)
        $logJson = if ($json.Length -gt 500) {
            "$($json.Substring(0, 500))... (truncated, length: $($json.Length))"
        } else {
            $json
        }
        Write-FabricLog -Message "Request body JSON: $logJson" -Level Debug

        return $json
    }
    catch {
        Write-FabricLog -Message "Failed to convert request body to JSON" -Level Error -ErrorRecord $_
        throw
    }
}
