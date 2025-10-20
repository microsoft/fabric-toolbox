# Build Instructions

## Quick Distribution Build

If you've only changed Python code, configuration files, or documentation:

```powershell
.\create-distribution.ps1
```

This will create a new distribution ZIP with all current files.

## Full Rebuild (when C# code changes)

When you modify the C# DAX executor, you need to rebuild the executable and update security checksums:

### 1. Build the C# executable
```powershell
cd src\dax_executor
dotnet clean
dotnet build -c Release
```

Verify the build succeeded and test the executable:
```powershell
.\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe --help
```

### 2. Update security checksums
Navigate back to the root directory and calculate new hashes:
```powershell
cd ..\..
$exeHash = (Get-FileHash src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe).Hash
$dllHash = (Get-FileHash src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.dll).Hash
Write-Host "EXE Hash: $exeHash"
Write-Host "DLL Hash: $dllHash"
```

Edit `CHECKSUMS.txt` and replace the SHA256 hash values in both the declaration section and the expected output section.

### 3. Create distribution
```powershell
.\create-distribution.ps1
```

## Output

The distribution ZIP will be created in the current directory as `DAXPerformanceTunerMCPServer_YYYYMMDD.zip` (approximately 8.4 MB).

## Notes

- All Microsoft DLLs are digitally signed and don't require checksum updates
- Only the user-compiled `DaxExecutor.exe` and `DaxExecutor.dll` need checksum verification
- The distribution script automatically excludes XML documentation and PDB debug files