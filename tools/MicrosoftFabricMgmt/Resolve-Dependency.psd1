@{
    <#
        Default parameter values to be loaded by the Resolve-Dependency.ps1 script (unless set in bound parameters
        when calling the script).
    #>

    #PSDependTarget  = './output/modules'
    #Proxy = ''
    #ProxyCredential = '$MyCredentialVariable' #TODO: find a way to support credentials in build (resolve variable)

    Gallery         = 'PSGallery'

    # To use a private nuget repository change the following to your own feed. The locations must be a Nuget v2 feed due
    # to limitation in PowerShellGet v2.x. Example below is for a Azure DevOps Server project-scoped feed. While resolving
    # dependencies it will be registered as a trusted repository with the name specified in the property 'Gallery' above,
    # unless property 'Name' is provided in the hashtable below, if so it will override the property 'Gallery' above. The
    # registered repository will be removed when dependencies has been resolved, unless it was already registered to begin
    # with. If repository is registered already but with different URL:s the repository will be re-registered and reverted
    # after dependencies has been resolved. Currently only Windows integrated security works with private Nuget v2 feeds
    # (or if it is a public feed with no security), it is not possible yet to securely provide other credentials for the feed.
    # Private repositories will currently only work using PowerShellGet.
    #RegisterGallery = @{
    #    #Name = 'MyPrivateFeedName'
    #    GallerySourceLocation = 'https://azdoserver.company.local/<org_name>/<project_name>/_packaging/<feed_name>/nuget/v2'
    #    GalleryPublishLocation = 'https://azdoserver.company.local/<org_name>/<project_name>/_packaging/<feed_name>/nuget/v2'
    #    GalleryScriptSourceLocation = 'https://azdoserver.company.local/<org_name>/<project_name>/_packaging/<feed_name>/nuget/v2'
    #    GalleryScriptPublishLocation = 'https://azdoserver.company.local/<org_name>/<project_name>/_packaging/<feed_name>/nuget/v2'
    #    #InstallationPolicy = 'Trusted'
    #}

    #AllowOldPowerShellGetModule = $true
    #MinimumPSDependVersion = '0.3.0'
    AllowPrerelease = $false
    WithYAML        = $true # Will also bootstrap PowerShell-Yaml to read other config files

    <#
        Enable ModuleFast to be the default method of resolving dependencies by setting
        UseModuleFast to the value $true. ModuleFast requires PowerShell 7.2 or higher.
        If UseModuleFast is not configured or set to $false then PowerShellGet (or
        PSResourceGet if enabled) will be used to as the default method of resolving
        dependencies. You can always use the parameter `-UseModuleFast` of the
        Resolve-Dependency.ps1 or build.ps1 script even when this is not configured
        or set to $false.

        You can use ModuleFastVersion to specify a specific version of ModuleFast to use.
        This will also affect the use of parameter `-UseModuleFast` of the Resolve-Dependency.ps1
        or build.ps1 script. If ModuleFastVersion is not configured then the latest
        (non-preview) released version is used.

        ModuleFastBleedingEdge will override ModuleFastVersion and use the absolute latest
        code from the ModuleFast repository. This is useful if you want to test the absolute
        latest changes in ModuleFast repository. This is not recommended for production use.
        By enabling ModuleFastBleedingEdge the pipeline can encounter breaking changes or
        problems by code that is merged in the ModuleFast repository, this could affect the
        pipeline negatively. Make sure to use a clean PowerShell session after changing
        the value of ModuleFastBleedingEdge so that ModuleFast uses the correct bootstrap
        script and correct parameter values. This will also affect the use of parameter
        `-UseModuleFast` of the Resolve-Dependency.ps1 or build.ps1 script.
    #>
    #UseModuleFast = $true
    #ModuleFastVersion = '0.1.2'
    #ModuleFastBleedingEdge = $true

    <#
        Enable PSResourceGet to be the default method of resolving dependencies by setting
        UsePSResourceGet to the value $true. If UsePSResourceGet is not configured or
        set to $false then PowerShellGet will be used to resolve dependencies.
    #>
    UsePSResourceGet = $true
    PSResourceGetVersion = '1.0.1'

    # PowerShellGet compatibility module only works when using PSResourceGet or ModuleFast.
    UsePowerShellGetCompatibilityModule = $true
    UsePowerShellGetCompatibilityModuleVersion = '3.0.23-beta23'
}

