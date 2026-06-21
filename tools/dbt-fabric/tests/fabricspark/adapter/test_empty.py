import pytest

from dbt.tests.adapter.empty import _models
from dbt.tests.adapter.empty.test_empty import (
    BaseTestEmpty,
    BaseTestEmptyInlineSourceRef,
    MetadataWithEmptyFlag,
)


class TestFabricSparkEmpty(BaseTestEmpty):
    pass


class TestFabricSparkEmptyInlineSourceRef(BaseTestEmptyInlineSourceRef):
    pass


ALTER_RELATION_ADD_COLUMNS_ONLY = """
{{ config(materialized="table") }}
{% set my_seed = adapter.Relation.create(this.database, this.schema, "my_seed", "table") %}
{% set my_column = api.Column("my_column", "string") %}
{% do alter_relation_add_remove_columns(my_seed, [my_column], none) %}
select * from {{ ref("my_seed") }}
"""

GET_COLUMNS_IN_RELATION_SPARK = """
{{ config(materialized="table") }}
{% set my_seed = adapter.Relation.create(this.database, this.schema, "my_seed", "table") %}
{% set columns = adapter.get_columns_in_relation(my_seed) %}
select * from {{ ref("my_seed") }}
"""

ALTER_COLUMN_TYPE_SPARK = """
{{ config(materialized="table") }}
{% set my_seed = adapter.Relation.create(this.database, this.schema, "my_seed", "table") %}
{{ alter_column_type(my_seed, "MY_VALUE", "string") }}
select * from {{ ref("my_seed") }}
"""


class TestMetadataWithEmptyFlagFabricSpark(MetadataWithEmptyFlag):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "schema.yml": _models.SCHEMA,
            "control.sql": _models.CONTROL,
            "get_columns_in_relation.sql": GET_COLUMNS_IN_RELATION_SPARK,
            "alter_column_type.sql": ALTER_COLUMN_TYPE_SPARK,
            "alter_relation_comment.sql": _models.ALTER_RELATION_COMMENT,
            "alter_column_comment.sql": _models.ALTER_COLUMN_COMMENT,
            "alter_relation_add_remove_columns.sql": ALTER_RELATION_ADD_COLUMNS_ONLY,
            "truncate_relation.sql": _models.TRUNCATE_RELATION,
        }
