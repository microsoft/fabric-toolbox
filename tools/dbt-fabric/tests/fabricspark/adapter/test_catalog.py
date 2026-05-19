import pytest

from dbt.artifacts.schemas.catalog import CatalogArtifact
from dbt.tests.adapter.catalog.relation_types import CatalogRelationTypes
from dbt.tests.adapter.catalog_integrations.test_catalog_integration import (
    BaseCatalogIntegrationValidation,
)


class TestCatalogRelationTypesFabricSpark(CatalogRelationTypes):
    @pytest.mark.parametrize(
        "node_name,relation_type",
        [
            ("seed.test.my_seed", "table"),
            ("model.test.my_table", "table"),
            ("model.test.my_view", "view"),
            ("model.test.my_materialized_view", "materialized_view"),
        ],
    )
    def test_relation_types_populate_correctly(
        self, docs: CatalogArtifact, node_name: str, relation_type: str
    ):
        super().test_relation_types_populate_correctly(docs, node_name, relation_type)


class TestCatalogIntegrationValidationFabricSpark(BaseCatalogIntegrationValidation):
    pass
