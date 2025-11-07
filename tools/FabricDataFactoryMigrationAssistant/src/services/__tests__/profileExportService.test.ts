/**
 * Profile Export Service Tests
 * 
 * Comprehensive unit tests for Markdown, JSON, and CSV export functionality.
 */

import { describe, it, expect } from 'vitest';
import { 
  exportProfileToMarkdown, 
  exportProfileToJson, 
  exportProfileToCsv 
} from '../profileExportService';
import { ADFProfile } from '../../types/profiling';

// Mock profile data for testing
const mockProfile: ADFProfile = {
  metadata: {
    fileName: 'test-template.json',
    fileSize: 10240,
    parsedAt: new Date('2025-10-09T12:00:00Z'),
    templateVersion: '1.0.0.0',
    factoryName: 'TestFactory',
  },
  metrics: {
    totalPipelines: 5,
    totalDatasets: 10,
    totalLinkedServices: 3,
    totalTriggers: 2,
    totalDataflows: 1,
    totalIntegrationRuntimes: 1,
    totalGlobalParameters: 2,
    totalActivities: 25,
    avgActivitiesPerPipeline: 5,
    maxActivitiesPerPipeline: 10,
    maxActivitiesPipelineName: 'OrchestratorPipeline',
    pipelineDependencies: 2,
    triggerPipelineMappings: 2,
    activitiesByType: {
      'Copy': 10,
      'Lookup': 5,
      'Execute Pipeline': 3,
      'ForEach': 4,
      'If Condition': 3,
    },
    datasetsPerLinkedService: {
      'AzureSqlLinkedService': 5,
      'AzureBlobLinkedService': 3,
    },
    pipelinesPerDataset: {
      'SourceDataset': 3,
      'SinkDataset': 1,
    },
    pipelinesPerTrigger: {
      'DailyTrigger': ['CopyPipeline'],
    },
    triggersPerPipeline: {
      'CopyPipeline': ['DailyTrigger'],
    },
  },
  artifacts: {
    pipelines: [
      {
        name: 'CopyPipeline',
        activityCount: 5,
        activities: [
          { name: 'CopyData', type: 'Copy' },
          { name: 'LookupSource', type: 'Lookup' },
        ],
        parameterCount: 2,
        triggeredBy: ['DailyTrigger'],
        usesDatasets: ['SourceDataset', 'SinkDataset'],
        executesPipelines: [],
        fabricMapping: {
          targetType: 'dataPipeline',
          compatibilityStatus: 'supported',
          migrationNotes: [],
        },
      },
      {
        name: 'OrchestratorPipeline',
        activityCount: 10,
        activities: [
          { name: 'Execute1', type: 'Execute Pipeline' },
          { name: 'Execute2', type: 'Execute Pipeline' },
        ],
        parameterCount: 3,
        triggeredBy: [],
        usesDatasets: ['ConfigDataset'],
        executesPipelines: ['CopyPipeline'],
        fabricMapping: {
          targetType: 'dataPipeline',
          compatibilityStatus: 'partiallySupported',
          migrationNotes: ['Replace GetMetadata with Fabric equivalent'],
        },
      },
    ],
    datasets: [
      {
        name: 'SourceDataset',
        type: 'AzureSqlTable',
        linkedService: 'AzureSqlLinkedService',
        usageCount: 3,
        usedByPipelines: ['CopyPipeline'],
        fabricMapping: {
          embeddedInActivity: true,
          requiresConnection: true,
        },
      },
    ],
    linkedServices: [
      {
        name: 'AzureSqlLinkedService',
        type: 'AzureSqlDatabase',
        usedByDatasets: ['SourceDataset'],
        usedByPipelines: ['CopyPipeline'],
        usageScore: 5,
        fabricMapping: {
          targetType: 'connector',
          connectorType: 'AzureSqlDatabase',
          requiresGateway: false,
        },
      },
    ],
    triggers: [
      {
        name: 'DailyTrigger',
        type: 'ScheduleTrigger',
        status: 'Started',
        pipelines: ['CopyPipeline'],
        schedule: '0 0 * * *',
        fabricMapping: {
          targetType: 'schedule',
          supportLevel: 'full',
        },
      },
    ],
    dataflows: [],
  },
  dependencies: {
    nodes: [
      { 
        id: 'CopyPipeline', 
        type: 'pipeline', 
        label: 'CopyPipeline',
        criticality: 'high',
        metadata: { activityCount: 5 }
      },
      { 
        id: 'OrchestratorPipeline', 
        type: 'pipeline', 
        label: 'OrchestratorPipeline',
        criticality: 'high',
        metadata: { activityCount: 10 }
      },
    ],
    edges: [
      { source: 'OrchestratorPipeline', target: 'CopyPipeline', type: 'executes' },
    ],
  },
  insights: [
    {
      id: 'factory-scale-1',
      icon: '📊',
      title: 'Small Factory',
      description: 'This is a small ADF instance with 5 pipelines',
      severity: 'info',
      metric: 5,
      recommendation: 'Consider consolidating pipelines for easier management',
    },
    {
      id: 'complexity-1',
      icon: '⚠️',
      title: 'Moderate Complexity',
      description: 'Average pipeline has 5 activities',
      severity: 'warning',
      metric: 5,
      recommendation: 'Review complex pipelines for optimization opportunities',
    },
  ],
};

describe('profileExportService', () => {
  describe('exportProfileToMarkdown', () => {
    it('should generate valid Markdown with all sections', () => {
      const markdown = exportProfileToMarkdown(mockProfile);

      // Check header
      expect(markdown).toContain('# ADF ARM Template Profile Report');
      expect(markdown).toContain('test-template.json');
      expect(markdown).toContain('10.00 KB');

      // Check metrics section
      expect(markdown).toContain('## 📊 Summary Metrics');
      expect(markdown).toContain('| Pipelines | 5 |');
      expect(markdown).toContain('| Datasets | 10 |');
      expect(markdown).toContain('| Linked Services | 3 |');

      // Check activity breakdown
      expect(markdown).toContain('## 🔧 Activity Type Distribution');
      expect(markdown).toContain('| Copy | 10 |');
      expect(markdown).toContain('| Lookup | 5 |');

      // Check insights
      expect(markdown).toContain('## 💡 Key Insights');
      expect(markdown).toContain('Small Factory');
      expect(markdown).toContain('Moderate Complexity');

      // Check artifact tables
      expect(markdown).toContain('## 🔄 Pipelines (2)');
      expect(markdown).toContain('CopyPipeline');
      expect(markdown).toContain('OrchestratorPipeline');

      expect(markdown).toContain('## 📊 Datasets (1)');
      expect(markdown).toContain('SourceDataset');

      expect(markdown).toContain('## 🔌 Linked Services (1)');
      expect(markdown).toContain('AzureSqlLinkedService');

      expect(markdown).toContain('## ⏰ Triggers (1)');
      expect(markdown).toContain('DailyTrigger');
    });

    it('should format percentages correctly', () => {
      const markdown = exportProfileToMarkdown(mockProfile);

      // Check percentage formatting in activity distribution
      expect(markdown).toMatch(/\d+\.\d+%/);
    });

    it('should include fabric target mappings', () => {
      const markdown = exportProfileToMarkdown(mockProfile);

      expect(markdown).toContain('Fabric Target');
      expect(markdown).toContain('Data Pipelines');
    });
  });

  describe('exportProfileToJson', () => {
    it('should generate valid JSON', () => {
      const json = exportProfileToJson(mockProfile);
      const parsed = JSON.parse(json);

      expect(parsed).toBeDefined();
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metrics).toBeDefined();
      expect(parsed.artifacts).toBeDefined();
      expect(parsed.dependencies).toBeDefined();
      expect(parsed.insights).toBeDefined();
    });

    it('should preserve all data fields', () => {
      const json = exportProfileToJson(mockProfile);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.fileName).toBe('test-template.json');
      expect(parsed.metrics.totalPipelines).toBe(5);
      expect(parsed.artifacts.pipelines.length).toBe(2);
      expect(parsed.insights.length).toBe(2);
    });

    it('should format JSON with proper indentation', () => {
      const json = exportProfileToJson(mockProfile);

      // Check for proper indentation (2 spaces)
      expect(json).toMatch(/\n  "/);
    });

    it('should handle date serialization', () => {
      const json = exportProfileToJson(mockProfile);
      const parsed = JSON.parse(json);

      expect(typeof parsed.metadata.parsedAt).toBe('string');
      expect(parsed.metadata.parsedAt).toContain('2025-10-09');
    });
  });

  describe('exportProfileToCsv', () => {
    it('should generate valid CSV with headers', () => {
      const csv = exportProfileToCsv(mockProfile);

      // Check for CSV headers
      expect(csv).toContain('Metric,Value');
    });

    it('should include file metadata', () => {
      const csv = exportProfileToCsv(mockProfile);

      expect(csv).toContain('File Name,test-template.json');
      expect(csv).toContain('File Size (KB),10.00');
    });

    it('should include all metrics', () => {
      const csv = exportProfileToCsv(mockProfile);

      expect(csv).toContain('Total Pipelines,5');
      expect(csv).toContain('Total Datasets,10');
      expect(csv).toContain('Total Linked Services,3');
      expect(csv).toContain('Total Triggers,2');
      expect(csv).toContain('Total Activities,25');
      expect(csv).toContain('Avg Activities per Pipeline,5.00');
    });

    it('should include max activities metrics', () => {
      const csv = exportProfileToCsv(mockProfile);

      expect(csv).toContain('Max Activities per Pipeline,10');
      expect(csv).toContain('Most Complex Pipeline,OrchestratorPipeline');
    });

    it('should format numbers correctly', () => {
      const csv = exportProfileToCsv(mockProfile);

      // Check for proper decimal formatting
      expect(csv).toMatch(/Avg Activities per Pipeline,\d+\.\d{2}/);
    });

    it('should handle empty artifact arrays', () => {
      const emptyProfile: ADFProfile = {
        ...mockProfile,
        artifacts: {
          pipelines: [],
          datasets: [],
          linkedServices: [],
          triggers: [],
          dataflows: [],
        },
      };

      const csv = exportProfileToCsv(emptyProfile);

      // Should still have headers and metrics
      expect(csv).toContain('Metric,Value');
      expect(csv).toContain('File Name,test-template.json');
    });
  });
});
