import os

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
from dbt.tests.adapter.hooks.test_run_hooks import (
    BaseAfterRunHooks,
    BasePrePostRunHooks,
)
from dbt.tests.fixtures.project import TestProjInfo


class RunModelFile:
    @pytest.fixture(scope="class", autouse=True)
    def setUp(self, project: TestProjInfo):
        project.run_sql("drop table if exists {schema}.on_model_hook;")
        project.run_sql("""
create table {schema}.on_model_hook (
    test_state       varchar(100),
    target_dbname    varchar(100),
    target_host      varchar(100),
    target_name      varchar(100),
    target_schema    varchar(100),
    target_type      varchar(100),
    target_user      varchar(100),
    target_pass      varchar(100),
    target_threads   int,
    run_started_at   varchar(100),
    invocation_id    varchar(100),
    thread_id        varchar(100)
);
""")


class FabricHooksChecks:
    def check_hooks(self, state, project, host, count=1):
        ctxs = self.get_ctx_vars(state, count=count, project=project)
        for ctx in ctxs:
            assert ctx["test_state"] == state
            assert ctx["target_name"] == "default"
            assert ctx["target_schema"] == project.test_schema
            assert ctx["target_type"] == "fabric"

            assert ctx["run_started_at"] is not None and len(ctx["run_started_at"]) > 0, (
                "run_started_at was not set"
            )
            assert ctx["invocation_id"] is not None and len(ctx["invocation_id"]) > 0, (
                "invocation_id was not set"
            )
            assert ctx["thread_id"].startswith("Thread-")


class TestDuplicateHooksInConfigsFabric(BaseDuplicateHooksInConfigs):
    pass


class TestHookRefsFabric(RunModelFile, FabricHooksChecks, BaseHookRefs):
    pass


class TestHooksRefsOnSeedsFabric(BaseHooksRefsOnSeeds):
    pass


class TestPrePostModelHooksInConfigFabric(
    RunModelFile, FabricHooksChecks, BasePrePostModelHooksInConfig
):
    pass


class TestPrePostModelHooksInConfigKwargsFabric(
    RunModelFile, FabricHooksChecks, BasePrePostModelHooksInConfigKwargs
):
    pass


class TestPrePostModelHooksOnSeedsFabric(BasePrePostModelHooksOnSeeds):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "post-hook": [
                    "alter table {{ this }} add new_col int",
                    "update {{ this }} set new_col = 1",
                    # call any macro to track dependency: https://github.com/dbt-labs/dbt-core/issues/6806
                    "select cast(null as {{ dbt.type_int() }}) as id",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSeedsPlusPrefixedFabric(BasePrePostModelHooksOnSeedsPlusPrefixed):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "+post-hook": [
                    "alter table {{ this }} add new_col int",
                    "update {{ this }} set new_col = 1",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSeedsPlusPrefixedWhitespaceFabric(
    BasePrePostModelHooksOnSeedsPlusPrefixedWhitespace
):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "models": {},
            "seeds": {
                "+post-hook": [
                    "alter table {{ this }} add new_col int",
                    "update {{ this }} set new_col = 1",
                ],
                "quote_columns": False,
            },
        }


class TestPrePostModelHooksOnSnapshotsFabric(BasePrePostModelHooksOnSnapshots):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "snapshot-paths": ["test-snapshots"],
            "models": {},
            "snapshots": {
                "post-hook": [
                    "alter table {{ this }} add new_col int",
                    "update {{ this }} set new_col = 1",
                ]
            },
            "seeds": {
                "quote_columns": False,
            },
        }


class TestPrePostSnapshotHooksInConfigKwargsFabric(BasePrePostSnapshotHooksInConfigKwargs):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "seed-paths": ["seeds"],
            "snapshot-paths": ["test-kwargs-snapshots"],
            "models": {},
            "snapshots": {
                "post-hook": [
                    "alter table {{ this }} add new_col int",
                    "update {{ this }} set new_col = 1",
                ]
            },
            "seeds": {
                "quote_columns": False,
            },
        }


class TestAfterRunHooksFabric(BaseAfterRunHooks):
    pass


class FabricPrePostHooksFixtures:
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "models": {
                "test": {
                    "pre-hook": [
                        # inside transaction (runs second)
                        MODEL_PRE_HOOK,
                        # outside transaction (runs first)
                        {
                            "sql": "select * from {{ this.schema }}.on_model_hook where 1=0",
                            "transaction": False,
                        },
                    ],
                    "post-hook": [
                        # outside transaction (runs second)
                        {
                            "sql": "select * from {{ this.schema }}.on_model_hook where 1=0",
                            "transaction": False,
                        },
                        # inside transaction (runs first)
                        MODEL_POST_HOOK,
                    ],
                }
            }
        }


class TestPrePostModelHooksFabric(
    RunModelFile, FabricHooksChecks, FabricPrePostHooksFixtures, BasePrePostModelHooks
):
    pass


class TestPrePostModelHooksInConfigWithCountFabric(
    RunModelFile,
    FabricHooksChecks,
    FabricPrePostHooksFixtures,
    BasePrePostModelHooksInConfigWithCount,
):
    pass


class TestPrePostRunHooksFabric(BasePrePostRunHooks):  # TODO: Failing test - to investigate
    @pytest.fixture(scope="function")
    def setUp(self, project):
        project.run_sql(f"drop table if exists {project.test_schema}.on_run_hook")
        project.run_sql(f"""
create table {project.test_schema}.on_run_hook (
    test_state       varchar(100),
    target_dbname    varchar(100),
    target_host      varchar(100),
    target_name      varchar(100),
    target_schema    varchar(100),
    target_type      varchar(100),
    target_user      varchar(100),
    target_pass      varchar(100),
    target_threads   int,
    run_started_at   varchar(100),
    invocation_id    varchar(100),
    thread_id        varchar(100)
);""")
        project.run_sql(f"drop table if exists {project.test_schema}.schemas")
        project.run_sql(f"drop table if exists {project.test_schema}.db_schemas")
        os.environ["TERM_TEST"] = "TESTING"

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            # The create and drop table statements here validate that these hooks run
            # in the same order that they are defined. Drop before create is an error.
            # Also check that the table does not exist below.
            "on-run-start": [
                "{{ custom_run_hook('start', target, run_started_at, invocation_id) }}",
                "create table {{ target.schema }}.start_hook_order_test ( id int )",
                "drop table {{ target.schema }}.start_hook_order_test",
                "{{ log(env_var('TERM_TEST'), info=True) }}",
            ],
            "on-run-end": [
                "{{ custom_run_hook('end', target, run_started_at, invocation_id) }}",
                "create table {{ target.schema }}.end_hook_order_test ( id int )",
                "drop table {{ target.schema }}.end_hook_order_test",
                "create table {{ target.schema }}.schemas ( [schema] varchar(100) )",
                "insert into {{ target.schema }}.schemas ([schema]) values {% for schema in schemas %}( '{{ schema }}' ){% if not loop.last %},{% endif %}{% endfor %}",
                "create table {{ target.schema }}.db_schemas ( db varchar(100), [schema] varchar(100) )",
                "insert into {{ target.schema }}.db_schemas (db, [schema]) values {% for db, schema in database_schemas %}('{{ db }}', '{{ schema }}' ){% if not loop.last %},{% endif %}{% endfor %}",
            ],
            "seeds": {
                "quote_columns": False,
            },
        }

    def check_hooks(self, state, project, host):
        ctx = self.get_ctx_vars(state, project)
        assert ctx["test_state"] == state
        assert ctx["target_name"] == "default"
        assert ctx["target_schema"] == project.test_schema
        assert ctx["target_type"] == "fabric"

        assert ctx["run_started_at"] is not None and len(ctx["run_started_at"]) > 0, (
            "run_started_at was not set"
        )
        assert ctx["invocation_id"] is not None and len(ctx["invocation_id"]) > 0, (
            "invocation_id was not set"
        )
