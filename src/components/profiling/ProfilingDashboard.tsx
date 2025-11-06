/**
 * Profiling Dashboard Component
 * 
 * Main container for ADF ARM template profiling, integrating all profiling
 * components (metrics, insights, artifacts, lineage graph) into a tabbed interface.
 * 
 * Keyboard Shortcuts:
 * - 1/2/3: Switch between tabs (Overview/Artifacts/Lineage)
 * - E: Export report
 * - Escape: Reset focus
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileArrowDown, ChartBar, Network, Table as TableIcon } from '@phosphor-icons/react';
import { ADFProfile } from '@/types/profiling';
import { MetricsOverview } from './MetricsOverview';
import { ArtifactTables } from './ArtifactTables';
import { DependencyGraphView } from './DependencyGraphView';
import { InsightsPanel } from './InsightsPanel';
import { exportProfileToMarkdown } from '@/services/profileExportService';

interface ProfilingDashboardProps {
  profile: ADFProfile;
  onExport?: () => void;
}

/**
 * ProfilingDashboard - Main profiling interface with tabbed navigation
 */
export function ProfilingDashboard({ profile, onExport }: ProfilingDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1':
          setActiveTab('overview');
          break;
        case '2':
          setActiveTab('artifacts');
          break;
        case '3':
          setActiveTab('lineage');
          break;
        case 'e':
        case 'E':
          handleExport();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleExport = useCallback(() => {
    const markdown = exportProfileToMarkdown(profile);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adf-profile-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.();
  }, [profile, onExport]);

  return (
    <div className="space-y-4">
      {/* Header with Export */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Data Factory Template Profile</CardTitle>
              <CardDescription className="text-sm mt-1">
                {profile.metadata.fileName} • {(profile.metadata.fileSize / 1024).toFixed(2)} KB • 
                {' '}{profile.metrics.totalPipelines} pipelines, {profile.metrics.totalActivities} activities
              </CardDescription>
            </div>
            <Button onClick={handleExport} variant="outline" size="sm" title="Export Report (Press E)">
              <FileArrowDown size={16} className="mr-2" />
              Export Report
            </Button>
          </div>
          {/* Keyboard hints */}
          <div className="text-xs text-muted-foreground mt-2">
            <span className="inline-flex items-center gap-1">
              Shortcuts: 
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">1-3</kbd> Switch tabs
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">E</kbd> Export
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Insights Section - Always visible if insights exist */}
      {profile.insights.length > 0 && (
        <InsightsPanel insights={profile.insights} />
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">
            <ChartBar size={16} className="mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="artifacts">
            <TableIcon size={16} className="mr-2" />
            Artifacts
          </TabsTrigger>
          <TabsTrigger value="lineage">
            <Network size={16} className="mr-2" />
            Lineage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <MetricsOverview metrics={profile.metrics} />
        </TabsContent>

        <TabsContent value="artifacts" className="space-y-4 mt-4">
          <ArtifactTables artifacts={profile.artifacts} />
        </TabsContent>

        <TabsContent value="lineage" className="space-y-4 mt-4">
          <DependencyGraphView dependencies={profile.dependencies} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
