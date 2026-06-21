import pytest

from dbt.tests.adapter.utils.test_null_compare import BaseMixedNullCompare, BaseNullCompare


class TestMixedNullCompareFabricSpark(BaseMixedNullCompare):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "test_mixed_null_compare.yml": """
version: 2
models:
  - name: test_mixed_null_compare
    data_tests:
      - assert_equal:
          actual: actual
          expected: expected
""",
            "test_mixed_null_compare.sql": """
select
    1 as actual,
    cast(null as int) as expected
""",
        }


class TestNullCompareFabricSpark(BaseNullCompare):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "test_null_compare.yml": """
version: 2
models:
  - name: test_null_compare
    data_tests:
      - assert_equal:
          actual: actual
          expected: expected
""",
            "test_null_compare.sql": """
select
    cast(null as string) as actual,
    cast(null as string) as expected
""",
        }
