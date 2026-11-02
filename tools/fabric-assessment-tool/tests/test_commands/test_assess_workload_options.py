import argparse
from unittest.mock import Mock

import pytest

from fabric_assessment_tool.commands.assess import AssessCommand


def parser():
    result = argparse.ArgumentParser()
    AssessCommand().configure_parser(result)
    return result


def test_workload_cli_defaults():
    args = parser().parse_args(["-o", "output"])
    assert args.query_history_days == 7
    assert args.query_history_top == 1000
    assert args.include_sql_text is False
    assert args.skip_query_history is False


def test_workload_cli_options():
    args = parser().parse_args(
        [
            "-o",
            "output",
            "--query-history-days",
            "30",
            "--query-history-top",
            "5000",
            "--include-sql-text",
            "--skip-query-history",
        ]
    )
    assert args.query_history_days == 30
    assert args.query_history_top == 5000
    assert args.include_sql_text is True
    assert args.skip_query_history is True


def test_workload_options_are_forwarded_to_assessment_service():
    command = AssessCommand()
    command.assessment_service = Mock()
    command.assessment_service.assess.return_value = {}
    args = parser().parse_args(
        [
            "-o",
            "output",
            "--query-history-days",
            "14",
            "--query-history-top",
            "250",
            "--include-sql-text",
            "--skip-query-history",
        ]
    )

    command.handle(args)

    _, kwargs = command.assessment_service.assess.call_args
    assert kwargs["query_history_days"] == 14
    assert kwargs["query_history_top"] == 250
    assert kwargs["include_sql_text"] is True
    assert kwargs["skip_query_history"] is True


@pytest.mark.parametrize(
    "option,value",
    [
        ("--query-history-days", "0"),
        ("--query-history-days", "366"),
        ("--query-history-top", "0"),
        ("--query-history-top", "10001"),
    ],
)
def test_workload_cli_rejects_out_of_range_values(option, value):
    with pytest.raises(SystemExit):
        parser().parse_args(["-o", "output", option, value])
