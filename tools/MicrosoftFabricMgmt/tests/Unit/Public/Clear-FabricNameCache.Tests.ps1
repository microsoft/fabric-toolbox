BeforeAll {
    # Import the built module
    $BuiltModule = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe 'Clear-FabricNameCache' {

    BeforeEach {
        # Set up test cache entries
        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test1" -Value "Test Capacity 1"
        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test2" -Value "Test Capacity 2"
        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_test1" -Value "Test Workspace 1"
        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_test2" -Value "Test Workspace 2"
    }

    AfterEach {
        # Clean up
        Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*" | ForEach-Object {
            Set-PSFConfig -FullName $_.FullName -Value $null
            Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
        }
    }

    Context 'Basic functionality' {
        It 'Should clear all cached capacity names' {
            # Verify cache exists
            $beforeCount = (Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_*" | Measure-Object).Count
            $beforeCount | Should -BeGreaterThan 0

            # Clear cache
            Clear-FabricNameCache -Force

            # Verify cache values are null
            $capacityConfigs = Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_*"
            foreach ($config in $capacityConfigs) {
                $config.Value | Should -BeNullOrEmpty
            }
        }

        It 'Should clear all cached workspace names' {
            # Verify cache exists
            $beforeCount = (Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*" | Measure-Object).Count
            $beforeCount | Should -BeGreaterThan 0

            # Clear cache
            Clear-FabricNameCache -Force

            # Verify cache values are null
            $workspaceConfigs = Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*"
            foreach ($config in $workspaceConfigs) {
                $config.Value | Should -BeNullOrEmpty
            }
        }

        It 'Should clear all cache entries at once' {
            # Verify cache exists
            $beforeCount = (Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*" | Measure-Object).Count
            $beforeCount | Should -Be 4  # 2 capacity + 2 workspace

            # Clear cache
            Clear-FabricNameCache -Force

            # Verify all values are null
            $allConfigs = Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*"
            foreach ($config in $allConfigs) {
                $config.Value | Should -BeNullOrEmpty
            }
        }

        It 'Should not throw when clearing empty cache' {
            # Clear cache first
            Clear-FabricNameCache -Force

            # Clear again - should not throw
            { Clear-FabricNameCache -Force } | Should -Not -Throw
        }
    }

    Context 'ShouldProcess support' {
        It 'Should support WhatIf parameter' {
            # Get initial values
            $beforeValue = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test1" -Fallback $null

            # Run with WhatIf
            Clear-FabricNameCache -WhatIf

            # Verify cache still has values (not cleared)
            $afterValue = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test1" -Fallback $null
            $afterValue | Should -Be $beforeValue
        }
    }

    Context 'Force parameter' {
        It 'Should accept Force parameter' {
            { Clear-FabricNameCache -Force } | Should -Not -Throw
        }

        It 'Should clear cache without confirmation when Force is used' {
            $beforeValue = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test1"
            $beforeValue | Should -Not -BeNullOrEmpty

            Clear-FabricNameCache -Force

            # After clearing, Get-PSFConfigValue should return $null (not the fallback)
            $config = Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_test1"
            $config.Value | Should -BeNullOrEmpty
        }
    }

    Context 'Edge cases' {
        It 'Should handle clearing cache with special characters in keys' {
            # Create cache with special characters
            Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_guid-with-special-chars" -Value "Special Capacity"

            # Should not throw
            { Clear-FabricNameCache -Force } | Should -Not -Throw

            # Verify it was cleared
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.CapacityName_guid-with-special-chars" -Fallback $null
            $cached | Should -BeNullOrEmpty
        }

        It 'Should handle clearing large number of cache entries' {
            # Create many cache entries
            1..100 | ForEach-Object {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.CapacityName_bulk-$_" -Value "Bulk Capacity $_"
            }

            # Clear all
            { Clear-FabricNameCache -Force } | Should -Not -Throw

            # Verify all cleared (sample check)
            $sample = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.CapacityName_bulk-50" -Fallback $null
            $sample | Should -BeNullOrEmpty
        }
    }

    Context 'Error handling' {
        It 'Should not throw on errors' {
            { Clear-FabricNameCache -Force -ErrorAction Stop } | Should -Not -Throw
        }
    }
}
