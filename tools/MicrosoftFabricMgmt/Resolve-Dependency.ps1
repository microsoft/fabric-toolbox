<#
    .DESCRIPTION
        Bootstrap script for PSDepend.

    .PARAMETER DependencyFile
        Specifies the configuration file for the this script. The default value is
        'RequiredModules.psd1' relative to this script's path.

    .PARAMETER PSDependTarget
        Path for PSDepend to be bootstrapped and save other dependencies.
        Can also be CurrentUser or AllUsers if you wish to install the modules in
        such scope. The default value is 'output/RequiredModules' relative to
        this script's path.

    .PARAMETER Proxy
        Specifies the URI to use for Proxy when attempting to bootstrap
        PackageProvider and PowerShellGet.

    .PARAMETER ProxyCredential
        Specifies the credential to contact the Proxy when provided.

    .PARAMETER Scope
        Specifies the scope to bootstrap the PackageProvider and PSGet if not available.
        THe default value is 'CurrentUser'.

    .PARAMETER Gallery
        Specifies the gallery to use when bootstrapping PackageProvider, PSGet and
        when calling PSDepend (can be overridden in Dependency files). The default
        value is 'PSGallery'.

    .PARAMETER GalleryCredential
        Specifies the credentials to use with the Gallery specified above.

    .PARAMETER AllowOldPowerShellGetModule
        Allow you to use a locally installed version of PowerShellGet older than
        1.6.0 (not recommended). Default it will install the latest PowerShellGet
        if an older version than 2.0 is detected.

    .PARAMETER MinimumPSDependVersion
        Allow you to specify a minimum version fo PSDepend, if you're after specific
        features.

    .PARAMETER AllowPrerelease
        Not yet written.

    .PARAMETER WithYAML
        Not yet written.

    .PARAMETER UseModuleFast
        Specifies to use ModuleFast instead of PowerShellGet to resolve dependencies
        faster.

    .PARAMETER ModuleFastBleedingEdge
        Specifies to use ModuleFast code that is in the ModuleFast's main branch
        in its GitHub repository. The parameter UseModuleFast must also be set to
        true.

    .PARAMETER UsePSResourceGet
        Specifies to use the new PSResourceGet module instead of the (now legacy) PowerShellGet module.

    .PARAMETER PSResourceGetVersion
        String specifying the module version for PSResourceGet if the `UsePSResourceGet` switch is utilized.

    .NOTES
        Load defaults for parameters values from Resolve-Dependency.psd1 if not
        provided as parameter.
#>
[CmdletBinding()]
param
(
    [Parameter()]
    [System.String]
    $DependencyFile = 'RequiredModules.psd1',

    [Parameter()]
    [System.String]
    $PSDependTarget = (Join-Path -Path $PSScriptRoot -ChildPath 'output/RequiredModules'),

    [Parameter()]
    [System.Uri]
    $Proxy,

    [Parameter()]
    [System.Management.Automation.PSCredential]
    $ProxyCredential,

    [Parameter()]
    [ValidateSet('CurrentUser', 'AllUsers')]
    [System.String]
    $Scope = 'CurrentUser',

    [Parameter()]
    [System.String]
    $Gallery = 'PSGallery',

    [Parameter()]
    [System.Management.Automation.PSCredential]
    $GalleryCredential,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $AllowOldPowerShellGetModule,

    [Parameter()]
    [System.String]
    $MinimumPSDependVersion,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $AllowPrerelease,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $WithYAML,

    [Parameter()]
    [System.Collections.Hashtable]
    $RegisterGallery,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UseModuleFast,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $ModuleFastBleedingEdge,

    [Parameter()]
    [System.String]
    $ModuleFastVersion,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UsePSResourceGet,

    [Parameter()]
    [System.String]
    $PSResourceGetVersion,

    [Parameter()]
    [System.Management.Automation.SwitchParameter]
    $UsePowerShellGetCompatibilityModule,

    [Parameter()]
    [System.String]
    $UsePowerShellGetCompatibilityModuleVersion
)

try
{
    if ($PSVersionTable.PSVersion.Major -le 5)
    {
        if (-not (Get-Command -Name 'Import-PowerShellDataFile' -ErrorAction 'SilentlyContinue'))
        {
            Import-Module -Name Microsoft.PowerShell.Utility -RequiredVersion '3.1.0.0'
        }
    }

    Write-Verbose -Message 'Importing Bootstrap default parameters from ''$PSScriptRoot/Resolve-Dependency.psd1''.'

    $resolveDependencyConfigPath = Join-Path -Path $PSScriptRoot -ChildPath '.\Resolve-Dependency.psd1' -Resolve -ErrorAction 'Stop'

    $resolveDependencyDefaults = Import-PowerShellDataFile -Path $resolveDependencyConfigPath

    $parameterToDefault = $MyInvocation.MyCommand.ParameterSets.Where{ $_.Name -eq $PSCmdlet.ParameterSetName }.Parameters.Keys

    if ($parameterToDefault.Count -eq 0)
    {
        $parameterToDefault = $MyInvocation.MyCommand.Parameters.Keys
    }

    # Set the parameters available in the Parameter Set, or it's not possible to choose yet, so all parameters are an option.
    foreach ($parameterName in $parameterToDefault)
    {
        if (-not $PSBoundParameters.Keys.Contains($parameterName) -and $resolveDependencyDefaults.ContainsKey($parameterName))
        {
            Write-Verbose -Message "Setting parameter '$parameterName' to value '$($resolveDependencyDefaults[$parameterName])'."

            try
            {
                $variableValue = $resolveDependencyDefaults[$parameterName]

                if ($variableValue -is [System.String])
                {
                    $variableValue = $ExecutionContext.InvokeCommand.ExpandString($variableValue)
                }

                $PSBoundParameters.Add($parameterName, $variableValue)

                Set-Variable -Name $parameterName -Value $variableValue -Force -ErrorAction 'SilentlyContinue'
            }
            catch
            {
                Write-Verbose -Message "Error adding default for $parameterName : $($_.Exception.Message)."
            }
        }
    }
}
catch
{
    Write-Warning -Message "Error attempting to import Bootstrap's default parameters from '$resolveDependencyConfigPath': $($_.Exception.Message)."
}

# Handle when both ModuleFast and PSResourceGet is configured or/and passed as parameter.
if ($UseModuleFast -and $UsePSResourceGet)
{
    Write-Information -MessageData 'Both ModuleFast and PSResourceGet is configured or/and passed as parameter.' -InformationAction 'Continue'

    if ($PSVersionTable.PSVersion -ge '7.2')
    {
        $UsePSResourceGet = $false

        Write-Information -MessageData 'PowerShell 7.2 or higher being used, prefer ModuleFast over PSResourceGet.' -InformationAction 'Continue'
    }
    else
    {
        $UseModuleFast = $false

        Write-Information -MessageData 'Windows PowerShell or PowerShell <=7.1 is being used, prefer PSResourceGet since ModuleFast is not supported on this version of PowerShell.' -InformationAction 'Continue'
    }
}

# Only bootstrap ModuleFast if it is not already imported.
if ($UseModuleFast -and -not (Get-Module -Name 'ModuleFast'))
{
    try
    {
        $moduleFastBootstrapScriptBlockParameters = @{}

        if ($ModuleFastBleedingEdge)
        {
            Write-Information -MessageData 'ModuleFast is configured to use Bleeding Edge (directly from ModuleFast''s main branch).' -InformationAction 'Continue'

            $moduleFastBootstrapScriptBlockParameters.UseMain = $true
        }
        elseif($ModuleFastVersion)
        {
            if ($ModuleFastVersion -notmatch 'v')
            {
                $ModuleFastVersion = 'v{0}' -f $ModuleFastVersion
            }

            Write-Information -MessageData ('ModuleFast is configured to use version {0}.' -f $ModuleFastVersion) -InformationAction 'Continue'

            $moduleFastBootstrapScriptBlockParameters.Release = $ModuleFastVersion
        }
        else
        {
            Write-Information -MessageData 'ModuleFast is configured to use latest released version.' -InformationAction 'Continue'
        }

        $moduleFastBootstrapUri = 'bit.ly/modulefast' # cSpell: disable-line

        Write-Debug -Message ('Using bootstrap script at {0}' -f $moduleFastBootstrapUri)

        $invokeWebRequestParameters = @{
            Uri         = $moduleFastBootstrapUri
            ErrorAction = 'Stop'
        }

        $moduleFastBootstrapScript = Invoke-WebRequest @invokeWebRequestParameters

        $moduleFastBootstrapScriptBlock = [ScriptBlock]::Create($moduleFastBootstrapScript)

        & $moduleFastBootstrapScriptBlock @moduleFastBootstrapScriptBlockParameters
    }
    catch
    {
        Write-Warning -Message ('ModuleFast could not be bootstrapped. Reverting to PSResourceGet. Error: {0}' -f $_.Exception.Message)

        $UseModuleFast = $false
        $UsePSResourceGet = $true
    }
}

if ($UsePSResourceGet)
{
    $psResourceGetModuleName = 'Microsoft.PowerShell.PSResourceGet'

    # If PSResourceGet was used prior it will be locked and we can't replace it.
    if ((Test-Path -Path "$PSDependTarget/$psResourceGetModuleName" -PathType 'Container') -and (Get-Module -Name $psResourceGetModuleName))
    {
        Write-Information -MessageData ('{0} is already bootstrapped and imported into the session. If there is a need to refresh the module, open a new session and resolve dependencies again.' -f $psResourceGetModuleName) -InformationAction 'Continue'
    }
    else
    {
        Write-Debug -Message ('{0} do not exist, saving the module to RequiredModules.' -f $psResourceGetModuleName)

        $psResourceGetDownloaded = $false

        try
        {
            if (-not $PSResourceGetVersion)
            {
                # Default to latest version if no version is passed in parameter or specified in configuration.
                $psResourceGetUri = "https://www.powershellgallery.com/api/v2/package/$psResourceGetModuleName"
            }
            else
            {
                $psResourceGetUri = "https://www.powershellgallery.com/api/v2/package/$psResourceGetModuleName/$PSResourceGetVersion"
            }

            $invokeWebRequestParameters = @{
                # TODO: Should support proxy parameters passed to the script.
                Uri         = $psResourceGetUri
                OutFile     = "$PSDependTarget/$psResourceGetModuleName.nupkg" # cSpell: ignore nupkg
                ErrorAction = 'Stop'
            }

            $previousProgressPreference = $ProgressPreference
            $ProgressPreference = 'SilentlyContinue'

            # Bootstrapping Microsoft.PowerShell.PSResourceGet.
            Invoke-WebRequest @invokeWebRequestParameters

            $ProgressPreference = $previousProgressPreference

            $psResourceGetDownloaded = $true
        }
        catch
        {
            Write-Warning -Message ('{0} could not be bootstrapped. Reverting to PowerShellGet. Error: {1}' -f $psResourceGetModuleName, $_.Exception.Message)
        }

        $UsePSResourceGet = $false

        if ($psResourceGetDownloaded)
        {
            # On Windows PowerShell the command Expand-Archive do not like .nupkg as a zip archive extension.
            $zipFileName = ((Split-Path -Path $invokeWebRequestParameters.OutFile -Leaf) -replace 'nupkg', 'zip')

            $renameItemParameters = @{
                Path    = $invokeWebRequestParameters.OutFile
                NewName = $zipFileName
                Force   = $true
            }

            Rename-Item @renameItemParameters

            $psResourceGetZipArchivePath = Join-Path -Path (Split-Path -Path $invokeWebRequestParameters.OutFile -Parent) -ChildPath $zipFileName

            $expandArchiveParameters = @{
                Path            = $psResourceGetZipArchivePath
                DestinationPath = "$PSDependTarget/$psResourceGetModuleName"
                Force           = $true
            }

            Expand-Archive @expandArchiveParameters

            Remove-Item -Path $psResourceGetZipArchivePath

            Import-Module -Name $expandArchiveParameters.DestinationPath -Force

            # Successfully bootstrapped PSResourceGet, so let's use it.
            $UsePSResourceGet = $true
        }
    }

    if ($UsePSResourceGet)
    {
        $psResourceGetModule = Get-Module -Name $psResourceGetModuleName

        $psResourceGetModuleVersion = $psResourceGetModule.Version.ToString()

        if ($psResourceGetModule.PrivateData.PSData.Prerelease)
        {
            $psResourceGetModuleVersion += '-{0}' -f $psResourceGetModule.PrivateData.PSData.Prerelease
        }

        Write-Information -MessageData ('Using {0} v{1}.' -f $psResourceGetModuleName, $psResourceGetModuleVersion) -InformationAction 'Continue'

        if ($UsePowerShellGetCompatibilityModule)
        {
            $savePowerShellGetParameters = @{
                Name            = 'PowerShellGet'
                Path            = $PSDependTarget
                Repository      = 'PSGallery'
                TrustRepository = $true
            }

            if ($UsePowerShellGetCompatibilityModuleVersion)
            {
                $savePowerShellGetParameters.Version = $UsePowerShellGetCompatibilityModuleVersion

                # Check if the version is a prerelease.
                if ($UsePowerShellGetCompatibilityModuleVersion -match '\d+\.\d+\.\d+-.*')
                {
                    $savePowerShellGetParameters.Prerelease = $true
                }
            }

            Save-PSResource @savePowerShellGetParameters

            Import-Module -Name "$PSDependTarget/PowerShellGet"
        }
    }
}

# Check if legacy PowerShellGet and PSDepend must be bootstrapped.
if (-not ($UseModuleFast -or $UsePSResourceGet))
{
    if ($PSVersionTable.PSVersion.Major -le 5)
    {
        <#
            Making sure the imported PackageManagement module is not from PS7 module
            path. The VSCode PS extension is changing the $env:PSModulePath and
            prioritize the PS7 path. This is an issue with PowerShellGet because
            it loads an old version if available (or fail to load latest).
        #>
        Get-Module -ListAvailable PackageManagement |
            Where-Object -Property 'ModuleBase' -NotMatch 'powershell.7' |
            Select-Object -First 1 |
            Import-Module -Force
    }

    Write-Progress -Activity 'Bootstrap:' -PercentComplete 0 -CurrentOperation 'NuGet Bootstrap'

    $importModuleParameters = @{
        Name           = 'PowerShellGet'
        MinimumVersion = '2.0'
        MaximumVersion = '2.8.999'
        ErrorAction    = 'SilentlyContinue'
        PassThru       = $true
    }

    if ($AllowOldPowerShellGetModule)
    {
        $importModuleParameters.Remove('MinimumVersion')
    }

    $powerShellGetModule = Import-Module @importModuleParameters

    # Install the package provider if it is not available.
    $nuGetProvider = Get-PackageProvider -Name 'NuGet' -ListAvailable -ErrorAction 'SilentlyContinue' |
        Select-Object -First 1

    if (-not $powerShellGetModule -and -not $nuGetProvider)
    {
        $providerBootstrapParameters = @{
            Name           = 'NuGet'
            Force          = $true
            ForceBootstrap = $true
            ErrorAction    = 'Stop'
            Scope          = $Scope
        }

        switch ($PSBoundParameters.Keys)
        {
            'Proxy'
            {
                $providerBootstrapParameters.Add('Proxy', $Proxy)
            }

            'ProxyCredential'
            {
                $providerBootstrapParameters.Add('ProxyCredential', $ProxyCredential)
            }

            'AllowPrerelease'
            {
                $providerBootstrapParameters.Add('AllowPrerelease', $AllowPrerelease)
            }
        }

        Write-Information -MessageData 'Bootstrap: Installing NuGet Package Provider from the web (Make sure Microsoft addresses/ranges are allowed).'

        $null = Install-PackageProvider @providerBootstrapParameters

        $nuGetProvider = Get-PackageProvider -Name 'NuGet' -ListAvailable | Select-Object -First 1

        $nuGetProviderVersion = $nuGetProvider.Version.ToString()

        Write-Information -MessageData "Bootstrap: Importing NuGet Package Provider version $nuGetProviderVersion to current session."

        $Null = Import-PackageProvider -Name 'NuGet' -RequiredVersion $nuGetProviderVersion -Force
    }

    if ($RegisterGallery)
    {
        if ($RegisterGallery.ContainsKey('Name') -and -not [System.String]::IsNullOrEmpty($RegisterGallery.Name))
        {
            $Gallery = $RegisterGallery.Name
        }
        else
        {
            $RegisterGallery.Name = $Gallery
        }

        Write-Progress -Activity 'Bootstrap:' -PercentComplete 7 -CurrentOperation "Verifying private package repository '$Gallery'" -Completed

        $previousRegisteredRepository = Get-PSRepository -Name $Gallery -ErrorAction 'SilentlyContinue'

        if ($previousRegisteredRepository.SourceLocation -ne $RegisterGallery.SourceLocation)
        {
            if ($previousRegisteredRepository)
            {
                Write-Progress -Activity 'Bootstrap:' -PercentComplete 9 -CurrentOperation "Re-registrering private package repository '$Gallery'" -Completed

                Unregister-PSRepository -Name $Gallery

                $unregisteredPreviousRepository = $true
            }
            else
            {
                Write-Progress -Activity 'Bootstrap:' -PercentComplete 9 -CurrentOperation "Registering private package repository '$Gallery'" -Completed
            }

            Register-PSRepository @RegisterGallery
        }
    }

    Write-Progress -Activity 'Bootstrap:' -PercentComplete 10 -CurrentOperation "Ensuring Gallery $Gallery is trusted"

    # Fail if the given PSGallery is not registered.
    $previousGalleryInstallationPolicy = (Get-PSRepository -Name $Gallery -ErrorAction 'Stop').Trusted

    $updatedGalleryInstallationPolicy = $false

    if ($previousGalleryInstallationPolicy -ne $true)
    {
        $updatedGalleryInstallationPolicy = $true

        # Only change policy if the repository is not trusted
        Set-PSRepository -Name $Gallery -InstallationPolicy 'Trusted' -ErrorAction 'Ignore'
    }
}

try
{
    # Check if legacy PowerShellGet and PSDepend must be used.
    if (-not ($UseModuleFast -or $UsePSResourceGet))
    {
        Write-Progress -Activity 'Bootstrap:' -PercentComplete 25 -CurrentOperation 'Checking PowerShellGet'

        # Ensure the module is loaded and retrieve the version you have.
        $powerShellGetVersion = (Import-Module -Name 'PowerShellGet' -PassThru -ErrorAction 'SilentlyContinue').Version

        Write-Verbose -Message "Bootstrap: The PowerShellGet version is $powerShellGetVersion"

        # Versions below 2.0 are considered old, unreliable & not recommended
        if (-not $powerShellGetVersion -or ($powerShellGetVersion -lt [System.Version] '2.0' -and -not $AllowOldPowerShellGetModule))
        {
            Write-Progress -Activity 'Bootstrap:' -PercentComplete 40 -CurrentOperation 'Fetching newer version of PowerShellGet'

            # PowerShellGet module not found, installing or saving it.
            if ($PSDependTarget -in 'CurrentUser', 'AllUsers')
            {
                Write-Debug -Message "PowerShellGet module not found. Attempting to install from Gallery $Gallery."

                Write-Warning -Message "Installing PowerShellGet in $PSDependTarget Scope."

                $installPowerShellGetParameters = @{
                    Name               = 'PowerShellGet'
                    Force              = $true
                    SkipPublisherCheck = $true
                    AllowClobber       = $true
                    Scope              = $Scope
                    Repository         = $Gallery
                    MaximumVersion     = '2.8.999'
                }

                switch ($PSBoundParameters.Keys)
                {
                    'Proxy'
                    {
                        $installPowerShellGetParameters.Add('Proxy', $Proxy)
                    }

                    'ProxyCredential'
                    {
                        $installPowerShellGetParameters.Add('ProxyCredential', $ProxyCredential)
                    }

                    'GalleryCredential'
                    {
                        $installPowerShellGetParameters.Add('Credential', $GalleryCredential)
                    }
                }

                Write-Progress -Activity 'Bootstrap:' -PercentComplete 60 -CurrentOperation 'Installing newer version of PowerShellGet'

                Install-Module @installPowerShellGetParameters
            }
            else
            {
                Write-Debug -Message "PowerShellGet module not found. Attempting to Save from Gallery $Gallery to $PSDependTarget"

                $saveModuleParameters = @{
                    Name           = 'PowerShellGet'
                    Repository     = $Gallery
                    Path           = $PSDependTarget
                    Force          = $true
                    MaximumVersion = '2.8.999'
                }

                Write-Progress -Activity 'Bootstrap:' -PercentComplete 60 -CurrentOperation "Saving PowerShellGet from $Gallery to $Scope"

                Save-Module @saveModuleParameters
            }

            Write-Debug -Message 'Removing previous versions of PowerShellGet and PackageManagement from session'

            Get-Module -Name 'PowerShellGet' -All | Remove-Module -Force -ErrorAction 'SilentlyContinue'
            Get-Module -Name 'PackageManagement' -All | Remove-Module -Force

            Write-Progress -Activity 'Bootstrap:' -PercentComplete 65 -CurrentOperation 'Loading latest version of PowerShellGet'

            Write-Debug -Message 'Importing latest PowerShellGet and PackageManagement versions into session'

            if ($AllowOldPowerShellGetModule)
            {
                $powerShellGetModule = Import-Module -Name 'PowerShellGet' -Force -PassThru
            }
            else
            {
                Import-Module -Name 'PackageManagement' -MinimumVersion '1.4.8.1' -Force

                $powerShellGetModule = Import-Module -Name 'PowerShellGet' -MinimumVersion '2.2.5' -Force -PassThru
            }

            $powerShellGetVersion = $powerShellGetModule.Version.ToString()

            Write-Information -MessageData "Bootstrap: PowerShellGet version loaded is $powerShellGetVersion"
        }

        # Try to import the PSDepend module from the available modules.
        $getModuleParameters = @{
            Name          = 'PSDepend'
            ListAvailable = $true
        }

        $psDependModule = Get-Module @getModuleParameters

        if ($PSBoundParameters.ContainsKey('MinimumPSDependVersion'))
        {
            try
            {
                $psDependModule = $psDependModule | Where-Object -FilterScript { $_.Version -ge $MinimumPSDependVersion }
            }
            catch
            {
                throw ('There was a problem finding the minimum version of PSDepend. Error: {0}' -f $_)
            }
        }

        if (-not $psDependModule)
        {
            Write-Debug -Message 'PSDepend module not found.'

            # PSDepend module not found, installing or saving it.
            if ($PSDependTarget -in 'CurrentUser', 'AllUsers')
            {
                Write-Debug -Message "Attempting to install from Gallery '$Gallery'."

                Write-Warning -Message "Installing PSDepend in $PSDependTarget Scope."

                $installPSDependParameters = @{
                    Name               = 'PSDepend'
                    Repository         = $Gallery
                    Force              = $true
                    Scope              = $PSDependTarget
                    SkipPublisherCheck = $true
                    AllowClobber       = $true
                }

                if ($MinimumPSDependVersion)
                {
                    $installPSDependParameters.Add('MinimumVersion', $MinimumPSDependVersion)
                }

                Write-Progress -Activity 'Bootstrap:' -PercentComplete 75 -CurrentOperation "Installing PSDepend from $Gallery"

                Install-Module @installPSDependParameters
            }
            else
            {
                Write-Debug -Message "Attempting to Save from Gallery $Gallery to $PSDependTarget"

                $saveModuleParameters = @{
                    Name       = 'PSDepend'
                    Repository = $Gallery
                    Path       = $PSDependTarget
                    Force      = $true
                }

                if ($MinimumPSDependVersion)
                {
                    $saveModuleParameters.add('MinimumVersion', $MinimumPSDependVersion)
                }

                Write-Progress -Activity 'Bootstrap:' -PercentComplete 75 -CurrentOperation "Saving PSDepend from $Gallery to $PSDependTarget"

                Save-Module @saveModuleParameters
            }
        }

        Write-Progress -Activity 'Bootstrap:' -PercentComplete 80 -CurrentOperation 'Importing PSDepend'

        $importModulePSDependParameters = @{
            Name        = 'PSDepend'
            ErrorAction = 'Stop'
            Force       = $true
        }

        if ($PSBoundParameters.ContainsKey('MinimumPSDependVersion'))
        {
            $importModulePSDependParameters.Add('MinimumVersion', $MinimumPSDependVersion)
        }

        # We should have successfully bootstrapped PSDepend. Fail if not available.
        $null = Import-Module @importModulePSDependParameters

        Write-Progress -Activity 'Bootstrap:' -PercentComplete 81 -CurrentOperation 'Invoke PSDepend'

        if ($WithYAML)
        {
            Write-Progress -Activity 'Bootstrap:' -PercentComplete 82 -CurrentOperation 'Verifying PowerShell module PowerShell-Yaml'

            if (-not (Get-Module -ListAvailable -Name 'PowerShell-Yaml'))
            {
                Write-Progress -Activity 'Bootstrap:' -PercentComplete 85 -CurrentOperation 'Installing PowerShell module PowerShell-Yaml'

                Write-Verbose -Message "PowerShell-Yaml module not found. Attempting to Save from Gallery '$Gallery' to '$PSDependTarget'."

                $SaveModuleParam = @{
                    Name       = 'PowerShell-Yaml'
                    Repository = $Gallery
                    Path       = $PSDependTarget
                    Force      = $true
                }

                Save-Module @SaveModuleParam
            }
            else
            {
                Write-Verbose -Message 'PowerShell-Yaml is already available'
            }

            Write-Progress -Activity 'Bootstrap:' -PercentComplete 88 -CurrentOperation 'Importing PowerShell module PowerShell-Yaml'
        }
    }

    if (Test-Path -Path $DependencyFile)
    {
        if ($UseModuleFast -or $UsePSResourceGet)
        {
            $requiredModules = Import-PowerShellDataFile -Path $DependencyFile

            $requiredModules = $requiredModules.GetEnumerator() |
                Where-Object -FilterScript { $_.Name -ne 'PSDependOptions' }

            if ($UseModuleFast)
            {
                Write-Progress -Activity 'Bootstrap:' -PercentComplete 90 -CurrentOperation 'Invoking ModuleFast'

                Write-Progress -Activity 'ModuleFast:' -PercentComplete 0 -CurrentOperation 'Restoring Build Dependencies'

                $modulesToSave = @(
                    'PSDepend' # Always include PSDepend for backward compatibility.
                )

                if ($WithYAML)
                {
                    $modulesToSave += 'PowerShell-Yaml'
                }

                if ($UsePowerShellGetCompatibilityModule)
                {
                    Write-Debug -Message 'PowerShellGet compatibility module is configured to be used.'

                    # This is needed to ensure that the PowerShellGet compatibility module works.
                    $psResourceGetModuleName = 'Microsoft.PowerShell.PSResourceGet'

                    if ($PSResourceGetVersion)
                    {
                        $modulesToSave += ('{0}:[{1}]' -f $psResourceGetModuleName, $PSResourceGetVersion)
                    }
                    else
                    {
                        $modulesToSave += $psResourceGetModuleName
                    }

                    $powerShellGetCompatibilityModuleName = 'PowerShellGet'

                    if ($UsePowerShellGetCompatibilityModuleVersion)
                    {
                        $modulesToSave += ('{0}:[{1}]' -f $powerShellGetCompatibilityModuleName, $UsePowerShellGetCompatibilityModuleVersion)
                    }
                    else
                    {
                        $modulesToSave += $powerShellGetCompatibilityModuleName
                    }
                }

                foreach ($requiredModule in $requiredModules)
                {
                    # If the RequiredModules.psd1 entry is an Hashtable then special handling is needed.
                    if ($requiredModule.Value -is [System.Collections.Hashtable])
                    {
                        if (-not $requiredModule.Value.Version)
                        {
                            $requiredModuleVersion = 'latest'
                        }
                        else
                        {
                            $requiredModuleVersion = $requiredModule.Value.Version
                        }

                        if ($requiredModuleVersion -eq 'latest')
                        {
                            $moduleNameSuffix = ''

                            if ($requiredModule.Value.Parameters.AllowPrerelease -eq $true)
                            {
                                <#
                                    Adding '!' to the module name indicate to ModuleFast
                                    that is should also evaluate pre-releases.
                                #>
                                $moduleNameSuffix = '!'
                            }

                            $modulesToSave += ('{0}{1}' -f $requiredModule.Name, $moduleNameSuffix)
                        }
                        else
                        {
                            $modulesToSave += ('{0}:[{1}]' -f $requiredModule.Name, $requiredModuleVersion)
                        }
                    }
                    else
                    {
                        if ($requiredModule.Value -eq 'latest')
                        {
                            $modulesToSave += $requiredModule.Name
                        }
                        else
                        {
                            # Handle different nuget version operators already present.
                            if ($requiredModule.Value -match '[!|:|[|(|,|>|<|=]')
                            {
                                $modulesToSave += ('{0}{1}' -f $requiredModule.Name, $requiredModule.Value)
                            }
                            else
                            {
                                # Assuming the version is a fixed version.
                                $modulesToSave += ('{0}:[{1}]' -f $requiredModule.Name, $requiredModule.Value)
                            }
                        }
                    }
                }

                Write-Debug -Message ("Required modules to retrieve plan for:`n{0}" -f ($modulesToSave | Out-String))

                $installModuleFastParameters = @{
                    Destination          = $PSDependTarget
                    DestinationOnly      = $true
                    NoPSModulePathUpdate = $true
                    NoProfileUpdate      = $true
                    Update               = $true
                    Confirm              = $false
                }

                $moduleFastPlan = Install-ModuleFast -Specification $modulesToSave -Plan @installModuleFastParameters

                Write-Debug -Message ("Missing modules that need to be saved:`n{0}" -f ($moduleFastPlan | Out-String))

                if ($moduleFastPlan)
                {
                    # Clear all modules in plan from the current session so they can be fetched again.
                    $moduleFastPlan.Name | Get-Module | Remove-Module -Force

                    $moduleFastPlan | Install-ModuleFast @installModuleFastParameters
                }
                else
                {
                    Write-Verbose -Message 'All required modules were already up to date'
                }

                Write-Progress -Activity 'ModuleFast:' -PercentComplete 100 -CurrentOperation 'Dependencies restored' -Completed
            }

            if ($UsePSResourceGet)
            {
                Write-Progress -Activity 'Bootstrap:' -PercentComplete 90 -CurrentOperation 'Invoking PSResourceGet'

                $modulesToSave = @(
                    @{
                        Name = 'PSDepend'  # Always include PSDepend for backward compatibility.
                    }
                )

                if ($WithYAML)
                {
                    $modulesToSave += @{
                        Name = 'PowerShell-Yaml'
                    }
                }

                # Prepare hashtable that can be concatenated to the Save-PSResource parameters.
                foreach ($requiredModule in $requiredModules)
                {
                    # If the RequiredModules.psd1 entry is an Hashtable then special handling is needed.
                    if ($requiredModule.Value -is [System.Collections.Hashtable])
                    {
                        $saveModuleHashtable = @{
                            Name = $requiredModule.Name
                        }

                        if ($requiredModule.Value.Version -and $requiredModule.Value.Version -ne 'latest')
                        {
                            $saveModuleHashtable.Version = $requiredModule.Value.Version
                        }

                        if ($requiredModule.Value.Parameters.AllowPrerelease -eq $true)
                        {
                            $saveModuleHashtable.Prerelease = $true
                        }

                        $modulesToSave += $saveModuleHashtable
                    }
                    else
                    {
                        if ($requiredModule.Value -eq 'latest')
                        {
                            $modulesToSave += @{
                                Name = $requiredModule.Name
                            }
                        }
                        else
                        {
                            $modulesToSave += @{
                                Name    = $requiredModule.Name
                                Version = $requiredModule.Value
                            }
                        }
                    }
                }

                $percentagePerModule = [System.Math]::Floor(100 / $modulesToSave.Length)

                $progressPercentage = 0

                Write-Progress -Activity 'PSResourceGet:' -PercentComplete $progressPercentage -CurrentOperation 'Restoring Build Dependencies'

                foreach ($currentModule in $modulesToSave)
                {
                    Write-Progress -Activity 'PSResourceGet:' -PercentComplete $progressPercentage -CurrentOperation 'Restoring Build Dependencies' -Status ('Saving module {0}' -f $savePSResourceParameters.Name)

                    $savePSResourceParameters = @{
                        Path            = $PSDependTarget
                        TrustRepository = $true
                        Confirm         = $false
                    }

                    # Concatenate the module parameters to the Save-PSResource parameters.
                    $savePSResourceParameters += $currentModule

                    # Modules that Sampler depend on that cannot be refreshed without a new session.
                    $skipModule = @('PowerShell-Yaml')

                    if ($savePSResourceParameters.Name -in $skipModule -and (Get-Module -Name $savePSResourceParameters.Name))
                    {
                        Write-Progress -Activity 'PSResourceGet:' -PercentComplete $progressPercentage -CurrentOperation 'Restoring Build Dependencies' -Status ('Skipping module {0}' -f $savePSResourceParameters.Name)

                        Write-Information -MessageData ('Skipping the module {0} since it cannot be refresh while loaded into the session. To refresh the module open a new session and resolve dependencies again.' -f $savePSResourceParameters.Name) -InformationAction 'Continue'
                    }
                    else
                    {
                        # Clear all module from the current session so any new version fetched will be re-imported.
                        Get-Module -Name $savePSResourceParameters.Name | Remove-Module -Force

                        Save-PSResource @savePSResourceParameters -ErrorVariable 'savePSResourceError'

                        if ($savePSResourceError)
                        {
                            Write-Warning -Message 'Save-PSResource could not save (replace) one or more dependencies. This can be due to the module is loaded into the session (and referencing assemblies). Close the current session and open a new session and try again.'
                        }
                    }

                    $progressPercentage += $percentagePerModule
                }

                Write-Progress -Activity 'PSResourceGet:' -PercentComplete 100 -CurrentOperation 'Dependencies restored' -Completed
            }
        }
        else
        {
            Write-Progress -Activity 'Bootstrap:' -PercentComplete 90 -CurrentOperation 'Invoking PSDepend'

            Write-Progress -Activity 'PSDepend:' -PercentComplete 0 -CurrentOperation 'Restoring Build Dependencies'

            $psDependParameters = @{
                Force = $true
                Path  = $DependencyFile
            }

            # TODO: Handle when the Dependency file is in YAML, and -WithYAML is specified.
            Invoke-PSDepend @psDependParameters

            Write-Progress -Activity 'PSDepend:' -PercentComplete 100 -CurrentOperation 'Dependencies restored' -Completed
        }
    }
    else
    {
        Write-Warning -Message "The dependency file '$DependencyFile' could not be found."
    }

    Write-Progress -Activity 'Bootstrap:' -PercentComplete 100 -CurrentOperation 'Bootstrap complete' -Completed
}
finally
{
    if ($RegisterGallery)
    {
        Write-Verbose -Message "Removing private package repository '$Gallery'."
        Unregister-PSRepository -Name $Gallery
    }

    if ($unregisteredPreviousRepository)
    {
        Write-Verbose -Message "Reverting private package repository '$Gallery' to previous location URI:s."

        $registerPSRepositoryParameters = @{
            Name               = $previousRegisteredRepository.Name
            InstallationPolicy = $previousRegisteredRepository.InstallationPolicy
        }

        if ($previousRegisteredRepository.SourceLocation)
        {
            $registerPSRepositoryParameters.SourceLocation = $previousRegisteredRepository.SourceLocation
        }

        if ($previousRegisteredRepository.PublishLocation)
        {
            $registerPSRepositoryParameters.PublishLocation = $previousRegisteredRepository.PublishLocation
        }

        if ($previousRegisteredRepository.ScriptSourceLocation)
        {
            $registerPSRepositoryParameters.ScriptSourceLocation = $previousRegisteredRepository.ScriptSourceLocation
        }

        if ($previousRegisteredRepository.ScriptPublishLocation)
        {
            $registerPSRepositoryParameters.ScriptPublishLocation = $previousRegisteredRepository.ScriptPublishLocation
        }

        Register-PSRepository @registerPSRepositoryParameters
    }

    if ($updatedGalleryInstallationPolicy -eq $true -and $previousGalleryInstallationPolicy -ne $true)
    {
        # Only try to revert installation policy if the repository exist
        if ((Get-PSRepository -Name $Gallery -ErrorAction 'SilentlyContinue'))
        {
            # Reverting the Installation Policy for the given gallery if it was not already trusted
            Set-PSRepository -Name $Gallery -InstallationPolicy 'Untrusted'
        }
    }

    Write-Verbose -Message 'Project Bootstrapped, returning to Invoke-Build.'
}
