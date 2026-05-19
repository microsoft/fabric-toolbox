import pytest

from dbt.artifacts.schemas.results import TestStatus
from dbt.tests.adapter.store_test_failures_tests import _files
from dbt.tests.adapter.store_test_failures_tests.basic import (
    StoreTestFailuresAsExceptions,
    StoreTestFailuresAsGeneric,
    StoreTestFailuresAsInteractions,
    StoreTestFailuresAsProjectLevelEphemeral,
    StoreTestFailuresAsProjectLevelOff,
    StoreTestFailuresAsProjectLevelView,
    TestResult,
)
from dbt.tests.adapter.store_test_failures_tests.test_store_test_failures import (
    BaseStoreTestFailures,
    BaseStoreTestFailuresLimit,
)

TestResult.__test__ = False

TEST__TABLE_TRUE = """
{{ config(store_failures_as="table", store_failures=True) }}
select *
from {{ ref('chipmunks') }}
where shirt = 'green'
"""

TEST__TABLE_FALSE = """
{{ config(store_failures_as="table", store_failures=False) }}
select *
from {{ ref('chipmunks') }}
where shirt = 'green'
"""

TEST__TABLE_UNSET = """
{{ config(store_failures_as="table") }}
select *
from {{ ref('chipmunks') }}
where shirt = 'green'
"""

TEST__TABLE_UNSET_PASS = """
{{ config(store_failures_as="table") }}
select *
from {{ ref('chipmunks') }}
where shirt = 'purple'
"""

SCHEMA_YML_TABLE = """
version: 2

models:
  - name: chipmunks
    columns:
      - name: name
        data_tests:
          - not_null:
              store_failures_as: table
          - accepted_values:
              store_failures: false
              store_failures_as: table
              values:
                - alvin
                - simon
                - theodore
      - name: shirt
        data_tests:
          - not_null:
              store_failures: true
              store_failures_as: table
"""


class TestFabricSparkStoreTestFailures(BaseStoreTestFailures):
    pass


class TestFabricSparkStoreTestFailuresAsGeneric(StoreTestFailuresAsGeneric):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            f"{self.model_table}.sql": _files.MODEL__CHIPMUNKS,
            "schema.yml": SCHEMA_YML_TABLE,
        }

    def test_tests_run_successfully_and_are_stored_as_expected(self, project):
        expected_results = {
            TestResult("not_null_chipmunks_name", TestStatus.Pass, "table"),
            TestResult(
                "accepted_values_chipmunks_name__alvin__simon__theodore",
                TestStatus.Fail,
                "table",
            ),
            TestResult("not_null_chipmunks_shirt", TestStatus.Fail, "table"),
        }
        self.run_and_assert(project, expected_results)


class TestFabricSparkStoreTestFailuresAsExceptions(StoreTestFailuresAsExceptions):
    pass


class TestFabricSparkStoreTestFailuresAsInteractions(StoreTestFailuresAsInteractions):
    @pytest.fixture(scope="class")
    def tests(self):
        return {
            "view_unset_pass.sql": TEST__TABLE_UNSET_PASS,
            "view_true.sql": TEST__TABLE_TRUE,
            "view_false.sql": TEST__TABLE_FALSE,
            "view_unset.sql": TEST__TABLE_UNSET,
            "table_true.sql": _files.TEST__TABLE_TRUE,
            "table_false.sql": _files.TEST__TABLE_FALSE,
            "table_unset.sql": _files.TEST__TABLE_UNSET,
            "ephemeral_true.sql": _files.TEST__EPHEMERAL_TRUE,
            "ephemeral_false.sql": _files.TEST__EPHEMERAL_FALSE,
            "ephemeral_unset.sql": _files.TEST__EPHEMERAL_UNSET,
            "unset_true.sql": _files.TEST__UNSET_TRUE,
            "unset_false.sql": _files.TEST__UNSET_FALSE,
            "unset_unset.sql": _files.TEST__UNSET_UNSET,
        }

    def test_tests_run_successfully_and_are_stored_as_expected(self, project):
        expected_results = {
            TestResult("view_unset_pass", TestStatus.Pass, "table"),
            TestResult("view_true", TestStatus.Fail, "table"),
            TestResult("view_false", TestStatus.Fail, "table"),
            TestResult("view_unset", TestStatus.Fail, "table"),
            TestResult("table_true", TestStatus.Fail, "table"),
            TestResult("table_false", TestStatus.Fail, "table"),
            TestResult("table_unset", TestStatus.Fail, "table"),
            TestResult("ephemeral_true", TestStatus.Fail, None),
            TestResult("ephemeral_false", TestStatus.Fail, None),
            TestResult("ephemeral_unset", TestStatus.Fail, None),
            TestResult("unset_true", TestStatus.Fail, "table"),
            TestResult("unset_false", TestStatus.Fail, None),
            TestResult("unset_unset", TestStatus.Fail, None),
        }
        self.run_and_assert(project, expected_results)


class TestFabricSparkStoreTestFailuresAsProjectLevelEphemeral(
    StoreTestFailuresAsProjectLevelEphemeral,
):
    @pytest.fixture(scope="class")
    def tests(self):
        return {
            "results_unset.sql": _files.TEST__UNSET_UNSET,
            "results_true.sql": _files.TEST__UNSET_TRUE,
            "results_view.sql": TEST__TABLE_UNSET,
        }

    def test_tests_run_successfully_and_are_stored_as_expected(self, project):
        expected_results = {
            TestResult("results_unset", TestStatus.Fail, None),
            TestResult("results_true", TestStatus.Fail, None),
            TestResult("results_view", TestStatus.Fail, "table"),
        }
        self.run_and_assert(project, expected_results)


class TestFabricSparkStoreTestFailuresAsProjectLevelOff(StoreTestFailuresAsProjectLevelOff):
    @pytest.fixture(scope="class")
    def tests(self):
        return {
            "results_view.sql": TEST__TABLE_UNSET,
            "results_table.sql": _files.TEST__TABLE_UNSET,
            "results_ephemeral.sql": _files.TEST__EPHEMERAL_UNSET,
            "results_unset.sql": _files.TEST__UNSET_UNSET,
        }

    def test_tests_run_successfully_and_are_stored_as_expected(self, project):
        expected_results = {
            TestResult("results_view", TestStatus.Fail, "table"),
            TestResult("results_table", TestStatus.Fail, "table"),
            TestResult("results_ephemeral", TestStatus.Fail, None),
            TestResult("results_unset", TestStatus.Fail, None),
        }
        self.run_and_assert(project, expected_results)


class TestFabricSparkStoreTestFailuresAsProjectLevelView(StoreTestFailuresAsProjectLevelView):
    @pytest.fixture(scope="class")
    def tests(self):
        return {
            "results_true.sql": TEST__TABLE_TRUE,
            "results_false.sql": TEST__TABLE_FALSE,
            "results_unset.sql": TEST__TABLE_UNSET,
        }

    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {"data_tests": {"store_failures_as": "table"}}

    def test_tests_run_successfully_and_are_stored_as_expected(self, project):
        expected_results = {
            TestResult("results_true", TestStatus.Fail, "table"),
            TestResult("results_false", TestStatus.Fail, "table"),
            TestResult("results_unset", TestStatus.Fail, "table"),
        }
        self.run_and_assert(project, expected_results)


class TestFabricSparkStoreTestFailuresLimit(BaseStoreTestFailuresLimit):
    pass
