<#
.SYNOPSIS
    Adds type decoration to Get-* functions for output formatting.

.DESCRIPTION
    This script updates Get-* functions to add PSTypeName decoration using
    Select-FabricResource's TypeName parameter.

.NOTES
    Author: Claude Code
    Date: 2026-01-13
#>

# Mapping of function files to their TypeNames
$functionTypeMap = @{
    'Apache Airflow Job\Get-FabricApacheAirflowJob.ps1' = 'MicrosoftFabric.ApacheAirflowJob'
    'Copy Job\Get-FabricCopyJob.ps1' = 'MicrosoftFabric.CopyJob'
    'Dashboard\Get-FabricDashboard.ps1' = 'MicrosoftFabric.Dashboard'
    'Data Pipeline\Get-FabricDataPipeline.ps1' = 'MicrosoftFabric.DataPipeline'
    'Datamart\Get-FabricDatamart.ps1' = 'MicrosoftFabric.Datamart'
    'Environment\Get-FabricEnvironment.ps1' = 'MicrosoftFabric.Environment'
    'Eventhouse\Get-FabricEventhouse.ps1' = 'MicrosoftFabric.Eventhouse'
    'Eventstream\Get-FabricEventstream.ps1' = 'MicrosoftFabric.Eventstream'
    'External Data Share\Get-FabricExternalDataShare.ps1' = 'MicrosoftFabric.ExternalDataShare'
    'Folder\Get-FabricFolder.ps1' = 'MicrosoftFabric.Folder'
    'GraphQLApi\Get-FabricGraphQLApi.ps1' = 'MicrosoftFabric.GraphQLApi'
    'KQL Dashboard\Get-FabricKQLDashboard.ps1' = 'MicrosoftFabric.KQLDashboard'
    'KQL Database\Get-FabricKQLDatabase.ps1' = 'MicrosoftFabric.KQLDatabase'
    'KQL Queryset\Get-FabricKQLQueryset.ps1' = 'MicrosoftFabric.KQLQueryset'
    'Managed Private Endpoint\Get-FabricManagedPrivateEndpoint.ps1' = 'MicrosoftFabric.ManagedPrivateEndpoint'
    'Mirrored Database\Get-FabricMirroredDatabase.ps1' = 'MicrosoftFabric.MirroredDatabase'
    'Mirrored Warehouse\Get-FabricMirroredWarehouse.ps1' = 'MicrosoftFabric.MirroredWarehouse'
    'ML Experiment\Get-FabricMLExperiment.ps1' = 'MicrosoftFabric.MLExperiment'
    'ML Model\Get-FabricMLModel.ps1' = 'MicrosoftFabric.MLModel'
    'Mounted Data Factory\Get-FabricMountedDataFactory.ps1' = 'MicrosoftFabric.MountedDataFactory'
    'OneLake\Get-FabricOneLakeShortcut.ps1' = 'MicrosoftFabric.OneLakeShortcut'
    'Paginated Reports\Get-FabricPaginatedReport.ps1' = 'MicrosoftFabric.PaginatedReport'
    'Reflex\Get-FabricReflex.ps1' = 'MicrosoftFabric.Reflex'
    'Report\Get-FabricReport.ps1' = 'MicrosoftFabric.Report'
    'Semantic Model\Get-FabricSemanticModel.ps1' = 'MicrosoftFabric.SemanticModel'
    'Spark Job Definition\Get-FabricSparkJobDefinition.ps1' = 'MicrosoftFabric.SparkJobDefinition'
    'SQL Endpoints\Get-FabricSQLEndpoint.ps1' = 'MicrosoftFabric.SQLEndpoint'
    'Variable Library\Get-FabricVariableLibrary.ps1' = 'MicrosoftFabric.VariableLibrary'
}

$sourcePath = "s:\fabric-toolbox\tools\MicrosoftFabricMgmt\source\Public"
$updated = 0
$skipped = 0
$errors = 0

foreach ($entry in $functionTypeMap.GetEnumerator()) {
    $relativePath = $entry.Key
    $typeName = $entry.Value
    $filePath = Join-Path $sourcePath $relativePath

    if (-not (Test-Path $filePath)) {
        Write-Warning "File not found: $filePath"
        $errors++
        continue
    }

    $content = Get-Content $filePath -Raw

    # Check if already using Select-FabricResource with TypeName
    if ($content -match 'Select-FabricResource.*-TypeName') {
        Write-Host "Already decorated: $relativePath" -ForegroundColor Green
        $skipped++
        continue
    }

    # Pattern 1: Select-FabricResource without TypeName
    if ($content -match 'Select-FabricResource\s+-InputObject\s+\$dataItems\s+-Id\s+\$\w+\s+-DisplayName\s+\$\w+\s+-ResourceType\s+''[^'']+''') {
        $newContent = $content -replace '(Select-FabricResource\s+-InputObject\s+\$dataItems\s+-Id\s+\$\w+\s+-DisplayName\s+\$\w+\s+-ResourceType\s+''[^'']+'')', "`$1 -TypeName '$typeName'"
        Set-Content -Path $filePath -Value $newContent -NoNewline
        Write-Host "Updated (Select-FabricResource): $relativePath" -ForegroundColor Cyan
        $updated++
        continue
    }

    # Pattern 2: Using Add-FabricTypeName directly (like Lakehouse)
    if ($content -match '\$matchedItems\s+\|\s+Add-FabricTypeName') {
        Write-Host "Already uses Add-FabricTypeName: $relativePath" -ForegroundColor Green
        $skipped++
        continue
    }

    # Pattern 3: Returns raw items without decoration - need to add it
    Write-Warning "Needs manual review: $relativePath (pattern not matched)"
    $errors++
}

Write-Host "`nSummary:" -ForegroundColor Yellow
Write-Host "  Updated: $updated" -ForegroundColor Green
Write-Host "  Skipped: $skipped" -ForegroundColor Green
Write-Host "  Errors/Manual Review: $errors" -ForegroundColor $(if ($errors -gt 0) { 'Red' } else { 'Green' })
