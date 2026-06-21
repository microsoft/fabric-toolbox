from collections.abc import Iterator
from datetime import date, datetime
from decimal import Decimal
from types import TracebackType
from typing import Any, Self

from dbt_common.exceptions import DbtDatabaseError, DbtRuntimeError

from dbt.adapters.fabric.fabric_hc_livy_session import HighConcurrencyLivySession
from dbt.adapters.fabric.livy_result import LivySessionResult


class FabricSparkCursor:
    """A DB-API 2.0 (PEP 249) compatible cursor for Fabric Spark."""

    def __init__(self, connection: Any) -> None:
        self._connection = connection
        self._result: LivySessionResult | None = None
        self._rows: list[tuple[Any, ...]] | None = None
        self._position: int = 0
        self._arraysize: int = 1
        self._statement_id: int | None = None

    @property
    def connection(self) -> Any:
        self._check_closed()
        return self._connection

    def _check_closed(self) -> None:
        if self._connection is None:
            raise DbtDatabaseError("Cursor is closed.")

    def close(self) -> None:
        self._connection = None
        self._result = None
        self._rows = None
        self._position = 0
        self._statement_id = None

    def get_livy_session(self) -> HighConcurrencyLivySession:
        return self.connection.get_livy_session()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: BaseException | None,
        exc_val: Exception | None,
        exc_tb: TracebackType | None,
    ) -> bool:
        self.close()
        return False

    @staticmethod
    def _convert_value(value: Any, spark_type: str) -> Any:
        """Convert a raw JSON value to the appropriate Python type based on the Spark SQL type."""
        if value is None:
            return None

        spark_type = spark_type.lower()

        if spark_type in (
            "long",
            "bigint",
            "int",
            "integer",
            "short",
            "smallint",
            "byte",
            "tinyint",
        ):
            return int(value)
        if spark_type in ("float", "double"):
            return float(value)
        if spark_type.startswith("decimal"):
            return Decimal(value)
        if spark_type in ("boolean",):
            if isinstance(value, bool):
                return value
            return str(value).lower() in ("true", "1")
        if spark_type in ("date",):
            return date.fromisoformat(value) if isinstance(value, str) else value
        if spark_type in ("timestamp",):
            return datetime.fromisoformat(value) if isinstance(value, str) else value
        if spark_type in ("binary",):
            return bytes.fromhex(value) if isinstance(value, str) else value
        # string, void, and anything else: return as-is
        return value

    def _convert_row(self, row: list[Any], fields: list[dict[str, Any]]) -> tuple[Any, ...]:
        """Convert a raw data row using schema type information."""
        return tuple(
            self._convert_value(val, fields[i]["type"]) if i < len(fields) else val
            for i, val in enumerate(row)
        )

    @staticmethod
    def _format_param(value: Any) -> str:
        """Format a Python value as a Spark SQL literal for safe substitution."""
        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (int, Decimal)):
            return str(value)
        if isinstance(value, float):
            return repr(value)
        if isinstance(value, datetime):
            return f"'{value.isoformat()}'"
        if isinstance(value, date):
            return f"'{value.isoformat()}'"
        if isinstance(value, bytes):
            return "X'" + value.hex() + "'"
        # Default: treat as string, escape single quotes
        escaped = str(value).replace("'", "''")
        return f"'{escaped}'"

    def execute(self, sql: str, *parameters: Any) -> None:
        if parameters and parameters[0] is not None:
            params = parameters[0]
            if not isinstance(params, (list, tuple)):
                raise DbtDatabaseError("Parameters must be a list or tuple.")
            sql = sql % tuple(self._format_param(p) for p in params)

        statement_id = self.get_livy_session().run_statement(sql, "sql", wait_for_result=False)
        if isinstance(statement_id, LivySessionResult):
            self._result = statement_id
            raise DbtDatabaseError(f"Error executing SQL statement: {self._result.error_message}")

        self._statement_id = statement_id

        self._result = self.get_livy_session().wait_and_get_statement_result(statement_id)
        if not self._result.success:
            raise DbtDatabaseError(f"Error executing SQL statement: {self._result.error_message}")

        data = self._result.json_data.get("data", [])  # type: ignore[union-attr]
        fields = self._result.json_data.get("schema", {}).get("fields", [])  # type: ignore[union-attr]
        self._rows = [self._convert_row(row, fields) for row in data]
        self._position = 0

    def cancel(self) -> None:
        if self._connection is None:
            return
        if self._statement_id is not None and self._result is None:
            self.get_livy_session().cancel_statement(self._statement_id)
            self._statement_id = None

    @property
    def messages(self) -> list[tuple[type[Exception], Any]]:
        return []  # TODO: return actual messages once we have a way to get them from Livy

    @property
    def rowcount(self) -> int:
        return len(self._rows) if self._rows is not None else -1

    @property
    def statement_id(self) -> int | None:
        return self._result.statement_id if self._result else None

    @property
    def status_code(self) -> str | None:
        return self._result.status_code if self._result else None

    def _check_result(self) -> list[tuple[Any, ...]]:
        """Ensure a result set is available, raising an error if not."""
        self._check_closed()
        if self._rows is None:
            raise DbtRuntimeError("No result set. Call execute() first.")
        return self._rows

    def fetchone(self) -> tuple[Any, ...] | None:
        rows = self._check_result()
        if self._position >= len(rows):
            return None
        row = rows[self._position]
        self._position += 1
        return row

    def fetchmany(self, size: int | None = None) -> list[tuple[Any, ...]]:
        rows = self._check_result()
        if size is None:
            size = self._arraysize
        end = min(self._position + size, len(rows))
        result = rows[self._position : end]
        self._position = end
        return result

    def fetchall(self) -> list[tuple[Any, ...]]:
        rows = self._check_result()
        result = rows[self._position :]
        self._position = len(rows)
        return result

    @property
    def arraysize(self) -> int:
        return self._arraysize

    @arraysize.setter
    def arraysize(self, value: int) -> None:
        self._arraysize = value

    @property
    def rownumber(self) -> int | None:
        if self._rows is None:
            return None
        return self._position

    def next(self) -> tuple[Any, ...]:
        row = self.fetchone()
        if row is None:
            raise StopIteration
        return row

    __next__ = next

    def __iter__(self) -> Iterator[tuple[Any, ...]]:
        return self

    def scroll(self, value: int, mode: str = "relative") -> None:
        self._check_result()
        if mode == "relative":
            new_position = self._position + value
        elif mode == "absolute":
            new_position = value
        else:
            raise DbtDatabaseError(f"Invalid scroll mode: {mode!r}. Use 'relative' or 'absolute'.")

        if new_position < 0 or new_position > len(self._rows):  # type: ignore[arg-type]
            raise IndexError(f"Scroll position {new_position} is out of range.")
        self._position = new_position

    @property
    def description(
        self,
    ) -> list[tuple[str, str, None, None, None, None, bool]] | None:
        if self._result is None:
            return None

        schema = self._result.json_data.get("schema")  # type: ignore[union-attr]
        if schema is None:
            return None

        return [
            (
                field["name"],  # name
                field["type"],  # type_code
                None,  # display_size
                None,  # internal_size
                None,  # precision
                None,  # scale
                field.get("nullable", True),  # null_ok
            )
            for field in schema.get("fields", [])
        ]

    # DB-API methods not implemented in this cursor, unused by dbt-adapters.
    def callproc(self, procname: str, parameters: tuple[Any, ...] = ()) -> tuple[Any, ...]:
        raise NotImplementedError

    def executemany(
        self, sql: str, seq_of_parameters: list[tuple[Any, ...] | dict[str, Any]]
    ) -> None:
        raise NotImplementedError

    def nextset(self) -> bool | None:
        raise NotImplementedError

    def setinputsizes(self, sizes: list[Any]) -> None:
        self._check_closed()

    def setoutputsize(self, size: int, column: int | None = None) -> None:
        self._check_closed()
