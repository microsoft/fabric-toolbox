import pytest

from dbt.artifacts.schemas.catalog import CatalogArtifact
from dbt.tests.util import run_dbt

SEED_CSV = """
id,name,amount,is_active,created_at
1,Alice,99.50,true,2024-01-15 10:30:00
2,Bob,150.75,false,2024-02-20 14:45:00
3,Charlie,200.00,true,2024-03-10 08:00:00
""".strip()

TABLE_MODEL = """
{{ config(materialized='table') }}

select
    cast(id as int) as id,
    cast(name as varchar(100)) as name,
    cast(amount as decimal(10, 2)) as amount,
    cast(is_active as bit) as is_active,
    cast(created_at as datetime2(6)) as created_at
from {{ ref('catalog_columns_seed') }}
"""

VIEW_MODEL = """
{{ config(materialized='view') }}

select
    id,
    name,
    amount
from {{ ref('catalog_columns_table') }}
"""


class TestCatalogColumnsPopulated:
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"catalog_columns_seed.csv": SEED_CSV}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "catalog_columns_table.sql": TABLE_MODEL,
            "catalog_columns_view.sql": VIEW_MODEL,
        }

    @pytest.fixture(scope="class")
    def catalog(self, project):
        run_dbt(["seed"])
        run_dbt(["run"])
        return run_dbt(["docs", "generate"])

    def test_seed_columns_present(self, catalog: CatalogArtifact):
        node = catalog.nodes["seed.test.catalog_columns_seed"]
        assert len(node.columns) > 0, "Seed should have columns in the catalog"
        column_names = {col.name.lower() for col in node.columns.values()}
        assert {"id", "name", "amount", "is_active", "created_at"} <= column_names

    def test_table_columns_present(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_table"]
        assert len(node.columns) > 0, "Table model should have columns in the catalog"
        column_names = {col.name.lower() for col in node.columns.values()}
        assert {"id", "name", "amount", "is_active", "created_at"} <= column_names

    def test_view_columns_present(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_view"]
        assert len(node.columns) > 0, "View model should have columns in the catalog"
        column_names = {col.name.lower() for col in node.columns.values()}
        assert {"id", "name", "amount"} <= column_names

    def test_table_column_types_not_empty(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_table"]
        for col_name, col in node.columns.items():
            assert col.type, f"Column '{col_name}' should have a non-empty type"
            assert col.name, f"Column at index {col.index} should have a non-empty name"

    def test_table_column_types_correct(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_table"]
        columns_by_name = {col.name.lower(): col for col in node.columns.values()}

        expected_types = {
            "id": "int",
            "name": "varchar",
            "amount": "decimal",
            "is_active": "bit",
            "created_at": "datetime2",
        }

        for col_name, expected_type in expected_types.items():
            actual_type = columns_by_name[col_name].type.lower()
            assert expected_type in actual_type, (
                f"Column '{col_name}': expected type containing '{expected_type}', got '{actual_type}'"
            )

    def test_view_column_types_correct(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_view"]
        columns_by_name = {col.name.lower(): col for col in node.columns.values()}

        expected_types = {
            "id": "int",
            "name": "varchar",
            "amount": "decimal",
        }

        for col_name, expected_type in expected_types.items():
            actual_type = columns_by_name[col_name].type.lower()
            assert expected_type in actual_type, (
                f"Column '{col_name}': expected type containing '{expected_type}', got '{actual_type}'"
            )

    def test_table_has_row_count_stat(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_table"]
        assert "row_count" in node.stats, "Table model should have row_count stat"
        stat = node.stats["row_count"]
        assert stat.label == "Row Count"
        assert stat.include is True
        assert isinstance(stat.value, (int, float))
        assert stat.value >= 0

    def test_seed_has_row_count_stat(self, catalog: CatalogArtifact):
        node = catalog.nodes["seed.test.catalog_columns_seed"]
        assert "row_count" in node.stats, "Seed should have row_count stat"
        stat = node.stats["row_count"]
        assert stat.include is True
        assert isinstance(stat.value, (int, float))
        assert stat.value >= 0

    def test_view_has_no_row_count_stat(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_view"]
        if "row_count" in node.stats:
            assert node.stats["row_count"].include is False

    def test_column_indexes_are_sequential(self, catalog: CatalogArtifact):
        node = catalog.nodes["model.test.catalog_columns_table"]
        indexes = sorted(col.index for col in node.columns.values())
        expected = list(range(indexes[0], indexes[0] + len(indexes)))
        assert indexes == expected, f"Column indexes should be sequential, got {indexes}"
