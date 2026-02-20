import json
import os
from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fabric_assessment_tool.clients.databricks_client import DatabricksClient
from fabric_assessment_tool.clients.synapse_client import SynapseClient

from ..utils import ui as utils_ui
from .structured_export_service import DecimalEncoder, StructuredExportService


class AssessmentService:
    """Service for managing assessments of different data platforms."""

    def __init__(self):
        self.clients = {}
        self.export_service = StructuredExportService()

    def assess(
        self,
        source: str,
        mode: str,
        workspaces: List[str],
        output_path: str,
        output_format: str = "json",
        subscription_id: Optional[str] = None,
        auth_method: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Perform assessment on specified workspaces.

        Args:
            source: Source platform (databricks, synapse)
            mode: Assessment mode (full, etc.)
            workspaces: List of workspace names to assess
            output_path: Base path for output folder structure
            output_format: Export format (json, csv, parquet)
            subscription_id: Azure subscription ID (optional, will use Azure CLI default if not provided)
            auth_method: Authentication method ("azure-cli", "fabric", or None for auto-detect)

        Returns:
            Assessment results dictionary
        """
        # print(f"Initializing {source} client...")

        # Get or create client for the source
        client_kwargs = {}
        if subscription_id:
            client_kwargs["subscription_id"] = subscription_id
        if auth_method:
            client_kwargs["auth_method"] = auth_method
        client = self._get_client(source=source, **client_kwargs)

        # Perform assessment
        assessment_results = {
            "metadata": {
                "source": source,
                "mode": mode,
                "workspaces": workspaces,
                "timestamp": datetime.now().isoformat(),
                "version": "0.0.1",
                "output_format": output_format,
            },
            "results": [],
            "summary": {
                "total_workspaces": len(workspaces),
                "assessed_workspaces": 0,
                "incomplete_workspaces": 0,
                "failed_workspaces": 0,
            },
        }

        export_results = {"results": []}

        if not workspaces or len(workspaces) == 0:
            # Get all workspaces from the client and let the client choose which ones to assess
            client_workspaces = client.get_workspaces()
            workspace_names = [workspace.name for workspace in client_workspaces]
            workspaces = utils_ui.prompt_select_items(
                "Select workspaces:", workspace_names
            )
            for workspace_str in workspaces:
                utils_ui.print_grey(workspace_str)
            utils_ui.print_grey("------------------------------")
            if not utils_ui.prompt_confirm():
                utils_ui.print_fabric_assessment_tool("Aborted.")
                return {}

        # Assess each workspace
        for workspace in workspaces:
            # print(f"Assessing workspace: {workspace}")
            try:
                # Get assessment data as dataclass object
                workspace_assessment = client.assess_workspace(workspace, mode)

                # Export the assessment data using the structured export service
                export_result = self.export_service.export_assessment(
                    assessment_data=workspace_assessment,
                    workspace_name=workspace,
                    output_path=output_path,
                    format=output_format,
                )

                export_results["results"].append(export_result)

                # Determine the result status based on the assessment status
                assessment_status = workspace_assessment.status.status
                result_status = (
                    "success" if assessment_status == "completed" else "incomplete"
                )

                result_entry = {
                    "workspace": workspace,
                    "status": result_status,
                    "summary": workspace_assessment.get_summary(),
                    # "export_info": export_result,
                }

                # Include assessment status details if incomplete
                if assessment_status == "incomplete":
                    result_entry["assessment_status"] = {
                        "status": assessment_status,
                        "description": workspace_assessment.status.description,
                    }
                    assessment_results["summary"]["incomplete_workspaces"] += 1
                else:
                    assessment_results["summary"]["assessed_workspaces"] += 1

                assessment_results["results"].append(result_entry)
                # This is redundant now, as export info is included in each result
                # assessment_results["export_results"].append(export_result)

            except Exception as e:
                utils_ui.print_error(f"Failed to assess workspace {workspace}: {e}")
                assessment_results["results"].append(
                    {"workspace": workspace, "status": "failed", "error": str(e)}
                )
                assessment_results["summary"]["failed_workspaces"] += 1

        # Save overall assessment summary
        summary_file = self._save_assessment_summary(assessment_results, output_path)
        export_summary_file = self._save_export_results(export_results, output_path)

        utils_ui.print("")
        utils_ui.print(f"Assessment summary saved to: {summary_file}")
        utils_ui.print(f"Export results summary saved to: {export_summary_file}")
        utils_ui.print(f"Individual workspace details saved in: {output_path}")

        return assessment_results

    def _get_client(self, source: str, **kwargs) -> Any:
        """Get or create API client for the specified source."""
        client_key = f"{source}_{hash(str(kwargs))}"

        if client_key not in self.clients:
            if source == "synapse":
                self.clients[client_key] = SynapseClient(**kwargs)
            elif source == "databricks":
                self.clients[client_key] = DatabricksClient(**kwargs)
            else:
                raise ValueError(f"Unsupported source: {source}")

        return self.clients[client_key]

    def _save_assessment_summary(
        self, results: Dict[str, Any], output_path: str
    ) -> str:
        """Save overall assessment summary to the output directory."""
        # Create output directory if it doesn't exist
        os.makedirs(output_path, exist_ok=True)

        # Save the overall assessment summary
        summary_file = os.path.join(output_path, "assessment_summary.json")
        with open(summary_file, "w") as f:
            json.dump(results, f, indent=2, cls=DecimalEncoder)

        return summary_file

    def _save_export_results(self, results: Dict[str, Any], output_path: str) -> str:
        """Save export results summary to the output directory."""
        # Create output directory if it doesn't exist
        os.makedirs(output_path, exist_ok=True)

        # Save the export results summary
        export_summary_file = os.path.join(output_path, "export_results_summary.json")
        with open(export_summary_file, "w") as f:
            json.dump(results, f, indent=2, cls=DecimalEncoder)

        return export_summary_file

    def _save_results(self, results: Dict[str, Any], output_path: str) -> None:
        """Legacy method for backward compatibility."""
        # For backward compatibility, save as single file if output_path ends with .json
        if output_path.endswith(".json"):
            os.makedirs(
                os.path.dirname(output_path) if os.path.dirname(output_path) else ".",
                exist_ok=True,
            )
            with open(output_path, "w") as f:
                json.dump(results, f, indent=2, cls=DecimalEncoder)
            print(f"Assessment results saved to: {output_path}")
        else:
            # Use new structured approach
            self._save_assessment_summary(results, output_path)
