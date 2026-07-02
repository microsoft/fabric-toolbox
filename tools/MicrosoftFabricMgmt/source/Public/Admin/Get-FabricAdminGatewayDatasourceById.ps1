function Get-FabricAdminGatewayDatasourceById {
    <#
    .SYNOPSIS
        Gets a single datasource registered on a Power BI gateway by its datasource ID.

    .DESCRIPTION
        The Get-FabricAdminGatewayDatasourceById cmdlet retrieves a specific datasource
        from a Power BI on-premises data gateway using the Power BI REST API.

        The returned object is enriched with the following additional properties so that
        all human-readable context is available directly on the object without relying on
        the format file:

        - GatewayName : display name of the gateway, resolved via Resolve-FabricGatewayName (cached)
        - Connection  : human-readable connection string parsed from the connectionDetails
                        JSON (server\database, path, URL, etc.)

        The gatewayId property returned by the API is the cluster/mesh gateway ID, which
        differs from the gateway's own id. This function overwrites gatewayId with the
        authoritative id value so that downstream pipeline binding always receives the
        correct gateway identity.

        Note: Virtual network (VNet) data gateways are not supported by this API.

    .PARAMETER GatewayId
        Required. The ID (GUID) of the gateway on which the datasource is registered.
        Accepts pipeline input by property name, making it compatible with the output
        of Get-FabricAdminGateway and Get-FabricAdminGatewayDatasource.

    .PARAMETER DatasourceId
        Required. The ID (GUID) of the specific datasource to retrieve.
        Accepts pipeline input by property name, making it compatible with the output
        of Get-FabricAdminGatewayDatasource (where the property is named 'id').

    .PARAMETER Raw
        Optional. Returns the unmodified API response without adding GatewayName or
        Connection enrichment properties.

    .EXAMPLE
        Get-FabricAdminGatewayDatasourceById -GatewayId "12345678-abcd-1234-efgh-123456789012" `
                                             -DatasourceId "abcdef12-1234-1234-1234-abcdef123456"

        Returns the specified datasource enriched with GatewayName and Connection.

    .EXAMPLE
        Get-FabricAdminGatewayDatasource -GatewayId "12345678-abcd-1234-efgh-123456789012" |
            Get-FabricAdminGatewayDatasourceById -GatewayId "12345678-abcd-1234-efgh-123456789012"

        Pipes all datasources from a gateway back through to retrieve full detail for each.

    .EXAMPLE
        Get-FabricAdminGatewayDatasourceById -GatewayId "12345678-abcd-1234-efgh-123456789012" `
                                             -DatasourceId "abcdef12-1234-1234-1234-abcdef123456" -Raw

        Returns the raw API response without enrichment.

    .OUTPUTS
        System.Object
        Returns a GatewayDatasource object with properties: id, gatewayId (corrected),
        datasourceType, datasourceName, credentialType, credentialDetails,
        connectionDetails (raw JSON), Connection (parsed, enriched), GatewayName (enriched).

    .NOTES
        - API Endpoint:
            GET https://api.powerbi.com/v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}
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
        [string]$GatewayId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DatasourceId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Write-FabricLog -Message "Validating authentication token..." -Level Debug
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIBaseUrl/gateways/$GatewayId/datasources/$DatasourceId"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No datasource returned for gateway '$GatewayId', datasource '$DatasourceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # The API returns a gatewayId property that reflects the cluster/mesh gateway ID
            # rather than the gateway's own identity. Overwrite it with the correct value so
            # downstream consumers and pipeline binding always get the authoritative ID.
            $response | Add-Member -NotePropertyName 'gatewayId' -NotePropertyValue $GatewayId -Force

            # Resolve gateway name (PSF cached after first call)
            $gatewayName = $GatewayId
            try {
                $gatewayName = Resolve-FabricGatewayName -GatewayId $GatewayId
            }
            catch {
                Write-FabricLog -Message "Could not resolve gateway name for '$GatewayId': $($_.Exception.Message)" -Level Debug
            }
            $response | Add-Member -NotePropertyName 'GatewayName' -NotePropertyValue $gatewayName -Force

            # Parse connectionDetails JSON into a readable connection string
            $connection = $response.connectionDetails
            if ($response.connectionDetails) {
                try {
                    $parsed = $response.connectionDetails | ConvertFrom-Json
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
                    Write-FabricLog -Message "Could not parse connectionDetails for datasource '$DatasourceId': $($_.Exception.Message)" -Level Debug
                }
            }
            $response | Add-Member -NotePropertyName 'Connection' -NotePropertyValue $connection -Force

            Write-FabricLog -Message "Successfully retrieved datasource '$($response.datasourceName)' on gateway '$gatewayName'." -Level Debug
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.GatewayDatasource'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve datasource '$DatasourceId' on gateway '$GatewayId'. Error: $errorDetails" -Level Error
        }
    }
}
