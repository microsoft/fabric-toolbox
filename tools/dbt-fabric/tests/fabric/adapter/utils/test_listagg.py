import pytest

from dbt.tests.adapter.utils.fixture_listagg import models__test_listagg_yml
from dbt.tests.adapter.utils.test_listagg import BaseListagg


class TestListaggFabric(BaseListagg):
    @pytest.fixture(scope="class")
    def models(self):
        fixed_models__test_listagg_sql = """
with data as (

    select * from {{ ref('data_listagg') }}

),

data_output as (

    select * from {{ ref('data_listagg_output') }}

),

calculate as (

    select
        group_col,
        {{ listagg('string_text', "'_|_'", "order by order_col") }} as actual,
        'bottom_ordered' as version
    from data
    group by group_col

    union all

    select
        group_col,
        {{ listagg('string_text', "', '") }} as actual,
        'comma_whitespace_unordered' as version
    from data
    where group_col = 3
    group by group_col

    union all

    select
        group_col,
        {{ listagg('string_text') }} as actual,
        'no_params' as version
    from data
    where group_col = 3
    group by group_col

)

select
    calculate.actual,
    data_output.expected
from calculate
left join data_output
on calculate.group_col = data_output.group_col
and calculate.version = data_output.version
"""
        return {
            "test_listagg.yml": models__test_listagg_yml,
            "test_listagg.sql": self.interpolate_macro_namespace(
                fixed_models__test_listagg_sql, "listagg"
            ),
        }
