# CLAUDE.md - MicrosoftFabricMgmt Module Development Guide

## Overview

This document provides comprehensive instructions for AI-assisted development of the **MicrosoftFabricMgmt** PowerShell module located in `tools/MicrosoftFabricMgmt/`. This module provides a robust interface for managing Microsoft Fabric resources via the Fabric API.

**Module Purpose**: Enterprise-grade PowerShell module for Microsoft Fabric resource management with excellent error handling, comprehensive logging, and outstanding documentation.

**Build System**: [Sampler](https://github.com/gaelcolas/Sampler) - Modern PowerShell module scaffolding and build framework

**Key Frameworks**:
- **PSFramework**: Configuration management and logging ([Documentation](https://psframework.org/docs/PSFramework/overview))
- **Pester**: Unit and integration testing
- **PlatyPS**: Help documentation generation

**PowerShell Compatibility**:
- **CRITICAL**: Module MUST support both PowerShell 5.1 and PowerShell 7+
- Code must handle version-specific differences explicitly
- Test on both versions before deployment
- Use `$PSVersionTable.PSVersion` to detect version and branch logic when needed

**API Endpoint Validation**:
- **CRITICAL**: All API endpoints MUST be validated against the official [Microsoft Fabric REST API Specs](https://github.com/microsoft/fabric-rest-api-specs/)
- Primary reference: [platform/swagger.json](https://github.com/microsoft/fabric-rest-api-specs/blob/main/platform/swagger.json)
- Before implementing or modifying any API call:
  1. Verify the exact endpoint path in the swagger.json file
  2. Confirm the HTTP method (GET, POST, PATCH, DELETE, PUT)
  3. Validate required and optional parameters
  4. Check request/response schema structures
- Common endpoint patterns:
  - Workspace resources: `/workspaces/{workspaceId}/resourceType`
  - Workspace role assignments: `/workspaces/{workspaceId}/roleAssignments`
  - Items: `/workspaces/{workspaceId}/items/{itemId}`
  - Item subresources: `/workspaces/{workspaceId}/items/{itemId}/subresource`
- Write unit tests that validate constructed URIs match official spec patterns

## Directory Structure

```
tools/MicrosoftFabricMgmt/
├── source/                          # Source code (This is the only folder to edit for development of source code for the users)
│   ├── MicrosoftFabricMgmt.psd1    # Module manifest
│   ├── prefix.ps1                   # Code injected at module start
│   ├── Private/                     # Internal functions
│   │   └── Write-Message.ps1        # (TO BE MIGRATED to PSFramework)
│   └── Public/                      # Exported functions (organized by resource)
│       ├── Workspace/
│       ├── Lakehouse/
│       ├── Warehouse/
│       ├── Notebook/
│       └── [other resources]/
├── tests/                           # Pester tests
│   ├── Unit/                        # Unit tests (mocked)
│   └── Integration/                 # Integration tests (real API)
├── docs/                            # Generated markdown documentation
├── output/                          # Build artifacts (DO NOT EDIT)
│   └── module/                      # Built module
├── build.yaml                       # Sampler build configuration
├── build.ps1                        # Build script entry point
├── RequiredModules.psd1            # Build dependencies
├── Resolve-Dependency.psd1         # Dependency resolution config
└── README.md                        # User-facing documentation
```

## Development Principles

### 1. Code Quality Standards

**ALWAYS** follow these principles when writing or modifying code:

- **Explicitness over Brevity**: Prefer clear, self-documenting code over clever shortcuts
- **Fail Fast, Fail Clearly**: Validate inputs early and provide actionable error messages
- **Consistency**: Follow existing patterns in the codebase
- **Testability**: Write code that can be easily unit tested with mocked dependencies
- **Performance**: Use efficient PowerShell patterns (`.Where()` instead of `Where-Object`, etc.)

### 2. Error Handling Excellence

Every public function MUST have comprehensive error handling.

**User-Friendly Error Messages**: The module automatically extracts meaningful error information from Microsoft Fabric API responses:

```powershell
# When an API error occurs (like 409 Conflict), users see:
# "API request failed with status code 409 (Conflict). ErrorCode: WorkspaceNameAlreadyExists | Workspace name already exists | RequestId: 29fc4e3d-d625-4222-8328-5a6a395e4db1"

# Instead of a raw JSON dump:
# "API request failed with status code 409. Error: Conflict Response: { "requestId": "...", "errorCode": "...", ... }"
```

The `Invoke-FabricAPIRequest` helper automatically parses API error responses and extracts:
- `errorCode` - The specific error code from Microsoft Fabric
- `message` - Human-readable error message
- `requestId` - Request tracking ID for Microsoft support

**Error Handling Pattern**:

```powershell
function Get-FabricResource {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ResourceId
    )

    try {
        # Validate authentication
        Write-PSFMessage -Level Debug -Message "Validating authentication token..."
        Test-TokenExpired

        # Construct API endpoint
        $apiEndpointURI = "{0}/resources/{1}" -f $FabricConfig.BaseUrl, $ResourceId
        Write-PSFMessage -Level Verbose -Message "API Endpoint: $apiEndpointURI"

        # Make API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $result = Invoke-FabricAPIRequest @apiParams

        if (-not $result) {
            Write-PSFMessage -Level Warning -Message "No resource found with ID: $ResourceId"
            return $null
        }

        Write-PSFMessage -Level Verbose -Message "Successfully retrieved resource: $ResourceId"
        return $result
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-PSFMessage -Level Error -Message "Failed to retrieve resource '$ResourceId': $errorDetails" -ErrorRecord $_
        throw
    }
}
```

**Key Error Handling Patterns**:
- Use `try/catch` for ALL public functions
- Log at appropriate levels (Debug, Verbose, Warning, Error)
- Include context in error messages (what operation, which resource)
- Use `Write-PSFMessage` with `-ErrorRecord $_` to preserve error details
- Throw exceptions for unrecoverable errors, return `$null` for "not found" scenarios

### 3. PSFramework Integration

#### Migrating from Write-Message to PSFramework

**CURRENT STATE**: The module uses a custom `Write-Message` function in `source/Private/Write-Message.ps1`.

**TARGET STATE**: All logging should use PSFramework's `Write-PSFMessage`.

**Migration Pattern**:

```powershell
# OLD (Write-Message)
Write-Message -Message "Processing workspace" -Level Info
Write-Message -Message "Detailed debug info" -Level Debug
Write-Message -Message "Something went wrong" -Level Error

# NEW (PSFramework)
Write-PSFMessage -Level Host -Message "Processing workspace"
Write-PSFMessage -Level Debug -Message "Detailed debug info"
Write-PSFMessage -Level Error -Message "Something went wrong" -ErrorRecord $_
```

**PSFramework Log Levels**:
- `Critical` - Fatal errors that stop execution
- `Important` - Significant events user should know about
- `Output` - Primary function output information
- `Host` - Information-level messages shown to user
- `Significant` - Important progress updates
- `VeryVerbose` - Detailed verbose information
- `Verbose` - Standard verbose information
- `SomewhatVerbose` - Light verbose information
- `Debug` - Debug information for troubleshooting
- `InternalComment` - Internal code flow notes

**Write-FabricLog Helper Function**:

The module provides `Write-FabricLog` as a simplified wrapper around `Write-PSFMessage`. This function uses a restricted set of log levels via `ValidateSet` attribute:

**Valid Levels**: `Host`, `Debug`, `Verbose`, `Warning`, `Error`, `Critical`

**IMPORTANT**: Do NOT use `Info` as a level - it is not valid and will cause parameter validation errors. Use `Host` for informational/success messages instead.

```powershell
# CORRECT - Use Host for informational messages
Write-FabricLog -Message "Workspace created successfully!" -Level Host
Write-FabricLog -Message "Processing item..." -Level Verbose
Write-FabricLog -Message "API request details" -Level Debug

# INCORRECT - Info is not a valid level
Write-FabricLog -Message "Workspace created successfully!" -Level Info  # ❌ Will fail validation
```

#### Configuration Management

Use PSFramework for all module configuration:

```powershell
# Define configuration in module initialization
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.BaseUrl' -Value 'https://api.fabric.microsoft.com/v1' -Initialize -Description 'Base URL for Fabric API'
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.TimeoutSeconds' -Value 30 -Initialize -Description 'Default API request timeout'
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Retry.MaxAttempts' -Value 3 -Initialize -Description 'Maximum retry attempts for failed API calls'
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Auth.TokenRefreshThreshold' -Value 300 -Initialize -Description 'Seconds before token expiry to trigger refresh'

# Retrieve configuration in functions
$baseUrl = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.BaseUrl'
$timeout = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.TimeoutSeconds'

# Allow user customization
Set-PSFConfig -FullName 'MicrosoftFabricMgmt.Api.TimeoutSeconds' -Value 60
```

#### Tab Completion

Implement dynamic parameter completion where appropriate:

```powershell
# For workspace names
Register-PSFTeppScriptblock -Name 'MicrosoftFabricMgmt.WorkspaceNames' -ScriptBlock {
    (Get-FabricWorkspace).DisplayName
}

# Apply to parameter
function Get-FabricLakehouse {
    [CmdletBinding()]
    param(
        [Parameter()]
        [PsfArgumentCompleter('MicrosoftFabricMgmt.WorkspaceNames')]
        [string]$WorkspaceName
    )
    # Function implementation
}
```

### 4. Authentication Patterns

The module supports three authentication methods:

#### User Principal (Interactive)
```powershell
Set-FabricApiHeaders -TenantId "00000000-0000-0000-0000-000000000000"
```

#### Service Principal
```powershell
$appSecret = "your-secret" | ConvertTo-SecureString -AsPlainText -Force
Set-FabricApiHeaders -TenantId $tenantId -AppId $appId -AppSecret $appSecret
```

#### Managed Identity
```powershell
Set-FabricApiHeaders -UseManagedIdentity
```

**Implementation Guidelines**:
- Always validate token expiry before API calls (`Test-TokenExpired`)
- Store credentials securely (use `SecureString` for secrets)
- Support token refresh without re-authentication
- Clear sensitive data from memory after use

### 5. Output Formatting - MANDATORY FOR ALL GET-* FUNCTIONS

**⚠️ CRITICAL REQUIREMENT**: Every Get-* function that returns Fabric resources MUST implement output formatting for user-friendly display.

#### Why Output Formatting Matters

Without formatting, users see raw API responses with GUIDs:
```powershell
# Bad: Raw output - confusing and not user-friendly
id                                   displayName      type      workspaceId                          capacityId
--                                   -----------      ----      -----------                          ----------
a1b2c3d4-e5f6-1234-5678-9abcdef01234 My Lakehouse     Lakehouse f9e8d7c6-b5a4-9876-5432-1fedcba98765 c4d5e6f7-...
```

With formatting, users see human-readable names:
```powershell
# Good: Formatted output - clear and actionable
Capacity Name        Workspace Name       Item Name        Type      ID
-------------        --------------       ---------        ----      --
Premium Capacity P1  Analytics Workspace  My Lakehouse     Lakehouse a1b2c3d4-...
```

#### Mandatory Implementation Steps

**Step 1: Add Type Decoration to Your Function**

Choose the appropriate method based on your function's structure:

**Method A: Using Select-FabricResource (Preferred)**
```powershell
# Add -TypeName parameter to Select-FabricResource call
Select-FabricResource -InputObject $dataItems `
    -Id $ResourceId `
    -DisplayName $ResourceName `
    -ResourceType 'ResourceType' `
    -TypeName 'MicrosoftFabric.ResourceType'  # <-- ADD THIS
```

**Method B: Direct Decoration**
```powershell
# Before returning results, add type decoration
if ($matchedItems) {
    Write-FabricLog -Message "Item(s) found" -Level Debug

    # Add type decoration for custom formatting
    $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.ResourceType'

    return $matchedItems
}
```

**Step 2: Verify Format View Exists**

Check if a format view exists for your resource type in `source/MicrosoftFabricMgmt.Format.ps1xml`:

```powershell
# Search for your resource type
Select-String -Path "source/MicrosoftFabricMgmt.Format.ps1xml" -Pattern "MicrosoftFabric.YourResourceType"
```

If NOT found, add a new view definition (see section 8 for format file syntax).

**Step 3: Test Formatting**

After building the module, verify formatting works:
```powershell
# Import rebuilt module
Remove-Module MicrosoftFabricMgmt -Force
.\build.ps1 -Tasks build
Import-Module .\output\module\MicrosoftFabricMgmt\1.0.2\MicrosoftFabricMgmt.psd1 -Force

# Test your function
$result = Get-FabricYourResource -WorkspaceId "test-id"
$result | Format-Table -AutoSize

# Should display: Capacity Name | Workspace Name | Item Name | Type | ID
```

#### Available Helper Functions

- **Add-FabricTypeName** (Private): Adds PSTypeName to objects for format file matching
- **Resolve-FabricCapacityName** (Public): Converts capacity GUID → capacity name (cached)
- **Resolve-FabricWorkspaceName** (Public): Converts workspace GUID → workspace name (cached)
- **Resolve-FabricCapacityIdFromWorkspace** (Public): Cascading resolution - workspaceId → capacityId (cached)
- **Clear-FabricNameCache** (Public): Clears all cached name resolutions

**Note**: Resolve-* functions are public so format file ScriptBlocks can access them.

#### Type Naming Convention

**MUST follow**: `MicrosoftFabric.{ResourceType}`

Examples:
- `MicrosoftFabric.Lakehouse`
- `MicrosoftFabric.Notebook`
- `MicrosoftFabric.Warehouse`
- `MicrosoftFabric.Workspace`
- `MicrosoftFabric.Capacity`
- `MicrosoftFabric.DataPipeline`
- `MicrosoftFabric.Environment`
- `MicrosoftFabric.KQLDatabase`
- `MicrosoftFabric.MLModel`
- `MicrosoftFabric.SparkJobDefinition`

#### Checklist Before Committing

- [ ] Function adds type decoration using `Add-FabricTypeName` or `Select-FabricResource -TypeName`
- [ ] Format view exists in `MicrosoftFabricMgmt.Format.ps1xml`
- [ ] Tested formatting displays correct columns (Capacity Name, Workspace Name, Item Name, Type, ID)
- [ ] Module builds successfully (`.\build.ps1 -Tasks build`)
- [ ] No errors or warnings in build output

#### Current Formatting Status (Phase 5 Complete)

**Formatted Functions (11 of 34)** - 32% Coverage:
1. Get-FabricLakehouse ✅
2. Get-FabricNotebook ✅
3. Get-FabricWarehouse ✅
4. Get-FabricWorkspace ✅
5. Get-FabricCapacity ✅
6. Get-FabricWorkspaceRoleAssignment ✅
7. Get-FabricEnvironment ✅
8. Get-FabricEventhouse ✅
9. Get-FabricApacheAirflowJob ✅
10. Get-FabricGraphQLApi ✅
11. Get-FabricEventstream ✅

**Remaining Functions (23)** - See [PHASE6_FORMATTING_COMPLETION.md](PHASE6_FORMATTING_COMPLETION.md) for tracking

**Priority 1 Functions to Format Next (8 most commonly used)**:
- Get-FabricReport
- Get-FabricSemanticModel
- Get-FabricDataPipeline
- Get-FabricDashboard
- Get-FabricSparkJobDefinition
- Get-FabricKQLDatabase
- Get-FabricKQLQueryset
- Get-FabricKQLDashboard

**Format Views Available**:
- `FabricItemView` - 32 item types configured
- `WorkspaceView` - Workspace objects
- `CapacityView` - Capacity objects
- `DomainView` - Domain objects
- `RoleAssignmentView` - Role assignments
- `JobView` - Job objects

#### Cascading Resolution (for items without capacityId)

Many Fabric items (Lakehouse, Notebook, Warehouse, etc.) only return `workspaceId` in their API response. The format system uses cascading resolution:

```
Item (has workspaceId only)
  ↓
Resolve-FabricCapacityIdFromWorkspace(workspaceId)
  ↓
Get workspace → extract capacityId
  ↓
Resolve-FabricCapacityName(capacityId)
  ↓
Display: "Premium Capacity P1"
```

Both levels are cached for optimal performance (200-500x faster on cache hit).

**Related Documentation**:
- See section 8: "Output Formatting with .ps1xml Files" for format file syntax
- See section 10: "Adding a New Function" for complete workflow
- See [docs/OUTPUT-FORMATTING.md](docs/OUTPUT-FORMATTING.md) for detailed guide
- See [PHASE6_FORMATTING_COMPLETION.md](PHASE6_FORMATTING_COMPLETION.md) for remaining work tracking

---

### 6. Function Structure Standards

Every public function MUST include:

#### Complete Comment-Based Help
```powershell
<#
.SYNOPSIS
Brief one-line description of what the function does.

.DESCRIPTION
Detailed description explaining the function's purpose, behavior, and any important notes.
Include information about what API endpoint is called, what operations are performed, etc.

.PARAMETER ParameterName
Description of the parameter, including valid values, format requirements, and examples.

.EXAMPLE
Get-FabricWorkspace -WorkspaceId "12345"

Description of what this example does and what output to expect.

.EXAMPLE
Get-FabricWorkspace -WorkspaceName "Production"

Another example showing different usage patterns.

.OUTPUTS
System.Object
Describe what the function returns, including object types and properties.

.NOTES
- API Endpoint: GET /v1/workspaces
- Requires: Authentication via Set-FabricApiHeaders
- Permissions: Workspace.Read.All or Workspace.ReadWrite.All

Author: Your Name
Version: 1.0.0
#>
```

#### Robust Parameter Validation
```powershell
function Update-FabricResource {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [Alias('Id')]
        [string]$ResourceId,

        [Parameter(Mandatory)]
        [ValidatePattern('^[a-zA-Z0-9_-]+$')]
        [ValidateLength(1, 256)]
        [string]$Name,

        [Parameter()]
        [ValidateSet('Development', 'Test', 'Production')]
        [string]$Environment = 'Development',

        [Parameter()]
        [ValidateRange(1, 100)]
        [int]$MaxRetries = 3
    )

    begin {
        Write-PSFMessage -Level Debug -Message "Starting $($PSCmdlet.MyInvocation.MyCommand)"
        Test-TokenExpired
    }

    process {
        foreach ($id in $ResourceId) {
            try {
                if ($PSCmdlet.ShouldProcess($id, "Update resource")) {
                    # Implementation
                }
            }
            catch {
                Write-PSFMessage -Level Error -Message "Failed to update resource '$id'" -ErrorRecord $_
                if ($ErrorActionPreference -eq 'Stop') {
                    throw
                }
            }
        }
    }

    end {
        Write-PSFMessage -Level Debug -Message "Completed $($PSCmdlet.MyInvocation.MyCommand)"
    }
}
```

**CRITICAL - PowerShell Output Behavior**:
- **DO NOT use `return` statements** unless explicitly needed for early exit or error conditions
- PowerShell functions automatically output any unassigned values to the pipeline
- Using `return` can suppress other outputs and cause unexpected behavior
- Let PowerShell's natural output behavior handle function results

```powershell
# GOOD - Natural output
function Get-FabricWorkspace {
    $result = Invoke-FabricAPIRequest @params
    Select-FabricResource -InputObject $result -Id $WorkspaceId -ResourceType 'Workspace'
}

# BAD - Unnecessary return statements
function Get-FabricWorkspace {
    $result = Invoke-FabricAPIRequest @params
    return Select-FabricResource -InputObject $result -Id $WorkspaceId -ResourceType 'Workspace'
}

# GOOD - return only for early exit
function Get-FabricWorkspace {
    if ($WorkspaceId -and $WorkspaceName) {
        Write-FabricLog -Message "Specify only one parameter" -Level Error
        return  # Early exit on error
    }
    # ... continue normal flow
}
```

**Parameter Naming Conventions**:
- Use full names, not abbreviations (e.g., `WorkspaceId` not `WsId`)
- Follow PowerShell conventions: `Get-*`, `Set-*`, `New-*`, `Remove-*`, `Update-*`
- Use singular nouns (e.g., `Workspace` not `Workspaces`) unless truly plural
- Prefix Fabric-specific items with `Fabric` (e.g., `Get-FabricWorkspace`)

### 6. Testing Requirements

#### Unit Tests (Mandatory for All Functions)

**Location**: `tests/Unit/<FunctionName>.Tests.ps1`

**Structure**:
```powershell
BeforeAll {
    # Import module
    $ModuleManifest = "$PSScriptRoot/../../source/MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop

    # Mock dependencies
    Mock Test-TokenExpired {}
    Mock Invoke-FabricAPIRequest {
        return [PSCustomObject]@{
            Id = '12345'
            DisplayName = 'Test Workspace'
            Type = 'Workspace'
        }
    }
}

Describe 'Get-FabricWorkspace' {
    Context 'When retrieving workspace by ID' {
        It 'Should return workspace with matching ID' {
            $result = Get-FabricWorkspace -WorkspaceId '12345'
            $result.Id | Should -Be '12345'
        }

        It 'Should call API with correct parameters' {
            Get-FabricWorkspace -WorkspaceId '12345'
            Should -Invoke Invoke-FabricAPIRequest -Times 1 -Exactly -ParameterFilter {
                $BaseURI -like '*/workspaces'
            }
        }
    }

    Context 'When workspace is not found' {
        BeforeAll {
            Mock Invoke-FabricAPIRequest { return $null }
        }

        It 'Should return null and log warning' {
            $result = Get-FabricWorkspace -WorkspaceId 'nonexistent'
            $result | Should -BeNullOrEmpty
        }
    }

    Context 'Parameter Validation' {
        It 'Should reject invalid workspace names' {
            { Get-FabricWorkspace -WorkspaceName 'Invalid@Name!' } | Should -Throw
        }
    }

    Context 'Error Handling' {
        BeforeAll {
            Mock Invoke-FabricAPIRequest { throw 'API Error' }
        }

        It 'Should handle API errors gracefully' {
            { Get-FabricWorkspace -WorkspaceId '12345' -ErrorAction Stop } | Should -Throw
        }
    }
}
```

**Unit Test Coverage Requirements**:
- Minimum 85% code coverage (currently set to 0% - needs improvement)
- Test all parameter combinations
- Test error conditions
- Test parameter validation
- Mock all external dependencies (API calls, authentication)

#### Integration Tests (Optional but Recommended)

**Location**: `tests/Integration/<FunctionName>.Integration.Tests.ps1`

**Tagged with**: `Integration` tag for conditional execution

```powershell
Describe 'Get-FabricWorkspace Integration' -Tag 'Integration' {
    BeforeAll {
        # Requires real authentication
        if (-not $env:FABRIC_TENANT_ID) {
            Set-ItResult -Skip -Because 'Integration tests require real credentials'
        }
        Set-FabricApiHeaders -TenantId $env:FABRIC_TENANT_ID
    }

    It 'Should retrieve real workspace data' {
        $result = Get-FabricWorkspace
        $result | Should -Not -BeNullOrEmpty
        $result[0].Id | Should -Match '^[a-f0-9-]{36}$'
    }
}
```

**Running Tests**:
```powershell
# Run all unit tests (via Sampler - clean process)
.\build.ps1 -Tasks test

# Run tests directly with Pester (faster iteration)
Invoke-Pester -Path tests/Unit/Get-FabricWorkspace.Tests.ps1

# Run with coverage
.\build.ps1 -Tasks test

# Run integration tests (requires credentials)
Invoke-Pester -Path tests/Integration -Tag Integration
```

**Test Results Location**:
When running tests via `.\build.ps1 -Tasks test`, the Pester output files are saved to:
- **Directory**: `tools\MicrosoftFabricMgmt\output\testResults\`
- **Formats**: NUnit XML and other test result formats
- **Usage**: Instead of parsing large console output, read these files directly for detailed test analysis

This is particularly helpful when:
- Analyzing test failures across large test suites
- Generating test reports
- Integrating with CI/CD systems
- Debugging specific test results without re-running tests

### 7. Documentation Standards

#### Comment-Based Help (Mandatory)

Every function MUST have complete comment-based help as shown in section 5.

#### External Documentation Generation

The module uses PlatyPS to generate markdown documentation:

```powershell
# Generate/update markdown help
New-MarkdownHelp -Module MicrosoftFabricMgmt -OutputFolder ./docs -Force

# Generate external XML help for PowerShell
New-ExternalHelp -Path ./docs -OutputPath ./en-US -Force
```

**Documentation Requirements**:
- At least 2 examples per function
- Include real-world usage scenarios
- Document all parameters with examples
- Specify required permissions and API endpoints
- Include links to related functions
- Document common error scenarios and solutions

#### About Topics

Create conceptual help topics in `docs/en-US/`:

```powershell
# docs/en-US/about_MicrosoftFabricMgmt_Authentication.help.txt
TOPIC
    about_MicrosoftFabricMgmt_Authentication

SHORT DESCRIPTION
    Explains authentication methods for the MicrosoftFabricMgmt module.

LONG DESCRIPTION
    The MicrosoftFabricMgmt module supports three authentication methods:
    - User Principal (Interactive)
    - Service Principal
    - Managed Identity

    [Detailed explanation with examples]

EXAMPLES
    [Code examples]

SEE ALSO
    Set-FabricApiHeaders
    Test-TokenExpired
```

**Recommended About Topics**:
- `about_MicrosoftFabricMgmt_Authentication`
- `about_MicrosoftFabricMgmt_ErrorHandling`
- `about_MicrosoftFabricMgmt_Configuration`
- `about_MicrosoftFabricMgmt_QuickStart`

### 8. Output Formatting Standards

#### Overview

PowerShell formatting files (`.ps1xml`) define how objects are displayed to users without modifying the actual objects in the pipeline. The module MUST provide custom formatting to ensure consistent, user-friendly output across all 244 functions.

**Key Principle**: Formatting affects **display only**, not pipeline data. All object properties remain available even if not displayed by default.

**Reference Documentation**:
- [Formatting File Overview](https://learn.microsoft.com/en-us/powershell/scripting/developer/format/formatting-file-overview?view=powershell-7.5)
- [Format Schema XML Reference](https://learn.microsoft.com/en-us/powershell/scripting/developer/format/format-schema-xml-reference?view=powershell-7.5)

#### MicrosoftFabricMgmt Output Format Standard

**CRITICAL**: All module functions MUST return objects with consistent, user-friendly display formatting.

**Standard Display Order** (applies to all item/resource objects):
1. **Capacity Name** (resolved from CapacityId if available)
2. **Workspace Name** (resolved from WorkspaceId)
3. **Item Name** (DisplayName property)
4. **Item Type** (Type property)
5. **...remaining properties** (in logical order)

**Rationale**: Users think hierarchically (Capacity → Workspace → Item), so display should match mental model.

---

### 8. Output Formatting with .ps1xml Files

#### Overview

PowerShell format files (`.ps1xml`) define **how objects are displayed** to users without modifying the actual object data in the pipeline. All object properties remain available even if not displayed by default.

**Key Principle**: Formatting files control **display only** - they don't affect the object in the pipeline.

#### File Location & Loading

**Format File Location**: `source/MicrosoftFabricMgmt.Format.ps1xml`

**Loading Format File**:
```powershell
# In module manifest (MicrosoftFabricMgmt.psd1)
@{
    FormatsToProcess = @('MicrosoftFabricMgmt.Format.ps1xml')
}
```

**IMPORTANT**: Format files are loaded at module import and cached by PowerShell. To test changes:
```powershell
# Remove module from session
Remove-Module MicrosoftFabricMgmt -Force

# Rebuild module
.\build.ps1 -Tasks build

# Import fresh module
Import-Module .\output\module\MicrosoftFabricMgmt\1.0.0\MicrosoftFabricMgmt.psd1 -Force
```

---

### 9. Output Formatting Standards

#### Overview

PowerShell formatting files (`.ps1xml`) control how objects appear when displayed to the user **without modifying the actual objects** in the pipeline. All object properties remain available for further pipeline operations even if not displayed.

**Critical Principle**: Formatting affects **display only**, not the data itself. Users can always access all properties via `Select-Object`, `Format-List`, etc.

#### Module Formatting File Location

**File**: `source/MicrosoftFabricMgmt.Format.ps1xml`

This file is automatically loaded when the module imports. It defines default display formats for all Fabric resource types.

#### Output Display Priority (User-Centric Design)

All Fabric resources should follow this display priority to maximize usefulness:

**Primary Context (Always Visible)**:
1. **Capacity Name** - Where the resource lives (highest context)
2. **Workspace Name** - Logical container for resources
3. **Item Name** - The resource's display name
4. **Item Type** - What kind of resource (Lakehouse, Notebook, etc.)

**Secondary Information** (shown in List view or when selected):
- All other properties (IDs, descriptions, metadata, etc.)

### Why This Order Matters

**User Mental Model**: "Which capacity → which workspace → which item → what type"
- Users think in terms of names, not GUIDs
- Capacity/Workspace provide context for where the item lives
- Item Name + Type identify the specific resource

**Current Problem**: Default output shows:
```powershell
id                   : 12345-guid
displayName          : MyLakehouse
type                 : Lakehouse
workspaceId          : workspace-guid
```

**Desired Output**:
```
Capacity      Workspace         Item              Type
--------      ---------         ----              ----
Premium-001   Analytics WS      Sales Data        Lakehouse
Premium-001   Analytics WS      Customer Reports  Notebook
```

---

## Output Formatting Implementation Plan

### Phase 5A: Output Formatting (NEW SCOPE)

#### Goal: User-Friendly Default Display

**Problem**: Current output shows raw API responses with GUIDs instead of human-readable names.

**Solution**: Implement PowerShell format files (`.ps1xml`) to control default display output.

### Standard Output Format (All Resources)

**Display Priority**:
1. **Capacity Name** (resolved from capacityId)
2. **Workspace Name** (resolved from workspaceId)
3. **Item Name** (displayName property)
4. **Item Type** (type property)
5. **Rest of properties** (in default order)

### Implementation Plan

#### Step 1: Create Helper Functions for Name Resolution

**New Helper Functions Needed**:

1. **`Get-FabricCapacityName`** - Resolve Capacity ID to Name
   ```powershell
   function Get-FabricCapacityName {
       param([string]$CapacityId)
       # Cache results for performance
       # Return capacity display name
   }
   ```

2. **Get-FabricWorkspaceName** - Resolve workspace ID to name
   ```powershell
   function Get-FabricWorkspaceName {
       param([string]$WorkspaceId)
       # Cache lookups to avoid repeated API calls
   }
   ```

3. **Add-FabricResourceNames** - Helper to enrich objects
   ```powershell
   function Add-FabricResourceNames {
       param([Parameter(ValueFromPipeline)]$InputObject)
       process {
           # Add CapacityName, WorkspaceName to object
       }
   }
   ```

### Implementation Plan

1. **Create Format.ps1xml File**
   - Location: `source/MicrosoftFabricMgmt.Format.ps1xml`
   - Define default table views for all major resource types
   - Priority columns: Capacity Name, Workspace Name, Item Name, Item Type

2. **Create Helper Functions**
   - `Get-FabricCapacityName` - Resolve capacity ID to name
   - `Get-FabricWorkspaceName` - Resolve workspace ID to name
   - Add caching to avoid repeated API calls

3. **Update Module Manifest**
   - Add `FormatsToProcess` entry in `.psd1` file

4. **Add Type Data**
   - Create `.ps1xml` types file to add computed properties
   - `PSTypeName` decorators for custom formatting

Would you like me to:
1. Start implementing the formatting file structure?
2. Create helper functions for resolving Capacity/Workspace names from IDs?
3. Both?

#### Build Configuration

The module uses Sampler for building, testing, and releasing. Key files:

- **build.yaml**: Main Sampler configuration (workflows, tasks, Pester settings)
- **RequiredModules.psd1**: Build dependencies (Pester, PSScriptAnalyzer, etc.)
- **Resolve-Dependency.psd1**: Dependency resolution settings

#### Initial Setup for Local Development

**REQUIRED FIRST STEP**: Before you can build or test locally, you MUST resolve dependencies:

```powershell
# Resolve dependencies (required for first-time setup or after dependency changes)
.\build.ps1 -ResolveDependency -noop

# This downloads all required modules to output/RequiredModules/
```

#### Common Build Tasks

**IMPORTANT**: Use Sampler's `build.ps1` script (NOT `Invoke-Build` directly) to ensure builds run in a clean PowerShell process with correct module paths.

```powershell
# Build and test (recommended - runs in clean process)
.\build.ps1 -Tasks build,test

# Build the module only (compiles source to output/)
.\build.ps1 -Tasks build

# Run tests only
.\build.ps1 -Tasks test

# Clean output directory
.\build.ps1 -Tasks clean

# Package for distribution
.\build.ps1 -Tasks pack

# Full release process (requires GitHub token)
.\build.ps1 -Tasks publish
```

#### Running Tests Directly with Pester

You can also run Pester tests directly (useful for faster iteration during development):

```powershell
# Run all tests
Invoke-Pester ./tests/

# Run tests with specific tag
Invoke-Pester -Tag Unit
Invoke-Pester -Tag Integration
Invoke-Pester -Tag SubSetOfTestsTag

# Run specific test file
Invoke-Pester ./tests/Unit/Get-FabricWorkspace.Tests.ps1

# Run with code coverage
Invoke-Pester ./tests/ -CodeCoverage ./source/**/*.ps1
```

#### Build Workflow Customization

To add custom build tasks, edit `build.yaml`:

```yaml
BuildWorkflow:
  '.':
    - build
    - test
    - custom_task

# Define custom task
ModuleBuildTasks:
  Sampler:
    - '*.build.Sampler.ib.tasks'
  Sampler.GitHubTasks:
    - '*.ib.tasks'
```

#### Module Build Artifacts

- **Source**: `source/` - Edit code here
- **Built Module**: `output/module/MicrosoftFabricMgmt/` - Generated, do not edit
- **Versioning**: Controlled by GitVersion.yml (semantic versioning)

### 9. Code Style and Conventions

#### PowerShell Best Practices

**CRITICAL**: All code MUST follow PowerShell best practices and naming conventions as defined in:
- [Strongly Encouraged Development Guidelines](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/strongly-encouraged-development-guidelines?view=powershell-7.5)
- [PowerShell Practice and Style Guide](https://github.com/PoshCode/PowerShellPracticeAndStyle)

```powershell
# Use full cmdlet names, not aliases
Get-ChildItem  # Not: ls, dir, gci

# Use approved verbs only (Get, Set, New, Remove, Add, Update, etc.)
Get-FabricWorkspace  # Not: Fetch-FabricWorkspace, Retrieve-FabricWorkspace

# Proper parameter splatting
$apiParams = @{
    BaseURI = $uri
    Headers = $headers
    Method  = 'Get'
}
Invoke-FabricAPIRequest @apiParams

# Efficient filtering
$workspaces.Where({ $_.Type -eq 'Lakehouse' }, 'First')  # Not: | Where-Object

# Clear variable names (PascalCase for parameters, camelCase for local variables)
$workspaceId  # Not: $wsId, $id, $w

# Use explicit types when important
[string]$workspaceName = $null  # Makes intent clear

# Singular nouns for resource names
Get-FabricWorkspace  # Not: Get-FabricWorkspaces (even when returning multiple)
```

#### PowerShell Version Compatibility

**CRITICAL**: Code must work on both PowerShell 5.1 and PowerShell 7+

**Version-Specific Considerations**:

```powershell
# Ternary operator (PowerShell 7+ only) - DO NOT USE
$value = $condition ? $trueValue : $falseValue  # BREAKS in PS 5.1

# Use traditional if/else instead
$value = if ($condition) { $trueValue } else { $falseValue }  # Works in both

# Null coalescing (PowerShell 7+ only) - DO NOT USE
$value = $variable ?? $defaultValue  # BREAKS in PS 5.1

# Use traditional pattern instead
$value = if ($null -eq $variable) { $defaultValue } else { $variable }  # Works in both

# Pipeline chain operators (PowerShell 7+ only) - DO NOT USE
Get-Item file.txt && Get-Content file.txt  # BREAKS in PS 5.1

# Use traditional error handling
if (Get-Item file.txt -ErrorAction SilentlyContinue) {
    Get-Content file.txt
}

# .ForEach() and .Where() methods - Available in PS 4+, safe to use
$results.Where({ $_.Id -eq $targetId }, 'First')  # Works in both
$items.ForEach({ $_.Name })  # Works in both
```

**Testing Requirements**:
- Test all code on both PowerShell 5.1 and PowerShell 7.4+
- Use `$PSVersionTable.PSVersion` to detect version for branching logic
- Document any version-specific behavior
- CI/CD should test both versions

#### Formatting Standards

- **Indentation**: 4 spaces (no tabs)
- **Braces**: Opening brace on same line (K&R style)
- **Line Length**: Prefer lines under 120 characters
- **Encoding**: UTF-8 with BOM (configured in build.yaml)

```powershell
# Good
if ($condition) {
    Do-Something
}

# Bad
if ($condition)
{
    Do-Something
}
```

#### PSScriptAnalyzer

All code must pass PSScriptAnalyzer:

```powershell
# Run analyzer
Invoke-ScriptAnalyzer -Path ./source -Recurse -ReportSummary

# Rules are configured in PSScriptAnalyzerSettings.psd1 (if present)
```

**Critical Rules** (must not violate):
- PSAvoidUsingPositionalParameters
- PSAvoidUsingCmdletAliases
- PSAvoidUsingPlainTextForPassword
- PSUseDeclaredVarsMoreThanAssignments
- PSUseApprovedVerbs

### 10. Common Development Workflows

#### Adding a New Function

1. **Create the function file**:
   ```powershell
   # For a new Lakehouse operation
   New-Item -Path "source/Public/Lakehouse/Get-FabricLakehouseTable.ps1"
   ```

2. **Implement with full help and error handling** (see section 5)

3. **⚠️ MANDATORY: Add Output Formatting** (see section 10):

   **For Get-* Functions Returning Fabric Resources**:

   Every Get-* function MUST add type decoration to returned objects for proper formatting:

   ```powershell
   # Method 1: Direct decoration (for functions NOT using Select-FabricResource)
   if ($matchedItems) {
       # Add type decoration for custom formatting
       $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.ResourceType'
       return $matchedItems
   }

   # Method 2: Via Select-FabricResource (preferred pattern)
   Select-FabricResource -InputObject $dataItems `
       -Id $ResourceId `
       -DisplayName $ResourceName `
       -ResourceType 'ResourceType' `
       -TypeName 'MicrosoftFabric.ResourceType'
   ```

   **Type Name Convention**: `MicrosoftFabric.{ResourceType}`
   - Example: `MicrosoftFabric.Lakehouse`
   - Example: `MicrosoftFabric.Notebook`
   - Example: `MicrosoftFabric.Warehouse`
   - Example: `MicrosoftFabric.Workspace`
   - Example: `MicrosoftFabric.Capacity`

   **Add Format View to Format File** (if new resource type):

   Edit `source/MicrosoftFabricMgmt.Format.ps1xml` and add a view definition:

   ```xml
   <View>
     <Name>ResourceTypeView</Name>
     <ViewSelectedBy>
       <TypeName>MicrosoftFabric.ResourceType</TypeName>
     </ViewSelectedBy>
     <TableControl>
       <TableHeaders>
         <TableColumnHeader><Label>Capacity Name</Label><Width>25</Width></TableColumnHeader>
         <TableColumnHeader><Label>Workspace Name</Label><Width>25</Width></TableColumnHeader>
         <TableColumnHeader><Label>Item Name</Label><Width>30</Width></TableColumnHeader>
         <TableColumnHeader><Label>Type</Label><Width>15</Width></TableColumnHeader>
         <TableColumnHeader><Label>ID</Label></TableColumnHeader>
       </TableHeaders>
       <TableRowEntries>
         <TableRowEntry>
           <TableColumnItems>
             <!-- Capacity Name - Resolve from capacityId -->
             <TableColumnItem>
               <ScriptBlock>
                 if ($_.capacityId) {
                   try { Resolve-FabricCapacityName -CapacityId $_.capacityId }
                   catch { $_.capacityId }
                 } else { 'N/A' }
               </ScriptBlock>
             </TableColumnItem>
             <!-- Workspace Name - Resolve from workspaceId -->
             <TableColumnItem>
               <ScriptBlock>
                 if ($_.workspaceId) {
                   try { Resolve-FabricWorkspaceName -WorkspaceId $_.workspaceId }
                   catch { $_.workspaceId }
                 } else { 'N/A' }
               </ScriptBlock>
             </TableColumnItem>
             <!-- Item Name -->
             <TableColumnItem><PropertyName>displayName</PropertyName></TableColumnItem>
             <!-- Type -->
             <TableColumnItem><PropertyName>type</PropertyName></TableColumnItem>
             <!-- ID -->
             <TableColumnItem><PropertyName>id</PropertyName></TableColumnItem>
           </TableColumnItems>
         </TableRowEntry>
       </TableRowEntries>
     </TableControl>
   </View>
   ```

   **Verify Formatting Works**:
   ```powershell
   # Test that objects display with custom format
   $result = Get-FabricNewResource -WorkspaceId "test"
   $result | Format-Table -AutoSize

   # Should show: Capacity Name | Workspace Name | Item Name | Type | ID
   ```

4. **Add to manifest** (if not using automatic export):
   Edit `source/MicrosoftFabricMgmt.psd1` if needed

5. **Create unit test**:
   ```powershell
   New-Item -Path "tests/Unit/Get-FabricLakehouseTable.Tests.ps1"
   ```

6. **Build and test** (in clean process):
   ```powershell
   .\build.ps1 -Tasks build,test
   ```

7. **Generate documentation**:
   ```powershell
   New-MarkdownHelp -Command Get-FabricLakehouseTable -OutputFolder ./docs
   ```

#### Updating an Existing Function

1. **Read the existing function**:
   ```powershell
   Get-Content "source/Public/Workspace/Get-FabricWorkspace.ps1"
   ```

2. **Make changes following existing patterns**

3. **⚠️ MANDATORY: Check and Add Output Formatting**:

   If the function is a Get-* function that returns Fabric resources and does NOT already have type decoration:

   ```powershell
   # Check if type decoration exists
   Select-String -Path "source/Public/Workspace/Get-FabricWorkspace.ps1" -Pattern "Add-FabricTypeName|TypeName"

   # If NOT found, add type decoration before return statement:
   # - Use Add-FabricTypeName for direct decoration
   # - OR add -TypeName parameter to Select-FabricResource call
   ```

   **Example Update**:
   ```powershell
   # BEFORE (no formatting)
   if ($matchedItems) {
       Write-FabricLog -Message "Item(s) found" -Level Debug
       return $matchedItems
   }

   # AFTER (with formatting)
   if ($matchedItems) {
       Write-FabricLog -Message "Item(s) found" -Level Debug
       $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.ResourceType'
       return $matchedItems
   }
   ```

   **Or via Select-FabricResource**:
   ```powershell
   # BEFORE
   Select-FabricResource -InputObject $dataItems -Id $Id -ResourceType 'Resource'

   # AFTER
   Select-FabricResource -InputObject $dataItems -Id $Id -ResourceType 'Resource' -TypeName 'MicrosoftFabric.Resource'
   ```

4. **Update tests**:
   - Modify existing tests if behavior changed
   - Add new tests for new functionality

5. **Update documentation**:
   - Update comment-based help
   - Regenerate markdown: `Update-MarkdownHelp -Path ./docs`

6. **Run tests** (in clean process):
   ```powershell
   .\build.ps1 -Tasks build,test
   # OR run tests directly for faster iteration
   Invoke-Pester ./tests/Unit/Get-FabricWorkspace.Tests.ps1
   ```

#### Migrating Write-Message to PSFramework

For each function using `Write-Message`:

1. **Find all instances**:
   ```powershell
   Select-String -Path source/Public/**/*.ps1 -Pattern "Write-Message"
   ```

2. **Replace with Write-PSFMessage**:
   ```powershell
   # OLD
   Write-Message -Message "Processing item" -Level Info
   Write-Message -Message "Failed: $error" -Level Error

   # NEW
   Write-PSFMessage -Level Host -Message "Processing item"
   Write-PSFMessage -Level Error -Message "Failed: $error" -ErrorRecord $_
   ```

3. **Test thoroughly** - PSFramework has different level semantics

4. **Update tests to mock Write-PSFMessage** instead of Write-Message

### 11. API Design Patterns

#### Consistent Verb Usage

- `Get-Fabric*` - Retrieve resources (no side effects)
- `New-Fabric*` - Create new resources
- `Set-Fabric*` - Replace/overwrite resource
- `Update-Fabric*` - Modify existing resource (partial update)
- `Remove-Fabric*` - Delete resource
- `Add-Fabric*` - Add item to collection
- `Start-Fabric*` - Begin operation/process
- `Stop-Fabric*` - End operation/process

#### Resource Naming Patterns

**CRITICAL**: Follow [PowerShell Naming Conventions](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/strongly-encouraged-development-guidelines?view=powershell-7.5):
- Use **singular nouns** for resource names (Workspace, not Workspaces)
- Use **approved verbs** from `Get-Verb` cmdlet
- Use **PascalCase** for all public function names
- Prefix all resource types with `Fabric` for clarity

```powershell
# Resources (singular nouns)
Get-FabricWorkspace      # Not: Get-FabricWorkspaces
Get-FabricLakehouse      # Not: Get-FabricLakehouses
Get-FabricWarehouse      # Not: Get-FabricWarehouses

# Sub-resources (singular noun + property/sub-resource)
Get-FabricLakehouseTable
Get-FabricWorkspaceRoleAssignment

# Operations (approved verbs only)
Start-FabricLakehouseRefreshMaterializedLakeView
Invoke-FabricAPIRequest  # Generic API caller
```

#### Pipeline Support

Enable pipeline input where logical:

```powershell
function Remove-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('Id')]
        [string]$LakehouseId,

        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [string]$WorkspaceId
    )

    process {
        # Process each piped item
    }
}

# Usage
Get-FabricLakehouse -WorkspaceId $wsId |
    Where-Object { $_.Name -like 'test*' } |
    Remove-FabricLakehouse -Confirm:$false
```

#### ShouldProcess for Destructive Operations

```powershell
function Remove-FabricWarehouse {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [string]$WarehouseId,

        [Parameter(Mandatory)]
        [string]$WorkspaceId
    )

    try {
        if ($PSCmdlet.ShouldProcess(
            "Warehouse ID: $WarehouseId in Workspace: $WorkspaceId",
            "Remove Fabric Warehouse"
        )) {
            # Perform deletion
        }
    }
    catch {
        # Error handling
    }
}

# User can control with -Confirm and -WhatIf
Remove-FabricWarehouse -WarehouseId $id -WorkspaceId $wsId -WhatIf
Remove-FabricWarehouse -WarehouseId $id -WorkspaceId $wsId -Confirm:$false
```

### 12. Performance Optimization

#### Efficient Collection Processing

```powershell
# Use .Where() method for filtering (faster than Where-Object)
$workspaces.Where({ $_.Type -eq 'Lakehouse' })

# Use .ForEach() method for transformations
$workspaces.ForEach({ $_.Name })

# First match only (stops after finding one)
$workspaces.Where({ $_.Id -eq $targetId }, 'First')

# Avoid repeated API calls in loops
$allWorkspaces = Get-FabricWorkspace  # Call once
foreach ($ws in $targetList) {
    $found = $allWorkspaces.Where({ $_.Name -eq $ws }, 'First')
}
```

#### Pagination Handling

```powershell
function Invoke-FabricAPIRequest {
    param($BaseURI, $Headers, $Method)

    $allItems = [System.Collections.Generic.List[Object]]::new()
    $nextLink = $BaseURI

    while ($nextLink) {
        $response = Invoke-RestMethod -Uri $nextLink -Headers $Headers -Method $Method

        if ($response.value) {
            $allItems.AddRange($response.value)
        }

        $nextLink = $response.continuationToken ?
            "$BaseURI`?continuationToken=$($response.continuationToken)" :
            $null
    }

    return $allItems
}
```

#### Async Operations

For long-running operations:

```powershell
function Wait-FabricOperation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$OperationId,

        [Parameter()]
        [int]$TimeoutSeconds = 300,

        [Parameter()]
        [int]$PollingIntervalSeconds = 5
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $status = Get-FabricLongRunningOperation -OperationId $OperationId

        if ($status.Status -eq 'Succeeded') {
            return $status
        }
        elseif ($status.Status -eq 'Failed') {
            throw "Operation failed: $($status.Error)"
        }

        Write-PSFMessage -Level Verbose -Message "Operation status: $($status.Status). Waiting..."
        Start-Sleep -Seconds $PollingIntervalSeconds
    }

    throw "Operation timed out after $TimeoutSeconds seconds"
}
```

### 13. Security Considerations

#### Credential Handling

```powershell
# Always use SecureString for secrets
[Parameter(Mandatory)]
[SecureString]$AppSecret

# Convert securely
$credential = [PSCredential]::new('username', $AppSecret)
$plainSecret = $credential.GetNetworkCredential().Password

# Clear from memory when done
$credential = $null
$plainSecret = $null
[System.GC]::Collect()
```

#### Token Storage

```powershell
# Store in module-scoped variable (not global if possible)
$script:FabricAuthToken = $token

# Include expiration tracking
$script:FabricTokenExpiry = (Get-Date).AddHours(1)

# Clear on module removal
$MyInvocation.MyCommand.ScriptBlock.Module.OnRemove = {
    $script:FabricAuthToken = $null
    $script:FabricTokenExpiry = $null
}
```

#### API Request Logging

```powershell
# NEVER log sensitive data
Write-PSFMessage -Level Debug -Message "Making API request to: $uri"  # Good

# NEVER do this
Write-PSFMessage -Level Debug -Message "Headers: $($headers | ConvertTo-Json)"  # BAD - may contain tokens
```

### 14. Troubleshooting and Debugging

#### Enable Debug Logging

```powershell
# User-facing debug
$DebugPreference = 'Continue'
Get-FabricWorkspace -Debug

# PSFramework debug levels
Set-PSFLoggingProvider -Name logfile -Enabled $true -FilePath ./debug.log
Get-FabricWorkspace
```

#### Common Issues

**Issue**: "Token expired" errors
```powershell
# Solution: Implement proper token refresh
function Test-TokenExpired {
    if ($script:FabricTokenExpiry -and (Get-Date) -gt $script:FabricTokenExpiry) {
        Write-PSFMessage -Level Important -Message "Token expired. Please re-authenticate."
        throw "Authentication token has expired"
    }
}
```

**Issue**: API rate limiting
```powershell
# Solution: Implement retry with exponential backoff
function Invoke-FabricAPIRequestWithRetry {
    param($Uri, $Headers, $MaxRetries = 3)

    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            return Invoke-RestMethod -Uri $Uri -Headers $Headers
        }
        catch {
            if ($_.Exception.Response.StatusCode -eq 429) {
                $retryAfter = $_.Exception.Response.Headers['Retry-After']
                $waitTime = $retryAfter ? [int]$retryAfter : [Math]::Pow(2, $i)
                Write-PSFMessage -Level Warning -Message "Rate limited. Waiting $waitTime seconds..."
                Start-Sleep -Seconds $waitTime
            }
            else {
                throw
            }
        }
    }
    throw "Max retries exceeded"
}
```

### 15. Contributing Guidelines

When working on this module:

1. **Always build and test** before committing (use Sampler, not Invoke-Build directly):
   ```powershell
   # First time or after dependency changes
   .\build.ps1 -ResolveDependency -noop

   # Build and test in clean process (PowerShell 7+)
   pwsh -NoProfile -Command ".\build.ps1 -Tasks clean,build,test"

   # Build and test in PowerShell 5.1 (if available)
   powershell.exe -NoProfile -Command ".\build.ps1 -Tasks clean,build,test"
   ```

2. **Test on both PowerShell versions** - Code must work on PS 5.1 and 7+

3. **Avoid PowerShell 7+ only syntax**:
   - NO ternary operators (`?:`)
   - NO null coalescing (`??`)
   - NO pipeline chain operators (`&&`, `||`)
   - Use `New-Object` instead of `::new()`

4. **Follow existing patterns** - consistency is key

5. **Document everything** - future you will thank present you

6. **Write tests first** when possible (TDD approach)

7. **Update CHANGELOG.md** for user-facing changes

8. **Version appropriately**:
   - Patch (0.0.x): Bug fixes, no API changes
   - Minor (0.x.0): New features, backwards compatible
   - Major (x.0.0): Breaking changes

### 16. Resources and References

#### Official Documentation
- [Sampler Documentation](https://github.com/gaelcolas/Sampler)
- [PSFramework Documentation](https://psframework.org/docs/PSFramework/overview)
- [Pester Documentation](https://pester.dev/docs/quick-start)
- [PlatyPS Documentation](https://github.com/PowerShell/platyPS)
- [Microsoft Fabric API](https://learn.microsoft.com/fabric/rest-api/)

#### PowerShell Resources
- [PowerShell Best Practices](https://github.com/PoshCode/PowerShellPracticeAndStyle)
- [PSScriptAnalyzer Rules](https://github.com/PowerShell/PSScriptAnalyzer)
- [Approved Verbs](https://docs.microsoft.com/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands)

#### Module Examples
- Study existing functions in `source/Public/` for patterns
- Review tests in `tests/Unit/` for testing approaches
- Check `docs/` for documentation examples

---

## Quick Reference Commands

```powershell
# FIRST TIME SETUP - Resolve dependencies
.\build.ps1 -ResolveDependency -noop

# Build and test (recommended - runs in clean process via Sampler)
.\build.ps1 -Tasks build,test

# Build only
.\build.ps1 -Tasks build

# Test only (via Sampler)
.\build.ps1 -Tasks test

# Clean and rebuild
.\build.ps1 -Tasks clean,build

# Run tests directly with Pester (faster iteration)
Invoke-Pester ./tests/
Invoke-Pester ./tests/Unit/Get-FabricWorkspace.Tests.ps1
Invoke-Pester -Tag Unit
Invoke-Pester -Tag Integration

# Generate documentation
Import-Module ./output/module/MicrosoftFabricMgmt -Force
New-MarkdownHelp -Module MicrosoftFabricMgmt -OutputFolder ./docs -Force

# Check code quality
Invoke-ScriptAnalyzer -Path ./source -Recurse

# Install module locally for testing
Import-Module ./output/module/MicrosoftFabricMgmt -Force
```

## API Validation and Coverage

### Validation Script

Run the comprehensive validation script to check module coverage against the official Fabric API:

```powershell
# Run full validation
.\scripts\Validate-FabricModuleCoverage.ps1 -ValidationType All

# Run specific validations
.\scripts\Validate-FabricModuleCoverage.ps1 -ValidationType Coverage      # API endpoint coverage
.\scripts\Validate-FabricModuleCoverage.ps1 -ValidationType RawParameter  # -Raw parameter check
.\scripts\Validate-FabricModuleCoverage.ps1 -ValidationType Parameters    # Parameter completeness
```

### Current Validation Status (2026-01-20)

| Metric | Status | Target |
|--------|--------|--------|
| **API Coverage** | 41.4% (227/548 operations) | 80%+ |
| **-Raw Parameter** | 40.9% (36/88 Get-* functions) | 100% |
| **Parameter Completeness** | 47.6% (108/227 matched) | 90%+ |

### Three Validation Areas

#### 1. API Endpoint Coverage

**Goal**: Every Fabric API operation should have a matching PowerShell function.

**Current Status**: 227 of 548 API operations covered (41.4%)

**Missing Resource Types (No Coverage)**:
| Resource Type | Operations | Priority |
|--------------|------------|----------|
| dataflow | 13 | High |
| mirroredAzureDatabricksCatalog | 11 | Medium |
| graphModel | 10 | Medium |
| sqlDatabase | 9 | High |
| spark | 9 | Medium |
| anomalyDetector | 7 | Low (preview) |
| ontology | 7 | Low (preview) |
| graphQuerySet | 7 | Low |
| eventSchemaSet | 7 | Low |
| digitalTwinBuilderFlow | 7 | Low (preview) |
| operationsAgent | 7 | Low (preview) |
| cosmosDbDatabase | 7 | Medium |

**Resource Types with Partial Coverage**:
- platform: 26/118 operations (22%)
- admin: 16/52 operations (31%)
- environment: 21/28 operations (75%)

#### 2. -Raw Parameter Coverage

**Goal**: Every Get-* function should support `-Raw` parameter to return all properties with resolved names.

**Current Status**: 36 of 88 Get-* functions have `-Raw` (40.9%)

**Functions Missing -Raw Parameter** (52 functions):
- Definition functions: `Get-Fabric*Definition` (12 functions)
- Spark/Livy functions: `Get-FabricSparkSettings`, `Get-FabricLakehouseLivySession`, etc.
- Tenant functions: `Get-FabricTenantSetting`, `Get-Fabric*TenantSettingOverrides`
- Utility functions: `Get-FabricLongRunningOperation`, `Get-FabricLongRunningOperationResult`
- OneLake functions: `Get-FabricOneLakeShortcut`, `Get-FabricOneLakeDataAccessSecurity`

**Implementation Pattern**:
```powershell
# Add -Raw parameter to function
[Parameter()]
[switch]$Raw

# Pass to Select-FabricResource
Select-FabricResource -InputObject $dataItems -ResourceType 'Resource' -TypeName 'MicrosoftFabric.Resource' -Raw:$Raw
```

#### 3. Parameter Completeness

**Goal**: Every PowerShell function should expose all API parameters.

**Current Status**: 108 of 227 matched functions are complete (47.6%)

**Common Missing Parameters**:
- `continuationToken` - Pagination support (most List operations)
- `maxResults` - Result limiting
- `beta` - Preview API access
- `gatewayId` - Gateway filtering for connections
- `restorePointId` - Warehouse restore points
- Query parameters for filtering/sorting

### Improvement Priorities

#### Phase 1: -Raw Parameter (Quick Win)
Add `-Raw` to all 52 missing Get-* functions. This is mostly mechanical work.

**Command to find functions missing -Raw**:
```powershell
.\scripts\Validate-FabricModuleCoverage.ps1 -ValidationType RawParameter
```

#### Phase 2: Parameter Completeness
Add missing optional parameters, especially:
1. `continuationToken` for paginated operations
2. `maxResults` for result limiting
3. Query parameters for filtering

#### Phase 3: Missing Resource Types
Implement functions for missing resource types by priority:
1. **High**: dataflow, sqlDatabase
2. **Medium**: spark (partial), cosmosDbDatabase, graphModel
3. **Low**: Preview APIs (ontology, digitalTwinBuilder, etc.)

#### Phase 4: Platform/Admin Coverage
Many platform and admin operations are missing. Prioritize by usage.

### Validation Scripts Location

- **Main Validation**: `scripts/Validate-FabricModuleCoverage.ps1`
- **API Endpoint Testing**: `scripts/Test-FabricAPIEndpoint.ps1`
- **API Info Query**: `scripts/Get-FabricAPIEndpointInfo.ps1`
- **API Cache Update**: `scripts/Update-FabricAPISpecsCache.ps1`

### API Specs Cache

The module uses a cached copy of the [Microsoft Fabric REST API Specs](https://github.com/microsoft/fabric-rest-api-specs).

**Cache Location**: `tools/.api-specs-cache/`
- `fabric-api-lookup.json` - Full API details with descriptions
- `fabric-api-validation.json` - Simplified validation data

**Update Cache**:
```powershell
.\scripts\Update-FabricAPISpecsCache.ps1
```

---

## Module Roadmap

### Current Priorities
1. **Complete -Raw Parameter** - Add `-Raw` to all 52 remaining Get-* functions
2. **Add Missing Parameters** - Especially `continuationToken`, `maxResults`, query params
3. **Increase API Coverage** - Target 80% coverage (currently 41%)
4. **Increase test coverage** - Target 85% coverage (currently low)
5. **Improve error messages** - Make all errors actionable with clear next steps

### Future Enhancements
- Implement automatic token refresh
- Add retry logic with exponential backoff for API calls
- Add progress bars for long-running operations
- Implement result caching with PSFramework caching
- Add whatif/confirm support to all destructive operations
- Add missing resource types (dataflow, sqlDatabase, etc.)

---

**Last Updated**: 2026-01-20
**Module Version**: 1.0.4
**Original Author**: Tiago Balabuch
**Current Maintainer**: Rob Sewell
