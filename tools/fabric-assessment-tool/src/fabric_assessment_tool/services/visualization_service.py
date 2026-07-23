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

        # Generate paginated list pages for notebooks, jobs, clusters
        de_data = self._aggregate_data_engineering(
            data.get("workspaces", {}), "databricks"
        )
        workspace_names = list(data.get("workspaces", {}).keys())
        common_ctx = {
            "data": data,
            "workspaces": data.get("workspaces", {}),
            "workspace_names": workspace_names,
            "generated_at": data.get("generated_at"),
            "view": "data-engineering",
            "platform": "databricks",
            "base_path": "../",
        }

        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("notebooks", []),
                template_name="databricks/views/notebooks_list.html",
                file_prefix="notebooks_page",
                title="All Notebooks",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("jobs", []),
                template_name="databricks/views/jobs_list.html",
                file_prefix="jobs_page",
                title="All Jobs",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("clusters", []),
                template_name="databricks/views/clusters_list.html",
                file_prefix="clusters_page",
                title="All Clusters",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("pipelines", []),
                template_name="databricks/views/pipelines_list.html",
                file_prefix="pipelines_page",
                title="All DLT Pipelines",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("experiments", []),
                template_name="databricks/views/experiments_list.html",
                file_prefix="experiments_page",
                title="All MLflow Experiments",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("serving_endpoints", []),
                template_name="databricks/views/serving_endpoints_list.html",
                file_prefix="serving_endpoints_page",
                title="All Serving Endpoints",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=de_data.get("repos", []),
                template_name="databricks/views/repos_list.html",
                file_prefix="repos_page",
                title="All Git Repos",
                output_dir=output_dir,
                extra_context=common_ctx,
            )
        )

        # Generate paginated list pages for data warehousing
        dw_data = self._aggregate_data_warehousing(
            data.get("workspaces", {}), "databricks"
        )
        dw_ctx = {
            "data": data,
            "workspaces": data.get("workspaces", {}),
            "workspace_names": workspace_names,
            "generated_at": data.get("generated_at"),
            "view": "data-warehousing",
            "platform": "databricks",
            "base_path": "../",
        }
        files_created.extend(
            self._generate_paginated_list(
                items=dw_data.get("catalogs", []),
                template_name="databricks/views/catalogs_list.html",
                file_prefix="catalogs_page",
                title="All Unity Catalogs",
                output_dir=output_dir,
                extra_context=dw_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=dw_data.get("schemas", []),
                template_name="databricks/views/schemas_list.html",
                file_prefix="schemas_page",
                title="All Schemas",
                output_dir=output_dir,
                extra_context=dw_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=dw_data.get("tables", []),
                template_name="databricks/views/tables_list.html",
                file_prefix="tables_page",
                title="All Tables",
                output_dir=output_dir,
                extra_context=dw_ctx,
            )
        )
        files_created.extend(
            self._generate_paginated_list(
                items=dw_data.get("views", []),
                template_name="databricks/views/views_list.html",
                file_prefix="views_page",
                title="All Views",
                output_dir=output_dir,
                extra_context=dw_ctx,
            )
        )

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
        summary["total_tables"] += counts.get("total_tables", counts.get("tables", 0))
        summary["total_sql_warehouses"] += counts.get("sql_warehouses", 0)
        summary["total_pipelines"] += counts.get("pipelines", 0)
        summary.setdefault("total_repos", 0)
        summary["total_repos"] += counts.get("repos", 0)
        summary.setdefault("total_experiments", 0)
        summary["total_experiments"] += counts.get("experiments", 0)
        summary.setdefault("total_serving_endpoints", 0)
        summary["total_serving_endpoints"] += counts.get("serving_endpoints", 0)
        summary.setdefault("total_alerts", 0)
        summary["total_alerts"] += counts.get("alerts", 0)
        summary.setdefault("total_genie_spaces", 0)
        summary["total_genie_spaces"] += counts.get("genie_spaces", 0)
        summary.setdefault("total_cluster_policies", 0)
        summary["total_cluster_policies"] += counts.get("cluster_policies", 0)
        summary.setdefault("total_instance_pools", 0)
        summary["total_instance_pools"] += counts.get("instance_pools", 0)

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
        template_path = (
            f"{platform}/workspace.html"
            if self._template_exists(f"{platform}/workspace.html")
            else "workspace.html"
        )
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

    def _generate_paginated_list(
        self,
        items: List[Any],
        template_name: str,
        file_prefix: str,
        title: str,
        output_dir: Path,
        extra_context: Dict[str, Any],
        page_size: int = 100,
    ) -> List[str]:
        """Generate paginated HTML list pages for a collection of items.

        Args:
            items: Full list of items to paginate
            template_name: Jinja2 template path
            file_prefix: Output filename prefix (e.g., "notebooks_page")
            title: Page title
            output_dir: Output directory root
            extra_context: Additional template variables (platform, workspace_names, etc.)
            page_size: Items per page

        Returns:
            List of generated file paths
        """
        if not items:
            return []

        import math

        total_pages = math.ceil(len(items) / page_size)
        template = self.env.get_template(template_name)
        views_dir = output_dir / "views"
        views_dir.mkdir(exist_ok=True)
        files_created = []

        for page_num in range(1, total_pages + 1):
            start = (page_num - 1) * page_size
            end = start + page_size
            page_items = items[start:end]

            html = template.render(
                title=f"{title} - Page {page_num}",
                items=items,
                page_items=page_items,
                current_page=page_num,
                total_pages=total_pages,
                **extra_context,
            )

            output_file = views_dir / f"{file_prefix}_{page_num}.html"
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(html)
            files_created.append(str(output_file))

        return files_created

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
                nb_data = nb.get("notebook_data") or nb.get("data") or nb
                nb_data["workspace"] = ws_name
                de["notebooks"].append(nb_data)
                lang = (
                    (nb_data.get("json_response") or {}).get("language")
                    or nb_data.get("language")
                    or nb_data.get("default_language")
                    or "Unknown"
                )
                nb_data["language"] = lang
                if "name" not in nb_data and nb_data.get("path"):
                    nb_data["name"] = nb_data["path"].rsplit("/", 1)[-1]
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
                    cl_data = cl.get("cluster_data") or cl.get("data") or cl
                    cl_data["workspace"] = ws_name
                    de["clusters"].append(cl_data)
                    version = (
                        cl_data.get("spark_version")
                        or (cl_data.get("json_response") or {}).get("spark_version")
                        or "Unknown"
                    )
                    de["spark_versions"][version] = (
                        de["spark_versions"].get(version, 0) + 1
                    )

                # Jobs
                for job in resources.get("jobs", []):
                    job_data = job.get("job_data") or job.get("data") or job
                    job_data["workspace"] = ws_name
                    job_settings = job_data.get("settings") or {}
                    if isinstance(job_settings, dict) and job_settings.get("name"):
                        job_data.setdefault("name", job_settings["name"])
                    job_tasks = job_data.get("tasks")
                    if isinstance(job_tasks, dict) and "tasks" in job_tasks:
                        job_data["tasks"] = job_tasks["tasks"]
                    de["jobs"].append(job_data)

                # Pipelines (DLT)
                for p in resources.get("pipelines", []):
                    p_data = p.get("pipeline_data") or p.get("data") or p
                    p_data["workspace"] = ws_name
                    de.setdefault("pipelines", []).append(p_data)

                # Repos
                for r in resources.get("repos", []):
                    r_data = r.get("repo_data") or r.get("data") or r
                    r_data["workspace"] = ws_name
                    de.setdefault("repos", []).append(r_data)

                # Experiments
                for exp in resources.get("experiments", []):
                    exp_data = exp.get("experiment_data") or exp.get("data") or exp
                    exp_data["workspace"] = ws_name
                    de.setdefault("experiments", []).append(exp_data)

                # Serving Endpoints
                for ep in resources.get("serving_endpoints", []):
                    ep_data = ep.get("endpoint_data") or ep.get("data") or ep
                    ep_data["workspace"] = ws_name
                    de.setdefault("serving_endpoints", []).append(ep_data)

                # Alerts
                for alert in resources.get("alerts", []):
                    alert_data = alert.get("alert_data") or alert.get("data") or alert
                    alert_data["workspace"] = ws_name
                    de.setdefault("alerts", []).append(alert_data)

                # Genie Spaces
                for gs in resources.get("genie_spaces", []):
                    gs_data = gs.get("space_data") or gs.get("data") or gs
                    gs_data["workspace"] = ws_name
                    de.setdefault("genie_spaces", []).append(gs_data)

        # Compute job activity stats (active vs stale) for Databricks
        if platform == "databricks":
            self._compute_job_activity_stats(de, workspaces)
            self._compute_notebook_job_reference_stats(de)

        # Interleave items by workspace so preview slices represent all workspaces
        for key in ["notebooks", "jobs", "clusters"]:
            if de.get(key) and len(workspaces) > 1:
                by_ws: Dict[str, list] = {}
                for item in de[key]:
                    ws = item.get("workspace", "")
                    by_ws.setdefault(ws, []).append(item)
                interleaved = []
                ws_lists = list(by_ws.values())
                max_len = max(len(lst) for lst in ws_lists) if ws_lists else 0
                for i in range(max_len):
                    for lst in ws_lists:
                        if i < len(lst):
                            interleaved.append(lst[i])
                de[key] = interleaved

        return de

    def _compute_job_activity_stats(
        self, de: Dict[str, Any], workspaces: Dict[str, Dict[str, Any]]
    ) -> None:
        """Classify jobs as active or stale based on last run time.

        A job is active if its most recent run started less than 30 days
        before the assessment timestamp. Jobs with no runs are stale.
        """
        from datetime import timedelta, timezone

        # Determine assessment timestamp from any workspace metadata
        assessment_time = None
        for ws_data in workspaces.values():
            meta = ws_data.get("summary", {}).get("assessment_metadata", {})
            ts = meta.get("timestamp")
            if ts:
                try:
                    assessment_time = datetime.fromisoformat(ts)
                    break
                except (ValueError, TypeError):
                    pass
        if assessment_time is None:
            assessment_time = datetime.now()

        # Make assessment_time offset-aware (UTC) if naive
        if assessment_time.tzinfo is None:
            assessment_time = assessment_time.replace(tzinfo=timezone.utc)

        cutoff = assessment_time - timedelta(days=30)
        active_count = 0
        stale_count = 0

        for job in de["jobs"]:
            runs = job.get("latest_runs")
            if isinstance(runs, dict):
                runs = runs.get("runs", [])
            if not runs:
                stale_count += 1
                continue

            # Find the most recent run start_time
            latest_run_time = None
            for run in runs:
                start = run.get("start_time") if isinstance(run, dict) else None
                if start:
                    try:
                        t = datetime.fromisoformat(str(start))
                        if t.tzinfo is None:
                            t = t.replace(tzinfo=timezone.utc)
                        if latest_run_time is None or t > latest_run_time:
                            latest_run_time = t
                    except (ValueError, TypeError):
                        pass

            if latest_run_time and latest_run_time >= cutoff:
                active_count += 1
            else:
                stale_count += 1

        de["active_jobs"] = active_count
        de["stale_jobs"] = stale_count

    def _compute_notebook_job_reference_stats(self, de: Dict[str, Any]) -> None:
        """Count notebooks referenced by jobs vs those not referenced."""

        def _normalize_path(path: str) -> str:
            if path and path.startswith("/Workspace/"):
                return path[len("/Workspace") :]
            return path or ""

        # Collect all notebook paths referenced by job tasks (normalized)
        referenced_paths: set = set()
        for job in de["jobs"]:
            tasks = job.get("tasks")
            if isinstance(tasks, dict):
                tasks = tasks.get("tasks", [])
            if not tasks:
                continue
            for task in tasks:
                if isinstance(task, dict):
                    nb_path = task.get("notebook_path")
                    if not nb_path:
                        # Check nested for_each_task
                        nb_path = (
                            task.get("for_each_task", {})
                            .get("task", {})
                            .get("notebook_task", {})
                            .get("notebook_path")
                        )
                    if nb_path:
                        referenced_paths.add(_normalize_path(nb_path))

        # Count notebooks that are/aren't referenced
        referenced_count = 0
        not_referenced_count = 0
        for nb in de["notebooks"]:
            path = _normalize_path(nb.get("path", ""))
            if path in referenced_paths:
                referenced_count += 1
            else:
                not_referenced_count += 1

        de["notebooks_referenced_by_jobs"] = referenced_count
        de["notebooks_not_referenced"] = not_referenced_count

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
                            pool_data["tables_count"] = dedicated_counts.get(
                                "tables", 0
                            )
                        if pool_data.get("size_gb", 0) == 0:
                            size_val = dedicated_counts.get("table_size_gb", 0)
                            pool_data["size_gb"] = (
                                float(size_val)
                                if isinstance(size_val, str)
                                else size_val
                            )
                        dw["dedicated_pools"].append(pool_data)
                        dw["total_tables"] += pool_data.get("tables_count", 0)
                        dw["total_size_gb"] += pool_data.get("size_gb", 0)
                    else:
                        # For serverless, get tables from summary
                        if pool_data.get("tables_count", 0) == 0:
                            pool_data["tables_count"] = serverless_counts.get(
                                "tables", 0
                            )
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
                    wh_data = wh.get("warehouse_data") or wh.get("data") or wh
                    wh_data["workspace"] = ws_name
                    dw["sql_warehouses"].append(wh_data)

                # Unity Catalog - aggregate from data folder structure
                uc_data = data_catalog.get("unity_catalog", {})
                catalogs_data = uc_data.get("catalogs", {})
                for cat_name, cat_content in catalogs_data.items():
                    if not isinstance(cat_content, dict):
                        continue
                    # Read catalog info from its JSON file
                    cat_info = cat_content.get(cat_name, {})
                    cat_data_inner = (
                        cat_info.get("data", cat_info)
                        if isinstance(cat_info, dict)
                        else {}
                    )

                    schemas_content = cat_content.get("schemas", {})
                    schema_count = 0
                    managed_count = 0
                    external_count = 0
                    view_count = 0
                    volume_count = 0
                    function_count = 0

                    schema_list = []
                    for schema_name, schema_content in schemas_content.items():
                        if not isinstance(schema_content, dict):
                            continue
                        schema_count += 1
                        s_managed = 0
                        s_external = 0
                        s_views = 0
                        s_volumes = 0
                        s_functions = 0

                        tables_content = schema_content.get("tables", {})
                        if isinstance(tables_content, dict):
                            for tbl_name, tbl_data in tables_content.items():
                                if not isinstance(tbl_data, dict):
                                    continue
                                t_inner = tbl_data.get("data", tbl_data)
                                t_type = t_inner.get("type", "")
                                item = {
                                    "name": t_inner.get("name", tbl_name),
                                    "catalog": cat_name,
                                    "schema": schema_name,
                                    "type": t_type,
                                    "format": t_inner.get("format", ""),
                                    "columns": t_inner.get("columns", 0),
                                    "size_bytes": t_inner.get("statistics_size_bytes"),
                                    "row_count": t_inner.get("statistics_row_count"),
                                    "workspace": ws_name,
                                }
                                if t_type == "VIEW":
                                    s_views += 1
                                    dw.setdefault("views", []).append(item)
                                elif t_type == "MANAGED":
                                    s_managed += 1
                                    dw.setdefault("tables", []).append(item)
                                else:
                                    s_external += 1
                                    dw.setdefault("tables", []).append(item)

                        volumes_content = schema_content.get("volumes", {})
                        if isinstance(volumes_content, dict):
                            s_volumes = len(volumes_content)

                        functions_content = schema_content.get("functions", {})
                        if isinstance(functions_content, dict):
                            s_functions = len(functions_content)

                        managed_count += s_managed
                        external_count += s_external
                        view_count += s_views
                        volume_count += s_volumes
                        function_count += s_functions

                        schema_list.append(
                            {
                                "name": schema_name,
                                "catalog": cat_name,
                                "managed_tables": s_managed,
                                "external_tables": s_external,
                                "views": s_views,
                                "volumes": s_volumes,
                                "functions": s_functions,
                                "workspace": ws_name,
                            }
                        )

                    dw.setdefault("catalogs", []).append(
                        {
                            "name": cat_name,
                            "owner": cat_data_inner.get("owner", ""),
                            "comment": cat_data_inner.get("comment", ""),
                            "schemas": schema_count,
                            "managed_tables": managed_count,
                            "external_tables": external_count,
                            "views": view_count,
                            "volumes": volume_count,
                            "functions": function_count,
                            "workspace": ws_name,
                        }
                    )

                    dw.setdefault("schemas", []).extend(schema_list)
                    dw["total_tables"] += managed_count + external_count

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
                    activities_count = (
                        len(activities) if isinstance(activities, list) else 0
                    )
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
