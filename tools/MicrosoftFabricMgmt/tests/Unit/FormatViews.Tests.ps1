#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Structural tests for the module format file (MicrosoftFabricMgmt.Format.ps1xml):
    - the file is well-formed XML
    - the newly-added item resource types are wired into the shared FabricItemView
    - the dedicated Connection and Deployment Pipeline views exist and select the right types
    These guard the display-formatting backfill against accidental regressions.
#>

BeforeAll {
    $FormatFile = "$PSScriptRoot/../../source/MicrosoftFabricMgmt.Format.ps1xml"
    [xml]$script:Fmt = Get-Content $FormatFile -Raw
    $script:Views = @($script:Fmt.Configuration.ViewDefinitions.View)

    function Get-ViewTypeNames {
        param([string]$ViewName)
        $view = $script:Views | Where-Object { $_.Name -eq $ViewName }
        if (-not $view) { return @() }
        @($view.ViewSelectedBy.TypeName)
    }
}

Describe 'MicrosoftFabricMgmt.Format.ps1xml' -Tag 'UnitTests' {

    It 'is well-formed XML with view definitions' {
        $script:Views.Count | Should -BeGreaterThan 0
    }

    It 'wires the new standard item resource types into FabricItemView' {
        $itemTypes = Get-ViewTypeNames -ViewName 'FabricItemView'
        foreach ($t in @(
                'MicrosoftFabric.AnomalyDetector'
                'MicrosoftFabric.DigitalTwinBuilder'
                'MicrosoftFabric.DigitalTwinBuilderFlow'
                'MicrosoftFabric.EventSchemaSet'
                'MicrosoftFabric.GraphQuerySet'
                'MicrosoftFabric.Map'
                'MicrosoftFabric.MirroredAzureDatabricksCatalog'
                'MicrosoftFabric.Ontology'
                'MicrosoftFabric.OperationsAgent'
                'MicrosoftFabric.UserDataFunction'
            )) {
            $itemTypes | Should -Contain $t
        }
    }

    It 'wires the same new item types into FabricItemListView' {
        $listTypes = Get-ViewTypeNames -ViewName 'FabricItemListView'
        $listTypes | Should -Contain 'MicrosoftFabric.Ontology'
        $listTypes | Should -Contain 'MicrosoftFabric.UserDataFunction'
    }

    It 'defines a ConnectionView selecting MicrosoftFabric.Connection' {
        Get-ViewTypeNames -ViewName 'ConnectionView' | Should -Contain 'MicrosoftFabric.Connection'
    }

    It 'defines a DeploymentPipelineView selecting MicrosoftFabric.DeploymentPipeline' {
        Get-ViewTypeNames -ViewName 'DeploymentPipelineView' | Should -Contain 'MicrosoftFabric.DeploymentPipeline'
    }

    It 'folds WarehouseSnapshot (a full item) into the shared item views' {
        Get-ViewTypeNames -ViewName 'FabricItemView'     | Should -Contain 'MicrosoftFabric.WarehouseSnapshot'
        Get-ViewTypeNames -ViewName 'FabricItemListView' | Should -Contain 'MicrosoftFabric.WarehouseSnapshot'
    }

    It 'defines dedicated views for the sub-resource collections' {
        Get-ViewTypeNames -ViewName 'ItemJobInstanceView'        | Should -Contain 'MicrosoftFabric.ItemJobInstance'
        Get-ViewTypeNames -ViewName 'ItemScheduleView'           | Should -Contain 'MicrosoftFabric.ItemSchedule'
        Get-ViewTypeNames -ViewName 'LakehouseTableView'         | Should -Contain 'MicrosoftFabric.LakehouseTable'
        Get-ViewTypeNames -ViewName 'WarehouseRestorePointView'  | Should -Contain 'MicrosoftFabric.WarehouseRestorePoint'
    }

    It 'defines a GatewayDatasourceView selecting MicrosoftFabric.GatewayDatasource' {
        Get-ViewTypeNames -ViewName 'GatewayDatasourceView' | Should -Contain 'MicrosoftFabric.GatewayDatasource'
    }
}
