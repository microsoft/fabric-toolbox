/**
 * Test file for ADF Profiling Services
 * 
 * This file demonstrates the usage of the new profiling functionality
 * and can be used for manual testing.
 */

import { adfParserService } from '../adfParserService';
import { exportProfileToMarkdown, exportProfileToJson } from '../profileExportService';

// Sample ARM template for testing
const sampleARMTemplate = {
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "resources": [
    {
      "type": "Microsoft.DataFactory/factories",
      "name": "SampleDataFactory",
      "apiVersion": "2018-06-01",
      "location": "eastus",
      "properties": {},
      "resources": [
        {
          "type": "pipelines",
          "name": "SamplePipeline",
          "apiVersion": "2018-06-01",
          "properties": {
            "activities": [
              {
                "name": "CopyData",
                "type": "Copy",
                "inputs": [
                  {
                    "referenceName": "SourceDataset",
                    "type": "DatasetReference"
                  }
                ],
                "outputs": [
                  {
                    "referenceName": "SinkDataset",
                    "type": "DatasetReference"
                  }
                ],
                "typeProperties": {
                  "source": { "type": "BlobSource" },
                  "sink": { "type": "BlobSink" }
                }
              },
              {
                "name": "ExecuteChildPipeline",
                "type": "ExecutePipeline",
                "typeProperties": {
                  "pipeline": {
                    "referenceName": "ChildPipeline",
                    "type": "PipelineReference"
                  }
                }
              }
            ],
            "parameters": {
              "param1": { "type": "String" },
              "param2": { "type": "String" }
            },
            "folder": {
              "name": "ETL/ProcessingPipelines"
            }
          }
        },
        {
          "type": "pipelines",
          "name": "ChildPipeline",
          "apiVersion": "2018-06-01",
          "properties": {
            "activities": [
              {
                "name": "TransformData",
                "type": "HDInsightSpark",
                "typeProperties": {}
              }
            ]
          }
        },
        {
          "type": "datasets",
          "name": "SourceDataset",
          "apiVersion": "2018-06-01",
          "properties": {
            "type": "AzureBlob",
            "linkedServiceName": {
              "referenceName": "AzureBlobStorage",
              "type": "LinkedServiceReference"
            },
            "typeProperties": {
              "folderPath": "input",
              "format": { "type": "TextFormat" }
            }
          }
        },
        {
          "type": "datasets",
          "name": "SinkDataset",
          "apiVersion": "2018-06-01",
          "properties": {
            "type": "AzureBlob",
            "linkedServiceName": {
              "referenceName": "AzureBlobStorage",
              "type": "LinkedServiceReference"
            },
            "typeProperties": {
              "folderPath": "output",
              "format": { "type": "TextFormat" }
            }
          }
        },
        {
          "type": "linkedServices",
          "name": "AzureBlobStorage",
          "apiVersion": "2018-06-01",
          "properties": {
            "type": "AzureBlobStorage",
            "typeProperties": {
              "connectionString": "DefaultEndpointsProtocol=https;..."
            }
          }
        },
        {
          "type": "triggers",
          "name": "DailyTrigger",
          "apiVersion": "2018-06-01",
          "properties": {
            "type": "ScheduleTrigger",
            "runtimeState": "Started",
            "pipelines": [
              {
                "pipelineReference": {
                  "referenceName": "SamplePipeline",
                  "type": "PipelineReference"
                }
              }
            ],
            "typeProperties": {
              "recurrence": {
                "frequency": "Day",
                "interval": 1,
                "startTime": "2024-01-01T00:00:00Z"
              }
            }
          }
        }
      ]
    }
  ]
};

/**
 * Test the profiling functionality
 */
export async function testProfilingService() {
  console.log('🧪 Testing ADF Profiling Service...\n');

  try {
    // Step 1: Parse ARM template
    console.log('Step 1: Parsing ARM template...');
    const components = await adfParserService.parseARMTemplate(
      JSON.stringify(sampleARMTemplate)
    );
    console.log(`✅ Parsed ${components.length} components\n`);

    // Step 2: Generate profile
    console.log('Step 2: Generating profile...');
    const profile = adfParserService.generateProfile(
      components,
      'sample-template.json',
      JSON.stringify(sampleARMTemplate).length
    );
    console.log('✅ Profile generated\n');

    // Step 3: Display metrics
    console.log('📊 Profile Metrics:');
    console.log(`  - Total Pipelines: ${profile.metrics.totalPipelines}`);
    console.log(`  - Total Datasets: ${profile.metrics.totalDatasets}`);
    console.log(`  - Total Linked Services: ${profile.metrics.totalLinkedServices}`);
    console.log(`  - Total Triggers: ${profile.metrics.totalTriggers}`);
    console.log(`  - Total Activities: ${profile.metrics.totalActivities}`);
    console.log(`  - Avg Activities/Pipeline: ${profile.metrics.avgActivitiesPerPipeline.toFixed(2)}\n`);

    // Step 4: Display activity breakdown
    console.log('🔧 Activity Type Distribution:');
    Object.entries(profile.metrics.activitiesByType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    console.log('');

    // Step 5: Display artifacts
    console.log('🔄 Pipeline Artifacts:');
    profile.artifacts.pipelines.forEach(p => {
      console.log(`  - ${p.name}:`);
      console.log(`    Activities: ${p.activityCount}`);
      console.log(`    Triggered By: ${p.triggeredBy.join(', ') || 'None'}`);
      console.log(`    Uses Datasets: ${p.usesDatasets.join(', ')}`);
      console.log(`    Folder: ${p.folder || 'Root'}`);
    });
    console.log('');

    // Step 6: Display insights
    console.log('💡 Insights:');
    profile.insights.forEach((insight, idx) => {
      console.log(`  ${idx + 1}. [${insight.severity.toUpperCase()}] ${insight.title}`);
      console.log(`     ${insight.description}`);
      if (insight.recommendation) {
        console.log(`     💡 ${insight.recommendation}`);
      }
    });
    console.log('');

    // Step 7: Display dependency graph summary
    console.log('🗺️ Dependency Graph:');
    console.log(`  - Nodes: ${profile.dependencies.nodes.length}`);
    console.log(`  - Edges: ${profile.dependencies.edges.length}`);
    console.log(`  - Node Types:`);
    const nodeTypes = profile.dependencies.nodes.reduce((acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(nodeTypes).forEach(([type, count]) => {
      console.log(`    - ${type}: ${count}`);
    });
    console.log('');

    // Step 8: Export to Markdown
    console.log('📤 Exporting to Markdown...');
    const markdown = exportProfileToMarkdown(profile);
    console.log(`✅ Markdown generated (${markdown.length} characters)\n`);

    // Display first 500 characters of markdown
    console.log('📄 Markdown Preview:');
    console.log('─'.repeat(80));
    console.log(markdown.substring(0, 500));
    console.log('...');
    console.log('─'.repeat(80));
    console.log('');

    // Step 9: Export to JSON
    console.log('📤 Exporting to JSON...');
    const json = exportProfileToJson(profile);
    console.log(`✅ JSON generated (${json.length} characters)\n`);

    console.log('✅ All tests completed successfully!');
    
    return {
      success: true,
      profile,
      markdown,
      json
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test with a complex template
 */
export function generateComplexTestTemplate() {
  const resources: any[] = [];
  
  // Generate 10 pipelines
  for (let i = 1; i <= 10; i++) {
    resources.push({
      type: "pipelines",
      name: `Pipeline${i}`,
      apiVersion: "2018-06-01",
      properties: {
        activities: [
          {
            name: `CopyActivity${i}`,
            type: "Copy",
            inputs: [{ referenceName: `Dataset${i}`, type: "DatasetReference" }],
            outputs: [{ referenceName: `Dataset${i + 1}`, type: "DatasetReference" }],
            typeProperties: { source: { type: "BlobSource" }, sink: { type: "BlobSink" } }
          },
          {
            name: `LookupActivity${i}`,
            type: "Lookup",
            typeProperties: {}
          }
        ],
        folder: { name: i <= 5 ? "Production" : "Development" }
      }
    });
  }
  
  // Generate 15 datasets
  for (let i = 1; i <= 15; i++) {
    resources.push({
      type: "datasets",
      name: `Dataset${i}`,
      apiVersion: "2018-06-01",
      properties: {
        type: "AzureBlob",
        linkedServiceName: {
          referenceName: `LinkedService${Math.ceil(i / 3)}`,
          type: "LinkedServiceReference"
        },
        typeProperties: {
          folderPath: `data/folder${i}`
        }
      }
    });
  }
  
  // Generate 5 linked services
  for (let i = 1; i <= 5; i++) {
    resources.push({
      type: "linkedServices",
      name: `LinkedService${i}`,
      apiVersion: "2018-06-01",
      properties: {
        type: i <= 3 ? "AzureBlobStorage" : "AzureSqlDatabase",
        typeProperties: {
          connectionString: "connection-string-here"
        }
      }
    });
  }
  
  // Generate 5 triggers
  for (let i = 1; i <= 5; i++) {
    resources.push({
      type: "triggers",
      name: `Trigger${i}`,
      apiVersion: "2018-06-01",
      properties: {
        type: "ScheduleTrigger",
        runtimeState: i <= 3 ? "Started" : "Stopped",
        pipelines: [
          {
            pipelineReference: {
              referenceName: `Pipeline${i}`,
              type: "PipelineReference"
            }
          }
        ],
        typeProperties: {
          recurrence: {
            frequency: "Hour",
            interval: i * 2,
            startTime: "2024-01-01T00:00:00Z"
          }
        }
      }
    });
  }
  
  return {
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    "contentVersion": "1.0.0.0",
    "resources": [{
      "type": "Microsoft.DataFactory/factories",
      "name": "ComplexDataFactory",
      "apiVersion": "2018-06-01",
      "location": "eastus",
      "properties": {},
      "resources": resources
    }]
  };
}

// Export for use in other test files
export { sampleARMTemplate };
