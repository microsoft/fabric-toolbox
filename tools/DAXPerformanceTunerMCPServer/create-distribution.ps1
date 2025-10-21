#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Creates a distribution zip file for DAXPerformanceTunerMCPServer
.DESCRIPTION
    Packages all necessary files for distribution, excluding build artifacts,
    virtual environments, and user-generated content.
.PARAMETER OutputPath
    The path where the zip file will be created. Defaults to parent directory.
.PARAMETER Version
    Optional version string to append to the filename (e.g., "1.0.0")
.EXAMPLE
    .\create-distribution.ps1
.EXAMPLE
    .\create-distribution.ps1 -Version "1.0.0" -OutputPath "C:\releases"
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputPath = "..\",
    
    [Parameter()]
    [string]$Version = ""
)

# Ensure we're in the script's directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ScriptDir

try {
    Write-Host "Creating DAX Performance Tuner MCP Server distribution..." -ForegroundColor Cyan
    
    # Create temporary directory for staging
    $TempDir = Join-Path $env:TEMP "DAXPerformanceTunerMCPServer_$(Get-Date -Format 'yyyyMMddHHmmss')"
    $StagingDir = Join-Path $TempDir "DAXPerformanceTunerMCPServer"
    New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null
    
    Write-Host "Staging files to: $StagingDir" -ForegroundColor Gray
    
    # Define files and folders to include
    $ItemsToInclude = @(
        @{ Path = "README.md"; Type = "File" }
        @{ Path = "LICENSE"; Type = "File" }
        @{ Path = "ATTRIBUTION.md"; Type = "File" }
        @{ Path = "requirements.txt"; Type = "File" }
        @{ Path = "setup.bat"; Type = "File" }
        @{ Path = "setup.ps1"; Type = "File" }
        @{ Path = "dotnet"; Type = "Directory" }
        @{ Path = "src"; Type = "Directory" }
    )
    
    # Directories and patterns to exclude during copy
    $ExcludeDirs = @(
        "__pycache__",
        "obj",
        "bin",  # Exclude all bin folders - users will build from source
        ".pytest_cache",
        "*.egg-info"
    )
    
    # File patterns to exclude (aligned with .gitignore)
    $ExcludeFilePatterns = @(
        "*.xml",     # Documentation files
        "*.pdb",     # Debug symbols
        "*.cache",
        "*.user",
        "*.suo"
    )
    
    # Copy files and directories
    foreach ($item in $ItemsToInclude) {
        $SourcePath = Join-Path $ScriptDir $item.Path
        $DestPath = Join-Path $StagingDir $item.Path
        
        if (Test-Path $SourcePath) {
            if ($item.Type -eq "File") {
                Write-Host "  ✓ Copying $($item.Path)" -ForegroundColor Green
                Copy-Item -Path $SourcePath -Destination $DestPath -Force
            }
            elseif ($item.Type -eq "Directory") {
                Write-Host "  ✓ Copying $($item.Path)\" -ForegroundColor Green
                
                # Create destination directory
                New-Item -ItemType Directory -Path $DestPath -Force | Out-Null
                
                # Copy directory contents with exclusions
                Get-ChildItem -Path $SourcePath -Recurse | ForEach-Object {
                    $RelativePath = $_.FullName.Substring($SourcePath.Length + 1)
                    $Exclude = $false
                    
                    # Check if path should be excluded
                    foreach ($ExcludePattern in $ExcludeDirs) {
                        if ($RelativePath -like "*$ExcludePattern*") {
                            $Exclude = $true
                            break
                        }
                    }
                    
                    # Exclude files matching patterns (XML, PDB, etc.)
                    if (-not $_.PSIsContainer) {
                        foreach ($FilePattern in $ExcludeFilePatterns) {
                            if ($_.Name -like $FilePattern) {
                                $Exclude = $true
                                break
                            }
                        }
                    }
                    
                    if (-not $Exclude) {
                        $DestItemPath = Join-Path $DestPath $RelativePath
                        
                        if ($_.PSIsContainer) {
                            New-Item -ItemType Directory -Path $DestItemPath -Force | Out-Null
                        }
                        else {
                            $DestItemDir = Split-Path -Parent $DestItemPath
                            if (-not (Test-Path $DestItemDir)) {
                                New-Item -ItemType Directory -Path $DestItemDir -Force | Out-Null
                            }
                            Copy-Item -Path $_.FullName -Destination $DestItemPath -Force
                        }
                    }
                }
            }
        }
        else {
            Write-Host "  ⚠ Warning: $($item.Path) not found" -ForegroundColor Yellow
        }
    }
    
    # Verify critical files exist
    $CriticalFiles = @(
        "src\dax_executor\Program.cs",  # C# source code (not compiled exe)
        "src\dax_executor\DaxExecutor.csproj",
        "dotnet\Microsoft.AnalysisServices.AdomdClient.dll",
        "setup.ps1"
    )
    
    $MissingCritical = @()
    foreach ($file in $CriticalFiles) {
        $FilePath = Join-Path $StagingDir $file
        if (-not (Test-Path $FilePath)) {
            $MissingCritical += $file
        }
    }
    
    if ($MissingCritical.Count -gt 0) {
        Write-Host "`n❌ ERROR: Missing critical files:" -ForegroundColor Red
        $MissingCritical | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        Write-Host "`nPlease ensure the project is built before creating distribution." -ForegroundColor Yellow
        Write-Host "Run: dotnet build src\dax_executor\DaxExecutor.csproj -c Release" -ForegroundColor Yellow
        exit 1
    }
    
    # Create zip file
    $ZipFileName = if ($Version) {
        "DAXPerformanceTunerMCPServer_v$Version.zip"
    } else {
        "DAXPerformanceTunerMCPServer_$(Get-Date -Format 'yyyyMMdd').zip"
    }
    
    $ZipPath = Join-Path $ScriptDir $ZipFileName
    
    # Remove existing zip if present
    if (Test-Path $ZipPath) {
        Write-Host "`nRemoving existing zip file..." -ForegroundColor Gray
        Remove-Item $ZipPath -Force
    }
    
    Write-Host "`nCreating zip file..." -ForegroundColor Cyan
    Compress-Archive -Path $StagingDir -DestinationPath $ZipPath -CompressionLevel Optimal
    
    # Get file size
    $ZipSize = (Get-Item $ZipPath).Length / 1MB
    
    Write-Host "`n✅ Distribution created successfully!" -ForegroundColor Green
    Write-Host "   Location: $ZipPath" -ForegroundColor White
    Write-Host "   Size: $([math]::Round($ZipSize, 2)) MB" -ForegroundColor White
    
    # Clean up staging directory
    Write-Host "`nCleaning up temporary files..." -ForegroundColor Gray
    Remove-Item $TempDir -Recurse -Force
    
    Write-Host "`n📦 Ready for distribution!" -ForegroundColor Cyan
    
} catch {
    Write-Host "`n❌ Error creating distribution: $_" -ForegroundColor Red
    throw
} finally {
    Pop-Location
}
