from unittest.mock import MagicMock, patch

import dbt_common.exceptions
import pytest

from dbt.adapters.fabric.fabric_api_client import FabricApiClient, FabricApiError


@pytest.fixture(autouse=True)
def reset_singleton():
    FabricApiClient._instance = None
    yield
    FabricApiClient._instance = None


@pytest.fixture
def token_provider():
    mock = MagicMock()
    mock.get_access_token.return_value = "test-token"
    return mock


@pytest.fixture
def credentials():
    mock = MagicMock()
    mock.workspace_id = "ws-id-123"
    mock.workspace_name = "test-workspace"
    mock.database = "test-warehouse"
    mock.lakehouse_name = "test-lakehouse"
    mock.fabric_base_api_uri = "https://api.fabric.microsoft.com/v1"
    mock.powerbi_base_api_uri = "https://api.powerbi.com/v1.0"
    mock.livy_session_name = "test-session"
    return mock


@pytest.fixture
def client(credentials, token_provider):
    return FabricApiClient(credentials, token_provider)


def _make_response(status_code=200, json_data=None, headers=None, text=""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.headers = headers or {}
    resp.text = text
    return resp


class TestSingleton:
    def test_create_returns_same_instance(self, credentials, token_provider):
        first = FabricApiClient.create(credentials, token_provider)
        second = FabricApiClient.create(credentials, token_provider)
        assert first is second

    def test_create_returns_fabric_api_client(self, credentials, token_provider):
        instance = FabricApiClient.create(credentials, token_provider)
        assert isinstance(instance, FabricApiClient)


class TestApiRequest:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_2xx_returns_response(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"data": "ok"})

        result = client._api_request("https://example.com/api")

        assert result.status_code == 200
        assert result.json() == {"data": "ok"}

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_non_2xx_raises_fabric_api_error(self, mock_request, client):
        mock_request.return_value = _make_response(500, text="Internal Server Error")

        with pytest.raises(FabricApiError) as exc_info:
            client._api_request("https://example.com/api")

        assert exc_info.value.status_code == 500

    @patch("dbt.adapters.fabric.fabric_api_client.time.sleep")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_429_retries_after_retry_after_header(self, mock_request, mock_sleep, client):
        throttled = _make_response(429, headers={"Retry-After": "3"})
        success = _make_response(200, {"data": "ok"})
        mock_request.side_effect = [throttled, success]

        result = client._api_request("https://example.com/api")

        assert result.status_code == 200
        mock_sleep.assert_called_once_with(3)

    @patch("dbt.adapters.fabric.fabric_api_client.time.sleep")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_429_defaults_to_5s_when_no_retry_after(self, mock_request, mock_sleep, client):
        throttled = _make_response(429, headers={})
        success = _make_response(200)
        mock_request.side_effect = [throttled, success]

        client._api_request("https://example.com/api")

        mock_sleep.assert_called_once_with(5)

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_auth_header_included(self, mock_request, client):
        mock_request.return_value = _make_response(200)

        client._api_request("https://example.com/api")

        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer test-token"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_post_sends_json_body(self, mock_request, client):
        mock_request.return_value = _make_response(200)

        client._api_post("https://example.com/api", {"key": "value"})

        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["json"] == {"key": "value"}


class TestGetWorkspaceId:
    def test_returns_cached_value(self, client):
        client._workspace_id = "cached-ws-id"
        assert client.get_workspace_id() == "cached-ws-id"

    def test_returns_credential_workspace_id(self, client):
        client._credentials.workspace_id = "cred-ws-id"
        client._workspace_id = None
        assert client.get_workspace_id() == "cred-ws-id"

    def test_raises_when_no_workspace_config(self, client):
        client._credentials.workspace_id = None
        client._credentials.workspace_name = None

        with pytest.raises(dbt_common.exceptions.DbtConfigError):
            client.get_workspace_id()

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_looks_up_by_name(self, mock_request, client):
        client._credentials.workspace_id = None
        client._credentials.workspace_name = "my-workspace"
        mock_request.return_value = _make_response(200, {"value": [{"id": "looked-up-id"}]})

        result = client.get_workspace_id()

        assert result == "looked-up-id"
        assert client._workspace_id == "looked-up-id"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_raises_when_no_workspace_found(self, mock_request, client):
        client._credentials.workspace_id = None
        client._credentials.workspace_name = "nonexistent"
        mock_request.return_value = _make_response(200, {"value": []})

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="No workspace found"):
            client.get_workspace_id()


class TestGetWarehouses:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_follows_pagination(self, mock_request, client):
        page1 = _make_response(
            200,
            {"value": [{"id": "wh-1"}], "continuationUri": "https://next-page"},
        )
        page2 = _make_response(200, {"value": [{"id": "wh-2"}]})
        mock_request.side_effect = [page1, page2]

        result = client.get_warehouses(fetch_all=True)

        assert len(result) == 2
        assert result[0]["id"] == "wh-1"
        assert result[1]["id"] == "wh-2"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_caches_result(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"value": [{"id": "wh-1"}]})

        client.get_warehouses(fetch_all=True)
        client.get_warehouses(fetch_all=True)

        assert mock_request.call_count == 1

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_false_returns_first_page_only(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {"value": [{"id": "wh-1"}], "continuationUri": "https://next-page"},
        )

        result = client.get_warehouses(fetch_all=False)

        assert len(result) == 1
        assert mock_request.call_count == 1

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_false_does_not_cache(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"value": [{"id": "wh-1"}]})

        client.get_warehouses(fetch_all=False)
        client.get_warehouses(fetch_all=False)

        assert mock_request.call_count == 2


class TestGetLakehouses:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_follows_pagination(self, mock_request, client):
        page1 = _make_response(
            200,
            {"value": [{"id": "lh-1"}], "continuationUri": "https://next-page"},
        )
        page2 = _make_response(200, {"value": [{"id": "lh-2"}]})
        mock_request.side_effect = [page1, page2]

        result = client.get_lakehouses(fetch_all=True)

        assert len(result) == 2

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_caches_result(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"value": [{"id": "lh-1"}]})

        client.get_lakehouses(fetch_all=True)
        client.get_lakehouses(fetch_all=True)

        assert mock_request.call_count == 1

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_fetch_all_false_does_not_cache(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"value": [{"id": "lh-1"}]})

        client.get_lakehouses(fetch_all=False)
        client.get_lakehouses(fetch_all=False)

        assert mock_request.call_count == 2


class TestGetWarehouseConnectionString:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_returns_from_warehouse(self, mock_request, client):
        mock_request.return_value = _make_response(
            200,
            {"value": [{"properties": {"connectionString": "server.database.windows.net"}}]},
        )

        result = client.get_warehouse_connection_string()
        assert result == "server.database.windows.net"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_falls_back_to_lakehouse(self, mock_request, client):
        no_warehouses = _make_response(200, {"value": []})
        lakehouses = _make_response(
            200,
            {
                "value": [
                    {
                        "properties": {
                            "sqlEndpointProperties": {
                                "connectionString": "lakehouse.database.windows.net"
                            }
                        }
                    }
                ]
            },
        )
        mock_request.side_effect = [no_warehouses, lakehouses]

        result = client.get_warehouse_connection_string()
        assert result == "lakehouse.database.windows.net"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_raises_when_no_warehouses_or_lakehouses(self, mock_request, client):
        mock_request.return_value = _make_response(200, {"value": []})

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="No Data Warehouses"):
            client.get_warehouse_connection_string()

    def test_returns_cached_value(self, client):
        client._warehouse_connection_string = "cached.server.net"
        assert client.get_warehouse_connection_string() == "cached.server.net"


class TestGetLakehouseId:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_matches_case_insensitive(self, mock_request, client):
        client._credentials.lakehouse_name = "MyLakehouse"
        mock_request.return_value = _make_response(
            200, {"value": [{"displayName": "mylakehouse", "id": "lh-id-1"}]}
        )

        result = client.get_lakehouse_id()
        assert result == "lh-id-1"

    def test_returns_cached_value(self, client):
        client._lakehouse_id = "cached-lh-id"
        assert client.get_lakehouse_id() == "cached-lh-id"

    def test_raises_when_no_lakehouse_name_configured(self, client):
        client._credentials.lakehouse_name = None

        with pytest.raises(dbt_common.exceptions.DbtConfigError):
            client.get_lakehouse_id()

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_raises_when_no_match(self, mock_request, client):
        client._credentials.lakehouse_name = "nonexistent"
        mock_request.return_value = _make_response(
            200, {"value": [{"displayName": "other", "id": "lh-id-1"}]}
        )

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="No Lakehouse found"):
            client.get_lakehouse_id()


class TestGetWarehouseId:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_matches_case_insensitive(self, mock_request, client):
        client._credentials.database = "MyWarehouse"
        mock_request.return_value = _make_response(
            200, {"value": [{"displayName": "mywarehouse", "id": "wh-id-1"}]}
        )

        result = client.get_warehouse_id()
        assert result == "wh-id-1"

    def test_returns_cached_value(self, client):
        client._warehouse_id = "cached-wh-id"
        assert client.get_warehouse_id() == "cached-wh-id"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_raises_when_no_match(self, mock_request, client):
        client._credentials.database = "nonexistent"
        mock_request.return_value = _make_response(
            200, {"value": [{"displayName": "other", "id": "wh-id-1"}]}
        )

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="No Data Warehouse found"):
            client.get_warehouse_id()


class TestWarehouseSnapshots:
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_get_warehouse_snapshots_filters_by_warehouse(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        mock_request.return_value = _make_response(
            200,
            {
                "value": [
                    {
                        "id": "snap-1",
                        "displayName": "snap_a",
                        "properties": {"parentWarehouseId": "wh-id-1"},
                    },
                    {
                        "id": "snap-2",
                        "displayName": "snap_b",
                        "properties": {"parentWarehouseId": "other-wh"},
                    },
                ]
            },
        )

        result = client.get_warehouse_snapshots()

        assert len(result) == 1
        assert result[0]["id"] == "snap-1"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_create_warehouse_snapshot_tracks_pending_operation(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        mock_request.return_value = _make_response(
            202, headers={"Location": "https://operation-uri"}
        )

        client.create_warehouse_snapshot("my-snapshot")

        assert "my-snapshot" in client._warehouse_snapshot_operations
        assert client._warehouse_snapshot_operations["my-snapshot"] == "https://operation-uri"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_create_warehouse_snapshot_no_operation_on_200(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        mock_request.return_value = _make_response(200)

        client.create_warehouse_snapshot("my-snapshot")

        assert "my-snapshot" not in client._warehouse_snapshot_operations

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_update_warehouse_snapshot_tracks_pending_operation(self, mock_request, client):
        mock_request.return_value = _make_response(
            202, headers={"Location": "https://update-op-uri"}
        )

        client.update_warehouse_snapshot("snap-id", "my-snapshot", "new desc")

        assert client._warehouse_snapshot_operations["my-snapshot"] == "https://update-op-uri"

    @patch("dbt.adapters.fabric.fabric_api_client.time.sleep")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_wait_and_get_snapshot_id_polls_until_succeeded(
        self, mock_request, mock_sleep, client
    ):
        running = _make_response(
            200,
            {"status": "Running"},
            headers={"Retry-After": "1"},
        )
        succeeded = _make_response(
            200,
            {"status": "Succeeded"},
            headers={"Location": "https://result-uri"},
        )
        result_resp = _make_response(200, {"id": "snap-result-id"})
        mock_request.side_effect = [running, succeeded, result_resp]

        result = client.wait_and_get_snapshot_id_from_operation("https://op-uri")

        assert result == "snap-result-id"
        mock_sleep.assert_called_once_with(1)

    @patch("dbt.adapters.fabric.fabric_api_client.time.time")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_wait_and_get_snapshot_id_raises_on_timeout(self, mock_request, mock_time, client):
        mock_time.side_effect = [0, FabricApiClient._WAREHOUSE_SNAPSHOT_TIMEOUT_SECONDS + 1]

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="Timed out"):
            client.wait_and_get_snapshot_id_from_operation("https://op-uri")

    @patch("dbt.adapters.fabric.fabric_api_client.time.sleep")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_wait_and_get_snapshot_id_raises_on_failed_status(
        self, mock_request, mock_sleep, client
    ):
        failed = _make_response(200, {"status": "Failed"}, headers={"Retry-After": "1"})
        mock_request.return_value = failed

        with pytest.raises(dbt_common.exceptions.DbtRuntimeError, match="failed with status"):
            client.wait_and_get_snapshot_id_from_operation("https://op-uri")

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_create_or_update_creates_when_no_existing(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        snapshots_resp = _make_response(200, {"value": []})
        create_resp = _make_response(200)
        mock_request.side_effect = [snapshots_resp, create_resp]

        client.create_or_update_warehouse_snapshot("new-snap", "a description")

        create_call = mock_request.call_args_list[1]
        assert create_call[0][0] == "post"

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_create_or_update_updates_when_found_by_name(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        snapshots_resp = _make_response(
            200,
            {
                "value": [
                    {
                        "id": "existing-snap-id",
                        "displayName": "my-snap",
                        "properties": {"parentWarehouseId": "wh-id-1"},
                    }
                ]
            },
        )
        update_resp = _make_response(200)
        mock_request.side_effect = [snapshots_resp, update_resp]

        client.create_or_update_warehouse_snapshot("my-snap", "updated desc")

        update_call = mock_request.call_args_list[1]
        assert update_call[0][0] == "patch"

    @patch("dbt.adapters.fabric.fabric_api_client.time.sleep")
    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_create_or_update_waits_for_pending_operation(self, mock_request, mock_sleep, client):
        client._warehouse_id = "wh-id-1"
        client._warehouse_snapshot_operations["my-snap"] = "https://pending-op"

        succeeded = _make_response(
            200,
            {"status": "Succeeded"},
            headers={"Location": "https://result-uri"},
        )
        result_resp = _make_response(200, {"id": "snap-result-id"})
        update_resp = _make_response(200)
        mock_request.side_effect = [succeeded, result_resp, update_resp]

        client.create_or_update_warehouse_snapshot("my-snap", "desc")

        update_call = mock_request.call_args_list[2]
        assert update_call[0][0] == "patch"
        assert "snap-result-id" in update_call[0][1]

    @patch("dbt.adapters.fabric.fabric_api_client.requests.request")
    def test_delete_warehouse_snapshot_by_name(self, mock_request, client):
        client._warehouse_id = "wh-id-1"
        snapshots_resp = _make_response(
            200,
            {
                "value": [
                    {
                        "id": "snap-to-delete",
                        "displayName": "my-snap",
                        "properties": {"parentWarehouseId": "wh-id-1"},
                    }
                ]
            },
        )
        delete_resp = _make_response(200)
        mock_request.side_effect = [snapshots_resp, delete_resp]

        client.delete_warehouse_snapshot("my-snap")

        delete_call = mock_request.call_args_list[1]
        assert delete_call[0][0] == "delete"
        assert "snap-to-delete" in delete_call[0][1]
