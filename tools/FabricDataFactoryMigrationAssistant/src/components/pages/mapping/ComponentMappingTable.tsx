import React, { useState, useMemo, useEffect } from 'react';
import { 
  MagnifyingGlass, 
  FunnelSimple, 
  CaretUp, 
  CaretDown, 
  Download,
  CheckSquare,
  Square
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
import { ComponentMappingRow } from './ComponentMappingRow';
import type { ADFComponent, FabricTarget } from '../../../types';
import type { ActivityLinkedServiceReference } from '../../../services/pipelineActivityAnalysisService';

interface ComponentMappingTableProps {
  components: Array<ADFComponent & { mappingIndex: number }>;
  selectedComponents: ADFComponent[];
  onToggle: (index: number) => void;
  onBulkToggle?: (indices: number[], isSelected: boolean) => void;
  onTargetTypeChange: (index: number, value: string) => void;
  onTargetNameChange: (index: number, value: string) => void;
  onTargetConfigChange?: (index: number, updatedTarget: FabricTarget) => void;
  onActivityConnectionMapping?: (pipelineName: string, uniqueId: string, connectionId: string, mappingInfo: any) => void;
  getPipelineActivityReferences?: (component: ADFComponent) => ActivityLinkedServiceReference[];
  pipelineConnectionMappings?: any;
  existingConnections?: any[];
  loadingConnections?: boolean;
  autoSelectedMappings?: string[];
  componentType?: string;
}

type SortField = 'name' | 'type' | 'mappingStatus' | 'warnings';
type SortDirection = 'asc' | 'desc';

type MappingStatusFilter = 'all' | 'fullyConfigured' | 'needsMapping' | 'targetOnly' | 'notConfigured';
type ConfigurationFilter = 'all' | 'configured' | 'notConfigured';

export function ComponentMappingTable({
  components,
  selectedComponents,
  onToggle,
  onBulkToggle,
  onTargetTypeChange,
  onTargetNameChange,
  onTargetConfigChange,
  onActivityConnectionMapping,
  getPipelineActivityReferences,
  pipelineConnectionMappings = {},
  existingConnections = [],
  loadingConnections = false,
  autoSelectedMappings = [],
  componentType = ''
}: ComponentMappingTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MappingStatusFilter>('all');
  const [configFilter, setConfigFilter] = useState<ConfigurationFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [visibleCount, setVisibleCount] = useState(50);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  
  // Advanced filters
  const [showAutoMappedOnly, setShowAutoMappedOnly] = useState(false);
  const [showManualOnly, setShowManualOnly] = useState(false);

  // Calculate mapping status for each component
  const componentsWithStatus = useMemo(() => {
    return components.map(component => {
      let mappingStatus = {
        required: 0,
        completed: 0,
        percentage: 100,
        hasAutoMapped: false,
        hasManual: false
      };

      if (component.type === 'pipeline' && getPipelineActivityReferences) {
        const references = getPipelineActivityReferences(component);
        const required = references.length;
        const pipelineMappings = pipelineConnectionMappings[component.name] || {};
        const completed = Object.values(pipelineMappings).filter((m: any) => m?.selectedConnectionId).length;
        
        // Check if any mappings are auto-applied
        const hasAutoMapped = Object.values(pipelineMappings).some((m: any) => 
          autoSelectedMappings.some(autoText => autoText.includes(component.name))
        );
        
        const hasManual = Object.values(pipelineMappings).some((m: any) => 
          m?.selectedConnectionId && !autoSelectedMappings.some(autoText => autoText.includes(component.name))
        );

        mappingStatus = {
          required,
          completed,
          percentage: required > 0 ? Math.round((completed / required) * 100) : 100,
          hasAutoMapped,
          hasManual
        };
      }

      return {
        ...component,
        mappingStatus
      };
    });
  }, [components, pipelineConnectionMappings, getPipelineActivityReferences, autoSelectedMappings]);

  // Filter and sort
  const filteredAndSortedComponents = useMemo(() => {
    let filtered = componentsWithStatus;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        const hasTarget = c.fabricTarget?.type && c.fabricTarget?.name;
        const isFullyMapped = c.mappingStatus.percentage === 100;
        const needsMapping = c.type === 'pipeline' && c.mappingStatus.required > 0 && c.mappingStatus.percentage < 100;
        
        switch (statusFilter) {
          case 'fullyConfigured':
            return hasTarget && isFullyMapped;
          case 'needsMapping':
            return needsMapping;
          case 'targetOnly':
            return hasTarget && (c.type !== 'pipeline' || c.mappingStatus.required === 0 || isFullyMapped);
          case 'notConfigured':
            return !hasTarget;
          default:
            return true;
        }
      });
    }

    // Configuration filter
    if (configFilter !== 'all') {
      filtered = filtered.filter(c => {
        const hasTarget = c.fabricTarget?.type && c.fabricTarget?.name;
        return configFilter === 'configured' ? hasTarget : !hasTarget;
      });
    }

    // Advanced filters
    if (showAutoMappedOnly) {
      filtered = filtered.filter(c => c.mappingStatus.hasAutoMapped);
    }
    
    if (showManualOnly) {
      filtered = filtered.filter(c => c.mappingStatus.hasManual);
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
        case 'mappingStatus':
          comparison = a.mappingStatus.percentage - b.mappingStatus.percentage;
          break;
        case 'warnings':
          const aWarnings = a.warnings?.length || 0;
          const bWarnings = b.warnings?.length || 0;
          comparison = aWarnings - bWarnings;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [componentsWithStatus, searchTerm, statusFilter, configFilter, sortField, sortDirection, showAutoMappedOnly, showManualOnly]);

  const visibleComponents = filteredAndSortedComponents.slice(0, visibleCount);

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
    setConfigFilter('all');
    setShowAutoMappedOnly(false);
    setShowManualOnly(false);
    setVisibleCount(50);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('mapping-search')?.focus();
      }
      if (e.key === 'Escape') {
        handleClearFilters();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate bulk selection state
  const allVisibleSelected = visibleComponents.length > 0 && 
    visibleComponents.every(c => selectedComponents.some(sc => sc.name === c.name));
  const someVisibleSelected = visibleComponents.some(c => 
    selectedComponents.some(sc => sc.name === c.name)
  );

  const handleBulkSelect = () => {
    if (onBulkToggle) {
      const indices = visibleComponents.map(c => c.mappingIndex);
      onBulkToggle(indices, !allVisibleSelected);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Type', 'Target Type', 'Target Name', 'Mapping Status', 'Warnings'];
    const rows = filteredAndSortedComponents.map(c => [
      c.name,
      c.type,
      c.fabricTarget?.type || '',
      c.fabricTarget?.name || '',
      c.type === 'pipeline' ? `${c.mappingStatus.completed}/${c.mappingStatus.required} (${c.mappingStatus.percentage}%)` : 'N/A',
      c.warnings?.length || 0
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping-components-${componentType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFiltersCount = [
    searchTerm ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    configFilter !== 'all' ? 1 : 0,
    showAutoMappedOnly ? 1 : 0,
    showManualOnly ? 1 : 0
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
              id="mapping-search"
              placeholder="Search components..."
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
              <SelectItem value="targetOnly">Target Only</SelectItem>
              <SelectItem value="notConfigured">Not Configured</SelectItem>
            </SelectContent>
          </Select>

          {/* Advanced Filters */}
          <Popover open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="relative">
                <FunnelSimple size={16} className="mr-2" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="default" className="ml-2 px-1 min-w-[1.25rem] h-5">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">Advanced Filters</h4>
                  
                  <div className="space-y-3">
                    {/* Configuration Status */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Configuration Status</Label>
                      <RadioGroup value={configFilter} onValueChange={(value: ConfigurationFilter) => setConfigFilter(value)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="config-all" />
                          <Label htmlFor="config-all" className="font-normal cursor-pointer">All</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="configured" id="config-configured" />
                          <Label htmlFor="config-configured" className="font-normal cursor-pointer">Configured</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="notConfigured" id="config-not" />
                          <Label htmlFor="config-not" className="font-normal cursor-pointer">Not Configured</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Mapping Source */}
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-sm font-medium">Mapping Source</Label>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="auto-mapped" 
                            checked={showAutoMappedOnly}
                            onCheckedChange={(checked) => setShowAutoMappedOnly(!!checked)}
                          />
                          <Label htmlFor="auto-mapped" className="font-normal cursor-pointer">
                            Has Auto-Mapped
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="manual-only" 
                            checked={showManualOnly}
                            onCheckedChange={(checked) => setShowManualOnly(!!checked)}
                          />
                          <Label htmlFor="manual-only" className="font-normal cursor-pointer">
                            Has Manual Mappings
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleClearFilters}
                    className="w-full"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-2">
          {onBulkToggle && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkSelect}
              disabled={visibleComponents.length === 0}
            >
              {allVisibleSelected ? (
                <>
                  <Square size={16} className="mr-2" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare size={16} className="mr-2" />
                  Select Visible
                </>
              )}
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredAndSortedComponents.length === 0}
          >
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Results Summary */}
      {(activeFiltersCount > 0 || searchTerm) && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedComponents.length} of {components.length} components
          {selectedComponents.length > 0 && ` • ${selectedComponents.length} selected`}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                {onBulkToggle && (
                  <th className="w-12 p-3 text-left">
                    <Checkbox
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) {
                          (el as any).indeterminate = someVisibleSelected && !allVisibleSelected;
                        }
                      }}
                      onCheckedChange={handleBulkSelect}
                      aria-label="Select all visible"
                    />
                  </th>
                )}
                <th 
                  className="p-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Name
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="p-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('type')}
                >
                  <div className="flex items-center gap-2">
                    Type
                    {sortField === 'type' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                <th className="p-3 text-left font-medium">Target Type</th>
                <th className="p-3 text-left font-medium">Target Name</th>
                <th 
                  className="p-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('mappingStatus')}
                >
                  <div className="flex items-center gap-2">
                    Mapping Status
                    {sortField === 'mappingStatus' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                <th 
                  className="p-3 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => handleSort('warnings')}
                >
                  <div className="flex items-center gap-2">
                    Warnings
                    {sortField === 'warnings' && (
                      sortDirection === 'asc' ? <CaretUp size={14} /> : <CaretDown size={14} />
                    )}
                  </div>
                </th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleComponents.length === 0 ? (
                <tr>
                  <td colSpan={onBulkToggle ? 8 : 7} className="p-8 text-center text-muted-foreground">
                    {searchTerm || activeFiltersCount > 0 
                      ? 'No components match the current filters'
                      : 'No components to display'
                    }
                  </td>
                </tr>
              ) : (
                visibleComponents.map((component) => (
                  <ComponentMappingRow
                    key={component.name}
                    component={component}
                    isSelected={selectedComponents.some(sc => sc.name === component.name)}
                    onToggle={() => onToggle(component.mappingIndex)}
                    onTargetTypeChange={onTargetTypeChange}
                    onTargetNameChange={onTargetNameChange}
                    onTargetConfigChange={onTargetConfigChange}
                    onActivityConnectionMapping={onActivityConnectionMapping}
                    getPipelineActivityReferences={getPipelineActivityReferences}
                    pipelineConnectionMappings={pipelineConnectionMappings}
                    existingConnections={existingConnections}
                    loadingConnections={loadingConnections}
                    autoSelectedMappings={autoSelectedMappings}
                    showCheckbox={!!onBulkToggle}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load More */}
      {visibleCount < filteredAndSortedComponents.length && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={handleLoadMore}>
            Load More ({filteredAndSortedComponents.length - visibleCount} remaining)
          </Button>
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <div className="text-xs text-muted-foreground pt-2">
        <kbd className="px-2 py-1 bg-muted rounded">Ctrl/Cmd + F</kbd> to search •{' '}
        <kbd className="px-2 py-1 bg-muted rounded">Esc</kbd> to clear filters
      </div>
    </div>
  );
}
