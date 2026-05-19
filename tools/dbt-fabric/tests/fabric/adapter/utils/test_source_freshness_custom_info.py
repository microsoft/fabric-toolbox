import pytest

from dbt.tests.adapter.utils.test_source_freshness_custom_info import BaseCalculateFreshnessMethod


class TestCalculateFreshnessMethodFabric(BaseCalculateFreshnessMethod):
    @pytest.fixture(scope="class")
    def valid_sql(self) -> str:
        return "select current_timestamp as c"
