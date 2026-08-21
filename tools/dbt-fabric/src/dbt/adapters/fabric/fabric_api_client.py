import logging
import time
import urllib.parse
from typing import Any, Self

import dbt_common.exceptions
import requests

from dbt.adapters.fabric.base_credentials import BaseFabricCredentials
from dbt.adapters.fabric.fabric_token_provider import FabricTokenProvider

logger = logging.getLogger(__name__)


class FabricApiError(dbt_common.exceptions.DbtRuntimeError):
    def __init__(self, method: str, url: str, status_code: int, response_text: str) -> None:
        self.status_code = status_code
        super().__init__(
            f"{method} request to {url} failed with status code {status_code}: {response_text}"
        )


class FabricApiClient:
    _LIVY_API_VERSION = "2023-12-01"
    _WAREHOUSE_SNAPSHOT_TIMEOUT_SECONDS = 60 * 30  # 30 minutes
    _instance: Self | None = None

    def __init__(
        self, credentials: BaseFabricCredentials, token_provider: FabricTokenProvider
    ) -> None:
        self._credentials = credentials
        self._token_provider = token_provider
        self._warehouse_connection_string: str | None = None
        self._lakehouse_id: str | None = None
        self._warehouse_id: str | None = None
        self._workspace_id: str | None = None
        self._cached_warehouses: list[dict] | None = None
        self._cached_lakehouses: list[dict] | None = None
        self._warehouse_snapshot_operations: dict[str, str] = {}

    @classmethod
    def create(
        cls, credentials: BaseFabricCredentials, token_provider: FabricTokenProvider
    ) -> Self:
        """Return a shared singleton instance, creating one on first call.

        Args:
            credentials: Fabric connection credentials.
            token_provider: Provider for Azure access tokens.
        """
        if cls._instance is None:
            cls._instance = FabricApiClient(credentials, token_provider)
        return cls._instance

    def _get_auth_headers(self) -> dict[str, str]:
        token = self._token_provider.get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

    def _api_request(
        self, url: str, method: str = "get", body: dict | None = None
    ) -> requests.Response:
        """Send an authenticated HTTP request, retrying automatically on 429.

        Args:
            url: The full API URL.
            method: HTTP method (get, post, patch, delete).
            body: Optional JSON body for the request.

        Raises:
            DbtRuntimeError: If the response status code is not 2xx.
        """
        response = requests.request(method, url, json=body, headers=self._get_auth_headers())

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 5))
            time.sleep(retry_after)
            return self._api_request(url, method, body)

        if not (200 <= response.status_code < 300):
            raise FabricApiError(method, url, response.status_code, response.text)
        return response

    def _api_get(self, url: str) -> requests.Response:
        return self._api_request(url, method="get")

    def _api_post(self, url: str, body: dict) -> requests.Response:
        return self._api_request(url, method="post", body=body)

    def _api_patch(self, url: str, body: dict) -> requests.Response:
        return self._api_request(url, method="patch", body=body)

    def _api_delete(self, url: str) -> requests.Response:
        return self._api_request(url, method="delete")

    def get_workspace_id(self) -> str:
        """Resolve the Fabric workspace ID from config or by looking up the workspace name.

        Uses the cached value if available, then falls back to ``workspace_id``
        from credentials, and finally queries the Power BI API by ``workspace_name``.

        Raises:
            DbtConfigError: If neither workspace_id nor workspace_name is configured.
            DbtRuntimeError: If no workspace matches the configured name.
        """
        if self._workspace_id is not None:
            return self._workspace_id
        if self._credentials.workspace_id:
            return self._credentials.workspace_id
        if not self._credentials.workspace_name:
            raise dbt_common.exceptions.DbtConfigError(
                "Either workspace_id or workspace_name must be provided."
            )

        query_param = f"name eq '{self._credentials.workspace_name}'"
        query_param_encoded = urllib.parse.quote_plus(query_param)
        response = self._api_get(
            f"{self._credentials.powerbi_base_api_uri}/myorg/groups?$filter={query_param_encoded}"
        )
        workspaces = response.json().get("value", [])

        if len(workspaces) == 0:
            raise dbt_common.exceptions.DbtRuntimeError(
                f"No workspace found with name {self._credentials.workspace_name}"
            )

        self._workspace_id = workspaces[0]["id"]
        assert self._workspace_id is not None
        return self._workspace_id

    def get_warehouses(self, fetch_all: bool = True) -> list[dict]:
        """List all Data Warehouses in the workspace, with pagination and caching.

        Args:
            fetch_all: If True, follow pagination and cache the full result.
                If False, return only the first page without caching.
        """
        if self._cached_warehouses is not None:
            return self._cached_warehouses

        workspace_id = self.get_workspace_id()

        url = f"{self._credentials.fabric_base_api_uri}/workspaces/{workspace_id}/warehouses"
        warehouses = []

        while url is not None:
            response = self._api_get(url)
            warehouses = warehouses + response.json().get("value", [])
            url = response.json().get("continuationUri", None) if fetch_all else None

        if fetch_all:
            self._cached_warehouses = warehouses
        return warehouses

    def get_lakehouses(self, fetch_all: bool = True) -> list[dict]:
        """List all Lakehouses in the workspace, with pagination and caching.

        Args:
            fetch_all: If True, follow pagination and cache the full result.
                If False, return only the first page without caching.
        """
        if self._cached_lakehouses is not None:
            return self._cached_lakehouses

        workspace_id = self.get_workspace_id()

        url = f"{self._credentials.fabric_base_api_uri}/workspaces/{workspace_id}/lakehouses"
        lakehouses = []

        while url is not None:
            response = self._api_get(url)
            lakehouses = lakehouses + response.json().get("value", [])
            url = response.json().get("continuationUri", None) if fetch_all else None

        if fetch_all:
            self._cached_lakehouses = lakehouses
        return lakehouses

    def get_warehouse_connection_string(self) -> str:
        """Return the SQL endpoint connection string from any warehouse or lakehouse.

        All items in a workspace share the same connection string, so the first
        warehouse or lakehouse found is used.

        Raises:
            DbtRuntimeError: If no warehouses or lakehouses exist in the workspace.
        """
        if self._warehouse_connection_string is not None:
            return self._warehouse_connection_string

        # first we try to find it in any warehouse (they all have the same connection string)
        warehouses = self.get_warehouses(fetch_all=False)
        if len(warehouses) > 0:
            self._warehouse_connection_string = warehouses[0]["properties"]["connectionString"]
            assert self._warehouse_connection_string is not None
            return self._warehouse_connection_string

        # then we try to find it in any lakehouse (also have the same connection string)
        lakehouses = self.get_lakehouses(fetch_all=False)
        if len(lakehouses) > 0:
            self._warehouse_connection_string = lakehouses[0]["properties"][
                "sqlEndpointProperties"
            ]["connectionString"]
            assert self._warehouse_connection_string is not None
            return self._warehouse_connection_string

        raise dbt_common.exceptions.DbtRuntimeError(
            "No Data Warehouses or Lakehouses found in workspace"
        )

    def get_lakehouse_id(self) -> str:
        """Resolve the Lakehouse ID by matching the configured lakehouse name.

        Raises:
            DbtConfigError: If no lakehouse name is configured.
            DbtRuntimeError: If no lakehouse matches the configured name.
        """
        if self._lakehouse_id is not None:
            return self._lakehouse_id
        if not self._credentials.lakehouse_name:
            raise dbt_common.exceptions.DbtConfigError("lakehouse must be provided.")

        for lakehouse in self.get_lakehouses():
            if lakehouse["displayName"].lower() == self._credentials.lakehouse_name.lower():
                self._lakehouse_id = lakehouse["id"]
                assert self._lakehouse_id is not None
                return self._lakehouse_id

        raise dbt_common.exceptions.DbtRuntimeError(
            f"No Lakehouse found with name {self._credentials.lakehouse_name}"
        )

    def get_warehouse_id(self) -> str:
        """Resolve the Data Warehouse ID by matching the configured database name.

        Raises:
            DbtRuntimeError: If no warehouse matches the configured database name.
        """
        if self._warehouse_id is not None:
            return self._warehouse_id

        for warehouse in self.get_warehouses():
            if warehouse["displayName"].lower() == self._credentials.database.lower():
                self._warehouse_id = warehouse["id"]
                assert self._warehouse_id is not None
                return self._warehouse_id

        raise dbt_common.exceptions.DbtRuntimeError(
            f"No Data Warehouse found with name {self._credentials.database}"
        )

    def get_warehouse_snapshots(self) -> list[dict]:
        """List all warehouse snapshots belonging to the current Data Warehouse."""
        warehouse_id = self.get_warehouse_id()
        workspace_id = self.get_workspace_id()

        url = (
            f"{self._credentials.fabric_base_api_uri}/workspaces/{workspace_id}/warehouseSnapshots"
        )
        snapshots = []

        while url is not None:
            response = self._api_get(url)
            for snapshot in response.json().get("value", []):
                parent_warehouse_id = snapshot.get("properties", {}).get("parentWarehouseId")
                if parent_warehouse_id == warehouse_id:
                    snapshots.append(snapshot)

            url = response.json().get("continuationUri", None)

        return snapshots

    def create_warehouse_snapshot(
        self, snapshot_name: str, description: str | None = None
    ) -> None:
        """Create a new warehouse snapshot and track its long-running operation.

        If the API returns a 202 with a Location header, the operation URI is
        stored so ``create_or_update_warehouse_snapshot`` can poll for completion.

        Args:
            snapshot_name: Display name for the new snapshot.
            description: Optional description for the snapshot.
        """
        ws_id = self.get_workspace_id()
        url = f"{self._credentials.fabric_base_api_uri}/workspaces/{ws_id}/warehouseSnapshots"
        body = {
            "displayName": snapshot_name,
            "creationPayload": {"parentWarehouseId": self.get_warehouse_id()},
        }
        if description is not None:
            body["description"] = description

        response = self._api_post(
            url,
            body,
        )

        location_uri = response.headers.get("Location")
        if location_uri is not None and response.status_code == 202:
            self._warehouse_snapshot_operations[snapshot_name] = location_uri

    def update_warehouse_snapshot(
        self, snapshot_id: str, snapshot_name: str, description: str | None = None
    ) -> None:
        """Update the description of an existing warehouse snapshot.

        Args:
            snapshot_id: The ID of the snapshot to update.
            snapshot_name: Display name (used to track the long-running operation).
            description: New description, or None to leave unchanged.
        """
        ws_id = self.get_workspace_id()
        url = (
            f"{self._credentials.fabric_base_api_uri}"
            f"/workspaces/{ws_id}/warehouseSnapshots/{snapshot_id}"
        )
        # Empty properties triggers a "snapshot now"; omitting it causes a bad request
        body: dict[str, Any] = {"properties": {}}
        if description is not None:
            body["description"] = description
        response = self._api_patch(url, body)

        # Spec documents 200, but in practice updates sometimes return 202 (LRO)
        location_uri = response.headers.get("Location")
        if location_uri is not None and response.status_code == 202:
            self._warehouse_snapshot_operations[snapshot_name] = location_uri

    def wait_and_get_snapshot_id_from_operation(self, operation_uri: str) -> str:
        """Poll a long-running operation until it completes and return the snapshot ID.

        Args:
            operation_uri: The Location URI returned by a snapshot create/update call.

        Raises:
            DbtRuntimeError: If the operation times out or fails.
        """
        timer = time.time()
        while True:
            if time.time() - timer > self._WAREHOUSE_SNAPSHOT_TIMEOUT_SECONDS:
                timeout = self._WAREHOUSE_SNAPSHOT_TIMEOUT_SECONDS
                raise dbt_common.exceptions.DbtRuntimeError(
                    f"Timed out waiting for Warehouse Snapshot operation "
                    f"to complete after {timeout} seconds."
                )

            response = self._api_get(operation_uri)
            operation_status = response.json().get("status", "Unknown")
            retry_sleep = int(response.headers.get("Retry-After", 5))

            if operation_status == "Succeeded":
                result_location = response.headers["Location"]
                result_response = self._api_get(result_location)
                return result_response.json()["id"]

            if operation_status not in ("NotStarted", "Running"):
                raise dbt_common.exceptions.DbtRuntimeError(
                    f"Warehouse Snapshot operation failed with status {operation_status}."
                )

            time.sleep(retry_sleep)

    def create_or_update_warehouse_snapshot(
        self, snapshot_name: str, description: str | None = None
    ) -> None:
        """Create a snapshot if none exists with this name, otherwise update it.

        If a previous create operation is still pending, waits for it to complete
        before deciding whether to update or create.

        Args:
            snapshot_name: Display name for the snapshot.
            description: Optional description for the snapshot.
        """
        existing_snapshot_id = None

        snapshot_operation_uri = self._warehouse_snapshot_operations.get(snapshot_name)
        if snapshot_operation_uri is not None:
            existing_snapshot_id = self.wait_and_get_snapshot_id_from_operation(
                snapshot_operation_uri
            )
        else:
            all_snapshots = self.get_warehouse_snapshots()
            for snapshot in all_snapshots:
                if snapshot["displayName"] == snapshot_name:
                    existing_snapshot_id = snapshot["id"]
                    break

        if existing_snapshot_id is not None:
            self.update_warehouse_snapshot(existing_snapshot_id, snapshot_name, description)
        else:
            self.create_warehouse_snapshot(snapshot_name, description)

    def delete_warehouse_snapshot(self, snapshot_name: str) -> None:
        """Delete a warehouse snapshot by its display name.

        Args:
            snapshot_name: Display name of the snapshot to delete.
        """
        for snapshot in self.get_warehouse_snapshots():
            if snapshot["displayName"] == snapshot_name:
                self._api_delete(
                    f"{self._credentials.fabric_base_api_uri}/workspaces/{self.get_workspace_id()}/warehouseSnapshots/{snapshot['id']}"
                )

    def get_livy_base_api_uri(self) -> str:
        """Build the Livy API base URI for the configured lakehouse."""
        workspace_id = self.get_workspace_id()
        lakehouse_id = self.get_lakehouse_id()
        return (
            f"{self._credentials.fabric_base_api_uri}/workspaces/{workspace_id}"
            f"/lakehouses/{lakehouse_id}/livyapi/versions/{self._LIVY_API_VERSION}"
        )

    def acquire_hc_session(self, session_tag: str) -> dict[str, Any]:
        """POST /highConcurrencySessions to acquire an HC session (= one REPL).

        Args:
            session_tag: Deterministic tag so Fabric packs all REPLs from
                the same process onto one underlying Livy session.

        Returns:
            The JSON response body containing at least ``id`` and ``state``.
        """
        url = self.get_livy_base_api_uri() + "/highConcurrencySessions"
        body: dict[str, Any] = {
            "sessionTag": session_tag,
            "name": self._credentials.livy_session_name,
        }
        response = self._api_post(url, body)
        return response.json()

    def get_hc_session(self, hc_id: str) -> dict[str, Any]:
        """Poll the state of an HC session.

        Returns:
            JSON with ``state``, and when idle also ``sessionId`` and ``replId``.
        """
        url = self.get_livy_base_api_uri() + f"/highConcurrencySessions/{hc_id}"
        response = self._api_get(url)
        return response.json()

    def submit_hc_sql_statement(self, livy_session_id: str, repl_id: str, code: str) -> int:
        """Submit a SQL statement via an HC REPL. Returns the statement ID."""
        url = (
            self.get_livy_base_api_uri()
            + f"/highConcurrencySessions/{livy_session_id}"
            + f"/repls/{repl_id}/statements"
        )
        response = self._api_post(url, {"code": code, "kind": "sql"})
        return response.json()["id"]

    def submit_hc_python_statement(self, livy_session_id: str, repl_id: str, code: str) -> int:
        """Submit a Python statement via an HC REPL. Returns the statement ID."""
        url = (
            self.get_livy_base_api_uri()
            + f"/highConcurrencySessions/{livy_session_id}"
            + f"/repls/{repl_id}/statements"
        )
        response = self._api_post(url, {"code": code, "kind": "pyspark"})
        return response.json()["id"]

    def get_hc_statement(
        self, livy_session_id: str, repl_id: str, statement_id: int
    ) -> dict[str, Any]:
        """Fetch the status and output of an HC REPL statement."""
        url = (
            self.get_livy_base_api_uri()
            + f"/highConcurrencySessions/{livy_session_id}"
            + f"/repls/{repl_id}/statements/{statement_id}"
        )
        response = self._api_get(url)
        return response.json()

    def cancel_hc_statement(self, livy_session_id: str, repl_id: str, statement_id: int) -> str:
        """Cancel a running HC REPL statement."""
        url = (
            self.get_livy_base_api_uri()
            + f"/highConcurrencySessions/{livy_session_id}"
            + f"/repls/{repl_id}/statements/{statement_id}/cancel"
        )
        response = self._api_post(url, {})
        return response.json()["msg"]

    def delete_hc_session(self, hc_id: str) -> None:
        """Release an HC session (REPL slot). Best-effort; ignores 404."""
        url = self.get_livy_base_api_uri() + f"/highConcurrencySessions/{hc_id}"
        try:
            self._api_delete(url)
        except FabricApiError as e:
            if e.status_code != 404:
                raise
