import pytest

from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.tests.util import run_dbt


class TestWarehouseSnapshots:
    @pytest.fixture(scope="class")
    def snapshot_name(self, unique_schema: str):
        return f"{unique_schema}_snapshot"

    @pytest.fixture(scope="class")
    def models(self):
        return {"simple.sql": "select 1 as id"}

    @pytest.fixture(scope="class")
    def snapshot_description(self) -> str:
        return "A snapshot of the warehouse state during an automated test run."

    @pytest.fixture(scope="class")
    def project_config_update(self, snapshot_name: str, snapshot_description: str):
        return {
            "on-run-start": [
                f"{{{{ create_or_update_fabric_warehouse_snapshot('{snapshot_name}', '{snapshot_description}') }}}}"
            ],
            "on-run-end": [
                f"{{{{ create_or_update_fabric_warehouse_snapshot('{snapshot_name}', '{snapshot_description}') }}}}"
            ],
        }

    @pytest.fixture(autouse=True)
    def clean_up(self, fabric_api_client: FabricApiClient, snapshot_name: str):
        fabric_api_client.delete_warehouse_snapshot(snapshot_name)
        yield
        fabric_api_client.delete_warehouse_snapshot(snapshot_name)

    def test_warehouse_snapshots(
        self,
        project,
        fabric_api_client: FabricApiClient,
        snapshot_name: str,
        snapshot_description: str,
    ):
        results = run_dbt(["run"])
        assert len(results) == 3
        all_snapshots = fabric_api_client.get_warehouse_snapshots()
        assert any(
            snapshot["displayName"] == snapshot_name
            and snapshot["description"] == snapshot_description
            for snapshot in all_snapshots
        )
