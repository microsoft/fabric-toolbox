from collections.abc import Iterable

from dbt.tests.adapter.simple_snapshot.test_snapshot import (
    BaseSimpleSnapshot,
    BaseSimpleSnapshotBase,
    BaseSnapshotCheck,
)
from dbt.tests.util import relation_from_name, run_dbt


class BaseSimpleSnapshotBaseFabric(BaseSimpleSnapshotBase):
    def _assert_results(
        self,
        ids_with_current_snapshot_records: Iterable,
        ids_with_closed_out_snapshot_records: Iterable,
    ):
        records = set(
            self.get_snapshot_records(
                "id, case when dbt_valid_to is null then 1 else 0 end as is_current"
            )
        )
        expected_records = set().union(
            {(i, 1) for i in ids_with_current_snapshot_records},
            {(i, 0) for i in ids_with_closed_out_snapshot_records},
        )
        for record in records:
            assert record in expected_records

    def add_fact_column(self, column: str = None, definition: str = None):  # type: ignore
        table_name = relation_from_name(self.project.adapter, "fact")
        sql = f"""
            alter table {table_name}
            add {column} {definition}
        """
        self.project.run_sql(sql)


class TestSimpleSnapshotFabric(BaseSimpleSnapshotBaseFabric, BaseSimpleSnapshot):
    def test_new_column_captured_by_snapshot(self, project):
        self.add_fact_column("full_name", "varchar(200)")
        self.update_fact_records(
            {
                "full_name": "first_name + ' ' + last_name",
                "updated_at": "dateadd(day, 1, updated_at)",
            },
            "id between 11 and 20",
        )
        run_dbt(["snapshot"])
        self._assert_results(
            ids_with_current_snapshot_records=range(1, 21),
            ids_with_closed_out_snapshot_records=range(11, 21),
        )

    def test_updates_are_captured_by_snapshot(self, project):
        self.update_fact_records(
            {"updated_at": "dateadd(day, 1, updated_at)"}, "id between 16 and 20"
        )
        run_dbt(["snapshot"])
        self._assert_results(
            ids_with_current_snapshot_records=range(1, 21),
            ids_with_closed_out_snapshot_records=range(16, 21),
        )


class TestSnapshotCheckFabric(BaseSimpleSnapshotBaseFabric, BaseSnapshotCheck):
    pass
