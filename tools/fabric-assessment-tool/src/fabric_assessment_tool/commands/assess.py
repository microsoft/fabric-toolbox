import argparse

from ..utils import ui as utils_ui
from ..services.assessment_service import AssessmentService
from .base import BaseCommand

SERVERLESS_HISTORY_DAYS_MAX = 45
SERVERLESS_TOP_N_MAX = 10000


def _int_range(min_value: int, max_value: int):
    """Build an argparse type for bounded integers."""

    def _parse(value: str) -> int:
        int_value = int(value)
        if not min_value <= int_value <= max_value:
            raise argparse.ArgumentTypeError(
                f"value must be between {min_value} and {max_value}"
            )
        return int_value

    return _parse


def _bounded_integer(minimum: int, maximum: int):
    def parse(value: str) -> int:
        try:
            parsed = int(value)
        except ValueError as exc:
            raise argparse.ArgumentTypeError("must be an integer") from exc
        if not minimum <= parsed <= maximum:
            raise argparse.ArgumentTypeError(f"must be between {minimum} and {maximum}")
        return parsed

    return parse


def positive_int(value: str) -> int:
    """Argparse type requiring a positive integer."""

    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


class AssessCommand(BaseCommand):
    """Command for assessing data sources."""

    def __init__(self):
        self.assessment_service = AssessmentService()

    def get_name(self) -> str:
        return "assess"

    def get_description(self) -> str:
        return """Assess data sources for migration readiness.
        
Examples:
  fat assess --source synapse --mode full --ws workspace1,workspace2 -o output_dir/
  fat assess --source synapse --mode full --ws workspace1 --subscription-id 12345678-1234-1234-1234-123456789012 -o output_dir/
  fat assess --source synapse --mode full --ws workspace1 --max-column-objects 500 -o output_dir/
  fat assess --source databricks --mode full --ws my-workspace --output results/ --format json
  fat assess --source databricks --cloud aws --ws my-workspace --output results/
  fat assess --source databricks --cloud aws --ws dev,prod --resources jobs -o results/
        """

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Configure argument parser for assess command."""
        parser.add_argument(
            "--source",
            choices=["databricks", "synapse"],
            default="synapse",
            help="Source platform to assess (databricks, synapse, or others in the future)",
        )

        parser.add_argument(
            "--mode",
            choices=["full"],
            default="full",
            help="Assessment mode (currently supports: full)",
        )

        parser.add_argument(
            "--cloud",
            choices=["azure", "aws"],
            default="azure",
            help=(
                "Cloud provider for the source platform. Use 'aws' with "
                "Databricks workspaces authenticated through DATABRICKS_* "
                "environment variables."
            ),
        )

        parser.add_argument(
            "-o",
            "--output",
            required=True,
            help="Output directory path for assessment results (will create folder structure)",
        )

        parser.add_argument(
            "--ws",
            "--workspace",
            default="",
            dest="workspace",
            help="Comma-separated list of workspace names to assess",
        )

        parser.add_argument(
            "--format",
            choices=["json", "csv", "parquet"],
            default="json",
            help="Output format for detailed data (default: json)",
        )

        parser.add_argument(
            "--resources",
            default=None,
            help=(
                "Comma-separated list of resource types to extract (default: all). "
                "Use to re-extract only specific resources without repeating a full assessment. "
                "Valid Databricks resources: clusters, sql_warehouses, notebooks, jobs, "
                "catalogs, external_locations, connections, secret_scopes, pipelines, "
                "repos, experiments, serving_endpoints, alerts, genie_spaces, "
                "cluster_policies, instance_pools"
            ),
        )

        parser.add_argument(
            "--subscription-id",
            help="Azure subscription ID (if not provided, will use default credentials)",
        )

        parser.add_argument(
            "--download-notebooks",
            action="store_true",
            default=False,
            help="Download and export full notebook source content (disabled by default). "
            "Stores decoded notebook files in a notebook_sources/ folder.",
        )

        parser.add_argument(
            "--auth-method",
            choices=["azure-cli", "fabric"],
            default=None,
            help="Authentication method (default: auto-detect). Use 'fabric' when running inside a Fabric Notebook",
        )

        parser.add_argument(
            "--sql-admin-password",
            default=None,
            help="SQL admin password for dedicated SQL pools (bypasses interactive prompt)",
        )

        parser.add_argument(
            "--create-dmv",
            action="store_true",
            default=False,
            help="Auto-create vTableSizes DMV without confirmation prompt (for non-interactive execution)",
        )

        parser.add_argument(
            "--skip-columns",
            action="store_true",
            default=False,
            help="Skip ODBC column metadata collection and compatibility summaries",
        )

        parser.add_argument(
            "--max-column-objects",
            type=positive_int,
            default=None,
            metavar="N",
            help=(
                "Collect columns for at most N tables/views per database, "
                "ordered deterministically without partial objects"
            ),
        )

        # SQL authentication mode options for dedicated SQL pools
        parser.add_argument(
            "--sql-auth-mode",
            choices=["sql", "entra-interactive", "entra-spn", "entra-default"],
            default="sql",
            help=(
                "SQL pool authentication mode (default: sql). Options: "
                "'sql' for SQL authentication, "
                "'entra-interactive' for Entra ID browser login with MFA support, "
                "'entra-spn' for Service Principal authentication, "
                "'entra-default' for Entra ID default (Azure CLI, managed identity)"
            ),
        )

        parser.add_argument(
            "--sql-client-id",
            default=None,
            help="Service principal client ID for Entra ID SPN authentication (required with --sql-auth-mode entra-spn)",
        )

        parser.add_argument(
            "--sql-client-secret",
            default=None,
            help="Service principal client secret for Entra ID SPN authentication (required with --sql-auth-mode entra-spn)",
        )

        parser.add_argument(
            "--sql-tenant-id",
            default=None,
            help="Azure tenant ID for Entra ID SPN authentication (optional, defaults to 'common')",
        )

        parser.add_argument(
            "--query-history-days",
            type=_bounded_integer(1, 365),
            default=7,
            help="Dedicated SQL pool query-history lookback in days (default: 7)",
        )

        parser.add_argument(
            "--query-history-top",
            type=_bounded_integer(1, 10000),
            default=1000,
            help="Maximum recent requests and sessions retained per dedicated pool (default: 1000)",
        )

        parser.add_argument(
            "--include-sql-text",
            action="store_true",
            default=False,
            help="Include SQL command text in JSON output (redacted by default)",
        )

        parser.add_argument(
            "--skip-query-history",
            action="store_true",
            default=False,
            help="Skip dedicated SQL pool request/session workload collection",
        )

        parser.add_argument(
            "--serverless-history-days",
            type=_int_range(1, SERVERLESS_HISTORY_DAYS_MAX),
            default=30,
            help=(
                "Serverless SQL activity history window in days "
                f"(default: 30, range: 1-{SERVERLESS_HISTORY_DAYS_MAX})"
            ),
        )

        parser.add_argument(
            "--serverless-top-n",
            type=_int_range(1, SERVERLESS_TOP_N_MAX),
            default=1000,
            help=(
                "Maximum number of detailed serverless SQL activity rows to retain "
                f"(default: 1000, range: 1-{SERVERLESS_TOP_N_MAX})"
            ),
        )

        parser.add_argument(
            "--skip-serverless-activity",
            action="store_true",
            default=False,
            help="Skip optional serverless SQL activity collection",
        )

        parser.add_argument(
            "--serverless-sql-auth-mode",
            choices=["sql", "entra-interactive", "entra-spn", "entra-default"],
            default=None,
            help=(
                "Optional serverless SQL auth-mode override. If omitted, inherits "
                "--sql-auth-mode or the existing dedicated SQL settings."
            ),
        )

        parser.add_argument(
            "--serverless-sql-username",
            default=None,
            help=(
                "Optional SQL username override for serverless activity collection. "
                "If omitted, inherits the workspace SQL admin login when available."
            ),
        )

        parser.add_argument(
            "--serverless-sql-password",
            default=None,
            help=(
                "Optional SQL password override for serverless activity collection. "
                "If omitted, inherits --sql-admin-password when available."
            ),
        )

        parser.add_argument(
            "--serverless-sql-client-id",
            default=None,
            help=(
                "Optional service principal client ID override for serverless SQL "
                "when using --serverless-sql-auth-mode entra-spn."
            ),
        )

        parser.add_argument(
            "--serverless-sql-client-secret",
            default=None,
            help=(
                "Optional service principal client secret override for serverless SQL "
                "when using --serverless-sql-auth-mode entra-spn."
            ),
        )

        parser.add_argument(
            "--serverless-sql-tenant-id",
            default=None,
            help=(
                "Optional service principal tenant override for serverless SQL "
                "(defaults to inherited dedicated SQL tenant or 'common')."
            ),
        )

    def handle(self, args: argparse.Namespace) -> None:
        """Handle the assess command execution."""
        print(f"Starting assessment of {args.source} workspaces...")

        # Parse workspace names
        workspaces = [
            ws.strip() for ws in args.workspace.split(",") if ws.strip() != ""
        ]

        # Parse resources filter
        resources = None
        if getattr(args, "resources", None):
            resources = [r.strip() for r in args.resources.split(",") if r.strip()]

        try:
            result = self.assessment_service.assess(
                source=args.source,
                mode=args.mode,
                cloud=args.cloud,
                workspaces=workspaces,
                output_path=args.output,
                output_format=getattr(args, "format", "json"),
                subscription_id=getattr(args, "subscription_id", None),
                auth_method=getattr(args, "auth_method", None),
                sql_admin_password=getattr(args, "sql_admin_password", None),
                create_dmv=getattr(args, "create_dmv", False),
                sql_auth_mode=getattr(args, "sql_auth_mode", "sql"),
                sql_client_id=getattr(args, "sql_client_id", None),
                sql_client_secret=getattr(args, "sql_client_secret", None),
                sql_tenant_id=getattr(args, "sql_tenant_id", None),
                resources=resources,
                download_notebooks=getattr(args, "download_notebooks", False),
                query_history_days=getattr(args, "query_history_days", 7),
                query_history_top=getattr(args, "query_history_top", 1000),
                include_sql_text=getattr(args, "include_sql_text", False),
                skip_query_history=getattr(args, "skip_query_history", False),
                serverless_history_days=getattr(args, "serverless_history_days", 30),
                serverless_top_n=getattr(args, "serverless_top_n", 1000),
                skip_serverless_activity=getattr(
                    args, "skip_serverless_activity", False
                ),
                serverless_sql_auth_mode=getattr(
                    args, "serverless_sql_auth_mode", None
                ),
                serverless_sql_username=getattr(args, "serverless_sql_username", None),
                serverless_sql_password=getattr(args, "serverless_sql_password", None),
                serverless_sql_client_id=getattr(
                    args, "serverless_sql_client_id", None
                ),
                serverless_sql_client_secret=getattr(
                    args, "serverless_sql_client_secret", None
                ),
                serverless_sql_tenant_id=getattr(
                    args, "serverless_sql_tenant_id", None
                ),
                skip_columns=getattr(args, "skip_columns", False),
                max_column_objects=getattr(args, "max_column_objects", None),
            )

            utils_ui.print(f"Assessment completed successfully!")

            # Show export information
            if result.get("export_results"):
                utils_ui.print(f"\nWorkspace Details:")
                for export_result in result["export_results"]:
                    workspace_name = export_result.get("workspace_name", "Unknown")
                    workspace_dir = export_result.get("workspace_directory", "")
                    total_files = export_result.get("total_files", 0)
                    utils_ui.print(
                        f"  {workspace_name}: {total_files} files in {workspace_dir}"
                    )

            # Show detailed status information for each workspace
            if result.get("results"):
                print(f"\nWorkspace Status:")
                for workspace_result in result["results"]:
                    workspace_name = workspace_result.get("workspace", "Unknown")
                    status = workspace_result.get("status", "unknown")

                    if status == "success":
                        print(f"  ✓ {workspace_name}: Completed successfully")
                    elif status == "incomplete":
                        assessment_status = workspace_result.get(
                            "assessment_status", {}
                        )
                        description = assessment_status.get(
                            "description", "Assessment incomplete"
                        )
                        print(f"  ⚠ {workspace_name}: {description}")
                    elif status == "failed":
                        error = workspace_result.get("error", "Unknown error")
                        print(f"  ✗ {workspace_name}: Failed - {error}")

            if result.get("summary"):
                print(f"\nSummary:")
                for key, value in result["summary"].items():
                    if key == "incomplete_workspaces" and value > 0:
                        print(f"  {key}: {value} (completed with limited permissions)")
                    else:
                        print(f"  {key}: {value}")

        except Exception as e:
            print(f"Assessment failed: {e}")
            raise
