# Auto-generate missing Pester unit tests for functions in source/Public
# Usage: Run from repository root or this module folder.

$moduleRoot = Join-Path $PSScriptRoot ".."
$sourceRoot = Resolve-Path (Join-Path $moduleRoot 'source\Public')
$testsRoot = Resolve-Path (Join-Path $moduleRoot 'tests\Unit')
$templatePath = Join-Path $testsRoot 'Get-FabricNotebookDefinition.Tests.ps1'
if (-not (Test-Path $templatePath)) {
    Write-Error "Template test not found: $templatePath"
    return
}
$template = Get-Content $templatePath -Raw

function Get-FunctionInfoFromFile {
    param([string]$file)
    $content = Get-Content $file -Raw
    # Extract function name: function <Name> {
    $m = [regex]::Match($content, 'function\s+([A-Za-z0-9_-]+)\s*\{', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $m.Success) { return $null }
    $name = $m.Groups[1].Value

    # Extract parameter block using Singleline so newlines are included
    $params = @()
    $pm = [regex]::Match($content, 'param\s*\((.*?)\)', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if ($pm.Success) {
        $pblock = $pm.Groups[1].Value
        $matches = [regex]::Matches($pblock, '\$([A-Za-z0-9_]+)')
        foreach ($mm in $matches) { if ($mm.Groups[1].Value) { $params += $mm.Groups[1].Value } }
    }

    # Add the common PowerShell infrastructure params if not present
    $commonParams = @('Verbose','Debug','ErrorAction','WarningAction','InformationAction','ProgressAction','ErrorVariable','WarningVariable','InformationVariable','OutVariable','OutBuffer','PipelineVariable')
    foreach ($cp in $commonParams) {
        if (-not ($params -contains $cp)) { $params += $cp }
    }
    return [pscustomobject]@{ File = $file; Function = $name; Params = $params }
}

$files = Get-ChildItem -Path $sourceRoot -Recurse -Filter *.ps1 | Select-Object -ExpandProperty FullName
Write-Output "Found $($files.Count) function files under source/Public"

foreach ($f in $files) {
    $info = Get-FunctionInfoFromFile -file $f
    if (-not $info) { continue }
    $testName = "$($info.Function).Tests.ps1"
    $testPath = Join-Path $testsRoot $testName
    if (-not (Test-Path $testPath)) {
        Write-Output "Creating test for $($info.Function) -> $testPath"
        $expected = $info.Params | ForEach-Object { "'$_'" } | Out-String
        # Build param block as a here-string to avoid quoting issues
        $paramBlock = @"
param(
    `$ModuleName = "MicrosoftFabricMgmt",
    `$expectedParams = @(
$expected
    )
)
"@
        $newTest = $template -replace 'Get-FabricNotebookDefinition', $info.Function
        # Replace the param(...) block in the template with our generated one
        $newTest = [regex]::Replace($newTest, 'param\([\s\S]*?\)\s*\n', $paramBlock)
        Set-Content -Path $testPath -Value $newTest -Encoding UTF8
    }
}

Write-Output "Done."
