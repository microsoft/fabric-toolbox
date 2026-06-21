import pytest

from dbt.tests.adapter.utils.test_generate_series import BaseGenerateSeries


class TestGenerateSeriesFabric(BaseGenerateSeries):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {
            "models": {
                "+materialized": "table"  # no support for nested CTEs in Views yet
            },
        }
