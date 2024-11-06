<#
.Description
    Deploy Eventhouse, KQL Database, Tables, Functions, and Materialized View in Microsoft Fabric
.LINK
    https://blog.fabric.microsoft.com/en-us/blog/using-apis-with-fabric-real-time-analytics/
.EXAMPLE
    .\createEventhouse.ps1 -workspaceId 'xxxxx-yyyy-yyyy-aaaa-aaaaaaaaaaaa' -eventhouseName 'Eventhouse_001' -kqlDBName 'KQLDB_001' -dbScriptName 'CreateDB_script.csl' -tenantId 'xxxxxx-yyyy-aaaa-bbbb-aaaaaaaaa'
#>

######################################################################################################################################
## Eventhouse Accelerator
## Author : Surya Teja Josyula 
## Created: 2024-06-26
## Modified:  , Modified By:

## Make sure Az Modules are installed on your system by running 'Install-Module Az'
## The execution will ask for selectin subscription even though we are running for Fabric which only required tenantId.
## You can set default subscription by running 'Update-AzConfig -DefaultSubscriptionForLogin "Kusto_PM_Experiments"'
######################################################################################################################################

## User Parameters
param (  
        #Tenant Id
        [Parameter(Mandatory=$true)]
        $tenantId     = "",
        #Workspace Id
        [Parameter(Mandatory=$true)]
        $workspaceId     = "",
        #Eventhouse Name
        [Parameter(Mandatory=$true)]
        $eventhouseName     = "",
        #KQL DB Name
        [Parameter(Mandatory=$false)]
        $kqlDBName     = "",
        #File name containing entities creation script
        [Parameter(Mandatory=$false)]
        $dbScriptName     = ""
)

## STEP 1 Connect to Fabric
    # Setup parameters
    $baseFabricUrl = "https://api.fabric.microsoft.com"

    # Login into Fabric
    Connect-AzAccount -TenantId $tenantId | Out-Null
    
    # Get authentication
    $fabricToken = (Get-AzAccessToken -ResourceUrl $baseFabricUrl).Token

## STEP 2 Create headers for API calls
    # Setup headers for API call
    $headerParams = @{'Authorization'="Bearer {0}" -f $fabricToken}
    $contentType = @{'Content-Type' = "application/json"}

## STEP 3 Get Workspace Details
    $workspaceUri = "{0}/v1/workspaces/{1}" -f $baseFabricUrl, $workspaceId
    $workspaceDetails = Invoke-RestMethod -Headers $headerParams -ContentType $contentType -Method GET -Uri $workspaceUri
    $workspaceName = $workspaceDetails.displayName

## STEP 4 Create Eventhouse
    $body = @{       
            'displayName' = $eventhouseName
            } | ConvertTo-Json -Depth 1

    $eventhouseAPI = "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/eventhouses" 

    # Check if Eventhouse with same name already exists
    $eventhouseCheck=Invoke-RestMethod -Headers $headerParams -Method GET -Uri $eventhouseAPI -ContentType "application/json" 
    if(($eventhouseCheck.value.displayName).Contains($eventhouseName)) {Write-Host "Eventhouse with name $eventhouseName already exists. Please use different name" -ForegroundColor Red EXIT}

    # Else continue creation
    try {
    $eventhouseCreate = Invoke-RestMethod -Headers $headerParams -Method POST -Uri $eventhouseAPI -Body ($body) -ContentType "application/json"
     }
      catch {
            $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
            $streamReader.Close()
            Exit
        }
   if ($ErrResp.message)
   {
    $ErrResp.message
    EXIT
    }
    else {Write-Host "Eventhouse '$eventhouseName' is created in workspace '$workspaceName'" -ForegroundColor Green}
    $eventhouseId= ($eventhouseCreate.id).ToString()

## STEP 5 Create KQL Database
    if ($null -eq $kqlDBName)   { $kqlDBName= $eventhouseName  }
    else {
    $body = @{       
            'displayName' = $kqlDBName;
            'creationPayload'= @{
            'databaseType' = "ReadWrite";
            'parentEventhouseItemId' = $eventhouseId}
             } | ConvertTo-Json -Depth 2
        

    $kqlDBAPI = "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/kqlDatabases"

    # Check if KQL Database with same name already exists
       # try{
       # Invoke-RestMethod -Headers $headerParams -Method GET -Uri $kqlDBAPI -ContentType "application/json" -verbose
       # }
       #  catch {
       #         $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
       #         $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
       #         $streamReader.Close()
       #         Exit
       #     }
       # $ErrResp.message
       # if(($kqlDBCheck.value.displayName).Contains($kqlDBName)) {Write-Host "KQL Database with name $kqlDBName already exists. Please use different name"  -ForegroundColor Red EXIT}

    #Else continue creation
    try {
     Invoke-RestMethod -Headers $headerParams -Method POST -Uri $kqlDBAPI -Body ($body) -ContentType "application/json"
     }
      catch {
            $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
            $streamReader.Close()
            Exit
        }
    if ($null -eq $ErrResp.message)
   {
    Write-Host "KQL Database '$kqlDBName' is created in Eventhouse '$eventhouseName' in workspace '$workspaceName'" -ForegroundColor Green  
    }
    else {$ErrResp.message}
	}
## STEP 6 Get Query Uri for the above Eventhouse
    $eventhouseDetailsAPI = "$eventhouseAPI/$eventhouseId"
    $eventhouseDetails = Invoke-RestMethod -Headers $headerParams -ContentType $contentType -Method GET -Uri $eventhouseDetailsAPI
    $queryUri = $eventhouseDetails.properties.queryServiceUri

## STEP 7 Read database script from a file
if($dbScriptName)
{    
function Get-ScriptDirectory {
        if ($psise) {
            Split-Path $psise.CurrentFile.FullPath
        }
        else {
            $PSScriptRoot
        }
    }
    $DBScriptPath=Get-ScriptDirectory
    $DBScriptloc = (Join-Path $DBScriptPath $dbScriptName)

    try {
    $DBScript=Get-content -Path $DBScriptloc
    }
    catch {
            $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
            $streamReader.Close()
            Exit
        }
    if ($null -ne $ErrResp.message)
    {
    $ErrResp.message
    }
    else
    {
## STEP 8 Execute database script to create all entities in the Eventhouse

	Write-Host "Waiting for 1 min before running database scripts"
    Start-Sleep -Seconds 60 
    $kustoUrl = "https://api.kusto.windows.net"

    # Get authentication
    $kustoToken = (Get-AzAccessToken -ResourceUrl $kustoUrl).Token

    # Setup headers for API call
    $headerParams = @{'Authorization'="Bearer {0}" -f $kustoToken}

    $queryAPI = "$queryUri/v1/rest/mgmt"
    $DBScript=$DBScript | Out-String
    #$DBScript.GetType()
    $body = @{
              'csl' = $DBScript;
              'db'= $kqlDBName
              } | ConvertTo-Json -Depth 1
    #$body
    try {
     Invoke-RestMethod -Headers $headerParams -Method POST -Uri $queryAPI -Body ($body) -ContentType "application/json; charset=utf-8"
     }
      catch {
            $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
            $streamReader.Close()
            Exit
        }
    $ErrResp.message
    if ($null -ne $ErrResp.message)
    {
    $ErrResp.message
    }
    else {  Write-Host "'$dbScriptName' is executed in '$eventhouseName' Eventhouse " -ForegroundColor Green}
    }
  }
else {Write-Host "Database script was not provided. No entities were created in the Database $kqlDBName"  -ForegroundColor Green}
