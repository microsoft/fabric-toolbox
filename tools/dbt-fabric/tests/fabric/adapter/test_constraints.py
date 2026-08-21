import pytest

from dbt.tests.adapter.constraints.fixtures import (
    foreign_key_model_sql,
    my_incremental_model_sql,
    my_model_incremental_wrong_name_sql,
    my_model_incremental_wrong_order_depends_on_fk_sql,
    my_model_incremental_wrong_order_sql,
    my_model_sql,
    my_model_view_wrong_name_sql,
    my_model_view_wrong_order_sql,
    my_model_wrong_name_sql,
    my_model_wrong_order_depends_on_fk_sql,
    my_model_wrong_order_sql,
)
from dbt.tests.adapter.constraints.test_constraints import (
    BaseConstraintsColumnsEqual,
    BaseConstraintsRollback,
    BaseConstraintsRuntimeDdlEnforcement,
    BaseModelConstraintsRuntimeEnforcement,
    _find_and_replace,
    _normalize_whitespace,
)
from dbt.tests.util import (
    read_file,
    run_dbt,
    write_file,
)

model_schema_yml = """
version: 2
models:
  - name: my_model
    config:
      contract:
        enforced: true
    constraints:
      - type: primary_key
        columns: [id]
        name: pk_my_model_pk
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: unique
          - type: check
            expression: (id > 0)
          - type: check
            expression: id >= 1
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
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
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
  - name: my_model_wrong_order
    config:
      contract:
        enforced: true
    constraints:
      - type: primary_key
        columns: [id]
        name: pk_my_model_pk
      - type: unique
        columns: [id]
        name: uk_my_model_pk
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: check
            expression: (id > 0)
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
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
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
"""

model_fk_constraint_schema_yml = """
version: 2
models:
  - name: my_model
    config:
      contract:
        enforced: true
    constraints:
      - type: primary_key
        columns: [id]
        name: pk_my_model_pk
      - type: foreign_key
        expression: {schema}.foreign_key_model (id)
        name: fk_my_model_id
        columns: [id]
      - type: unique
        name: uk_my_model_id
        columns: [id]
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
          - type: check
            expression: (id > 0)
          - type: check
            expression: id >= 1
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
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
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
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
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
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
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
  - name: foreign_key_model
    config:
      contract:
        enforced: true
    constraints:
      - type: primary_key
        columns: [id]
        name: pk_my_ref_model_id
      - type: unique
        name: uk_my_ref_model_id
        columns: [id]
    columns:
      - name: id
        data_type: int
        constraints:
          - type: not_null
"""

constrained_model_schema_yml = """
version: 2
models:
  - name: my_model
    config:
      contract:
        enforced: true
    constraints:
      - type: check
        expression: (id > 0)
      - type: check
        expression: id >= 1
      - type: primary_key
        columns: [ id ]
        name: strange_pk_requirement_my_model
      - type: unique
        columns: [ color, date_day ]
        name: strange_uniqueness_requirement_my_model
      - type: foreign_key
        columns: [ id ]
        expression: {schema}.foreign_key_model (id)
        name: strange_pk_fk_requirement_my_model
    columns:
      - name: id
        data_type: int
        description: hello
        constraints:
          - type: not_null
        tests:
          - unique
      - name: color
        data_type: varchar(100)
      - name: date_day
        data_type: varchar(100)
  - name: foreign_key_model
    config:
      contract:
        enforced: true
    constraints:
      - type: primary_key
        columns: [ id ]
        name: strange_pk_requirement_fk_my_model
      - type: unique
        columns: [ id ]
        name: fk_id_uniqueness_requirement
    columns:
      - name: id
        data_type: int
        constraints:
          - type: not_null
"""


class BaseConstraintsColumnsEqualFabric(BaseConstraintsColumnsEqual):
    @pytest.fixture
    def string_type(self):
        return "varchar"

    @pytest.fixture
    def int_type(self):
        return "int"

    @pytest.fixture
    def data_types(self, schema_int_type, int_type, string_type):
        # sql_column_value, schema_data_type, error_data_type
        return [
            ["1", schema_int_type, int_type],
            ["'1'", string_type, string_type],
            ["cast('2019-01-01' as date)", "date", "date"],
            ["cast(1 as bit)", "bit", "bit"],
            ["cast('2013-11-03 00:00:00.000000' as datetime2(6))", "datetime2(6)", "datetime2(6)"],
            ["cast(1 as decimal(5,2))", "decimal", "decimal"],
        ]


class TestViewConstraintsColumnsEqualFabric(BaseConstraintsColumnsEqualFabric):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model_wrong_order.sql": my_model_view_wrong_order_sql,
            "my_model_wrong_name.sql": my_model_view_wrong_name_sql,
            "constraints_schema.yml": model_schema_yml,
        }


class TestIncrementalConstraintsColumnsEqualFabric(BaseConstraintsColumnsEqualFabric):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model_wrong_order.sql": my_model_incremental_wrong_order_sql,
            "my_model_wrong_name.sql": my_model_incremental_wrong_name_sql,
            "constraints_schema.yml": model_schema_yml,
        }


class TestTableConstraintsColumnsEqualFabric(BaseConstraintsColumnsEqualFabric):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model_wrong_order.sql": my_model_wrong_order_sql,
            "my_model_wrong_name.sql": my_model_wrong_name_sql,
            "constraints_schema.yml": model_schema_yml,
        }


class TestTableConstraintsRuntimeDdlEnforcementFabric(BaseConstraintsRuntimeDdlEnforcement):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": model_fk_constraint_schema_yml,
        }

    @pytest.fixture(scope="class")
    def expected_sql(self):
        return """
create table <model_identifier>(id int not null,color varchar(100),date_day varchar(100))exec('create view <model_identifier> as -- depends_on: <foreign_key_model_identifier> select ''blue'' as color,1 as id,''2019-01-01'' as date_day;'); insert into <model_identifier>([id],[color],[date_day])select [id],[color],[date_day] from <model_identifier>
"""

    def test__constraints_ddl(self, project, expected_sql):
        unformatted_constraint_schema_yml = read_file("models", "constraints_schema.yml")
        write_file(
            unformatted_constraint_schema_yml.format(schema=project.test_schema),
            "models",
            "constraints_schema.yml",
        )

        results = run_dbt(["run", "-s", "+my_model"])
        assert len(results) >= 1

        # TODO: consider refactoring this to introspect logs instead
        generated_sql = read_file("target", "run", "test", "models", "my_model.sql")
        generated_sql_generic = _find_and_replace(generated_sql, "my_model", "<model_identifier>")
        generated_sql_generic = _find_and_replace(
            generated_sql_generic, "foreign_key_model", "<foreign_key_model_identifier>"
        )
        generated_sql_wodb = generated_sql_generic.replace("USE [" + project.database + "];", "")
        generated_sql_option_cluase = generated_sql_wodb.replace(
            "OPTION (LABEL = 'dbt-fabric');", ""
        )
        assert _normalize_whitespace(expected_sql.strip()) == _normalize_whitespace(
            generated_sql_option_cluase.strip()
        )


class TestIncrementalConstraintsRuntimeDdlEnforcementFabric(
    TestTableConstraintsRuntimeDdlEnforcementFabric
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_incremental_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": model_fk_constraint_schema_yml,
        }


class TestModelConstraintsRuntimeEnforcementFabric(BaseModelConstraintsRuntimeEnforcement):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_wrong_order_depends_on_fk_sql,
            "foreign_key_model.sql": foreign_key_model_sql,
            "constraints_schema.yml": constrained_model_schema_yml,
        }

    @pytest.fixture(scope="class")
    def expected_sql(self):
        return """
create table <model_identifier>(id int not null,color varchar(100),date_day varchar(100))exec('create view <model_identifier> as -- depends_on: <foreign_key_model_identifier> select ''blue'' as color,1 as id,''2019-01-01'' as date_day;'); insert into <model_identifier>([id],[color],[date_day])select [id],[color],[date_day] from <model_identifier>
"""

    def test__model_constraints_ddl(self, project, expected_sql):
        unformatted_constraint_schema_yml = read_file("models", "constraints_schema.yml")
        write_file(
            unformatted_constraint_schema_yml.format(schema=project.test_schema),
            "models",
            "constraints_schema.yml",
        )

        results = run_dbt(["run", "-s", "+my_model"])
        assert len(results) >= 1
        generated_sql = read_file("target", "run", "test", "models", "my_model.sql")

        generated_sql_generic = _find_and_replace(generated_sql, "my_model", "<model_identifier>")
        generated_sql_generic = _find_and_replace(
            generated_sql_generic, "foreign_key_model", "<foreign_key_model_identifier>"
        )
        generated_sql_wodb = generated_sql_generic.replace("USE [" + project.database + "];", "")
        generated_sql_option_cluase = generated_sql_wodb.replace(
            "OPTION (LABEL = 'dbt-fabric');", ""
        )
        assert _normalize_whitespace(expected_sql.strip()) == _normalize_whitespace(
            generated_sql_option_cluase.strip()
        )


class TestTableConstraintsRollbackFabric(BaseConstraintsRollback):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_sql,
            "constraints_schema.yml": model_schema_yml,
        }

    @pytest.fixture(scope="class")
    def expected_error_messages(self):
        return [
            "Cannot insert the value NULL into column",
            "column does not allow nulls",
            "INSERT fails",
        ]


class TestIncrementalConstraintsRollbackFabric(TestTableConstraintsRollbackFabric):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_incremental_model_sql,
            "constraints_schema.yml": model_schema_yml,
        }
