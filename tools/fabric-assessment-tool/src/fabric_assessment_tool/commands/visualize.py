import argparse
import webbrowser
from pathlib import Path

from fabric_assessment_tool.commands.base import BaseCommand
from fabric_assessment_tool.services.visualization_service import VisualizationService


class VisualizeCommand(BaseCommand):
    """Command to generate HTML visualization reports from assessment results."""

    def __init__(self):
        self.visualization_service = VisualizationService()

    def get_name(self) -> str:
        return "visualize"

    def get_description(self) -> str:
        return """Generate interactive HTML reports from assessment results.

Creates standalone HTML reports with charts and tables to visualize 
assessment data. Reports can be viewed in any browser and work offline.
All views are generated and can be navigated between in the browser.

Views:
  overview         Global summary across all workspaces (default)
  admin            Integration runtimes, linked services, endpoints
  data-engineering Notebooks, Spark pools, jobs, clusters
  data-warehousing SQL pools, tables, databases, code objects
  data-integration Pipelines, dataflows, datasets

Examples:
  fat visualize -i ./assessment_output -o ./reports
  fat visualize -i ./assessment_output --view data-engineering --open
  fat visualize -i ./assessment_output --workspace myworkspace --open
"""

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "-i",
            "--input",
            required=True,
            help="Path to assessment output directory (from 'fat assess' command)",
        )

        parser.add_argument(
            "-o",
            "--output",
            default=None,
            help="Output directory for HTML reports (default: <input>/reports)",
        )

        parser.add_argument(
            "--view",
            choices=[
                "overview",
                "admin",
                "data-engineering",
                "data-warehousing",
                "data-integration",
            ],
            default="overview",
            help="Initial view to open with --open flag (default: overview)",
        )

        parser.add_argument(
            "--workspace",
            "-ws",
            default=None,
            help="Generate report for specific workspace only",
        )

        parser.add_argument(
            "--open",
            action="store_true",
            help="Open the generated report in default browser",
        )

    def handle(self, args: argparse.Namespace) -> None:
        input_path = Path(args.input).resolve()
        if not input_path.exists():
            print(f"Error: Input directory does not exist: {input_path}")
            return

        output_path = (
            Path(args.output).resolve() if args.output else input_path / "reports"
        )

        print(f"Generating visualization report...")
        print(f"  Input: {input_path}")
        print(f"  Output: {output_path}")
        print(f"  View: {args.view}")
        if args.workspace:
            print(f"  Workspace: {args.workspace}")

        try:
            result = self.visualization_service.generate_report(
                input_path=str(input_path),
                output_path=str(output_path),
                view=args.view,
                workspace=args.workspace,
            )

            print(f"\nReport generated successfully!")
            print(f"  Files created: {result['files_created']}")
            print(f"  Main report: {result['main_report']}")

            if args.open:
                report_url = Path(result["main_report"]).as_uri()
                print(f"\nOpening report in browser...")
                webbrowser.open(report_url)

        except Exception as e:
            print(f"Error generating report: {e}")
            raise
