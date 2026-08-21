from dataclasses import dataclass

from dbt.adapters.spark.column import SparkColumn


@dataclass
class FabricSparkColumn(SparkColumn):
    table_catalog: str | None = None
    table_comment: str | None = None
    column_comment: str | None = None

    @classmethod
    def string_type(cls, _size: int) -> str:
        return "string"

    def is_string(self) -> bool:
        return super().is_string() or self.dtype.lower() == "string"

    def is_integer(self) -> bool:
        return super().is_integer() or self.dtype.lower() == "int"

    def is_numeric(self) -> bool:
        return super().is_numeric() or self.dtype.lower().startswith("decimal")
