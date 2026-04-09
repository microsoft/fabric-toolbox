<#
.SYNOPSIS
    Fabric Security Audit — Warehouse & SQL Endpoint security troubleshooter.

.DESCRIPTION
    Collects security-related information for troubleshooting access issues
    on a single Fabric Warehouse OR a Lakehouse SQL Endpoint.

    Supply either a Power BI URL (-Url) or manual IDs (-WorkspaceId / -ArtifactId).
    The artifact type is auto-detected from the Fabric API.

    Warehouse mode collects:
      - Workspace metadata and role assignments
      - Warehouse properties and SQL endpoint
      - SQL permission evidence (roles, memberships, DENY entries, RLS/CLS)
      - Identity mode detection
      - User / security-group principal resolution

    SQL Endpoint (Lakehouse) mode additionally collects:
      - Parent Lakehouse discovery
      - OneLake Data Access Roles (OneLake Security)
      - Shortcut enumeration and cross-workspace permission checks

    All results are written to a timestamped output folder as CSV / JSON files
    and a consolidated Markdown report.

  PREREQUISITES
  =============
    PowerShell module (auto-installed if missing):
      - Az.Accounts          (Azure authentication & token acquisition)

    Required permissions (the account running this script needs):

    Fabric / Power BI:
      - Workspace Admin or Member role on the target workspace
        (needed to read role assignments, artifacts, and OneLake Security)

    Microsoft Graph (for -InvestigateUsers / -SummarizeUsers):
      - User.Read.All        (resolve UPNs and Object IDs)
      - GroupMember.Read.All  (enumerate group memberships and members)
      - Directory.Read.All    (alternative; covers both of the above)

    SQL Endpoint:
      - The logged-in identity must be able to connect to the SQL endpoint
        and query sys.database_principals, sys.database_permissions, etc.
        Typically requires db_owner or equivalent on the database.

    Note: If running with a service principal instead of a user account,
    ensure the SP has the above API permissions granted as Application
    permissions (not Delegated) and is added to the workspace.

.PARAMETER Url
    A Power BI / Fabric URL for the warehouse or SQL endpoint.
    The workspace and artifact IDs are extracted automatically.
    Example: https://app.powerbi.com/groups/<wsId>/warehouses/<artId>?...
    Example: https://app.powerbi.com/groups/<wsId>/lakewarehouses/<artId>?...

.PARAMETER WorkspaceId
    The Fabric workspace GUID. Required if -Url is not provided.

.PARAMETER ArtifactId
    The artifact (Warehouse or Lakehouse SQL Endpoint) GUID.
    Required if -Url is not provided.

.PARAMETER InvestigateUsers
    One or more User Principal Names (UPNs) or AAD Object IDs to investigate.

.PARAMETER SqlEndpointOverride
    Optional. Manually specify the SQL endpoint FQDN if auto-discovery fails.
    Example: abcd1234-xxxx.datawarehouse.fabric.microsoft.com

.PARAMETER DatabaseName
    Optional. The SQL database name. Defaults to the artifact display name.

.PARAMETER MaxRows
    Maximum rows returned per SQL query and maximum items per API result set.
    Defaults to 5000. SQL queries use SELECT TOP (MaxRows). When results hit
    the limit, the user is prompted to save all, truncate, or skip (unless
    -NoPrompt is set).

.PARAMETER MaxGroupMembers
    Maximum members returned when enumerating an AAD security group.
    Defaults to 500. Uses Graph API $top parameter.

.PARAMETER NoPrompt
    Suppress interactive prompts. When a result set exceeds MaxRows the script
    will automatically truncate rather than asking. Useful for CI/automation.

.PARAMETER SummarizeUsers
    Optional. One or more UPNs or AAD Object IDs to produce a consolidated
    "Effective Access Summary" (section 8.5) showing every access layer in one
    table per user. These users are automatically included in -InvestigateUsers.
    If omitted, section 8.5 is skipped.

.PARAMETER User
    Shorthand for -SummarizeUsers with a single user. Accepts a UPN or Object ID.
    Automatically triggers investigation and effective access summary for that user.

.PARAMETER NoSafeguards
    Disable row limits on SQL queries and API results. All queries run without
    SELECT TOP and no truncation prompts are shown. Use with caution on large
    environments.

.PARAMETER NoZip
    Skip creating a .zip package of the output folder. By default the script
    creates a zip alongside the output folder for easy sharing.

.PARAMETER Help
    Show usage examples and parameter reference, then exit.

.PARAMETER OutputFolder
    Folder where results are written. Defaults to .\FabricSecurityAudit_<type>_<timestamp>.

.EXAMPLE
    # From a URL (simplest)
    .\Invoke-FabricSecurityAudit.ps1 `
        -Url "https://app.powerbi.com/groups/aaaa-bbbb/warehouses/1111-2222?ctid=..."

.EXAMPLE
    # Investigate a specific user with effective access summary
    .\Invoke-FabricSecurityAudit.ps1 `
        -Url "https://app.powerbi.com/groups/aaaa-bbbb/warehouses/1111-2222" `
        -User "user@contoso.com"

.EXAMPLE
    # No safeguards, no zip, no prompts
    .\Invoke-FabricSecurityAudit.ps1 `
        -Url "https://..." -NoSafeguards -NoZip -NoPrompt

.EXAMPLE
    # Show help
    .\Invoke-FabricSecurityAudit.ps1 -Help
#>

# NOTE: #Requires removed intentionally — we auto-install Az.Accounts below.

[CmdletBinding()]
param(
    [string]$Url,

    [ValidatePattern('^[0-9a-fA-F\-]{36}$')]
    [string]$WorkspaceId,

    [ValidatePattern('^[0-9a-fA-F\-]{36}$')]
    [string]$ArtifactId,

    [string[]]$InvestigateUsers = @(),

    [string]$SqlEndpointOverride,

    [string]$DatabaseName,

    [ValidateRange(100, 1000000)]
    [int]$MaxRows = 5000,

    [ValidateRange(10, 100000)]
    [int]$MaxGroupMembers = 500,

    [switch]$NoPrompt,

    [string[]]$SummarizeUsers = @(),

    [string]$User,

    [switch]$NoSafeguards,

    [switch]$NoZip,

    [Alias('h')]
    [switch]$Help,

    [string]$DiffWith,

    [string]$OutputFolder
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
$script:Version = '2.0.0'

# ============================================================
#region  BANNER
# ============================================================

function Show-Banner {
    $v = $script:Version
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

    function Write-BannerLine ([string]$Text, [string]$Color = 'White') {
        $pad = 59 - $Text.Length
        if ($pad -lt 0) { $Text = $Text.Substring(0, 59); $pad = 0 }
        Write-Host '   |' -NoNewline -ForegroundColor DarkCyan
        Write-Host "$Text$(' ' * $pad)" -NoNewline -ForegroundColor $Color
        Write-Host '|' -ForegroundColor DarkCyan
    }

    function Write-BannerParts ([object[]]$Parts) {
        Write-Host '   |' -NoNewline -ForegroundColor DarkCyan
        $len = 0
        foreach ($seg in $Parts) {
            Write-Host $seg[0] -NoNewline -ForegroundColor $seg[1]
            $len += $seg[0].Length
        }
        $pad = 59 - $len
        if ($pad -gt 0) { Write-Host (' ' * $pad) -NoNewline }
        Write-Host '|' -ForegroundColor DarkCyan
    }

    $border = '   +' + ('-' * 59) + '+'

    Write-Host ''
    Write-Host $border -ForegroundColor DarkCyan
    Write-BannerLine '' -Color DarkCyan
    Write-BannerParts @(@('     _______  ','Green'),  @(' ___       _          _        ','Cyan'))
    Write-BannerParts @(@('    / ______/ ','Green'),  @('| __| __ _| |__  _ __(_) ___   ','Cyan'))
    Write-BannerParts @(@('   / /','Green'), @('____  ','DarkGreen'), @("| _| / _' | '_ \\| '__| / __|  ",'Cyan'))
    Write-BannerParts @(@('  / /','Green'), @(' / __/ ','DarkGreen'), @('| |  | (_| | |_) | |  | | (__   ','Cyan'))
    Write-BannerParts @(@(' / /','Green'), @(' / /   ','DarkGreen'), @('|_|   \__,_|_.__/|_|  |_|\___|  ','Cyan'))
    Write-BannerParts @(@(' / /','Green'), @(' / /','DarkGreen'))
    Write-BannerParts @(@('/_/','Green'), @(' /_/   ','DarkGreen'), @(' ___                 _ _        ','DarkYellow'))
    Write-BannerParts @(@('       ','Green'),       @('   / _ | _  _ __| (_) |_       ','DarkYellow'))
    Write-BannerParts @(@('       ','Green'),       @('  / _  | || / _` | |  _|      ','DarkYellow'))
    Write-BannerParts @(@('       ','Green'),       @(' /_/ |_|\_,_|\__,_|_|\__|      ','DarkYellow'))
    Write-BannerLine '' -Color DarkCyan
    Write-BannerLine "   FABRIC SECURITY AUDIT                     v$v" -Color White
    Write-BannerLine '   Warehouse & SQL Endpoint Security Troubleshooter' -Color Gray
    Write-BannerLine "   $ts" -Color DarkGray
    Write-BannerLine '' -Color DarkCyan
    Write-Host $border -ForegroundColor DarkCyan
    Write-Host ''
}

Show-Banner

# ============================================================
#region  HELP
# ============================================================

if ($Help) {
    Write-Host '  USAGE' -ForegroundColor Cyan
    Write-Host '  -----' -ForegroundColor DarkCyan
    Write-Host ''
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -Url <PowerBI_URL>' -ForegroundColor White
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -Url <URL> -User <UPN_or_ObjectId>' -ForegroundColor White
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -WorkspaceId <GUID> -ArtifactId <GUID>' -ForegroundColor White
    Write-Host ''
    Write-Host '  PARAMETERS' -ForegroundColor Cyan
    Write-Host '  ----------' -ForegroundColor DarkCyan
    Write-Host '    -Url               Power BI URL (auto-extracts workspace & artifact IDs)' -ForegroundColor Gray
    Write-Host '    -WorkspaceId       Workspace GUID (if not using -Url)' -ForegroundColor Gray
    Write-Host '    -ArtifactId        Warehouse or SQL Endpoint GUID (if not using -Url)' -ForegroundColor Gray
    Write-Host '    -User              UPN or Object ID to investigate + summarize' -ForegroundColor Gray
    Write-Host '    -InvestigateUsers  One or more UPNs/Object IDs to investigate' -ForegroundColor Gray
    Write-Host '    -SummarizeUsers    One or more UPNs/Object IDs for effective access summary' -ForegroundColor Gray
    Write-Host '    -SqlEndpointOverride  Manual SQL FQDN if auto-discovery fails' -ForegroundColor Gray
    Write-Host '    -DatabaseName      Override the database name' -ForegroundColor Gray
    Write-Host '    -MaxRows           Max rows per SQL query (default: 5000)' -ForegroundColor Gray
    Write-Host '    -MaxGroupMembers   Max group members from Graph (default: 500)' -ForegroundColor Gray
    Write-Host '    -NoPrompt          Skip interactive prompts (auto-truncate)' -ForegroundColor Gray
    Write-Host '    -NoSafeguards      Remove all row limits (caution on large envs)' -ForegroundColor Gray
    Write-Host '    -NoZip             Skip creating a zip package of output' -ForegroundColor Gray
    Write-Host '    -OutputFolder      Custom output folder path' -ForegroundColor Gray
    Write-Host '    -Help              Show this help and exit' -ForegroundColor Gray
    Write-Host ''
    Write-Host '  EXAMPLES' -ForegroundColor Cyan
    Write-Host '  --------' -ForegroundColor DarkCyan
    Write-Host '    # Basic audit from a URL' -ForegroundColor DarkGray
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -Url "https://app.powerbi.com/groups/.../warehouses/..."' -ForegroundColor White
    Write-Host ''
    Write-Host '    # Audit + investigate a specific user' -ForegroundColor DarkGray
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -Url "https://..." -User "user@contoso.com"' -ForegroundColor White
    Write-Host ''
    Write-Host '    # No limits, no zip, automated' -ForegroundColor DarkGray
    Write-Host '    .\Invoke-FabricSecurityAudit.ps1 -Url "https://..." -NoSafeguards -NoZip -NoPrompt' -ForegroundColor White
    Write-Host ''
    exit 0
}

#endregion

# ============================================================
#region  AUTO-INSTALL DEPENDENCIES
# ============================================================

$requiredModules = @('Az.Accounts')

foreach ($mod in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $mod -ErrorAction SilentlyContinue)) {
        Write-Host "  Module '$mod' not found — installing ..." -ForegroundColor Yellow
        try {
            # Prefer PowerShellGet v3+ (Install-PSResource) if available
            if (Get-Command Install-PSResource -ErrorAction SilentlyContinue) {
                Install-PSResource -Name $mod -Scope CurrentUser -TrustRepository -Quiet
            } else {
                Install-Module -Name $mod -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
            }
            Write-Host "  Module '$mod' installed successfully." -ForegroundColor Green
        }
        catch {
            throw "Failed to install required module '$mod'. Install it manually: Install-Module $mod -Scope CurrentUser`n$($_.Exception.Message)"
        }
    }
}

# Import Az.Accounts so its cmdlets are available
Import-Module Az.Accounts -ErrorAction Stop

#endregion

# ============================================================
#region  URL PARSING & INPUT VALIDATION
# ============================================================

if ($Url) {
    if ($Url -match '/groups/([0-9a-fA-F\-]{36})/(warehouses|lakewarehouses)/([0-9a-fA-F\-]{36})') {
        $WorkspaceId = $Matches[1]
        $ArtifactId  = $Matches[3]
        $urlHint     = $Matches[2]
        Write-Host "  URL parsed successfully" -ForegroundColor Green
        Write-Host "    Workspace  : $WorkspaceId"
        Write-Host "    Artifact   : $ArtifactId"
        Write-Host "    Type hint  : $urlHint"
    }
    else {
        throw "Could not parse IDs from URL. Expected: .../groups/<wsId>/warehouses/<artId> or .../groups/<wsId>/lakewarehouses/<artId>"
    }
}

if (-not $WorkspaceId -or -not $ArtifactId) {
    throw 'You must provide either -Url or both -WorkspaceId and -ArtifactId.'
}

# -User is shorthand for -SummarizeUsers with a single user
if ($User) {
    $SummarizeUsers = @($User) + $SummarizeUsers | Select-Object -Unique
}

# Auto-merge SummarizeUsers into InvestigateUsers so data is collected for them
if ($SummarizeUsers.Count -gt 0) {
    $InvestigateUsers = ($InvestigateUsers + $SummarizeUsers) | Select-Object -Unique
}

# Apply -NoSafeguards: remove row limits
if ($NoSafeguards) {
    $MaxRows = [int]::MaxValue
    $MaxGroupMembers = [int]::MaxValue
}

#endregion

# ============================================================
#region  HELPERS
# ============================================================

$script:SectionNum = 0
$script:TotalSections = 12
$script:AuditStart = Get-Date
$script:SectionTimings = [System.Collections.Generic.List[PSCustomObject]]::new()
$script:LastSectionStart = $null
$script:LastSectionName = $null
$script:Issues = [System.Collections.Generic.List[string]]::new()

function Write-Section ([string]$Title) {
    if ($script:LastSectionStart -and $script:LastSectionName) {
        $dur = ((Get-Date) - $script:LastSectionStart).TotalSeconds
        $script:SectionTimings.Add([PSCustomObject]@{ Section = $script:LastSectionName; Duration = [math]::Round($dur, 1) })
    }
    $script:SectionNum++
    $script:LastSectionStart = Get-Date
    $script:LastSectionName = $Title
    $elapsed = ((Get-Date) - $script:AuditStart).ToString('mm\:ss')
    $pct = [math]::Round(($script:SectionNum / $script:TotalSections) * 100)
    Write-Host ''
    Write-Host "  >> " -NoNewline -ForegroundColor DarkYellow
    Write-Host "[$script:SectionNum/$script:TotalSections] " -NoNewline -ForegroundColor DarkGray
    Write-Host $Title -NoNewline -ForegroundColor Cyan
    Write-Host "  ($elapsed | $pct%)" -ForegroundColor DarkGray
    Write-Host "    $('-' * ($Title.Length + 2))" -ForegroundColor DarkCyan
}

function Confirm-LargeResultSet {
    <#
    .SYNOPSIS
        Warns when a result set exceeds the configured limit.
        Returns $true if processing should continue, $false to skip/truncate.
    #>
    [CmdletBinding()]
    param(
        [string]$Section,
        [int]$RowCount,
        [int]$Limit,
        [switch]$IsSql  # SQL queries can be re-run with TOP
    )
    if ($RowCount -le $Limit) { return $true }

    Write-Host "    WARNING: $Section returned $RowCount rows (limit: $Limit)." -ForegroundColor Red
    if ($script:NoPromptFlag) {
        Write-Host "    -NoPrompt set — saving first $Limit rows and continuing." -ForegroundColor Yellow
        return $false  # caller should truncate
    }
    Write-Host '    Options:' -ForegroundColor Yellow
    Write-Host '      [A] Save ALL rows      [T] Truncate to limit      [S] Skip this section' -ForegroundColor Yellow
    $choice = Read-Host '    Choose [A/T/S]'
    switch ($choice.ToUpper()) {
        'A' { return $true }
        'S' { return $null }  # null = skip entirely
        default { return $false }  # truncate
    }
}

function Get-PlainToken ([string]$ResourceUrl) {
    # Az.Accounts >=12 returns SecureString in .Token; older returns plain string.
    $t = Get-AzAccessToken -ResourceUrl $ResourceUrl
    if ($t.Token -is [securestring]) {
        [System.Net.NetworkCredential]::new('', $t.Token).Password
    } else {
        $t.Token
    }
}

function Get-FabricToken { Get-PlainToken 'https://api.fabric.microsoft.com' }
function Get-GraphToken  { Get-PlainToken 'https://graph.microsoft.com' }
function Get-SqlToken    { Get-PlainToken 'https://database.windows.net' }

function Invoke-FabricApi {
    [CmdletBinding()]
    param(
        [string]$Path,
        [string]$Method = 'GET',
        [object]$Body
    )
    $uri = "https://api.fabric.microsoft.com/v1$Path"
    $headers = @{ Authorization = "Bearer $(Get-FabricToken)"; 'Content-Type' = 'application/json' }
    $params = @{ Uri = $uri; Method = $Method; Headers = $headers; ErrorAction = 'Stop' }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
    try {
        Invoke-RestMethod @params
    }
    catch {
        Write-Warning "Fabric API call failed [$Method $Path]: $($_.Exception.Message)"
        $null
    }
}

function Invoke-GraphApi {
    [CmdletBinding()]
    param([string]$Path)
    $uri = "https://graph.microsoft.com/v1.0$Path"
    $headers = @{ Authorization = "Bearer $(Get-GraphToken)"; 'Content-Type' = 'application/json' }
    try {
        Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction Stop
    }
    catch {
        Write-Warning "Graph API call failed [$Path]: $($_.Exception.Message)"
        $null
    }
}

function Invoke-SqlQuery {
    [CmdletBinding()]
    param(
        [string]$ServerInstance,
        [string]$Database,
        [string]$Query
    )
    $token = Get-SqlToken
    $conn = [System.Data.SqlClient.SqlConnection]::new()
    $conn.ConnectionString = "Server=tcp:$ServerInstance,1433;Database=$Database;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
    $conn.AccessToken = $token
    $dt = [System.Data.DataTable]::new()
    try {
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $Query
        $cmd.CommandTimeout = 120
        $reader = $cmd.ExecuteReader()
        $dt.Load($reader)
    }
    catch {
        Write-Warning "SQL query failed: $($_.Exception.Message)"
    }
    finally {
        if ($conn.State -eq 'Open') { $conn.Close() }
        $conn.Dispose()
    }
    return ,$dt
}

function Save-Result {
    [CmdletBinding()]
    param(
        [string]$Name,
        [object]$Data,
        [ValidateSet('csv', 'json')]
        [string]$Format = 'csv'
    )
    if (-not $Data -or ($Data -is [System.Data.DataTable] -and $Data.Rows.Count -eq 0) -or
        ($Data -is [array] -and $Data.Count -eq 0)) {
        Write-Host "    (no data for $Name)" -ForegroundColor DarkGray
        return
    }
    $path = Join-Path $script:OutputFolder "$Name.$Format"
    switch ($Format) {
        'csv'  { $Data | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8 }
        'json' { $Data | ConvertTo-Json -Depth 10 | Set-Content -Path $path -Encoding UTF8 }
    }
    Write-Host "    Saved  $($Name).$Format" -ForegroundColor DarkGreen
}

#endregion

# ============================================================
#region  INITIALISATION
# ============================================================

Write-Section 'INITIALISATION'
Write-Host ''

# Ensure logged in
$context = Get-AzContext -ErrorAction SilentlyContinue
if (-not $context) {
    Write-Host 'No Azure context found. Launching interactive login...' -ForegroundColor Yellow
    Write-Host '  (If no browser window opens, a device-code prompt will appear below.)' -ForegroundColor Yellow
    try {
        Connect-AzAccount -ErrorAction Stop
    }
    catch {
        Write-Host '  Browser login failed or unavailable. Falling back to device-code flow...' -ForegroundColor Yellow
        Connect-AzAccount -UseDeviceAuthentication -ErrorAction Stop
    }
    $context = Get-AzContext
}
if (-not $context) {
    throw 'Failed to establish an Azure context. Please run Connect-AzAccount manually and re-run this script.'
}
Write-Host "  Logged in as : $($context.Account.Id)" -ForegroundColor Green

# Stash NoPrompt for use inside helper functions
$script:NoPromptFlag = $NoPrompt.IsPresent

# ============================================================
#region  AUTO-DETECT ARTIFACT TYPE
# ============================================================

Write-Host "`n  Auto-detecting artifact type ..." -ForegroundColor DarkGray
$itemInfo = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items/$ArtifactId"
if (-not $itemInfo) {
    throw "Failed to retrieve artifact $ArtifactId from workspace $WorkspaceId. Check the IDs and your permissions."
}

$detectedType = $itemInfo.type  # e.g. 'Warehouse', 'SQLEndpoint', 'Lakehouse'
$artifactDisplayName = $itemInfo.displayName

switch ($detectedType) {
    'Warehouse'   { $auditMode = 'Warehouse' }
    'SQLEndpoint' { $auditMode = 'SQLEndpoint' }
    'Lakehouse'   { $auditMode = 'SQLEndpoint' }  # treat Lakehouse as SQL Endpoint path
    default       { throw "Unsupported artifact type '$detectedType'. This script supports Warehouse and SQL Endpoint (Lakehouse) artifacts." }
}

Write-Host "  Artifact     : $artifactDisplayName"
Write-Host "  Detected     : $detectedType"
Write-Host "  Audit mode   : $auditMode" -ForegroundColor Green

# Set output folder with type prefix if not provided
if (-not $OutputFolder) {
    $OutputFolder = ".\FabricSecurityAudit_${auditMode}_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
}

New-Item -Path $OutputFolder -ItemType Directory -Force | Out-Null
Write-Host "  Output       : $OutputFolder"
Write-Host "  Safeguards   : $(if ($NoSafeguards) { 'DISABLED' } else { "MaxRows=$MaxRows  MaxGroupMembers=$MaxGroupMembers" })  NoPrompt=$($NoPrompt.IsPresent)" -ForegroundColor $(if ($NoSafeguards) { 'Yellow' } else { 'DarkGray' })
if ($SummarizeUsers.Count -gt 0) {
    Write-Host "  Summarize    : $($SummarizeUsers -join ', ')" -ForegroundColor DarkGray
}

# Parent lakehouse tracking (SQL Endpoint mode only)
$parentLakehouseId = $null

$report = [System.Text.StringBuilder]::new()
[void]$report.AppendLine("# Fabric Security Audit Report v$($script:Version)")
[void]$report.AppendLine("**Mode**: $auditMode | **Generated**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC' -AsUTC)")
[void]$report.AppendLine("**Auditor**: $($context.Account.Id)")
[void]$report.AppendLine("")

#endregion

# ============================================================
#region  1. WORKSPACE INFORMATION
# ============================================================

Write-Section '1. Workspace & Capacity'
Write-Host '  Collecting workspace metadata, capacity SKU, region, and sensitivity labels.' -ForegroundColor DarkGray

$workspace = Invoke-FabricApi -Path "/workspaces/$WorkspaceId"
if ($workspace) {
    Write-Host "  Workspace: $($workspace.displayName) ($WorkspaceId)"
    [void]$report.AppendLine("## 1. Workspace & Capacity")
    [void]$report.AppendLine("| Field | Value |")
    [void]$report.AppendLine("|-------|-------|")
    [void]$report.AppendLine("| Display Name | $($workspace.displayName) |")
    [void]$report.AppendLine("| Workspace ID | $WorkspaceId |")
    [void]$report.AppendLine("| Capacity ID  | $($workspace.capacityId) |")
    [void]$report.AppendLine("")
    Save-Result -Name '01_workspace' -Data $workspace -Format json

    # Capacity & SKU details
    if ($workspace.capacityId) {
        $cap = Invoke-FabricApi -Path "/capacities"
        $capDetail = $null
        if ($cap -and $cap.value) {
            $capDetail = $cap.value | Where-Object { $_.id -eq $workspace.capacityId } | Select-Object -First 1
        }
        if ($capDetail) {
            $sku    = $capDetail.sku
            $region = $capDetail.region
            $state  = $capDetail.state
            Write-Host "  Capacity : $($capDetail.displayName) ($sku)" -ForegroundColor White
            Write-Host "  Region   : $region" -ForegroundColor White
            Write-Host "  State    : $state" -ForegroundColor White
            [void]$report.AppendLine("| Capacity     | $($capDetail.displayName) |")
            [void]$report.AppendLine("| SKU          | $sku |")
            [void]$report.AppendLine("| Region       | $region |")
            [void]$report.AppendLine("| Cap. State   | $state |")
            [void]$report.AppendLine("")
            if ($state -ne 'Active') {
                $script:Issues.Add("Capacity is in state '$state' (not Active)")
            }
            Save-Result -Name '01b_capacity' -Data $capDetail -Format json
        }
    }
}

#endregion

    # Sensitivity labels check

if ($workspace.PSObject.Properties['sensitivityLabel'] -and $workspace.sensitivityLabel) {
    $labelId = $workspace.sensitivityLabel.labelId
    Write-Host "  Sensitivity Label: $labelId" -ForegroundColor Yellow
    $script:Issues.Add("Workspace has a sensitivity label applied ($labelId) -- may restrict access")
    [void]$report.AppendLine("### Sensitivity Label")
    [void]$report.AppendLine("Label ID: ``$labelId``")
    [void]$report.AppendLine("")
} else {
    Write-Host "  Sensitivity Label: (none)" -ForegroundColor DarkGray
}

    # Workspace Identity (managed identity configuration)
    $wsIdentity = $null
    try {
        $uri = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/identity"
        $headers = @{ Authorization = "Bearer $(Get-FabricToken)"; 'Content-Type' = 'application/json' }
        $wsIdentity = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction Stop
    } catch {
        # 404 is expected when no managed identity is configured
    }
    if ($wsIdentity) {
        $idType = $wsIdentity.type ?? 'Unknown'
        $appId  = $wsIdentity.applicationId ?? '(none)'
        Write-Host "  Workspace Identity:" -ForegroundColor White
        Write-Host "    Type     : $idType" -ForegroundColor White
        Write-Host "    App ID   : $appId" -ForegroundColor White
        [void]$report.AppendLine("### Workspace Identity")
        [void]$report.AppendLine("| Field | Value |")
        [void]$report.AppendLine("|-------|-------|")
        [void]$report.AppendLine("| Type     | $idType |")
        [void]$report.AppendLine("| App ID   | $appId |")
        [void]$report.AppendLine("")
    } else {
        Write-Host "  Workspace Identity: No managed identity configured for this workspace." -ForegroundColor DarkGray
    }

#endregion

# ============================================================
#region  2. WORKSPACE ROLE ASSIGNMENTS
# ============================================================

Write-Section '2. Workspace Roles'
Write-Host '  Enumerating workspace role assignments (Admin, Member, Contributor, Viewer).' -ForegroundColor DarkGray

$roleAssignments = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/roleAssignments"
$roles = @()
if ($roleAssignments -and $roleAssignments.value) {
    $roles = $roleAssignments.value
    Write-Host "  Found $($roles.Count) role assignment(s)"
    if ($roles.Count -gt $MaxRows) {
        $action = Confirm-LargeResultSet -Section 'Workspace Role Assignments' -RowCount $roles.Count -Limit $MaxRows
        if ($null -eq $action) {
            Write-Host '  Skipping role assignments display per user choice.' -ForegroundColor DarkGray
            $roles = @()
        } elseif (-not $action) {
            Write-Host "  Truncating to first $MaxRows role assignments." -ForegroundColor Yellow
            $roles = $roles | Select-Object -First $MaxRows
        }
    }
    $roles | Format-Table -Property @(
        @{N='Principal';E={$_.principal.displayName}},
        @{N='Type';E={$_.principal.type}},
        @{N='Id';E={$_.principal.id}},
        @{N='Role';E={$_.role}}
    ) -AutoSize | Out-String | Write-Host

    [void]$report.AppendLine("## 2. Workspace Roles")
    [void]$report.AppendLine("| Principal | Type | Object ID | Role |")
    [void]$report.AppendLine("|-----------|------|-----------|------|")
    foreach ($r in $roles) {
        [void]$report.AppendLine("| $($r.principal.displayName) | $($r.principal.type) | $($r.principal.id) | $($r.role) |")
    }
    [void]$report.AppendLine("")
    Save-Result -Name '02_workspace_role_assignments' -Data ($roles | ForEach-Object {
        [PSCustomObject]@{
            PrincipalName = $_.principal.displayName
            PrincipalType = $_.principal.type
            PrincipalId   = $_.principal.id
            Role          = $_.role
        }
    })
} else {
    Write-Warning '  No workspace role assignments returned.'
}

#endregion

# ============================================================
#region  3. ITEM-LEVEL SHARING
# ============================================================

Write-Section '3. Item-Level Sharing'
Write-Host '  Checking for direct artifact-level sharing (bypasses workspace roles).' -ForegroundColor DarkGray

$itemUsers = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items/$ArtifactId/users"
if ($itemUsers -and $itemUsers.value -and $itemUsers.value.Count -gt 0) {
    Write-Host "  $($itemUsers.value.Count) item-level sharing assignment(s)" -ForegroundColor White
    $itemUserData = $itemUsers.value | ForEach-Object {
        $access = ''
        if ($_.PSObject.Properties['itemAccessDetails'] -and $_.itemAccessDetails) {
            $access = ($_.itemAccessDetails | ForEach-Object { $_.type }) -join ', '
        } elseif ($_.PSObject.Properties['itemAccess'] -and $_.itemAccess) {
            $access = ($_.itemAccess) -join ', '
        }
        [PSCustomObject]@{
            DisplayName   = $_.displayName
            EmailAddress  = $_.emailAddress
            PrincipalType = $_.principalType
            ItemAccess    = $access
        }
    }
    $itemUserData | Format-Table -AutoSize | Out-String | Write-Host
    Save-Result -Name '02b_item_sharing' -Data $itemUserData

    [void]$report.AppendLine("## 3. Item-Level Sharing")
    [void]$report.AppendLine("| Display Name | Email | Type | Access |")
    [void]$report.AppendLine("|-------------|-------|------|--------|")
    foreach ($iu in $itemUserData) {
        [void]$report.AppendLine("| $($iu.DisplayName) | $($iu.EmailAddress) | $($iu.PrincipalType) | $($iu.ItemAccess) |")
    }
    [void]$report.AppendLine("")
} else {
    Write-Host "  No item-level sharing found (access via workspace roles only)." -ForegroundColor DarkGray
}

#endregion

# ============================================================
#region  4. ARTIFACT DETAILS & SQL ENDPOINT DISCOVERY
# ============================================================

Write-Section "4. Artifact Details ($auditMode)"
Write-Host '  Resolving artifact properties and SQL endpoint connection.' -ForegroundColor DarkGray

$sqlEndpointServer = $null
$resolvedDbName    = $artifactDisplayName

if ($auditMode -eq 'Warehouse') {
    # --- WAREHOUSE: fetch directly, SQL endpoint is in properties ---
    Write-Host "  Fetching warehouse $ArtifactId ..."
    $artifact = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/warehouses/$ArtifactId"
    if (-not $artifact) { $artifact = $itemInfo }

    $hasProps = $artifact.PSObject.Properties['properties'] -and $artifact.properties
    if ($hasProps -and $artifact.properties.PSObject.Properties['connectionString']) {
        $cs = $artifact.properties.connectionString
        if ($cs -match '([^;]+\.datawarehouse\.fabric\.microsoft\.com)') {
            $sqlEndpointServer = $Matches[1]
        }
    }

    Write-Host "    Display Name : $artifactDisplayName"
    Write-Host "    Type         : Warehouse"
    if ($sqlEndpointServer) {
        Write-Host "    SQL Endpoint : $sqlEndpointServer" -ForegroundColor Green
    }

    Save-Result -Name '03_artifact' -Data $artifact -Format json
}
else {
    # --- SQL ENDPOINT: find parent Lakehouse to get connection string ---
    Write-Host "  SQL Endpoint detected — searching for parent Lakehouse ..."
    $allItems = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items"
    $artifact = $itemInfo

    if ($allItems -and $allItems.value) {
        $parentLH = $allItems.value | Where-Object {
            $_.type -eq 'Lakehouse' -and $_.displayName -eq $artifactDisplayName
        } | Select-Object -First 1

        if ($parentLH) {
            $parentLakehouseId = $parentLH.id
            Write-Host "    Parent Lakehouse : $parentLakehouseId" -ForegroundColor Green
            $lhDetail = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/lakehouses/$parentLakehouseId"
            if ($lhDetail -and $lhDetail.properties) {
                $artifact = $lhDetail
                $hasProps = $true
                if ($lhDetail.properties.PSObject.Properties['sqlEndpointProperties']) {
                    $sepVal = $lhDetail.properties.sqlEndpointProperties
                    if ($sepVal -and $sepVal.connectionString -match '([^;]+\.datawarehouse\.fabric\.microsoft\.com)') {
                        $sqlEndpointServer = $Matches[1]
                    }
                }
            }
        }
        else {
            Write-Warning "    Could not find parent Lakehouse for '$artifactDisplayName'."
        }
    }

    Write-Host "    Display Name    : $artifactDisplayName"
    Write-Host "    SQL Endpoint ID : $ArtifactId"
    if ($parentLakehouseId) {
        Write-Host "    Lakehouse ID    : $parentLakehouseId"
    }
    if ($sqlEndpointServer) {
        Write-Host "    SQL Endpoint    : $sqlEndpointServer" -ForegroundColor Green
    }

    Save-Result -Name '03_artifact' -Data $artifact -Format json
}

# Override SQL endpoint if provided
if ($SqlEndpointOverride) {
    $sqlEndpointServer = $SqlEndpointOverride
    Write-Host "  Using SQL endpoint override: $sqlEndpointServer" -ForegroundColor Yellow
}

# Resolve database name
if ($DatabaseName) { $resolvedDbName = $DatabaseName }
if (-not $resolvedDbName) { $resolvedDbName = $ArtifactId }

Write-Host "  SQL Server  : $($sqlEndpointServer ?? '(not discovered)')"
Write-Host "  Database    : $resolvedDbName"

[void]$report.AppendLine("## 4. Artifact Details")
[void]$report.AppendLine("| Field | Value |")
[void]$report.AppendLine("|-------|-------|")
[void]$report.AppendLine("| Artifact ID   | $ArtifactId |")
[void]$report.AppendLine("| Display Name  | $artifactDisplayName |")
[void]$report.AppendLine("| Type          | $detectedType |")
[void]$report.AppendLine("| Audit Mode    | $auditMode |")
if ($parentLakehouseId) {
    [void]$report.AppendLine("| Parent Lakehouse | $parentLakehouseId |")
}
if ($sqlEndpointServer) {
    [void]$report.AppendLine("| SQL Endpoint  | $sqlEndpointServer |")
}
[void]$report.AppendLine("| Database      | $resolvedDbName |")
[void]$report.AppendLine("")

#endregion

# ============================================================
#region  5. ONELAKE DATA ACCESS ROLES (SQL Endpoint mode only)
# ============================================================

if ($auditMode -eq 'SQLEndpoint') {
    Write-Section '5. OneLake Security'
    Write-Host '  Checking OneLake Data Access Roles on the parent Lakehouse.' -ForegroundColor DarkGray

    # OneLake data access roles only work on Lakehouse items (SQLEndpoint returns 400).
    $onelakeTargets = @()
    if ($parentLakehouseId) {
        $onelakeTargets += $parentLakehouseId
    } else {
        $onelakeTargets += $ArtifactId  # fallback if no parent found
    }

    foreach ($artId in $onelakeTargets) {
        Write-Host "  Checking OneLake Security for artifact $artId ..."

        $dataRoles = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items/$artId/dataAccessRoles"
        if ($dataRoles -and $dataRoles.value) {
        $roleList = $dataRoles.value
        Write-Host "    OneLake Security: ENABLED ($($roleList.Count) role(s))" -ForegroundColor Green

        [void]$report.AppendLine("### OneLake Security — Artifact $artId")
        [void]$report.AppendLine("**Status**: Enabled")
        [void]$report.AppendLine("")

        $allRoleMembers = @()
        foreach ($role in $roleList) {
            $roleName = $role.name

            # Parse decision rules
            $effect = ''
            $permsList = @()
            if ($role.decisionRules) {
                $effect = ($role.decisionRules | ForEach-Object { $_.effect }) -join ', '
                foreach ($rule in $role.decisionRules) {
                    foreach ($p in $rule.permission) {
                        $permsList += "$($p.attributeName): $($p.attributeValueIncludedIn -join ', ')"
                    }
                }
            }

            # Members are inline: members.microsoftEntraMembers and members.fabricItemMembers
            $entraMembers = @()
            $itemMembers  = @()
            if ($role.members) {
                $mObj = $role.members
                if ($mObj.PSObject.Properties['microsoftEntraMembers'] -and $mObj.microsoftEntraMembers) {
                    $entraMembers = @($mObj.microsoftEntraMembers)
                }
                if ($mObj.PSObject.Properties['fabricItemMembers'] -and $mObj.fabricItemMembers) {
                    $itemMembers = @($mObj.fabricItemMembers)
                }
            }

            # Console output — role details
            Write-Host ''
            Write-Host "      Role: $roleName" -ForegroundColor White
            Write-Host "        Effect      : $effect"
            foreach ($perm in $permsList) {
                Write-Host "        Permission  : $perm"
            }
            if ($entraMembers.Count -gt 0) {
                Write-Host "        Entra Members:" -ForegroundColor Green
                foreach ($em in $entraMembers) {
                    $name = $em.displayName ?? $em.objectId
                    $type = $em.type ?? 'unknown'
                    Write-Host "          - $name ($type) [$($em.objectId)]"
                }
            } else {
                Write-Host "        Entra Members: (none)" -ForegroundColor DarkGray
            }
            if ($itemMembers.Count -gt 0) {
                Write-Host "        Item Members:" -ForegroundColor Green
                foreach ($im in $itemMembers) {
                    Write-Host "          - $($im.sourcePath) [Access: $($im.itemAccess -join ', ')]"
                }
            } else {
                Write-Host "        Item Members : (none)" -ForegroundColor DarkGray
            }

            # Report output
            [void]$report.AppendLine("#### Role: $roleName")
            [void]$report.AppendLine("| Property | Value |")
            [void]$report.AppendLine("|----------|-------|")
            [void]$report.AppendLine("| Effect | $effect |")
            foreach ($perm in $permsList) {
                [void]$report.AppendLine("| Permission | $perm |")
            }
            [void]$report.AppendLine("")

            if ($entraMembers.Count -gt 0) {
                [void]$report.AppendLine("**Entra Members:**")
                [void]$report.AppendLine("| Display Name | Type | Object ID |")
                [void]$report.AppendLine("|-------------|------|-----------|")
                foreach ($em in $entraMembers) {
                    [void]$report.AppendLine("| $($em.displayName ?? $em.objectId) | $($em.type ?? 'unknown') | $($em.objectId) |")
                }
                [void]$report.AppendLine("")
            }
            if ($itemMembers.Count -gt 0) {
                [void]$report.AppendLine("**Fabric Item Members:**")
                [void]$report.AppendLine("| Source Path | Access |")
                [void]$report.AppendLine("|------------|--------|")
                foreach ($im in $itemMembers) {
                    [void]$report.AppendLine("| $($im.sourcePath) | $($im.itemAccess -join ', ') |")
                }
                [void]$report.AppendLine("")
            }
            if ($entraMembers.Count -eq 0 -and $itemMembers.Count -eq 0) {
                [void]$report.AppendLine("*No members assigned to this role.*")
                [void]$report.AppendLine("")
            }

            foreach ($em in $entraMembers) {
                $allRoleMembers += [PSCustomObject]@{
                    ArtifactId    = $artId
                    RoleName      = $roleName
                    PrincipalName = $em.displayName ?? $em.objectId
                    PrincipalType = $em.type ?? 'EntraMember'
                    PrincipalId   = $em.objectId
                    MemberKind    = 'Entra'
                }
            }
            foreach ($im in $itemMembers) {
                $allRoleMembers += [PSCustomObject]@{
                    ArtifactId    = $artId
                    RoleName      = $roleName
                    PrincipalName = $im.sourcePath
                    PrincipalType = 'FabricItem'
                    PrincipalId   = $im.sourcePath
                    MemberKind    = "Item [$($im.itemAccess -join ',')]"
                }
            }
        }

        Save-Result -Name "04_onelake_roles_$artId" -Data $allRoleMembers
    }
    else {
        Write-Host "    OneLake Security: NOT ENABLED or no roles found" -ForegroundColor Yellow
        $script:Issues.Add("OneLake Security not enabled on artifact $artId")
        [void]$report.AppendLine("### OneLake Security - Artifact $artId")
        [void]$report.AppendLine("**Status**: Not enabled or no roles defined")
        [void]$report.AppendLine("")
    }
}

}  # end if SQLEndpoint mode
else {
    Write-Section '5. OneLake Security (Skipped)'
    Write-Host '  Not applicable to Warehouse artifacts.' -ForegroundColor DarkGray
    [void]$report.AppendLine("## 5. OneLake Security")
    [void]$report.AppendLine("*Skipped — not applicable to Warehouse artifacts.*")
    [void]$report.AppendLine("")
}

#endregion

# ============================================================
#region  6. USER / PRINCIPAL INVESTIGATION (Graph API)
# ============================================================

Write-Section '6. User & Principal Investigation'
Write-Host '  Resolving user/group identities via Microsoft Graph and cross-referencing.' -ForegroundColor DarkGray

$resolvedPrincipals = @()

foreach ($userRef in $InvestigateUsers) {
    Write-Host "  Resolving: $userRef ..."

    # Determine if it's a GUID (object ID) or UPN
    $isGuid = $userRef -match '^[0-9a-fA-F\-]{36}$'
    $userObj = $null

    if ($isGuid) {
        # Try as user first, then as group
        $userObj = Invoke-GraphApi -Path "/users/$userRef"
        if (-not $userObj) {
            $userObj = Invoke-GraphApi -Path "/groups/$userRef"
        }
    }
    else {
        $userObj = Invoke-GraphApi -Path "/users/$userRef"
    }

    if ($userObj) {
        $odataType = $userObj.PSObject.Properties['@odata.type']
        $hasGroupTypes = $userObj.PSObject.Properties['groupTypes'] -and $userObj.groupTypes
        $principalType = if (($odataType -and $odataType.Value -eq '#microsoft.graph.group') -or $hasGroupTypes) { 'Group' } else { 'User' }
        Write-Host "    $($userObj.displayName) | $principalType | $($userObj.id)"

        $entry = [PSCustomObject]@{
            Input         = $userRef
            DisplayName   = $userObj.displayName
            ObjectId      = $userObj.id
            UPN           = $userObj.userPrincipalName
            Mail          = $userObj.mail
            PrincipalType = $principalType
        }
        $resolvedPrincipals += $entry

        # Check group memberships for users
        if ($principalType -eq 'User') {
            Write-Host "    Fetching group memberships (limit: $MaxGroupMembers) ..."
            $memberOf = Invoke-GraphApi -Path "/users/$($userObj.id)/memberOf?`$top=$MaxGroupMembers"
            if ($memberOf -and $memberOf.value) {
                $groups = $memberOf.value | Where-Object { $_.'@odata.type' -eq '#microsoft.graph.group' }
                Write-Host "      Member of $($groups.Count) group(s)$(if ($memberOf.value.Count -ge $MaxGroupMembers) {' (may be truncated)'})"
                if ($groups.Count -gt $MaxRows) {
                    Write-Host "      Large group membership ($($groups.Count)) — truncating output to $MaxRows" -ForegroundColor Yellow
                    $groups = $groups | Select-Object -First $MaxRows
                }
                $groupData = $groups | ForEach-Object {
                    [PSCustomObject]@{
                        UserId          = $userObj.id
                        UserDisplayName = $userObj.displayName
                        GroupId         = $_.id
                        GroupName       = $_.displayName
                        SecurityEnabled = $_.securityEnabled
                    }
                }
                Save-Result -Name "05_user_groups_$($userObj.id)" -Data $groupData

                # Cross-reference with workspace role assignments
                $workspaceGroupMatches = $roles | Where-Object {
                    $_.principal.id -in $groups.id
                }
                if ($workspaceGroupMatches) {
                    Write-Host "      Workspace access via groups:" -ForegroundColor Green
                    $workspaceGroupMatches | ForEach-Object {
                        Write-Host "        $($_.principal.displayName) -> Role: $($_.role)"
                    }
                }
            }
        }

        # If it's a group, list members (with limit)
        if ($principalType -eq 'Group') {
            Write-Host "    Fetching group members (limit: $MaxGroupMembers) ..."
            $groupMembers = Invoke-GraphApi -Path "/groups/$($userObj.id)/members?`$top=$MaxGroupMembers"
            if ($groupMembers -and $groupMembers.value) {
                $memberCount = $groupMembers.value.Count
                Write-Host "      $memberCount member(s) returned"
                if ($memberCount -ge $MaxGroupMembers) {
                    $action = Confirm-LargeResultSet -Section "Group members for $($userObj.displayName)" -RowCount $memberCount -Limit $MaxGroupMembers
                    if ($null -eq $action) {
                        Write-Host '      Skipping group member export per user choice.' -ForegroundColor DarkGray
                        continue
                    }
                    if (-not $action) {
                        $groupMembers = [PSCustomObject]@{ value = $groupMembers.value | Select-Object -First $MaxGroupMembers }
                        Write-Host "      Truncated to first $MaxGroupMembers members." -ForegroundColor Yellow
                    }
                }
                $gm = $groupMembers.value | ForEach-Object {
                    [PSCustomObject]@{
                        GroupId     = $userObj.id
                        GroupName   = $userObj.displayName
                        MemberId    = $_.id
                        MemberName  = $_.displayName
                        MemberUPN   = $_.userPrincipalName
                        MemberType  = $_.'@odata.type'
                    }
                }
                Save-Result -Name "05_group_members_$($userObj.id)" -Data $gm
            }
        }
    }
    else {
        Write-Warning "    Could not resolve principal: $userRef"
        $resolvedPrincipals += [PSCustomObject]@{
            Input         = $userRef
            DisplayName   = '(NOT FOUND)'
            ObjectId      = ''
            UPN           = ''
            Mail          = ''
            PrincipalType = ''
        }
    }
}

if ($resolvedPrincipals.Count -gt 0) {
    [void]$report.AppendLine("## 6. Investigated Principals")
    [void]$report.AppendLine("| Input | Display Name | Object ID | Type |")
    [void]$report.AppendLine("|-------|-------------|-----------|------|")
    foreach ($p in $resolvedPrincipals) {
        [void]$report.AppendLine("| $($p.Input) | $($p.DisplayName) | $($p.ObjectId) | $($p.PrincipalType) |")
    }
    [void]$report.AppendLine("")
    Save-Result -Name '05_resolved_principals' -Data $resolvedPrincipals
}

#endregion

# ============================================================
#region  7. SQL PERMISSION EVIDENCE
# ============================================================

Write-Section '7. SQL Permission Evidence'
Write-Host '  Querying database roles, permissions, DENYs, RLS/CLS, identity, and principals.' -ForegroundColor DarkGray

if (-not $sqlEndpointServer) {
    Write-Warning '  SQL endpoint not discovered and no override provided. Skipping SQL queries.'
    Write-Warning '  Re-run with -SqlEndpointOverride to provide the endpoint manually.'
    [void]$report.AppendLine("## 7. SQL Permission Evidence")
    [void]$report.AppendLine("**Skipped** — SQL endpoint not available.")
    [void]$report.AppendLine("")
}
else {
    [void]$report.AppendLine("## 7. SQL Permission Evidence")
    [void]$report.AppendLine("SQL Endpoint: ``$sqlEndpointServer``  ")
    [void]$report.AppendLine("Database: ``$resolvedDbName``")
    [void]$report.AppendLine("")

    # --- 6a. Database role members with permissions ---
    Write-Host '  6a. Database role members & permissions ...'
    $query6a = @"
SELECT TOP ($MaxRows)
    rp.name        AS RoleName,
    rp.type_desc   AS RoleType,
    mp.name        AS MemberName,
    mp.type_desc   AS MemberType,
    o.name         AS ObjectName,
    p.permission_name,
    p.state_desc
FROM sys.database_role_members drm
JOIN sys.database_principals rp
    ON drm.role_principal_id = rp.principal_id
JOIN sys.database_principals mp
    ON drm.member_principal_id = mp.principal_id
LEFT JOIN sys.database_permissions p
    ON p.grantee_principal_id = rp.principal_id
LEFT JOIN sys.objects o
    ON p.major_id = o.object_id;
"@
    $result6a = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $query6a
    if ($result6a.Rows.Count -gt 0) {
        Write-Host "    $($result6a.Rows.Count) row(s) returned"
        if ($result6a.Rows.Count -ge $MaxRows) {
            Write-Host "    Result set hit the $MaxRows row limit — results may be truncated." -ForegroundColor Yellow
        }
        Save-Result -Name '06a_role_members_permissions' -Data $result6a
    }

    # --- 6b. Database role memberships ---
    Write-Host '  6b. Database role memberships ...'
    $query6b = @"
SELECT TOP ($MaxRows)
    dp.name        AS RoleName,
    dp.type_desc   AS RoleType,
    mp.name        AS MemberName,
    mp.type_desc   AS MemberType
FROM sys.database_principals dp
JOIN sys.database_role_members drm
    ON dp.principal_id = drm.role_principal_id
JOIN sys.database_principals mp
    ON drm.member_principal_id = mp.principal_id;
"@
    $result6b = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $query6b
    if ($result6b.Rows.Count -gt 0) {
        Write-Host "    $($result6b.Rows.Count) row(s) returned"
        if ($result6b.Rows.Count -ge $MaxRows) {
            Write-Host "    Result set hit the $MaxRows row limit — results may be truncated." -ForegroundColor Yellow
        }
        Save-Result -Name '06b_role_memberships' -Data $result6b
    }

    # --- 6c. DENY and all permission entries ---
    Write-Host '  6c. All database permissions (incl. DENY) ...'
    $query6c = @"
SELECT TOP ($MaxRows)
    dp.state_desc,
    dp.permission_name,
    pr.name        AS principal_name,
    pr.type_desc   AS principal_type,
    COALESCE(
        OBJECT_SCHEMA_NAME(dp.major_id) + '.' + OBJECT_NAME(dp.major_id),
        s.name,
        DB_NAME()
    ) AS securable,
    dp.class_desc
FROM sys.database_permissions AS dp
JOIN sys.database_principals  AS pr
    ON dp.grantee_principal_id = pr.principal_id
LEFT JOIN sys.schemas AS s
    ON dp.class_desc = 'SCHEMA'
   AND dp.major_id = s.schema_id
ORDER BY principal_name, dp.class_desc, securable, dp.permission_name;
"@
    $result6c = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $query6c
    if ($result6c.Rows.Count -gt 0) {
        Write-Host "    $($result6c.Rows.Count) row(s) returned"
        if ($result6c.Rows.Count -ge $MaxRows) {
            $action = Confirm-LargeResultSet -Section '6c All Permissions' -RowCount $result6c.Rows.Count -Limit $MaxRows -IsSql
            if ($null -eq $action) {
                Write-Host '    Skipping 6c per user choice.' -ForegroundColor DarkGray
                $result6c = [System.Data.DataTable]::new()  # empty it
            }
        }
        Save-Result -Name '06c_all_permissions' -Data $result6c

        # Highlight DENYs
        $denies = $result6c | Where-Object { $_.state_desc -eq 'DENY' }
        if ($denies) {
            $denyCount = @($denies).Count
            Write-Host "    *** DENY entries found ($denyCount) ***" -ForegroundColor Red
            $script:Issues.Add("$denyCount DENY permission entries found (see 06c_all_permissions.csv)")
            $denies | Format-Table -AutoSize | Out-String | Write-Host
            [void]$report.AppendLine("### DENY Entries Found")
            [void]$report.AppendLine('```')
            $denies | Format-Table -AutoSize | Out-String | ForEach-Object { [void]$report.AppendLine($_) }
            [void]$report.AppendLine('```')
            [void]$report.AppendLine("")
        }
    }

    # --- 6d. Filter by investigated users ---
    if ($InvestigateUsers.Count -gt 0 -and $resolvedPrincipals.Count -gt 0) {
        Write-Host '  6d. Permissions for investigated users ...'
        $nameFilters = ($resolvedPrincipals | Where-Object { $_.DisplayName -ne '(NOT FOUND)' } |
            ForEach-Object { "mp.name LIKE '%$($_.DisplayName)%'" }) -join ' OR '

        if ($nameFilters) {
            $query6d = @"
SELECT
    rp.name        AS RoleName,
    rp.type_desc   AS RoleType,
    mp.name        AS MemberName,
    mp.type_desc   AS MemberType,
    o.name         AS ObjectName,
    p.permission_name,
    p.state_desc
FROM sys.database_role_members drm
JOIN sys.database_principals rp
    ON drm.role_principal_id = rp.principal_id
JOIN sys.database_principals mp
    ON drm.member_principal_id = mp.principal_id
LEFT JOIN sys.database_permissions p
    ON p.grantee_principal_id = rp.principal_id
LEFT JOIN sys.objects o
    ON p.major_id = o.object_id
WHERE $nameFilters;
"@
            $result6d = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $query6d
            if ($result6d.Rows.Count -gt 0) {
                Write-Host "    $($result6d.Rows.Count) row(s) for investigated users"
                Save-Result -Name '06d_user_specific_permissions' -Data $result6d
            }
        }
    }

    # --- 6e. RLS / CLS detection ---
    Write-Host '  6e. Row-Level Security (RLS) policies ...'
    $queryRLS = @"
SELECT
    sp.name           AS PolicyName,
    sp.is_enabled     AS IsEnabled,
    sp.is_schema_bound AS IsSchemaBound,
    OBJECT_SCHEMA_NAME(sp.object_id) + '.' + OBJECT_NAME(sp.object_id) AS PolicyObject,
    OBJECT_SCHEMA_NAME(pred.target_object_id) AS TargetSchema,
    OBJECT_NAME(pred.target_object_id) AS TargetTable,
    pred.predicate_type_desc AS PredicateType,
    pred.predicate_definition AS PredicateDefinition
FROM sys.security_policies sp
LEFT JOIN sys.security_predicates pred
    ON sp.object_id = pred.object_id;
"@
    $resultRLS = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryRLS
    if ($resultRLS -and $resultRLS.Rows.Count -gt 0) {
        Write-Host "    RLS policies found: $($resultRLS.Rows.Count)" -ForegroundColor Yellow
        Save-Result -Name '06e_rls_policies' -Data $resultRLS
        [void]$report.AppendLine("### Row-Level Security Policies Detected")
        [void]$report.AppendLine("See ``06e_rls_policies.csv`` for details.")
        [void]$report.AppendLine("")
    }
    else {
        Write-Host "    No RLS policies found."
    }

    Write-Host '  6e. Column-Level Security (CLS) — column permissions ...'
    $queryCLS = @"
SELECT TOP ($MaxRows)
    pr.name         AS PrincipalName,
    pr.type_desc    AS PrincipalType,
    dp.state_desc   AS PermissionState,
    dp.permission_name,
    OBJECT_SCHEMA_NAME(dp.major_id) + '.' + OBJECT_NAME(dp.major_id) AS TableName,
    COL_NAME(dp.major_id, dp.minor_id) AS ColumnName
FROM sys.database_permissions dp
JOIN sys.database_principals pr
    ON dp.grantee_principal_id = pr.principal_id
WHERE dp.minor_id > 0
ORDER BY TableName, ColumnName, PrincipalName;
"@
    $resultCLS = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryCLS
    if ($resultCLS -and $resultCLS.Rows.Count -gt 0) {
        Write-Host "    Column-level permissions found: $($resultCLS.Rows.Count)" -ForegroundColor Yellow
        Save-Result -Name '06e_cls_column_permissions' -Data $resultCLS
        [void]$report.AppendLine("### Column-Level Security Detected")
        [void]$report.AppendLine("See ``06e_cls_column_permissions.csv`` for details.")
        [void]$report.AppendLine("")
    }
    else {
        Write-Host "    No column-level permissions found."
    }

    # --- 6f. Identity mode detection ---
    Write-Host '  6f. Identity mode / execution context ...'
    $queryIdentity = @"
SELECT
    SUSER_SNAME()             AS CurrentLoginName,
    USER_NAME()               AS CurrentUserName,
    SUSER_SNAME()             AS OriginalLogin,
    SYSTEM_USER               AS SystemUser,
    SESSION_USER              AS SessionUser;
"@
    $resultIdentity = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryIdentity
    if ($resultIdentity -and $resultIdentity.Rows.Count -gt 0) {
        $row = $resultIdentity.Rows[0]
        Write-Host "    Current Login  : $($row.CurrentLoginName)"
        Write-Host "    Original Login : $($row.OriginalLogin)"
        Write-Host "    System User    : $($row.SystemUser)"
        Write-Host "    Session User   : $($row.SessionUser)"

        $isDelegated = $row.CurrentLoginName -ne $row.OriginalLogin
        $mode = if ($isDelegated) { 'Delegated Identity (impersonation detected)' } else { 'User Identity' }
        Write-Host "    Identity Mode  : $mode" -ForegroundColor $(if ($isDelegated) { 'Yellow' } else { 'Green' })

        [void]$report.AppendLine("### Identity Mode Detection")
        [void]$report.AppendLine("| Field | Value |")
        [void]$report.AppendLine("|-------|-------|")
        [void]$report.AppendLine("| Current Login  | $($row.CurrentLoginName) |")
        [void]$report.AppendLine("| Original Login | $($row.OriginalLogin) |")
        [void]$report.AppendLine("| System User    | $($row.SystemUser) |")
        [void]$report.AppendLine("| Session User   | $($row.SessionUser) |")
        [void]$report.AppendLine("| Detected Mode  | $mode |")
        [void]$report.AppendLine("")

        Save-Result -Name '06f_identity_mode' -Data $resultIdentity
    }

    # --- 6g. All database principals ---
    Write-Host '  6g. All database principals ...'
    $queryPrincipals = @"
SELECT TOP ($MaxRows)
    principal_id,
    name,
    type_desc,
    authentication_type_desc,
    default_schema_name,
    create_date,
    modify_date
FROM sys.database_principals
ORDER BY type_desc, name;
"@
    $resultPrincipals = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryPrincipals
    if ($resultPrincipals -and $resultPrincipals.Rows.Count -gt 0) {
        Write-Host "    $($resultPrincipals.Rows.Count) principal(s) found"
        if ($resultPrincipals.Rows.Count -ge $MaxRows) {
            Write-Host "    Result set hit the $MaxRows row limit — results may be truncated." -ForegroundColor Yellow
        }
        Save-Result -Name '06g_all_principals' -Data $resultPrincipals
    }

    # --- 6h. Recent permission errors ---
    Write-Host '  6h. Recent permission errors ...'
    $queryErrors = @"
SELECT TOP 100
    command,
    status,
    login_name,
    start_time
FROM sys.dm_exec_requests_history
WHERE status = 'failed'
  AND start_time > DATEADD(day, -7, GETUTCDATE())
ORDER BY start_time DESC;
"@
    $resultErrors = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryErrors
    if ($resultErrors -and $resultErrors.Rows.Count -gt 0) {
        Write-Host "    $($resultErrors.Rows.Count) failed request(s) in last 7 days" -ForegroundColor Yellow
        $script:Issues.Add("$($resultErrors.Rows.Count) failed SQL request(s) in last 7 days (see 06h_recent_errors.csv)")
        Save-Result -Name '06h_recent_errors' -Data $resultErrors
    } else {
        Write-Host "    No recent failed requests found (or DMV not available)." -ForegroundColor DarkGray
    }

    # --- 6i. Stale principals check ---
    Write-Host '  6i. Checking for stale SQL principals ...'
    if ($resultPrincipals -and $resultPrincipals.Rows.Count -gt 0) {
        $stalePrincipals = @()
        $externalPrincipals = @($resultPrincipals.Rows | Where-Object {
            $_.type_desc -in @('EXTERNAL_USER', 'EXTERNAL_GROUP')
        })
        if ($externalPrincipals.Count -gt 0) {
            Write-Host "    Verifying $($externalPrincipals.Count) external principal(s) against Entra ID ..."
            foreach ($ep in $externalPrincipals) {
                $epName = $ep.name
                $found = $false
                # Try as user by UPN
                $graphCheck = Invoke-GraphApi -Path "/users/$epName"
                if ($graphCheck -and $graphCheck.id) { $found = $true }
                if (-not $found) {
                    $stalePrincipals += [PSCustomObject]@{
                        Name     = $epName
                        Type     = $ep.type_desc
                        Created  = $ep.create_date
                        Status   = 'STALE - Not found in Entra ID'
                    }
                }
            }
            if ($stalePrincipals.Count -gt 0) {
                Write-Host "    $($stalePrincipals.Count) stale principal(s) detected!" -ForegroundColor Red
                $script:Issues.Add("$($stalePrincipals.Count) stale SQL principal(s) -- AAD objects may no longer exist")
                Save-Result -Name '06i_stale_principals' -Data $stalePrincipals
                [void]$report.AppendLine("### Stale SQL Principals")
                [void]$report.AppendLine("| Name | Type | Created | Status |")
                [void]$report.AppendLine("|------|------|---------|--------|")
                foreach ($sp in $stalePrincipals) {
                    [void]$report.AppendLine("| $($sp.Name) | $($sp.Type) | $($sp.Created) | **$($sp.Status)** |")
                }
                [void]$report.AppendLine("")
            } else {
                Write-Host "    All external SQL principals verified in Entra ID." -ForegroundColor Green
            }
        } else {
            Write-Host "    No external principals to verify." -ForegroundColor DarkGray
        }
    }
}

#endregion

# ============================================================
#region  8. SHORTCUT ENUMERATION
# ============================================================

Write-Section '8. Shortcuts & Tables'
Write-Host '  Enumerating shortcuts, cross-workspace links, and SQL table metadata.' -ForegroundColor DarkGray

if ($auditMode -eq 'SQLEndpoint') {
    # Check shortcuts on both SQL Endpoint and parent Lakehouse
    $shortcutTargets = @($ArtifactId)
    if ($parentLakehouseId -and $parentLakehouseId -ne $ArtifactId) {
        $shortcutTargets += $parentLakehouseId
    }

    foreach ($artId in $shortcutTargets) {
    Write-Host "  Checking shortcuts for artifact $artId ..."

    # Try the shortcuts API (available for lakehouses)
    $shortcuts = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items/$artId/shortcuts"
    if ($shortcuts -and $shortcuts.value) {
        $scCount = $shortcuts.value.Count
        Write-Host "    $scCount shortcut(s) found" -ForegroundColor Yellow
        if ($scCount -gt $MaxRows) {
            $action = Confirm-LargeResultSet -Section "Shortcuts for $artId" -RowCount $scCount -Limit $MaxRows
            if ($null -eq $action) {
                Write-Host '    Skipping shortcuts per user choice.' -ForegroundColor DarkGray
                continue
            }
            if (-not $action) {
                $shortcuts = [PSCustomObject]@{ value = $shortcuts.value | Select-Object -First $MaxRows }
                Write-Host "    Truncated to first $MaxRows shortcuts." -ForegroundColor Yellow
            }
        }
        $scData = $shortcuts.value | ForEach-Object {
            $target = $_.target
            $targetType = $target.type
            # Target details are nested under a type-specific lowercase key (oneLake, adlsGen2, s3, etc.)
            $inner = $null
            $typeKey = $null
            foreach ($prop in $target.PSObject.Properties) {
                if ($prop.Name -ne 'type' -and $prop.Value -is [PSCustomObject]) {
                    $inner = $prop.Value
                    $typeKey = $prop.Name
                    break
                }
            }
            $ws   = if ($inner -and $inner.PSObject.Properties['workspaceId']) { $inner.workspaceId } else { $null }
            $item = if ($inner -and $inner.PSObject.Properties['itemId'])      { $inner.itemId }      else { $null }
            $tp   = if ($inner -and $inner.PSObject.Properties['path'])        { $inner.path }        else { $null }
            $loc  = if ($inner -and $inner.PSObject.Properties['location'])    { $inner.location }    else { $null }
            [PSCustomObject]@{
                ShortcutName    = $_.name
                Path            = $_.path
                TargetType      = "$targetType ($typeKey)"
                TargetWorkspace = $ws
                TargetItem      = $item
                TargetPath      = $tp
                TargetUrl       = $loc
            }
        }
        Save-Result -Name "07_shortcuts_$artId" -Data $scData

        [void]$report.AppendLine("### Shortcuts — Artifact $artId")
        [void]$report.AppendLine("| Name | Path | Target Type | Target Workspace | Target Item |")
        [void]$report.AppendLine("|------|------|-------------|------------------|-------------|")
        foreach ($sc in $scData) {
            [void]$report.AppendLine("| $($sc.ShortcutName) | $($sc.Path) | $($sc.TargetType) | $($sc.TargetWorkspace) | $($sc.TargetItem) |")
        }
        [void]$report.AppendLine("")

        # For cross-workspace shortcuts, check workspace permissions on target
        $crossWs = $scData | Where-Object { $_.TargetWorkspace -and $_.TargetWorkspace -ne $WorkspaceId }
        if ($crossWs) {
            Write-Host "    Cross-workspace shortcuts detected — checking target workspace permissions ..." -ForegroundColor Yellow
            $targetWorkspaces = $crossWs.TargetWorkspace | Select-Object -Unique
            foreach ($twsId in $targetWorkspaces) {
                $twsRoles = Invoke-FabricApi -Path "/workspaces/$twsId/roleAssignments"
                if ($twsRoles -and $twsRoles.value) {
                    Save-Result -Name "07_cross_ws_roles_$twsId" -Data ($twsRoles.value | ForEach-Object {
                        [PSCustomObject]@{
                            WorkspaceId   = $twsId
                            PrincipalName = $_.principal.displayName
                            PrincipalType = $_.principal.type
                            PrincipalId   = $_.principal.id
                            Role          = $_.role
                        }
                    })
                    Write-Host "      Target workspace $twsId : $($twsRoles.value.Count) role assignment(s)"
                }
            }
        }
    }
    else {
        Write-Host "    No shortcuts found or API not available for this artifact type."
    }
}

}  # end if SQLEndpoint mode
else {
    Write-Host '  Shortcuts not applicable to Warehouse artifacts.' -ForegroundColor DarkGray
    [void]$report.AppendLine("## 8. Shortcuts")
    [void]$report.AppendLine("*Skipped — not applicable to Warehouse artifacts.*")
    [void]$report.AppendLine("")
}

# Enumerate tables/views via SQL for both modes
if ($sqlEndpointServer) {
    Write-Host '  Listing tables and views via SQL metadata ...'
    $queryShortcuts = @"
SELECT TOP ($MaxRows)
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_SCHEMA, TABLE_NAME;
"@
    $resultTables = Invoke-SqlQuery -ServerInstance $sqlEndpointServer -Database $resolvedDbName -Query $queryShortcuts
    if ($resultTables -and $resultTables.Rows.Count -gt 0) {
        Write-Host "    $($resultTables.Rows.Count) table(s)/view(s) in SQL endpoint"
        if ($resultTables.Rows.Count -ge $MaxRows) {
            Write-Host "    Result set hit the $MaxRows row limit — results may be truncated." -ForegroundColor Yellow
        }
        Save-Result -Name '07_sql_tables_views' -Data $resultTables
    }
}

#endregion

# ============================================================
#region  9. ACCESS LEVEL CROSS-REFERENCE
# ============================================================

Write-Section '9. Access Cross-Reference'
Write-Host '  Mapping workspace roles to investigated users (direct vs group-based).' -ForegroundColor DarkGray

if ($resolvedPrincipals.Count -gt 0 -and $roles.Count -gt 0) {
    [void]$report.AppendLine("## 9. Access Cross-Reference")
    [void]$report.AppendLine("")

    foreach ($principal in ($resolvedPrincipals | Where-Object { $_.ObjectId })) {
        Write-Host "  Checking access for: $($principal.DisplayName) ($($principal.ObjectId))"

        # Direct workspace role?
        $directRole = $roles | Where-Object { $_.principal.id -eq $principal.ObjectId }

        # Group-based workspace role?
        $groupRoles = @()
        if ($principal.PrincipalType -eq 'User') {
            $memberOf = Invoke-GraphApi -Path "/users/$($principal.ObjectId)/memberOf?`$top=$MaxGroupMembers"
            if ($memberOf -and $memberOf.value) {
                $groupIds = $memberOf.value | Where-Object { $_.'@odata.type' -eq '#microsoft.graph.group' } | Select-Object -ExpandProperty id
                $groupRoles = $roles | Where-Object { $_.principal.id -in $groupIds }
            }
        }

        $isAdmin = ($directRole | Where-Object { $_.role -eq 'Admin' }) -or ($groupRoles | Where-Object { $_.role -eq 'Admin' })
        $hasWorkspaceAccess = ($directRole.Count -gt 0) -or ($groupRoles.Count -gt 0)
        $accessViaGroup = $groupRoles.Count -gt 0
        $accessDirect   = $directRole.Count -gt 0

        [void]$report.AppendLine("### $($principal.DisplayName)")
        [void]$report.AppendLine("| Question | Value |")
        [void]$report.AppendLine("|----------|-------|")
        [void]$report.AppendLine("| Object ID | $($principal.ObjectId) |")
        [void]$report.AppendLine("| Is admin? | $(if ($isAdmin) {'Yes'} else {'No'}) |")
        [void]$report.AppendLine("| Workspace access? | $(if ($hasWorkspaceAccess) {'Yes'} else {'No'}) |")
        if ($directRole) {
            [void]$report.AppendLine("| Direct role(s) | $(($directRole | ForEach-Object { $_.role }) -join ', ') |")
        }
        if ($groupRoles) {
            [void]$report.AppendLine("| Via group role(s) | $(($groupRoles | ForEach-Object { "$($_.principal.displayName) = $($_.role)" }) -join ', ') |")
        }
        [void]$report.AppendLine("| Access via Security Group? | $(if ($accessViaGroup) {'Yes'} else {'No'}) |")
        [void]$report.AppendLine("| Access handled directly?   | $(if ($accessDirect) {'Yes'} else {'No'}) |")
        [void]$report.AppendLine("")

        Write-Host "    Admin: $(if ($isAdmin) {'YES'} else {'No'})  |  Workspace: $(if ($hasWorkspaceAccess) {'YES'} else {'No'})  |  Direct: $(if ($accessDirect) {'YES'} else {'No'})  |  ViaGroup: $(if ($accessViaGroup) {'YES'} else {'No'})"
    }
}

#endregion

# ============================================================
#region  10. PER-USER EFFECTIVE ACCESS SUMMARY
# ============================================================

if ($SummarizeUsers.Count -gt 0) {
    Write-Section '10. Effective Access Summary'
    Write-Host '  Building consolidated per-user access view across all layers.' -ForegroundColor DarkGray
    [void]$report.AppendLine("## 10. Effective Access Summary")
    [void]$report.AppendLine("")

    foreach ($summaryRef in $SummarizeUsers) {
        $p = $resolvedPrincipals | Where-Object { $_.Input -eq $summaryRef -or $_.ObjectId -eq $summaryRef } | Select-Object -First 1
        if (-not $p -or -not $p.ObjectId) {
            Write-Host "  Skipping '$summaryRef' — could not resolve principal." -ForegroundColor Yellow
            continue
        }

        Write-Host "  Building effective access summary for: $($p.DisplayName) ($($p.ObjectId))" -ForegroundColor Cyan
        $summaryRows = [System.Collections.Generic.List[PSCustomObject]]::new()

        # --- Workspace role (direct) ---
        $directRole = $roles | Where-Object { $_.principal.id -eq $p.ObjectId }
        if ($directRole) {
            foreach ($dr in $directRole) {
                $summaryRows.Add([PSCustomObject]@{ Layer='Workspace Role'; Source="Direct"; Detail=$dr.role; Status='Assigned' })
            }
        } else {
            $summaryRows.Add([PSCustomObject]@{ Layer='Workspace Role'; Source='Direct'; Detail='(none)'; Status='NOT ASSIGNED' })
        }

        # --- Workspace role (via groups) ---
        $userGroupIds = @()
        if ($p.PrincipalType -eq 'User') {
            $moResp = Invoke-GraphApi -Path "/users/$($p.ObjectId)/memberOf?`$top=$MaxGroupMembers"
            if ($moResp -and $moResp.value) {
                $userGroupIds = $moResp.value | Where-Object { $_.'@odata.type' -eq '#microsoft.graph.group' } | Select-Object -ExpandProperty id
                $grpRoles = $roles | Where-Object { $_.principal.id -in $userGroupIds }
                foreach ($gr in $grpRoles) {
                    $summaryRows.Add([PSCustomObject]@{ Layer='Workspace Role'; Source="Via group: $($gr.principal.displayName)"; Detail=$gr.role; Status='Assigned' })
                }
                if (-not $grpRoles) {
                    $summaryRows.Add([PSCustomObject]@{ Layer='Workspace Role'; Source='Via groups'; Detail='(none)'; Status='NOT ASSIGNED' })
                }
            }
        }

        # --- OneLake Security (SQL Endpoint mode) ---
        if ($auditMode -eq 'SQLEndpoint') {
            $olTargets = @()
            if ($parentLakehouseId) { $olTargets += $parentLakehouseId }
            else { $olTargets += $ArtifactId }
            foreach ($olId in $olTargets) {
                $olLabel = if ($parentLakehouseId) { 'Parent Lakehouse' } else { 'Artifact' }
                $olRoles = Invoke-FabricApi -Path "/workspaces/$WorkspaceId/items/$olId/dataAccessRoles"
                if ($olRoles -and $olRoles.value) {
                    $foundInOL = $false
                    foreach ($olRole in $olRoles.value) {
                        # Members are inline in the role object
                        $entraMembers = @()
                        if ($olRole.members -and $olRole.members.microsoftEntraMembers) {
                            $entraMembers = $olRole.members.microsoftEntraMembers
                        }
                        foreach ($em in $entraMembers) {
                            if ($em.objectId -eq $p.ObjectId -or $em.objectId -in $userGroupIds) {
                                $via = if ($em.objectId -eq $p.ObjectId) { 'Direct' } else { "Via group: $($em.displayName ?? $em.objectId)" }
                                $summaryRows.Add([PSCustomObject]@{ Layer="OneLake Security ($olLabel)"; Source=$via; Detail=$olRole.name; Status='Assigned' })
                                $foundInOL = $true
                            }
                        }
                    }
                    if (-not $foundInOL) {
                        $summaryRows.Add([PSCustomObject]@{ Layer="OneLake Security ($olLabel)"; Source='(not found)'; Detail='(none)'; Status='MISSING' })
                    }
                } else {
                    $summaryRows.Add([PSCustomObject]@{ Layer="OneLake Security ($olLabel)"; Source='N/A'; Detail='Not enabled'; Status='DISABLED' })
                }
            }
        }

        # --- SQL principal exists? ---
        if ($sqlEndpointServer -and $resultPrincipals -and $resultPrincipals.Rows.Count -gt 0) {
            $sqlMatch = $resultPrincipals.Rows | Where-Object { $_.name -like "*$($p.DisplayName)*" -or $_.name -like "*$($p.UPN)*" }
            if ($sqlMatch) {
                foreach ($sm in $sqlMatch) {
                    $summaryRows.Add([PSCustomObject]@{ Layer='SQL Principal'; Source=$sm.name; Detail=$sm.type_desc; Status='EXISTS' })
                }
            } else {
                $summaryRows.Add([PSCustomObject]@{ Layer='SQL Principal'; Source='(not found)'; Detail='No matching principal'; Status='MISSING' })
            }
        }

        # --- SQL role memberships ---
        if ($sqlEndpointServer -and $result6b -and $result6b.Rows.Count -gt 0) {
            $sqlRoleMatch = $result6b.Rows | Where-Object { $_.MemberName -like "*$($p.DisplayName)*" -or $_.MemberName -like "*$($p.UPN)*" }
            foreach ($sr in $sqlRoleMatch) {
                $summaryRows.Add([PSCustomObject]@{ Layer='SQL Role Membership'; Source=$sr.MemberName; Detail=$sr.RoleName; Status='Member' })
            }
        }

        # --- SQL DENY entries ---
        if ($sqlEndpointServer -and $result6c -and $result6c.Rows.Count -gt 0) {
            $userDenies = $result6c.Rows | Where-Object {
                $_.state_desc -eq 'DENY' -and ($_.principal_name -like "*$($p.DisplayName)*" -or $_.principal_name -like "*$($p.UPN)*")
            }
            foreach ($d in $userDenies) {
                $summaryRows.Add([PSCustomObject]@{ Layer='SQL DENY'; Source=$d.principal_name; Detail="$($d.permission_name) on $($d.securable)"; Status='BLOCKED' })
            }
        }

        # --- Cross-workspace shortcut access (SQL Endpoint mode) ---
        if ($auditMode -eq 'SQLEndpoint') {
            $crossWsFiles = Get-ChildItem -Path $OutputFolder -Filter '07_cross_ws_roles_*.csv' -ErrorAction SilentlyContinue
            foreach ($cwf in $crossWsFiles) {
                $cwData = Import-Csv $cwf.FullName
                $cwsId = $cwf.BaseName -replace '07_cross_ws_roles_',''
                $hasAccess = $cwData | Where-Object { $_.PrincipalId -eq $p.ObjectId -or $_.PrincipalId -in $userGroupIds }
                if ($hasAccess) {
                    foreach ($ca in $hasAccess) {
                        $summaryRows.Add([PSCustomObject]@{ Layer="Cross-WS Shortcut ($cwsId)"; Source=$ca.PrincipalName; Detail=$ca.Role; Status='Assigned' })
                    }
                } else {
                    $summaryRows.Add([PSCustomObject]@{ Layer="Cross-WS Shortcut ($cwsId)"; Source='(not found)'; Detail='(no role)'; Status='MISSING' })
                }
            }
        }

        # --- Output summary ---
        Write-Host ""
        $summaryRows | Format-Table Layer, Source, Detail, Status -AutoSize | Out-String | Write-Host

        [void]$report.AppendLine("### Effective Access: $($p.DisplayName)")
        [void]$report.AppendLine("Object ID: ``$($p.ObjectId)``")
        [void]$report.AppendLine("")
        [void]$report.AppendLine("| Access Layer | Source | Detail | Status |")
        [void]$report.AppendLine("|-------------|--------|--------|--------|")
        foreach ($row in $summaryRows) {
            $statusColor = switch ($row.Status) {
                'MISSING'      { '**MISSING**' }
                'BLOCKED'      { '**BLOCKED**' }
                'NOT ASSIGNED' { '**NOT ASSIGNED**' }
                'DISABLED'     { '*DISABLED*' }
                default        { $row.Status }
            }
            [void]$report.AppendLine("| $($row.Layer) | $($row.Source) | $($row.Detail) | $statusColor |")
        }
        [void]$report.AppendLine("")

        Save-Result -Name "08-5_effective_access_$($p.ObjectId)" -Data $summaryRows
    }
}

#endregion

# ============================================================
#region  11. VERIFICATION CHECKLIST
# ============================================================

Write-Section '11. Verification Checklist'
Write-Host '  Appending actionable checklist to the report.' -ForegroundColor DarkGray

[void]$report.AppendLine("## 11. Verification Checklist -- $auditMode")
[void]$report.AppendLine("")
[void]$report.AppendLine("Use the data collected above to walk through these checks:")
[void]$report.AppendLine("")
[void]$report.AppendLine("- [ ] **Step 1** — Identity mode verified (User Identity vs Delegated). See section 6f.")
[void]$report.AppendLine("- [ ] **Step 2** — Principal Object IDs match across Workspace roles and SQL principals. Cross-reference sections 2, 5, and 6g.")
if ($auditMode -eq 'SQLEndpoint') {
    [void]$report.AppendLine("- [ ] **Step 3** — OneLake Security role assignments verified (section 4).")
    [void]$report.AppendLine("- [ ] **Step 4** — Same AAD principal exists in Workspace permissions AND OneLake Security (source + target Lakehouse).")
}
[void]$report.AppendLine("- [ ] **Step 5** — Individual vs group vs mixed assignments identified (section 8).")
[void]$report.AppendLine("- [ ] **Step 6** — No unrelated or conflicting role memberships (section 6a, 6c — check for DENY).")
[void]$report.AppendLine("- [ ] **Step 7** — RLS/CLS setup confirmed (section 6e).")
if ($auditMode -eq 'SQLEndpoint') {
    [void]$report.AppendLine("- [ ] **Step 8** — External shortcut permissions verified (section 7 — cross-workspace roles).")
    [void]$report.AppendLine("- [ ] **Step 9** — Remediation: assign group-based OneLake Security roles, remove individual/mixed, drop & recreate shortcuts after role fixes.")
    [void]$report.AppendLine("- [ ] **Step 10** — Final SQL Endpoint validation — query shortcut tables, confirm no AccessDenied / NoRoleDefined.")
}
else {
    [void]$report.AppendLine("- [ ] **Step 8** — Remediation: fix DENY entries, correct role memberships, verify schema/object permissions.")
    [void]$report.AppendLine("- [ ] **Step 9** — Final Warehouse validation — run test queries, confirm no permission errors.")
}
[void]$report.AppendLine("")

Write-Host '  Checklist appended to report.'

#endregion

# ============================================================
#region  12. WRITE REPORT
# ============================================================

Write-Section '12. Report & Results'
Write-Host '  Writing report, packaging output, and generating verdict.' -ForegroundColor DarkGray

# Record final section timing
if ($script:LastSectionStart -and $script:LastSectionName) {
    $dur = ((Get-Date) - $script:LastSectionStart).TotalSeconds
    $script:SectionTimings.Add([PSCustomObject]@{ Section = $script:LastSectionName; Duration = [math]::Round($dur, 1) })
}

# Section timings in report
$totalDur = ((Get-Date) - $script:AuditStart).TotalSeconds
[void]$report.AppendLine("## Section Timings")
[void]$report.AppendLine("| Section | Duration (s) |")
[void]$report.AppendLine("|---------|-------------|")
foreach ($st in $script:SectionTimings) {
    [void]$report.AppendLine("| $($st.Section) | $($st.Duration)s |")
}
[void]$report.AppendLine("| **Total** | **$([math]::Round($totalDur, 1))s** |")
[void]$report.AppendLine("")

# Audit verdict in report
$issueCount = $script:Issues.Count
[void]$report.AppendLine("## Audit Verdict")
if ($issueCount -eq 0) {
    [void]$report.AppendLine("**STATUS: CLEAN** -- No issues detected.")
} else {
    [void]$report.AppendLine("**STATUS: ISSUES FOUND ($issueCount)**")
    [void]$report.AppendLine("")
    foreach ($issue in $script:Issues) {
        [void]$report.AppendLine("- $issue")
    }
}
[void]$report.AppendLine("")

$reportPath = Join-Path $OutputFolder 'SecurityAuditReport.md'
$report.ToString() | Set-Content -Path $reportPath -Encoding UTF8

$elapsed = ((Get-Date) - $script:AuditStart).ToString('mm\:ss')
$fileCount = (Get-ChildItem -Path $OutputFolder -File).Count

# Helper to write a padded box line
function Write-BoxLine ([string]$Text, [string]$Color = 'White', [int]$Width = 59) {
    $pad = $Width - $Text.Length
    if ($pad -lt 0) { $pad = 0; $Text = $Text.Substring(0, $Width) }
    Write-Host '   |' -NoNewline -ForegroundColor DarkCyan
    Write-Host $Text -NoNewline -ForegroundColor $Color
    Write-Host (' ' * $pad) -NoNewline
    Write-Host '|' -ForegroundColor DarkCyan
}

$boxTop = '   +' + ('-' * 59) + '+'

Write-Host ''
Write-Host $boxTop -ForegroundColor DarkCyan
Write-BoxLine '' -Color DarkCyan
Write-BoxLine "    FABRIC SECURITY AUDIT COMPLETE              v$($script:Version)" -Color Green
Write-BoxLine '' -Color DarkCyan
Write-BoxLine "    Mode        : $auditMode"
Write-BoxLine "    Artifact    : $artifactDisplayName"
Write-BoxLine "    Workspace   : $($workspace.displayName)"
Write-BoxLine "    Duration    : $elapsed"
Write-BoxLine "    Files       : $fileCount file(s) generated"
Write-BoxLine '' -Color DarkCyan
Write-Host $boxTop -ForegroundColor DarkCyan
Write-Host ''
Write-Host '    Output : ' -NoNewline -ForegroundColor Gray; Write-Host $OutputFolder -ForegroundColor White
Write-Host '    Report : ' -NoNewline -ForegroundColor Gray; Write-Host 'SecurityAuditReport.md' -ForegroundColor White
Write-Host ''
Get-ChildItem -Path $OutputFolder -File | ForEach-Object {
    $icon = switch ($_.Extension) { '.md' { '[R]' } '.json' { '[J]' } default { '[C]' } }
    $color = switch ($_.Extension) { '.md' { 'Green' } '.json' { 'Yellow' } default { 'Gray' } }
    Write-Host "      $icon " -NoNewline -ForegroundColor $color; Write-Host $_.Name -ForegroundColor DarkGray
}
Write-Host ''
Write-Host '    --> ' -NoNewline -ForegroundColor Yellow; Write-Host 'Review SecurityAuditReport.md for findings.'
Write-Host '    --> ' -NoNewline -ForegroundColor Yellow; Write-Host 'Walk through the verification checklist (section 9).'
Write-Host '    --> ' -NoNewline -ForegroundColor Yellow; Write-Host 'Attach the zip file to the support case.'
Write-Host ''

# Summary verdict
if ($issueCount -eq 0) {
    Write-Host '    STATUS: ' -NoNewline -ForegroundColor Gray
    Write-Host 'CLEAN' -NoNewline -ForegroundColor Green
    Write-Host ' -- no issues detected' -ForegroundColor DarkGray
} else {
    Write-Host '    STATUS: ' -NoNewline -ForegroundColor Gray
    Write-Host "ISSUES FOUND ($issueCount)" -ForegroundColor Red
    foreach ($issue in $script:Issues) {
        Write-Host "      ! $issue" -ForegroundColor Yellow
    }
}
Write-Host ''

# ── Zip output ──
if (-not $NoZip) {
    $zipPath = "$OutputFolder.zip"
    try {
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path "$OutputFolder\*" -DestinationPath $zipPath -Force
        Write-Host "    Package    : " -NoNewline -ForegroundColor Gray
        Write-Host $zipPath -ForegroundColor Green
        Write-Host "    Size       : " -NoNewline -ForegroundColor Gray
        $zipSize = (Get-Item $zipPath).Length
        $sizeStr = if ($zipSize -gt 1MB) { '{0:N1} MB' -f ($zipSize / 1MB) } elseif ($zipSize -gt 1KB) { '{0:N0} KB' -f ($zipSize / 1KB) } else { "$zipSize bytes" }
        Write-Host $sizeStr -ForegroundColor White
    }
    catch {
        Write-Warning "Failed to create zip: $($_.Exception.Message)"
    }
    Write-Host ''
}

# ── Diff mode ──
if ($DiffWith -and (Test-Path $DiffWith)) {
    Write-Host '  >> DIFF MODE' -ForegroundColor Magenta
    Write-Host "    Comparing with: $DiffWith" -ForegroundColor Gray
    Write-Host ''

    $diffResults = @()
    $currentFiles = Get-ChildItem -Path $OutputFolder -Filter '*.csv'
    foreach ($cf in $currentFiles) {
        $oldFile = Join-Path $DiffWith $cf.Name
        if (Test-Path $oldFile) {
            $oldData = Import-Csv $oldFile
            $newData = Import-Csv $cf.FullName
            $oldHash = ($oldData | ConvertTo-Json -Compress -Depth 3)
            $newHash = ($newData | ConvertTo-Json -Compress -Depth 3)
            $status = if ($oldHash -eq $newHash) { 'UNCHANGED' } else { 'CHANGED' }
            $diffResults += [PSCustomObject]@{
                File    = $cf.Name
                Status  = $status
                OldRows = $oldData.Count
                NewRows = $newData.Count
                Delta   = $newData.Count - $oldData.Count
            }
            if ($status -eq 'CHANGED') {
                Write-Host "    CHANGED  $($cf.Name)  ($($oldData.Count) -> $($newData.Count) rows)" -ForegroundColor Yellow
            }
        } else {
            $newRows = (Import-Csv $cf.FullName).Count
            $diffResults += [PSCustomObject]@{ File = $cf.Name; Status = 'NEW'; OldRows = 0; NewRows = $newRows; Delta = "+$newRows" }
            Write-Host "    NEW      $($cf.Name)" -ForegroundColor Green
        }
    }

    $unchanged = @($diffResults | Where-Object { $_.Status -eq 'UNCHANGED' }).Count
    $changed   = @($diffResults | Where-Object { $_.Status -eq 'CHANGED' }).Count
    $newFiles  = @($diffResults | Where-Object { $_.Status -eq 'NEW' }).Count
    Write-Host ''
    Write-Host "    Summary: $unchanged unchanged, $changed changed, $newFiles new" -ForegroundColor White
    Write-Host ''

    Save-Result -Name '99_diff_summary' -Data $diffResults
}
elseif ($DiffWith) {
    Write-Warning "  Diff path not found: $DiffWith"
}

#endregion
