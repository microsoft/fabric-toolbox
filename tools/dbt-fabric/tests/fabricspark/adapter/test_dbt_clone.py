import pytest

from dbt.tests.adapter.dbt_clone.test_dbt_clone import (
    BaseCloneNotPossible,
    BaseClonePossible,
    BaseCloneSameSourceAndTarget,
    BaseCloneSameTargetAndState,
)


class TestFabricSparkCloneNotPossible(BaseCloneNotPossible):
    pass


class TestFabricSparkCloneSameTargetAndState(BaseCloneSameTargetAndState):
    pass


@pytest.mark.skip(
    "Fabric Lakehouse does not support SHALLOW CLONE (Databricks-specific Delta feature)"
)
class TestFabricSparkClonePossible(BaseClonePossible):
    pass


@pytest.mark.skip(
    "Fabric Lakehouse does not support SHALLOW CLONE (Databricks-specific Delta feature)"
)
class TestFabricSparkCloneSameSourceAndTarget(BaseCloneSameSourceAndTarget):
    pass
