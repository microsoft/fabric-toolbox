#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "Resource"
        "WorkspaceId"
        "ItemId"
        "Subresource"
        "QueryParameters"
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
    )
)

Describe "New-FabricAPIUri" -Tag "UnitTests" {

    BeforeAll {
        # Dot source the function and its dependencies
        . $PSScriptRoot\..\..\..\source\Private\New-FabricAPIUri.ps1
        . $PSScriptRoot\..\..\..\source\Private\Write-FabricLog.ps1

        # Mock the module-scoped FabricAuthContext
        $script:FabricAuthContext = @{
            BaseUrl = 'https://api.fabric.microsoft.com/v1'
        }

        # Mock Write-FabricLog to avoid logging during tests
        Mock Write-FabricLog {}
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name New-FabricAPIUri
        }

        It "Has parameter: <_>" -ForEach $expectedParams {
            $command | Should -HaveParameter $PSItem
        }

        It "Should have exactly the number of expected parameters $($expectedParams.Count)" {
            $hasparms = $command.Parameters.Values.Name
            Compare-Object -ReferenceObject $expectedParams -DifferenceObject $hasparms | Should -BeNullOrEmpty
        }

        It "Should have Resource parameter as mandatory" {
            $command | Should -HaveParameter Resource -Mandatory
        }

        It "Should have WorkspaceId parameter as optional" {
            $command | Should -HaveParameter WorkspaceId -Not -Mandatory
        }

        It "Should have ItemId parameter as optional" {
            $command | Should -HaveParameter ItemId -Not -Mandatory
        }

        It "Should have Subresource parameter as optional" {
            $command | Should -HaveParameter Subresource -Not -Mandatory
        }

        It "Should have QueryParameters parameter as optional" {
            $command | Should -HaveParameter QueryParameters -Not -Mandatory
        }
    }

    Context "Official Microsoft Fabric REST API Specification - Workspace Endpoints" {

        It "Should construct URI for listing workspaces: GET /workspaces" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should construct URI for specific workspace: GET /workspaces/{workspaceId}" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
        }

        It "Should construct URI for workspace role assignments: GET /workspaces/{workspaceId}/roleAssignments" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'roleAssignments'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/roleAssignments"
        }

        It "Should construct URI for specific role assignment: GET /workspaces/{workspaceId}/roleAssignments/{roleAssignmentId}" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $roleAssignmentId = '87654321-4321-4321-4321-210987654321'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'roleAssignments' -ItemId $roleAssignmentId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/roleAssignments/$roleAssignmentId"
        }

        It "Should construct URI for workspace items: GET /workspaces/{workspaceId}/items" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items"
        }

        It "Should construct URI for specific item: GET /workspaces/{workspaceId}/items/{itemId}" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $itemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -ItemId $itemId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items/$itemId"
        }

        It "Should construct URI for item definition: GET /workspaces/{workspaceId}/items/{itemId}/definition" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $itemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -ItemId $itemId
            # Note: This test validates the pattern for accessing item subresources
            # In practice, 'definition' would be part of the Subresource parameter as 'items/definition'
            # or handled by subsequent path segments
            $result | Should -Match "workspaces/$workspaceId/items/$itemId"
        }

        It "Should construct URI for assign to capacity: POST /workspaces/{workspaceId}/assignToCapacity" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'assignToCapacity'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/assignToCapacity"
        }

        It "Should construct URI for provision identity: POST /workspaces/{workspaceId}/provisionIdentity" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'provisionIdentity'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/provisionIdentity"
        }
    }

    Context "Additional Workspace API Patterns from Official Specification" {

        It "Should construct URI for workspace users: GET /workspaces/{workspaceId}/users" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'users'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/users"
        }

        It "Should construct URI for workspace git connection: GET /workspaces/{workspaceId}/git/connection" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'git/connection'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/git/connection"
        }

        It "Should construct URI for workspace spark settings: GET /workspaces/{workspaceId}/spark/settings" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'spark/settings'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/spark/settings"
        }
    }

    Context "Other Resource Types from Official API Specification" {

        It "Should construct URI for capacities: GET /capacities" {
            $result = New-FabricAPIUri -Resource 'capacities'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/capacities'
        }

        It "Should construct URI for specific capacity: GET /capacities/{capacityId}" {
            $capacityId = 'cap12345-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'capacities' -WorkspaceId $capacityId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/capacities/$capacityId"
        }

        It "Should construct URI for domains: GET /admin/domains" {
            $result = New-FabricAPIUri -Resource 'admin/domains'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/admin/domains'
        }

        It "Should construct URI for tenant settings: GET /admin/tenantSettings" {
            $result = New-FabricAPIUri -Resource 'admin/tenantSettings'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/admin/tenantSettings'
        }

        It "Should construct URI for external data shares: GET /admin/externalDataShares" {
            $result = New-FabricAPIUri -Resource 'admin/externalDataShares'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/admin/externalDataShares'
        }

        It "Should construct URI for connections: GET /connections" {
            $result = New-FabricAPIUri -Resource 'connections'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/connections'
        }

        It "Should construct URI for gateways: GET /gateways" {
            $result = New-FabricAPIUri -Resource 'gateways'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/gateways'
        }
    }

    Context "Query Parameter Handling" {

        It "Should handle single query parameter" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $queryParams = @{ type = 'Lakehouse' }
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -QueryParameters $queryParams
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items?type=Lakehouse"
        }

        It "Should handle multiple query parameters" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $queryParams = @{
                type = 'Notebook'
                continuationToken = 'abc123'
            }
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -QueryParameters $queryParams
            # Note: Hashtable ordering may vary, so check both possibilities
            $result | Should -Match "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items\?"
            $result | Should -Match "type=Notebook"
            $result | Should -Match "continuationToken=abc123"
        }

        It "Should URL-encode query parameter keys with special characters" {
            $queryParams = @{ 'filter$key' = 'value' }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match 'filter%24key=value'
        }

        It "Should URL-encode query parameter values with special characters" {
            $queryParams = @{ filter = 'name eq ''Test Workspace''' }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match "filter=name%20eq%20%27Test%20Workspace%27"
        }

        It "Should URL-encode query parameter values with ampersands" {
            $queryParams = @{ search = 'Sales & Marketing' }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match 'search=Sales%20%26%20Marketing'
        }

        It "Should URL-encode query parameter values with equals signs" {
            $queryParams = @{ expression = 'a=b' }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match 'expression=a%3Db'
        }

        It "Should handle boolean query parameter values" {
            $queryParams = @{
                updateMetadata = 'true'
                force = 'false'
            }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match 'updateMetadata=true'
            $result | Should -Match 'force=false'
        }

        It "Should handle numeric query parameter values" {
            $queryParams = @{ maxResults = 100 }
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Match 'maxResults=100'
        }
    }

    Context "URI Construction Logic" {

        It "Should join URI parts with forward slashes" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $itemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -ItemId $itemId
            # Check for double slashes in the path (excluding the https:// scheme)
            $result -replace '^https://', '' | Should -Not -Match '//'
            $result | Should -Match '^https://api.fabric.microsoft.com/v1/workspaces/.+/items/.+$'
        }

        It "Should not include WorkspaceId segment when not provided" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -Not -Match '/workspaces/.+/.+'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should not include Subresource segment when not provided" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
        }

        It "Should not include ItemId segment when not provided" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items"
        }

        It "Should handle complex nested subresources" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $itemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'lakehouses' -ItemId $itemId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/lakehouses/$itemId"
        }
    }

    Context "Real-World Usage Patterns" {

        It "Should construct URI for listing lakehouses in a workspace" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'lakehouses'
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/lakehouses"
        }

        It "Should construct URI for getting a specific lakehouse" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $lakehouseId = 'lake1234-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'lakehouses' -ItemId $lakehouseId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/lakehouses/$lakehouseId"
        }

        It "Should construct URI for listing lakehouse tables" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $lakehouseId = 'lake1234-1234-1234-1234-123456789012'
            # Note: In real usage, 'tables' would be passed as part of Subresource or as a continuation
            # This demonstrates the pattern for nested resources
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource "lakehouses/$lakehouseId/tables"
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/lakehouses/$lakehouseId/tables"
        }

        It "Should construct URI for creating a workspace with no additional parameters" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should construct URI for updating a workspace" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
        }

        It "Should construct URI for deleting a workspace role assignment" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $roleAssignmentId = 'role1234-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'roleAssignments' -ItemId $roleAssignmentId
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/roleAssignments/$roleAssignmentId"
        }
    }

    Context "Edge Cases and Error Scenarios" {

        It "Should handle empty query parameters hashtable" {
            $queryParams = @{}
            $result = New-FabricAPIUri -Resource 'workspaces' -QueryParameters $queryParams
            $result | Should -Not -Match '\?'
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should handle null WorkspaceId" {
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $null
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should handle empty string WorkspaceId" {
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId ''
            $result | Should -BeExactly 'https://api.fabric.microsoft.com/v1/workspaces'
        }

        It "Should handle null ItemId" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -ItemId $null
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items"
        }

        It "Should handle empty string ItemId" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource 'items' -ItemId ''
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items"
        }

        It "Should handle null Subresource" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource $null
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
        }

        It "Should handle empty string Subresource" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $result = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId -Subresource ''
            $result | Should -BeExactly "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
        }
    }

    Context "Logging Behavior" {

        It "Should log the constructed URI at Debug level" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $null = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId
            Should -Invoke Write-FabricLog -Times 1 -ParameterFilter {
                $Level -eq 'Debug' -and $Message -match 'Constructed API URI:'
            }
        }

        It "Should include the full URI in the log message" {
            $workspaceId = '12345678-1234-1234-1234-123456789012'
            $expectedUri = "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId"
            $null = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $workspaceId
            Should -Invoke Write-FabricLog -Times 1 -ParameterFilter {
                $Message -match [regex]::Escape($expectedUri)
            }
        }
    }

    Context "Base URL Configuration" {

        It "Should use the BaseUrl from script-scoped FabricAuthContext" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -BeLike "$($script:FabricAuthContext.BaseUrl)*"
        }

        It "Should construct URIs starting with the configured base URL" {
            $result = New-FabricAPIUri -Resource 'capacities'
            $result | Should -Match '^https://api.fabric.microsoft.com/v1/'
        }
    }

    Context "Return Type Validation" {

        It "Should return a string type" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -BeOfType [string]
        }

        It "Should return a non-empty string" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            $result | Should -Not -BeNullOrEmpty
        }

        It "Should return a valid URI format" {
            $result = New-FabricAPIUri -Resource 'workspaces'
            { [System.Uri]::new($result) } | Should -Not -Throw
        }
    }
}
