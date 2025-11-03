#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "WorkspaceId"
        "Workspace"
        "Verbose"
        "Debug"
        "ErrorAction"
        "WarningAction"
        "InformationAction"
        "ProgressAction"
        "ErrorVariable"
        "WarningVariable"
        "InformationVariable"
        "OutVariable"
        "OutBuffer"
        "PipelineVariable"

    )
)

Describe "Get-FabricWorkspaceUser" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Get-FabricWorkspaceUser
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Get-FabricWorkspaceUser
            $expected = $expectedParams
        }

        It "Has parameter: <_>" -ForEach $expected {
            $command | Should -HaveParameter $PSItem
        }

        It "Should have exactly the number of expected parameters $($expected.Count)" {
            $hasparms = $command.Parameters.Values.Name
            #$hasparms.Count | Should -BeExactly $expected.Count
            Compare-Object -ReferenceObject $expected -DifferenceObject $hasparms | Should -BeNullOrEmpty
        }
    }

    Context "Alias validation" {
        $testCases = @('Get-FabWorkspaceUsers', 'Get-FabricWorkspaceUsers')

        It "Should have the alias <_>" -TestCases $TestCases {
            $Alias = Get-Alias -Name $_ -ErrorAction SilentlyContinue
            $Alias | Should -Not -BeNullOrEmpty
            $Alias.ResolvedCommand.Name | Should -Be  'Get-FabricWorkspaceUser'
        }
    }

    Context "Multiple Workspaces" {

        BeforeEach {

            function Confirm-TokenState {}
            Mock Confirm-TokenState {}

            Mock Get-FabricWorkspace {
                return @(
                    @{
                        displayName = 'prod-workspace'
                        # until the guid datatype is added
                        Id          = [guid]::NewGuid().Guid.ToString()
                    }, @{
                        displayName = "test-workspace"
                        # until the guid datatype is added
                        Id          = [guid]::NewGuid().Guid.ToString()
                    }
                )
            }
            Mock Invoke-FabricRestMethod {
                return @{
                    value = @(
                        @{
                            emailAddress         = 'name@domain.com'
                            groupUserAccessRight = 'Admin'
                            displayName          = 'Fabric'
                            identifier           = 'name@domain.com'
                            principalType        = 'User'
                        }, @{
                            emailAddress         = 'viewer@domain.com'
                            groupUserAccessRight = 'Viewer'
                            displayName          = 'Fabric viewer'
                            identifier           = 'viewer@domain.com'
                            principalType        = 'User'
                        }
                    )
                }
            }
        }

        It "Should return users for multiple workspaces passed to the Workspace parameter" {
            {Get-FabricWorkspaceUser -Workspace (Get-FabricWorkspace) }| Should -Not -BeNullOrEmpty
        }

        It "Should return users for multiple workspaces passed to the Workspace parameter from the pipeline" {
            { Get-FabricWorkspace | Get-FabricWorkspaceUser
            } | Should -Not -BeNullOrEmpty
        }
    }
}
