#!/usr/bin/env python
"""
ADF to Fabric Migration CLI Tool

A standalone command-line application for migrating Azure Data Factory pipelines
to Microsoft Fabric Data Pipelines. This tool provides end-to-end migration including:
- ARM template parsing and analysis
- Component compatibility checking
- Connection creation in Fabric
- Pipeline deployment to Fabric workspace

Usage:
    python cli_migrator.py analyze <arm_template.json>
    python cli_migrator.py migrate <arm_template.json> --workspace-id <id> [options]
    python cli_migrator.py profile <arm_template.json>
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import time

# Add the parent directory to path to import the library
sys.path.insert(0, str(Path(__file__).parent))

from adf_fabric_migrator import (
    ADFParser,
    PipelineTransformer,
    ConnectorMapper,
    GlobalParameterDetector,
    ComponentType,
    CompatibilityStatus,
    MappingConfidence,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f'adf_migration_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)
logger = logging.getLogger(__name__)


class FabricAPIClient:
    """
    Client for Microsoft Fabric REST API operations.
    
    This client handles authentication and API calls to Fabric for creating
    connections and deploying pipelines.
    """
    
    def __init__(self, workspace_id: str, token: Optional[str] = None):
        """
        Initialize Fabric API client.
        
        Args:
            workspace_id: The target Fabric workspace ID
            token: Bearer token for authentication (if None, will use Azure CLI)
        """
        self.workspace_id = workspace_id
        self.base_url = "https://api.fabric.microsoft.com/v1"
        self.token = token
        
        if not self.token:
            self.token = self._get_token_from_azure_cli()
    
    def _get_token_from_azure_cli(self) -> str:
        """Get access token from Azure CLI."""
        try:
            import subprocess
            result = subprocess.run(
                ["az", "account", "get-access-token", "--resource", "https://api.fabric.microsoft.com"],
                capture_output=True,
                text=True,
                check=True
            )
            token_data = json.loads(result.stdout)
            return token_data["accessToken"]
        except Exception as e:
            logger.error(f"Failed to get token from Azure CLI: {e}")
            logger.info("Please ensure Azure CLI is installed and you're logged in (az login)")
            sys.exit(1)
    
    def create_connection(self, connection_def: Dict[str, Any]) -> Optional[str]:
        """
        Create a connection in Fabric workspace.
        
        Args:
            connection_def: Connection definition with name, type, and properties
            
        Returns:
            Connection ID if successful, None otherwise
        """
        try:
            import requests
            
            url = f"{self.base_url}/workspaces/{self.workspace_id}/connections"
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, headers=headers, json=connection_def)
            response.raise_for_status()
            
            result = response.json()
            connection_id = result.get("id")
            logger.info(f"✓ Created connection: {connection_def.get('displayName')} (ID: {connection_id})")
            return connection_id
            
        except Exception as e:
            logger.error(f"Failed to create connection {connection_def.get('displayName')}: {e}")
            return None
    
    def create_pipeline(self, pipeline_def: Dict[str, Any], pipeline_name: str) -> Optional[str]:
        """
        Create a data pipeline in Fabric workspace.
        
        Args:
            pipeline_def: Pipeline definition in Fabric format
            pipeline_name: Name for the pipeline
            
        Returns:
            Pipeline ID if successful, None otherwise
        """
        try:
            import requests
            
            url = f"{self.base_url}/workspaces/{self.workspace_id}/items"
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "type": "DataPipeline",
                "displayName": pipeline_name,
                "definition": {
                    "parts": [
                        {
                            "path": "pipeline-content.json",
                            "payload": pipeline_def.get("payload", ""),
                            "payloadType": "InlineBase64"
                        }
                    ]
                }
            }
            
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            result = response.json()
            pipeline_id = result.get("id")
            logger.info(f"✓ Created pipeline: {pipeline_name} (ID: {pipeline_id})")
            return pipeline_id
            
        except Exception as e:
            logger.error(f"Failed to create pipeline {pipeline_name}: {e}")
            return None
    
    def create_variable_library(self, library_name: str, variables: Dict[str, Any]) -> Optional[str]:
        """
        Create a variable library for global parameters.
        
        Args:
            library_name: Name for the variable library
            variables: Dictionary of variables with types and values
            
        Returns:
            Library ID if successful, None otherwise
        """
        try:
            import requests
            
            url = f"{self.base_url}/workspaces/{self.workspace_id}/items"
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            # Build variable library definition
            library_def = {
                "type": "VariableLibrary",
                "displayName": library_name,
                "definition": {
                    "variables": variables
                }
            }
            
            response = requests.post(url, headers=headers, json=library_def)
            response.raise_for_status()
            
            result = response.json()
            library_id = result.get("id")
            logger.info(f"✓ Created variable library: {library_name} (ID: {library_id})")
            return library_id
            
        except Exception as e:
            logger.error(f"Failed to create variable library {library_name}: {e}")
            return None


class MigrationCLI:
    """Main CLI application for ADF to Fabric migration."""
    
    def __init__(self):
        self.parser_obj = ADFParser()
        self.transformer = PipelineTransformer()
        self.connector_mapper = ConnectorMapper()
        self.global_param_detector = GlobalParameterDetector()
    
    def analyze_arm_template(self, template_path: str) -> None:
        """
        Analyze an ARM template and display compatibility information.
        
        Args:
            template_path: Path to the ARM template JSON file
        """
        logger.info(f"Analyzing ARM template: {template_path}")
        
        try:
            # Parse template
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
            
            components = self.parser_obj.parse_arm_template(template_content)
            
            # Display summary
            print("\n" + "=" * 80)
            print("COMPONENT ANALYSIS")
            print("=" * 80)
            
            summary = self.parser_obj.get_component_summary()
            print(f"\nTotal Components: {summary.total}")
            print(f"  ✓ Supported: {summary.supported}")
            print(f"  ⚠ Partially Supported: {summary.partially_supported}")
            print(f"  ✗ Unsupported: {summary.unsupported}")
            
            print("\nBy Type:")
            for comp_type, count in summary.by_type.items():
                print(f"  {comp_type}: {count}")
            
            # Display components
            print("\n" + "=" * 80)
            print("COMPONENTS")
            print("=" * 80)
            
            for component in components:
                status_icon = {
                    CompatibilityStatus.SUPPORTED: "✓",
                    CompatibilityStatus.PARTIALLY_SUPPORTED: "⚠",
                    CompatibilityStatus.UNSUPPORTED: "✗"
                }.get(component.compatibility_status, "?")
                
                print(f"\n{status_icon} {component.name}")
                print(f"  Type: {component.type.value}")
                print(f"  Status: {component.compatibility_status.value}")
                print(f"  Target: {component.fabric_target.type.value}")
                
                if component.warnings:
                    print("  Warnings:")
                    for warning in component.warnings:
                        print(f"    - {warning}")
                
                if component.suggestions:
                    print("  Suggestions:")
                    for suggestion in component.suggestions:
                        print(f"    💡 {suggestion}")
            
            # Connector analysis
            print("\n" + "=" * 80)
            print("CONNECTOR MAPPING")
            print("=" * 80)
            
            linked_services = self.parser_obj.get_components_by_type(ComponentType.LINKED_SERVICE)
            for ls in linked_services:
                ls_type = ls.definition.get("properties", {}).get("type", "Unknown")
                mapping = self.connector_mapper.map_connector({"type": ls_type})
                
                confidence_icon = {
                    MappingConfidence.HIGH: "✓",
                    MappingConfidence.MEDIUM: "⚠",
                    MappingConfidence.LOW: "?",
                    MappingConfidence.NOT_SUPPORTED: "✗"
                }.get(mapping.mapping_confidence, "?")
                
                print(f"\n{confidence_icon} {ls.name}")
                print(f"  ADF Type: {mapping.adf_type}")
                print(f"  → Fabric Type: {mapping.fabric_type}")
                print(f"  Confidence: {mapping.mapping_confidence.value}")
                print(f"  Supported: {mapping.is_supported}")
                
                if mapping.notes:
                    print(f"  Notes: {mapping.notes}")
            
            print("\n" + "=" * 80)
            
        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)
            sys.exit(1)
    
    def generate_profile(self, template_path: str, output_path: Optional[str] = None) -> None:
        """
        Generate a comprehensive migration profile report.
        
        Args:
            template_path: Path to the ARM template JSON file
            output_path: Optional path to save the profile JSON
        """
        logger.info(f"Generating profile for: {template_path}")
        
        try:
            # Parse template
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
            
            file_size = Path(template_path).stat().st_size
            components = self.parser_obj.parse_arm_template(template_content)
            
            # Generate profile
            profile = self.parser_obj.generate_profile(components, template_path, file_size)
            
            # Display profile
            print("\n" + "=" * 80)
            print("MIGRATION PROFILE")
            print("=" * 80)
            
            print(f"\nTemplate: {profile.file_name}")
            print(f"Size: {profile.file_size_bytes:,} bytes")
            print(f"Parsed: {profile.parsed_at}")
            
            print("\n" + "-" * 80)
            print("METRICS")
            print("-" * 80)
            print(f"Pipelines: {profile.metrics.total_pipelines}")
            print(f"Activities: {profile.metrics.total_activities}")
            print(f"Avg Activities/Pipeline: {profile.metrics.avg_activities_per_pipeline:.1f}")
            print(f"Max Pipeline Depth: {profile.metrics.max_pipeline_depth}")
            print(f"Datasets: {profile.metrics.total_datasets}")
            print(f"Linked Services: {profile.metrics.total_linked_services}")
            print(f"Triggers: {profile.metrics.total_triggers}")
            print(f"Global Parameters: {profile.metrics.total_global_parameters}")
            print(f"Integration Runtimes: {profile.metrics.total_integration_runtimes}")
            
            print("\n" + "-" * 80)
            print("INSIGHTS")
            print("-" * 80)
            for insight in profile.insights:
                print(f"\n{insight.icon} {insight.title}")
                print(f"  {insight.description}")
                if insight.recommendation:
                    print(f"  💡 {insight.recommendation}")
            
            # Save to file if requested
            if output_path:
                with open(output_path, 'w', encoding='utf-8') as f:
                    # Convert profile to dict for JSON serialization
                    profile_dict = {
                        "file_name": profile.file_name,
                        "file_size_bytes": profile.file_size_bytes,
                        "parsed_at": profile.parsed_at,
                        "metrics": {
                            "total_pipelines": profile.metrics.total_pipelines,
                            "total_activities": profile.metrics.total_activities,
                            "avg_activities_per_pipeline": profile.metrics.avg_activities_per_pipeline,
                            "max_pipeline_depth": profile.metrics.max_pipeline_depth,
                            "total_datasets": profile.metrics.total_datasets,
                            "total_linked_services": profile.metrics.total_linked_services,
                            "total_triggers": profile.metrics.total_triggers,
                            "total_global_parameters": profile.metrics.total_global_parameters,
                            "total_integration_runtimes": profile.metrics.total_integration_runtimes,
                        },
                        "insights": [
                            {
                                "icon": i.icon,
                                "title": i.title,
                                "description": i.description,
                                "severity": i.severity.value,
                                "recommendation": i.recommendation
                            }
                            for i in profile.insights
                        ],
                        "component_summary": {
                            "total": profile.component_summary.total,
                            "supported": profile.component_summary.supported,
                            "partially_supported": profile.component_summary.partially_supported,
                            "unsupported": profile.component_summary.unsupported,
                            "by_type": profile.component_summary.by_type
                        }
                    }
                    json.dump(profile_dict, f, indent=2)
                logger.info(f"Profile saved to: {output_path}")
            
            print("\n" + "=" * 80)
            
        except Exception as e:
            logger.error(f"Profile generation failed: {e}", exc_info=True)
            sys.exit(1)
    
    def migrate(
        self,
        template_path: str,
        workspace_id: str,
        deploy_connections: bool = True,
        deploy_pipelines: bool = True,
        deploy_global_params: bool = True,
        connection_config_path: Optional[str] = None,
        databricks_to_trident: bool = False,
        dry_run: bool = False
    ) -> None:
        """
        Perform end-to-end migration from ADF to Fabric.
        
        Args:
            template_path: Path to the ARM template JSON file
            workspace_id: Target Fabric workspace ID
            deploy_connections: Whether to create connections in Fabric
            deploy_pipelines: Whether to create pipelines in Fabric
            deploy_global_params: Whether to create variable library for global parameters
            connection_config_path: Optional path to JSON file with connection configurations
            databricks_to_trident: Transform DatabricksNotebook to TridentNotebook
            dry_run: If True, only show what would be done without making changes
        """
        logger.info(f"Starting migration from {template_path} to workspace {workspace_id}")
        
        if dry_run:
            logger.info("DRY RUN MODE - No changes will be made to Fabric")
        
        try:
            # Parse ARM template
            logger.info("Step 1: Parsing ARM template...")
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
                arm_template = json.loads(template_content)
            
            components = self.parser_obj.parse_arm_template(template_content)
            logger.info(f"Found {len(components)} components")
            
            # Initialize Fabric API client
            fabric_client = None if dry_run else FabricAPIClient(workspace_id)
            
            # Load connection configuration
            connection_configs = {}
            if connection_config_path and Path(connection_config_path).exists():
                with open(connection_config_path, 'r', encoding='utf-8') as f:
                    connection_configs = json.load(f)
                logger.info(f"Loaded connection configurations from {connection_config_path}")
            
            # Step 2: Create connections
            connection_mappings = {}
            if deploy_connections:
                logger.info("\nStep 2: Creating Fabric connections...")
                linked_services = self.parser_obj.get_components_by_type(ComponentType.LINKED_SERVICE)
                
                for ls in linked_services:
                    ls_name = ls.name
                    ls_type = ls.definition.get("properties", {}).get("type", "Unknown")
                    
                    # Map connector type
                    mapping = self.connector_mapper.map_connector({"type": ls_type})
                    
                    if not mapping.is_supported:
                        logger.warning(f"⚠ Skipping unsupported connector: {ls_name} ({ls_type})")
                        continue
                    
                    # Build connection definition
                    connection_def = {
                        "displayName": ls_name,
                        "connectionType": mapping.fabric_type,
                        "description": f"Migrated from ADF LinkedService: {ls_name}"
                    }
                    
                    # Add connection-specific config if provided
                    if ls_name in connection_configs:
                        connection_def.update(connection_configs[ls_name])
                    
                    if dry_run:
                        logger.info(f"[DRY RUN] Would create connection: {ls_name} ({mapping.fabric_type})")
                        connection_mappings[ls_name] = f"mock-connection-id-{ls_name}"
                    else:
                        connection_id = fabric_client.create_connection(connection_def)
                        if connection_id:
                            connection_mappings[ls_name] = connection_id
            
            # Step 3: Detect and migrate global parameters
            if deploy_global_params:
                logger.info("\nStep 3: Detecting global parameters...")
                global_params = self.global_param_detector.detect_with_fallback(components, arm_template)
                
                if global_params:
                    logger.info(f"Found {len(global_params)} global parameters")
                    
                    # Build variable library
                    variables = {}
                    for param in global_params:
                        variables[param.name] = {
                            "type": param.fabric_data_type,
                            "value": param.value
                        }
                    
                    factory_name = template_path.split('/')[-1].replace('.json', '')
                    library_name = f"{factory_name}_GlobalParameters"
                    
                    if dry_run:
                        logger.info(f"[DRY RUN] Would create variable library: {library_name}")
                    else:
                        fabric_client.create_variable_library(library_name, variables)
                else:
                    logger.info("No global parameters detected")
            
            # Step 4: Transform and deploy pipelines
            if deploy_pipelines:
                logger.info("\nStep 4: Transforming and deploying pipelines...")
                
                # Enable Databricks transformation if requested
                if databricks_to_trident:
                    self.transformer.set_databricks_to_trident(True)
                    logger.info("Enabled DatabricksNotebook → TridentNotebook transformation")
                
                # Set connection mappings
                self.transformer.set_connection_mappings(connection_mappings)
                
                pipelines = self.parser_obj.get_components_by_type(ComponentType.PIPELINE)
                logger.info(f"Processing {len(pipelines)} pipelines...")
                
                for pipeline in pipelines:
                    try:
                        # Transform pipeline
                        fabric_def = self.transformer.transform_pipeline_definition(
                            pipeline.definition,
                            pipeline.name
                        )
                        
                        # Generate deployment payload
                        payload = self.transformer.generate_fabric_pipeline_payload(fabric_def)
                        
                        if dry_run:
                            logger.info(f"[DRY RUN] Would create pipeline: {pipeline.name}")
                            activities = fabric_def.get("properties", {}).get("activities", [])
                            logger.info(f"  Activities: {len(activities)}")
                            for activity in activities:
                                logger.info(f"    - {activity.get('name')} ({activity.get('type')})")
                        else:
                            fabric_client.create_pipeline(payload, pipeline.name)
                        
                    except Exception as e:
                        logger.error(f"Failed to process pipeline {pipeline.name}: {e}")
            
            # Summary
            print("\n" + "=" * 80)
            print("MIGRATION COMPLETE" if not dry_run else "DRY RUN COMPLETE")
            print("=" * 80)
            print(f"\nWorkspace ID: {workspace_id}")
            print(f"Connections created: {len(connection_mappings)}")
            print(f"Pipelines processed: {len(self.parser_obj.get_components_by_type(ComponentType.PIPELINE))}")
            
            if dry_run:
                print("\n⚠ This was a DRY RUN - no changes were made to Fabric")
                print("Remove --dry-run flag to perform actual migration")
            
            print("\n" + "=" * 80)
            
        except Exception as e:
            logger.error(f"Migration failed: {e}", exc_info=True)
            sys.exit(1)


def main():
    """Main entry point for the CLI application."""
    parser = argparse.ArgumentParser(
        description="ADF to Fabric Migration CLI Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze an ARM template
  python cli_migrator.py analyze adf_template.json
  
  # Generate migration profile
  python cli_migrator.py profile adf_template.json --output profile.json
  
  # Perform migration (dry run)
  python cli_migrator.py migrate adf_template.json --workspace-id abc123 --dry-run
  
  # Full migration with custom connection config
  python cli_migrator.py migrate adf_template.json \\
    --workspace-id abc123 \\
    --connection-config connections.json \\
    --databricks-to-trident
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Analyze command
    analyze_parser = subparsers.add_parser('analyze', help='Analyze ARM template for compatibility')
    analyze_parser.add_argument('template', help='Path to ARM template JSON file')
    
    # Profile command
    profile_parser = subparsers.add_parser('profile', help='Generate migration profile report')
    profile_parser.add_argument('template', help='Path to ARM template JSON file')
    profile_parser.add_argument('--output', '-o', help='Path to save profile JSON')
    
    # Migrate command
    migrate_parser = subparsers.add_parser('migrate', help='Perform end-to-end migration')
    migrate_parser.add_argument('template', help='Path to ARM template JSON file')
    migrate_parser.add_argument('--workspace-id', '-w', required=True, help='Target Fabric workspace ID')
    migrate_parser.add_argument('--skip-connections', action='store_true', help='Skip connection creation')
    migrate_parser.add_argument('--skip-pipelines', action='store_true', help='Skip pipeline creation')
    migrate_parser.add_argument('--skip-global-params', action='store_true', help='Skip global parameter migration')
    migrate_parser.add_argument('--connection-config', '-c', help='Path to connection configuration JSON')
    migrate_parser.add_argument('--databricks-to-trident', action='store_true', 
                               help='Transform DatabricksNotebook to TridentNotebook')
    migrate_parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Execute command
    cli = MigrationCLI()
    
    if args.command == 'analyze':
        cli.analyze_arm_template(args.template)
    
    elif args.command == 'profile':
        cli.generate_profile(args.template, args.output)
    
    elif args.command == 'migrate':
        cli.migrate(
            template_path=args.template,
            workspace_id=args.workspace_id,
            deploy_connections=not args.skip_connections,
            deploy_pipelines=not args.skip_pipelines,
            deploy_global_params=not args.skip_global_params,
            connection_config_path=args.connection_config,
            databricks_to_trident=args.databricks_to_trident,
            dry_run=args.dry_run
        )


if __name__ == "__main__":
    main()
