<#>
=============================
Script Workspace Permissions
=============================

=========================================================================================================================================================================
    This script is intended to script out existing Fabric permissions that have been granted on an individual workspace.  
    This script does not include Tenant permissions or SQL permissions.  
    This script outputs a PowerShell script that can be run against another workspace to replicate the same permissions or can be run against the same workspace to reimplement permissions that might have been changed.

**** This script is provided as-is with no guarantees that it will meet your particular scenario.  Use at your own risk.  Copy and modify it for your particular use case.****
#=========================================================================================================================================================================
</#>

#=======================================================
#Update 3 variables for your environment in this section
#=======================================================
# Define the workspace details
$SourceWorkspaceId = "*MyWorkspaceGUID*"

#Bearer Token can be retrieved from "Try It" button here: https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/add-workspace-role-assignment?tabs=HTTP&tryIt=true#code-try-0 
$BearerToken = "Bearer thisissomelongstringofrandomcharactersfromtheurlabove..."

#Output Script Location
$OutputFile = "c:\outputfilelocation\mySourceWorkspacePermissionsReplayScript.ps1"

#==============================================================================================================


#=================================================
#Get WorkspaceAccessDetails for source workspace
#=================================================
#Define Header
$headers =@{
    "Authorization" = "$BearerToken"
    "Content-Type" = "application/json"
}

# Construct the REST API endpoint
$apiUrl = "https://api.fabric.microsoft.com/v1/admin/workspaces/$SourceWorkspaceId/users"

#Get WorkspaceAccessDetails for source workspace
$WSUsers = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers



#============================
# Build Recreate Script
#============================
$VariableDeclaratons = "
# Define the workspace details
#Update variables: `"myWorkspaceID`" and `"Token`"

`$myWorkspaceID = `"NEW_WorkspaceID`"
#Bearer Token can be retrieved from `"Try It`" button here: https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/add-workspace-role-assignment?tabs=HTTP&tryIt=true#code-try-0 
`$Token = `"BearerToken`"

`$AddRoleAssigntmentUrl = `"https://api.fabric.microsoft.com/v1/workspaces/`" + `$myWorkspaceID + `"/roleAssignments`"

`$headers =@{
    `"Authorization`" = `"`$Token`"
    `"Content-Type`" = `"application/json`"
}
"

#For Each user, construct a new body for Replay API Call
$RecreationCommand = $WSUsers.accessDetails | ForEach-Object { 
"
`$body=`'
{
principal: {
    id: `""+ $_.principal.id +"`", type:`""+ $_.principal.type +"`"},
    role: `""+$_.workspaceAccessDetails.workspaceRole+"`"
}`'

Invoke-RestMethod -Uri `$AddRoleAssigntmentUrl -Method POST -Headers `$headers -Body `$body;
"
}

#=================================================
#Output Replay Script to New File
#=================================================
#Output Variable Declarations
$VariableDeclaratons | Out-File -FilePath "$OutputFile"

#Output body and API calls
$RecreationCommand | Out-File -Append -FilePath "$OutputFile"







