from dbt.tests.adapter.python_model.test_python_model import (
    BasePythonEmptyTests,
    BasePythonIncrementalTests,
    BasePythonMetaGetTests,
    BasePythonModelTests,
    BasePythonSampleTests,
)
from dbt.tests.adapter.python_model.test_spark import BasePySparkTests
from dbt.tests.util import run_dbt


class TestPythonModelTestsFabricSpark(BasePythonModelTests):
    pass


class TestPythonIncrementalTestsFabricSpark(BasePythonIncrementalTests):
    pass


class TestPySparkTestsFabricSpark(BasePySparkTests):
    def test_different_dataframes(self, project):
        results = run_dbt(["run", "--exclude", "koalas_df"])
        assert len(results) == 3


class TestPythonEmptyTestsFabricSpark(BasePythonEmptyTests):
    pass


class TestPythonSampleTestsFabricSpark(BasePythonSampleTests):
    pass


class TestPythonMetaGetTestsFabricSpark(BasePythonMetaGetTests):
    pass
