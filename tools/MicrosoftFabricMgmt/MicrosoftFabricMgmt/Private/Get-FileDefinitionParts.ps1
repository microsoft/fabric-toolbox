<#
.SYNOPSIS
    Retrieves all files from a specified directory recursively, encodes their contents to Base64, and returns a structured object containing relative paths and encoded payloads.

.DESCRIPTION
    This function scans a given source directory recursively, encodes each file's content into Base64 format, and constructs an array of objects. Each object includes the relative file path, the encoded payload, and a payload type indicator. The resulting structured object is suitable for JSON serialization or further processing.

.PARAMETER sourceDirectory
    The path to the directory containing files to process. This parameter is mandatory and cannot be null or empty.

.OUTPUTS
    Hashtable containing a single key 'parts', which holds an array of objects. Each object includes:
        - path: Relative path of the file.
        - payload: Base64 encoded content of the file.
        - payloadType: Indicates the type of payload, set as "InlineBase64".

.EXAMPLE
    Get-FileDefinitionParts -sourceDirectory "C:\MyFiles"

    Retrieves all files from "C:\MyFiles", encodes their contents to Base64, and returns the structured result.

.NOTES
    Requires the Convert-ToBase64 and Write-Message helper functions to be available in the session.
#>
function Get-FileDefinitionParts {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$sourceDirectory
    )

    try {
        # Validate if the provided directory exists
        if (-Not (Test-Path $sourceDirectory)) {
            Write-Message -Message "The specified source directory does not exist: $sourceDirectory" -Level Error 
            throw
        }

        Write-Message -Message "Get all files from the directory recursively" -Level Debug
        # Retrieve all files recursively from the source directory
        $fileList = Get-ChildItem -Path $sourceDirectory -File -Recurse

        # Initialize a generic list for better performance when adding multiple items
        $partsList = [System.Collections.Generic.List[object]]::new()

        Write-Message -Message "Loop through the files to create parts dynamically" -Level Debug
        foreach ($file in $fileList) {
            # Calculate the relative path efficiently and normalize path separators
            $relativePath = $file.FullName.Substring($sourceDirectory.Length + 1).Replace('\', '/')
            Write-Message -Message "File found: $relativePath" -Level Debug

            Write-Message -Message "Starting encode to base64" -Level Debug
            # Encode file content to Base64 using the helper function
            $base64Content = Convert-ToBase64 -filePath $file.FullName

            Write-Message -Message "Adding part to json object" -Level Debug
            # Add the file details to the parts list
            $partsList.Add(@{
                path        = $relativePath
                payload     = $base64Content
                payloadType = "InlineBase64"
            })
        }

        Write-Message -Message "Loop through the files finished" -Level Debug
        # Return the structured result as a hashtable with an array of parts
        return @{ parts = $partsList.ToArray() }
    }
    catch {
        # Capture and log detailed error information
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while getting file definition parts: $errorDetails" -Level Error
        throw "An error occurred while encoding to Base64: $_"
    }
}