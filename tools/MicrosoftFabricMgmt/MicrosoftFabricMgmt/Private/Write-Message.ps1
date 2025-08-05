<#
.SYNOPSIS
Logs messages with different severity levels to the console and optionally to a file.

.DESCRIPTION
The `Write-Message` function provides a unified way to log messages with levels such as Info, Error, Alert, Verbose, and Debug.
It supports logging to the console with color-coded messages and optionally writing logs to a file with timestamps.

.PARAMETER Message
The message to log. Supports pipeline input.

.PARAMETER Level
Specifies the log level. Supported values are Info, Error, Alert, Verbose, and Debug.

.PARAMETER LogFile
(Optional) Specifies a file path to write the log messages to. If not provided, messages are only written to the console.

.EXAMPLE
Write-Message -Message "This is an info message." -Level Info

Logs an informational message to the console.

.EXAMPLE
Write-Message -Message "Logging to file." -Level Info -LogFile "C:\Logs\MyLog.txt"

Logs an informational message to the console and writes it to a file.

.EXAMPLE
"Pipeline message" | Write-Message -Level Alert

Logs a message from the pipeline with an Alert level.

.NOTES
Author: Tiago Balabuch
#>

function Write-Message {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Message,

        [Parameter()]
        [ValidateSet("Message", "Info", "Error", "Warning", "Critical", "Verbose", "Debug", IgnoreCase = $true)]
        [string]$Level = "Info",

        [Parameter()]
        [string]$LogFile
    )
    process {
        try {
            # Format timestamp
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

            # Construct log message
            $logMessage = "[$timestamp] [$Level] $Message"

            # Write log message to console with colors
            switch ($Level) {
                "Message" { Write-Host $logMessage -ForegroundColor White }
                "Info" { Write-Host $logMessage -ForegroundColor Green }
                "Error" { Write-Error $logMessage }
                "Warning" { Write-Warning $logMessage } 
                "Critical" { Write-Host $logMessage -ForegroundColor Red }
                "Verbose" { Write-Verbose $logMessage }
                "Debug" { Write-Debug $logMessage }

            }

            # Optionally write log message to a file
            if ($LogFile) {
                try {
                    Add-Content -Path $LogFile -Value $logMessage -Encoding UTF8
                }
                catch {
                    # Catch and log any errors when writing to file
                    Write-Host "[ERROR] Failed to write to log file '$LogFile': $_" -ForegroundColor Red
                }
            }
        }
        catch {
            Write-Host "[ERROR] An unexpected error occurred: $_" -ForegroundColor Red
        }
    }
}
