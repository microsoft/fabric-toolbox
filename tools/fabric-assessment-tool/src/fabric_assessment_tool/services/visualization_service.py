"""Visualization service for generating HTML reports from assessment data."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from jinja2 import Environment, PackageLoader, select_autoescape


class VisualizationService:
    """Service for generating HTML visualization reports from assessment results."""

    def __init__(self):
        self.env = Environment(
            loader=PackageLoader("fabric_assessment_tool", "templates"),
            autoescape=select_autoescape(["html", "xml"]),
        )
        # Register custom filters
        self.env.filters["format_number"] = self._format_number
        self.env.filters["format_size"] = self._format_size

    def generate_report(
        self,
        input_path: str,
        output_path: str,
        view: str = "overview",
        workspace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate HTML visualization report from assessment data.

        Args:
            input_path: Path to assessment output directory
            output_path: Path for generated HTML reports
            view: Initial view to open (overview, admin, data-engineering, etc.)
            workspace: Optional specific workspace to report on

        Returns:
            Dict with generation results including files created
        """
        input_dir = Path(input_path)
        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load assessment data
        assessment_data = self._load_assessment_data(input_dir, workspace)

        # Detect platform and route to appropriate templates
        platform = assessment_data.get("platform", "synapse")
        files_created = []

        if platform == "databricks":
            files_created = self._generate_databricks_report(
                assessment_data, output_dir, view
            )
        else:
            # Default to Synapse
            files_created = self._generate_synapse_report(
                assessment_data, output_dir, view
            )

        # Determine main report based on requested view
        view_to_file = {
            "overview": "index.html",
            "admin": "views/admin.html",
            "data-engineering": "views/data_engineering.html",
            "data-warehousing": "views/data_warehousing.html",
            "data-integration": "views/data_integration.html",
        }
        main_file = view_to_file.get(view, "index.html")
        main_report = str(output_dir / main_file)

        return {
            "files_created": len(files_created),
            "main_report": main_report,
            "output_directory": str(output_dir),
            "platform": platform,
            "generated_at": datetime.now().isoformat(),
        }

    def _generate_synapse_report(
        self, data: Dict[str, Any], output_dir: Path, view: str
    ) -> List[str]:
        """Generate Synapse-specific report."""
        files_created = []

        # Generate main overview
        overview_report = self._generate_overview(data, output_dir, "synapse")
        files_created.append(overview_report)

        # Generate workspace pages
        for ws_name in data.get("workspaces", {}).keys():
            ws_file = self._generate_workspace_report(ws_name, data, output_dir)
            files_created.append(ws_file)

        # Generate Synapse-specific views
        admin_report = self._generate_admin_view(data, output_dir, "synapse")
        files_created.append(admin_report)

        de_report = self._generate_data_engineering_view(data, output_dir, "synapse")
        files_created.append(de_report)

        dw_report = self._generate_data_warehousing_view(data, output_dir, "synapse")
        files_created.append(dw_report)

        di_report = self._generate_data_integration_view(data, output_dir, "synapse")
        files_created.append(di_report)

        return files_created

    def _generate_databricks_report(
        self, data: Dict[str, Any], output_dir: Path, view: str
    ) -> List[str]:
        """Generate Databricks-specific report."""
        files_created = []

        # Generate main overview
        overview_report = self._generate_overview(data, output_dir, "databricks")
        files_created.append(overview_report)

        # Generate workspace pages
        for ws_name in data.get("workspaces", {}).keys():
            ws_file = self._generate_workspace_report(ws_name, data, output_dir)
            files_created.append(ws_file)

        # Generate Databricks-specific views (no admin or data integration)
        de_report = self._generate_data_engineering_view(data, output_dir, "databricks")
        files_created.append(de_report)

        dw_report = self._generate_data_warehousing_view(data, output_dir, "databricks")
        files_created.append(dw_report)

        return files_created

    def _load_assessment_data(
        self, input_dir: Path, workspace: Optional[str] = None
    ) -> Dict[str, Any]:
        """Load assessment data from JSON files in the input directory."""
        data = {
            "workspaces": {},
            "platform": None,
            "generated_at": datetime.now().isoformat(),
        }

        # Find workspace directories (exclude 'reports' directory)
        for item in input_dir.iterdir():
            if item.is_dir() and item.name != "reports":
                if workspace and item.name != workspace:
                    continue
                ws_data = self._load_workspace_data(item)
                if ws_data:
                    data["workspaces"][item.name] = ws_data
                    # Detect platform from workspace data
                    if data["platform"] is None:
                        data["platform"] = ws_data.get("platform", "unknown")

        # Calculate aggregate statistics
        data["summary"] = self._calculate_summary(data["workspaces"])

        return data

    def _load_workspace_data(self, workspace_dir: Path) -> Optional[Dict[str, Any]]:
        """Load data for a single workspace from its directory."""
        summary_file = workspace_dir / "summary.json"
        if not summary_file.exists():
            return None

        try:
            with open(summary_file, "r", encoding="utf-8") as f:
                summary = json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

        ws_data = {
            "name": workspace_dir.name,
            "summary": summary,
            "platform": self._detect_platform(summary),
            "resources": {},
        }

        # Load detailed resources
        resources_dir = workspace_dir / "resources"
        if resources_dir.exists():
            ws_data["resources"] = self._load_resources(resources_dir)

        # Load admin data (Synapse)
        admin_dir = workspace_dir / "admin"
        if admin_dir.exists():
            ws_data["admin"] = self._load_resources(admin_dir)

        # Load data catalog info
        data_dir = workspace_dir / "data"
        if data_dir.exists():
            ws_data["data"] = self._load_data_catalog(data_dir)

        return ws_data

    def _detect_platform(self, summary: Dict[str, Any]) -> str:
        """Detect whether this is Synapse or Databricks from summary structure."""
        if "data_engineering" in summary or "data_warehouse" in summary:
            return "synapse"
        elif "counts" in summary and "clusters" in summary.get("counts", {}):
            return "databricks"
        return "unknown"

    def _load_resources(self, resources_dir: Path) -> Dict[str, List[Dict[str, Any]]]:
        """Load all resources from a resources directory."""
        resources = {}
        for category_dir in resources_dir.iterdir():
            if category_dir.is_dir():
                resources[category_dir.name] = []
                for json_file in category_dir.glob("*.json"):
                    try:
                        with open(json_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            resources[category_dir.name].append(data)
                    except (json.JSONDecodeError, IOError):
                        continue
        return resources

    def _load_data_catalog(self, data_dir: Path) -> Dict[str, Any]:
        """Load data catalog information (databases, schemas, tables)."""
        catalog = {}
        for subdir in data_dir.iterdir():
            if subdir.is_dir():
                catalog[subdir.name] = self._load_nested_data(subdir)
        return catalog

    def _load_nested_data(self, directory: Path, depth: int = 0) -> Dict[str, Any]:
        """Recursively load nested JSON data structures."""
        if depth > 5:  # Prevent infinite recursion
            return {}

        result = {}
        for item in directory.iterdir():
            if item.is_file() and item.suffix == ".json":
                try:
                    with open(item, "r", encoding="utf-8") as f:
                        result[item.stem] = json.load(f)
                except (json.JSONDecodeError, IOError):
                    continue
            elif item.is_dir():
                result[item.name] = self._load_nested_data(item, depth + 1)
        return result

    def _calculate_summary(
        self, workspaces: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Calculate aggregate summary statistics across all workspaces."""
        summary = {
            "workspace_count": len(workspaces),
            "total_notebooks": 0,
            "total_pipelines": 0,
            "total_sql_pools": 0,
            "total_spark_pools": 0,
            "total_tables": 0,
            "total_linked_services": 0,
            "total_datasets": 0,
            "total_dataflows": 0,
            "total_clusters": 0,
            "total_jobs": 0,
            "total_sql_warehouses": 0,
            "platforms": {"synapse": 0, "databricks": 0},
        }

        for ws_name, ws_data in workspaces.items():
            ws_summary = ws_data.get("summary", {})
            platform = ws_data.get("platform", "unknown")

            if platform == "synapse":
                summary["platforms"]["synapse"] += 1
                self._add_synapse_counts(summary, ws_summary)
            elif platform == "databricks":
                summary["platforms"]["databricks"] += 1
                self._add_databricks_counts(summary, ws_summary)

        return summary

    def _add_synapse_counts(
        self, summary: Dict[str, Any], ws_summary: Dict[str, Any]
    ) -> None:
        """Add Synapse workspace counts to summary."""
        # Data engineering counts - check both nested and flat structures
        de = ws_summary.get("data_engineering", {})
        de_hybrid = de.get("hybrid", {})
        de_manual = de.get("manual", {})
        summary["total_notebooks"] += de_hybrid.get("notebooks", de.get("notebooks", 0))
        summary["total_spark_pools"] += de_manual.get(
            "spark_pools", de.get("spark_pools", 0)
        )

        # Data integration counts - check nested counts structure
        di = ws_summary.get("data_integration", {})
        di_counts = di.get("counts", di)  # Use counts sub-dict if present
        summary["total_pipelines"] += di_counts.get("pipelines", 0)
        summary["total_dataflows"] += di_counts.get("dataflows", 0)
        summary["total_datasets"] += di_counts.get("datasets", 0)
        summary["total_linked_services"] += di_counts.get("linked_services", 0)

        # Data warehouse counts - check nested counts structure
        dw = ws_summary.get("data_warehouse", {})
        dw_counts = dw.get("counts", dw)  # Use counts sub-dict if present
        dw_dedicated = dw_counts.get("dedicated", {})
        dw_serverless = dw_counts.get("serverless", {})
        summary["total_sql_pools"] += dw_dedicated.get(
            "sql_pools", dw.get("dedicated_pools", 0)
        )
        summary["total_sql_pools"] += dw_serverless.get(
            "sql_pools", 1 if dw.get("serverless_pool") else 0
        )
        summary["total_tables"] += dw_dedicated.get("tables", 0) + dw_serverless.get(
            "tables", dw.get("total_tables", 0)
        )

    def _add_databricks_counts(
        self, summary: Dict[str, Any], ws_summary: Dict[str, Any]
    ) -> None:
        """Add Databricks workspace counts to summary."""
        counts = ws_summary.get("counts", {})
        summary["total_clusters"] += counts.get("clusters", 0)
        summary["total_notebooks"] += counts.get("notebooks", 0)
        summary["total_jobs"] += counts.get("jobs", 0)
        summary["total_tables"] += counts.get("tables", 0)
        summary["total_sql_warehouses"] += counts.get("sql_warehouses", 0)

    def _generate_overview(
        self, data: Dict[str, Any], output_dir: Path, platform: str = "synapse"
    ) -> str:
        """Generate the main overview dashboard."""
        template_path = f"{platform}/index.html"
        template = self.env.get_template(template_path)
        workspace_names = list(data.get("workspaces", {}).keys())

        title = (
            "Synapse Assessment Report"
            if platform == "synapse"
            else "Databricks Assessment Report"
        )

        html = template.render(
            title=title,
            data=data,
            summary=data.get("summary", {}),
            workspaces=data.get("workspaces", {}),
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="overview",
            platform=platform,
            base_path="",
        )

        output_file = output_dir / "index.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _generate_workspace_report(
        self, workspace_name: str, data: Dict[str, Any], output_dir: Path
    ) -> str:
        """Generate a detailed report for a single workspace."""
        platform = data.get("platform", "synapse")
        template_path = f"{platform}/workspace.html" if self._template_exists(
            f"{platform}/workspace.html"
        ) else "workspace.html"
        template = self.env.get_template(template_path)
        ws_data = data.get("workspaces", {}).get(workspace_name, {})
        workspace_names = list(data.get("workspaces", {}).keys())

        ws_dir = output_dir / "workspaces"
        ws_dir.mkdir(exist_ok=True)

        html = template.render(
            title=f"Workspace: {workspace_name}",
            workspace_name=workspace_name,
            workspace=ws_data,
            data=data,
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="workspace",
            platform=platform,
            base_path="../",
        )

        output_file = ws_dir / f"{workspace_name}.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _template_exists(self, template_name: str) -> bool:
        """Check if a template exists."""
        try:
            self.env.get_template(template_name)
            return True
        except Exception:
            return False

    def _generate_admin_view(
        self, data: Dict[str, Any], output_dir: Path, platform: str = "synapse"
    ) -> str:
        """Generate admin-focused view."""
        template_path = f"{platform}/views/admin.html"
        template = self.env.get_template(template_path)
        workspace_names = list(data.get("workspaces", {}).keys())

        # Aggregate admin data across workspaces
        admin_data = self._aggregate_admin_data(data.get("workspaces", {}))

        html = template.render(
            title="Admin View - Synapse Assessment",
            data=data,
            admin=admin_data,
            workspaces=data.get("workspaces", {}),
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="admin",
            platform=platform,
            base_path="../",
        )

        views_dir = output_dir / "views"
        views_dir.mkdir(exist_ok=True)
        output_file = views_dir / "admin.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _generate_data_engineering_view(
        self, data: Dict[str, Any], output_dir: Path, platform: str = "synapse"
    ) -> str:
        """Generate data engineering-focused view."""
        template_path = f"{platform}/views/data_engineering.html"
        template = self.env.get_template(template_path)
        workspace_names = list(data.get("workspaces", {}).keys())

        de_data = self._aggregate_data_engineering(data.get("workspaces", {}), platform)

        html = template.render(
            title="Data Engineering View - Assessment",
            data=data,
            engineering=de_data,
            workspaces=data.get("workspaces", {}),
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="data-engineering",
            platform=platform,
            base_path="../",
        )

        views_dir = output_dir / "views"
        views_dir.mkdir(exist_ok=True)
        output_file = views_dir / "data_engineering.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _generate_data_warehousing_view(
        self, data: Dict[str, Any], output_dir: Path, platform: str = "synapse"
    ) -> str:
        """Generate data warehousing-focused view."""
        template_path = f"{platform}/views/data_warehousing.html"
        template = self.env.get_template(template_path)
        workspace_names = list(data.get("workspaces", {}).keys())

        dw_data = self._aggregate_data_warehousing(data.get("workspaces", {}), platform)

        html = template.render(
            title="Data Warehousing View - Assessment",
            data=data,
            warehousing=dw_data,
            workspaces=data.get("workspaces", {}),
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="data-warehousing",
            platform=platform,
            base_path="../",
        )

        views_dir = output_dir / "views"
        views_dir.mkdir(exist_ok=True)
        output_file = views_dir / "data_warehousing.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _generate_data_integration_view(
        self, data: Dict[str, Any], output_dir: Path, platform: str = "synapse"
    ) -> str:
        """Generate data integration-focused view."""
        template_path = f"{platform}/views/data_integration.html"
        template = self.env.get_template(template_path)
        workspace_names = list(data.get("workspaces", {}).keys())

        di_data = self._aggregate_data_integration(data.get("workspaces", {}))

        html = template.render(
            title="Data Integration View - Synapse Assessment",
            data=data,
            integration=di_data,
            workspaces=data.get("workspaces", {}),
            workspace_names=workspace_names,
            generated_at=data.get("generated_at"),
            view="data-integration",
            platform=platform,
            base_path="../",
        )

        views_dir = output_dir / "views"
        views_dir.mkdir(exist_ok=True)
        output_file = views_dir / "data_integration.html"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(html)

        return str(output_file)

    def _aggregate_admin_data(
        self, workspaces: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Aggregate admin-related data across workspaces."""
        admin = {
            "integration_runtimes": [],
            "linked_services": [],
            "managed_private_endpoints": [],
            "libraries": [],
            "linked_service_types": {},
        }

        for ws_name, ws_data in workspaces.items():
            ws_admin = ws_data.get("admin", {})

            for ir in ws_admin.get("integration_runtimes", []):
                ir_data = ir.get("data", ir)
                ir_data["workspace"] = ws_name
                admin["integration_runtimes"].append(ir_data)

            for ls in ws_admin.get("linked_services", []):
                ls_data = ls.get("data", ls)
                ls_data["workspace"] = ws_name
                admin["linked_services"].append(ls_data)
                # Count by type
                ls_type = ls_data.get("type", "Unknown")
                admin["linked_service_types"][ls_type] = (
                    admin["linked_service_types"].get(ls_type, 0) + 1
                )

            for ep in ws_admin.get("managed_private_endpoints", []):
                ep_data = ep.get("data", ep)
                ep_data["workspace"] = ws_name
                admin["managed_private_endpoints"].append(ep_data)

            for lib in ws_admin.get("libraries", []):
                lib_data = lib.get("data", lib)
                lib_data["workspace"] = ws_name
                admin["libraries"].append(lib_data)

        return admin

    def _aggregate_data_engineering(
        self, workspaces: Dict[str, Dict[str, Any]], platform: str = "synapse"
    ) -> Dict[str, Any]:
        """Aggregate data engineering resources across workspaces."""
        de = {
            "notebooks": [],
            "spark_pools": [],
            "spark_job_definitions": [],
            "spark_configurations": [],
            "clusters": [],
            "jobs": [],
            "notebook_languages": {},
            "spark_versions": {},
        }

        for ws_name, ws_data in workspaces.items():
            resources = ws_data.get("resources", {})
            ws_admin = ws_data.get("admin", {})

            # Notebooks
            for nb in resources.get("notebooks", []):
                nb_data = nb.get("data", nb)
                nb_data["workspace"] = ws_name
                de["notebooks"].append(nb_data)
                lang = nb_data.get(
                    "language", nb_data.get("default_language", "Unknown")
                )
                de["notebook_languages"][lang] = (
                    de["notebook_languages"].get(lang, 0) + 1
                )

            if platform == "synapse":
                # Spark pools
                for sp in resources.get("spark_pools", []):
                    sp_data = sp.get("data", sp)
                    sp_data["workspace"] = ws_name
                    de["spark_pools"].append(sp_data)
                    version = sp_data.get("spark_version", "Unknown")
                    de["spark_versions"][version] = (
                        de["spark_versions"].get(version, 0) + 1
                    )

                # Spark job definitions
                for sjd in resources.get("spark_job_definitions", []):
                    sjd_data = sjd.get("data", sjd)
                    sjd_data["workspace"] = ws_name
                    de["spark_job_definitions"].append(sjd_data)

                # Spark configurations (from admin folder, like libraries)
                for sc in ws_admin.get("spark_configurations", []):
                    sc_data = sc.get("data", sc)
                    sc_data["workspace"] = ws_name
                    de["spark_configurations"].append(sc_data)

            elif platform == "databricks":
                # Clusters
                for cl in resources.get("clusters", []):
                    cl_data = cl.get("data", cl)
                    cl_data["workspace"] = ws_name
                    de["clusters"].append(cl_data)
                    version = cl_data.get("spark_version", "Unknown")
                    de["spark_versions"][version] = (
                        de["spark_versions"].get(version, 0) + 1
                    )

                # Jobs
                for job in resources.get("jobs", []):
                    job_data = job.get("data", job)
                    job_data["workspace"] = ws_name
                    de["jobs"].append(job_data)

        return de

    def _aggregate_data_warehousing(
        self, workspaces: Dict[str, Dict[str, Any]], platform: str = "synapse"
    ) -> Dict[str, Any]:
        """Aggregate data warehousing resources across workspaces."""
        dw = {
            "dedicated_pools": [],
            "serverless_pools": [],
            "sql_warehouses": [],
            "sql_scripts": [],
            "databases": [],
            "total_tables": 0,
            "total_size_gb": 0,
        }

        for ws_name, ws_data in workspaces.items():
            resources = ws_data.get("resources", {})
            platform = ws_data.get("platform", "unknown")
            data_catalog = ws_data.get("data", {})

            if platform == "synapse":
                ws_summary = ws_data.get("summary", {})
                dw_summary = ws_summary.get("data_warehouse", {})
                dw_counts = dw_summary.get("counts", {})
                dedicated_counts = dw_counts.get("dedicated", {})
                serverless_counts = dw_counts.get("serverless", {})

                # SQL pools - try both 'data' and 'pool_data' keys
                for pool in resources.get("sql_pools", []):
                    pool_data = pool.get("data") or pool.get("pool_data") or pool
                    pool_data["workspace"] = ws_name
                    pool_type = pool.get("type", "")
                    if "dedicated" in pool_type.lower() or pool_data.get("sku"):
                        # Get tables and size from summary if not in pool_data
                        if pool_data.get("tables_count", 0) == 0:
                            pool_data["tables_count"] = dedicated_counts.get("tables", 0)
                        if pool_data.get("size_gb", 0) == 0:
                            size_val = dedicated_counts.get("table_size_gb", 0)
                            pool_data["size_gb"] = (
                                float(size_val) if isinstance(size_val, str) else size_val
                            )
                        dw["dedicated_pools"].append(pool_data)
                        dw["total_tables"] += pool_data.get("tables_count", 0)
                        dw["total_size_gb"] += pool_data.get("size_gb", 0)
                    else:
                        # For serverless, get tables from summary
                        if pool_data.get("tables_count", 0) == 0:
                            pool_data["tables_count"] = serverless_counts.get("tables", 0)
                        dw["serverless_pools"].append(pool_data)
                        dw["total_tables"] += pool_data.get("tables_count", 0)

                # SQL scripts
                for script in resources.get("sql_scripts", []):
                    script_data = script.get("data") or script
                    script_data["workspace"] = ws_name
                    dw["sql_scripts"].append(script_data)

                # Databases from data catalog - handle nested structure
                for db_type in ["dedicated_databases", "serverless_databases"]:
                    if db_type in data_catalog:
                        db_type_data = data_catalog[db_type]
                        # Structure: db_type/databases/db_name/db_name.json
                        databases_dict = db_type_data.get("databases", {})
                        for db_folder_name, db_folder_data in databases_dict.items():
                            if isinstance(db_folder_data, dict):
                                # Find the database JSON file inside
                                for key, value in db_folder_data.items():
                                    if isinstance(value, dict):
                                        # Extract the data from the JSON structure
                                        db_info = value.get("data", value)
                                        if isinstance(db_info, dict):
                                            db_entry = {
                                                "name": db_info.get(
                                                    "name", db_folder_name
                                                ),
                                                "workspace": ws_name,
                                                "db_type": db_type,
                                            }
                                            dw["databases"].append(db_entry)
                                            break  # Only take one per folder

            elif platform == "databricks":
                # SQL warehouses
                for wh in resources.get("sql_warehouses", []):
                    wh_data = wh.get("data", wh)
                    wh_data["workspace"] = ws_name
                    dw["sql_warehouses"].append(wh_data)

        return dw

    def _aggregate_data_integration(
        self, workspaces: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Aggregate data integration resources across workspaces."""
        di = {
            "pipelines": [],
            "dataflows": [],
            "datasets": [],
            "linked_services": [],
            "dataset_types": {},
            "pipeline_activities": 0,
        }

        for ws_name, ws_data in workspaces.items():
            resources = ws_data.get("resources", {})
            admin = ws_data.get("admin", {})

            # Pipelines
            for pipe in resources.get("pipelines", []):
                pipe_data = pipe.get("data", pipe)
                pipe_data["workspace"] = ws_name
                # Calculate activities_count from json_response if not set
                activities_count = pipe_data.get("activities_count", 0)
                if activities_count == 0:
                    json_resp = pipe_data.get("json_response", {})
                    properties = json_resp.get("properties", {})
                    activities = properties.get("activities", [])
                    activities_count = len(activities) if isinstance(activities, list) else 0
                    pipe_data["activities_count"] = activities_count
                di["pipelines"].append(pipe_data)
                di["pipeline_activities"] += activities_count

            # Dataflows
            for df in resources.get("dataflows", []):
                df_data = df.get("data", df)
                df_data["workspace"] = ws_name
                di["dataflows"].append(df_data)

            # Datasets
            for ds in admin.get("datasets", []):
                ds_data = ds.get("data", ds)
                ds_data["workspace"] = ws_name
                di["datasets"].append(ds_data)
                ds_type = ds_data.get("type", "Unknown")
                di["dataset_types"][ds_type] = di["dataset_types"].get(ds_type, 0) + 1

            # Linked services
            for ls in admin.get("linked_services", []):
                ls_data = ls.get("data", ls)
                ls_data["workspace"] = ws_name
                di["linked_services"].append(ls_data)

        return di

    @staticmethod
    def _format_number(value: Any) -> str:
        """Format a number with thousand separators."""
        try:
            return f"{int(value):,}"
        except (ValueError, TypeError):
            return str(value)

    @staticmethod
    def _format_size(value: Any) -> str:
        """Format a size value in bytes to human readable."""
        try:
            size = float(value)
            for unit in ["B", "KB", "MB", "GB", "TB"]:
                if abs(size) < 1024.0:
                    return f"{size:.1f} {unit}"
                size /= 1024.0
            return f"{size:.1f} PB"
        except (ValueError, TypeError):
            return str(value)
