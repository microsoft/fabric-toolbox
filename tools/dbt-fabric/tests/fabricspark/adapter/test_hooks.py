import os
from pathlib import Path

import pytest

from dbt.tests.adapter.hooks.test_model_hooks import (
    MODEL_POST_HOOK,
    MODEL_PRE_HOOK,
    BaseDuplicateHooksInConfigs,
    BaseHookRefs,
    BaseHooksRefsOnSeeds,
    BasePrePostModelHooks,
    BasePrePostModelHooksInConfig,
    BasePrePostModelHooksInConfigKwargs,
    BasePrePostModelHooksInConfigWithCount,
    BasePrePostModelHooksOnSeeds,
    BasePrePostModelHooksOnSeedsPlusPrefixed,
    BasePrePostModelHooksOnSeedsPlusPrefixedWhitespace,
    BasePrePostModelHooksOnSnapshots,
    BasePrePostSnapshotHooksInConfigKwargs,
)
from dbt.tests.adapter.hooks.test_run_hooks import BaseAfterRunHooks, BasePrePostRunHooks
from dbt.tests.fixtures.project import TestProjInfo
from dbt.tests.util import write_file

SPARK_SNAPSHOT = """
{% snapshot example_snapshot %}
{{
    config(target_schema=schema, unique_key='a', strategy='check', check_cols='all',
           file_format='delta')
}}
select * from {{ ref('example_seed') }}
{% endsnapshot %}
"""


class SparkRunModelFile:
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project: TestProjInfo):
        project.run_sql("DROP TABLE IF EXISTS {schema}.on_model_hook")
        project.run_sql("""
CREATE TABLE {schema}.on_model_hook (
    test_state       STRING,
    target_dbname    STRING,
    target_host      STRING,
    target_name      STRING,
    target_schema    STRING,
    target_type      STRING,
    target_user      STRING,
    target_pass      STRING,
    target_threads   INT,
    run_started_at   STRING,
    invocation_id    STRING,
    thread_id        STRING
)
""")


class SparkHooksChecks:
    def get_ctx_vars(self, state, count, project):
        fields = [
            "test_state",
            "target_dbname",
            "target_host",
            "target_name",
            "target_schema",
            "target_threads",
            "target_type",
            "target_user",
            "target_pass",
            "run_started_at",
            "invocation_id",
            "thread_id",
        ]
        field_list = ", ".join([f"`{f}`" for f in fields])
        query = (
            f"select {field_list} from {project.test_schema}.on_model_hook"
            f" where test_state = '{state}'"
        )

        vals = project.run_sql(query, fetch="all")
        assert len(vals) != 0, "nothing inserted into hooks table"
        assert len(vals) >= count, "too few rows in hooks table"
        assert len(vals) <= count, "too many rows in hooks table"
        return [dict(zip(fields, val, strict=False)) for val in vals]

    def check_hooks(self, state, project, host, count=1):
        ctxs = self.get_ctx_vars(state, count=count, project=project)
        for ctx in ctxs:
            assert ctx["test_state"] == state
            assert ctx["target_name"] == "default"
            assert ctx["target_schema"] == project.test_schema
            assert ctx["target_type"] == "fabricspark"

            assert ctx["run_started_at"] is not None and len(ctx["run_started_at"]) > 0, (
                "run_started_at was not set"
            )
            assert ctx["invocation_id"] is not None and len(ctx["invocation_id"]) > 0, (
                "invocation_id was not set"
            )
            assert ctx["thread_id"].startswith("Thread-")


class SparkPrePostHooksFixtures:
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "models": {
                "test": {
                    "pre-hook": [
                        MODEL_PRE_HOOK,
                        "SELECT * FROM {{ this.schema }}.on_model_hook WHERE 1=0",
                    ],
                    "post-hook": [
                        "SELECT * FROM {{ this.schema }}.on_model_hook WHERE 1=0",
                        MODEL_POST_HOOK,
                    ],
                }
            }
        }


class TestDuplicateHooksInConfigsFabricSpark(BaseDuplicateHooksInConfigs):
    pass


class TestHookRefsFabricSpark(SparkRunModelFile, SparkHooksChecks, BaseHookRefs):
    pass


class TestHooksRefsOnSeedsFabricSpark(BaseHooksRefsOnSeeds):
    pass


class TestPrePostModelHooksInConfigFabricSpark(
    SparkRunModelFile, SparkHooksChecks, BasePrePostModelHooksInConfig
):
    pass


class TestPrePostModelHooksInConfigKwargsFabricSpark(
    SparkRunModelFile, SparkHooksChecks, BasePrePostModelHooksInConfigKwargs
):
    pass


class TestPrePostModelHooksOnSeedsFabricSpark(BasePrePostModelHooksOnSeeds):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "post-hook": [
                    "ALTER TABLE {{ this }} ADD COLUMN new_col INT",
                    "UPDATE {{ this }} SET new_col = 1",
                    "SELECT CAST(NULL AS {{ dbt.type_int() }}) AS id",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSeedsPlusPrefixedFabricSpark(
    BasePrePostModelHooksOnSeedsPlusPrefixed
):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "+post-hook": [
                    "ALTER TABLE {{ this }} ADD COLUMN new_col INT",
                    "UPDATE {{ this }} SET new_col = 1",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSeedsPlusPrefixedWhitespaceFabricSpark(
    BasePrePostModelHooksOnSeedsPlusPrefixedWhitespace,
):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "+post-hook": [
                    "ALTER TABLE {{ this }} ADD COLUMN new_col INT",
                    "UPDATE {{ this }} SET new_col = 1",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSnapshotsFabricSpark(BasePrePostModelHooksOnSnapshots):
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        path = Path(project.project_root) / "test-snapshots"
        Path.mkdir(path, exist_ok=True)
        write_file(SPARK_SNAPSHOT, path, "snapshot.sql")

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "snapshot-paths": ["test-snapshots"],
            "models": {},
            "snapshots": {
                "post-hook": [
                    "ALTER TABLE {{ this }} ADD COLUMN new_col INT",
                    "UPDATE {{ this }} SET new_col = 1",
                ]
            },
            "seeds": {
                "quote_columns": False,
            },
        }


class TestPrePostSnapshotHooksInConfigKwargsFabricSpark(BasePrePostSnapshotHooksInConfigKwargs):
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project):
        path = Path(project.project_root) / "test-kwargs-snapshots"
        Path.mkdir(path, exist_ok=True)
        write_file(SPARK_SNAPSHOT, path, "snapshot.sql")

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "snapshot-paths": ["test-kwargs-snapshots"],
            "models": {},
            "snapshots": {
                "post-hook": [
                    "ALTER TABLE {{ this }} ADD COLUMN new_col INT",
                    "UPDATE {{ this }} SET new_col = 1",
                ]
            },
            "seeds": {
                "quote_columns": False,
            },
        }


class TestAfterRunHooksFabricSpark(BaseAfterRunHooks):
    pass


class TestPrePostModelHooksFabricSpark(
    SparkRunModelFile, SparkHooksChecks, SparkPrePostHooksFixtures, BasePrePostModelHooks
):
    pass


class TestPrePostModelHooksInConfigWithCountFabricSpark(
    SparkRunModelFile,
    SparkHooksChecks,
    SparkPrePostHooksFixtures,
    BasePrePostModelHooksInConfigWithCount,
):
    pass


class TestPrePostRunHooksFabricSpark(BasePrePostRunHooks):
    @pytest.fixture(scope="function")
    def setUp(self, project):
        project.run_sql(f"DROP TABLE IF EXISTS {project.test_schema}.on_run_hook")
        project.run_sql(f"""
CREATE TABLE {project.test_schema}.on_run_hook (
    test_state       STRING,
    target_dbname    STRING,
    target_host      STRING,
    target_name      STRING,
    target_schema    STRING,
    target_type      STRING,
    target_user      STRING,
    target_pass      STRING,
    target_threads   INT,
    run_started_at   STRING,
    invocation_id    STRING,
    thread_id        STRING
)""")
        project.run_sql(f"DROP TABLE IF EXISTS {project.test_schema}.schemas")
        project.run_sql(f"DROP TABLE IF EXISTS {project.test_schema}.db_schemas")
        old_value = os.environ.get("TERM_TEST")
        os.environ["TERM_TEST"] = "TESTING"
        yield
        if old_value is None:
            os.environ.pop("TERM_TEST", None)
        else:
            os.environ["TERM_TEST"] = old_value

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "on-run-start": [
                "{{ custom_run_hook('start', target, run_started_at, invocation_id) }}",
                "CREATE TABLE {{ target.schema }}.start_hook_order_test ( id INT )",
                "DROP TABLE {{ target.schema }}.start_hook_order_test",
                "{{ log(env_var('TERM_TEST'), info=True) }}",
            ],
            "on-run-end": [
                "{{ custom_run_hook('end', target, run_started_at, invocation_id) }}",
                "CREATE TABLE {{ target.schema }}.end_hook_order_test ( id INT )",
                "DROP TABLE {{ target.schema }}.end_hook_order_test",
                "CREATE TABLE {{ target.schema }}.schemas ( `schema` STRING )",
                "INSERT INTO {{ target.schema }}.schemas (`schema`) VALUES {% for schema in schemas %}( '{{ schema }}' ){% if not loop.last %},{% endif %}{% endfor %}",
                "CREATE TABLE {{ target.schema }}.db_schemas ( db STRING, `schema` STRING )",
                "INSERT INTO {{ target.schema }}.db_schemas (db, `schema`) VALUES {% for db, schema in database_schemas %}('{{ db }}', '{{ schema }}' ){% if not loop.last %},{% endif %}{% endfor %}",
            ],
            "seeds": {
                "quote_columns": False,
            },
        }

    def get_ctx_vars(self, state, project):
        fields = [
            "test_state",
            "target_dbname",
            "target_host",
            "target_name",
            "target_schema",
            "target_threads",
            "target_type",
            "target_user",
            "target_pass",
            "run_started_at",
            "invocation_id",
            "thread_id",
        ]
        field_list = ", ".join([f"`{f}`" for f in fields])
        query = (
            f"select {field_list} from {project.test_schema}.on_run_hook"
            f" where test_state = '{state}'"
        )

        vals = project.run_sql(query, fetch="all")
        assert len(vals) != 0, "nothing inserted into on_run_hook table"
        assert len(vals) == 1, "too many rows in hooks table"
        ctx = dict(zip(fields, vals[0], strict=False))

        return ctx

    def check_hooks(self, state, project, host):
        ctx = self.get_ctx_vars(state, project)
        assert ctx["test_state"] == state
        assert ctx["target_name"] == "default"
        assert ctx["target_schema"] == project.test_schema
        assert ctx["target_type"] == "fabricspark"

        assert ctx["run_started_at"] is not None and len(ctx["run_started_at"]) > 0, (
            "run_started_at was not set"
        )
        assert ctx["invocation_id"] is not None and len(ctx["invocation_id"]) > 0, (
            "invocation_id was not set"
        )
