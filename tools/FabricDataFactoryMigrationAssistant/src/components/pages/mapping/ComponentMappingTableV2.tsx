import React, { useState, useMemo, useEffect } from 'react';
import { 
  MagnifyingGlass, 
  FunnelSimple, 
  CaretUp, 
  CaretDown, 
  Download,
  CheckSquare,
  Square,
  CaretRight
} from '@phosphor-icons/react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../ui/popover';
import { Label } from '../../ui/label';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Checkbox } from '../../ui/checkbox';
import { Progress } from '../../ui/progress';
import type { ADFComponent, FabricTarget, PipelineMappingSummary, ActivityGroup, ActivityWithReferences } from '../../../types';

interface ComponentMappingTableV2Props {
  // General components (triggers, global parameters, etc.)
  components?: Array<ADFComponent & { mappingIndex: number }>;
  selectedComponents?: ADFComponent[];
  onToggle?: (componentId: string) => void;
  onBulkToggle?: (componentIds: string[], isSelected: boolean) => void;
  
  // Target mapping handlers
  onTargetTypeChange?: (componentId: string, value: string) => void;
  onTargetNameChange?: (componentId: string, value: string) => void;
  onTargetConfigChange?: (componentId: string, updatedTarget: FabricTarget) => void;
  
  // Pipeline-specific props
  pipelineSummaries?: PipelineMappingSummary[];
  selectedPipelines?: string[];
  onPipelineToggle?: (pipelineName: string) => void;
  onBulkPipelineToggle?: (pipelineNames: string[], isSelected: boolean) => void;
  
  // Activity connection mapping
  onActivityConnectionMapping?: (pipelineName: string, referenceId: string, connectionId: string) => void;
  pipelineConnectionMappings?: { [pipelineName: string]: { [referenceId: string]: string } };
  existingConnections?: any[];
  loadingConnections?: boolean;
  autoSelectedMappings?: string[];
  
  // Display options
  componentType?: string;
  showActivityDetails?: boolean;
  enableExpandAll?: boolean;
}

type SortField = 'name' | 'type' | 'mappingStatus' | 'warnings';
type SortDirection = 'asc' | 'desc';
type MappingStatusFilter = 'all' | 'fullyConfigured' | 'needsMapping' | 'targetOnly' | 'notConfigured';

// Activity type color mapping - Light backgrounds with dark text for maximum visibility
const ACTIVITY_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Copy': { bg: 'bg-emerald-50', text: 'text-gray-900', border: 'border-emerald-200' },
  'Custom': { bg: 'bg-purple-50', text: 'text-gray-900', border: 'border-purple-200' },
  'Lookup': { bg: 'bg-blue-50', text: 'text-gray-900', border: 'border-blue-200' },
  'ExecutePipeline': { bg: 'bg-orange-50', text: 'text-gray-900', border: 'border-orange-200' },
  'ForEach': { bg: 'bg-cyan-50', text: 'text-gray-900', border: 'border-cyan-200' },
  'IfCondition': { bg: 'bg-yellow-50', text: 'text-gray-900', border: 'border-yellow-200' },
  'Web': { bg: 'bg-pink-50', text: 'text-gray-900', border: 'border-pink-200' },
  'GetMetadata': { bg: 'bg-indigo-50', text: 'text-gray-900', border: 'border-indigo-200' },
  'SqlServerStoredProcedure': { bg: 'bg-teal-50', text: 'text-gray-900', border: 'border-teal-200' },
  'SetVariable': { bg: 'bg-violet-50', text: 'text-gray-900', border: 'border-violet-200' },
  'Other': { bg: 'bg-gray-50', text: 'text-gray-900', border: 'border-gray-200' }
};

// Reference location color mapping (for Custom activities) - Light backgrounds with dark text
const REFERENCE_LOCATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'resource': { bg: 'bg-red-50', text: 'text-gray-900', border: 'border-red-200' },
  'reference-object': { bg: 'bg-amber-50', text: 'text-gray-900', border: 'border-amber-200' },
  'activity-level': { bg: 'bg-slate-50', text: 'text-gray-900', border: 'border-slate-200' }
};

const TARGET_TYPE_OPTIONS: Record<string, Array<{ value: FabricTarget['type']; label: string }>> = {
  pipeline: [{ value: 'dataPipeline', label: 'Data Pipeline' }],
  linkedService: [
    { value: 'connector', label: 'Connector' },
    { value: 'gateway', label: 'Data Gateway Connection' }
  ],
  globalParameter: [{ value: 'variable', label: 'Variable Library Entry' }],
  trigger: [{ value: 'schedule', label: 'Pipeline Schedule' }],
  integrationRuntime: [{ value: 'gateway', label: 'Fabric Gateway' }]
};

export function ComponentMappingTableV2({
  components = [],
  selectedComponents = [],
  onToggle,
  onBulkToggle,
  onTargetTypeChange,
  onTargetNameChange,
  onTargetConfigChange,
  pipelineSummaries = [],
  selectedPipelines = [],
  onPipelineToggle,
  onBulkPipelineToggle,
  onActivityConnectionMapping,
  pipelineConnectionMappings = {},
  existingConnections = [],
  loadingConnections = false,
  autoSelectedMappings = [],
  componentType = '',
  showActivityDetails = false,
  enableExpandAll = false
}: ComponentMappingTableV2Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MappingStatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [visibleCount, setVisibleCount] = useState(50);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  
  // Expansion state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Determine if we're in pipeline mode
  const isPipelineMode = pipelineSummaries.length > 0;

  // Toggle row expansion
  const toggleRowExpansion = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle group expansion
  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Expand/collapse all
  const handleExpandAll = () => {
    if (isPipelineMode) {
      const allIds = pipelineSummaries.map(p => p.pipelineName);
      setExpandedRows(new Set(allIds));
      // Also expand all groups
      const allGroupIds = pipelineSummaries.flatMap(p => 
        p.activityGroups.map(g => `${p.pipelineName}-${g.type}`)
      );
      setExpandedGroups(new Set(allGroupIds));
    } else {
      const allIds = components.map(c => c.name);
      setExpandedRows(new Set(allIds));
    }
  };

  const handleCollapseAll = () => {
    setExpandedRows(new Set());
    setExpandedGroups(new Set());
  };

  // Get color styling for activity type
  const getActivityTypeColor = (activityType: string) => {
    return ACTIVITY_TYPE_COLORS[activityType] || ACTIVITY_TYPE_COLORS['Other'];
  };

  // Get color styling for reference location
  const getReferenceLocationColor = (location: string) => {
    return REFERENCE_LOCATION_COLORS[location] || REFERENCE_LOCATION_COLORS['activity-level'];
  };

  // Filter and sort pipelines
  const filteredAndSortedPipelines = useMemo(() => {
    if (!isPipelineMode) return [];

    let filtered = pipelineSummaries;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.pipelineName.toLowerCase().includes(term) ||
        p.activityGroups.some(g => g.type.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => {
        const isFullyMapped = p.mappingPercentage === 100;
        const needsMapping = p.totalReferences > 0 && p.mappingPercentage < 100;
        
        switch (statusFilter) {
          case 'fullyConfigured':
            return isFullyMapped;
          case 'needsMapping':
            return needsMapping;
          case 'notConfigured':
            return p.mappingPercentage === 0;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.pipelineName.localeCompare(b.pipelineName);
          break;
        case 'mappingStatus':
          comparison = a.mappingPercentage - b.mappingPercentage;
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [pipelineSummaries, searchTerm, statusFilter, sortField, sortDirection, isPipelineMode]);

  // Filter and sort regular components
  const filteredAndSortedComponents = useMemo(() => {
    if (isPipelineMode) return [];

    let filtered = components;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.type.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        const hasTarget = c.fabricTarget?.type && c.fabricTarget?.name;
        
        switch (statusFilter) {
          case 'fullyConfigured':
            return hasTarget;
          case 'notConfigured':
            return !hasTarget;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [components, searchTerm, statusFilter, sortField, sortDirection, isPipelineMode]);

  const visibleItems = isPipelineMode 
    ? filteredAndSortedPipelines.slice(0, visibleCount)
    : filteredAndSortedComponents.slice(0, visibleCount);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 50);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setVisibleCount(50);
  };

  // Calculate bulk selection state
  const allVisibleSelected = useMemo(() => {
    if (isPipelineMode) {
      return visibleItems.length > 0 && 
        visibleItems.every((p: any) => selectedPipelines.includes(p.pipelineName));
    } else {
      return visibleItems.length > 0 && 
        visibleItems.every((c: any) => selectedComponents.some(sc => sc.name === c.name));
    }
  }, [isPipelineMode, visibleItems, selectedPipelines, selectedComponents]);

  const someVisibleSelected = useMemo(() => {
    if (isPipelineMode) {
      return visibleItems.some((p: any) => selectedPipelines.includes(p.pipelineName));
    } else {
      return visibleItems.some((c: any) => selectedComponents.some(sc => sc.name === c.name));
    }
  }, [isPipelineMode, visibleItems, selectedPipelines, selectedComponents]);

  const handleBulkSelect = () => {
    if (isPipelineMode && onBulkPipelineToggle) {
      const names = visibleItems.map((p: any) => p.pipelineName);
      onBulkPipelineToggle(names, !allVisibleSelected);
    } else if (!isPipelineMode && onBulkToggle) {
      const ids = visibleItems.map((c: any) => c.name);
      onBulkToggle(ids, !allVisibleSelected);
    }
  };

  const handleExportCSV = () => {
    if (isPipelineMode) {
      const headers = ['Pipeline Name', 'Total Activities', 'Total References', 'Mapped References', 'Mapping %'];
      const rows = filteredAndSortedPipelines.map(p => [
        p.pipelineName,
        p.totalActivities,
        p.totalReferences,
        p.mappedReferences,
        `${p.mappingPercentage}%`
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pipeline-mappings-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Name', 'Type', 'Target Type', 'Target Name'];
      const rows = filteredAndSortedComponents.map(c => [
        c.name,
        c.type,
        c.fabricTarget?.type || '',
        c.fabricTarget?.name || ''
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mapping-components-${componentType}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('mapping-search-v2')?.focus();
      }
      if (e.key === 'Escape') {
        handleClearFilters();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeFiltersCount = [
    searchTerm ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              id="mapping-search-v2"
              placeholder={`Search ${isPipelineMode ? 'pipelines' : 'components'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(value: MappingStatusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="fullyConfigured">Fully Configured</SelectItem>
              <SelectItem value="needsMapping">Needs Mapping</SelectItem>
              <SelectItem value="notConfigured">Not Configured</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear {activeFiltersCount} {activeFiltersCount === 1 ? 'filter' : 'filters'}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {/* Expand/Collapse All */}
          {(enableExpandAll || isPipelineMode) && (
            <>
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                Collapse All
              </Button>
            </>
          )}

          {/* Export */}
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Showing {visibleItems.length} of{' '}
            {isPipelineMode ? filteredAndSortedPipelines.length : filteredAndSortedComponents.length}{' '}
            {isPipelineMode ? 'pipelines' : 'components'}
          </span>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFiltersCount} active {activeFiltersCount === 1 ? 'filter' : 'filters'}
            </Badge>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left w-12">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={handleBulkSelect}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left w-12"></th>
                <th 
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    {isPipelineMode ? 'Pipeline' : 'Component'}
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                {!isPipelineMode && (
                  <th 
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort('type')}
                  >
                    <div className="flex items-center gap-2">
                      Type
                      {sortField === 'type' && (
                        sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                      )}
                    </div>
                  </th>
                )}
                <th 
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('mappingStatus')}
                >
                  <div className="flex items-center gap-2">
                    {isPipelineMode ? 'Mapping Progress' : 'Status'}
                    {sortField === 'mappingStatus' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                {isPipelineMode && (
                  <th className="px-4 py-3 text-left font-medium">
                    Activity Groups
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isPipelineMode ? (
                // Pipeline rows
                visibleItems.map((pipeline: any) => (
                  <PipelineRow
                    key={pipeline.pipelineName}
                    pipeline={pipeline}
                    isSelected={selectedPipelines.includes(pipeline.pipelineName)}
                    isExpanded={expandedRows.has(pipeline.pipelineName)}
                    expandedGroups={expandedGroups}
                    onToggle={() => onPipelineToggle?.(pipeline.pipelineName)}
                    onExpand={() => toggleRowExpansion(pipeline.pipelineName)}
                    onGroupExpand={toggleGroupExpansion}
                    onActivityConnectionMapping={onActivityConnectionMapping}
                    pipelineConnectionMappings={pipelineConnectionMappings}
                    existingConnections={existingConnections}
                    loadingConnections={loadingConnections}
                    getActivityTypeColor={getActivityTypeColor}
                    getReferenceLocationColor={getReferenceLocationColor}
                  />
                ))
              ) : (
                // Component rows
                visibleItems.map((component: any) => (
                  <ComponentRow
                    key={component.name}
                    component={component}
                    isSelected={selectedComponents.some(sc => sc.name === component.name)}
                    isExpanded={expandedRows.has(component.name)}
                    onToggle={() => onToggle?.(component.name)}
                    onExpand={() => toggleRowExpansion(component.name)}
                    onTargetTypeChange={onTargetTypeChange}
                    onTargetNameChange={onTargetNameChange}
                    onTargetConfigChange={onTargetConfigChange}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {visibleItems.length < (isPipelineMode ? filteredAndSortedPipelines.length : filteredAndSortedComponents.length) && (
          <div className="border-t p-4 text-center">
            <Button variant="outline" onClick={handleLoadMore}>
              Load More ({visibleItems.length} /{' '}
              {isPipelineMode ? filteredAndSortedPipelines.length : filteredAndSortedComponents.length})
            </Button>
          </div>
        )}

        {/* Empty State */}
        {visibleItems.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <p className="text-lg font-medium mb-2">No {isPipelineMode ? 'pipelines' : 'components'} found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Pipeline Row Component
interface PipelineRowProps {
  pipeline: PipelineMappingSummary;
  isSelected: boolean;
  isExpanded: boolean;
  expandedGroups: Set<string>;
  onToggle: () => void;
  onExpand: () => void;
  onGroupExpand: (groupId: string) => void;
  onActivityConnectionMapping?: (pipelineName: string, referenceId: string, connectionId: string) => void;
  pipelineConnectionMappings: { [pipelineName: string]: { [referenceId: string]: string } };
  existingConnections: any[];
  loadingConnections: boolean;
  getActivityTypeColor: (type: string) => { bg: string; text: string; border: string };
  getReferenceLocationColor: (location: string) => { bg: string; text: string; border: string };
}

function PipelineRow({
  pipeline,
  isSelected,
  isExpanded,
  expandedGroups,
  onToggle,
  onExpand,
  onGroupExpand,
  onActivityConnectionMapping,
  pipelineConnectionMappings,
  existingConnections,
  loadingConnections,
  getActivityTypeColor,
  getReferenceLocationColor
}: PipelineRowProps) {
  const mappings = pipelineConnectionMappings[pipeline.pipelineName] || {};
  const isFullyMapped = pipeline.mappingPercentage === 100;
  const hasReferences = pipeline.totalReferences > 0;

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            aria-label={`Select ${pipeline.pipelineName}`}
          />
        </td>
        <td className="px-4 py-3">
          {hasReferences && (
            <button
              onClick={onExpand}
              className="p-1 hover:bg-muted rounded transition-colors"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <CaretRight 
                size={16} 
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
              />
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{pipeline.pipelineName}</span>
            {pipeline.folderPath && (
              <span className="text-xs text-muted-foreground">{pipeline.folderPath}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {hasReferences ? (
            <div className="space-y-2 min-w-[200px]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {pipeline.mappedReferences} / {pipeline.totalReferences} mapped
                </span>
                <span className={`font-medium ${isFullyMapped ? 'text-green-600' : 'text-orange-600'}`}>
                  {pipeline.mappingPercentage}%
                </span>
              </div>
              <Progress value={pipeline.mappingPercentage} className="h-2" />
            </div>
          ) : (
            <Badge variant="outline" className="text-xs">No References</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {pipeline.activityGroups.map(group => (
              <Badge
                key={group.type}
                variant="outline"
                className={`text-xs ${getActivityTypeColor(group.type).bg} ${getActivityTypeColor(group.type).text} ${getActivityTypeColor(group.type).border} border`}
              >
                {group.type} ({group.activities.length})
              </Badge>
            ))}
          </div>
        </td>
      </tr>

      {/* Expanded Activity Groups */}
      {isExpanded && hasReferences && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <div className="bg-muted/20 border-t">
              {pipeline.activityGroups.map(group => (
                <ActivityGroupSection
                  key={`${pipeline.pipelineName}-${group.type}`}
                  pipelineName={pipeline.pipelineName}
                  group={group}
                  isExpanded={expandedGroups.has(`${pipeline.pipelineName}-${group.type}`)}
                  onExpand={() => onGroupExpand(`${pipeline.pipelineName}-${group.type}`)}
                  onActivityConnectionMapping={onActivityConnectionMapping}
                  mappings={mappings}
                  existingConnections={existingConnections}
                  loadingConnections={loadingConnections}
                  getActivityTypeColor={getActivityTypeColor}
                  getReferenceLocationColor={getReferenceLocationColor}
                />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Activity Group Section Component
interface ActivityGroupSectionProps {
  pipelineName: string;
  group: ActivityGroup;
  isExpanded: boolean;
  onExpand: () => void;
  onActivityConnectionMapping?: (pipelineName: string, referenceId: string, connectionId: string) => void;
  mappings: { [referenceId: string]: string };
  existingConnections: any[];
  loadingConnections: boolean;
  getActivityTypeColor: (type: string) => { bg: string; text: string; border: string };
  getReferenceLocationColor: (location: string) => { bg: string; text: string; border: string };
}

function ActivityGroupSection({
  pipelineName,
  group,
  isExpanded,
  onExpand,
  onActivityConnectionMapping,
  mappings,
  existingConnections,
  loadingConnections,
  getActivityTypeColor,
  getReferenceLocationColor
}: ActivityGroupSectionProps) {
  const colors = getActivityTypeColor(group.type);
  const isFullyMapped = group.mappingPercentage === 100;

  return (
    <div className={`border-b last:border-b-0 ${colors.bg}`}>
      {/* Group Header */}
      <div 
        className="px-12 py-3 flex items-center justify-between cursor-pointer hover:bg-black/5 transition-colors"
        onClick={onExpand}
      >
        <div className="flex items-center gap-3">
          <CaretRight 
            size={14} 
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
          />
          <span className={`font-medium ${colors.text}`}>
            {group.label}
          </span>
          <Badge variant="secondary" className="text-xs">
            {group.activities.length} {group.activities.length === 1 ? 'activity' : 'activities'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {group.mappedReferences} / {group.totalReferences} mapped
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${isFullyMapped ? 'text-green-600' : 'text-orange-600'}`}>
            {group.mappingPercentage}%
          </span>
          <Progress value={group.mappingPercentage} className="h-1.5 w-24" />
        </div>
      </div>

      {/* Activities */}
      {isExpanded && (
        <div className="bg-white/50">
          {group.activities.map(activity => (
            <ActivityItem
              key={activity.activityId}
              pipelineName={pipelineName}
              activity={activity}
              mappings={mappings}
              existingConnections={existingConnections}
              loadingConnections={loadingConnections}
              onActivityConnectionMapping={onActivityConnectionMapping}
              getReferenceLocationColor={getReferenceLocationColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Activity Item Component
interface ActivityItemProps {
  pipelineName: string;
  activity: ActivityWithReferences;
  mappings: { [referenceId: string]: string };
  existingConnections: any[];
  loadingConnections: boolean;
  onActivityConnectionMapping?: (pipelineName: string, referenceId: string, connectionId: string) => void;
  getReferenceLocationColor: (location: string) => { bg: string; text: string; border: string };
}

function ActivityItem({
  pipelineName,
  activity,
  mappings,
  existingConnections,
  loadingConnections,
  onActivityConnectionMapping,
  getReferenceLocationColor
}: ActivityItemProps) {
  return (
    <div className="px-16 py-3 border-t border-border/50 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm">{activity.activityName}</span>
            {activity.isNested && activity.nestingPath && (
              <Badge variant="outline" className="text-xs">
                {activity.nestingPath}
              </Badge>
            )}
            <Badge 
              variant={activity.isFullyMapped ? 'default' : 'secondary'} 
              className="text-xs"
            >
              {activity.mappedReferences} / {activity.totalReferences}
            </Badge>
          </div>
          {activity.description && (
            <p className="text-xs text-muted-foreground mb-2">{activity.description}</p>
          )}
        </div>
      </div>

      {/* References */}
      <div className="space-y-2 ml-4">
        {activity.references.map(ref => {
          const locationColors = getReferenceLocationColor(ref.location);
          const selectedConnectionId = mappings[ref.referenceId] || ref.selectedConnectionId;

          return (
            <div 
              key={ref.referenceId} 
              className={`p-3 rounded-lg border ${locationColors.bg} ${locationColors.border}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-xs ${locationColors.text}`}>
                      {ref.location}
                    </Badge>
                    {ref.datasetName && (
                      <span className="text-xs text-muted-foreground">
                        Dataset: {ref.datasetName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate" title={ref.linkedServiceName}>
                    {ref.displayName || ref.linkedServiceName}
                  </p>
                </div>
                <div className="w-64 shrink-0">
                  <Select
                    value={selectedConnectionId || ''}
                    onValueChange={(value) => {
                      onActivityConnectionMapping?.(pipelineName, ref.referenceId, value);
                    }}
                    disabled={loadingConnections}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select connection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingConnections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          {conn.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Component Row Component (for non-pipeline components)
interface ComponentRowProps {
  component: ADFComponent & { mappingIndex: number };
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onTargetTypeChange?: (componentId: string, value: string) => void;
  onTargetNameChange?: (componentId: string, value: string) => void;
  onTargetConfigChange?: (componentId: string, updatedTarget: FabricTarget) => void;
}

function ComponentRow({
  component,
  isSelected,
  isExpanded,
  onToggle,
  onExpand,
  onTargetTypeChange,
  onTargetNameChange,
  onTargetConfigChange
}: ComponentRowProps) {
  const hasTarget = component.fabricTarget?.type && component.fabricTarget?.name;
  const warnings = component.warnings || [];

  const getTargetTypeOptions = (sourceType: string) => {
    return TARGET_TYPE_OPTIONS[sourceType] || TARGET_TYPE_OPTIONS.pipeline;
  };

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            aria-label={`Select ${component.name}`}
          />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={onExpand}
            className="p-1 hover:bg-muted rounded transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <CaretRight 
              size={16} 
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            />
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{component.name}</span>
            {warnings.length > 0 && (
              <Badge variant="destructive" className="text-xs w-fit">
                {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline">{component.type}</Badge>
        </td>
        <td className="px-4 py-3">
          {hasTarget ? (
            <Badge variant="default" className="text-xs">Configured</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Not Configured</Badge>
          )}
        </td>
      </tr>

      {/* Expanded Details */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <div className="bg-muted/20 border-t px-16 py-4 space-y-4">
              {/* Target Type Selection */}
              <div className="space-y-2">
                <Label htmlFor={`target-type-${component.name}`}>Target Type</Label>
                <Select
                  value={component.fabricTarget?.type || ''}
                  onValueChange={(value) => onTargetTypeChange?.(component.name, value)}
                >
                  <SelectTrigger id={`target-type-${component.name}`}>
                    <SelectValue placeholder="Select target type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getTargetTypeOptions(component.type).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Name Input */}
              {component.fabricTarget?.type && (
                <div className="space-y-2">
                  <Label htmlFor={`target-name-${component.name}`}>Target Name</Label>
                  <Input
                    id={`target-name-${component.name}`}
                    value={component.fabricTarget?.name || ''}
                    onChange={(e) => onTargetNameChange?.(component.name, e.target.value)}
                    placeholder="Enter target name..."
                  />
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-2">
                  <Label>Warnings</Label>
                  {warnings.map((warning, idx) => (
                    <div key={idx} className="text-sm text-orange-600 flex items-start gap-2">
                      <span>•</span>
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
