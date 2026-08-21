import pytest
import yaml

from dbt.tests.adapter.python_model.test_python_model import (
    BasePythonEmptyTests,
    BasePythonIncrementalTests,
    BasePythonMetaGetTests,
    BasePythonModelTests,
    BasePythonSampleTests,
    basic_python,
    basic_sql,
    schema_yml,
)
from dbt.tests.adapter.python_model.test_spark import BasePySparkTests
from dbt.tests.util import run_dbt

input_model_sql = """
{{ config(materialized='table', event_time='event_time') }}
select 1 as id, cast('2025-01-01 01:25:00+00:00' as datetime2(6)) as event_time
UNION ALL
select 2 as id, cast('2025-01-02 13:47:00+00:00' as datetime2(6)) as event_time
UNION ALL
select 3 as id, cast('2025-01-03 01:32:00+00:00' as datetime2(6)) as event_time
"""


class TestPythonModelTestsFabric(BasePythonModelTests):
    pass


class TestPythonIncrementalTestsFabric(BasePythonIncrementalTests):
    pass


@pytest.mark.skip("Other DataFrames than PySpark are not supported in Fabric yet")
class TestPySparkTestsFabric(BasePySparkTests):
    pass


class FabricInputModel:
    @pytest.fixture(scope="class")
    def input_model_sql(self) -> str:
        """
        This is the SQL that defines the input model to be sampled, including any {{ config(..) }}.
        event_time is a required configuration of this input
        """
        return input_model_sql


class TestPythonEmptyTestsFabric(FabricInputModel, BasePythonEmptyTests):
    pass


class TestPythonSampleTestsFabric(FabricInputModel, BasePythonSampleTests):
    pass


class TestPythonMetaGetTestsFabric(BasePythonMetaGetTests):
    pass


class TestConcurrentPythonModelsPerformance(BasePythonModelTests):
    def count_python_models(self) -> int:
        return 10

    @pytest.fixture(scope="class")
    def profiles_config_update(self):
        return {"threads": self.count_python_models()}

    @pytest.fixture(scope="class")
    def models(self):
        m = {
            "schema.yml": schema_yml,
            "my_sql_model.sql": basic_sql,
            "my_versioned_sql_model_v1.sql": basic_sql,
        }

        for i in range(self.count_python_models()):
            m[f"my_python_model_{i}.py"] = basic_python

        return m

    def test_singular_tests(self, project):
        # test command
        vars_dict = {
            "test_run_schema": project.test_schema,
        }

        run_dbt(["seed", "--vars", yaml.safe_dump(vars_dict)])
        results = run_dbt(["run", "--vars", yaml.safe_dump(vars_dict)])
        assert len(results) == self.count_python_models() + 2
