$directorySeparator = [System.IO.Path]::DirectorySeparatorChar
$moduleName = $PSScriptRoot.Split($directorySeparator)[-1]
$moduleManifest = $PSScriptRoot + $directorySeparator + $moduleName + '.psd1'
$publicFunctionsPath = $PSScriptRoot + $directorySeparator + 'Public' + $directorySeparator #+ 'ps1'
$privateFunctionsPath = $PSScriptRoot + $directorySeparator + 'Private' + $directorySeparator #+ 'ps1'
$currentManifest = Test-ModuleManifest $moduleManifest

$aliases = @()
$publicFunctions = Get-ChildItem -Path $publicFunctionsPath -Recurse | Where-Object {$_.Extension -eq '.ps1'}
$privateFunctions = Get-ChildItem -Path $privateFunctionsPath -Recurse | Where-Object {$_.Extension -eq '.ps1'}
$publicFunctions | ForEach-Object { . $_.FullName }
$privateFunctions | ForEach-Object { . $_.FullName }
# Configuration object for module-wide settings

$FabricConfig = @{
    BaseUrl      = "https://api.fabric.microsoft.com/v1"
    ResourceUrl  = "https://api.fabric.microsoft.com"
    FabricHeaders = @{}
    TenantIdGlobal = ""
    TokenExpiresOn = ""
  
}

Export-ModuleMember -Variable FabricConfig

$publicFunctions | ForEach-Object { # Export all of the public functions from this module

    # The command has already been sourced in above. Query any defined aliases.
    $alias = Get-Alias -Definition $_.BaseName -ErrorAction SilentlyContinue
    if ($alias) {
        $aliases += $alias
        Export-ModuleMember -Function $_.BaseName -Alias $alias
        #Export-ModuleMember -Variable FabricConfig, TenantIdGlobal, TokenExpiresOn
    }
    else {
        Export-ModuleMember -Function $_.BaseName
        #Export-ModuleMember -Variable FabricConfig, TenantIdGlobal, TokenExpiresOn
    }

}

$functionsAdded = $publicFunctions | Where-Object {$_.BaseName -notin $currentManifest.ExportedFunctions.Keys}
$functionsRemoved = $currentManifest.ExportedFunctions.Keys | Where-Object {$_ -notin $publicFunctions.BaseName}
$aliasesAdded = $aliases | Where-Object {$_ -notin $currentManifest.ExportedAliases.Keys}
$aliasesRemoved = $currentManifest.ExportedAliases.Keys | Where-Object {$_ -notin $aliases}

if ($functionsAdded -or $functionsRemoved -or $aliasesAdded -or $aliasesRemoved) {
    try {

        $updateModuleManifestParams = @{}
        $updateModuleManifestParams.Add('Path', $moduleManifest)
        $updateModuleManifestParams.Add('ErrorAction', 'Stop')
        if ($aliases.Count -gt 0) { $updateModuleManifestParams.Add('AliasesToExport', $aliases) }
        if ($publicFunctions.Count -gt 0) { $updateModuleManifestParams.Add('FunctionsToExport', $publicFunctions.BaseName) }

        Update-ModuleManifest @updateModuleManifestParams

    }
    catch {

        $_ | Write-Error

    }

}