# Convert-ToBase64

## Overview

The `Convert-ToBase64` function encodes the content of a file into a Base64-encoded string. This is particularly useful for embedding binary data (e.g., images, documents) in text-based formats such as JSON or XML.

## Features

- Encodes file content into Base64 strings.
- Provides descriptive error handling and logging for encoding issues.

## Parameters

### filePath

- **Description:** The full path to the file whose contents you want to encode into Base64.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Encode a file into a Base64 string

```powershell
Convert-ToBase64 -filePath "C:\Path\To\File.txt"

# Output:
# VGhpcyBpcyBhbiBlbmNvZGVkIGZpbGUu
```

### Example 2: Save encoded content to a file

```powershell
$encodedContent = Convert-ToBase64 -filePath "C:\Path\To\Image.jpg"
$encodedContent | Set-Content -Path "C:\Path\To\EncodedImage.txt"

# This saves the Base64-encoded content of the image to a text file.
```

## Prerequisites

- Ensure the file exists at the specified path before running this function.
- Large files may cause memory constraints due to full loading into memory.

## Key Workflow

1. Reads the content of the specified file as a byte array using `[System.IO.File]::ReadAllBytes`.
2. Converts the byte array to a Base64 string using `[Convert]::ToBase64String`.
3. Returns the encoded string or throws an error if the process fails.

## Error Handling

- Logs descriptive error messages if the encoding process fails.
- Throws exceptions for invalid input or file access issues.

## Author

**Tiago Balabuch**
