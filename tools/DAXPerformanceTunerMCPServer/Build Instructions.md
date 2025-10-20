# Build Instructions

## For End Users

Run the setup script - it automatically builds everything:

```powershell
.\setup.bat
```

The setup will:
- Check for .NET 8.0 SDK (required for building)
- Build DaxExecutor.exe from C# source code
- Install Python dependencies
- Configure VS Code MCP settings

## For Developers

### Quick Distribution Build

If you've only changed Python code or documentation:

```powershell
.\create-distribution.ps1
```

This creates a distribution ZIP. The executable will be built automatically during first setup.

### Full Rebuild After C# Changes

When you modify C# code in `src/dax_executor/`:

```powershell
cd src\dax_executor
dotnet clean
dotnet build -c Release
cd ..\..
```

Test the executable:
```powershell
.\src\dax_executor\bin\Release\net8.0-windows\win-x64\DaxExecutor.exe --help
```

Then create distribution:
```powershell
.\create-distribution.ps1
```

## Distribution Output

Creates `DAXPerformanceTunerMCPServer_YYYYMMDD.zip` in the current directory.

## Build Artifacts

Build artifacts are excluded from source control:
- `bin/` - Created during build, contains compiled executables and DLLs
- `obj/` - Created during build, contains intermediate files
- `dotnet/` - **Included in source** (Microsoft ADOMD.NET libraries)

Users building from source must have .NET 8.0 SDK installed. The setup script handles this automatically.