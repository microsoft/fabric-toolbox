<#
.SYNOPSIS
    Decodes a Base64-encoded string into its original text representation.

.DESCRIPTION
    The Convert-FromBase64 function takes a Base64-encoded string as input, decodes it into a byte array, 
    and converts it back into a UTF-8 encoded string. It is useful for reversing Base64 encoding applied 
    to text or other data.

.PARAMETER Base64String
    The Base64-encoded string that you want to decode.

.EXAMPLE
    Convert-FromBase64 -Base64String "SGVsbG8sIFdvcmxkIQ=="

    Output:
    Hello, World!

.EXAMPLE
    $encodedString = "U29tZSBlbmNvZGVkIHRleHQ="
    Convert-FromBase64 -Base64String $encodedString

    Output:
    Some encoded text

.NOTES
    - This function assumes the Base64 input is a valid UTF-8 encoded string.
    - Any decoding errors will throw a descriptive error message.

.AUTHOR
Tiago Balabuch
#>
function Convert-FromBase64 {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Base64String
    )

    try {
        # Step 1: Convert the Base64 string to a byte array
        $bytes = [Convert]::FromBase64String($Base64String)

        # Step 2: Convert the byte array back to a UTF-8 string
        $decodedString = [System.Text.Encoding]::UTF8.GetString($bytes)

        # Step 3: Return the decoded string
        return $decodedString
    }
    catch {
        # Step 4: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while decoding from Base64: $errorDetails" -Level Error
        throw "An error occurred while decoding from Base64: $_"
    }
}