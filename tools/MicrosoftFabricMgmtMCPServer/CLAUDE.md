# CLAUDE.md — MicrosoftFabricMgmt MCP Server Development Guide

## Overview

This directory contains a Python-based **Model Context Protocol (MCP) server** that wraps the
[MicrosoftFabricMgmt PowerShell module](../MicrosoftFabricMgmt/) and exposes its capabilities
to AI assistants (Claude, GitHub Copilot, etc.).

**DO NOT edit the PowerShell module source here.** All PowerShell module development belongs in
`../MicrosoftFabricMgmt/source/` and must follow the module's own
[CLAUDE.md](../MicrosoftFabricMgmt/CLAUDE.md).

---

## Architecture

```
server.py
  └─ PowerShellSession (singleton)          ← core/powershell_session.py
  └─ register_auth_tools(mcp, session)      ← tools/auth_tools.py
  └─ register_workspace_tools(mcp, session) ← tools/workspace_tools.py
  └─ register_lakehouse_tools(...)
  └─ ... (14 tool modules total)
```

**Key principle**: Python is a thin protocol-translation layer only. All Fabric API logic
lives in the PowerShell module. Python does not call Fabric REST APIs directly.

---

## The PowerShell Session (`core/powershell_session.py`)

### What it does

Maintains a **single long-lived `pwsh` subprocess** for the lifetime of the MCP server.
The module is imported once at startup; authentication (`Set-FabricApiHeaders`) persists
across all tool calls.

### Sentinel protocol

Every command is wrapped in a `try/catch/finally` block by Python before being written
to the process stdin:

```powershell
try {
    <your command>
} catch {
    @{ success=$false; error=$_.Exception.Message; error_type=... } | ConvertTo-Json -Compress
} finally {
    Write-Host '__MGMT_DONE__:' + ($LASTEXITCODE -as [int])
}
```

Python reads stdout lines until it sees `__MGMT_DONE__:<exit_code>`, then parses the
captured lines as JSON.

### Thread safety

`PowerShellSession.run()` acquires a `threading.Lock()`. Concurrent MCP tool calls are
serialised — only one command runs in the pwsh process at a time.

### Auto-restart

If `pwsh` crashes, the next call to `session.run()` detects the dead process, restarts it,
re-imports the module, and retries the command.

### Module path resolution (in priority order)

1. `FABRIC_MGMT_MODULE_PATH` environment variable
2. `../MicrosoftFabricMgmt/output/module/MicrosoftFabricMgmt` (repo-relative built module)
3. `MicrosoftFabricMgmt` (relies on `$env:PSModulePath`)

---

## Adding a New Tool

### Step 1 — Find the PS function

Look in `../MicrosoftFabricMgmt/source/Public/` for the function you want to wrap.
Read its parameter names and types carefully.

### Step 2 — Choose the right tools file

Each file maps to a resource category:

| File | Resource Category |
|---|---|
| `tools/auth_tools.py` | Authentication |
| `tools/workspace_tools.py` | Workspaces |
| `tools/lakehouse_tools.py` | Lakehouses |
| `tools/warehouse_tools.py` | Warehouses |
| `tools/notebook_tools.py` | Notebooks |
| `tools/pipeline_tools.py` | Data Pipelines |
| `tools/environment_tools.py` | Environments |
| `tools/semantic_model_tools.py` | Semantic Models |
| `tools/eventhouse_tools.py` | Eventhouses + KQL Databases |
| `tools/spark_tools.py` | Spark |
| `tools/admin_tools.py` | Admin |
| `tools/capacity_tools.py` | Capacities + Domains |
| `tools/sql_database_tools.py` | SQL Databases |
| `tools/escape_hatch_tools.py` | Generic escape hatches |

Create a new file if the resource category doesn't exist yet.

### Step 3 — Add the `@mcp.tool` function

Follow this template exactly:

```python
@mcp.tool(
    name="list_reports",
    description=(
        "List all reports in a Microsoft Fabric workspace.\n\n"
        "Returns report IDs, display names, and metadata."
    ),
)
def list_reports(workspace_id: str, report_name: Optional[str] = None) -> str:
    try:
        params = f"-WorkspaceId '{workspace_id}'"
        if report_name:
            params += f" -ReportName '{report_name.replace(chr(39), chr(39)*2)}'"
        cmd = f"Get-FabricReport {params} | ConvertTo-Json -Depth 5 -Compress"
        return session.run(cmd)
    except PowerShellSessionError as exc:
        return _err(str(exc), "powershell_session_error")
    except Exception as exc:
        return _err(str(exc))
```

### Step 4 — Register in `server.py`

If you added a new tools file, import and register it in `server.py`:

```python
from tools.report_tools import register_report_tools
# ...
register_report_tools(mcp, _ps_session)
```

---

## PS Command Construction Conventions

### Get-* commands (always end with ConvertTo-Json)
```python
cmd = "Get-FabricWorkspace | ConvertTo-Json -Depth 5 -Compress"
cmd = f"Get-FabricLakehouse -WorkspaceId '{workspace_id}' | ConvertTo-Json -Depth 5 -Compress"
```

### Remove-* commands (no output expected)
```python
cmd = f"Remove-FabricLakehouse -WorkspaceId '{workspace_id}' -LakehouseId '{lakehouse_id}'"
# session.run() returns {"success": true, "output": null} automatically
```

### Optional parameters — build param string conditionally
```python
params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
if description:
    params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
cmd = f"New-FabricLakehouse {params} | ConvertTo-Json -Depth 5 -Compress"
```

### Escaping single quotes in PS string literals
```python
# Always escape single quotes in any user-supplied string
safe = value.replace("'", "''")  # PS convention: '' inside a '-quoted string
# OR use chr() to avoid linter warnings:
safe = value.replace(chr(39), chr(39)*2)
```

### Boolean PS parameters
```python
flag = "$true" if python_bool else "$false"
cmd = f"New-FabricSparkCustomPool ... -AutoScaleEnabled {flag}"
```

### Depth for deeply nested objects
Use `-Depth 10` for definition-heavy calls like `Get-FabricNotebookDefinition`.
Use `-Depth 5` for standard list/get operations.

---

## Error Response Format

All tools must return a valid JSON string. On error:

```python
def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)
```

Standard `error_type` values:
- `"tool_error"` — Python-level validation error (bad arguments, etc.)
- `"powershell_session_error"` — `PowerShellSessionError` from session crash/timeout
- (PS errors surface via the `catch` block in the sentinel wrapper as `"error_type"` = PS exception class name)

---

## Security Constraints

- **Never use `shell=True`** in `subprocess.Popen` — use a list of arguments.
- **App secrets** passed to `connect_to_fabric` are immediately converted to PS `SecureString`
  inside the PS session. They are never stored as Python strings beyond the function scope.
- **Do not create a second `PowerShellSession`** instance — the singleton in `server.py` is
  the only process; a second instance would have a separate (unauthenticated) auth context.
- **`invoke_fabric_ps`** has no input sanitisation by design — document this clearly and
  only use it in trusted AI-agent environments.

---

## Testing

### Unit tests (no pwsh required)

Mock `PowerShellSession.run()` and assert the correct PS command string is constructed:

```python
from unittest.mock import MagicMock, patch
from fastmcp import FastMCP
from tools.workspace_tools import register_workspace_tools

def test_list_workspaces_builds_correct_command():
    mcp = FastMCP("test")
    session = MagicMock()
    session.run.return_value = '{"success": true}'
    register_workspace_tools(mcp, session)

    # Invoke the registered tool function
    tool = next(t for t in mcp._tools.values() if t.name == "list_workspaces")
    tool._fn()

    cmd = session.run.call_args[0][0]
    assert "Get-FabricWorkspace" in cmd
    assert "ConvertTo-Json" in cmd
```

### Integration tests (requires real pwsh + credentials)

Set env vars: `FABRIC_TENANT_ID`, `FABRIC_APP_ID`, `FABRIC_APP_SECRET`

```python
import pytest, os, json
from core.powershell_session import PowerShellSession

@pytest.fixture(scope="module")
def authenticated_session():
    tid = os.environ.get("FABRIC_TENANT_ID")
    app_id = os.environ.get("FABRIC_APP_ID")
    app_secret = os.environ.get("FABRIC_APP_SECRET")
    if not all([tid, app_id, app_secret]):
        pytest.skip("Integration credentials not set")
    session = PowerShellSession()
    session.run(
        f"$s = ConvertTo-SecureString '{app_secret}' -AsPlainText -Force; "
        f"Set-FabricApiHeaders -TenantId '{tid}' -AppId '{app_id}' -AppSecret $s"
    )
    yield session
    session.close()
```

### Manual end-to-end

```bash
# Activate venv and start the server
.venv/Scripts/python.exe server.py

# In Claude Desktop or VS Code with MCP client:
# 1. connect_to_fabric(tenant_id="<your-guid>")
# 2. list_workspaces()
# 3. list_lakehouses(workspace_id="<guid-from-step-2>")
# 4. invoke_fabric_ps("Get-FabricCapacity | ConvertTo-Json -Depth 5 -Compress")
```

---

## Known Pitfalls

| Issue | Mitigation |
|---|---|
| `readline()` hangs | Timeout loop in `_read_until_sentinel` checks `process.poll()` |
| PS errors go to stderr | `try/catch` in every wrapped command routes errors to stdout as JSON |
| Interactive auth blocks stdin | Document clearly; use SP or MI in CI/automated environments |
| Module path wrong | `FABRIC_MGMT_MODULE_PATH` env var override; build module first |
| Single quotes in names | Always escape: `value.replace("'", "''")` |
| pwsh BOM on stdout | Stripped via `line.lstrip("\ufeff")` in `_read_until_sentinel` |
