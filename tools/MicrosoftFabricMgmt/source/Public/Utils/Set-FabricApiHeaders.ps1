<#
.SYNOPSIS
Deprecated alias for Connect-FabricAccount.

.DESCRIPTION
`Set-FabricApiHeaders` is retained for backward compatibility. It forwards all
parameters to `Connect-FabricAccount` and emits a deprecation warning once per
PowerShell session. Use `Connect-FabricAccount` directly in new code.

.PARAMETER TenantId
The Azure Active Directory tenant (directory) GUID. Required for User Principal and Service Principal authentication.

.PARAMETER AppId
Client/Application ID (GUID) of the Azure AD application for service principal authentication.

.PARAMETER AppSecret
Secure string containing the client secret for service principal authentication.

.PARAMETER UseManagedIdentity
Switch to use Azure Managed Identity authentication.

.PARAMETER ClientId
Optional. Client ID for user-assigned managed identity.

.EXAMPLE
Set-FabricApiHeaders -TenantId "12345678-1234-1234-1234-123456789012"

Deprecated. Equivalent to Connect-FabricAccount -TenantId "...".

.OUTPUTS
None. Updates module-scoped authentication context.

.NOTES
Deprecated: Use Connect-FabricAccount. This wrapper warns once per session.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricApiHeaders {
    [CmdletBinding(DefaultParameterSetName = 'UserPrincipal', SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ParameterSetName = 'UserPrincipal')]
        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$TenantId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [System.Security.SecureString]$AppSecret,

        [Parameter(Mandatory = $true, ParameterSetName = 'ManagedIdentity')]
        [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', '', Justification='Parameter is used for parameter set binding')]
        [switch]$UseManagedIdentity,

        [Parameter(Mandatory = $false, ParameterSetName = 'ManagedIdentity')]
        [ValidateNotNullOrEmpty()]
        [string]$ClientId
    )

    Write-PSFMessage -Level Warning -Once 'MicrosoftFabricMgmt.SetFabricApiHeaders.Deprecation' -Message "Set-FabricApiHeaders is deprecated; use Connect-FabricAccount instead. (This warning shows once per session.)"

    Connect-FabricAccount @PSBoundParameters
}
