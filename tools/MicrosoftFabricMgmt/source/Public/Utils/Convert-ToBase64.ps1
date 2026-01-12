<#
.SYNOPSIS
    Encodes the content of a file into a Base64-encoded string.

.DESCRIPTION
    The Convert-ToBase64  function takes a file path as input, reads the file's content as a byte array,
    and converts it into a Base64-encoded string. This is useful for embedding binary data (e.g., images,
    documents) in text-based formats such as JSON or XML.

.PARAMETER filePath
    Mandatory. Full path to the file whose contents will be read as bytes and encoded into a Base64 string. The path must exist and refer to a file; directories or missing paths will cause the command to fail.

.EXAMPLE
     Convert-ToBase64  -filePath "C:\Path\To\File.txt"

    Output:
    VGhpcyBpcyBhbiBlbmNvZGVkIGZpbGUu

.EXAMPLE
     $encodedContent = Convert-ToBase64  -filePath "C:\Path\To\Image.jpg"
     $encodedContent | Set-Content -Path "C:\Path\To\EncodedImage.txt"

    This saves the Base64-encoded content of the image to a text file.

.NOTES
    - Ensure the file exists at the specified path before running this function.
    - Large files may cause memory constraints due to full loading into memory.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Convert-ToBase64 {
    [CmdletBinding()]
    [OutputType([string])]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$filePath
    )
    try {
        # Validate file existence
        if (-not (Test-Path -Path $filePath -PathType Leaf)) {
            throw "File not found at path: $filePath"
        }

        # Warn if file size exceeds threshold (e.g., 50MB)
        $fileInfo = Get-Item -Path $filePath
        if ($fileInfo.Length -gt 50MB) {
            Write-FabricLog -Message "Warning: File size exceeds 50MB. This may cause memory issues." -Level Warning
        }

        # Reading all the bytes from the file
        Write-FabricLog -Message "Reading all the bytes from the file specified: $filePath" -Level Debug
        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)

        # Convert the byte array to Base64 string
        Write-FabricLog -Message "Convert the byte array to Base64 string" -Level Debug
        $base64String = [Convert]::ToBase64String($fileBytes)

        # Return the encoded string
        Write-FabricLog -Message "Return the encoded string for the file: $filePath" -Level Debug
        return $base64String
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while encoding to Base64: $errorDetails" -Level Error
        throw "An error occurred while encoding to Base64: $_"
    }
}
