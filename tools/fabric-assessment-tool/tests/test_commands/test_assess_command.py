"""Tests for AssessCommand serverless CLI options."""

import argparse

import pytest

from fabric_assessment_tool.commands.assess import AssessCommand


def _build_parser() -> argparse.ArgumentParser:
    command = AssessCommand()
    parser = argparse.ArgumentParser()
    command.configure_parser(parser)
    return parser


def test_assess_parser_serverless_defaults():
    """Serverless CLI defaults should match the approved plan."""
    parser = _build_parser()

    args = parser.parse_args(["--source", "synapse", "-o", "output"])

    assert args.serverless_history_days == 30
    assert args.serverless_top_n == 1000
    assert args.skip_serverless_activity is False
    assert args.serverless_sql_auth_mode is None
    assert args.serverless_sql_username is None


@pytest.mark.parametrize(
    ("flag", "value"),
    [
        ("--serverless-history-days", "0"),
        ("--serverless-history-days", "46"),
        ("--serverless-top-n", "0"),
        ("--serverless-top-n", "10001"),
    ],
)
def test_assess_parser_serverless_bounds(flag, value):
    """Serverless CLI bounds should be enforced at parse time."""
    parser = _build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(["--source", "synapse", "-o", "output", flag, value])


def test_assess_handle_passes_serverless_arguments(monkeypatch):
    """AssessCommand.handle should forward serverless arguments to the service."""
    command = AssessCommand()
    captured = {}

    def fake_assess(**kwargs):
        captured.update(kwargs)
        return {"results": [], "summary": {"assessed_workspaces": 0}}

    monkeypatch.setattr(command.assessment_service, "assess", fake_assess)

    args = _build_parser().parse_args(
        [
            "--source",
            "synapse",
            "-o",
            "output",
            "--workspace",
            "ws1,ws2",
            "--serverless-history-days",
            "15",
            "--serverless-top-n",
            "250",
            "--skip-serverless-activity",
            "--serverless-sql-auth-mode",
            "entra-default",
            "--serverless-sql-username",
            "override_user",
            "--serverless-sql-password",
            "override_password",
            "--serverless-sql-client-id",
            "override_client_id",
            "--serverless-sql-client-secret",
            "override_client_secret",
            "--serverless-sql-tenant-id",
            "override_tenant_id",
        ]
    )

    command.handle(args)

    assert captured["workspaces"] == ["ws1", "ws2"]
    assert captured["serverless_history_days"] == 15
    assert captured["serverless_top_n"] == 250
    assert captured["skip_serverless_activity"] is True
    assert captured["serverless_sql_auth_mode"] == "entra-default"
    assert captured["serverless_sql_username"] == "override_user"
    assert captured["serverless_sql_password"] == "override_password"
    assert captured["serverless_sql_client_id"] == "override_client_id"
    assert captured["serverless_sql_client_secret"] == "override_client_secret"
    assert captured["serverless_sql_tenant_id"] == "override_tenant_id"
