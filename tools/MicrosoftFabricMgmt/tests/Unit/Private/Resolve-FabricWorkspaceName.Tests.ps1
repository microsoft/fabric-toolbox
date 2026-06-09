BeforeAll {
    # Import the built module
    $BuiltModule = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe 'Resolve-FabricWorkspaceName' {

    BeforeEach {
        # Clear cache
        InModuleScope MicrosoftFabricMgmt {
            Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_*" | ForEach-Object {
                Unregister-PSFConfig -FullName $_.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
            }
        }
    }

    Context 'When resolving workspace ID successfully' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = 'Analytics Workspace' }
            }
        }

        It 'Should return workspace display name' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricWorkspaceName -WorkspaceId '67890-test-guid'
                $result | Should -Be 'Analytics Workspace'
            }
        }

        It 'Should accept WorkspaceId from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $result = '67890-test-guid' | Resolve-FabricWorkspaceName
                $result | Should -Be 'Analytics Workspace'
            }
        }

        It 'Should accept WorkspaceId by property name from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $object = [PSCustomObject]@{ workspaceId = '67890-test-guid' }
                $result = $object | Resolve-FabricWorkspaceName
                $result | Should -Be 'Analytics Workspace'
            }
        }
    }

    Context 'When using cache functionality' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = 'Cached-Workspace' }
            }
        }

        It 'Should cache results after first call' {
            InModuleScope MicrosoftFabricMgmt {
                $result1 = Resolve-FabricWorkspaceName -WorkspaceId 'cache-test-guid'
                $result2 = Resolve-FabricWorkspaceName -WorkspaceId 'cache-test-guid'
                $result1 | Should -Be 'Cached-Workspace'
                $result2 | Should -Be 'Cached-Workspace'

                # Verify cache was created
                $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.WorkspaceName_cache-test-guid" -Fallback $null
                $cached | Should -Be 'Cached-Workspace'
            }
        }

        It 'Should bypass cache when DisableCache is specified' {
            InModuleScope MicrosoftFabricMgmt {
                Resolve-FabricWorkspaceName -WorkspaceId 'nocache-test-guid'
                $result = Resolve-FabricWorkspaceName -WorkspaceId 'nocache-test-guid' -DisableCache
                $result | Should -Be 'Cached-Workspace'
            }
        }
    }

    Context 'When workspace is not found' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt { return $null }
        }

        It 'Should return the workspace ID as fallback' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricWorkspaceName -WorkspaceId 'nonexistent-guid'
                $result | Should -Be 'nonexistent-guid'
            }
        }
    }

    Context 'When API call fails' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt { throw 'API connection failed' }
        }

        It 'Should return the workspace ID as fallback on error' {
            InModuleScope MicrosoftFabricMgmt {
                $result = Resolve-FabricWorkspaceName -WorkspaceId 'error-guid'
                $result | Should -Be 'error-guid'
            }
        }
    }

    Context 'Parameter validation' {
        It 'Should require WorkspaceId parameter' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricWorkspaceName } | Should -Throw
            }
        }

        It 'Should not accept null or empty WorkspaceId' {
            InModuleScope MicrosoftFabricMgmt {
                { Resolve-FabricWorkspaceName -WorkspaceId $null } | Should -Throw
                { Resolve-FabricWorkspaceName -WorkspaceId '' } | Should -Throw
            }
        }
    }

    Context 'Real-world pipeline scenarios' {
        BeforeAll {
            Mock Get-FabricWorkspace -ModuleName MicrosoftFabricMgmt {
                return [PSCustomObject]@{ id = $WorkspaceId; displayName = "Workspace-$WorkspaceId" }
            }
        }

        It 'Should work with array of workspace IDs from pipeline' {
            InModuleScope MicrosoftFabricMgmt {
                $workspaceIds = @('guid-1', 'guid-2', 'guid-3')
                $results = $workspaceIds | Resolve-FabricWorkspaceName
                $results.Count | Should -Be 3
                $results[0] | Should -Be 'Workspace-guid-1'
                $results[1] | Should -Be 'Workspace-guid-2'
                $results[2] | Should -Be 'Workspace-guid-3'
            }
        }
    }
}
