import pytest

from dbt.tests.adapter.utils.test_dateadd import BaseDateAdd


class TestDateAddFabric(BaseDateAdd):
    @pytest.fixture(scope="class")
    def project_config_update(self):
        return {}
