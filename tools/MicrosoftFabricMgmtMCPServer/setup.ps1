#Requires -Version 7.0
<#
.SYNOPSIS
    Sets up PowerShell dependencies and generates MCP configuration for the
    MicrosoftFabricMgmt MCP Server.

.DESCRIPTION
    This script:
    1. Installs required PowerShell modules (Az.Accounts, PSFramework, MicrosoftPowerBIMgmt)
       from the PowerShell Gallery.
    2. Generates .vscode/mcp.json pointing to the virtual-environment Python executable.

    Called automatically by setup.bat. Can also be run standalone.

.NOTES
    Run from within the MicrosoftFabricMgmtMCPServer directory.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$serverDir = $PSScriptRoot

# ---------------------------------------------------------------------------
# Install required PowerShell modules
# ---------------------------------------------------------------------------

$requiredModules = @(
    @{ Name = 'Az.Accounts';            MinimumVersion = '5.0.0'   }
    @{ Name = 'Az.Resources';           MinimumVersion = '6.0.0'   }
    @{ Name = 'PSFramework';            MinimumVersion = '1.12.0'  }
    @{ Name = 'MicrosoftPowerBIMgmt';   MinimumVersion = '1.2.0'   }
)

Write-Host "Setting PSGallery as trusted..."
try {
    Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted -ErrorAction SilentlyContinue
} catch {
    Write-Warning "Could not set PSGallery as trusted: $_"
}

foreach ($mod in $requiredModules) {
    $installed = Get-Module -ListAvailable -Name $mod.Name |
        Where-Object { $_.Version -ge [version]$mod.MinimumVersion } |
        Select-Object -First 1

    if ($installed) {
        Write-Host "  [OK] $($mod.Name) $($installed.Version) already installed."
    } else {
        Write-Host "  Installing $($mod.Name) >= $($mod.MinimumVersion)..."
        Install-Module -Name $mod.Name `
            -MinimumVersion $mod.MinimumVersion `
            -Scope CurrentUser `
            -Force `
            -AllowClobber `
            -SkipPublisherCheck
        Write-Host "  [OK] $($mod.Name) installed."
    }
}

# ---------------------------------------------------------------------------
# Verify the built MicrosoftFabricMgmt module exists
# ---------------------------------------------------------------------------

$moduleDir = Join-Path $serverDir "..\MicrosoftFabricMgmt\output\module\MicrosoftFabricMgmt"
$moduleDir = (Resolve-Path $moduleDir -ErrorAction SilentlyContinue)?.Path

if ($moduleDir -and (Test-Path $moduleDir)) {
    Write-Host "  [OK] Built module found at: $moduleDir"
} else {
    Write-Warning "Built MicrosoftFabricMgmt module not found."
    Write-Warning "Expected location: $serverDir\..\MicrosoftFabricMgmt\output\module\MicrosoftFabricMgmt"
    Write-Warning "Build the module first: cd ..\MicrosoftFabricMgmt && .\build.ps1 -Tasks build"
    Write-Warning "Or set the FABRIC_MGMT_MODULE_PATH environment variable to the module directory."
}

# ---------------------------------------------------------------------------
# Generate .vscode/mcp.json
# ---------------------------------------------------------------------------

$vscodeDir  = Join-Path $serverDir ".vscode"
$mcpJson    = Join-Path $vscodeDir "mcp.json"
$venvPython = Join-Path $serverDir ".venv\Scripts\python.exe"
$serverPy   = Join-Path $serverDir "server.py"

if (-not (Test-Path $vscodeDir)) {
    New-Item -ItemType Directory -Path $vscodeDir | Out-Null
}

$config = [ordered]@{
    servers = [ordered]@{
        "fabric-mgmt" = [ordered]@{
            command = $venvPython
            args    = @($serverPy)
            env     = [ordered]@{}
        }
    }
}

$config | ConvertTo-Json -Depth 5 | Set-Content -Path $mcpJson -Encoding UTF8
Write-Host "  [OK] Generated: $mcpJson"

# ---------------------------------------------------------------------------
# Print Claude Desktop config snippet
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "To use with Claude Desktop, add this to claude_desktop_config.json:"
Write-Host ""
Write-Host "  {`"mcpServers`": {`"fabric-mgmt`": {`"command`": `"$venvPython`", `"args`": [`"$serverPy`"]}}}"
Write-Host ""
Write-Host "Setup complete."
