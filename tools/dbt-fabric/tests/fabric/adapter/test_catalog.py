# TODO: repoint to dbt-artifacts when it is available
import pytest

from dbt.artifacts.schemas.catalog import CatalogArtifact
from dbt.tests.adapter.catalog import files
from dbt.tests.adapter.catalog.relation_types import CatalogRelationTypes
from dbt.tests.adapter.catalog_integrations.test_catalog_integration import (
    BaseCatalogIntegrationValidation,
)


class TestCatalogRelationTypes(CatalogRelationTypes):
    @pytest.fixture(scope="class")
    def models(self):
        yield {
            "my_table.sql": files.MY_TABLE,
            "my_view.sql": files.MY_VIEW,
        }

    @pytest.mark.parametrize(
        "node_name,relation_type",
        [
            ("seed.test.my_seed", "BASE TABLE"),
            ("model.test.my_table", "BASE TABLE"),
            ("model.test.my_view", "VIEW"),
        ],
    )
    def test_relation_types_populate_correctly(
        self, docs: CatalogArtifact, node_name: str, relation_type: str
    ):
        super().test_relation_types_populate_correctly(docs, node_name, relation_type)


class TestCatalogIntegrationValidationFabric(BaseCatalogIntegrationValidation):
    pass
