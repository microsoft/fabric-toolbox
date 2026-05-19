import pytest

from dbt.tests.adapter.empty import _models
from dbt.tests.adapter.empty._models import schema_sources_yml
from dbt.tests.adapter.empty.test_empty import (
    BaseTestEmpty,
    BaseTestEmptyInlineSourceRef,
    MetadataWithEmptyFlag,
)


class TestFabricEmpty(BaseTestEmpty):
    pass


class TestFabricEmptyInlineSourceRef(BaseTestEmptyInlineSourceRef):
    model_inline_sql = """
        select * from {{ source('seed_sources', 'raw_source') }} as raw_source
        """

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "model.sql": "select * from {{ source('seed_sources', 'raw_source') }}",
            "sources.yml": schema_sources_yml,
        }


class TestMetadataWithEmptyFlagFabric(MetadataWithEmptyFlag):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "schema.yml": _models.SCHEMA,
            "control.sql": _models.CONTROL,
            "get_columns_in_relation.sql": _models.GET_COLUMNS_IN_RELATION,
            "alter_relation_comment.sql": _models.ALTER_RELATION_COMMENT,
            "alter_column_comment.sql": _models.ALTER_COLUMN_COMMENT,
            "alter_relation_add_remove_columns.sql": _models.ALTER_RELATION_ADD_REMOVE_COLUMNS,
            "truncate_relation.sql": _models.TRUNCATE_RELATION,
        }
