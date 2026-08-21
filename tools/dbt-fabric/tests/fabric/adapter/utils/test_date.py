import pytest

from dbt.tests.adapter.utils.fixture_date import models__test_date_yml
from dbt.tests.adapter.utils.test_date import BaseDate


class TestDateFabric(BaseDate):
    @pytest.fixture(scope="class")
    def models(self):
        models__test_date_sql = """
with generated_dates as (

    {{
        dbt.date_spine(
            "day",
            "cast('2023-09-07' as date)",
            "cast('2023-09-10' as date)"
        )
    }}

),

expected_dates as (

    select cast('2023-09-07' as date) as expected
    union all
    select cast('2023-09-08' as date) as expected
    union all
    select cast('2023-09-09' as date) as expected

),

joined as (
    select
        generated_dates.date_day,
        expected_dates.expected
    from generated_dates
    full outer join expected_dates on generated_dates.date_day = expected_dates.expected
)

select * from joined
"""

        return {
            "test_date.yml": models__test_date_yml,
            "test_date.sql": self.interpolate_macro_namespace(models__test_date_sql, "date"),
        }
