<#
.SYNOPSIS
Updates an existing Microsoft Fabric connection.

.DESCRIPTION
The Update-FabricConnection function updates a connection via PATCH to
`/connections/{connectionId}`. The connectivity type is required because it selects the
request shape; display name, privacy level, and credential details may optionally be
changed. The full updated connection object is returned (enriched with a resolved
GatewayName where applicable, and decorated for the table view); pass -Raw for the
untouched API response.

.PARAMETER ConnectionId
The unique identifier of the connection to update. Accepts pipeline input by property
name (e.g. from Get-FabricConnection).

.PARAMETER ConnectivityType
The connectivity type of the connection (required; selects the update request shape).
Valid values: ShareableCloud, PersonalCloud, OnPremisesGateway,
OnPremisesGatewayPersonal, VirtualNetworkGateway, Automatic, None.

.PARAMETER ConnectionName
Optional new display name for the connection.

.PARAMETER PrivacyLevel
Optional new privacy level. Valid values: None, Organizational, Private, Public.

.PARAMETER CredentialDetails
Optional hashtable of new credential details.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Update-FabricConnection -ConnectionId "abc123" -ConnectivityType 'ShareableCloud' -PrivacyLevel 'Private'

Updates the connection's privacy level.

.EXAMPLE
Get-FabricConnection -ConnectionName 'MySql' | Update-FabricConnection -ConnectivityType 'ShareableCloud' -ConnectionName 'MySql-Renamed'

Renames the connection.

.OUTPUTS
System.Object
The updated connection object with all API-returned properties (plus GatewayName when applicable).

.NOTES
- API Endpoint: PATCH /connections/{connectionId}
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricConnection {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('ShareableCloud', 'PersonalCloud', 'OnPremisesGateway', 'OnPremisesGatewayPersonal', 'VirtualNetworkGateway', 'Automatic', 'None')]
        [string]$ConnectivityType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('None', 'Organizational', 'Private', 'Public')]
        [string]$PrivacyLevel,

        [Parameter(Mandatory = $false)]
        [hashtable]$CredentialDetails,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'connections' -ResourceId $ConnectionId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # connectivityType is the discriminator and is always sent; the rest are optional.
            $body = @{
                connectivityType = $ConnectivityType
            }
            if ($ConnectionName) { $body.displayName = $ConnectionName }
            if ($PrivacyLevel) { $body.privacyLevel = $PrivacyLevel }
            if ($CredentialDetails) { $body.credentialDetails = $CredentialDetails }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ConnectionId, "Update Fabric connection")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating connection '$ConnectionId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                if ($response.gatewayId) {
                    $gatewayName = $null
                    try { $gatewayName = Resolve-FabricGatewayName -GatewayId $response.gatewayId }
                    catch { $gatewayName = $response.gatewayId }
                    $response | Add-Member -NotePropertyName 'GatewayName' -NotePropertyValue $gatewayName -Force
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.Connection'
                Write-FabricLog -Message "Connection '$ConnectionId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update connection '$ConnectionId'. Error: $errorDetails" -Level Error
        }
    }
}
