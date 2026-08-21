import pytest

from dbt.tests.adapter.utils.data_types.test_type_bigint import BaseTypeBigInt
from dbt.tests.adapter.utils.data_types.test_type_boolean import BaseTypeBoolean
from dbt.tests.adapter.utils.data_types.test_type_float import (
    BaseTypeFloat,
)
from dbt.tests.adapter.utils.data_types.test_type_float import (
    seeds__expected_csv as seeds__float_expected_csv,
)
from dbt.tests.adapter.utils.data_types.test_type_int import (
    BaseTypeInt,
)
from dbt.tests.adapter.utils.data_types.test_type_int import (
    seeds__expected_csv as seeds__int_expected_csv,
)
from dbt.tests.adapter.utils.data_types.test_type_numeric import BaseTypeNumeric
from dbt.tests.adapter.utils.data_types.test_type_string import BaseTypeString
from dbt.tests.adapter.utils.data_types.test_type_timestamp import BaseTypeTimestamp


class TestTypeBigIntFabricSpark(BaseTypeBigInt):
    pass


# need to explicitly cast this to avoid it being inferred/loaded as a DOUBLE on Spark
# in SparkSQL, the two are equivalent for `=` comparison, but distinct for EXCEPT comparison
seeds__float_expected_yml = """
version: 2
seeds:
  - name: expected
    config:
      column_types:
        float_col: float
"""


class TestTypeFloatFabricSpark(BaseTypeFloat):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {
            "expected.csv": seeds__float_expected_csv,
            "expected.yml": seeds__float_expected_yml,
        }


# need to explicitly cast this to avoid it being inferred/loaded as a BIGINT on Spark
seeds__int_expected_yml = """
version: 2
seeds:
  - name: expected
    config:
      column_types:
        int_col: int
"""


class TestTypeIntFabricSpark(BaseTypeInt):
    @pytest.fixture(scope="class")
    def seeds(self):
        return {
            "expected.csv": seeds__int_expected_csv,
            "expected.yml": seeds__int_expected_yml,
        }


class TestTypeNumericFabricSpark(BaseTypeNumeric):
    def numeric_fixture_type(self):  # type: ignore
        return "decimal(28,6)"


class TestTypeStringFabricSpark(BaseTypeString):
    pass


class TestTypeTimestampFabricSpark(BaseTypeTimestamp):
    pass


class TestTypeBooleanFabricSpark(BaseTypeBoolean):
    pass
