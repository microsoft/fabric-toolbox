import pytest

from dbt.tests.adapter.constraints.fixtures import (
    constrained_model_schema_yml,
    foreign_key_model_sql,
    model_fk_constraint_schema_yml,
    my_model_incremental_wrong_name_sql,
    my_model_incremental_wrong_order_depends_on_fk_sql,
    my_model_incremental_wrong_order_sql,
    my_model_wrong_name_sql,
    my_model_wrong_order_depends_on_fk_sql,
    my_model_wrong_order_sql,
)
from dbt.tests.adapter.constraints.test_constraints import (
    BaseConstraintsRollback,
    BaseConstraintsRuntimeDdlEnforcement,
    BaseIncrementalConstraintsColumnsEqual,
    BaseIncrementalConstraintsRollback,
    BaseIncrementalConstraintsRuntimeDdlEnforcement,
    BaseModelConstraintsRuntimeEnforcement,
    BaseTableConstraintsColumnsEqual,
)

spark_model_schema_yml = """
version: 2
models:
  - name: my_model
    config:
      contract:
        enforced: true
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: primary_key
          - type: check
            expression: (id > 0)
          - type: check
            expression: id >= 1
        data_tests:
          - unique
      - name: color
        data_type: string
      - name: date_day
        data_type: string
  - name: my_model_error
    config:
      contract:
        enforced: true
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: primary_key
          - type: check
            expression: (id > 0)
        data_tests:
          - unique
      - name: color
        data_type: string
      - name: date_day
        data_type: string
  - name: my_model_wrong_order
    config:
      contract:
        enforced: true
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: primary_key
          - type: check
            expression: (id > 0)
        data_tests:
          - unique
      - name: color
        data_type: string
      - name: date_day
        data_type: string
  - name: my_model_wrong_name
    config:
      contract:
        enforced: true
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: primary_key
          - type: check
            expression: (id > 0)
        data_tests:
          - unique
      - name: color
        data_type: string
      - name: date_day
        data_type: string
"""

fabricspark_model_fk_constraint_schema_yml = model_fk_constraint_schema_yml.replace(
    "text", "string"
).replace("primary key", "")
fabricspark_model_constraints_yml = constrained_model_schema_yml.replace("text", "string")

_expected_sql_fabricspark = """
create or replace table <model_identifier>
    using delta
    as
select
  id,
  color,
  date_day
from

(
    -- depends_on: <foreign_key_model_identifier>
    select
    'blue' as color,
    1 as id,
    '2019-01-01' as date_day ) as model_subq
"""


class FabricSparkConstraintsTypesMixin:
    @pytest.fixture
    def string_type(self):
        return "string"

    @pytest.fixture
    def int_type(self):
        return "INT"

    @pytest.fixture
    def schema_string_type(self, string_type):
        return string_type

    @pytest.fixture
    def schema_int_type(self, int_type):
        return int_type

    @pytest.fixture
    def data_types(self, schema_int_type, int_type, string_type):
        return [
            ["1", schema_int_type, int_type],
            ["'1'", string_type, string_type],
            ["true", "boolean", "BOOLEAN"],
            ["cast('2013-11-03 00:00:00' as timestamp)", "timestamp", "TIMESTAMP"],
            ["cast(1.0 as decimal(10,2))", "decimal(10,2)", "DECIMAL(10,2)"],
        ]


class TestTableConstraintsColumnsEqualFabricSpark(
    FabricSparkConstraintsTypesMixin, BaseTableConstraintsColumnsEqual
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model_wrong_order.sql": my_model_wrong_order_sql,
            "my_model_wrong_name.sql": my_model_wrong_name_sql,
            "constraints_schema.yml": spark_model_schema_yml,
        }

    @pytest.mark.skip("Delta Lake does not support NOT NULL constraints in CTAS")
    def test__constraints_wrong_column_order(self, project):
        pass

    @pytest.mark.skip(
        "Delta Lake does not support NOT NULL constraints in CTAS,"
        " preventing data type mismatch detection"
    )
    def test__constraints_wrong_column_data_types(
        self, project, string_type, int_type, schema_string_type, schema_int_type, data_types
    ):
        pass


class TestIncrementalConstraintsColumnsEqualFabricSpark(
    FabricSparkConstraintsTypesMixin, BaseIncrementalConstraintsColumnsEqual
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model_wrong_order.sql": my_model_incremental_wrong_order_sql,
            "my_model_wrong_name.sql": my_model_incremental_wrong_name_sql,
            "constraints_schema.yml": spark_model_schema_yml,
        }

    @pytest.mark.skip("Delta Lake does not support NOT NULL constraints in CTAS")
    def test__constraints_wrong_column_order(self, project):
        pass

    @pytest.mark.skip(
        "Delta Lake does not support NOT NULL constraints in CTAS,"
        " preventing data type mismatch detection"
    )
    def test__constraints_wrong_column_data_types(
        self, project, string_type, int_type, schema_string_type, schema_int_type, data_types
    ):
        pass


class FabricSparkConstraintsDdlEnforcementSetup:
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "models": {
                "+file_format": "delta",
            }
        }

    @pytest.fixture(scope="class")
    def expected_sql(self):
        return _expected_sql_fabricspark


class TestTableConstraintsRuntimeDdlEnforcementFabricSpark(
    FabricSparkConstraintsDdlEnforcementSetup, BaseConstraintsRuntimeDdlEnforcement
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": fabricspark_model_fk_constraint_schema_yml,
        }


class TestIncrementalConstraintsRuntimeDdlEnforcementFabricSpark(
    FabricSparkConstraintsDdlEnforcementSetup, BaseIncrementalConstraintsRuntimeDdlEnforcement
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_incremental_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": fabricspark_model_fk_constraint_schema_yml,
        }


class TestModelConstraintsRuntimeEnforcementFabricSpark(
    FabricSparkConstraintsDdlEnforcementSetup, BaseModelConstraintsRuntimeEnforcement
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": fabricspark_model_constraints_yml,
        }


@pytest.mark.skip(
    "Fabric Lakehouse does not support ALTER TABLE CHANGE COLUMN SET NOT NULL on Delta tables,"
    " so constraint violations are not triggered for null data"
)
class TestTableConstraintsRollbackFabricSpark(BaseConstraintsRollback):
    pass


@pytest.mark.skip(
    "Fabric Lakehouse does not support ALTER TABLE CHANGE COLUMN SET NOT NULL on Delta tables,"
    " so constraint violations are not triggered for null data"
)
class TestIncrementalConstraintsRollbackFabricSpark(BaseIncrementalConstraintsRollback):
    pass
