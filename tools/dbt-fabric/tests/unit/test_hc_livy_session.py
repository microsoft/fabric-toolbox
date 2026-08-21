from unittest.mock import MagicMock, patch

import pytest

from dbt.adapters.fabric.fabric_api_client import FabricApiError
from dbt.adapters.fabric.fabric_hc_livy_session import (
    HighConcurrencyLivySession,
    derive_session_tag,
)


@pytest.fixture
def credentials():
    mock = MagicMock()
    mock.spark_session_timeout = 60
    mock.query_timeout = 120
    mock.fabric_base_api_uri = "https://api.fabric.microsoft.com/v1"
    return mock


@pytest.fixture
def api_client(credentials):
    client = MagicMock()
    client._credentials = credentials
    client.get_workspace_id.return_value = "ws-123"
    client.get_lakehouse_id.return_value = "lh-456"
    return client


@pytest.fixture
def session(api_client):
    return HighConcurrencyLivySession(api_client)


def _ready_session(session):
    session._state.hc_id = "hc-1"
    session._state.session_id = "sess-1"
    session._state.repl_id = "repl-1"
    session._state.is_dead = False


class TestDeriveSessionTag:
    def test_deterministic(self):
        tag1 = derive_session_tag("ws-123", "lh-456")
        tag2 = derive_session_tag("ws-123", "lh-456")
        assert tag1 == tag2

    def test_different_inputs_produce_different_tags(self):
        tag1 = derive_session_tag("ws-123", "lh-456")
        tag2 = derive_session_tag("ws-123", "lh-789")
        assert tag1 != tag2

    def test_prefix(self):
        tag = derive_session_tag("ws-123", "lh-456")
        assert tag.startswith("dbt-fabricspark-")


class TestGetLogsUrl:
    def test_builds_url_with_session_id(self, session):
        session._state.session_id = "sess-42"
        url = session.get_logs_url()
        assert "lh-456" in url
        assert "sess-42" in url
        assert "app.fabric" in url

    def test_uses_unknown_when_no_session(self, session):
        url = session.get_logs_url()
        assert "unknown" in url


class TestWaitForSessionReady:
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_success_path(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.return_value = {"id": "hc-1"}
        api_client.get_hc_session.return_value = {
            "state": "Idle",
            "sessionId": "sess-1",
            "replId": "repl-1",
        }

        session.wait_for_session_ready()

        assert session._state.hc_id == "hc-1"
        assert session._state.session_id == "sess-1"
        assert session._state.repl_id == "repl-1"
        assert session._state.is_dead is False

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_retries_on_transient_acquire_error(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.side_effect = [
            FabricApiError("POST", "url", 500, "Server Error"),
            {"id": "hc-1"},
        ]
        api_client.get_hc_session.return_value = {
            "state": "Idle",
            "sessionId": "sess-1",
            "replId": "repl-1",
        }

        session.wait_for_session_ready()

        assert api_client.acquire_hc_session.call_count == 2

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_raises_non_transient_acquire_error(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.side_effect = FabricApiError(
            "POST", "url", 400, "Bad Request"
        )

        with pytest.raises(FabricApiError) as exc_info:
            session.wait_for_session_ready()
        assert exc_info.value.status_code == 400

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_raises_on_missing_id(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.return_value = {"state": "Starting"}

        with pytest.raises(RuntimeError, match="missing 'id'"):
            session.wait_for_session_ready()

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_cleans_up_on_poll_failure(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.return_value = {"id": "hc-leak"}
        api_client.get_hc_session.return_value = {"state": "Dead"}

        with pytest.raises(RuntimeError):
            session.wait_for_session_ready()

        api_client.delete_hc_session.assert_called_once_with("hc-leak")
        assert session._state.hc_id is None


class TestPollUntilIdle:
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.time")
    def test_polls_until_idle(self, mock_time, mock_sleep, session, api_client):
        mock_time.side_effect = [0, 1, 2]
        session._state.hc_id = "hc-1"
        api_client.get_hc_session.side_effect = [
            {"state": "Starting"},
            {"state": "Idle", "sessionId": "sess-1", "replId": "repl-1"},
        ]

        session._poll_until_idle()

        assert session._state.session_id == "sess-1"
        assert session._state.repl_id == "repl-1"

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.time")
    def test_raises_on_timeout(self, mock_time, mock_sleep, session, api_client):
        mock_time.side_effect = [0, 61]
        session._state.hc_id = "hc-1"

        with pytest.raises(TimeoutError, match="spark_session_timeout"):
            session._poll_until_idle()

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.time")
    def test_raises_on_fatal_state(self, mock_time, mock_sleep, session, api_client):
        mock_time.return_value = 0
        session._state.hc_id = "hc-1"
        api_client.get_hc_session.return_value = {
            "state": "Dead",
            "fabricSessionStateInfo": {"errorMessage": "OOM"},
        }

        with pytest.raises(RuntimeError, match="OOM"):
            session._poll_until_idle()

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.time")
    def test_retries_transient_errors(self, mock_time, mock_sleep, session, api_client):
        mock_time.side_effect = [0, 1, 2, 3]
        session._state.hc_id = "hc-1"
        api_client.get_hc_session.side_effect = [
            FabricApiError("GET", "url", 500, "transient"),
            {"state": "Idle", "sessionId": "sess-1", "replId": "repl-1"},
        ]

        session._poll_until_idle()

        assert session._state.session_id == "sess-1"

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.time")
    def test_raises_after_max_consecutive_transient_errors(
        self, mock_time, mock_sleep, session, api_client
    ):
        mock_time.return_value = 0
        session._state.hc_id = "hc-1"
        api_client.get_hc_session.side_effect = FabricApiError("GET", "url", 500, "transient")

        with pytest.raises(FabricApiError):
            session._poll_until_idle()

        assert api_client.get_hc_session.call_count == 5


class TestEnsureRepl:
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_noop_when_healthy(self, mock_sleep, session):
        _ready_session(session)
        session._ensure_repl()
        session._fabric_api_client.acquire_hc_session.assert_not_called()

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_reacquires_when_dead(self, mock_sleep, session, api_client):
        _ready_session(session)
        session._state.is_dead = True

        api_client.acquire_hc_session.return_value = {"id": "hc-new"}
        api_client.get_hc_session.return_value = {
            "state": "Idle",
            "sessionId": "sess-new",
            "replId": "repl-new",
        }

        session._ensure_repl()

        api_client.delete_hc_session.assert_called_once_with("hc-1")
        assert session._state.hc_id == "hc-new"

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_acquires_when_no_hc_id(self, mock_sleep, session, api_client):
        api_client.acquire_hc_session.return_value = {"id": "hc-first"}
        api_client.get_hc_session.return_value = {
            "state": "Idle",
            "sessionId": "sess-1",
            "replId": "repl-1",
        }

        session._ensure_repl()

        assert session._state.hc_id == "hc-first"


class TestRunStatement:
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_submits_sql(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.submit_hc_sql_statement.return_value = 42
        api_client.get_hc_statement.return_value = {
            "state": "available",
            "output": {"status": "ok", "data": {"application/json": {"rows": []}}},
        }

        result = session.run_statement("SELECT 1", "sql")

        api_client.submit_hc_sql_statement.assert_called_once_with("sess-1", "repl-1", "SELECT 1")
        assert result.success is True

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_submits_python(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.submit_hc_python_statement.return_value = 42
        api_client.get_hc_statement.return_value = {
            "state": "available",
            "output": {"status": "ok", "data": {"application/json": {}}},
        }

        result = session.run_statement("print(1)", "python")

        api_client.submit_hc_python_statement.assert_called_once_with(
            "sess-1", "repl-1", "print(1)"
        )
        assert result.success is True

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_returns_statement_id_when_not_waiting(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.submit_hc_sql_statement.return_value = 99

        result = session.run_statement("SELECT 1", "sql", wait_for_result=False)

        assert result == 99

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_marks_dead_on_404(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.submit_hc_sql_statement.side_effect = FabricApiError(
            "POST", "url", 404, "Not Found"
        )

        result = session.run_statement("SELECT 1", "sql")

        assert result.success is False
        assert session._state.is_dead is True


class TestWaitAndGetStatementResult:
    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_success(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.get_hc_statement.return_value = {
            "state": "available",
            "output": {
                "status": "ok",
                "data": {"application/json": {"key": "value"}},
            },
        }

        result = session.wait_and_get_statement_result(42)

        assert result.success is True
        assert result.statement_id == 42
        assert result.json_data == {"key": "value"}

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_error_statement(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.get_hc_statement.return_value = {
            "state": "error",
            "output": {"status": "error", "evalue": "division by zero"},
        }

        result = session.wait_and_get_statement_result(42)

        assert result.success is False
        assert result.error_message == "division by zero"

    @patch("dbt.adapters.fabric.fabric_hc_livy_session.time.sleep")
    def test_marks_dead_on_404(self, mock_sleep, session, api_client):
        _ready_session(session)
        api_client.get_hc_statement.side_effect = FabricApiError("GET", "url", 404, "Not Found")

        result = session.wait_and_get_statement_result(42)

        assert result.success is False
        assert session._state.is_dead is True


class TestClose:
    def test_deletes_session(self, session, api_client):
        _ready_session(session)
        session.close()

        api_client.delete_hc_session.assert_called_once_with("hc-1")
        assert session._state.hc_id is None

    def test_noop_when_no_session(self, session, api_client):
        session.close()
        api_client.delete_hc_session.assert_not_called()

    def test_resets_state_even_on_delete_failure(self, session, api_client):
        _ready_session(session)
        api_client.delete_hc_session.side_effect = Exception("network error")

        session.close()

        assert session._state.hc_id is None


class TestPollIntervalForAttempt:
    def test_ramps_up_then_floors_at_polling_interval(self):
        cls = HighConcurrencyLivySession
        assert cls._poll_interval_for_attempt(0) == 0.5
        assert cls._poll_interval_for_attempt(1) == 1.0
        assert cls._poll_interval_for_attempt(2) == 2.0
        assert cls._poll_interval_for_attempt(3) == cls._POLLING_INTERVAL
        assert cls._poll_interval_for_attempt(50) == cls._POLLING_INTERVAL


class TestCancelStatement:
    def test_delegates_to_api_client(self, session, api_client):
        _ready_session(session)
        session.cancel_statement(42)

        api_client.cancel_hc_statement.assert_called_once_with("sess-1", "repl-1", 42)
