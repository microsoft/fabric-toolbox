#!/usr/bin/env python
"""
Example usage of the ADF Fabric Migrator library.

This script demonstrates how to use the library to parse an ADF ARM template,
analyze its contents, and transform pipelines to Fabric format.
"""

import json
import sys
from pathlib import Path

# Add the parent directory to path to import the library
sys.path.insert(0, str(Path(__file__).parent))

from adf_fabric_migrator import (
    ADFParser,
    PipelineTransformer,
    ConnectorMapper,
    GlobalParameterDetector,
    ComponentType,
)


def main():
    """Main example function."""
    print("=" * 60)
    print("ADF Fabric Migrator - Example Usage")
    print("=" * 60)
    
    # Create a sample ARM template (in real usage, you would load from a file)
    arm_template = create_sample_arm_template()
    
    # Step 1: Parse the ARM template
    print("\n1. Parsing ARM template...")
    parser = ADFParser()
    components = parser.parse_arm_template(json.dumps(arm_template))
    
    print(f"   Found {len(components)} components:")
    for component in components:
        status = component.compatibility_status.value
        print(f"   - {component.name} ({component.type.value}) [{status}]")
        if component.warnings:
            for warning in component.warnings:
                print(f"     ⚠️  {warning}")
    
    # Step 2: Get component summary
    print("\n2. Component Summary:")
    summary = parser.get_component_summary()
    print(f"   Total: {summary.total}")
    print(f"   Supported: {summary.supported}")
    print(f"   Partially Supported: {summary.partially_supported}")
    print(f"   Unsupported: {summary.unsupported}")
    print(f"   By Type: {summary.by_type}")
    
    # Step 3: Analyze connectors
    print("\n3. Connector Mapping Analysis:")
    mapper = ConnectorMapper()
    linked_services = parser.get_components_by_type(ComponentType.LINKED_SERVICE)
    
    for ls in linked_services:
        ls_type = ls.definition.get("properties", {}).get("type", "Unknown")
        mapping = mapper.map_connector({"type": ls_type})
        
        print(f"   {ls.name}:")
        print(f"     ADF Type: {mapping.adf_type}")
        print(f"     Fabric Type: {mapping.fabric_type}")
        print(f"     Confidence: {mapping.mapping_confidence.value}")
        print(f"     Supported: {mapping.is_supported}")
    
    # Step 4: Transform pipelines
    print("\n4. Pipeline Transformation:")
    transformer = PipelineTransformer()
    pipelines = parser.get_components_by_type(ComponentType.PIPELINE)
    
    for pipeline in pipelines:
        fabric_def = transformer.transform_pipeline_definition(
            pipeline.definition,
            pipeline.name
        )
        
        activities = fabric_def.get("properties", {}).get("activities", [])
        print(f"   {pipeline.name}:")
        print(f"     Original activities: {len(pipeline.definition.get('properties', {}).get('activities', []))}")
        print(f"     Transformed activities: {len(activities)}")
        
        for activity in activities:
            print(f"       - {activity.get('name')} ({activity.get('type')})")
    
    # Step 5: Detect global parameters
    print("\n5. Global Parameter Detection:")
    detector = GlobalParameterDetector()
    global_params = detector.detect_with_fallback(components, arm_template)
    
    if global_params:
        print(f"   Found {len(global_params)} global parameters:")
        for param in global_params:
            print(f"   - {param.name}")
            print(f"     ADF Type: {param.adf_data_type}")
            print(f"     Fabric Type: {param.fabric_data_type}")
            print(f"     Referenced by: {', '.join(param.referenced_by_pipelines) or 'N/A'}")
    else:
        print("   No global parameters detected")
    
    # Step 6: Generate profile
    print("\n6. Profile Generation:")
    profile = parser.generate_profile(components, "example.json", 1024)
    
    print(f"   Metrics:")
    print(f"     Total Pipelines: {profile.metrics.total_pipelines}")
    print(f"     Total Activities: {profile.metrics.total_activities}")
    print(f"     Avg Activities/Pipeline: {profile.metrics.avg_activities_per_pipeline:.1f}")
    print(f"     Total Datasets: {profile.metrics.total_datasets}")
    print(f"     Total LinkedServices: {profile.metrics.total_linked_services}")
    print(f"     Total Triggers: {profile.metrics.total_triggers}")
    
    print(f"\n   Insights:")
    for insight in profile.insights:
        print(f"   {insight.icon} {insight.title}")
        print(f"      {insight.description}")
        if insight.recommendation:
            print(f"      💡 {insight.recommendation}")
    
    print("\n" + "=" * 60)
    print("Example completed successfully!")
    print("=" * 60)


def create_sample_arm_template():
    """Create a sample ARM template for demonstration."""
    return {
        "resources": [
            {
                "type": "Microsoft.DataFactory/factories",
                "name": "SampleDataFactory",
                "properties": {
                    "globalParameters": {
                        "environment": {
                            "type": "String",
                            "value": "development"
                        },
                        "maxRetries": {
                            "type": "Int",
                            "value": 3
                        }
                    }
                },
                "resources": [
                    # Pipeline 1: ETL Pipeline
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/ETL_Pipeline')]",
                        "properties": {
                            "activities": [
                                {
                                    "name": "CopyFromBlob",
                                    "type": "Copy",
                                    "inputs": [{"referenceName": "BlobSource", "type": "DatasetReference"}],
                                    "outputs": [{"referenceName": "SqlSink", "type": "DatasetReference"}],
                                    "typeProperties": {}
                                },
                                {
                                    "name": "TransformData",
                                    "type": "Script",
                                    "dependsOn": [{"activity": "CopyFromBlob", "dependencyConditions": ["Succeeded"]}],
                                    "typeProperties": {
                                        "scripts": [{"text": "UPDATE table SET status = 'processed'"}]
                                    }
                                },
                                {
                                    "name": "SendNotification",
                                    "type": "WebActivity",
                                    "dependsOn": [{"activity": "TransformData", "dependencyConditions": ["Succeeded"]}],
                                    "typeProperties": {
                                        "url": "@pipeline().globalParameters.environment",
                                        "method": "POST"
                                    }
                                }
                            ],
                            "parameters": {
                                "sourcePath": {"type": "String"},
                                "targetTable": {"type": "String", "defaultValue": "staging_table"}
                            },
                            "variables": {
                                "processedCount": {"type": "Int"}
                            },
                            "folder": {"name": "Production/ETL"}
                        }
                    },
                    # Pipeline 2: Orchestration Pipeline
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/Orchestration_Pipeline')]",
                        "properties": {
                            "activities": [
                                {
                                    "name": "RunETL",
                                    "type": "ExecutePipeline",
                                    "typeProperties": {
                                        "pipeline": {"referenceName": "ETL_Pipeline"},
                                        "waitOnCompletion": True,
                                        "parameters": {
                                            "sourcePath": "@pipeline().parameters.dataPath"
                                        }
                                    }
                                }
                            ],
                            "parameters": {
                                "dataPath": {"type": "String"}
                            }
                        }
                    },
                    # Datasets
                    {
                        "type": "Microsoft.DataFactory/factories/datasets",
                        "name": "[concat(parameters('factoryName'), '/BlobSource')]",
                        "properties": {
                            "type": "AzureBlob",
                            "linkedServiceName": {"referenceName": "AzureBlobStorage_LS", "type": "LinkedServiceReference"},
                            "typeProperties": {
                                "folderPath": "data/input"
                            }
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/datasets",
                        "name": "[concat(parameters('factoryName'), '/SqlSink')]",
                        "properties": {
                            "type": "AzureSqlTable",
                            "linkedServiceName": {"referenceName": "AzureSql_LS", "type": "LinkedServiceReference"},
                            "typeProperties": {
                                "tableName": "staging_table"
                            }
                        }
                    },
                    # LinkedServices
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/AzureBlobStorage_LS')]",
                        "properties": {
                            "type": "AzureBlobStorage",
                            "typeProperties": {
                                "connectionString": "DefaultEndpointsProtocol=https;AccountName=myaccount"
                            }
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/AzureSql_LS')]",
                        "properties": {
                            "type": "AzureSqlDatabase",
                            "typeProperties": {
                                "connectionString": "Server=myserver.database.windows.net;Database=mydb"
                            }
                        }
                    },
                    # Trigger
                    {
                        "type": "Microsoft.DataFactory/factories/triggers",
                        "name": "[concat(parameters('factoryName'), '/Daily_Trigger')]",
                        "properties": {
                            "type": "ScheduleTrigger",
                            "runtimeState": "Started",
                            "typeProperties": {
                                "recurrence": {
                                    "frequency": "Day",
                                    "interval": 1,
                                    "startTime": "2024-01-01T06:00:00Z",
                                    "timeZone": "UTC"
                                }
                            },
                            "pipelines": [
                                {
                                    "pipelineReference": {
                                        "referenceName": "ETL_Pipeline",
                                        "type": "PipelineReference"
                                    },
                                    "parameters": {
                                        "sourcePath": "daily/input"
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


if __name__ == "__main__":
    main()
