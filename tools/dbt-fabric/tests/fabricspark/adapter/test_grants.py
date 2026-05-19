import pytest

from dbt.tests.adapter.grants.test_incremental_grants import BaseIncrementalGrants
from dbt.tests.adapter.grants.test_invalid_grants import BaseInvalidGrants
from dbt.tests.adapter.grants.test_model_grants import BaseModelGrants
from dbt.tests.adapter.grants.test_seed_grants import BaseSeedGrants
from dbt.tests.adapter.grants.test_snapshot_grants import BaseSnapshotGrants


@pytest.mark.skip("FabricSpark Lakehouse uses workspace-level access control, not SQL GRANT")
class TestModelGrantsFabricSpark(BaseModelGrants):
    pass


@pytest.mark.skip("FabricSpark Lakehouse uses workspace-level access control, not SQL GRANT")
class TestSeedGrantsFabricSpark(BaseSeedGrants):
    pass


@pytest.mark.skip("FabricSpark Lakehouse uses workspace-level access control, not SQL GRANT")
class TestSnapshotGrantsFabricSpark(BaseSnapshotGrants):
    pass


@pytest.mark.skip("FabricSpark Lakehouse uses workspace-level access control, not SQL GRANT")
class TestIncrementalGrantsFabricSpark(BaseIncrementalGrants):
    pass


@pytest.mark.skip("FabricSpark Lakehouse uses workspace-level access control, not SQL GRANT")
class TestInvalidGrantsFabricSpark(BaseInvalidGrants):
    pass
