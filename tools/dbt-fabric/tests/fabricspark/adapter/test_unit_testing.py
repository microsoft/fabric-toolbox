import pytest

from dbt.tests.adapter.unit_testing.test_case_insensitivity import BaseUnitTestCaseInsensivity
from dbt.tests.adapter.unit_testing.test_invalid_input import BaseUnitTestInvalidInput
from dbt.tests.adapter.unit_testing.test_quoted_reserved_word_column_names import (
    BaseUnitTestQuotedReservedWordColumnNames,
    my_model_sql,
    test_my_model_csv_fixtures_yml,
)
from dbt.tests.adapter.unit_testing.test_types import BaseUnitTestingTypes


class TestFabricSparkUnitTestingTypes(BaseUnitTestingTypes):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {"models": {"+materialized": "table"}}

    @pytest.fixture
    def data_types(self):
        return [
            ["1", "1"],
            ["2.0", "2.0"],
            ["'12345'", "12345"],
            ["'string'", "string"],
            ["true", "true"],
            ["cast(1.0 as float)", "1.0"],
            ["date '2011-11-11'", "2011-11-11"],
            ["timestamp '2013-11-03 00:00:00-0'", "2013-11-03 00:00:00-0"],
        ]


class TestFabricSparkUnitTestCaseInsensivity(BaseUnitTestCaseInsensivity):
    pass


class TestFabricSparkUnitTestInvalidInput(BaseUnitTestInvalidInput):
    pass


class TestFabricSparkUnitTestQuotedReservedWordColumnNames(
    BaseUnitTestQuotedReservedWordColumnNames,
):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "my_model.sql": my_model_sql,
            "my_upstream_model.sql": "select 1 as `GROUP`",
            "unit_tests.yml": test_my_model_csv_fixtures_yml,
        }
