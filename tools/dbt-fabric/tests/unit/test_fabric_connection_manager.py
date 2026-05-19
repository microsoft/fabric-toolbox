import datetime as dt
import struct

import pytest

from dbt.adapters.fabric.fabric_connection_manager import (
    FabricConnectionManager,
    bool_to_connection_string_arg,
    byte_array_to_datetime,
)


class TestBoolToConnectionStringArg:
    def test_true_value(self):
        assert bool_to_connection_string_arg("Encrypt", True) == "Encrypt=Yes"

    def test_false_value(self):
        assert bool_to_connection_string_arg("Encrypt", False) == "Encrypt=No"

    def test_different_key(self):
        assert (
            bool_to_connection_string_arg("TrustServerCertificate", True)
            == "TrustServerCertificate=Yes"
        )


class TestByteArrayToDatetime:
    def _pack(self, year, month, day, hour, minute, second, nanoseconds, tz_hour, tz_minute):
        return struct.pack(
            "<6hI2h", year, month, day, hour, minute, second, nanoseconds, tz_hour, tz_minute
        )

    def test_utc_datetime(self):
        data = self._pack(2024, 3, 15, 10, 30, 45, 123456000, 0, 0)
        result = byte_array_to_datetime(data)
        assert result == dt.datetime(2024, 3, 15, 10, 30, 45, 123456, tzinfo=dt.UTC)

    def test_positive_offset(self):
        data = self._pack(2025, 12, 31, 23, 59, 59, 0, 5, 30)
        result = byte_array_to_datetime(data)
        assert result.year == 2025
        assert result.month == 12
        assert result.day == 31
        assert result.hour == 23
        assert result.minute == 59
        assert result.second == 59
        assert result.microsecond == 0
        assert result.tzinfo == dt.timezone(dt.timedelta(hours=5, minutes=30))

    def test_negative_offset(self):
        data = self._pack(2023, 1, 1, 0, 0, 0, 500000000, -8, 0)
        result = byte_array_to_datetime(data)
        assert result.microsecond == 500000
        assert result.tzinfo == dt.timezone(dt.timedelta(hours=-8))

    def test_nanoseconds_truncated_to_microseconds(self):
        data = self._pack(2024, 6, 15, 12, 0, 0, 999999999, 0, 0)
        result = byte_array_to_datetime(data)
        assert result.microsecond == 999999


class TestDataTypeCodeToName:
    @pytest.mark.parametrize(
        ("type_code", "expected"),
        [
            ("<class 'str'>", "varchar"),
            ("<class 'int'>", "int"),
            ("<class 'float'>", "bigint"),
            ("<class 'bool'>", "bit"),
            ("<class 'datetime.datetime'>", "datetime2(6)"),
            ("<class 'datetime.date'>", "date"),
            ("<class 'decimal.Decimal'>", "decimal"),
        ],
    )
    def test_known_types(self, type_code, expected):
        assert FabricConnectionManager.data_type_code_to_name(type_code) == expected

    def test_unknown_type_raises(self):
        with pytest.raises(KeyError):
            FabricConnectionManager.data_type_code_to_name("<class 'unknown'>")


class MockCursor:
    def __init__(self, messages=None, rowcount=-1):
        self.messages = messages
        self.rowcount = rowcount


class TestGetResponse:
    def test_no_messages_returns_ok(self):
        cursor = MockCursor(messages=None)
        response = FabricConnectionManager.get_response(cursor)
        assert response._message == "OK"
        assert response.query_id is None

    def test_empty_messages_returns_ok(self):
        cursor = MockCursor(messages=[])
        response = FabricConnectionManager.get_response(cursor)
        assert response._message == "OK"

    def test_extracts_statement_id(self):
        cursor = MockCursor(messages=[("info", "Statement id: {abc-123-def}")])
        response = FabricConnectionManager.get_response(cursor)
        assert response.query_id == "abc-123-def"
        assert response._message == "OK"

    def test_filters_changed_database_context(self):
        cursor = MockCursor(messages=[("info", "Changed database context to 'mydb'.")])
        response = FabricConnectionManager.get_response(cursor)
        assert response._message == "OK"

    def test_keeps_other_messages(self):
        cursor = MockCursor(messages=[("info", "Warning: something happened")])
        response = FabricConnectionManager.get_response(cursor)
        assert response._message == "Warning: something happened"

    def test_multiple_messages_joined(self):
        cursor = MockCursor(
            messages=[
                ("info", "First message"),
                ("info", "Changed database context to 'x'."),
                ("info", "Second message"),
            ]
        )
        response = FabricConnectionManager.get_response(cursor)
        assert response._message == "First message\nSecond message"

    def test_rows_affected(self):
        cursor = MockCursor(messages=[], rowcount=42)
        response = FabricConnectionManager.get_response(cursor)
        assert response.rows_affected == 42

    def test_statement_id_with_other_messages(self):
        cursor = MockCursor(
            messages=[
                ("info", "statement id: {uuid-value-here}"),
                ("info", "Some useful info"),
            ]
        )
        response = FabricConnectionManager.get_response(cursor)
        assert response.query_id == "uuid-value-here"
        assert response._message == "Some useful info"
