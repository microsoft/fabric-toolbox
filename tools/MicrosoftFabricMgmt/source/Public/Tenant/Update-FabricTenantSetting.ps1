<#
.SYNOPSIS
Updates a Fabric tenant setting.

.DESCRIPTION
Posts an update to a specific tenant setting using its internal name. You can enable/disable the setting, optionally delegate control to capacities, domains, or workspaces (when supported), and include or exclude specific security groups. Some settings also accept additional property objects.

.PARAMETER TenantSettingName
Mandatory. Internal name/key for the tenant setting being modified. Used to compose the API route.

.PARAMETER EnableTenantSetting
Mandatory. Enables ($true) or disables ($false) the tenant setting.

.PARAMETER DelegateToCapacity
Optional. When $true, allows capacity-level delegation for this setting (if applicable).

.PARAMETER DelegateToDomain
Optional. When $true, allows domain-level delegation for this setting (if applicable).

.PARAMETER DelegateToWorkspace
Optional. When $true, allows workspace-level delegation for this setting (if applicable).

.PARAMETER EnabledSecurityGroups
Optional. Array of security group objects that are explicitly allowed. Each object must contain 'graphId' and 'name'.

.PARAMETER ExcludedSecurityGroups
Optional. Array of security group objects that are explicitly excluded. Each object must contain 'graphId' and 'name'.

.PARAMETER Properties
Optional. Array of advanced property objects for certain settings. Each object must include 'name', 'type', and 'value'.

.EXAMPLE
Update-FabricTenantSetting -TenantSettingName "SomeSetting" -EnableTenantSetting $true -EnabledSecurityGroups @(@{graphId="1";name="Group1"})

Enables the setting and includes a single security group by graphId.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>

function Update-FabricTenantSetting {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TenantSettingName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$EnableTenantSetting,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToCapacity,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToDomain,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToWorkspace,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$EnabledSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$ExcludedSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Properties
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Validate Security Groups if provided
        if ($EnabledSecurityGroups) {
            foreach ($enabledGroup in $EnabledSecurityGroups) {
                if (-not ($enabledGroup.PSObject.Properties.Name -contains 'graphId' -and $enabledGroup.PSObject.Properties.Name -contains 'name')) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties."
                }
            }
        }

        if ($ExcludedSecurityGroups) {
            foreach ($excludedGroup in $ExcludedSecurityGroups) {
                if (-not ($excludedGroup.PSObject.Properties.Name -contains 'graphId' -and $excludedGroup.PSObject.Properties.Name -contains 'name')) {
                    throw "Each excluded security group must contain 'graphId' and 'name' properties."
                }
            }
        }

        # Validate Security Groups if provided
        if ($Properties) {
            foreach ($property in $Properties) {
                if (-not ($property.PSObject.Properties.Name -contains 'name' -and $property.PSObject.Properties.Name -contains 'type' -and $property.PSObject.Properties.Name -contains 'value')) {
                    throw "Each property object must include 'name', 'type', and 'value' properties to be valid."
                }
            }
        }

        # Construct API endpoint URL
        $apiEndpointURI = "{0}/admin/tenantsettings/{1}/update" -f $script:FabricAuthContext.BaseUrl, $TenantSettingName
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Construct request body
        $body = @{
            EnableTenantSetting = $EnableTenantSetting
        }

        if ($DelegateToCapacity) {
            $body.delegateToCapacity = $DelegateToCapacity
        }

        if ($DelegateToDomain) {
            $body.delegateToDomain = $DelegateToDomain
        }

        if ($DelegateToWorkspace) {
            $body.delegateToWorkspace = $DelegateToWorkspace
        }

        if ($EnabledSecurityGroups) {
            $body.enabledSecurityGroups = $EnabledSecurityGroups
        }

        if ($ExcludedSecurityGroups) {
            $body.excludedSecurityGroups = $ExcludedSecurityGroups
        }

        if ($Properties) {
            $body.properties = $Properties
        }

        # Convert body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 5
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Invoke Fabric API request
        if ($PSCmdlet.ShouldProcess("tenant setting '$TenantSettingName'", "Update tenant setting")) {
            $response = Invoke-FabricAPIRequest `
                -BaseURI $apiEndpointURI `
                -Headers $script:FabricAuthContext.FabricHeaders `
                -Method Post `
                -Body $bodyJson

            # Return the API response
            Write-FabricLog -Message "Successfully updated tenant setting." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error updating tenant settings: $errorDetails" -Level Error
    }
}
