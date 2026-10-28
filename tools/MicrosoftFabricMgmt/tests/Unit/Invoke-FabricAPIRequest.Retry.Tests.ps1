#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for the transient-failure retry loop in Invoke-FabricAPIRequest (PS7 path).
    The mocked Invoke-RestMethod emulates the real cmdlet's -StatusCodeVariable /
    -ResponseHeadersVariable out-parameters via Set-Variable into the caller scope, and a
    global response queue drives a 429-then-200 (and persistent-429) sequence.
#>

BeforeAll {
    $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [pscustomobject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            FabricHeaders = @{ Authorization = 'Bearer x' }
        }
    }
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
    Mock -ModuleName MicrosoftFabricMgmt Start-Sleep {}
    # Global queue avoids Pester module/script-scope sharing quirks.
    # The real Invoke-RestMethod sets -StatusCodeVariable/-ResponseHeadersVariable in its
    # caller's scope; Pester can't emulate that out-var directly, so we set globals of the
    # same name. Invoke-FabricAPIRequest reads $statusCode/$responseHeader as unassigned
    # locals, which resolve up-scope to these globals.
    Mock -ModuleName MicrosoftFabricMgmt Invoke-RestMethod {
        $r = $global:__fabResponses[$global:__fabIdx]
        if ($global:__fabIdx -lt ($global:__fabResponses.Count - 1)) { $global:__fabIdx++ }
        if ($StatusCodeVariable)      { Set-Variable -Name $StatusCodeVariable     -Value $r.Status  -Scope Global }
        if ($ResponseHeadersVariable) { Set-Variable -Name $ResponseHeadersVariable -Value $r.Headers -Scope Global }
        $r.Body
    }
}

AfterAll {
    Remove-Variable -Name __fabResponses, __fabIdx, statusCode, responseHeader -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Invoke-FabricAPIRequest retry behavior' -Tag 'UnitTests' {

    It 'retries a 429 then returns the successful result' {
        $global:__fabIdx = 0
        $global:__fabResponses = @(
            @{ Status = 429; Headers = @{ 'Retry-After' = 1 }; Body = $null },
            @{ Status = 200; Headers = @{}; Body = [pscustomobject]@{ value = @([pscustomobject]@{ id = 'ok' }) } }
        )

        $result = Invoke-FabricAPIRequest -Headers @{ Authorization = 'Bearer x' } -BaseURI 'https://api.fabric.microsoft.com/v1/x' -Method Get
        @($result)[0].id | Should -Be 'ok'
        Should -Invoke -ModuleName MicrosoftFabricMgmt Invoke-RestMethod -Times 2 -Exactly
        Should -Invoke -ModuleName MicrosoftFabricMgmt Start-Sleep -Times 1 -Exactly
    }

    It 'throws after exhausting retries on persistent 429s' {
        $global:__fabIdx = 0
        $global:__fabResponses = @(
            @{ Status = 429; Headers = @{ 'Retry-After' = 1 }; Body = [pscustomobject]@{ errorCode = 'TooManyRequests'; message = 'rate limited' } }
        )

        { Invoke-FabricAPIRequest -Headers @{ Authorization = 'Bearer x' } -BaseURI 'https://api.fabric.microsoft.com/v1/x' -Method Get -MaxRetries 2 -ErrorAction Stop } |
            Should -Throw -ExpectedMessage '*429*'
        # 1 initial attempt + 2 retries = 3 calls
        Should -Invoke -ModuleName MicrosoftFabricMgmt Invoke-RestMethod -Times 3 -Exactly
    }
}
