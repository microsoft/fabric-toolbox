function Get-FabricAdminGatewayDatasource {
    <#
    .SYNOPSIS
        Gets all datasources registered on a Power BI gateway.

    .DESCRIPTION
        The Get-FabricAdminGatewayDatasource cmdlet retrieves all datasources registered on
        a specific Power BI on-premises data gateway using the Power BI REST API.

        Each returned datasource object is enriched with the following additional properties
        so that all human-readable context is available directly on the object without
        relying on the format file:

        - GatewayName : display name of the gateway, resolved via Resolve-FabricGatewayName (cached)
        - Connection  : human-readable connection string parsed from the connectionDetails
                        JSON (server\database, path, URL, etc.)

        The gatewayId property returned by the API is the cluster/mesh gateway ID, which
        differs from the gateway's own id. This function overwrites gatewayId on every
        returned object with the authoritative value supplied via -GatewayId.

        Note: Virtual network (VNet) data gateways are not supported by this API.

    .PARAMETER GatewayId
        Required. The ID (GUID) of the gateway whose datasources should be retrieved.
        Accepts pipeline input by property name, making it compatible with the output
        of Get-FabricAdminGateway.

    .PARAMETER Raw
        Optional. Returns the unmodified API response without adding GatewayName,
        Connection, or corrected gatewayId properties.

    .EXAMPLE
        Get-FabricAdminGatewayDatasource -GatewayId "12345678-abcd-1234-efgh-123456789012"

        Returns all datasources on the specified gateway, enriched with GatewayName
        and Connection.

    .EXAMPLE
        Get-FabricAdminGateway | Get-FabricAdminGatewayDatasource

        Retrieves all gateways and pipes them to get their datasources.

    .EXAMPLE
        Get-FabricAdminGatewayDatasource -GatewayId "12345678-abcd-1234-efgh-123456789012" -Raw

        Returns the raw API response without enrichment.

    .OUTPUTS
        System.Object
        Returns GatewayDatasource object(s) with properties: id, gatewayId (corrected),
        datasourceType, datasourceName, credentialType, connectionDetails (raw JSON),
        Connection (parsed, enriched), GatewayName (enriched).

    .NOTES
        - API Endpoint: GET https://api.powerbi.com/v1.0/myorg/gateways/{gatewayId}/datasources
        - Requires: Authentication via Set-FabricApiHeaders
        - Permissions: User must be a gateway admin
        - Scope: Dataset.ReadWrite.All or Dataset.Read.All
        - VNet gateways are not supported

        Author: Rob Sewell
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GatewayId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Write-FabricLog -Message "Validating authentication token..." -Level Debug
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIBaseUrl/gateways/$GatewayId/datasources"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No datasources returned for gateway '$GatewayId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve gateway name once for all datasources (PSF cached after first call)
            $gatewayName = $GatewayId
            try {
                $gatewayName = Resolve-FabricGatewayName -GatewayId $GatewayId
            }
            catch {
                Write-FabricLog -Message "Could not resolve gateway name for '$GatewayId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($datasource in $response) {
                # Overwrite the cluster/mesh gatewayId with the authoritative gateway ID
                $datasource | Add-Member -NotePropertyName 'gatewayId'   -NotePropertyValue $GatewayId   -Force
                $datasource | Add-Member -NotePropertyName 'GatewayName' -NotePropertyValue $gatewayName -Force

                # Parse connectionDetails JSON into a readable Connection property
                $connection = $datasource.connectionDetails
                if ($datasource.connectionDetails) {
                    try {
                        $parsed = $datasource.connectionDetails | ConvertFrom-Json
                        $parts  = @()
                        if ($parsed.server)      { $parts += $parsed.server }
                        if ($parsed.database)    { $parts += $parsed.database }
                        if ($parsed.path)        { $parts += $parsed.path }
                        if ($parsed.url)         { $parts += $parsed.url }
                        if ($parsed.loginServer) { $parts += $parsed.loginServer }
                        if ($parts.Count -gt 0) {
                            $connection = $parts -join '\'
                        }
                    }
                    catch {
                        Write-FabricLog -Message "Could not parse connectionDetails for datasource '$($datasource.datasourceName)': $($_.Exception.Message)" -Level Debug
                    }
                }
                $datasource | Add-Member -NotePropertyName 'Connection' -NotePropertyValue $connection -Force
            }

            Write-FabricLog -Message "Successfully retrieved $(@($response).Count) datasource(s) for gateway '$gatewayName'." -Level Debug
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.GatewayDatasource'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve datasources for gateway '$GatewayId'. Error: $errorDetails" -Level Error
        }
    }
}
