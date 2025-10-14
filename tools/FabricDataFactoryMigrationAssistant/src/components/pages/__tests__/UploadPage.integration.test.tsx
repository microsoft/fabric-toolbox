/**
 * UploadPage Integration Tests
 * 
 * Tests the profiling dashboard components and user interactions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider } from '../../../contexts/AppContext';
import { ProfilingDashboard } from '../../profiling/ProfilingDashboard';
import { ADFProfile } from '../../../types/profiling';

// Mock profile data
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
    },
    pipelinesPerDataset: {},
    pipelinesPerTrigger: {},
    triggersPerPipeline: {},
  },
  artifacts: {
    pipelines: [
      {
        name: 'TestPipeline',
        activityCount: 5,
        activities: [{ name: 'CopyData', type: 'Copy' }],
        parameterCount: 2,
        triggeredBy: [],
        usesDatasets: ['SourceDataset'],
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
        activities: [{ name: 'Execute1', type: 'Execute Pipeline' }],
        parameterCount: 3,
        triggeredBy: [],
        usesDatasets: [],
        executesPipelines: ['TestPipeline'],
        fabricMapping: {
          targetType: 'dataPipeline',
          compatibilityStatus: 'partiallySupported',
          migrationNotes: ['Manual review required'],
        },
      },
    ],
    datasets: [
      {
        name: 'SourceDataset',
        type: 'AzureSqlTable',
        linkedService: 'AzureSqlLinkedService',
        usageCount: 3,
        usedByPipelines: ['TestPipeline'],
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
        usedByPipelines: ['TestPipeline'],
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
        pipelines: ['TestPipeline'],
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
        id: 'TestPipeline',
        type: 'pipeline',
        label: 'TestPipeline',
        criticality: 'high',
        metadata: { activityCount: 5 },
      },
      {
        id: 'OrchestratorPipeline',
        type: 'pipeline',
        label: 'OrchestratorPipeline',
        criticality: 'high',
        metadata: { activityCount: 10 },
      },
    ],
    edges: [
      { source: 'OrchestratorPipeline', target: 'TestPipeline', type: 'executes' },
    ],
  },
  insights: [
    {
      id: 'test-1',
      icon: '📊',
      title: 'Small Factory',
      description: 'This is a small ADF instance',
      severity: 'info',
      metric: 5,
    },
    {
      id: 'test-2',
      icon: '⚠️',
      title: 'Moderate Complexity',
      description: 'Average pipeline has 5 activities',
      severity: 'warning',
      metric: 5,
    },
  ],
};

describe('UploadPage Integration Tests', () => {
  beforeEach(() => {
    // Clean up between tests
  });

  it('should display profiling dashboard with summary metrics', () => {
    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Check for key metrics
    expect(screen.getByText(/TestFactory/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Pipelines
    expect(screen.getByText('10')).toBeInTheDocument(); // Datasets
  });

  it('should switch between tabs in profiling dashboard', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Default tab should show summary
    expect(screen.getByText(/Summary Metrics/i)).toBeInTheDocument();

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show artifacts tables
    expect(screen.getByText(/TestPipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/OrchestratorPipeline/i)).toBeInTheDocument();

    // Switch to insights tab
    const insightsTab = screen.getByRole('tab', { name: /insights/i });
    await user.click(insightsTab);

    // Should show insights
    expect(screen.getByText(/Small Factory/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate Complexity/i)).toBeInTheDocument();
  });

  it('should display keyboard shortcut hints', () => {
    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Check for shortcut hints
    expect(screen.getByText(/Shortcuts:/i)).toBeInTheDocument();
    expect(screen.getByText(/\[1-3\]/i)).toBeInTheDocument();
    expect(screen.getByText(/\[E\]/i)).toBeInTheDocument();
  });

  it('should handle keyboard shortcuts for tab navigation', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Press '2' to switch to artifacts tab
    await user.keyboard('2');

    // Should show artifacts content
    expect(screen.getByText(/TestPipeline/i)).toBeInTheDocument();

    // Press '3' to switch to insights tab
    await user.keyboard('3');

    // Should show insights
    expect(screen.getByText(/Small Factory/i)).toBeInTheDocument();

    // Press '1' to return to summary
    await user.keyboard('1');

    // Should show summary metrics
    expect(screen.getByText(/Summary Metrics/i)).toBeInTheDocument();
  });

  it('should display activity type distribution', () => {
    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Should show activity breakdown
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // Copy count
    expect(screen.getByText('Lookup')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Lookup count
  });

  it('should display insights with severity indicators', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to insights tab
    const insightsTab = screen.getByRole('tab', { name: /insights/i });
    await user.click(insightsTab);

    // Check for insight titles
    expect(screen.getByText(/Small Factory/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate Complexity/i)).toBeInTheDocument();

    // Check for severity indicators (icons)
    expect(screen.getByText('📊')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('should display artifact tables with fabric mapping status', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show pipeline artifacts
    expect(screen.getByText('TestPipeline')).toBeInTheDocument();
    expect(screen.getByText('OrchestratorPipeline')).toBeInTheDocument();

    // Should show fabric mapping status
    expect(screen.getByText(/supported/i)).toBeInTheDocument();
    expect(screen.getByText(/partiallySupported/i)).toBeInTheDocument();
  });

  it('should show migration notes for partially supported pipelines', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show migration notes
    expect(screen.getByText(/Manual review required/i)).toBeInTheDocument();
  });

  it('should display dependency graph nodes and edges', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to dependencies tab
    const depsTab = screen.getByRole('tab', { name: /dependencies/i });
    await user.click(depsTab);

    // Should show dependency information
    expect(screen.getByText(/Dependency Graph/i)).toBeInTheDocument();
  });

  it('should have export button in dashboard', () => {
    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Find export button
    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeInTheDocument();
  });

  it('should show factory name in header', () => {
    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Should display factory name prominently
    expect(screen.getByText(/TestFactory/i)).toBeInTheDocument();
  });

  it('should display all pipeline artifacts', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show all pipelines
    expect(screen.getByText('TestPipeline')).toBeInTheDocument();
    expect(screen.getByText('OrchestratorPipeline')).toBeInTheDocument();
  });

  it('should display dataset information', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show dataset info
    expect(screen.getByText(/SourceDataset/i)).toBeInTheDocument();
    expect(screen.getByText(/AzureSqlTable/i)).toBeInTheDocument();
  });

  it('should display linked service information', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show linked service
    expect(screen.getByText(/AzureSqlLinkedService/i)).toBeInTheDocument();
    expect(screen.getByText(/AzureSqlDatabase/i)).toBeInTheDocument();
  });

  it('should display trigger information', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <ProfilingDashboard profile={mockProfile} />
      </AppProvider>
    );

    // Switch to artifacts tab
    const artifactsTab = screen.getByRole('tab', { name: /artifacts/i });
    await user.click(artifactsTab);

    // Should show trigger
    expect(screen.getByText(/DailyTrigger/i)).toBeInTheDocument();
    expect(screen.getByText(/ScheduleTrigger/i)).toBeInTheDocument();
  });
});
