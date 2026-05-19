from typing import Any, ClassVar

from dbt.adapters.base.column import Column


class FabricColumn(Column):
    TYPE_LABELS: ClassVar[dict[str, str]] = {
        "BINARY": "BINARY(1)",
        "BOOLEAN": "BIT",
        "CHAR": "CHAR(1)",
        "DATETIME2": "DATETIME2(6)",
        "INTEGER": "INT",
        "MONEY": "DECIMAL",
        "NCHAR": "CHAR(1)",
        "NVARCHAR": "VARCHAR(MAX)",
        "SMALLMONEY": "DECIMAL",
        "STRING": "VARCHAR(MAX)",
        "TIME": "TIME(6)",
        "TIMESTAMP": "DATETIME2(6)",
        "TINYINT": "SMALLINT",
        "VARBINARY": "VARBINARY(MAX)",
        "VARCHAR": "VARCHAR(MAX)",
    }

    @classmethod
    def string_type(cls, size: int) -> str:
        return f"varchar({size if size > 0 else 'max'})"

    def literal(self, value: Any) -> str:
        return f"cast('{value}' as {self.data_type})"

    def is_integer(self):
        return super().is_integer() or self.dtype.lower() == "int"

    def is_string(self) -> bool:
        return self.dtype.lower() in ["varchar", "char"]

    def is_numeric(self) -> bool:
        return self.dtype.lower() in ["numeric", "decimal", "money", "smallmoney"]

    @property
    def quoted(self) -> str:
        return "[{}]".format(self.column.replace("]", "]]"))

    @property
    def data_type(self) -> str:
        if self.dtype == "datetime2":
            return f"datetime2({self.numeric_scale})"
        return super().data_type
