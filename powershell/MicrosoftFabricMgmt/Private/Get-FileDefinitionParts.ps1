function Get-FileDefinitionParts {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$sourceDirectory
    )
    try {
        if (-Not (Test-Path $sourceDirectory)) {
            Write-Message -Message "The specified source directory does not exist: $sourceDirectory" -Level Error 
            throw
        }

        # Get all files from the directory recursively
        Write-Message -Message "Get all files from the directory recursively" -Level Debug
        $fileList = Get-ChildItem -Path $sourceDirectory -File -Recurse

        # Initialize the output JSON object
        $jsonObject = @{ parts = @() }

        # Loop through the files to create parts dynamically
        Write-Message -Message "Loop through the files to create parts dynamically" -Level Debug
        foreach ($file in $fileList) {
            
            $relativePath = $file.FullName.Substring($sourceDirectory.Length + 1) -replace "\\", "/"
            Write-Message -Message "File found: $relativePath" -Level Debug
            Write-Message -Message "Starting encode to base64" -Level Debug
            
            $base64Content = Convert-ToBase64 -filePath $file.FullName
            Write-Message -Message "Adding part to json object" -Level Debug
            
            $jsonObject.parts += @{ 
                path        = $relativePath
                payload     = $base64Content
                payloadType = "InlineBase64"
            }
        }
        Write-Message -Message "Loop through the files finished" -Level Debug
        
        return $jsonObject
        Write-Message -Message "Parts returned" -Level Debug
    }
    
    catch {
        # Step 4: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while getting file definition parts: $errorDetails" -Level Error
        throw "An error occurred while encoding to Base64: $_"
    }
}


# Example usage
#$sourceDirectory = "C:\temp\API\Notebook"
#Get-FileParts -sourceDirectory $sourceDirectory
#$fileParts = Get-FileParts -sourceDirectory $sourceDirectory
#$fileParts | ConvertTo-Json -Depth 10
