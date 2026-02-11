import json
from abc import ABC, abstractmethod
from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Union

from ..assessment.databricks import DatabricksAssessment

# Import assessment dataclasses
from ..assessment.synapse import SynapseAssessment


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class BaseExporter(ABC):
    """Base class for different export formats."""

    @abstractmethod
    def export(
        self,
        assessment_data: Union[SynapseAssessment, DatabricksAssessment],
        output_path: str,
        workspace_name: str,
    ) -> Dict[str, Any]:
        """Export assessment data in specific format."""
        pass


class JSONExporter(BaseExporter):
    """JSON format exporter with structured folder output."""

    def export(
        self,
        assessment_data: Union[SynapseAssessment, DatabricksAssessment],
        output_path: str,
        workspace_name: str,
    ) -> Dict[str, Any]:
        """
        Export assessment data as structured JSON files in folders.

        Structure:
        output_path/
        ├── summary.json (workspace summary)
        ├── notebooks/
        │   ├── notebook1.json
        │   └── notebook2.json
        ├── pipelines/ (Synapse) or jobs/ (Databricks)
        │   ├── pipeline1.json
        │   └── pipeline2.json
        ├── sql_pools/ (Synapse) or clusters/ (Databricks)
        │   ├── pool1.json
        │   └── pool2.json
        └── databases/ (Databricks) or serverless_databases/ and dedicated_databases/ (Synapse) (if applicable)
            ├── database1.json
            └── database2.json
        ├── sql_warehouses/ (Databricks)
        │   ├── warehouse1.json
        │   └── warehouse2.json
        ├── unity_catalogs/ (Databricks)
        │   ├── catalog1.json
        │   └── catalog2.json
        ├── unity_catalogs/ (Databricks)
        │   ├── catalog1.json
        │   └── catalog2.json
        ├── unity_catalogs/ (Databricks)
        │   ├── catalog1.json
        │   └── catalog2.json
        ├── unity_catalogs/ (Databricks)
        │   ├── catalog1.json
        │   └── catalog2.json
        """
        workspace_dir = Path(output_path) / workspace_name
        workspace_dir.mkdir(parents=True, exist_ok=True)

        # Convert dataclass to dictionary
        data = asdict(assessment_data)

        # Create summary with high-level workspace information
        summary = assessment_data.get_summary()
        summary_path = workspace_dir / "summary.json"
        with open(summary_path, "w") as f:
            json.dump(summary, f, indent=2, cls=DecimalEncoder)

        # Export detailed components to separate folders
        files_created = [str(summary_path)]

        if isinstance(assessment_data, SynapseAssessment):
            files_created.extend(self._export_synapse_details(data, workspace_dir))
        elif isinstance(assessment_data, DatabricksAssessment):
            files_created.extend(self._export_databricks_details(data, workspace_dir))

        return {
            "format": "json",
            "workspace_directory": str(workspace_dir),
            "files_created": files_created,
            "total_files": len(files_created),
        }

    def _export_component(
        self,
        data,
        key,
        resources_dir,
        folder_name,
        file_type,
        files_created,
        property=None,
    ):
        """Helper function to export a specific component."""

        if not property:
            property = key

        if key in data:
            component_dir = resources_dir / folder_name
            component_dir.mkdir(exist_ok=True)

            for item in data[key].get(property, []):
                file_path = component_dir / f"{item['name']}.json"
                with open(file_path, "w") as f:
                    json.dump(
                        {
                            "type": file_type,
                            "data": item,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(file_path))

    def _export_synapse_details(
        self, data: Dict[str, Any], workspace_dir: Path
    ) -> List[str]:
        """Export Synapse-specific detailed components."""
        files_created = []

        # Create workspace directory
        ws_dir = workspace_dir
        ws_dir.mkdir(exist_ok=True)

        # Export general workspace info
        workspace_info_file = ws_dir / "workspace.json"
        with open(workspace_info_file, "w") as f:
            json.dump(
                {
                    "type": "synapse_workspace",
                    "workspace": data.get("workspace_info", {}),
                    "exported_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
                cls=DecimalEncoder,
            )
        files_created.append(str(workspace_info_file))

        # Create resources folder
        resources_dir = workspace_dir / "resources"
        resources_dir.mkdir(exist_ok=True)

        # Export SQL pools
        if "sql_pools" in data:
            sql_pools_dir = resources_dir / "sql_pools"
            sql_pools_dir.mkdir(exist_ok=True)

            # Dedicated pools
            for i, pool in enumerate(data["sql_pools"].get("dedicated_pools", [])):
                pool_file = sql_pools_dir / f"dedicated_pool_{pool['name']}.json"
                with open(pool_file, "w") as f:
                    json.dump(
                        {
                            "type": "dedicated_pool",
                            "pool_data": pool,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(pool_file))

            # Serverless pools
            for i, pool in enumerate(data["sql_pools"].get("serverless_pools", [])):
                pool_file = sql_pools_dir / f"serverless_pool_{pool['name']}.json"
                with open(pool_file, "w") as f:
                    json.dump(
                        {
                            "type": "serverless_pool",
                            "pool_data": pool,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(pool_file))

        # Export Spark pools
        self._export_component(
            data,
            "spark_pools",
            resources_dir,
            "spark_pools",
            "spark_pool",
            files_created,
        )

        # Export pipelines
        self._export_component(
            data, "pipelines", resources_dir, "pipelines", "pipeline", files_created
        )

        # Export Spark Job Definitions (sjds)
        self._export_component(
            data,
            "spark_job_definitions",
            resources_dir,
            "spark_job_definitions",
            "spark_job_definition",
            files_created,
        )

        # Export notebooks
        self._export_component(
            data, "notebooks", resources_dir, "notebooks", "notebook", files_created
        )

        # Export Dataflows
        self._export_component(
            data, "dataflows", resources_dir, "dataflows", "dataflow", files_created
        )

        # Export SQL Scripts
        self._export_component(
            data,
            "sql_scripts",
            resources_dir,
            "sql_scripts",
            "sql_script",
            files_created,
        )

        # Create admin folder
        admin_dir = workspace_dir / "admin"
        admin_dir.mkdir(exist_ok=True)

        # Export Integration Runtimes
        self._export_component(
            data,
            "integration_runtimes",
            admin_dir,
            "integration_runtimes",
            "integration_runtime",
            files_created,
        )

        # Export Linked Services
        self._export_component(
            data,
            "linked_services",
            admin_dir,
            "linked_services",
            "linked_service",
            files_created,
        )

        # Export Datasets
        self._export_component(
            data, "datasets", admin_dir, "datasets", "dataset", files_created
        )

        # Export Managed Private Endpoints
        self._export_component(
            data,
            "managed_private_endpoints",
            admin_dir,
            "managed_private_endpoints",
            "managed_private_endpoint",
            files_created,
        )

        # Export Libraries
        self._export_component(
            data, "libraries", admin_dir, "libraries", "library", files_created
        )

        # Create data folder
        data_dir = workspace_dir / "data"
        data_dir.mkdir(exist_ok=True)

        # Export Databases
        self._export_component(
            data,
            "serverless_databases",
            data_dir,
            "serverless_databases",
            "database",
            files_created,
            "databases",
        )

        # Export Schemas
        self._export_component(
            data,
            "dedicated_databases",
            data_dir,
            "dedicated_databases",
            "database",
            files_created,
            "databases",
        )

        # Does it make sense to export tables and views separately here?

        # # Export Tables
        # self._export_component(
        #     data, "tables", data_dir, "tables", "table", files_created
        # )

        # # Export Views
        # self._export_component(
        #     data, "views", data_dir, "views", "view", files_created
        # )

        return files_created

    def _export_databricks_details(
        self, data: Dict[str, Any], workspace_dir: Path
    ) -> List[str]:
        """Export Databricks-specific detailed components."""
        files_created = []

        # Create resources folder
        resources_dir = workspace_dir / "resources"
        resources_dir.mkdir(exist_ok=True)

        # Export clusters
        if "clusters" in data:
            clusters_dir = resources_dir / "clusters"
            clusters_dir.mkdir(exist_ok=True)

            for cluster in data["clusters"].get("clusters", []):
                cluster_file = clusters_dir / f"cluster_{cluster['cluster_name']}.json"
                with open(cluster_file, "w") as f:
                    json.dump(
                        {
                            "type": "databricks_cluster",
                            "cluster_data": cluster,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(cluster_file))

        # Export jobs
        if "jobs" in data:
            jobs_dir = resources_dir / "jobs"
            jobs_dir.mkdir(exist_ok=True)

            for job in data["jobs"].get("jobs", []):
                job_file = jobs_dir / f"job_{job['job_id']}.json"
                with open(job_file, "w") as f:
                    json.dump(
                        {
                            "type": "databricks_job",
                            "job_data": job,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(job_file))

        # Export databases
        if "databases" in data:
            databases_dir = resources_dir / "databases"
            databases_dir.mkdir(exist_ok=True)

            for database in data["databases"].get("databases", []):
                database_file = databases_dir / f"database_{database['name']}.json"
                with open(database_file, "w") as f:
                    json.dump(
                        {
                            "type": "databricks_database",
                            "database_data": database,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(database_file))

        # Export unity catalogs
        if "unity_catalogs" in data:
            unity_catalogs_dir = workspace_dir / "unity_catalogs"
            unity_catalogs_dir.mkdir(exist_ok=True)
            for catalog in data["unity_catalogs"].get("unity_catalogs", []):
                # Use the catalog name, or default to index if missing
                catalog_name = catalog.get("name") or f"catalog_{len(files_created)}"
                safe_name = (
                    "".join(c for c in catalog_name if c.isalnum() or c in ("-", "_"))
                    .strip()
                    .replace(" ", "_")
                )
                catalog_file = unity_catalogs_dir / f"{safe_name}.json"
                with open(catalog_file, "w") as f:
                    json.dump(
                        {
                            "type": "unity_catalog",
                            "unity_catalog_data": catalog,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(catalog_file))

        if "sql_warehouses" in data:
            sql_wh_dir = workspace_dir / "sql_warehouses"
            sql_wh_dir.mkdir(exist_ok=True)
            for wh in data["sql_warehouses"].get("sql_warehouses", []):
                wh_file = sql_wh_dir / f"warehouse_{wh['name']}.json"
                with open(wh_file, "w") as f:
                    json.dump(
                        {
                            "type": "databricks_sql_warehouse",
                            "warehouse_data": wh,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(wh_file))

        # Export notebooks
        if "notebooks" in data:
            notebooks_dir = resources_dir / "notebooks"
            notebooks_dir.mkdir(exist_ok=True)

            for i, notebook in enumerate(data["notebooks"].get("notebooks", [])):
                notebook_file = notebooks_dir / f"{notebook['name']}.json"
                with open(notebook_file, "w") as f:
                    json.dump(
                        {
                            "type": "notebook",
                            "notebook_data": notebook,
                            "exported_at": datetime.now().isoformat(),
                        },
                        f,
                        indent=2,
                        cls=DecimalEncoder,
                    )
                files_created.append(str(notebook_file))

        return files_created


class CSVExporter(BaseExporter):
    """CSV format exporter (scaffolding only)."""

    def export(
        self,
        assessment_data: Union[SynapseAssessment, DatabricksAssessment],
        output_path: str,
        workspace_name: str,
    ) -> Dict[str, Any]:
        """Export assessment data as CSV files (scaffolding)."""
        workspace_dir = Path(output_path) / workspace_name
        workspace_dir.mkdir(parents=True, exist_ok=True)

        # TODO: Implement CSV export
        # This would create CSV files for:
        # - summary.csv (workspace summary)
        # - notebooks.csv (all notebooks in one CSV)
        # - pipelines.csv or jobs.csv
        # - sql_pools.csv or clusters.csv
        # - databases.csv and tables.csv

        print(f"CSV export scaffolding - would create CSV files in {workspace_dir}")

        return {
            "format": "csv",
            "workspace_directory": str(workspace_dir),
            "status": "scaffolding_only",
            "message": "CSV export not yet implemented",
        }


class ParquetExporter(BaseExporter):
    """Parquet format exporter (scaffolding only)."""

    def export(
        self,
        assessment_data: Union[SynapseAssessment, DatabricksAssessment],
        output_path: str,
        workspace_name: str,
    ) -> Dict[str, Any]:
        """Export assessment data as Parquet files (scaffolding)."""
        workspace_dir = Path(output_path) / workspace_name
        workspace_dir.mkdir(parents=True, exist_ok=True)

        # TODO: Implement Parquet export
        # This would create Parquet files for:
        # - summary.parquet
        # - notebooks.parquet
        # - pipelines.parquet or jobs.parquet
        # - sql_pools.parquet or clusters.parquet
        # - databases.parquet and tables.parquet

        print(
            f"Parquet export scaffolding - would create Parquet files in {workspace_dir}"
        )

        return {
            "format": "parquet",
            "workspace_directory": str(workspace_dir),
            "status": "scaffolding_only",
            "message": "Parquet export not yet implemented",
        }


class StructuredExportService:
    """Service for exporting assessment data in various structured formats."""

    def __init__(self):
        self.exporters = {
            "json": JSONExporter(),
            "csv": CSVExporter(),
            "parquet": ParquetExporter(),
        }

    def export_assessment(
        self,
        assessment_data: Union[SynapseAssessment, DatabricksAssessment],
        workspace_name: str,
        output_path: str,
        format: str = "json",
    ) -> Dict[str, Any]:
        """
        Export assessment data in specified format.

        Args:
            assessment_data: Assessment dataclass object
            workspace_name: Name of the workspace
            output_path: Base output path (will create subdirectories)
            format: Export format (json, csv, parquet)

        Returns:
            Export results dictionary
        """
        if format not in self.exporters:
            raise ValueError(
                f"Unsupported export format: {format}. Supported: {list(self.exporters.keys())}"
            )

        exporter = self.exporters[format]

        print(f"Exporting {workspace_name} assessment data in {format} format...")
        result = exporter.export(assessment_data, output_path, workspace_name)

        # Add common metadata
        result.update(
            {
                "workspace_name": workspace_name,
                "export_timestamp": datetime.now().isoformat(),
                "export_format": format,
            }
        )

        return result
