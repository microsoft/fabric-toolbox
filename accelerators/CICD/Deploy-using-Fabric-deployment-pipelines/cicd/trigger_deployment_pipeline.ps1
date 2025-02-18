param(
    [string]$token,
    [string]$deployment_pipeline,
    [string]$source_workspace,
    [string]$target_workspace
)



$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}


$source_stage_workspace_id = ""
$target_stage_workspace_id = ""

try {

    $fabric_deployment_pipeline_api = "https://api.fabric.microsoft.com/v1/deploymentPipelines/" +"$deployment_pipeline"
    $fabric_long_operation_check = "https://api.fabric.microsoft.com/v1/operations/"

    $pipeline_stages = Invoke-RestMethod  -Uri "$fabric_deployment_pipeline_api/stages" -Method get -Headers $headers -ContentType "application/json"

    foreach ($item in $pipeline_stages.value) {
        if ($item.workspaceid -eq $source_workspace) {    
            $source_stage_workspace_id = $item.id
            Write-Output "source workspace: $source_stage_workspace_id"
        }
        if ($item.workspaceid -eq $target_workspace) {    
            $target_stage_workspace_id = $item.id
            Write-Output "target workspace: $target_stage_workspace_id"
        }
    }

    if (-not $source_stage_workspace_id -or -not $target_stage_workspace_id) {
        Write-Error "One or both workspace IDs could not be found. Deployment aborted."
        exit 1
    }




    ############Deploy to target stage#####################

    Write-Output "Deploying to Target workspace"
    $body = @{
        "sourceStageId" = $source_stage_workspace_id
        "targetStageId" = $target_stage_workspace_id
    } | ConvertTo-Json

    Write-Output $body

    Write-Output "$fabric_deployment_pipeline_api/deploy"


    $responseDeploymentPipeline = Invoke-WebRequest  -Uri "$fabric_deployment_pipeline_api/deploy" -Method Post -Body $body -Headers $headers -ContentType "application/json"

    Write-Output "Deploying to Target workspace"

    $operationId = $responseDeploymentPipeline.Headers['x-ms-operation-id']
    $retryAfter = $responseDeploymentPipeline.Headers['Retry-After']
    
    Write-Host "Long running operation Id: '$operationId' has been scheduled for deploying changes from a source to a target workspace with a retry-after time of '$retryAfter' seconds." -ForegroundColor Green

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
        Write-Host "Failed to deploy changes. Error reponse: $($operationState.Error | ConvertTo-Json)" -ForegroundColor Red
    }
    else{
        Write-Host "The changes from the source workspace have been successfully deployed." -ForegroundColor Green
    }
} 
catch {
    Write-Output "Failed to trigger job: $_"
    exit 1
}