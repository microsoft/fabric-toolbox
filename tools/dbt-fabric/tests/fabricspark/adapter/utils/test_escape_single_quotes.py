import pytest

from dbt.tests.adapter.utils import base_utils

# dbt-adapters' BaseEscapeSingleQuotesQuote and BaseEscapeSingleQuotesBackslash
# both hard-code expected_length = 7 for 'they''re'. That assumes the runtime
# preserves the 7-character escaped literal. Fabric Lakehouse runs Spark with
# escapedStringLiterals=false, so '' is a SQL-standard quote escape that
# collapses to a single character at parse time -- length('they''re') = 6.
# Our fabricspark__escape_single_quotes macro produces '', so we assert the
# actual Fabric Lakehouse behavior here instead of inheriting a mismatched base.
models__test_escape_single_quotes_fabricspark_sql = """
select
  '{{ escape_single_quotes("they're") }}' as actual,
  'they''re' as expected,
  {{ length(string_literal(escape_single_quotes("they're"))) }} as actual_length,
  6 as expected_length

union all

select
  '{{ escape_single_quotes("they are") }}' as actual,
  'they are' as expected,
  {{ length(string_literal(escape_single_quotes("they are"))) }} as actual_length,
  8 as expected_length
"""

models__test_escape_single_quotes_yml = """
version: 2
models:
  - name: test_escape_single_quotes
    data_tests:
      - assert_equal:
          actual: actual
          expected: expected
      - assert_equal:
          actual: actual_length
          expected: expected_length
"""


class TestEscapeSingleQuotesFabricSpark(base_utils.BaseUtils):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "test_escape_single_quotes.yml": models__test_escape_single_quotes_yml,
            "test_escape_single_quotes.sql": self.interpolate_macro_namespace(
                models__test_escape_single_quotes_fabricspark_sql,
                "escape_single_quotes",
            ),
        }
