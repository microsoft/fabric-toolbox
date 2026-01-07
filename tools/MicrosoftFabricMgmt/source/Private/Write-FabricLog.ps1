<#
.SYNOPSIS
Module-specific logging wrapper around PSFramework's Write-PSFMessage.

.DESCRIPTION
The `Write-FabricLog` function provides a simplified logging interface for the MicrosoftFabricMgmt module.
It wraps PSFramework's Write-PSFMessage with sensible defaults and automatic function name detection.

.PARAMETER Message
The message to log.

.PARAMETER Level
The log level. Maps to PSFramework levels:
- Host: Informational messages (default)
- Debug: Debug information
- Verbose: Verbose details
- Warning: Warning messages
- Error: Error messages
- Critical: Critical errors

.PARAMETER ErrorRecord
Optional error record to attach (automatically attached for Error level).

.PARAMETER Data
Optional structured data to include with the log message.

.PARAMETER Tag
Optional tags for filtering log messages.

.EXAMPLE
Write-FabricLog -Message "Processing workspace" -Level Host

Logs an informational message.

.EXAMPLE
Write-FabricLog -Message "API call failed" -Level Error -ErrorRecord $_

Logs an error with the error record attached.

.EXAMPLE
Write-FabricLog -Message "Workspace created" -Level Host -Data @{ WorkspaceId = $id }

Logs a message with structured data.

.OUTPUTS
None. Writes to PSFramework logging system.

.NOTES
This is an internal helper function for consistent logging throughout the module.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07
#>
function Write-FabricLog {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $false)]
        [ValidateSet('Host', 'Debug', 'Verbose', 'Warning', 'Error', 'Critical')]
        [string]$Level = 'Host',

        [Parameter(Mandatory = $false)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord,

        [Parameter(Mandatory = $false)]
        [hashtable]$Data,

        [Parameter(Mandatory = $false)]
        [string[]]$Tag
    )

    # Get calling function name for context (2 levels up: Write-FabricLog -> caller)
    $callerInfo = (Get-PSCallStack)[1]
    $functionName = if ($callerInfo.Command) { $callerInfo.Command } else { '<ScriptBlock>' }

    # Build PSFramework message parameters
    $psfParams = @{
        Message      = $Message
        Level        = $Level
        FunctionName = $functionName
        ModuleName   = 'MicrosoftFabricMgmt'
    }

    # Add error record if provided or if level is Error
    if ($ErrorRecord) {
        $psfParams.ErrorRecord = $ErrorRecord
    }

    # Add structured data if provided
    if ($Data) {
        $psfParams.Data = $Data
    }

    # Add tags if provided
    if ($Tag) {
        $psfParams.Tag = $Tag
    }

    # Write to PSFramework logging system
    Write-PSFMessage @psfParams
}
