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

Every public function MUST have comprehensive error handling:

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

### 5. Function Structure Standards

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
# Run all unit tests
Invoke-Build test

# Run specific test file
Invoke-Pester -Path tests/Unit/Get-FabricWorkspace.Tests.ps1

# Run with coverage
Invoke-Build test -Configuration @{CodeCoverageThreshold=85}

# Run integration tests (requires credentials)
Invoke-Pester -Path tests/Integration -Tag Integration
```

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

### 8. Sampler Build System

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

3. **Add to manifest** (if not using automatic export):
   Edit `source/MicrosoftFabricMgmt.psd1` if needed

4. **Create unit test**:
   ```powershell
   New-Item -Path "tests/Unit/Get-FabricLakehouseTable.Tests.ps1"
   ```

5. **Build and test** (in clean process):
   ```powershell
   .\build.ps1 -Tasks build,test
   ```

6. **Generate documentation**:
   ```powershell
   New-MarkdownHelp -Command Get-FabricLakehouseTable -OutputFolder ./docs
   ```

#### Updating an Existing Function

1. **Read the existing function**:
   ```powershell
   Get-Content "source/Public/Workspace/Get-FabricWorkspace.ps1"
   ```

2. **Make changes following existing patterns**

3. **Update tests**:
   - Modify existing tests if behavior changed
   - Add new tests for new functionality

4. **Update documentation**:
   - Update comment-based help
   - Regenerate markdown: `Update-MarkdownHelp -Path ./docs`

5. **Run tests** (in clean process):
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

## Module Roadmap

### Current Priorities
1. **Migrate Write-Message to PSFramework** - Replace all instances with Write-PSFMessage
2. **Increase test coverage** - Target 85% coverage (currently 0%)
3. **Implement managed identity auth** - Add support for Azure managed identities
4. **Add tab completion** - Implement PSFramework tab completion for common parameters
5. **Improve error messages** - Make all errors actionable with clear next steps

### Future Enhancements
- Implement automatic token refresh
- Add retry logic with exponential backoff for API calls
- Create PowerShell format files for better object display
- Add progress bars for long-running operations
- Implement result caching with PSFramework caching
- Add whatif/confirm support to all destructive operations

---

**Last Updated**: 2026-01-07
**Module Version**: 0.5.4
**Original Author**: Tiago Balabuch
**Current Maintainer**: Rob Sewell
