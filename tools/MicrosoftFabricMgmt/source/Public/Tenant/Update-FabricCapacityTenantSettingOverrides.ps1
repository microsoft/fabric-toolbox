<#
.SYNOPSIS
Updates tenant setting overrides for a specified capacity ID.

.DESCRIPTION
The `Update-FabricCapacityTena        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParamstingOverrides` function updates tenant setting overrides in a Fabric environment by making a POST request to the appropriate API endpoint. It allows specifying settings such as enabling tenant settings, delegating to a workspace, and including or excluding security groups.

.PARAMETER CapacityId
(Mandatory) The ID of the capacity for which the tenant setting overrides are being updated.

.PARAMETER SettingTitle
(Mandatory) The title of the tenant setting to be updated.

.PARAMETER EnableTenantSetting
(Mandatory) Indicates whether the tenant setting should be enabled.

.PARAMETER DelegateToWorkspace
(Optional) Specifies the workspace to which the setting should be delegated.

.PARAMETER EnabledSecurityGroups
(Optional) A JSON array of security groups to be enabled, each containing `graphId` and `name` properties.

.PARAMETER ExcludedSecurityGroups
(Optional) A JSON array of security groups to be excluded, each containing `graphId` and `name` properties.

.EXAMPLE
Update-FabricCapacityTenantSettingOverrides -CapacityId "12345" -SettingTitle "SomeSetting" -EnableTenantSetting "true"

Updates the tenant setting "SomeSetting" for the capacity with ID "12345" and enables it.

.EXAMPLE
Update-FabricCapacityTenantSettingOverrides -CapacityId "12345" -SettingTitle "SomeSetting" -EnableTenantSetting "true" -EnabledSecurityGroups @(@{graphId="1";name="Group1"},@{graphId="2";name="Group2"})

Updates the tenant setting "SomeSetting" for the capacity with ID "12345", enables it, and specifies security groups to include.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricCapacityTenantSettingOverrides {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SettingTitle,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$EnableTenantSetting,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToWorkspace,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$EnabledSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$ExcludedSecurityGroups
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Validate Security Groups if provided
        # This uses a .NET HashSet to accelerate lookup even more, especially useful in large collections.
        if ($EnabledSecurityGroups) {
            foreach ($enabledGroup in $EnabledSecurityGroups) {
                $propertySet = [HashSet[string]]::new($enabledGroup.PSObject.Properties.Name)
                if (-not ($propertySet.Contains('graphId') -and $propertySet.Contains('name'))) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties. Found: $($enabledGroup | Out-String)"
                }
            }
        }
        
        # Validate Security Groups if provided
        if ($ExcludedSecurityGroups) {
            foreach ($excludedGroup in $ExcludedSecurityGroups) {
                $propertySet = [HashSet[string]]::new($excludedGroup.PSObject.Properties.Name)
                if (-not ($propertySet.Contains('graphId') -and $propertySet.Contains('name'))) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties. Found: $($excludedGroup | Out-String)"
                }
            }
        }

        # Construct API endpoint URL
        $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl, $CapacityId
        Write-Message -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Construct request body
        $body = @{
            EnableTenantSetting = $EnableTenantSetting
            SettingTitle        = $SettingTitle
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

        # Convert body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post `
            -Body $bodyJson  
        
        # Return the API response
        Write-Message -Message "Successfully updated capacity tenant setting overrides for CapacityId: $CapacityId and SettingTitle: $SettingTitle." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error updating tenant settings: $errorDetails" -Level Error
    }
}

