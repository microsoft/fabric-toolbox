<#
.SYNOPSIS
    Returns a joined inventory of gateways, connections, datasources, datasets, workspaces,
    and reports across the tenant.

.DESCRIPTION
    The Get-FabricAdminGatewayInventory cmdlet aggregates data from five API layers and
    returns one flat output row per unique combination of:

        Gateway → Connection → Datasource → Dataset → Workspace → Report

    It works as follows:

    1. Retrieves gateways (optionally scoped to a single gateway via -GatewayId).
    2. For each gateway, retrieves its registered datasources. These are indexed by their
       datasource ID (GatewayDatasource.id).
    3. Retrieves all admin datasets filtered to those with isOnPremGatewayRequired eq true
       to minimise the scope of step 4.
    4. For each on-premises dataset, retrieves its admin datasources. The datasourceId on
       each admin datasource is matched against the gateway datasource index from step 2.
       Only datasets bound to the gateways returned in step 1 are processed further.
    5. Reports are fetched on demand per workspace using the workspace-scoped admin
       reports endpoint (GET /admin/groups/{workspaceId}/reports). Each workspace is only
       queried once and the results are cached in-memory for the duration of the run.
       This avoids fetching the entire tenant report catalogue up front, which can be
       extremely large.
    6. For each matched gateway datasource + dataset combination, one output row is emitted
       per report associated with that dataset. Datasets with no reports still appear with
       null ReportId and ReportName.

    All workspace and gateway name resolution uses the PSF caching layer, so names are
    only fetched once per ID. Use Clear-FabricNameCache to force fresh lookups.

    Performance note: step 4 makes one API call per on-premises dataset. In large tenants
    this can be hundreds of calls. Step 5 makes one additional call per unique workspace
    that has at least one matched dataset. Progress is reported via Write-Progress and
    logged at Verbose level. Scope the run with -GatewayId to reduce overall call volume.

.PARAMETER GatewayId
    Optional. When supplied, only the specified gateway is queried in step 1. The final
    output is therefore scoped to datasets and reports connected through that gateway.
    When omitted, all gateways visible to the authenticated user are included.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.
    In this aggregator that means workspace names are not resolved and the WorkspaceName column
    carries the raw workspace ID instead of the resolved display name.

.EXAMPLE
    Get-FabricAdminGatewayInventory

    Returns the full tenant inventory across all gateways the user administers.

.EXAMPLE
    Get-FabricAdminGatewayInventory -GatewayId "12345678-abcd-1234-efgh-123456789012"

    Returns the inventory for a single gateway only.

.EXAMPLE
    Get-FabricAdminGatewayInventory | Export-Csv gateway-inventory.csv -NoTypeInformation

    Exports the full inventory to a CSV file.

.EXAMPLE
    Get-FabricAdminGatewayInventory | Where-Object { $_.WorkspaceName -eq 'Finance' }

    Filters the inventory to rows belonging to the Finance workspace.

.OUTPUTS
    System.Management.Automation.PSCustomObject
    Each output object has the following properties:

        GatewayName     - Display name of the gateway
        GatewayId       - ID of the gateway
        DatasourceName  - Display name of the gateway datasource
        DatasourceType  - Type (e.g. Sql, AnalysisServices, OData)
        Connection      - Formatted connection string parsed from connectionDetails JSON
                          (server\database, path, URL, etc.)
        DatasetId       - ID of the Power BI dataset
        DatasetName     - Name of the Power BI dataset
        WorkspaceId     - ID of the workspace containing the dataset
        WorkspaceName   - Display name of the workspace
        ReportId        - ID of the report (null if no report is built on this dataset)
        ReportName      - Display name of the report (null if no reports)

.NOTES
    - Required permissions:
        * Gateway admin rights (Dataset.ReadWrite.All or Dataset.Read.All)
        * Fabric Administrator or Tenant.Read.All for admin dataset/report APIs
    - Rate limits apply to the underlying admin APIs (see individual function docs)
    - VNet gateways are not supported by the gateway APIs used in step 1 and 2

    Author: Rob Sewell
#>
function Get-FabricAdminGatewayInventory {
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
            Invoke-FabricAuthCheck -ThrowOnFailure

            #region Step 1 — Gateways
            Write-FabricLog -Message "Step 1: Retrieving gateway(s)..." -Level Host

            if ($GatewayId) {
                $gateways = @(Get-FabricAdminGateway -GatewayId $GatewayId)
            }
            else {
                $gateways = @(Get-FabricAdminGateway)
            }

            if (-not $gateways -or $gateways.Count -eq 0) {
                Write-FabricLog -Message "No gateways found. Ensure the authenticated account has gateway admin rights." -Level Warning
                return
            }

            Write-FabricLog -Message "Found $($gateways.Count) gateway(s)." -Level Host
            #endregion

            #region Step 2 — Gateway datasources (indexed by datasource ID)
            Write-FabricLog -Message "Step 2: Retrieving datasources for each gateway..." -Level Host

            # Key: GatewayDatasource.id (= datasourceId used in admin dataset datasource API)
            $gatewayDatasourceIndex = @{}

            foreach ($gateway in $gateways) {
                Write-FabricLog -Message "  Gateway '$($gateway.name)': retrieving datasources..." -Level Verbose
                $gwDatasources = Get-FabricAdminGatewayDatasource -GatewayId $gateway.id -Raw

                if (-not $gwDatasources) {
                    Write-FabricLog -Message "  Gateway '$($gateway.name)': no datasources found." -Level Verbose
                    continue
                }

                foreach ($ds in $gwDatasources) {
                    # Parse connectionDetails JSON into a readable connection string
                    $connectionString = $ds.connectionDetails
                    if ($ds.connectionDetails) {
                        try {
                            $parsed = $ds.connectionDetails | ConvertFrom-Json
                            $parts  = @()
                            if ($parsed.server)      { $parts += $parsed.server }
                            if ($parsed.database)    { $parts += $parsed.database }
                            if ($parsed.path)        { $parts += $parsed.path }
                            if ($parsed.url)         { $parts += $parsed.url }
                            if ($parsed.loginServer) { $parts += $parsed.loginServer }
                            if ($parts.Count -gt 0) {
                                $connectionString = $parts -join '\'
                            }
                        }
                        catch {
                            Write-FabricLog -Message "  Could not parse connectionDetails for datasource '$($ds.datasourceName)': $($_.Exception.Message)" -Level Debug
                        }
                    }

                    $gatewayDatasourceIndex[$ds.id] = [PSCustomObject]@{
                        GatewayId      = $gateway.id
                        GatewayName    = $gateway.name
                        DatasourceName = $ds.datasourceName
                        DatasourceType = $ds.datasourceType
                        Connection     = $connectionString
                    }
                }
            }

            if ($gatewayDatasourceIndex.Count -eq 0) {
                Write-FabricLog -Message "No gateway datasources found across the specified gateway(s)." -Level Warning
                return
            }

            Write-FabricLog -Message "Indexed $($gatewayDatasourceIndex.Count) gateway datasource(s) total." -Level Host
            #endregion

            #region Step 3 — On-premises datasets
            Write-FabricLog -Message "Step 3: Retrieving on-premises datasets (isOnPremGatewayRequired eq true)..." -Level Host

            $datasets = @(Get-FabricAdminDataset -Filter 'isOnPremGatewayRequired eq true' -Raw)

            if (-not $datasets -or $datasets.Count -eq 0) {
                Write-FabricLog -Message "No datasets requiring on-premises gateways found." -Level Warning
                return
            }

            Write-FabricLog -Message "Found $($datasets.Count) on-premises dataset(s). Querying their datasources..." -Level Host
            #endregion

            #region Step 4 — Match dataset datasources to gateway datasource index
            # Key: workspaceId  Value: hashtable of { datasetId -> List[report] }
            # Reports are fetched per workspace on first need and cached here for the run.
            $workspaceReportCache = @{}

            $results       = [System.Collections.Generic.List[object]]::new()
            $totalDatasets = $datasets.Count
            $processed     = 0

            # Placeholder used when a matched dataset has no reports
            $noReport = [PSCustomObject]@{ id = $null; name = $null }

            foreach ($dataset in $datasets) {
                $processed++
                Write-Progress `
                    -Activity "Get-FabricAdminGatewayInventory" `
                    -Status "Dataset $processed of $totalDatasets : $($dataset.name)" `
                    -PercentComplete ([int](($processed / $totalDatasets) * 100))

                Write-FabricLog -Message "  [$processed/$totalDatasets] Dataset '$($dataset.name)' ($($dataset.id))" -Level Verbose

                $datasetDatasources = Get-FabricAdminDatasetDatasource -DatasetId $dataset.id -Raw -ErrorAction SilentlyContinue

                if (-not $datasetDatasources) {
                    Write-FabricLog -Message "    No datasources returned — skipping." -Level Debug
                    continue
                }

                # Check whether any datasource on this dataset matches a known gateway datasource
                $hasGatewayMatch = $false
                foreach ($datasetDs in $datasetDatasources) {
                    if ($datasetDs.datasourceId -and $gatewayDatasourceIndex.ContainsKey($datasetDs.datasourceId)) {
                        $hasGatewayMatch = $true
                        break
                    }
                }

                if (-not $hasGatewayMatch) {
                    Write-FabricLog -Message "    No gateway datasource match — skipping." -Level Debug
                    continue
                }

                # Resolve workspace name once per dataset (PSF cached across the whole run).
                # With -Raw, skip resolution and leave the raw workspace ID in place.
                $workspaceName = $dataset.workspaceId
                if (-not $Raw -and $dataset.workspaceId) {
                    try {
                        $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $dataset.workspaceId
                    }
                    catch {
                        Write-FabricLog -Message "    Could not resolve workspace '$($dataset.workspaceId)': $($_.Exception.Message)" -Level Debug
                    }
                }

                #region Step 5 — Lazy per-workspace report lookup (cached in-memory)
                if ($dataset.workspaceId -and -not $workspaceReportCache.ContainsKey($dataset.workspaceId)) {
                    Write-FabricLog -Message "    Fetching reports for workspace '$workspaceName' (first time)..." -Level Verbose

                    # Key: datasetId  Value: List[report]
                    $wsReportIndex = @{}
                    $wsReports = Get-FabricAdminReport -WorkspaceId $dataset.workspaceId -Raw -ErrorAction SilentlyContinue

                    if ($wsReports) {
                        foreach ($report in $wsReports) {
                            if (-not $report.datasetId) { continue }
                            if (-not $wsReportIndex.ContainsKey($report.datasetId)) {
                                $wsReportIndex[$report.datasetId] = [System.Collections.Generic.List[object]]::new()
                            }
                            $wsReportIndex[$report.datasetId].Add($report)
                        }
                        Write-FabricLog -Message "    Cached $($wsReports.Count) report(s) for workspace '$workspaceName'." -Level Debug
                    }

                    $workspaceReportCache[$dataset.workspaceId] = $wsReportIndex
                }
                #endregion

                foreach ($datasetDs in $datasetDatasources) {
                    if (-not $datasetDs.datasourceId -or -not $gatewayDatasourceIndex.ContainsKey($datasetDs.datasourceId)) {
                        continue
                    }

                    $gwDs = $gatewayDatasourceIndex[$datasetDs.datasourceId]

                    # Look up reports for this dataset from the per-workspace cache
                    $reports = @($noReport)
                    if ($dataset.workspaceId -and $workspaceReportCache.ContainsKey($dataset.workspaceId)) {
                        $wsIdx = $workspaceReportCache[$dataset.workspaceId]
                        if ($wsIdx.ContainsKey($dataset.id)) {
                            $reports = $wsIdx[$dataset.id]
                        }
                    }

                    foreach ($report in $reports) {
                        $results.Add([PSCustomObject]@{
                            GatewayName    = $gwDs.GatewayName
                            GatewayId      = $gwDs.GatewayId
                            DatasourceName = $gwDs.DatasourceName
                            DatasourceType = $gwDs.DatasourceType
                            Connection     = $gwDs.Connection
                            DatasetId      = $dataset.id
                            DatasetName    = $dataset.name
                            WorkspaceId    = $dataset.workspaceId
                            WorkspaceName  = $workspaceName
                            ReportId       = $report.id
                            ReportName     = $report.name
                        })
                    }
                }
            }

            Write-Progress -Activity "Get-FabricAdminGatewayInventory" -Completed
            #endregion

            Write-FabricLog -Message "Inventory complete. $($results.Count) row(s) returned across $totalDatasets dataset(s) processed." -Level Host

            $results.ToArray()
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve gateway inventory. Error: $errorDetails" -Level Error
        }
    }
}
