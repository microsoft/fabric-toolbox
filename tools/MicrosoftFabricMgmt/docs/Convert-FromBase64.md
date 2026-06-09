# Convert-FromBase64

## Overview

The `Convert-FromBase64` function decodes a Base64-encoded string into its original text representation. It is commonly used to reverse Base64 encoding applied to text or other data.

## Features

- Decodes Base64 strings into UTF-8 text.
- Provides descriptive error handling and logging for decoding issues.

## Parameters

### Base64String

- **Description:** The Base64-encoded string to decode.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Decode a Base64 string

```powershell
Convert-FromBase64 -Base64String "SGVsbG8sIFdvcmxkIQ=="

# Output:
# Hello, World!
```

### Example 2: Decode a Base64 string stored in a variable

```powershell
$encodedString = "U29tZSBlbmNvZGVkIHRleHQ="
Convert-FromBase64 -Base64String $encodedString

# Output:
# Some encoded text
```

## Prerequisites

- Assumes the Base64 input is a valid UTF-8 encoded string.
- Requires `Write-Message` for descriptive logging during error handling.

## Key Workflow

1. Converts the Base64 string to a byte array using `[Convert]::FromBase64String`.
2. Converts the byte array to a UTF-8 encoded string.
3. Returns the decoded string or throws an error if decoding fails.

## Error Handling

- Logs descriptive error messages if the decoding process fails.
- Throws exceptions for invalid input or decoding errors.

## Author

**Tiago Balabuch**
