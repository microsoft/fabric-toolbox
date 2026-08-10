#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Export-FabricAdminDataflow.
    Asserts the Power BI admin dataflows/{id}/export endpoint + GET method, that the raw
    response is returned when no -OutFile is given, and that -OutFile writes the bytes and
    returns the path. This function does NOT support ShouldProcess.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [pscustomobject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            FabricHeaders = @{ Authorization = 'Bearer test' }
        }
    }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        [byte[]](1, 2, 3, 4)
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Export-FabricAdminDataflow' -Tag 'UnitTests' {

    It 'calls GET on the admin dataflow export endpoint' {
        $null = Export-FabricAdminDataflow -DataflowId 'df-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/dataflows/df-1/export'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'returns the binary response when no -OutFile is supplied' {
        $r = Export-FabricAdminDataflow -DataflowId 'df-1'
        $r | Should -Be ([byte[]](1, 2, 3, 4))
    }

    It 'writes bytes to -OutFile and returns the path' {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("export-{0}.bin" -f ([guid]::NewGuid()))
        try {
            $r = Export-FabricAdminDataflow -DataflowId 'df-1' -OutFile $tmp
            $r | Should -Be $tmp
            Test-Path $tmp | Should -BeTrue
            [System.IO.File]::ReadAllBytes($tmp) | Should -Be ([byte[]](1, 2, 3, 4))
        }
        finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }
}
