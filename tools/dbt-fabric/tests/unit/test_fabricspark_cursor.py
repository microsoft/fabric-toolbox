from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock

import pytest
from dbt_common.exceptions import DbtDatabaseError

from dbt.adapters.fabric.livy_result import LivySessionResult
from dbt.adapters.fabricspark.fabricspark_cursor import FabricSparkCursor

SAMPLE_FIELDS = [
    {"name": "id", "type": "int", "nullable": False},
    {"name": "name", "type": "string", "nullable": True},
    {"name": "score", "type": "double", "nullable": True},
]

SAMPLE_ROWS = [
    (1, "alice", 9.5),
    (2, "bob", 8.0),
    (3, "carol", 7.5),
]


def _make_cursor_with_rows(
    rows: list[tuple[Any, ...]], fields: list[dict[str, Any]]
) -> FabricSparkCursor:
    cursor = FabricSparkCursor(connection=object())
    cursor._result = LivySessionResult(
        statement_id=1,
        success=True,
        json_data={"data": [], "schema": {"fields": fields}},
    )
    cursor._rows = [tuple(r) for r in rows]
    cursor._position = 0
    return cursor


class TestConvertRow:
    def test_converts_all_columns(self):
        fields = [
            {"name": "id", "type": "int"},
            {"name": "val", "type": "double"},
            {"name": "label", "type": "string"},
        ]
        cursor = FabricSparkCursor(connection=object())
        result = cursor._convert_row(["42", "3.14", "hello"], fields)
        assert result == (42, 3.14, "hello")

    def test_handles_none_values(self):
        fields = [
            {"name": "id", "type": "int"},
            {"name": "val", "type": "double"},
        ]
        cursor = FabricSparkCursor(connection=object())
        result = cursor._convert_row([None, None], fields)
        assert result == (None, None)

    def test_mixed_types(self):
        fields = [
            {"name": "flag", "type": "boolean"},
            {"name": "amount", "type": "decimal(10,2)"},
            {"name": "created", "type": "date"},
        ]
        cursor = FabricSparkCursor(connection=object())
        result = cursor._convert_row(["true", "99.50", "2024-01-15"], fields)
        assert result == (True, Decimal("99.50"), date(2024, 1, 15))

    def test_extra_values_beyond_fields(self):
        fields = [{"name": "id", "type": "int"}]
        cursor = FabricSparkCursor(connection=object())
        result = cursor._convert_row(["42", "extra_value"], fields)
        assert result == (42, "extra_value")

    def test_empty_row(self):
        cursor = FabricSparkCursor(connection=object())
        result = cursor._convert_row([], SAMPLE_FIELDS)
        assert result == ()


class TestCancel:
    def test_cancel_with_pending_statement(self):
        conn = MagicMock()
        livy_session = MagicMock()
        conn.get_livy_session.return_value = livy_session
        cursor = FabricSparkCursor(connection=conn)
        cursor._statement_id = 42
        cursor._result = None

        cursor.cancel()

        livy_session.cancel_statement.assert_called_once_with(42)
        assert cursor._statement_id is None

    def test_cancel_noop_when_no_statement(self):
        conn = MagicMock()
        cursor = FabricSparkCursor(connection=conn)
        cursor._statement_id = None
        cursor._result = None

        cursor.cancel()

        conn.get_livy_session.assert_not_called()

    def test_cancel_noop_when_result_exists(self):
        conn = MagicMock()
        cursor = FabricSparkCursor(connection=conn)
        cursor._statement_id = 42
        cursor._result = LivySessionResult(
            statement_id=42,
            success=True,
            json_data={"data": [], "schema": {"fields": []}},
        )

        cursor.cancel()

        conn.get_livy_session.assert_not_called()


class TestClosedCursorRaisesError:
    def test_fetchone_after_close(self):
        cursor = _make_cursor_with_rows(SAMPLE_ROWS, SAMPLE_FIELDS)
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.fetchone()

    def test_fetchmany_after_close(self):
        cursor = _make_cursor_with_rows(SAMPLE_ROWS, SAMPLE_FIELDS)
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.fetchmany()

    def test_fetchall_after_close(self):
        cursor = _make_cursor_with_rows(SAMPLE_ROWS, SAMPLE_FIELDS)
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.fetchall()

    def test_scroll_after_close(self):
        cursor = _make_cursor_with_rows(SAMPLE_ROWS, SAMPLE_FIELDS)
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.scroll(1)

    def test_execute_after_close(self):
        cursor = _make_cursor_with_rows(SAMPLE_ROWS, SAMPLE_FIELDS)
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.execute("SELECT 1")

    def test_connection_property_after_close(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            _ = cursor.connection

    def test_cancel_after_close_is_noop(self):
        conn = MagicMock()
        cursor = FabricSparkCursor(connection=conn)
        cursor._statement_id = 1
        cursor._result = None
        cursor.close()
        cursor.cancel()
        conn.get_livy_session.assert_not_called()

    def test_setinputsizes_after_close(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.setinputsizes([100])

    def test_setoutputsize_after_close(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            cursor.setoutputsize(1000)


class TestConnectionProperty:
    def test_returns_connection(self):
        conn = object()
        cursor = FabricSparkCursor(connection=conn)
        assert cursor.connection is conn

    def test_raises_when_closed(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.close()
        with pytest.raises(DbtDatabaseError, match="Cursor is closed"):
            _ = cursor.connection


class TestNotImplementedMethods:
    def test_callproc_raises(self):
        cursor = FabricSparkCursor(connection=object())
        with pytest.raises(NotImplementedError):
            cursor.callproc("my_proc")

    def test_callproc_with_params_raises(self):
        cursor = FabricSparkCursor(connection=object())
        with pytest.raises(NotImplementedError):
            cursor.callproc("my_proc", (1, 2, 3))

    def test_executemany_raises(self):
        cursor = FabricSparkCursor(connection=object())
        with pytest.raises(NotImplementedError):
            cursor.executemany("INSERT INTO t VALUES (%s)", [(1,), (2,)])

    def test_nextset_raises(self):
        cursor = FabricSparkCursor(connection=object())
        with pytest.raises(NotImplementedError):
            cursor.nextset()


class TestNoOpMethods:
    def test_setinputsizes_is_noop(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.setinputsizes([None, 100, None])

    def test_setoutputsize_is_noop(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.setoutputsize(1000)

    def test_setoutputsize_with_column_is_noop(self):
        cursor = FabricSparkCursor(connection=object())
        cursor.setoutputsize(1000, column=2)


class TestCursorContextManager:
    def test_exit_propagates_exceptions(self):
        cursor = FabricSparkCursor(connection=object())
        result = cursor.__exit__(ValueError, ValueError("test"), None)
        assert result is False
