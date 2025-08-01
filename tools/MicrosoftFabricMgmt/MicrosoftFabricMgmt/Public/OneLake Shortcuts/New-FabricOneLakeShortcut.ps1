<#
.SYNOPSIS
    Creates a new OneLake Shortcut in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a OneLake Shortcut (MPE) in the specified workspace.
    Requires workspace ID, item ID, target type, and connection ID. Additional parameters depend on the target type.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the OneLake Shortcut will be created. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item (e.g., Lakehouse) where the shortcut will be created. Mandatory.

.PARAMETER ShortcutConflictPolicy
    (Optional) Policy for handling shortcut name conflicts. Valid values: Abort, GenerateUniqueName, CreateOrOverwrite, OverwriteOnly.

.PARAMETER Target
    The type of target for the shortcut (e.g., adlsGen2, amazonS3, azureBlobStorage, dataverse, googleCloudStorage, oneLake, s3Compatible). Mandatory.

.PARAMETER ConnectionId
    The connection ID to use for the shortcut. Mandatory.

.PARAMETER Location
    (Optional) The location or container for the shortcut, required for some targets.

.PARAMETER SubPath
    (Optional) The subpath within the location, required for some targets.

.PARAMETER DeltaLakeFolder
    (Optional) The Delta Lake folder, required for dataverse target.

.PARAMETER EnvironmentDomain
    (Optional) The environment domain, required for dataverse target.

.PARAMETER TableName
    (Optional) The table name, required for dataverse target.

.PARAMETER TargetItemId
    (Optional) The target item ID, required for onelake target.

.PARAMETER Path
    (Optional) The path within the target item, required for onelake target.

.PARAMETER TargetWorkspaceId
    (Optional) The workspace ID of the target, required for onelake target.

.PARAMETER Bucket
    (Optional) The bucket name, required for s3Compatible target.

.EXAMPLE
    New-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "shortcut1" -Target "adlsGen2" -ConnectionId "conn-abc" -Location "container" -SubPath "folder"

.EXAMPLE
    New-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "shortcut2" -Target "dataverse" -ConnectionId "conn-xyz" -DeltaLakeFolder "folder" -EnvironmentDomain "domain" -TableName "table"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricOneLakeShortcut {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("Abort", "GenerateUniqueName", "CreateOrOverwrite", "OverwriteOnly")]
        [string]$ShortcutConflictPolicy,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("adlsGen2", "amazonS3", "azureBlobStorage", "dataverse", "googleCloudStorage", "oneLake", "s3Compatible")]
        [string]$Target,

        # AdlsGen2, AmazonS3, AzureBlobStorage, GoogleCloudStorage
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Location,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SubPath,

        #dataverse
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DeltaLakeFolder,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDomain,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TableName,

        #onelake
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetPath,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetWorkspaceId,

        #S3Compatible
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Bucket
    )
    try {
       
        # Validate required parameters for specific targets using a hashtable for efficiency
        $requiredParamsByTarget = @{
            adlsGen2           = @("Location", "SubPath")
            amazonS3           = @("Location", "SubPath")
            azureBlobStorage   = @("Location", "SubPath")
            googleCloudStorage = @("Location", "SubPath")
            dataverse          = @("DeltaLakeFolder", "EnvironmentDomain", "TableName")
            onelake            = @("TargetItemId", "TargetPath", "TargetWorkspaceId")
            s3Compatible       = @("Bucket", "Location", "SubPath")
        }

        if ($requiredParamsByTarget.ContainsKey($Target)) {
            foreach ($param in $requiredParamsByTarget[$Target]) {
                if (-not (Get-Variable -Name $param -ValueOnly)) {
                    Write-Message -Message "Parameter '$param' cannot be null or empty when Target is $Target." -Level Error
                    return $null
                }
            }
        }
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($ShortcutConflictPolicy) {
            $apiEndpointURI = "$apiEndpointURI?shortcutConflictPolicy=$ShortcutConflictPolicy"
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body in the required nested format
        $targetBody = @{}

        # Add required parameters for the selected target
        foreach ($param in $requiredParamsByTarget[$Target]) {
            if ($Target -eq "onelake") {
            switch ($param) {
                "TargetItemId"      { $targetBody["itemId"] = $TargetItemId }
                "TargetPath"        { $targetBody["path"] = $TargetPath }
                "TargetWorkspaceId" { $targetBody["workspaceId"] = $TargetWorkspaceId }
                default             { $targetBody[$param.Substring(0, 1).ToLower() + $param.Substring(1)] = Get-Variable -Name $param -ValueOnly }
            }
            } else {
            $targetBody[$param.Substring(0, 1).ToLower() + $param.Substring(1)] = Get-Variable -Name $param -ValueOnly
            }
        }

        # Always add connectionId for all targets
        $targetBody["connectionId"] = $ConnectionId

        $body = @{
            name = $ShortcutName
            path = $Path
            target = @{
                $Target = $targetBody
            }
        }
        
        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "OneLake Shortcut created successfully!" -Level Info        
        return $response     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create OneLake Shortcut. Error: $errorDetails" -Level Error
    }
}