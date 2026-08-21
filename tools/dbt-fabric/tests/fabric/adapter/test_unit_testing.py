import pytest

from dbt.tests.adapter.unit_testing.test_case_insensitivity import BaseUnitTestCaseInsensivity
from dbt.tests.adapter.unit_testing.test_invalid_input import BaseUnitTestInvalidInput
from dbt.tests.adapter.unit_testing.test_quoted_reserved_word_column_names import (
    BaseUnitTestQuotedReservedWordColumnNames,
)
from dbt.tests.adapter.unit_testing.test_types import BaseUnitTestingTypes


class TestFabricUnitTestingTypes(BaseUnitTestingTypes):
    @pytest.fixture
    def data_types(self):
        # sql_value, yaml_value
        return [
            ["1", "1"],
            ["'1'", "1"],
            ["CAST('2020-01-02' AS DATE)", "2020-01-02"],
            ["CAST('2013-11-03 00:00:00-0' AS DATETIME2(6))", "2013-11-03 00:00:00-0"],
            ["CAST('1' AS INT)", "1"],
        ]


class TestFabricUnitTestCaseInsensivity(BaseUnitTestCaseInsensivity):
    pass


class TestFabricUnitTestInvalidInput(BaseUnitTestInvalidInput):
    pass


class TestFabricUnitTestQuotedReservedWordColumnNames(BaseUnitTestQuotedReservedWordColumnNames):
    pass
