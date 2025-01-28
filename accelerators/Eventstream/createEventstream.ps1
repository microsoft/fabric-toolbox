<#
.Description
    Deploy Eventstream with definition in Microsoft Fabric
    This script uses 2 files - EventstreamDefinition.json and EventstreamCreate.json
    EventstreamDefinition.json - This file contains complete details about source, destination in Json format
    EventstreamCreate.json - This file contains high level Eventstream details like name, definition and base64 converted string of above json definition
    You can use sites like https://www.base64encode.org/ to convert a json into base63 encoded string
.LINK
    https://learn.microsoft.com/en-us/fabric/real-time-intelligence/event-streams/eventstream-rest-api#create-eventstream-item-with-definition
.EXAMPLE
    .\createEventstream.ps1 -workspaceId 'xxxxx-yyyy-yyyy-aaaa-aaaaaaaaaaaa' -tenantId 'xxxxxx-yyyy-aaaa-bbbb-aaaaaaaaa' -eventstreamCreateFileName 'EventstreamCreate.json'
#>

######################################################################################################################################
## Eventstream Accelerator
## Author : Surya Teja Josyula 
## Created: 2024-11-26
## Modified:  , Modified By:

## Make sure Az Modules are installed on your system by running 'Install-Module Az'
## The execution will ask for selecting subscription even though we are running for Fabric which only required tenantId.
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
        #Filename of Eventstream json which contains definition in base64 string and is placed in same folder as this script
        [Parameter(Mandatory=$true)]
        $eventstreamCreateFileName    = ""
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

## STEP 4 Get request body from existing file 

function Get-ScriptDirectory {
        if ($psise) {
            Split-Path $psise.CurrentFile.FullPath
        }
        else {
            $PSScriptRoot
        }
    }
    $DBScriptPath=Get-ScriptDirectory
    $DBScriptloc = (Join-Path $DBScriptPath $eventstreamCreateFileName)

    try {
    $DBScript=Get-content -Path $DBScriptloc
    }
    catch {
            $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $ErrResp = $streamReader.ReadToEnd() | ConvertFrom-Json
            $streamReader.Close()
            #Exit
        }
    $body = $DBScript 
    $eventstreamName = ($body | ConvertFrom-Json).displayName

    Write-Host "Starting to deploy Eventstream with the name '$eventstreamName' in '$workspaceName' workspace" -ForegroundColor Green

## STEP 4 Eventstream API
    $evenstreamAPI = "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/items" 

## Optional - You can get definition of an existing Eventstream using below API GET call
    ##$getEvenstreamAPI = "https://api.fabric.microsoft.com/v1/workspaces/$workspaceId/eventstreams/<eventstream id>/getDefinition" 
    ## $GetEventstreamDeinition= Invoke-RestMethod -Headers $headerParams -Method POST -Uri $getEvenstreamAPI
    ## $GetEventstreamDeinition | ConvertTo-Json

## STEP 5 Create Eventstream
    try
    {
 
    $eventstreamCreate = Invoke-RestMethod -Headers $headerParams -Method POST -Uri $evenstreamAPI -Body ($body) -ContentType "application/json"
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
    else {Write-Host "Evenstream '$eventstreamName' is created in workspace '$workspaceName'" -ForegroundColor Green}

