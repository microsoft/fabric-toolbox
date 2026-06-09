# Extract Lakehouse SQL Schema to SQL Project
# Uses SqlPackage to extract DACPAC contents directly to folder structure

param(
    # Azure AD tenant GUID for authentication with Fabric workspace
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    # Service principal client ID (app registration ID) for authentication
    [Parameter(Mandatory=$true)]
    [string]$ClientId,
    
    # Service principal secret for authentication with Azure
    [Parameter(Mandatory=$true)]
    [string]$ClientSecret,
    
    # JSON array of lakehouse SQL endpoints to extract from
    # Format: [{"name": "LakehouseName", "connectionString": "..."}, ...]
    [Parameter(Mandatory=$true)]
    [string]$SqlEndpointsJson,
    
    # Output folder for extracted SQL projects (default: lakehouse-schema)
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = "lakehouse-schema",

    # Remove duplicate objects from shortcut lakehouses (default: false)
    # Enable when shortcut lakehouses contain same objects as source lakehouses
    [Parameter(Mandatory=$false)]
    [bool]$RemoveDuplicateObjects = $false
)

$ErrorActionPreference = "Stop"

# Parse SQL endpoints
$sqlEndpoints = $SqlEndpointsJson | ConvertFrom-Json

if ($sqlEndpoints.Count -eq 0) {
    Write-Host "No SQL endpoints provided"
    exit 0
}

Write-Host "=========================================="
Write-Host "Lakehouse SQL Schema Extraction (SqlProj)"
Write-Host "=========================================="
Write-Host ""

# Create output directory
$outputRoot = Join-Path (Get-Location) $OutputPath
if (-not (Test-Path $outputRoot)) {
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
}

# Ensure SqlPackage is available
$sqlPackagePath = Get-Command sqlpackage -ErrorAction SilentlyContinue
if (-not $sqlPackagePath) {
    Write-Host "Installing SqlPackage..."
    dotnet tool install -g microsoft.sqlpackage
    $toolPath = "$env:USERPROFILE\.dotnet\tools"
    $env:PATH = "$toolPath;$env:PATH"
}

# ============================================================================
# PHASE 1: SCHEMA EXTRACTION
# ============================================================================
# This phase extracts SQL schemas from Fabric lakehouses using SqlPackage.
# Key points:
# - SqlPackage connects to SQL endpoint with AAD service principal auth
# - ExtractTarget=SchemaObjectType organizes output by schema/type/object
# - Tables are included in extraction (for compile-time resolution)
# - Tables are excluded during deployment via /p:ExcludeObjectTypes="Tables"
# - Extracted files are reorganized into schema/objecttype folder structure
# - Object names are sanitized (T-SQL reserved words, special chars removed)
# - Scalar functions are FILTERED OUT (not supported by Fabric - SQL70015 error)
#   Only Table-valued functions (TVF) and inline TVF are extracted and compiled
# ============================================================================

foreach ($endpoint in $sqlEndpoints) {
    $lakehouseName = $endpoint.displayName
    $connectionString = $endpoint.connectionString
    
    Write-Host ""
    Write-Host "Processing: $lakehouseName"
    Write-Host "Endpoint: $connectionString"
    
    # Create lakehouse project directory
    $lakehouseDir = Join-Path $outputRoot $lakehouseName
    if (Test-Path $lakehouseDir) {
        Remove-Item -Path $lakehouseDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $lakehouseDir -Force | Out-Null
    
    # Build connection string with AAD auth
    $fullConnectionString = "Server=tcp:$connectionString,1433;Initial Catalog=$lakehouseName;Authentication=Active Directory Service Principal;Encrypt=True;TrustServerCertificate=False;User Id=$ClientId;Password=$ClientSecret"
    
    # Create temp directory for logs only (not the extract target)
    $tempLogDir = Join-Path $env:TEMP "lakehouse_logs_$lakehouseName"
    if (Test-Path $tempLogDir) {
        Remove-Item -Path $tempLogDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempLogDir -Force | Out-Null
    
    # Extract target must NOT exist - SqlPackage creates it
    $extractDir = Join-Path $env:TEMP "lakehouse_extract_$lakehouseName"
    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    
    # Extract directly to folder structure using SqlPackage
    # ExtractTarget:SchemaObjectType organizes by schema/objecttype/objectname.sql
    Write-Host "Extracting SQL scripts from SQL endpoint..."
    $extractArgs = @(
        "/Action:Extract",
        "/SourceConnectionString:`"$fullConnectionString`"",
        "/TargetFile:`"$extractDir`"",
        "/p:ExtractTarget=SchemaObjectType",
        "/p:ExtractAllTableData=false",
        "/p:VerifyExtraction=false"
    )
    
    $process = Start-Process -FilePath "sqlpackage" -ArgumentList $extractArgs -Wait -PassThru -NoNewWindow -RedirectStandardOutput "$tempLogDir\extract_stdout.txt" -RedirectStandardError "$tempLogDir\extract_stderr.txt"
    
    if ($process.ExitCode -ne 0) {
        Write-Host "##[warning]Failed to extract schema for $lakehouseName"
        Get-Content "$tempLogDir\extract_stderr.txt" -ErrorAction SilentlyContinue
        continue
    }
    
    Write-Host "Schema extracted successfully"
    
    # Debug: Show extracted directory structure
    Write-Host "Extracted structure from SqlPackage:"
    Get-ChildItem -Path $extractDir -Recurse | ForEach-Object {
        $relPath = $_.FullName.Substring($extractDir.Length)
        Write-Host "  $relPath"
    }
    
    # Move extracted files to the lakehouse directory with folder organization
    # SqlPackage creates: <schema>/<objecttype>/<objectname>.sql
    # We want: <objecttype>/<schema>_<objectname>.sql
    
    # Include Tables for build - Views/Procs that reference tables need table definitions to compile
    # Tables are excluded during deployment via /p:ExcludeObjectTypes="Tables"
    # Note: Scalar-valued functions are NOT supported by Fabric - only Table-valued functions are extracted
    $typeMapping = @{
        "Tables" = "Tables"
        "ExternalTables" = "Tables"
        "External Tables" = "Tables"
        "Views" = "Views"
        "StoredProcedures" = "StoredProcedures"
        "Stored Procedures" = "StoredProcedures"
        "TableValuedFunctions" = "Functions"
        "Table-valued Functions" = "Functions"
        "InlineTableValuedFunctions" = "Functions"
        "Inline Table-valued Functions" = "Functions"
        "Schemas" = "Security"
        "Security" = "Security"
    }
    
    # Create our folder structure (Table-valued functions supported, Scalar-valued NOT supported)
    $folders = @("Tables", "Views", "StoredProcedures", "Functions", "Security")
    foreach ($folder in $folders) {
        New-Item -ItemType Directory -Path (Join-Path $lakehouseDir $folder) -Force | Out-Null
    }
    
    $extractedCount = 0
    
    # Process extracted files - SqlPackage creates schema/type/name.sql structure
    # Use Push-Location to get reliable relative paths
    Push-Location $extractDir
    try {
        Get-ChildItem -Path $extractDir -Recurse -Filter "*.sql" | ForEach-Object {
            $sqlFile = $_
            # Get relative path from extractDir
            $relativePath = Resolve-Path -Path $sqlFile.FullName -Relative
            # Remove leading .\ or ./ using regex (TrimStart requires char array, not string)
            $relativePath = $relativePath -replace "^\.[\\/]", ""
            $parts = $relativePath -split "[\\/]"
            
            if ($parts.Count -ge 2) {
                # First part is schema, second is object type, third is filename
                $schemaName = $parts[0]
                $objectType = if ($parts.Count -ge 3) { $parts[1] } else { "Unknown" }
                $fileName = $sqlFile.Name
                
                # Sanitize schema name (remove invalid characters like :)
                $schemaName = $schemaName -replace "[:\*\?`"<>\|]", ""
                if (-not $schemaName) { $schemaName = "dbo" }
                
                # Skip system schemas
                if ($schemaName -in @("sys", "INFORMATION_SCHEMA", "guest")) {
                    return
                }
                
                # Skip scalar-valued functions (not supported by Fabric - SQL70015)
                if ($objectType -like "*Scalar*" -or $objectType -like "*scalar*") {
                    Write-Host "  Skipping scalar function (not supported): $fileName"
                    return
                }
                
                # Map to our folder structure
                $targetFolder = $typeMapping[$objectType]
                if (-not $targetFolder) {
                    # Try partial match
                    foreach ($key in $typeMapping.Keys) {
                        if ($objectType -like "*$key*" -or $key -like "*$objectType*") {
                            $targetFolder = $typeMapping[$key]
                            break
                        }
                    }
                }
                # Skip unknown object types
                if (-not $targetFolder) { return }
                
                # Create target filename with schema prefix (sanitize for Windows)
                $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
                $baseName = $baseName -replace "[:\*\?`"<>\|]", ""
                $targetFileName = "${schemaName}_${baseName}.sql"
                $targetPath = Join-Path $lakehouseDir $targetFolder $targetFileName
                
                # For Functions folder, check content to skip scalar-valued functions (not supported by Fabric)
                if ($targetFolder -eq "Functions") {
                    $fileContent = Get-Content -Path $sqlFile.FullName -Raw
                    # Scalar functions have pattern: RETURNS <datatype> AS (not RETURNS TABLE or @variable TABLE)
                    # Table-valued functions have: RETURNS TABLE or RETURNS @variable TABLE
                    # More robust pattern: RETURNS clause that does NOT contain TABLE before AS/BEGIN keywords
                    $returnsMatch = [regex]::Match($fileContent, 'CREATE\s+(FUNCTION|PROCEDURE).*RETURNS\s+([^(]*?)(\s+AS|\s+BEGIN)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)
                    if ($returnsMatch.Success) {
                        $returnsClause = $returnsMatch.Groups[2].Value
                        # If RETURNS clause does NOT contain TABLE, it's a scalar function
                        if ($returnsClause -notmatch 'TABLE' -and $returnsClause -notmatch '^@') {
                            Write-Host "  Skipping scalar function (SQL70015 not supported by Fabric): $fileName (RETURNS: $($returnsClause.Trim()))"
                            return
                        }
                    }
                }
                
                Copy-Item -Path $sqlFile.FullName -Destination $targetPath -Force
                Write-Host "  Extracted: [$schemaName].[$baseName] -> $targetFolder/$targetFileName"
                $script:extractedCount++
            }
        }
    } finally {
        Pop-Location
    }
    
    if ($extractedCount -eq 0) {
        Write-Host "##[warning]No objects extracted for $lakehouseName"
        Write-Host "##[warning]Check SqlPackage output for details"
        Get-Content "$tempLogDir\extract_stderr.txt" -ErrorAction SilentlyContinue
        Get-Content "$tempLogDir\extract_stdout.txt" -ErrorAction SilentlyContinue
    } else {
        Write-Host "Extracted $extractedCount objects"
    }
    
    # Post-process: Remove self-references (three-part names referencing own database)
    # Convert [DatabaseName].[schema].[object] to [schema].[object] for self-references
    Write-Host "Post-processing: Removing self-references..."
    Get-ChildItem -Path $lakehouseDir -Recurse -Filter "*.sql" | ForEach-Object {
        $sqlFile = $_
        $content = Get-Content -Path $sqlFile.FullName -Raw
        $originalContent = $content
        
        # Replace self-references: [LakehouseName].[schema]. with [schema].
        # Using word boundary to avoid partial matches
        $pattern = "\[$([regex]::Escape($lakehouseName))\]\.\[([^\]]+)\]\."
        $content = $content -replace $pattern, '[$1].'
        
        # Also handle unbracketed database name references
        $pattern2 = "(?<!\[)$([regex]::Escape($lakehouseName))\.\[([^\]]+)\]\."
        $content = $content -replace $pattern2, '[$1].'
        
        if ($content -ne $originalContent) {
            $content | Set-Content -Path $sqlFile.FullName -NoNewline
            Write-Host "  Fixed self-references in: $($sqlFile.Name)"
        }
    }
    
    # Create .sqlproj file (SDK-style) - will add project references later
    $sqlprojContent = @"
<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build">
  <Sdk Name="Microsoft.Build.Sql" Version="0.1.19-preview" />
  <PropertyGroup>
    <Name>$lakehouseName</Name>
    <DSP>Microsoft.Data.Tools.Schema.Sql.SqlDwUnifiedDatabaseSchemaProvider</DSP>
    <DefaultCollation>Latin1_General_100_BIN2_UTF8</DefaultCollation>
  </PropertyGroup>
  <Target Name="BeforeBuild">
    <Delete Files="`$(BaseIntermediateOutputPath)\project.assets.json" />
  </Target>
</Project>
"@
    
    $sqlprojPath = Join-Path $lakehouseDir "$lakehouseName.sqlproj"
    $sqlprojContent | Out-File -FilePath $sqlprojPath -Encoding utf8
    Write-Host "Created SQL project: $lakehouseName.sqlproj"
    
    # Clean up temp directories
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempLogDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Second pass: Detect cross-database references and add project references
# This scans ALL SQL projects in the repo (Lakehouses, Warehouses, etc.)
Write-Host ""
Write-Host "=========================================="
Write-Host "Detecting cross-database references..."
Write-Host "=========================================="

# Find ALL .sqlproj files in the repo (not just lakehouse-schema)
$repoRoot = Split-Path -Parent $outputRoot
$allSqlProjects = @{}
$allProjectDirs = @{}
$dependencyManifest = @()

# Scan for all .sqlproj files in the repository
Get-ChildItem -Path $repoRoot -Recurse -Filter "*.sqlproj" -ErrorAction SilentlyContinue | ForEach-Object {
    # Extract project name from file (without .sqlproj)
    $projName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    $projDir = $_.DirectoryName
    
    # Store project path and directory
    $allSqlProjects[$projName] = $_.FullName
    $allProjectDirs[$projName] = $projDir
    
    Write-Host "Found SQL project: $projName at $($_.FullName)"
}

Write-Host ""
Write-Host "Total SQL projects found: $($allSqlProjects.Count)"

# ============================================================================
# PHASE 2: DEPENDENCY DETECTION
# ============================================================================
# This phase scans SQL files for cross-database references and generates
# dependency information used in Phase 3. Key points:
# - Regex pattern [DB].[schema].[object] detects cross-database references
# - Only references to projects in the repository are included
# - System databases (master, tempdb, msdb, model) are excluded
# - Cross-platform path detection uses regex match on [\\/]lakehouse-schema[\\/]
#   (both \ and / to support Windows/Linux agents)
# - Dependencies recorded in topological order for PHASE 1 build ordering
# ============================================================================

# Process each SQL project for cross-database references
foreach ($projectName in $allSqlProjects.Keys) {
    $projectDir = $allProjectDirs[$projectName]
    $sqlprojPath = $allSqlProjects[$projectName]
    
    # DEFENSIVE PRACTICE: Use regex match on [\\/]lakehouse-schema[\\/] for cross-platform path detection.
    # PowerShell -like "*\path\*" fails on Linux agents (backslash is escape char).
    # Regex pattern accepts both Windows (\\) and Unix (/) path separators.
    $projectType = if ($projectDir -match '[\\/]lakehouse-schema[\\/]') {
        "lakehouse"
    } elseif ($projectDir -match '[\\/]fabric[\\/]') {
        "warehouse"
    } else {
        "other"
    }
    
    # Scan all SQL files for cross-database references
    # Pattern: [DatabaseName].[schema].[object] where DatabaseName != current project
    $referencedDatabases = @{}
    
    Get-ChildItem -Path $projectDir -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue | ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { return }
        
        # Match [DatabaseName].[schema].[object] or [DatabaseName].schema.object patterns
        $regexMatches = [regex]::Matches($content, '\[([^\]]+)\]\.\[?([^\]\.]+)\]?\.\[?([^\]\.]+)\]?')
        
        foreach ($match in $regexMatches) {
            $dbName = $match.Groups[1].Value
            # Skip if it's the current database or system databases
            if ($dbName -ne $projectName -and $dbName -notin @("sys", "INFORMATION_SCHEMA", "master", "tempdb", "msdb", "model")) {
                # Check if this database exists as another SQL project in the repo
                if ($allSqlProjects.ContainsKey($dbName)) {
                    $referencedDatabases[$dbName] = $true
                }
            }
        }
    }
    
    # Add project references if any cross-database references found
    if ($referencedDatabases.Count -gt 0) {
        Write-Host "$projectName references: $($referencedDatabases.Keys -join ', ')"

        # ====================================================================
        # PHASE 3: ARTIFACT REFERENCE INJECTION
        # ====================================================================
        # This phase injects ArtifactReference XML elements into .sqlproj files
        # to enable DACPAC resolution during compilation. Key points:
        # - SelectNodes() XPath API returns empty collection (not null) when empty
        #   (safer than direct property access which returns $null)
        # - RemoveChild() with NULL checks prevent crashes on missing Compile items
        # - GetRelativePath() with .Replace() ensures cross-platform path handling
        #   (both Windows \ and Unix / separators supported)
        # - XML namespace awareness preserves document structure integrity
        # ====================================================================

        # Read current sqlproj for ArtifactReference injection
        [xml]$sqlprojXml = Get-Content $sqlprojPath

        # DEFENSIVE PRACTICE: Use XPath SelectNodes() instead of direct property enumeration
        # Direct enumeration: $itemGroup.ArtifactReference returns $null when empty,
        # causing RemoveChild($null) to crash. SelectNodes() returns empty collection (safe).
        foreach ($itemGroup in @($sqlprojXml.Project.ItemGroup)) {
            if (-not $itemGroup) { continue }
            $itemGroup.SelectNodes("./ArtifactReference") | ForEach-Object {
                $itemGroup.RemoveChild($_) | Out-Null
            }
        }

        # Add ArtifactReferences for lakehouse/warehouse dependencies
        $artifactItemGroup = $sqlprojXml.CreateElement("ItemGroup")
        $artifactComment = $sqlprojXml.CreateComment(" Cross-database artifact references (auto-detected) ")
        $artifactItemGroup.AppendChild($artifactComment) | Out-Null

        foreach ($refDb in $referencedDatabases.Keys) {
            $refProjDir = $allProjectDirs[$refDb]
            $refType = if ($refProjDir -match '[\\/]lakehouse-schema[\\/]') {
                "lakehouse"
            } elseif ($refProjDir -match '[\\/]fabric[\\/]') {
                "warehouse"
            } else {
                "other"
            }

            if ($refType -in @("lakehouse", "warehouse")) {
                $refDacpacPath = Join-Path $repoRoot ".deploy\dacpacs\$refType\$refDb\$refDb.dacpac"

                # DEFENSIVE PRACTICE: GetRelativePath() with .Replace() ensures cross-platform compatibility.
                # PowerShell -like "*\path\*" on Linux treats \ as escape; regex match on [\\/] accepts both.
                $relativePath = [System.IO.Path]::GetRelativePath($projectDir, $refDacpacPath).Replace('\\', '/')

                $artifactRef = $sqlprojXml.CreateElement("ArtifactReference")
                $artifactRef.SetAttribute("Include", $relativePath)

                $suppressMissing = $sqlprojXml.CreateElement("SuppressMissingDependenciesErrors")
                $suppressMissing.InnerText = "False"
                $artifactRef.AppendChild($suppressMissing) | Out-Null

                $dbVar = $sqlprojXml.CreateElement("DatabaseVariableLiteralValue")
                $dbVar.InnerText = $refDb
                $artifactRef.AppendChild($dbVar) | Out-Null

                $dbSqlCmd = $sqlprojXml.CreateElement("DatabaseSqlCmdVariable")
                $dbSqlCmd.InnerText = $refDb
                $artifactRef.AppendChild($dbSqlCmd) | Out-Null

                $artifactItemGroup.AppendChild($artifactRef) | Out-Null
                Write-Host "  ArtifactReference -> $refDb ($relativePath)"
            }
        }

        $sqlprojXml.Project.AppendChild($artifactItemGroup) | Out-Null
        $sqlprojXml.Save($sqlprojPath)

        if ($projectType -eq "lakehouse") {
            Write-Host "  Skipping ProjectReference injection for lakehouse project to avoid duplicate object model conflicts"
        } else {

        # Read current sqlproj
        [xml]$sqlprojXml = Get-Content $sqlprojPath
        
        # Check if ItemGroup with project references already exists
        $existingRefs = $sqlprojXml.Project.ItemGroup | Where-Object { $_.ProjectReference }
        if ($existingRefs) {
            Write-Host "  Project references already exist - skipping update"
        } else {
            # Create ItemGroup for project references
            $itemGroup = $sqlprojXml.CreateElement("ItemGroup")
            $comment = $sqlprojXml.CreateComment(" Cross-database project references (auto-detected) ")
            $itemGroup.AppendChild($comment) | Out-Null

            foreach ($refDb in $referencedDatabases.Keys) {
                $refProjPath = $allSqlProjects[$refDb]

                # Calculate relative path from current project to referenced project
                $currentDir = $projectDir
                $targetPath = $refProjPath

                # Use .NET to get relative path
                $currentUri = New-Object System.Uri("$currentDir\")
                $targetUri = New-Object System.Uri($targetPath)
                $relativeUri = $currentUri.MakeRelativeUri($targetUri)
                $relativePath = [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '\')

                $projectRef = $sqlprojXml.CreateElement("ProjectReference")
                $projectRef.SetAttribute("Include", $relativePath)

                $dbVar = $sqlprojXml.CreateElement("DatabaseVariableLiteral")
                $dbVar.InnerText = $refDb
                $projectRef.AppendChild($dbVar) | Out-Null

                $itemGroup.AppendChild($projectRef) | Out-Null
                Write-Host "  -> $refDb ($relativePath)"
            }

            $sqlprojXml.Project.AppendChild($itemGroup) | Out-Null
            $sqlprojXml.Save($sqlprojPath)
            Write-Host "  Added $($referencedDatabases.Count) project reference(s) to $projectName.sqlproj"

            if ($RemoveDuplicateObjects) {
                # Remove duplicate objects that exist in referenced projects
                # Shortcut lakehouses often contain the same objects as their source
                Write-Host "  Checking for duplicate objects from referenced projects..."
                foreach ($refDb in $referencedDatabases.Keys) {
                    $refProjDir = $allProjectDirs[$refDb]
                    if (-not $refProjDir -or -not (Test-Path $refProjDir)) { continue }

                    # Get all SQL files from referenced project
                    Get-ChildItem -Path $refProjDir -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue | ForEach-Object {
                        $refSqlFile = $_
                        $refFileName = $refSqlFile.Name

                        # Find matching file in current project (same filename)
                        $matchingFiles = Get-ChildItem -Path $projectDir -Recurse -Filter $refFileName -ErrorAction SilentlyContinue
                        foreach ($matchingFile in $matchingFiles) {
                            # Remove because referenced project already defines this object
                            Write-Host "    Removing duplicate: $($matchingFile.Name) (exists in $refDb)"
                            Remove-Item -Path $matchingFile.FullName -Force
                        }
                    }
                }

                # Clean up empty folders after removing duplicates
                Get-ChildItem -Path $projectDir -Directory -Recurse | 
                    Where-Object { (Get-ChildItem $_.FullName -Recurse -File).Count -eq 0 } |
                    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            } else {
                Write-Host "  Duplicate removal disabled; keeping all objects in $projectName"
            }
        }
        }
    }

    # Add to dependency manifest (include projects with no references)
    $relativePath = [System.IO.Path]::GetRelativePath($repoRoot, $sqlprojPath)

    $dependencyManifest += [pscustomobject]@{
        name = $projectName
        type = $projectType
        path = $relativePath
        references = @($referencedDatabases.Keys)
    }
}

# Write dependency manifest for deploy ordering
$manifestPath = Join-Path $outputRoot "dependency-manifest.json"
$dependencyManifest | ConvertTo-Json -Depth 6 | Out-File -FilePath $manifestPath -Encoding utf8
Write-Host "Dependency manifest written: $manifestPath"

Write-Host ""
Write-Host "=========================================="
Write-Host "Schema extraction complete."
Write-Host "Output directory: $outputRoot"
Write-Host "=========================================="
Write-Host ""

# List extracted files
Get-ChildItem -Path $outputRoot -Recurse -File | ForEach-Object {
    Write-Host "  $($_.FullName.Replace($outputRoot, '.'))"
}
