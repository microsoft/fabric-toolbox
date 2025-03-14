<#
.SYNOPSIS
    Encodes the content of a file into a Base64-encoded string.

.DESCRIPTION
    The Convert-ToBase64  function takes a file path as input, reads the file's content as a byte array, 
    and converts it into a Base64-encoded string. This is useful for embedding binary data (e.g., images, 
    documents) in text-based formats such as JSON or XML.

.PARAMETER filePath
    The full path to the file whose contents you want to encode into Base64.

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

.AUTHOR
Tiago Balabuch
#>
function Convert-ToBase64 {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$filePath
    )
    try {
        
        # Step 1: Reading all the bytes from the file
        #$bytes = [System.Text.Encoding]::UTF8.GetBytes($InputString)
        Write-Message -Message "Reading all the bytes from the file specified: $filePath" -Level Debug
        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)

        # Step 2: Convert the byte array to Base64 string
        Write-Message -Message "Convert the byte array to Base64 string" -Level Debug
        $base64String = [Convert]::ToBase64String($fileBytes)

        # Step 3: Return the encoded string
        Write-Message -Message "Return the encoded string for the file: $filePath" -Level Debug
        return $base64String
    }
    catch {
        # Step 4: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while encoding to Base64: $errorDetails" -Level Error
        throw "An error occurred while encoding to Base64: $_"
    }
}