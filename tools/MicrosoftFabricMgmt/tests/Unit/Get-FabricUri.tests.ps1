Describe "Get-FabricUri Unit Tests" -Tag 'UnitTests' -Skip {
    Context "Validate parameters" {
        It "Should only contain our specific parameters" {
            $CommandName = 'Get-FabricUri'
            [array]$params = ([Management.Automation.CommandMetaData]$ExecutionContext.SessionState.InvokeCommand.GetCommand($CommandName, 'Function')).Parameters.Keys
            [object[]]$knownParameters = 'SqlInstance', 'SqlCredential', 'Database', 'Name', 'InputObject', 'EnableException', 'Value'
            Compare-Object -ReferenceObject $knownParameters -DifferenceObject $params | Should -BeNullOrEmpty
        }
    }
}
#TODO: Fix test for internal function
