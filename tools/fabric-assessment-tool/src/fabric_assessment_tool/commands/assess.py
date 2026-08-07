import argparse
import logging
from pathlib import Path

from ..utils import ui as utils_ui
from ..services.assessment_service import AssessmentService
from .base import BaseCommand

LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def _configure_logging(log_file: str | None = None) -> None:
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    if not log_file:
        return

    root_logger.setLevel(logging.DEBUG)
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(file_handler)


logger = logging.getLogger(__name__)


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
            "--max-parallel-api-calls",
            type=int,
            default=8,
            help="Maximum concurrent Databricks API calls for notebook/job and catalog schema extraction (default: 8).",
        )
        parser.add_argument(
            "--log-file",
            default=None,
            help="Optional log file path. When provided, logs are written to this file.",
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

    def handle(self, args: argparse.Namespace) -> None:
        """Handle the assess command execution."""
        _configure_logging(getattr(args, "log_file", None))
        if getattr(args, "log_file", None):
            logger.info("Logging initialized (log_file=%s)", getattr(args, "log_file"))
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
                max_parallel_api_calls=getattr(args, "max_parallel_api_calls", 8),
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
