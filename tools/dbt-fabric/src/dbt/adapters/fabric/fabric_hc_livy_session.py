import contextlib
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any

import requests

from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.fabric_api_client import FabricApiClient, FabricApiError
from dbt.adapters.fabric.livy_result import LivySessionResult

logger = AdapterLogger("fabricspark")

_TERMINAL_BAD_STATES = frozenset({"Dead", "Killed", "Failed", "Error"})
_TRANSIENT_EXCEPTIONS = (
    FabricApiError,
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    requests.exceptions.ChunkedEncodingError,
    json.JSONDecodeError,
)


def derive_session_tag(workspace_id: str, lakehouse_id: str) -> str:
    """Deterministic session tag from (workspace_id, lakehouse_id).

    All dbt threads in the same process produce the same tag, so Fabric packs
    their REPLs onto one underlying Livy session. Successive dbt invocations
    targeting the same workspace + lakehouse also produce the same tag, letting
    Fabric snap-attach new REPLs onto the still-warm session.
    """
    material = f"{workspace_id}|{lakehouse_id}"
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]
    return f"dbt-fabricspark-{digest}"


@dataclass
class HCSessionState:
    hc_id: str | None = None
    session_id: str | None = None
    repl_id: str | None = None
    is_dead: bool = False


class HighConcurrencyLivySession:
    """One HC REPL per dbt thread.

    Acquires an HC session via ``POST /highConcurrencySessions``, polls until
    the underlying Livy session is idle and a REPL is allocated, then submits
    statements through the REPL endpoint.

    ``close()`` DELETEs this instance's HC session (REPL slot) only — the
    underlying Spark session is managed by Fabric and stays alive for other
    REPLs and processes.
    """

    _POLLING_INTERVAL = 3
    _POLL_BACKOFF_SCHEDULE: tuple[float, ...] = (0.5, 1.0, 2.0)
    _MAX_CONSECUTIVE_TRANSIENT_ERRORS = 5
    _TERMINAL_STATEMENT_STATES = frozenset({"available", "error", "cancelled", "cancelling"})

    def __init__(self, fabric_api_client: FabricApiClient) -> None:
        self._fabric_api_client = fabric_api_client
        self._state = HCSessionState()
        self._session_tag: str | None = None

    @classmethod
    def _poll_interval_for_attempt(cls, attempt: int) -> float:
        """Exponential backoff for polling: 0.5s, 1s, 2s, then 3s steady-state.

        HC sessions on a warm Spark cluster typically reach Idle within a
        second; short statements complete sub-second. Starting at the floor
        wastes most of that latency on a fixed 3s sleep.
        """
        if attempt < len(cls._POLL_BACKOFF_SCHEDULE):
            return cls._POLL_BACKOFF_SCHEDULE[attempt]
        return cls._POLLING_INTERVAL

    def _get_session_tag(self) -> str:
        if self._session_tag is None:
            workspace_id = self._fabric_api_client.get_workspace_id()
            lakehouse_id = self._fabric_api_client.get_lakehouse_id()
            self._session_tag = derive_session_tag(workspace_id, lakehouse_id)
        return self._session_tag

    def get_logs_url(self) -> str:
        """Build the Fabric Portal URL to the Spark monitor logs for this session."""
        api_uri = self._fabric_api_client._credentials.fabric_base_api_uri
        portal_host = api_uri.replace("://api.", "://app.").split("/v")[0]
        lakehouse_id = self._fabric_api_client.get_lakehouse_id()
        session_id = self._state.session_id or "unknown"
        return f"{portal_host}/workloads/de-ds/sparkmonitor/{lakehouse_id}/{session_id}"

    # ---- acquire -----------------------------------------------------------

    def wait_for_session_ready(self) -> None:
        """Acquire an HC session and poll until the REPL is ready."""
        tag = self._get_session_tag()
        logger.debug(f"Acquiring HC session (sessionTag={tag})")

        max_attempts = 3
        backoff_seconds = 5
        last_exception: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                body = self._fabric_api_client.acquire_hc_session(tag)
                break
            except _TRANSIENT_EXCEPTIONS as e:
                is_api_error = isinstance(e, FabricApiError)
                if is_api_error and not (e.status_code == 404 or 500 <= e.status_code < 600):
                    raise
                if attempt == max_attempts:
                    raise
                last_exception = e
                wait_time = backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    f"HC session acquire returned a transient error "
                    f"(attempt {attempt}/{max_attempts}), retrying in {wait_time}s: {e}"
                )
                time.sleep(wait_time)
        else:
            assert last_exception is not None
            raise last_exception

        hc_id = body.get("id")
        if not hc_id:
            raise RuntimeError(f"HC acquire response missing 'id': {body}")

        self._state.hc_id = str(hc_id)
        try:
            self._poll_until_idle()
        except Exception:
            with contextlib.suppress(Exception):
                self._fabric_api_client.delete_hc_session(str(hc_id))
            self._state = HCSessionState()
            raise
        self._state.is_dead = False
        logger.debug(
            f"HC session ready: hc_id={self._state.hc_id} "
            f"sessionId={self._state.session_id} replId={self._state.repl_id}"
        )

    def _poll_until_idle(self) -> None:
        start_time = time.time()
        timeout = self._fabric_api_client._credentials.spark_session_timeout
        consecutive_errors = 0
        attempt = 0

        while True:
            if time.time() - start_time >= timeout:
                raise TimeoutError(
                    f"Timeout ({timeout}s) waiting for HC session {self._state.hc_id} "
                    f"to become Idle. Increase `spark_session_timeout` in profiles.yml."
                )

            try:
                body = self._fabric_api_client.get_hc_session(self._state.hc_id)
                consecutive_errors = 0
            except _TRANSIENT_EXCEPTIONS as e:
                consecutive_errors += 1
                if consecutive_errors >= self._MAX_CONSECUTIVE_TRANSIENT_ERRORS:
                    raise
                logger.warning(
                    f"Transient error polling HC session {self._state.hc_id} "
                    f"({consecutive_errors}/{self._MAX_CONSECUTIVE_TRANSIENT_ERRORS}): {e}"
                )
                time.sleep(self._poll_interval_for_attempt(attempt))
                attempt += 1
                continue

            state = body.get("state", "")

            if state in _TERMINAL_BAD_STATES:
                err = body.get("fabricSessionStateInfo", {}).get("errorMessage") or state
                raise RuntimeError(f"HC session {self._state.hc_id} state={state}: {err}")

            if state == "Idle" and body.get("sessionId") and body.get("replId"):
                self._state.session_id = str(body["sessionId"])
                self._state.repl_id = str(body["replId"])
                return

            time.sleep(self._poll_interval_for_attempt(attempt))
            attempt += 1

    def _ensure_repl(self) -> None:
        """Re-acquire this thread's HC session if it was marked dead."""
        if self._state.is_dead or self._state.hc_id is None:
            logger.debug("HC REPL marked stale — re-acquiring")
            if self._state.hc_id is not None:
                with contextlib.suppress(Exception):
                    self._fabric_api_client.delete_hc_session(self._state.hc_id)
                self._state = HCSessionState()
            self.wait_for_session_ready()

    def cancel_statement(self, statement_id: int) -> None:
        """Cancel a running statement via the HC REPL endpoint."""
        assert self._state.session_id is not None
        assert self._state.repl_id is not None
        self._fabric_api_client.cancel_hc_statement(
            self._state.session_id, self._state.repl_id, statement_id
        )

    # ---- statement execution -----------------------------------------------

    def run_statement(
        self, statement_code: str, statement_language: str, wait_for_result: bool = True
    ) -> LivySessionResult | int:
        """Submit a statement and optionally wait for its result.

        Same interface as ``LivySession.run_statement``.
        """
        self._ensure_repl()
        assert self._state.session_id is not None
        assert self._state.repl_id is not None

        try:
            if statement_language == "sql":
                statement_id = self._fabric_api_client.submit_hc_sql_statement(
                    self._state.session_id, self._state.repl_id, statement_code
                )
            else:
                statement_id = self._fabric_api_client.submit_hc_python_statement(
                    self._state.session_id, self._state.repl_id, statement_code
                )
        except FabricApiError as e:
            if e.status_code == 404:
                self._state.is_dead = True
                logger.debug("HC statement submit returned 404 — flagging REPL for re-acquire")
            return LivySessionResult(success=False, error_message=str(e))

        if wait_for_result:
            return self.wait_and_get_statement_result(statement_id)
        else:
            return statement_id

    def wait_for_statement_ready(self, statement_id: int) -> dict[str, Any]:
        """Poll an HC REPL statement until it reaches a terminal state."""
        assert self._state.session_id is not None
        assert self._state.repl_id is not None

        start_time = time.time()
        attempt = 0
        while True:
            response = self._fabric_api_client.get_hc_statement(
                self._state.session_id, self._state.repl_id, statement_id
            )
            statement_state = response.get("state", "unknown")
            if statement_state in self._TERMINAL_STATEMENT_STATES:
                return response
            if time.time() - start_time >= self._fabric_api_client._credentials.query_timeout:
                raise TimeoutError("HC Livy statement did not become available in time.")
            time.sleep(self._poll_interval_for_attempt(attempt))
            attempt += 1

    def wait_and_get_statement_result(self, statement_id: int) -> LivySessionResult:
        """Wait for a statement to complete and return its result."""
        try:
            response = self.wait_for_statement_ready(statement_id)
            output = response.get("output", {})
            success = response["state"] == "available" and output.get("status") == "ok"
            error_message = output.get("evalue")
            if not success and not error_message:
                error_message = f"Statement ended with state '{response.get('state')}'"
            return LivySessionResult(
                statement_id=statement_id,
                success=success,
                error_message=error_message,
                status_code=output.get("status"),
                json_data=output.get("data", {}).get("application/json", {}),
            )
        except FabricApiError as e:
            if e.status_code == 404:
                self._state.is_dead = True
                logger.debug("HC statement poll returned 404 — flagging REPL for re-acquire")
            logger.error(
                f"Error while waiting for HC statement to be ready. "
                f"Logs URL: {self.get_logs_url()}"
            )
            logger.exception(e)
            return LivySessionResult(
                statement_id=statement_id, success=False, error_message=str(e)
            )
        except Exception as e:
            logger.error(
                f"Error while waiting for HC statement to be ready. "
                f"Logs URL: {self.get_logs_url()}"
            )
            logger.exception(e)
            return LivySessionResult(
                statement_id=statement_id, success=False, error_message=str(e)
            )

    # ---- cleanup -----------------------------------------------------------

    def close(self) -> None:
        """Release the HC session, freeing the REPL slot."""
        if self._state.hc_id is not None:
            try:
                self._fabric_api_client.delete_hc_session(self._state.hc_id)
                logger.debug(f"Released HC session {self._state.hc_id}")
            except Exception as ex:
                logger.warning(f"Failed to delete HC session {self._state.hc_id}: {ex}")
            finally:
                self._state = HCSessionState()
