<#
.SYNOPSIS
Creates a new Microsoft Fabric connection.

.DESCRIPTION
The New-FabricConnection function creates a connection via POST to the Fabric
`/connections` endpoint. Because the request body is polymorphic on the connectivity
type (cloud, on-premises gateway, virtual network gateway), the nested connection and
credential details are supplied as hashtables so any connection type can be created.

The full created connection object is returned. By default it is enriched with a
resolved GatewayName (when the connection is bound to a gateway) and decorated for the
custom table view; pass -Raw to return the untouched API response.

.PARAMETER ConnectionName
The display name of the connection to create.

.PARAMETER ConnectivityType
The connectivity type of the connection. Valid values: ShareableCloud, PersonalCloud,
OnPremisesGateway, OnPremisesGatewayPersonal, VirtualNetworkGateway, Automatic, None.

.PARAMETER ConnectionDetails
A hashtable describing the connection target, e.g.
@{ type = 'SQL'; creationMethod = 'SQL'; parameters = @(@{ dataType='Text'; name='server'; value='myserver' }, @{ dataType='Text'; name='database'; value='mydb' }) }

.PARAMETER CredentialDetails
Optional hashtable of credential details for the connection, e.g.
@{ singleSignOnType = 'None'; connectionEncryption = 'NotEncrypted'; skipTestConnection = $false; credentials = @{ credentialType = 'Basic'; username = 'u'; password = 'p' } }

.PARAMETER GatewayId
Optional gateway id. Required for the gateway connectivity types (OnPremisesGateway,
VirtualNetworkGateway).

.PARAMETER PrivacyLevel
Optional privacy level. Valid values: None, Organizational, Private, Public.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
$details = @{ type = 'SQL'; creationMethod = 'SQL'; parameters = @(@{ dataType='Text'; name='server'; value='srv1' }, @{ dataType='Text'; name='database'; value='db1' }) }
$cred = @{ singleSignOnType='None'; connectionEncryption='NotEncrypted'; skipTestConnection=$false; credentials=@{ credentialType='Basic'; username='u'; password='p' } }
New-FabricConnection -ConnectionName 'MySql' -ConnectivityType 'ShareableCloud' -ConnectionDetails $details -CredentialDetails $cred

Creates a shareable cloud SQL connection.

.OUTPUTS
System.Object
The created connection object with all API-returned properties (plus GatewayName when applicable).

.NOTES
- API Endpoint: POST /connections
- Requires: authentication via Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function New-FabricConnection {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionName,

        [Parameter(Mandatory = $true)]
        [ValidateSet('ShareableCloud', 'PersonalCloud', 'OnPremisesGateway', 'OnPremisesGatewayPersonal', 'VirtualNetworkGateway', 'Automatic', 'None')]
        [string]$ConnectivityType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$ConnectionDetails,

        [Parameter(Mandatory = $false)]
        [hashtable]$CredentialDetails,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GatewayId,

        [Parameter(Mandatory = $false)]
        [ValidateSet('None', 'Organizational', 'Private', 'Public')]
        [string]$PrivacyLevel,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'connections'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body. connectionDetails/credentialDetails are passed
            # through verbatim so any connectivity type's schema can be expressed.
            $body = @{
                connectivityType  = $ConnectivityType
                displayName       = $ConnectionName
                connectionDetails = $ConnectionDetails
            }
            if ($GatewayId) { $body.gatewayId = $GatewayId }
            if ($CredentialDetails) { $body.credentialDetails = $CredentialDetails }
            if ($PrivacyLevel) { $body.privacyLevel = $PrivacyLevel }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ConnectionName, "Create Fabric connection")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after creating connection '$ConnectionName'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                # Enrich: resolve gateway name when the connection is bound to a gateway.
                if ($response.gatewayId) {
                    $gatewayName = $null
                    try { $gatewayName = Resolve-FabricGatewayName -GatewayId $response.gatewayId }
                    catch { $gatewayName = $response.gatewayId }
                    $response | Add-Member -NotePropertyName 'GatewayName' -NotePropertyValue $gatewayName -Force
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.Connection'
                Write-FabricLog -Message "Connection '$ConnectionName' created successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create connection '$ConnectionName'. Error: $errorDetails" -Level Error
        }
    }
}
