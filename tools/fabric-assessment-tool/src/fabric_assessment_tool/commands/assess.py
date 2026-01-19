import argparse

from ..utils import ui as utils_ui
from ..services.assessment_service import AssessmentService
from .base import BaseCommand


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
            "-o",
            "--output",
            required=True,
            help="Output directory path for assessment results (will create folder structure)",
        )

        parser.add_argument(
            "-ws",
            "--workspace",
            default="",
            help="Comma-separated list of workspace names to assess",
        )

        parser.add_argument(
            "--format",
            choices=["json", "csv", "parquet"],
            default="json",
            help="Output format for detailed data (default: json)",
        )

        parser.add_argument(
            "--subscription-id",
            help="Azure subscription ID (if not provided, will use default credentials)",
        )

    def handle(self, args: argparse.Namespace) -> None:
        """Handle the assess command execution."""
        print(f"Starting assessment of {args.source} workspaces...")

        # Parse workspace names
        workspaces = [
            ws.strip() for ws in args.workspace.split(",") if ws.strip() != ""
        ]

        try:
            result = self.assessment_service.assess(
                source=args.source,
                mode=args.mode,
                workspaces=workspaces,
                output_path=args.output,
                output_format=getattr(args, "format", "json"),
                subscription_id=getattr(args, "subscription_id", None),
            )

            utils_ui.print(f"Assessment completed successfully!")

            # Show export information
            if result.get("export_results"):
                utils_ui.print(f"\nWorkspace Details:")
                for export_result in result["export_results"]:
                    workspace_name = export_result.get("workspace_name", "Unknown")
                    workspace_dir = export_result.get("workspace_directory", "")
                    total_files = export_result.get("total_files", 0)
                    utils_ui.print(f"  {workspace_name}: {total_files} files in {workspace_dir}")

            # Show detailed status information for each workspace
            if result.get("results"):
                print(f"\nWorkspace Status:")
                for workspace_result in result["results"]:
                    workspace_name = workspace_result.get("workspace", "Unknown")
                    status = workspace_result.get("status", "unknown")
                    
                    if status == "success":
                        print(f"  ✓ {workspace_name}: Completed successfully")
                    elif status == "incomplete":
                        assessment_status = workspace_result.get("assessment_status", {})
                        description = assessment_status.get("description", "Assessment incomplete")
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
