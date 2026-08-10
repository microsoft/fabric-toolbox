#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Tests for the private Add-FabricTypeName helper: inserts a PSTypeName at position 0
    so the .ps1xml format views apply, without duplicating an already-present type.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop
}

Describe 'Add-FabricTypeName' -Tag 'UnitTests' {

    It 'inserts the type name at position 0' {
        InModuleScope MicrosoftFabricMgmt {
            $o = [pscustomobject]@{ id = '1' }
            $o | Add-FabricTypeName -TypeName 'MicrosoftFabric.Widget'
            $o.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Widget'
        }
    }

    It 'decorates every item in an array' {
        InModuleScope MicrosoftFabricMgmt {
            $items = @([pscustomobject]@{ id = '1' }, [pscustomobject]@{ id = '2' })
            $items | Add-FabricTypeName -TypeName 'MicrosoftFabric.Widget'
            $items[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Widget'
            $items[1].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Widget'
        }
    }

    It 'does not add the type name twice' {
        InModuleScope MicrosoftFabricMgmt {
            $o = [pscustomobject]@{ id = '1' }
            $o | Add-FabricTypeName -TypeName 'MicrosoftFabric.Widget'
            $o | Add-FabricTypeName -TypeName 'MicrosoftFabric.Widget'
            @($o.PSObject.TypeNames | Where-Object { $_ -eq 'MicrosoftFabric.Widget' }).Count | Should -Be 1
        }
    }

    It 'does not throw on null input' {
        InModuleScope MicrosoftFabricMgmt {
            { $null | Add-FabricTypeName -TypeName 'MicrosoftFabric.Widget' } | Should -Not -Throw
        }
    }
}
