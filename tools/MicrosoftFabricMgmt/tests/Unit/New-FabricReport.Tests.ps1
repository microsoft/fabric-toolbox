#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "ReportName"
    "ReportDescription"
    "ReportPathDefinition"
    "FolderId"
    "ProgressAction"
    "Verbose"
    "Debug"
    "ErrorAction"
    "WarningAction"
    "InformationAction"
    "InformationVariable"
    "OutVariable"
    "OutBuffer"
    "PipelineVariable"
    "ErrorVariable"
    "WarningVariable"
    "Confirm"
    "WhatIf"
)
)

BeforeAll {
    # Import the built module so private helpers can be mocked with -ModuleName.
    # Remove any copies auto-loaded during discovery so only a single instance is in scope.
    Get-Module MicrosoftFabricMgmt -All | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

Describe "New-FabricReport" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name New-FabricReport
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name New-FabricReport
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
}

Describe "New-FabricReport request body" -Tag "UnitTests" {

    BeforeAll {
        # Seed a fake auth context so the URI and request headers are populated
        InModuleScope $ModuleName {
            $script:FabricAuthContext.BaseUrl = 'https://api.fabric.microsoft.com/v1'
            $script:FabricAuthContext.FabricHeaders = @{ Authorization = 'Bearer test-token' }
        }
        Mock -CommandName Invoke-FabricAuthCheck -ModuleName $ModuleName { }
        Mock -CommandName Get-FileDefinitionPart -ModuleName $ModuleName {
            return @{ parts = @(@{ path = 'report.json'; payload = 'abc123'; payloadType = 'InlineBase64' }) }
        }
        Mock -CommandName Invoke-FabricAPIRequest -ModuleName $ModuleName {
            return [PSCustomObject]@{ id = 'report-1'; displayName = 'My Report' }
        }
    }

    It "Includes folderId in the request body when -FolderId is supplied" {
        New-FabricReport -WorkspaceId 'ws-1' -ReportName 'My Report' -ReportPathDefinition 'C:\fake\def' -FolderId 'folder-123' -Confirm:$false
        Should -Invoke -CommandName Invoke-FabricAPIRequest -ModuleName $ModuleName -Times 1 -Exactly -ParameterFilter {
            ($Body | ConvertFrom-Json).folderId -eq 'folder-123'
        }
    }

    It "Omits folderId from the request body when -FolderId is not supplied" {
        New-FabricReport -WorkspaceId 'ws-1' -ReportName 'My Report' -ReportPathDefinition 'C:\fake\def' -Confirm:$false
        Should -Invoke -CommandName Invoke-FabricAPIRequest -ModuleName $ModuleName -Times 1 -Exactly -ParameterFilter {
            $null -eq ($Body | ConvertFrom-Json).folderId
        }
    }

    It "Targets the reports endpoint for the supplied workspace" {
        New-FabricReport -WorkspaceId 'ws-1' -ReportName 'My Report' -ReportPathDefinition 'C:\fake\def' -Confirm:$false
        Should -Invoke -CommandName Invoke-FabricAPIRequest -ModuleName $ModuleName -Times 1 -Exactly -ParameterFilter {
            $BaseURI -like '*/workspaces/ws-1/reports'
        }
    }
}
