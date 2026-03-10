"""Tests for VisualizationService."""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from fabric_assessment_tool.services.visualization_service import VisualizationService


@pytest.fixture
def visualization_service():
    """Create a VisualizationService instance."""
    return VisualizationService()


@pytest.fixture
def sample_synapse_assessment_dir(tmp_path):
    """Create a sample Synapse assessment directory structure."""
    workspace_dir = tmp_path / "test-workspace"
    workspace_dir.mkdir()

    # Create summary.json
    summary = {
        "workspace_info": {
            "name": "test-workspace",
            "resource_group": "test-rg",
            "location": "eastus",
            "status": "Online",
        },
        "assessment_status": "completed",
        "data_engineering": {
            "notebooks": 5,
            "spark_pools": 2,
            "spark_job_definitions": 1,
        },
        "data_integration": {
            "pipelines": 10,
            "dataflows": 3,
            "datasets": 15,
            "linked_services": 8,
        },
        "data_warehouse": {
            "dedicated_pools": 1,
            "serverless_pool": True,
            "total_tables": 50,
        },
    }
    with open(workspace_dir / "summary.json", "w") as f:
        json.dump(summary, f)

    # Create resources directory
    resources_dir = workspace_dir / "resources"
    resources_dir.mkdir()

    # Create notebooks
    notebooks_dir = resources_dir / "notebooks"
    notebooks_dir.mkdir()
    for i in range(3):
        nb_data = {
            "type": "notebook",
            "data": {
                "name": f"notebook_{i}",
                "language": "Python" if i % 2 == 0 else "Scala",
            },
            "exported_at": "2024-01-15T10:00:00",
        }
        with open(notebooks_dir / f"notebook_{i}.json", "w") as f:
            json.dump(nb_data, f)

    # Create pipelines
    pipelines_dir = resources_dir / "pipelines"
    pipelines_dir.mkdir()
    for i in range(2):
        pipe_data = {
            "type": "pipeline",
            "data": {
                "name": f"pipeline_{i}",
                "description": f"Test pipeline {i}",
                "activities_count": (i + 1) * 5,
            },
            "exported_at": "2024-01-15T10:00:00",
        }
        with open(pipelines_dir / f"pipeline_{i}.json", "w") as f:
            json.dump(pipe_data, f)

    # Create admin directory
    admin_dir = workspace_dir / "admin"
    admin_dir.mkdir()

    # Create linked services
    ls_dir = admin_dir / "linked_services"
    ls_dir.mkdir()
    ls_data = {
        "type": "linked_service",
        "data": {"name": "AzureBlobStorage1", "type": "AzureBlobStorage"},
        "exported_at": "2024-01-15T10:00:00",
    }
    with open(ls_dir / "AzureBlobStorage1.json", "w") as f:
        json.dump(ls_data, f)

    return tmp_path


@pytest.fixture
def sample_databricks_assessment_dir(tmp_path):
    """Create a sample Databricks assessment directory structure."""
    workspace_dir = tmp_path / "dbx-workspace"
    workspace_dir.mkdir()

    # Create summary.json with Databricks structure
    summary = {
        "workspace_info": {
            "name": "dbx-workspace",
            "resource_group": "dbx-rg",
            "url": "https://adb-123.azuredatabricks.net",
            "status": "RUNNING",
            "tier": "premium",
        },
        "assessment_status": "completed",
        "counts": {
            "clusters": 3,
            "sql_warehouses": 1,
            "notebooks": 10,
            "jobs": 5,
            "tables": 25,
        },
    }
    with open(workspace_dir / "summary.json", "w") as f:
        json.dump(summary, f)

    # Create resources directory
    resources_dir = workspace_dir / "resources"
    resources_dir.mkdir()

    # Create clusters
    clusters_dir = resources_dir / "clusters"
    clusters_dir.mkdir()
    cluster_data = {
        "type": "cluster",
        "data": {
            "cluster_id": "0123-456789-abc123",
            "cluster_name": "test-cluster",
            "state": "RUNNING",
            "node_type_id": "Standard_DS3_v2",
            "spark_version": "13.3.x-scala2.12",
        },
        "exported_at": "2024-01-15T10:00:00",
    }
    with open(clusters_dir / "cluster_test-cluster.json", "w") as f:
        json.dump(cluster_data, f)

    return tmp_path


class TestVisualizationService:
    """Tests for VisualizationService."""

    def test_init(self, visualization_service):
        """Test service initialization."""
        assert visualization_service.env is not None
        assert "format_number" in visualization_service.env.filters
        assert "format_size" in visualization_service.env.filters

    def test_format_number_filter(self, visualization_service):
        """Test the format_number filter."""
        assert visualization_service._format_number(1000) == "1,000"
        assert visualization_service._format_number(1234567) == "1,234,567"
        assert visualization_service._format_number(0) == "0"
        assert visualization_service._format_number("invalid") == "invalid"

    def test_format_size_filter(self, visualization_service):
        """Test the format_size filter."""
        assert visualization_service._format_size(500) == "500.0 B"
        assert visualization_service._format_size(1024) == "1.0 KB"
        assert visualization_service._format_size(1048576) == "1.0 MB"
        assert visualization_service._format_size(1073741824) == "1.0 GB"
        assert visualization_service._format_size("invalid") == "invalid"

    def test_detect_platform_synapse(self, visualization_service):
        """Test platform detection for Synapse."""
        synapse_summary = {"data_engineering": {"notebooks": 5}}
        assert visualization_service._detect_platform(synapse_summary) == "synapse"

    def test_detect_platform_databricks(self, visualization_service):
        """Test platform detection for Databricks."""
        databricks_summary = {"counts": {"clusters": 3}}
        assert (
            visualization_service._detect_platform(databricks_summary) == "databricks"
        )

    def test_detect_platform_unknown(self, visualization_service):
        """Test platform detection for unknown structure."""
        unknown_summary = {"something": "else"}
        assert visualization_service._detect_platform(unknown_summary) == "unknown"

    def test_load_assessment_data_synapse(
        self, visualization_service, sample_synapse_assessment_dir
    ):
        """Test loading Synapse assessment data."""
        data = visualization_service._load_assessment_data(
            sample_synapse_assessment_dir
        )

        assert "workspaces" in data
        assert "test-workspace" in data["workspaces"]
        assert data["platform"] == "synapse"

        ws = data["workspaces"]["test-workspace"]
        assert ws["name"] == "test-workspace"
        assert ws["platform"] == "synapse"
        assert "summary" in ws
        assert "resources" in ws

    def test_load_assessment_data_databricks(
        self, visualization_service, sample_databricks_assessment_dir
    ):
        """Test loading Databricks assessment data."""
        data = visualization_service._load_assessment_data(
            sample_databricks_assessment_dir
        )

        assert "workspaces" in data
        assert "dbx-workspace" in data["workspaces"]
        assert data["platform"] == "databricks"

        ws = data["workspaces"]["dbx-workspace"]
        assert ws["platform"] == "databricks"

    def test_load_assessment_data_specific_workspace(
        self, visualization_service, sample_synapse_assessment_dir
    ):
        """Test loading only a specific workspace."""
        data = visualization_service._load_assessment_data(
            sample_synapse_assessment_dir, workspace="test-workspace"
        )
        assert "test-workspace" in data["workspaces"]
        assert len(data["workspaces"]) == 1

    def test_load_assessment_data_nonexistent_workspace(
        self, visualization_service, sample_synapse_assessment_dir
    ):
        """Test loading a non-existent workspace returns empty."""
        data = visualization_service._load_assessment_data(
            sample_synapse_assessment_dir, workspace="nonexistent"
        )
        assert len(data["workspaces"]) == 0

    def test_calculate_summary_synapse(self, visualization_service):
        """Test summary calculation for Synapse workspaces."""
        workspaces = {
            "ws1": {
                "platform": "synapse",
                "summary": {
                    "data_engineering": {"notebooks": 5, "spark_pools": 2},
                    "data_integration": {
                        "pipelines": 10,
                        "dataflows": 3,
                        "datasets": 15,
                        "linked_services": 8,
                    },
                    "data_warehouse": {"dedicated_pools": 1, "total_tables": 50},
                },
            }
        }

        summary = visualization_service._calculate_summary(workspaces)

        assert summary["workspace_count"] == 1
        assert summary["total_notebooks"] == 5
        assert summary["total_pipelines"] == 10
        assert summary["total_tables"] == 50
        assert summary["platforms"]["synapse"] == 1

    def test_calculate_summary_databricks(self, visualization_service):
        """Test summary calculation for Databricks workspaces."""
        workspaces = {
            "ws1": {
                "platform": "databricks",
                "summary": {
                    "counts": {
                        "clusters": 3,
                        "notebooks": 10,
                        "jobs": 5,
                        "tables": 25,
                    }
                },
            }
        }

        summary = visualization_service._calculate_summary(workspaces)

        assert summary["workspace_count"] == 1
        assert summary["total_notebooks"] == 10
        assert summary["total_clusters"] == 3
        assert summary["total_jobs"] == 5
        assert summary["platforms"]["databricks"] == 1

    def test_generate_report_overview(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating overview report - all views should be generated."""
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(sample_synapse_assessment_dir),
            output_path=str(output_dir),
            view="overview",
        )

        # All views should be generated regardless of --view parameter
        assert result["files_created"] >= 5  # index + 4 views + workspace pages
        assert Path(result["main_report"]).exists()
        assert "index.html" in result["main_report"]

        # Verify all view files exist
        assert (output_dir / "index.html").exists()
        assert (output_dir / "views" / "admin.html").exists()
        assert (output_dir / "views" / "data_engineering.html").exists()
        assert (output_dir / "views" / "data_warehousing.html").exists()
        assert (output_dir / "views" / "data_integration.html").exists()
        assert (output_dir / "workspaces" / "test-workspace.html").exists()

        # Verify HTML content
        with open(result["main_report"], "r", encoding="utf-8") as f:
            html = f.read()
            assert "Assessment Report" in html
            assert "test-workspace" in html

    def test_generate_report_admin_view(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating admin view report."""
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(sample_synapse_assessment_dir),
            output_path=str(output_dir),
            view="admin",
        )

        assert Path(result["main_report"]).exists()
        assert "admin.html" in result["main_report"]

    def test_generate_report_data_engineering_view(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating data engineering view report."""
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(sample_synapse_assessment_dir),
            output_path=str(output_dir),
            view="data-engineering",
        )

        assert Path(result["main_report"]).exists()
        assert "data_engineering.html" in result["main_report"]

    def test_generate_report_data_warehousing_view(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating data warehousing view report."""
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(sample_synapse_assessment_dir),
            output_path=str(output_dir),
            view="data-warehousing",
        )

        assert Path(result["main_report"]).exists()
        assert "data_warehousing.html" in result["main_report"]

    def test_generate_report_data_integration_view(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating data integration view report."""
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(sample_synapse_assessment_dir),
            output_path=str(output_dir),
            view="data-integration",
        )

        assert Path(result["main_report"]).exists()
        assert "data_integration.html" in result["main_report"]

    def test_aggregate_admin_data(self, visualization_service):
        """Test admin data aggregation."""
        workspaces = {
            "ws1": {
                "admin": {
                    "integration_runtimes": [
                        {"data": {"name": "IR1", "type": "SelfHosted"}}
                    ],
                    "linked_services": [
                        {"data": {"name": "LS1", "type": "AzureBlobStorage"}},
                        {"data": {"name": "LS2", "type": "AzureSqlDatabase"}},
                    ],
                }
            }
        }

        admin = visualization_service._aggregate_admin_data(workspaces)

        assert len(admin["integration_runtimes"]) == 1
        assert len(admin["linked_services"]) == 2
        assert admin["linked_service_types"]["AzureBlobStorage"] == 1
        assert admin["linked_service_types"]["AzureSqlDatabase"] == 1

    def test_aggregate_data_engineering(self, visualization_service):
        """Test data engineering aggregation."""
        workspaces = {
            "ws1": {
                "platform": "synapse",
                "resources": {
                    "notebooks": [
                        {"data": {"name": "nb1", "language": "Python"}},
                        {"data": {"name": "nb2", "language": "Scala"}},
                    ],
                    "spark_pools": [{"data": {"name": "sp1", "spark_version": "3.3"}}],
                },
            }
        }

        de = visualization_service._aggregate_data_engineering(workspaces)

        assert len(de["notebooks"]) == 2
        assert de["notebook_languages"]["Python"] == 1
        assert de["notebook_languages"]["Scala"] == 1
        assert len(de["spark_pools"]) == 1

    def test_generate_workspace_report(
        self, visualization_service, sample_synapse_assessment_dir, tmp_path
    ):
        """Test generating workspace-specific report."""
        output_dir = tmp_path / "reports"
        output_dir.mkdir()

        data = visualization_service._load_assessment_data(
            sample_synapse_assessment_dir
        )
        ws_file = visualization_service._generate_workspace_report(
            "test-workspace", data, output_dir
        )

        assert Path(ws_file).exists()
        assert "test-workspace.html" in ws_file

        with open(ws_file, "r", encoding="utf-8") as f:
            html = f.read()
            assert "test-workspace" in html

    def test_empty_input_directory(self, visualization_service, tmp_path):
        """Test handling of empty input directory."""
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        output_dir = tmp_path / "reports"

        result = visualization_service.generate_report(
            input_path=str(empty_dir),
            output_path=str(output_dir),
            view="overview",
        )

        # Should still generate a report, just with no workspaces
        assert result["files_created"] >= 1
        assert Path(result["main_report"]).exists()


class TestVisualizeCommand:
    """Tests for VisualizeCommand."""

    def test_command_name(self):
        """Test command name."""
        from fabric_assessment_tool.commands.visualize import VisualizeCommand

        cmd = VisualizeCommand()
        assert cmd.get_name() == "visualize"

    def test_command_description(self):
        """Test command description."""
        from fabric_assessment_tool.commands.visualize import VisualizeCommand

        cmd = VisualizeCommand()
        desc = cmd.get_description()
        assert "Generate interactive HTML reports" in desc
        assert "overview" in desc
        assert "admin" in desc

    def test_configure_parser(self):
        """Test argument parser configuration."""
        import argparse

        from fabric_assessment_tool.commands.visualize import VisualizeCommand

        cmd = VisualizeCommand()
        parser = argparse.ArgumentParser()
        cmd.configure_parser(parser)

        # Test parsing valid arguments
        args = parser.parse_args(["-i", "input_dir"])
        assert args.input == "input_dir"
        assert args.view == "overview"  # default

        args = parser.parse_args(["-i", "input", "--view", "admin", "-o", "output"])
        assert args.view == "admin"
        assert args.output == "output"
