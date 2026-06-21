import pytest

from dbt.tests.adapter.utils.test_timestamps import BaseCurrentTimestamps


class TestCurrentTimestampsFabricSpark(BaseCurrentTimestamps):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "get_current_timestamp.sql": "select {{ current_timestamp() }} as current_timestamp"
        }

    @pytest.fixture(scope="class")
    def expected_schema(self):
        return {"current_timestamp": "timestamp"}

    @pytest.fixture(scope="class")
    def expected_sql(self):
        return """select current_timestamp() as current_timestamp"""
