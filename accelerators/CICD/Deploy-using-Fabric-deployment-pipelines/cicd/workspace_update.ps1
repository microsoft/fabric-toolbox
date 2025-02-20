param(
    [string]$token,
    [string]$workspace_id
)


$fabric_deployment_git_api_base = "https://api.fabric.microsoft.com/v1/workspaces/"+"$workspace_id/git"
$fabric_long_operation_check = "https://api.fabric.microsoft.com/v1/operations/"


$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

############Get workspace status from the git branch attached to it#####################

try {
    $result = Invoke-RestMethod  -Uri "$fabric_deployment_git_api_base/status" -Method Get -Headers $headers -ContentType "application/json"

    #############Parse the result###########################################
    $workspaceHead = $result.workspaceHead
    $remoteCommitHash = $result.remoteCommitHash

    $body = @{
        "remoteCommitHash" = $remoteCommitHash
        "workspaceHead" = $workspaceHead
        "conflictResolution"= @{
            "conflictResolutionType"= "Workspace"
            "conflictResolutionPolicy"= "PreferRemote"
          }
        "options" = @{
            "allowOverrideItems" = "true"
        }
    } | ConvertTo-Json


    $responseWorkspaceUpdate = Invoke-WebRequest -Uri "$fabric_deployment_git_api_base/updateFromGit" -Method Post -Body $body -Headers $headers -ContentType "application/json"

    $operationId = $responseWorkspaceUpdate.Headers['x-ms-operation-id']
    $retryAfter = $responseWorkspaceUpdate.Headers['Retry-After']
    
    Write-Host "Long running operation Id: '$operationId' has been scheduled for updating the workspace from Git with a retry-after time of '$retryAfter' seconds." -ForegroundColor Green

    do
    {
        $operationState = Invoke-RestMethod -Headers $headers -Uri "$fabric_long_operation_check/$operationId" -Method GET -ContentType "application/json"
        Write-Host "Operation status: $($operationState.Status)"
        if ($operationState.Status -in @("NotStarted", "Running")) {
            Write-Host "Still running or not started, percentage complete: $($operationState.percentComplete)"
            Start-Sleep -Seconds $($retryAfter)
        }
    } while($operationState.Status -in @("NotStarted", "Running"))
    if ($operationState.Status -eq "Failed") {
        Write-Host "Failed to update the workspace from Git. Error reponse: $($operationState.Error | ConvertTo-Json)" -ForegroundColor Red
    }
    else{
        Write-Host "The workspace has been successfully updated from Git." -ForegroundColor Green
    }
    
} catch {
    Write-Output "Failed to update DEV workspace: $_"
    exit 1
}