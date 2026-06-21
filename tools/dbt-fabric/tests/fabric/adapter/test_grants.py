import pytest

from dbt.tests.adapter.grants.test_incremental_grants import BaseIncrementalGrants
from dbt.tests.adapter.grants.test_invalid_grants import BaseInvalidGrants
from dbt.tests.adapter.grants.test_model_grants import BaseModelGrants
from dbt.tests.adapter.grants.test_seed_grants import BaseSeedGrants
from dbt.tests.adapter.grants.test_snapshot_grants import BaseSnapshotGrants


@pytest.mark.grants
class TestModelGrantsFabric(BaseModelGrants):
    pass


@pytest.mark.grants
class TestSeedGrantsFabric(BaseSeedGrants):
    pass


@pytest.mark.grants
class TestSnapshotGrantsFabric(BaseSnapshotGrants):
    pass


@pytest.mark.grants
class TestIncrementalGrantsFabric(BaseIncrementalGrants):
    pass


@pytest.mark.grants
class TestInvalidGrantsFabric(BaseInvalidGrants):
    def privilege_does_not_exist_error(self):
        return "Incorrect syntax near"

    def grantee_does_not_exist_error(self):
        return "could not be"
