<#>
==========================================
Recreate Fabric Environment and Artifacts
==========================================

=========================================================================================================================================================================
    This script:
        1.) Creates a new workspace
        2.) Assigns a named capacity to the new workspace
        3.) Attaches the new workspace to the same Azure DevOps repository as the old workspace
        4.) Syncronizes the new workspace with the DevOps repo at the same branch and checkpoint as the old workspace
        5.) Creates a new lakehouse to host shortcuts to DW files
        6.) Creates shortcuts to DW files given a workspace and DW name
    
    Next step (not included in this script yet): manually run "IngestDataIntoDeployedWarehouse.sql" to re-ingest data from OneLake into the new workspace/DW
    
**** This script is provided as-is with no guarantees that it will meet your particular scenario.  Use at your own risk.  Copy and modify it for your particular use case.****
#=========================================================================================================================================================================
</#>


#=======================================================
#Update 6 variables for your environment in this section
#=======================================================
#Bearer Token can be retrieved from "Try It" button here: https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/add-workspace-role-assignment?tabs=HTTP&tryIt=true#code-try-0 
$BearerToken = "Bearer thisissomelongstringofrandomcharactersfromtheurlabove..."

#New Capacity Name
$CapacityName = "MyNewCapacityName"

#New Workspace Name
$NewWorkspaceName = "WorkspaceNameToBeCreated"

#New LH Name
$NewLHName = "NewLakehouseName"

#Old Workspace Name
$OldWS = 'OldWorkspaceName'

#DW Name to be recovered (This must match as DevOps will sync and recreate the DW with the same name.)IngestDataIntoDeployedWarehouse.sql
$DWName = "DWNameToBeRecovered"


#==============================================================================================================
# Powershell connectivity needed for OneLake
#==============================================================================================================
Import-Module Az.Storage
Connect-AzAccount


#==============================================================================================================
#Set Reusable variables
#==============================================================================================================
$headers =@{
    "Authorization" = "$BearerToken"
    "Content-Type" = "application/json"
}

#==============================================================================================================
# Get Old WS and DW ID's
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces"
$AllWorkspaces = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers
$OldWSobject = $AllWorkspaces.value | Select-Object -Property "id","displayName" | Where-Object{$_.displayName -eq "$OldWS"}
$OldWSID = $OldWSobject.id.ToString()

$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$OldWSID/items"
$OldWSItems = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers
$OldDWobject = $OldWSItems.value | Select-Object -Property "id","displayName","type" | Where-Object{$_.displayName -eq "$DWName" -and $_.type -eq "Warehouse"}
$OldDWID = $OldDWobject.id.ToString()

#==============================================================================================================
# Get Capacity ID By Name
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/capacities"

$CapacityList = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers
$Capacity=$CapacityList.value | Select-Object -Property "id","displayName" | Where-Object{$_.displayName -eq "$CapacityName"}
$CapacityID=$Capacity.id.ToString()

#==============================================================================================================
# Create Workspace
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces"

<#
$Body = '
{
  "displayName": "'+$NewWorkspaceName+'",
  "capacityId": "'+$CapacityID+'"
}
'#>

$Body = '
{
  "displayName": "'+$NewWorkspaceName+'",
}
'

$WorkspaceResponse=Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body
$WorkspaceID=$WorkspaceResponse.id

#==============================================================================================================
# Assign Capacity to Workspace
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/assignToCapacity"
$Body = '
{
  "capacityId": "'+$CapacityID+'"
}
'
Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body



#==============================================================================================================
# Get Old Workspace GIT Connection Info
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$OldWSID/git/connection"
$GitConnectionInfo = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers

$RemoteCommitHash=$GitConnectionInfo.gitSyncDetails.head

$GitProviderDetails = $GitConnectionInfo
$GitProviderDetails.PSObject.Properties.Remove("gitSyncDetails")
$GitProviderDetails.PSObject.Properties.Remove("gitConnectionState")

#==============================================================================================================
# Set New Workspace GIT Connection Info
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/git/connect"

$Body=$GitProviderDetails | ConvertTo-Json

$Response = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body

#==============================================================================================================
# Initialize New Workspace GIT Connection 
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/git/initializeConnection"
$Body = '{"initializationStrategy": "PreferRemote"}'

$Response = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body


#==============================================================================================================
# Update New Workspace From Git using last update hash from old WS
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/git/updateFromGit"

$Body = '
{
  "workspaceHead": "",
  "remoteCommitHash": "'+$RemoteCommitHash+'",
  "conflictResolution": {
    "conflictResolutionType": "Workspace",
    "conflictResolutionPolicy": "PreferRemote"
  },
  "options": {
    "allowOverrideItems": true
  }
}
'

$Response = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body


#==============================================================================================================
# Create Lakehouse
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/items"
$Body = '
{
  "displayName": "'+$NewLHName+'",
  "type": "Lakehouse"
}
'
$LHResponse=Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body
$LHID=$LHResponse.id

#==============================================================================================================
#Create LH shortcuts to old DW 
#==============================================================================================================
$apiUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceID/items/$LHID/shortcuts"

#Connect to OneLake and Loop through schemas and tables to create shortcuts
$ctx = New-AzStorageContext -StorageAccountName 'onelake' -UseConnectedAccount -endpoint 'fabric.microsoft.com'
$OldTablesPath= $DWName+".datawarehouse/Tables"
# Get Schemas
$schemas=Get-AzDataLakeGen2ChildItem -Context $ctx -FileSystem $OldWS -Path $OldTablesPath 
$schemas | ForEach-Object {
    #Get Tables per schema
    $schema=Split-Path -Path $_.Path -Leaf 
    
    $tables=Get-AzDataLakeGen2ChildItem -Context $ctx -FileSystem $OldWS -Path $_.Path
    $tables | ForEach-Object {
        $table=Split-Path -Path $_.Path -Leaf
        #Write-Output $schema`.$table     
       #----------------------------------
        #Create shortcut for each table       
       #----------------------------------        
        $itemPath = "Tables/"
        $targetpath="Tables/"+$schema+"/"+$table
        $target= '{
            "oneLake": {
              "workspaceId": "'+$OldWSID+'",
              "itemId": "'+$OldDWID+'",
              "path": "'+$targetPath+'"
            }
          }'


        $Body = '
        {
          "name": "'+$schema+'__'+$table+'",
          "path": "'+$itemPath+'",
          "target": '+$target+'
        }        
        '
        #Write-Output $Body

        $ShortcutResponse=Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $Body
        #Write-Output $ShortcutResponse
    }

}
