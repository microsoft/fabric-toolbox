import pytest

from dbt.adapters.fabric.fabric_column import FabricColumn


class TestFabricColumnTypeLabels:
    @pytest.mark.parametrize(
        ("input_type", "expected"),
        [
            ("STRING", "VARCHAR(MAX)"),
            ("TIMESTAMP", "DATETIME2(6)"),
            ("TINYINT", "SMALLINT"),
            ("BOOLEAN", "BIT"),
            ("INTEGER", "INT"),
            ("NVARCHAR", "VARCHAR(MAX)"),
            ("MONEY", "DECIMAL"),
            ("SMALLMONEY", "DECIMAL"),
            ("DATETIME2", "DATETIME2(6)"),
            ("TIME", "TIME(6)"),
            ("VARBINARY", "VARBINARY(MAX)"),
        ],
    )
    def test_type_label_mapping(self, input_type, expected):
        assert FabricColumn.TYPE_LABELS[input_type] == expected


class TestFabricColumnStringType:
    def test_positive_size(self):
        assert FabricColumn.string_type(100) == "varchar(100)"

    def test_zero_size(self):
        assert FabricColumn.string_type(0) == "varchar(max)"

    def test_negative_size(self):
        assert FabricColumn.string_type(-1) == "varchar(max)"


class TestFabricColumnLiteral:
    def test_literal_varchar(self):
        col = FabricColumn(column="name", dtype="varchar", char_size=50)
        assert col.literal("hello") == "cast('hello' as varchar(50))"

    def test_literal_int(self):
        col = FabricColumn(column="id", dtype="int")
        assert col.literal("42") == "cast('42' as int)"


class TestFabricColumnIsInteger:
    def test_int_type(self):
        col = FabricColumn(column="id", dtype="int")
        assert col.is_integer() is True

    def test_bigint_type(self):
        col = FabricColumn(column="id", dtype="bigint")
        assert col.is_integer() is True

    def test_smallint_type(self):
        col = FabricColumn(column="id", dtype="smallint")
        assert col.is_integer() is True

    def test_varchar_not_integer(self):
        col = FabricColumn(column="name", dtype="varchar", char_size=50)
        assert col.is_integer() is False


class TestFabricColumnIsString:
    def test_varchar(self):
        col = FabricColumn(column="name", dtype="varchar", char_size=50)
        assert col.is_string() is True

    def test_char(self):
        col = FabricColumn(column="code", dtype="char", char_size=1)
        assert col.is_string() is True

    def test_int_not_string(self):
        col = FabricColumn(column="id", dtype="int")
        assert col.is_string() is False


class TestFabricColumnIsNumeric:
    def test_numeric(self):
        col = FabricColumn(column="amount", dtype="numeric", numeric_precision=10, numeric_scale=2)
        assert col.is_numeric() is True

    def test_decimal(self):
        col = FabricColumn(column="amount", dtype="decimal", numeric_precision=18, numeric_scale=4)
        assert col.is_numeric() is True

    def test_money(self):
        col = FabricColumn(column="price", dtype="money")
        assert col.is_numeric() is True

    def test_smallmoney(self):
        col = FabricColumn(column="price", dtype="smallmoney")
        assert col.is_numeric() is True

    def test_varchar_not_numeric(self):
        col = FabricColumn(column="name", dtype="varchar", char_size=50)
        assert col.is_numeric() is False


class TestFabricColumnQuoted:
    def test_simple_name(self):
        col = FabricColumn(column="my_column", dtype="int")
        assert col.quoted == "[my_column]"

    def test_name_with_bracket(self):
        col = FabricColumn(column="col]name", dtype="int")
        assert col.quoted == "[col]]name]"

    def test_name_with_multiple_brackets(self):
        col = FabricColumn(column="a]b]c", dtype="int")
        assert col.quoted == "[a]]b]]c]"


class TestFabricColumnDataType:
    def test_datetime2_includes_scale(self):
        col = FabricColumn(column="created_at", dtype="datetime2", numeric_scale=6)
        assert col.data_type == "datetime2(6)"

    def test_datetime2_custom_scale(self):
        col = FabricColumn(column="created_at", dtype="datetime2", numeric_scale=3)
        assert col.data_type == "datetime2(3)"

    def test_non_datetime2_delegates_to_super(self):
        col = FabricColumn(column="name", dtype="varchar", char_size=100)
        assert col.data_type == "varchar(100)"
