import argparse
from unittest.mock import MagicMock

import pytest

from fabric_assessment_tool.commands.assess import AssessCommand


def build_parser(command: AssessCommand) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    command.configure_parser(parser)
    return parser


def test_complexity_parser_defaults_are_secure():
    command = AssessCommand()
    args = build_parser(command).parse_args(["-o", "output"])

    assert args.sql_complexity is False
    assert args.sql_definition_redaction == "full"
    assert args.sql_complexity_schemas == ""


def test_workspace_long_alias_matches_documentation():
    command = AssessCommand()
    args = build_parser(command).parse_args(
        ["-o", "output", "--ws", "workspace-one,workspace-two"]
    )

    assert args.workspace == "workspace-one,workspace-two"


def test_complexity_options_are_propagated():
    command = AssessCommand()
    command.assessment_service = MagicMock()
    command.assessment_service.assess.return_value = {}
    args = build_parser(command).parse_args(
        [
            "-o",
            "output",
            "--sql-complexity",
            "--sql-definition-redaction",
            "none",
            "--sql-complexity-schemas",
            "Sales, Reporting",
        ]
    )

    command.handle(args)

    kwargs = command.assessment_service.assess.call_args.kwargs
    assert kwargs["sql_complexity"] is True
    assert kwargs["sql_definition_redaction"] == "none"
    assert kwargs["sql_complexity_schemas"] == ["Sales", "Reporting"]


def test_complexity_options_require_feature_flag():
    command = AssessCommand()
    args = build_parser(command).parse_args(
        ["-o", "output", "--sql-complexity-schemas", "dbo"]
    )

    with pytest.raises(ValueError, match="require --sql-complexity"):
        command.handle(args)


def test_complexity_is_rejected_for_databricks():
    command = AssessCommand()
    args = build_parser(command).parse_args(
        ["-o", "output", "--source", "databricks", "--sql-complexity"]
    )

    with pytest.raises(ValueError, match="only supported for Synapse"):
        command.handle(args)
