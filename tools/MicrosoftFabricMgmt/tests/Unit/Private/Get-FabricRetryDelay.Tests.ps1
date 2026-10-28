BeforeAll {
    $BuiltModule    = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion  = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop
}

Describe 'Get-FabricRetryDelay' -Tag 'UnitTests' {

    It 'honors an integer Retry-After header' {
        InModuleScope MicrosoftFabricMgmt {
            Get-FabricRetryDelay -ResponseHeader @{ 'Retry-After' = 7 } -RetryCount 1 | Should -Be 7
        }
    }

    It 'honors an array Retry-After header (uses the first element)' {
        InModuleScope MicrosoftFabricMgmt {
            Get-FabricRetryDelay -ResponseHeader @{ 'Retry-After' = @(5, 9) } -RetryCount 1 | Should -Be 5
        }
    }

    It 'does NOT throw when Retry-After is absent (regression: Int64 tick overflow)' {
        InModuleScope MicrosoftFabricMgmt {
            { Get-FabricRetryDelay -ResponseHeader @{} -RetryCount 2 } | Should -Not -Throw
            (Get-FabricRetryDelay -ResponseHeader @{} -RetryCount 2) | Should -BeGreaterThan 0
        }
    }

    It 'does NOT throw when ResponseHeader is null' {
        InModuleScope MicrosoftFabricMgmt {
            { Get-FabricRetryDelay -ResponseHeader $null -RetryCount 1 } | Should -Not -Throw
        }
    }

    It 'clamps a huge Retry-After down to MaxDelaySeconds' {
        InModuleScope MicrosoftFabricMgmt {
            Get-FabricRetryDelay -ResponseHeader @{ 'Retry-After' = 9999 } -RetryCount 1 -MaxDelaySeconds 120 | Should -Be 120
        }
    }

    It 'clamps a zero Retry-After up to 1' {
        InModuleScope MicrosoftFabricMgmt {
            Get-FabricRetryDelay -ResponseHeader @{ 'Retry-After' = 0 } -RetryCount 1 | Should -Be 1
        }
    }

    It 'increases the backoff delay as the retry count grows' {
        InModuleScope MicrosoftFabricMgmt {
            $d1 = Get-FabricRetryDelay -ResponseHeader @{} -RetryCount 1 -BackoffMultiplier 2
            $d4 = Get-FabricRetryDelay -ResponseHeader @{} -RetryCount 4 -BackoffMultiplier 2
            $d4 | Should -BeGreaterThan $d1
        }
    }
}
