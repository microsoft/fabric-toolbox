import agate
import dbt_common.exceptions
import pytest
from dbt_common.contracts.constraints import (
    ColumnLevelConstraint,
    ConstraintType,
    ModelLevelConstraint,
)

from dbt.adapters.fabric.fabric_adapter import FabricAdapter


class TestConvertBooleanType:
    def test_returns_bit(self):
        assert FabricAdapter.convert_boolean_type(None, None) == "bit"


class TestConvertDatetimeType:
    def test_returns_datetime2(self):
        assert FabricAdapter.convert_datetime_type(None, None) == "datetime2(6)"


class TestConvertTimeType:
    def test_returns_time6(self):
        assert FabricAdapter.convert_time_type(None, None) == "time(6)"


class TestConvertNumberType:
    def test_returns_float_when_decimals_present(self):
        table = agate.Table([[1.5], [2.3]], column_names=["val"], column_types=[agate.Number()])
        assert FabricAdapter.convert_number_type(table, 0) == "float"

    def test_returns_int_when_no_decimals(self):
        table = agate.Table([[1], [2]], column_names=["val"], column_types=[agate.Number()])
        assert FabricAdapter.convert_number_type(table, 0) == "int"


class TestConvertTextType:
    def test_short_strings_get_minimum_length_16(self):
        table = agate.Table([["hi"], ["ok"]], column_names=["val"], column_types=[agate.Text()])
        assert FabricAdapter.convert_text_type(table, 0) == "varchar(16)"

    def test_long_strings_use_max_utf8_byte_length(self):
        long_val = "a" * 100
        table = agate.Table(
            [[long_val], ["short"]], column_names=["val"], column_types=[agate.Text()]
        )
        assert FabricAdapter.convert_text_type(table, 0) == "varchar(100)"

    def test_multibyte_characters_use_byte_length(self):
        val = "ünïcödé tëxt dätä"
        table = agate.Table([[val]], column_names=["val"], column_types=[agate.Text()])
        expected_len = len(val.encode("utf-8"))
        assert expected_len > 16
        assert FabricAdapter.convert_text_type(table, 0) == f"varchar({expected_len})"

    def test_empty_column_defaults_to_64(self):
        table = agate.Table([[None]], column_names=["val"], column_types=[agate.Text()])
        assert FabricAdapter.convert_text_type(table, 0) == "varchar(64)"


class TestQuote:
    def test_wraps_in_brackets(self):
        assert FabricAdapter.quote("my_table") == "[my_table]"

    def test_escapes_closing_bracket(self):
        assert FabricAdapter.quote("tricky]name") == "[tricky]]name]"

    def test_escapes_multiple_closing_brackets(self):
        assert FabricAdapter.quote("a]b]c") == "[a]]b]]c]"


class TestDateFunction:
    def test_returns_getdate(self):
        assert FabricAdapter.date_function() == "getdate()"


def _make_adapter_instance():
    return object.__new__(FabricAdapter)


class TestTimestampAddSql:
    def test_default_parameters(self):
        adapter = _make_adapter_instance()
        result = adapter.timestamp_add_sql("my_col")
        assert result == "DATEADD(hour,1,my_col)"

    def test_custom_parameters(self):
        adapter = _make_adapter_instance()
        result = adapter.timestamp_add_sql("ts_col", number=5, interval="day")
        assert result == "DATEADD(day,5,ts_col)"


class TestStringAddSql:
    def test_append(self):
        adapter = _make_adapter_instance()
        result = adapter.string_add_sql("col", "suffix")
        assert result == "col + 'suffix'"

    def test_prepend(self):
        adapter = _make_adapter_instance()
        result = adapter.string_add_sql("col", "prefix", location="prepend")
        assert result == "'prefix' + col"

    def test_invalid_location_raises(self):
        adapter = _make_adapter_instance()
        with pytest.raises(ValueError, match="unexpected location"):
            adapter.string_add_sql("col", "val", location="middle")


class TestValidIncrementalStrategies:
    def test_returns_expected_strategies(self):
        adapter = _make_adapter_instance()
        assert adapter.valid_incremental_strategies() == [
            "append",
            "delete+insert",
            "microbatch",
            "merge",
        ]


class TestRenderColumnConstraint:
    def test_not_null(self):
        constraint = ColumnLevelConstraint(type=ConstraintType.not_null)
        assert FabricAdapter.render_column_constraint(constraint) == "not null"

    def test_unique_returns_empty_string(self):
        constraint = ColumnLevelConstraint(type=ConstraintType.unique)
        assert FabricAdapter.render_column_constraint(constraint) == ""

    def test_primary_key_returns_empty_string(self):
        constraint = ColumnLevelConstraint(type=ConstraintType.primary_key)
        assert FabricAdapter.render_column_constraint(constraint) == ""

    def test_check_returns_empty_string(self):
        constraint = ColumnLevelConstraint(type=ConstraintType.check)
        assert FabricAdapter.render_column_constraint(constraint) == ""


class TestRenderModelConstraint:
    def test_unique(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.unique, name="uq_col1", columns=["col1"]
        )
        result = FabricAdapter.render_model_constraint(constraint)
        assert result == "add constraint uq_col1 unique nonclustered(col1) not enforced"

    def test_unique_multiple_columns(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.unique, name="uq_multi", columns=["col1", "col2"]
        )
        result = FabricAdapter.render_model_constraint(constraint)
        assert result == "add constraint uq_multi unique nonclustered(col1, col2) not enforced"

    def test_primary_key(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.primary_key, name="pk_id", columns=["id"]
        )
        result = FabricAdapter.render_model_constraint(constraint)
        assert result == "add constraint pk_id primary key nonclustered(id) not enforced"

    def test_foreign_key_with_expression(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.foreign_key,
            name="fk_order",
            columns=["order_id"],
            expression="orders(id)",
        )
        result = FabricAdapter.render_model_constraint(constraint)
        assert (
            result
            == "add constraint fk_order foreign key(order_id) references orders(id) not enforced"
        )

    def test_foreign_key_without_expression_returns_none(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.foreign_key, name="fk_orphan", columns=["col1"]
        )
        assert FabricAdapter.render_model_constraint(constraint) is None

    def test_custom_with_expression(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.custom,
            name="chk_positive",
            columns=["amount"],
            expression="check (amount > 0)",
        )
        result = FabricAdapter.render_model_constraint(constraint)
        assert result == "add constraint check (amount > 0)"

    def test_custom_without_expression_returns_none(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.custom, name="chk_empty", columns=["col1"]
        )
        assert FabricAdapter.render_model_constraint(constraint) is None

    def test_missing_name_raises(self):
        constraint = ModelLevelConstraint(type=ConstraintType.unique, name=None, columns=["col1"])
        with pytest.raises(dbt_common.exceptions.DbtDatabaseError, match="Constraint name"):
            FabricAdapter.render_model_constraint(constraint)

    def test_check_type_returns_none(self):
        constraint = ModelLevelConstraint(
            type=ConstraintType.check, name="chk_test", columns=["col1"]
        )
        assert FabricAdapter.render_model_constraint(constraint) is None
