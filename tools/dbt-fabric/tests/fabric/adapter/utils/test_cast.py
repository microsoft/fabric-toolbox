import pytest

from dbt.tests.adapter.utils import fixture_cast_bool_to_text
from dbt.tests.adapter.utils.test_cast import BaseCast
from dbt.tests.adapter.utils.test_cast_bool_to_text import BaseCastBoolToText
from dbt.tests.adapter.utils.test_safe_cast import BaseSafeCast


class TestCastFabric(BaseCast):
    pass


class TestCastBoolToTextFabric(BaseCastBoolToText):
    @pytest.fixture(scope="class")
    def models(self):
        fixed_models__test_cast_bool_to_text_sql = """
with data as (

    select 0 as input, 'false' as expected union all
    select 1 as input, 'true' as expected union all
    select null as input, null as expected

)

select

    {{ cast_bool_to_text("input") }} as actual,
    expected

from data
"""

        return {
            "test_cast_bool_to_text.yml": fixture_cast_bool_to_text.models__test_cast_bool_to_text_yml,
            "test_cast_bool_to_text.sql": self.interpolate_macro_namespace(
                fixed_models__test_cast_bool_to_text_sql, "cast_bool_to_text"
            ),
        }


class TestSafeCastFabric(BaseSafeCast):
    pass
