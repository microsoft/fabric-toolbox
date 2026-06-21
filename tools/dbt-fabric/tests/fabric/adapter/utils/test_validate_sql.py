import pytest

from dbt.tests.adapter.utils.test_validate_sql import BaseValidateSqlMethod


class TestValidateSqlMethodFabric(BaseValidateSqlMethod):
    @pytest.fixture(scope="class")
    def valid_sql(self) -> str:
        return "select 1 as id"
