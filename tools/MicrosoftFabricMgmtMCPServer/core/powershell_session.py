"""
Persistent PowerShell session manager for MicrosoftFabricMgmt MCP Server.

Maintains a single long-lived pwsh subprocess. Commands are sent over stdin
and responses are read until a sentinel token is detected on stdout.

Communication protocol:
  Python writes a try/catch/finally block to stdin.
  PowerShell executes the command, writes JSON to stdout, then writes the
  sentinel token  __MGMT_DONE__:<exitcode>  to signal completion.
  Python reads lines until it sees the sentinel, then parses captured output.
"""
import json
import logging
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Sentinel written by PowerShell after every command.
# Unique enough to never appear in normal JSON output.
_SENTINEL = "__MGMT_DONE__"

# Default timeout per command (seconds).
_DEFAULT_TIMEOUT = 120

# Resolve module path relative to this file:
#   this file  → core/
#   parent(1)  → MicrosoftFabricMgmtMCPServer/
#   parent(2)  → tools/
#   + sibling  → tools/MicrosoftFabricMgmt/output/module/MicrosoftFabricMgmt
_TOOLS_DIR = Path(__file__).parents[1].parent
_DEFAULT_MODULE_PATH = (
    _TOOLS_DIR
    / "MicrosoftFabricMgmt"
    / "output"
    / "module"
    / "MicrosoftFabricMgmt"
)


def _resolve_module_path() -> Path:
    """Return the path to the built MicrosoftFabricMgmt module directory."""
    # 1. Environment variable override
    env_path = os.environ.get("FABRIC_MGMT_MODULE_PATH")
    if env_path:
        p = Path(env_path)
        if p.exists():
            logger.info("Using module path from FABRIC_MGMT_MODULE_PATH: %s", p)
            return p
        logger.warning(
            "FABRIC_MGMT_MODULE_PATH set to '%s' but path does not exist", env_path
        )

    # 2. Repo-relative built module
    if _DEFAULT_MODULE_PATH.exists():
        logger.info("Using built module at: %s", _DEFAULT_MODULE_PATH)
        return _DEFAULT_MODULE_PATH

    # 3. Fall back to module name only (relies on pwsh finding it via PSModulePath)
    logger.warning(
        "Built module not found at '%s'. Will try 'MicrosoftFabricMgmt' from PSModulePath.",
        _DEFAULT_MODULE_PATH,
    )
    return Path("MicrosoftFabricMgmt")


class PowerShellSessionError(Exception):
    """Raised when the PowerShell subprocess fails or exits unexpectedly."""


class PowerShellSession:
    """
    Manages a persistent pwsh subprocess.

    Usage::

        session = PowerShellSession()
        result = session.run("Get-FabricWorkspace | ConvertTo-Json -Depth 5 -Compress")
        print(result)   # indented JSON string
        session.close()

    The session is thread-safe: concurrent calls are serialised by an internal
    lock.  If pwsh crashes, the session auto-restarts on the next call.
    """

    def __init__(
        self,
        module_path: Optional[Path] = None,
        timeout: int = _DEFAULT_TIMEOUT,
    ) -> None:
        self._module_path = module_path or _resolve_module_path()
        self._timeout = timeout
        self._lock = threading.Lock()
        self._process: Optional[subprocess.Popen] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._start()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _start(self) -> None:
        """Start the pwsh subprocess and import the MicrosoftFabricMgmt module."""
        logger.info("Starting persistent pwsh session (module: %s)", self._module_path)

        self._process = subprocess.Popen(
            [
                "pwsh",
                "-NoProfile",
                "-NonInteractive",
                "-NoLogo",
                "-ExecutionPolicy",
                "RemoteSigned",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,  # line-buffered
        )

        # Drain stderr in the background to avoid pipe deadlock.
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr, daemon=True, name="pwsh-stderr"
        )
        self._stderr_thread.start()

        # Bootstrap: configure PS preferences and import the module.
        module_path_str = str(self._module_path).replace("'", "''")
        bootstrap = (
            "$ErrorActionPreference = 'Stop'\n"
            "$WarningPreference = 'SilentlyContinue'\n"
            "$ProgressPreference = 'SilentlyContinue'\n"
            "$InformationPreference = 'SilentlyContinue'\n"
            f"Import-Module '{module_path_str}' -Force\n"
            f"Write-Host '{_SENTINEL}:0'\n"
        )
        self._process.stdin.write(bootstrap)
        self._process.stdin.flush()

        lines, _ = self._read_until_sentinel()
        logger.info("PowerShell session ready. Module imported successfully.")
        if lines:
            logger.debug("Bootstrap output: %s", " | ".join(lines))

    def _drain_stderr(self) -> None:
        """Continuously read stderr to prevent the pipe from blocking."""
        try:
            for line in self._process.stderr:
                line = line.rstrip()
                if line:
                    logger.debug("PS stderr: %s", line)
        except Exception:
            pass

    def _read_until_sentinel(self) -> tuple[list[str], int]:
        """
        Read stdout lines until the sentinel token is found.

        Returns ``(lines_before_sentinel, exit_code)``.
        The sentinel line has the form: ``__MGMT_DONE__:<int>``
        """
        output_lines: list[str] = []
        deadline = time.monotonic() + self._timeout

        while True:
            if time.monotonic() > deadline:
                raise PowerShellSessionError(
                    f"Timed out waiting for PowerShell response after {self._timeout}s. "
                    f"Partial output: {output_lines!r}"
                )

            if self._process.poll() is not None:
                remaining = ""
                try:
                    remaining = self._process.stdout.read(4096)
                except Exception:
                    pass
                raise PowerShellSessionError(
                    f"pwsh process exited unexpectedly (rc={self._process.returncode}). "
                    f"Output so far: {output_lines!r}. Remaining stdout: {remaining!r}"
                )

            line = self._process.stdout.readline()
            if not line:
                # readline() returned empty → EOF or would block; spin briefly
                time.sleep(0.01)
                continue

            line = line.rstrip("\n\r")

            # Strip UTF-8 BOM that pwsh sometimes emits
            line = line.lstrip("\ufeff")

            if line.startswith(_SENTINEL + ":"):
                try:
                    exit_code = int(line.split(":", 1)[1])
                except (IndexError, ValueError):
                    exit_code = 0
                return output_lines, exit_code

            output_lines.append(line)

    def _is_alive(self) -> bool:
        return self._process is not None and self._process.poll() is None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, ps_command: str) -> str:
        """
        Execute a PowerShell command and return the result as a JSON string.

        The command should produce output via ``ConvertTo-Json`` so that Python
        receives structured data.  If the command produces no output (e.g.
        ``Remove-*`` operations) ``{"success": true, "output": null}`` is
        returned.  If PowerShell raises a terminating error the error is caught
        inside the try/catch wrapper and returned as a JSON error object.

        Args:
            ps_command: A PowerShell statement or pipeline to execute.

        Returns:
            A JSON-formatted string (always valid JSON).

        Raises:
            PowerShellSessionError: If the subprocess crashes or times out.
        """
        with self._lock:
            # Auto-restart if session died
            if not self._is_alive():
                logger.warning("pwsh session died; restarting…")
                try:
                    self._start()
                except Exception as exc:
                    raise PowerShellSessionError(
                        f"Failed to restart pwsh session: {exc}"
                    ) from exc

            # Wrap the command so errors surface as JSON and sentinel always fires.
            # Using a here-string avoids quoting issues with most commands.
            wrapped = (
                "try {\n"
                f"    {ps_command}\n"
                "} catch {\n"
                "    $errMsg = $_.Exception.Message\n"
                "    $errType = $_.Exception.GetType().Name\n"
                "    [PSCustomObject]@{ success = $false; error = $errMsg; "
                "error_type = $errType } | ConvertTo-Json -Compress\n"
                "} finally {\n"
                f"    Write-Host ('{_SENTINEL}:' + ($LASTEXITCODE -as [int]))\n"
                "}\n"
            )
            self._process.stdin.write(wrapped)
            self._process.stdin.flush()

            lines, _exit_code = self._read_until_sentinel()

        # Join non-empty lines.
        raw_output = "\n".join(line for line in lines if line.strip())

        if not raw_output:
            return json.dumps({"success": True, "output": None}, indent=2)

        # Try to parse and re-format with Python's json for consistent indentation.
        try:
            parsed = json.loads(raw_output)
            return json.dumps(parsed, indent=2, default=str)
        except json.JSONDecodeError:
            # Command returned non-JSON plain text.
            return json.dumps({"success": True, "output": raw_output}, indent=2)

    def close(self) -> None:
        """Gracefully shut down the pwsh subprocess."""
        if self._is_alive():
            try:
                self._process.stdin.write("exit\n")
                self._process.stdin.flush()
                self._process.wait(timeout=5)
            except Exception:
                self._process.kill()
        self._process = None
        logger.info("PowerShell session closed.")

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass
