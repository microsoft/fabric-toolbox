"""Test-only capture and cleanup of python-model HC Livy sessions.

`FabricLivyHelper` stores the HC Livy session it opens in a thread-local
that escapes dbt's connection management. In tests, those sessions need
to be closed before the test schema is dropped, otherwise the synapsesql
connector keeps JDBC sessions to the DW alive on its warm-up pool, which
hold Sch-S on the schema metadata and block DROP SCHEMA on Sch-M for the
full Spark idle-reap window (25+ min, observed in CI run 26030423528).

Cleanup is a two-step process per captured session:

1. `DELETE /highConcurrencySessions/{hcId}` — releases this REPL slot.
   This is what `HighConcurrencyLivySession.close()` does. By itself it
   does NOT terminate the underlying Spark application; the JVM (and the
   synapsesql warm-up JDBC pool inside it) stays alive for the full idle-
   reap window. Verified empirically: after this DELETE the Livy session
   stayed `InProgress` and DROP SCHEMA still hit `LCK_M_SCH_M`.

2. `DELETE /sessions/{sessionId}` — terminates the underlying Livy
   session, i.e. the Spark application itself. The `sessionId` is
   populated on `HighConcurrencyLivySession._state` the first time the
   HC session becomes Idle (the HC API surfaces it on the GET response).
   This is the step that actually frees the JDBC sessions and unblocks
   DROP SCHEMA.

This module exists purely to add that cleanup hook on the test side, so
production code does not have to carry a registry or a "kill the Spark
app" code path it would never use outside tests.

Usage: `install_capture()` patches `FabricLivyHelper.__init__` to record
each constructed helper's `_thread_local.livy_session` here. `close_all()`
performs both DELETEs in parallel and clears the registry.

Scope: ONLY python-model HC sessions. FabricSpark adapter HC sessions
are wrapped in `FabricSparkConnection`, live in dbt's `thread_connections`,
and are closed by `BaseConnectionManager.cleanup_all` — they are never
constructed via `FabricLivyHelper`, so they never land here.
"""

import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric import fabric_livy_helper
from dbt.adapters.fabric.fabric_api_client import FabricApiClient, FabricApiError
from dbt.adapters.fabric.fabric_hc_livy_session import HighConcurrencyLivySession
from dbt.adapters.fabric.fabric_livy_helper import FabricLivyHelper

_TERMINAL_STATES = frozenset({"cancelled", "killed", "dead", "error", "succeeded", "failed"})
_WAIT_TIMEOUT_SECONDS = 60.0
_WAIT_POLL_INTERVAL_SECONDS = 2.0

logger = AdapterLogger("fabric")

_lock = threading.Lock()
_sessions: set[HighConcurrencyLivySession] = set()


def register(session: HighConcurrencyLivySession) -> None:
    with _lock:
        _sessions.add(session)


def close_all() -> None:
    """Release REPL slots, then terminate the underlying Spark applications."""
    with _lock:
        sessions = list(_sessions)
        _sessions.clear()
    if not sessions:
        return

    # Snapshot the underlying Livy session IDs BEFORE close() resets
    # _state. Multiple REPL slots may share the same Spark session via
    # sessionTag, so dedupe by session_id.
    underlying: dict[str, FabricApiClient] = {}
    for s in sessions:
        sid = s._state.session_id
        if sid is not None:
            underlying.setdefault(sid, s._fabric_api_client)

    logger.debug(
        f"Closing {len(sessions)} HC REPL slot(s) and {len(underlying)} underlying Livy session(s)"
    )

    with ThreadPoolExecutor(max_workers=min(len(sessions), 8)) as pool:
        list(pool.map(lambda s: s.close(), sessions))

    if underlying:
        with ThreadPoolExecutor(max_workers=min(len(underlying), 8)) as pool:
            list(
                pool.map(
                    lambda item: _delete_underlying_livy_session(*item),
                    underlying.items(),
                )
            )


def _delete_underlying_livy_session(session_id: str, api_client: FabricApiClient) -> None:
    """Terminate the Spark application backing this Livy session, then wait
    for the JVM to actually shut down.

    The DELETE is asynchronous on Fabric's side: the API returns 200
    immediately but the Spark application keeps running for ~15s while
    it tears down. The synapsesql JDBC pool lives inside that JVM, so
    DROP SCHEMA stays blocked on Sch-M until the JVM (and its TCP
    connections to the DW) is gone. We poll until the session reaches
    a terminal state or 404s.

    404 means the session is already gone (Fabric reaped it or a previous
    teardown killed it); anything else surfaces."""
    url = api_client.get_livy_base_api_uri() + f"/sessions/{session_id}"
    try:
        api_client._api_delete(url)
        logger.debug(f"Terminated underlying Livy session {session_id}")
    except FabricApiError as e:
        if e.status_code == 404:
            return
        raise

    deadline = time.monotonic() + _WAIT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        try:
            response = api_client._api_get(url)
            state = (response.json().get("state") or "").lower()
            if state in _TERMINAL_STATES:
                logger.debug(f"Livy session {session_id} reached terminal state '{state}'")
                return
        except FabricApiError as e:
            if e.status_code == 404:
                logger.debug(f"Livy session {session_id} is gone")
                return
            raise
        time.sleep(_WAIT_POLL_INTERVAL_SECONDS)
    logger.warning(
        f"Livy session {session_id} did not reach terminal state within "
        f"{_WAIT_TIMEOUT_SECONDS}s; proceeding anyway"
    )


def install_capture() -> Callable[[], None]:
    """Patch `FabricLivyHelper.__init__` to register `_thread_local.livy_session`
    after each construction. Returns a teardown callable that restores the
    original `__init__`.

    Must be installed before any `FabricLivyHelper` is constructed (i.e. from
    a session-scoped autouse fixture).
    """
    original_init = FabricLivyHelper.__init__

    def tracking_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        session = getattr(fabric_livy_helper._thread_local, "livy_session", None)
        if session is not None:
            register(session)

    FabricLivyHelper.__init__ = tracking_init

    def restore() -> None:
        FabricLivyHelper.__init__ = original_init

    return restore
