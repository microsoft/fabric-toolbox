function Get-FabricAdminGateway {
    <#
    .SYNOPSIS
        Gets one or all Power BI gateways for which the current user is a gateway admin.

    .DESCRIPTION
        The Get-FabricAdminGateway cmdlet retrieves Power BI on-premises data gateways
        using the Power BI REST API. When called without parameters it returns all gateways
        for which the authenticated user has gateway admin permissions. When a GatewayId
        is supplied it returns the details of that specific gateway.

        The gatewayId property returned by the API is the cluster/mesh gateway ID, which
        differs from the gateway's own id. This function overwrites gatewayId with the
        authoritative id value so that downstream pipeline binding always receives the
        correct gateway identity.

        Note: Virtual network (VNet) data gateways are not supported by this API.

    .PARAMETER GatewayId
        Optional. The ID (GUID) of a specific gateway to retrieve. When omitted, all
        gateways visible to the current user are returned.

    .PARAMETER Raw
        If specified, returns the untouched API response with no added properties or type decoration.

    .EXAMPLE
        Get-FabricAdminGateway

        Returns all gateways for which the current user is a gateway admin.

    .EXAMPLE
        Get-FabricAdminGateway -GatewayId "12345678-abcd-1234-efgh-123456789012"

        Returns the details of the specified gateway.

    .EXAMPLE
        Get-FabricAdminGateway | Get-FabricAdminGatewayDatasource

        Retrieves all gateways and pipes them through to get their datasources.

    .OUTPUTS
        System.Object
        Returns Gateway object(s) with properties: id, name, type, gatewayStatus,
        gatewayAnnotation, publicKey, gatewayId (corrected to match id).

    .NOTES
        - API Endpoints:
            GET https://api.powerbi.com/v1.0/myorg/gateways
            GET https://api.powerbi.com/v1.0/myorg/gateways/{gatewayId}
        - Requires: Authentication via Connect-FabricAccount
        - Permissions: User must be a gateway admin
        - Scope: Dataset.ReadWrite.All or Dataset.Read.All
        - VNet gateways are not supported

        Author: Rob Sewell
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GatewayId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Write-FabricLog -Message "Validating authentication token..." -Level Debug
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIBaseUrl = "https://api.powerbi.com/v1.0/myorg"

            if ($GatewayId) {
                $apiEndpointURI = "$powerBIBaseUrl/gateways/$GatewayId"
            }
            else {
                $apiEndpointURI = "$powerBIBaseUrl/gateways"
            }

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No gateway(s) returned." -Level Warning
                return $null
            }

            Write-FabricLog -Message "Successfully retrieved $(@($response).Count) gateway(s)." -Level Debug

            if ($Raw) {
                return $response
            }

            # The API returns a 'gatewayId' property that reflects the cluster/mesh gateway
            # ID rather than the gateway's own identity. Replace it with the correct 'id'
            # so that pipeline binding (ValueFromPipelineByPropertyName on 'gatewayId') and
            # downstream name-resolution calls always receive the authoritative gateway ID.
            foreach ($gateway in $response) {
                if ($gateway.id) {
                    $gateway | Add-Member -NotePropertyName 'gatewayId' -NotePropertyValue $gateway.id -Force
                }
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.Gateway'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve gateway(s). Error: $errorDetails" -Level Error
        }
    }
}
