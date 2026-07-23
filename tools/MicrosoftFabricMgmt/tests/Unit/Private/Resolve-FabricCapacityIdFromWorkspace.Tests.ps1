BeforeAll {
    # Import the built module
    $BuiltModule = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe 'Resolve-FabricCapacityIdFromWorkspace' {

    BeforeEach {
        # Clear cache (both the capacityId cache and the cross-populated workspace name cache)
        InModuleScope MicrosoftFabricMgmt {
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
        }
    }

    Context 'When resolving workspace capacity successfully' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = 'Analytics WS'; capacityId = 'cap-123' }
            }
        }

        It 'Should return the capacity ID for the workspace' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'ws-guid'
                $result | Should -Be 'cap-123'
            }
        }

        It 'Should accept WorkspaceId from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $result = 'ws-guid' | Resolve-FabricCapacityIdFromWorkspace
                $result | Should -Be 'cap-123'
            }
        }
    }

    Context 'When using cache functionality' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = 'Cached WS'; capacityId = 'cap-cached' }
            }
        }

        It 'Should cache the resolved capacity ID after first call' {
            InModuleScope MicrosoftFabricMgmt {
                $result1 = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'cache-guid'
                $result2 = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'cache-guid'
                $result1 | Should -Be 'cap-cached'
                $result2 | Should -Be 'cap-cached'

                $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.WorkspaceCapacityId_cache-guid" -Fallback $null
                $cached | Should -Be 'cap-cached'
            }
        }

        It 'Should cross-populate the workspace name cache' {
            InModuleScope MicrosoftFabricMgmt {
                Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'xpop-guid'
                $cachedName = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_xpop-guid" -Fallback $null
                $cachedName | Should -Be 'Cached WS'
            }
        }
    }

    Context 'When workspace has no capacity assigned' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = 'No Capacity WS' }
            }
        }

        It 'Should return null' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'nocap-guid'
                $result | Should -BeNullOrEmpty
            }
        }
    }

    Context 'When workspace is not found' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt { return $null }
        }

        It 'Should return null' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'missing-guid'
                $result | Should -BeNullOrEmpty
            }
        }
    }

    Context 'When API call fails' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt { throw 'API connection failed' }
        }

        It 'Should return null on error' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId 'error-guid'
                $result | Should -BeNullOrEmpty
            }
        }
    }

    Context 'Parameter validation' {
        It 'Should require WorkspaceId parameter' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricCapacityIdFromWorkspace } | Should -Throw
            }
        }

        It 'Should not accept null or empty WorkspaceId' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $null } | Should -Throw
                { Resolve-FabricCapacityIdFromWorkspace -WorkspaceId '' } | Should -Throw
            }
        }
    }
}
