<#
    .DESCRIPTION
        Bootstrap and build script for PowerShell module CI/CD pipeline.

    .PARAMETER Tasks
        The task or tasks to run. The default value is '.' (runs the default task).

    .PARAMETER CodeCoverageThreshold
        The code coverage target threshold to uphold. Set to 0 to disable.
        The default value is '' (empty string).

    .PARAMETER BuildConfig
        Not yet written.

    .PARAMETER OutputDirectory
        Specifies the folder to build the artefact into. The default value is 'output'.

    .PARAMETER BuiltModuleSubdirectory
        Subdirectory name to build the module (under $OutputDirectory). The default
        value is '' (empty string).

    .PARAMETER RequiredModulesDirectory
        Can be a path (relative to $PSScriptRoot or absolute) to tell Resolve-Dependency
        and PSDepend where to save the required modules. It is also possible to use
        'CurrentUser' och 'AllUsers' to install missing dependencies. You can override
        the value for PSDepend in the Build.psd1 build manifest. The default value is
        'output/RequiredModules'.

    .PARAMETER PesterScript
        One or more paths that will override the Pester configuration in build
        configuration file when running the build task Invoke_Pester_Tests.

        If running Pester 5 test, use the alias PesterPath to be future-proof.

    .PARAMETER PesterTag
        Filter which tags to run when invoking Pester tests. This is used in the
        Invoke-Pester.pester.build.ps1 tasks.

    .PARAMETER PesterExcludeTag
        Filter which tags to exclude when invoking Pester tests. This is used in
        the Invoke-Pester.pester.build.ps1 tasks.

    .PARAMETER DscTestTag
        Filter which tags to run when invoking DSC Resource tests. This is used
        in the DscResource.Test.build.ps1 tasks.

    .PARAMETER DscTestExcludeTag
        Filter which tags to exclude when invoking DSC Resource tests. This is
        used in the DscResource.Test.build.ps1 tasks.

    .PARAMETER ResolveDependency
        Not yet written.

    .PARAMETER BuildInfo
        The build info object from ModuleBuilder. Defaults to an empty hashtable.

    .PARAMETER AutoRestore
        Not yet written.

    .PARAMETER UseModuleFast
        Specifies to use ModuleFast instead of PowerShellGet to resolve dependencies
        faster.

    .PARAMETER UsePSResourceGet
        Specifies to use PSResourceGet instead of PowerShellGet to resolve dependencies
        faster. This can also be configured in Resolve-Dependency.psd1.

    .PARAMETER UsePowerShellGetCompatibilityModule
        Specifies to use the compatibility module PowerShellGet. This parameter
        only works then the method of downloading dependencies is PSResourceGet.
        This can also be configured in Resolve-Dependency.psd1.
#>
[CmdletBinding()]
param
(
    [Parameter(Position = 0)]
    [System.String[]]
    $Tasks = '.',

    [Parameter()]
    [System.String]
    $CodeCoverageThreshold = '',

    [Parameter()]
    [System.String]
    [ValidateScript(
        { Test-Path -Path $_ }
    )]
    $BuildConfig,

    [Parameter()]
    [System.String]
    $OutputDirectory = 'output',

    [Parameter()]
    [System.String]
    $BuiltModuleSubdirectory = '',

    [Parameter()]
    [System.String]
    $RequiredModulesDirectory = $(Join-Path 'output' 'RequiredModules'),

    [Parameter()]
    # This alias is to prepare for the rename of this parameter to PesterPath when Pester 4 support is removed
    [Alias('PesterPath')]
    [System.Object[]]
    $PesterScript,

    [Parameter()]
    [System.String[]]
    $PesterTag,

    [Parameter()]
    [System.String[]]
    $PesterExcludeTag,

    [Parameter()]
    [System.String[]]
    $DscTestTag,

    [Parameter()]
    [System.String[]]
    $DscTestExcludeTag,

    [Parameter()]
    [Alias('bootstrap')]
    [System.Management.Automation.SwitchParameter]
    $ResolveDependency,

    [Parameter(DontShow)]
    [AllowNull()]
    [System.Collections.Hashtable]
    $BuildInfo,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $AutoRestore,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UseModuleFast,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UsePSResourceGet,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UsePowerShellGetCompatibilityModule
)

<#
    The BEGIN block (at the end of this file) handles the Bootstrap of the Environment
    before Invoke-Build can run the tasks if the parameter ResolveDependency (or
    parameter alias Bootstrap) is specified.
#>

process
{
    if ($MyInvocation.ScriptName -notLike '*Invoke-Build.ps1')
    {
        # Only run the process block through InvokeBuild (look at the Begin block at the bottom of this script).
        return
    }

    # Execute the Build process from the .build.ps1 path.
    Push-Location -Path $PSScriptRoot -StackName 'BeforeBuild'

    try
    {
        Write-Host -Object "[build] Parsing defined tasks" -ForeGroundColor Magenta

        # Load the default BuildInfo if the parameter BuildInfo is not set.
        if (-not $PSBoundParameters.ContainsKey('BuildInfo'))
        {
            try
            {
                if (Test-Path -Path $BuildConfig)
                {
                    $configFile = Get-Item -Path $BuildConfig

                    Write-Host -Object "[build] Loading Configuration from $configFile"

                    $BuildInfo = switch -Regex ($configFile.Extension)
                    {
                        # Native Support for PSD1
                        '\.psd1'
                        {
                            if (-not (Get-Command -Name Import-PowerShellDataFile -ErrorAction SilentlyContinue))
                            {
                                Import-Module -Name Microsoft.PowerShell.Utility -RequiredVersion 3.1.0.0
                            }

                            Import-PowerShellDataFile -Path $BuildConfig
                        }

                        # Support for yaml when module PowerShell-Yaml is available
                        '\.[yaml|yml]'
                        {
                            Import-Module -Name 'powershell-yaml' -ErrorAction Stop

                            ConvertFrom-Yaml -Yaml (Get-Content -Raw $configFile)
                        }

                        # Support for JSON and JSONC (by Removing comments) when module PowerShell-Yaml is available
                        '\.[json|jsonc]'
                        {
                            $jsonFile = Get-Content -Raw -Path $configFile

                            $jsonContent = $jsonFile -replace '(?m)\s*//.*?$' -replace '(?ms)/\*.*?\*/'

                            # Yaml is superset of JSON.
                            ConvertFrom-Yaml -Yaml $jsonContent
                        }

                        # Unknown extension, return empty hashtable.
                        default
                        {
                            Write-Error -Message "Extension '$_' not supported. using @{}"

                            @{ }
                        }
                    }
                }
                else
                {
                    Write-Host -Object "Configuration file '$($BuildConfig.FullName)' not found" -ForegroundColor Red

                    # No config file was found, return empty hashtable.
                    $BuildInfo = @{ }
                }
            }
            catch
            {
                $logMessage = "Error loading Config '$($BuildConfig.FullName)'.`r`nAre you missing dependencies?`r`nMake sure you run './build.ps1 -ResolveDependency -tasks noop' before running build to restore the required modules."

                Write-Host -Object $logMessage -ForegroundColor Yellow

                $BuildInfo = @{ }

                Write-Error -Message $_.Exception.Message
            }
        }

        # If the Invoke-Build Task Header is specified in the Build Info, set it.
        if ($BuildInfo.TaskHeader)
        {
            Set-BuildHeader -Script ([scriptblock]::Create($BuildInfo.TaskHeader))
        }

        <#
            Add BuildModuleOutput to PSModule Path environment variable.
            Moved here (not in begin block) because build file can contains BuiltSubModuleDirectory value.
        #>
        if ($BuiltModuleSubdirectory)
        {
            if (-not (Split-Path -IsAbsolute -Path $BuiltModuleSubdirectory))
            {
                $BuildModuleOutput = Join-Path -Path $OutputDirectory -ChildPath $BuiltModuleSubdirectory
            }
            else
            {
                $BuildModuleOutput = $BuiltModuleSubdirectory
            }
        } # test if BuiltModuleSubDirectory set in build config file
        elseif ($BuildInfo.ContainsKey('BuiltModuleSubDirectory'))
        {
            $BuildModuleOutput = Join-Path -Path $OutputDirectory -ChildPath $BuildInfo['BuiltModuleSubdirectory']
        }
        else
        {
            $BuildModuleOutput = $OutputDirectory
        }

        # Pre-pending $BuildModuleOutput folder to PSModulePath to resolve built module from this folder.
        if ($powerShellModulePaths -notcontains $BuildModuleOutput)
        {
            Write-Host -Object "[build] Pre-pending '$BuildModuleOutput' folder to PSModulePath" -ForegroundColor Green

            $env:PSModulePath = $BuildModuleOutput + [System.IO.Path]::PathSeparator + $env:PSModulePath
        }

        <#
            Import Tasks from modules via their exported aliases when defined in Build Manifest.
            https://github.com/nightroman/Invoke-Build/tree/master/Tasks/Import#example-2-import-from-a-module-with-tasks
        #>
        if ($BuildInfo.ContainsKey('ModuleBuildTasks'))
        {
            foreach ($module in $BuildInfo['ModuleBuildTasks'].Keys)
            {
                try
                {
                    Write-Host -Object "Importing tasks from module $module" -ForegroundColor DarkGray

                    $loadedModule = Import-Module -Name $module -PassThru -ErrorAction Stop

                    foreach ($TaskToExport in $BuildInfo['ModuleBuildTasks'].($module))
                    {
                        $loadedModule.ExportedAliases.GetEnumerator().Where{
                            Write-Host -Object "`t Loading $($_.Key)..." -ForegroundColor DarkGray

                            # Using -like to support wildcard.
                            $_.Key -like $TaskToExport
                        }.ForEach{
                            # Dot-sourcing the Tasks via their exported aliases.
                            . (Get-Alias $_.Key)
                        }
                    }
                }
                catch
                {
                    Write-Host -Object "Could not load tasks for module $module." -ForegroundColor Red

                    Write-Error -Message $_
                }
            }
        }

        # Loading Build Tasks defined in the .build/ folder (will override the ones imported above if same task name).
        Get-ChildItem -Path '.build/' -Recurse -Include '*.ps1' -ErrorAction Ignore |
            ForEach-Object {
                "Importing file $($_.BaseName)" | Write-Verbose

                . $_.FullName
            }

        # Synopsis: Empty task, useful to test the bootstrap process.
        task noop { }

        # Define default task sequence ("."), can be overridden in the $BuildInfo.
        task . {
            Write-Build -Object 'No sequence currently defined for the default task' -ForegroundColor Yellow
        }

        Write-Host -Object 'Adding Workflow from configuration:' -ForegroundColor DarkGray

        # Load Invoke-Build task sequences/workflows from $BuildInfo.
        foreach ($workflow in $BuildInfo.BuildWorkflow.keys)
        {
            Write-Verbose -Message "Creating Build Workflow '$Workflow' with tasks $($BuildInfo.BuildWorkflow.($Workflow) -join ', ')."

            $workflowItem = $BuildInfo.BuildWorkflow.($workflow)

            if ($workflowItem.Trim() -match '^\{(?<sb>[\w\W]*)\}$')
            {
                $workflowItem = [ScriptBlock]::Create($Matches['sb'])
            }

            Write-Host -Object "  +-> $workflow" -ForegroundColor DarkGray

            task $workflow $workflowItem
        }

        Write-Host -Object "[build] Executing requested workflow: $($Tasks -join ', ')" -ForeGroundColor Magenta

    }
    finally
    {
        Pop-Location -StackName 'BeforeBuild'
    }
}

begin
{
    # Find build config if not specified.
    if (-not $BuildConfig)
    {
        $config = Get-ChildItem -Path "$PSScriptRoot\*" -Include 'build.y*ml', 'build.psd1', 'build.json*' -ErrorAction Ignore

        if (-not $config -or ($config -is [System.Array] -and $config.Length -le 0))
        {
            throw 'No build configuration found. Specify path via parameter BuildConfig.'
        }
        elseif ($config -is [System.Array])
        {
            if ($config.Length -gt 1)
            {
                throw 'More than one build configuration found. Specify which path to use via parameter BuildConfig.'
            }

            $BuildConfig = $config[0]
        }
        else
        {
            $BuildConfig = $config
        }
    }

    # Bootstrapping the environment before using Invoke-Build as task runner

    if ($MyInvocation.ScriptName -notlike '*Invoke-Build.ps1')
    {
        Write-Host -Object "[pre-build] Starting Build Init" -ForegroundColor Green

        Push-Location $PSScriptRoot -StackName 'BuildModule'
    }

    if ($RequiredModulesDirectory -in @('CurrentUser', 'AllUsers'))
    {
        # Installing modules instead of saving them.
        Write-Host -Object "[pre-build] Required Modules will be installed to the PowerShell module path that is used for $RequiredModulesDirectory." -ForegroundColor Green

        <#
            The variable $PSDependTarget will be used below when building the splatting
            variable before calling Resolve-Dependency.ps1, unless overridden in the
            file Resolve-Dependency.psd1.
        #>
        $PSDependTarget = $RequiredModulesDirectory
    }
    else
    {
        if (-not (Split-Path -IsAbsolute -Path $OutputDirectory))
        {
            $OutputDirectory = Join-Path -Path $PSScriptRoot -ChildPath $OutputDirectory
        }

        # Resolving the absolute path to save the required modules to.
        if (-not (Split-Path -IsAbsolute -Path $RequiredModulesDirectory))
        {
            $RequiredModulesDirectory = Join-Path -Path $PSScriptRoot -ChildPath $RequiredModulesDirectory
        }

        # Create the output/modules folder if not exists, or resolve the Absolute path otherwise.
        if (Resolve-Path -Path $RequiredModulesDirectory -ErrorAction SilentlyContinue)
        {
            Write-Debug -Message "[pre-build] Required Modules path already exist at $RequiredModulesDirectory"

            $requiredModulesPath = Convert-Path -Path $RequiredModulesDirectory
        }
        else
        {
            Write-Host -Object "[pre-build] Creating required modules directory $RequiredModulesDirectory." -ForegroundColor Green

            $requiredModulesPath = (New-Item -ItemType Directory -Force -Path $RequiredModulesDirectory).FullName
        }

        $powerShellModulePaths = $env:PSModulePath -split [System.IO.Path]::PathSeparator

        # Pre-pending $requiredModulesPath folder to PSModulePath to resolve from this folder FIRST.
        if ($RequiredModulesDirectory -notin @('CurrentUser', 'AllUsers') -and
            ($powerShellModulePaths -notcontains $RequiredModulesDirectory))
        {
            Write-Host -Object "[pre-build] Pre-pending '$RequiredModulesDirectory' folder to PSModulePath" -ForegroundColor Green

            $env:PSModulePath = $RequiredModulesDirectory + [System.IO.Path]::PathSeparator + $env:PSModulePath
        }

        $powerShellYamlModule = Get-Module -Name 'powershell-yaml' -ListAvailable
        $invokeBuildModule = Get-Module -Name 'InvokeBuild' -ListAvailable
        $psDependModule = Get-Module -Name 'PSDepend' -ListAvailable

        # Checking if the user should -ResolveDependency.
        if (-not ($powerShellYamlModule -and $invokeBuildModule -and $psDependModule) -and -not $ResolveDependency)
        {
            if ($AutoRestore -or -not $PSBoundParameters.ContainsKey('Tasks') -or $Tasks -contains 'build')
            {
                Write-Host -Object "[pre-build] Dependency missing, running './build.ps1 -ResolveDependency -Tasks noop' for you `r`n" -ForegroundColor Yellow

                $ResolveDependency = $true
            }
            else
            {
                Write-Warning -Message "Some required Modules are missing, make sure you first run with the '-ResolveDependency' parameter. Running 'build.ps1 -ResolveDependency -Tasks noop' will pull required modules without running the build task."
            }
        }

        <#
            The variable $PSDependTarget will be used below when building the splatting
            variable before calling Resolve-Dependency.ps1, unless overridden in the
            file Resolve-Dependency.psd1.
        #>
        $PSDependTarget = $requiredModulesPath
    }

    if ($ResolveDependency)
    {
        Write-Host -Object "[pre-build] Resolving dependencies using preferred method." -ForegroundColor Green

        $resolveDependencyParams = @{ }

        # If BuildConfig is a Yaml file, bootstrap powershell-yaml via ResolveDependency.
        if ($BuildConfig -match '\.[yaml|yml]$')
        {
            $resolveDependencyParams.Add('WithYaml', $true)
        }

        $resolveDependencyAvailableParams = (Get-Command -Name '.\Resolve-Dependency.ps1').Parameters.Keys

        foreach ($cmdParameter in $resolveDependencyAvailableParams)
        {
            # The parameter has been explicitly used for calling the .build.ps1
            if ($MyInvocation.BoundParameters.ContainsKey($cmdParameter))
            {
                $paramValue = $MyInvocation.BoundParameters.Item($cmdParameter)

                Write-Debug " adding  $cmdParameter :: $paramValue [from user-provided parameters to Build.ps1]"

                $resolveDependencyParams.Add($cmdParameter, $paramValue)
            }
            # Use defaults parameter value from Build.ps1, if any
            else
            {
                $paramValue = Get-Variable -Name $cmdParameter -ValueOnly -ErrorAction Ignore

                if ($paramValue)
                {
                    Write-Debug " adding  $cmdParameter :: $paramValue [from default Build.ps1 variable]"

                    $resolveDependencyParams.Add($cmdParameter, $paramValue)
                }
            }
        }

        Write-Host -Object "[pre-build] Starting bootstrap process." -ForegroundColor Green

        .\Resolve-Dependency.ps1 @resolveDependencyParams
    }

    if ($MyInvocation.ScriptName -notlike '*Invoke-Build.ps1')
    {
        Write-Verbose -Message "Bootstrap completed. Handing back to InvokeBuild."

        if ($PSBoundParameters.ContainsKey('ResolveDependency'))
        {
            Write-Verbose -Message "Dependency already resolved. Removing task."

            $null = $PSBoundParameters.Remove('ResolveDependency')
        }

        Write-Host -Object "[build] Starting build with InvokeBuild." -ForegroundColor Green

        Invoke-Build @PSBoundParameters -Task $Tasks -File $MyInvocation.MyCommand.Path

        Pop-Location -StackName 'BuildModule'

        return
    }
}
