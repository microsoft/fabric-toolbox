import pytest

from dbt.tests.adapter.simple_copy.test_copy_uppercase import BaseSimpleCopyUppercase
from dbt.tests.adapter.simple_copy.test_simple_copy import EmptyModelsArentRunBase, SimpleCopyBase


class TestEmptyModelsArentRunFabric(EmptyModelsArentRunBase):
    pass


class TestSimpleCopyBaseFabric(SimpleCopyBase):
    def test_simple_copy_with_materialized_views(self, project):
        pytest.skip("Materialized views are not supported in this adapter.")


class TestSimpleCopyUppercaseFabric(BaseSimpleCopyUppercase):
    @pytest.fixture(scope="class")
    def dbt_profile_target(self, dbt_profile_target):
        return dbt_profile_target
