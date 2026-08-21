from dbt.tests.adapter.simple_snapshot.test_snapshot import (
    BaseSimpleSnapshot,
    BaseSimpleSnapshotBase,
    BaseSnapshotCheck,
)


class TestSimpleSnapshotFabricSpark(BaseSimpleSnapshot, BaseSimpleSnapshotBase):
    def add_fact_column(self, column=None, definition=None):
        if definition and "default" in definition.lower():
            definition = definition[: definition.lower().index("default")].strip()
        if definition and "varchar" in definition.lower():
            definition = "string"
        super().add_fact_column(column, definition)


class TestSnapshotCheckFabricSpark(BaseSnapshotCheck, BaseSimpleSnapshotBase):
    pass
