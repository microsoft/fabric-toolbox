import React, { useState, useMemo, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  CaretRight, 
  CaretDown, 
  CaretUp, 
  Warning, 
  CheckCircle, 
  XCircle, 
  Funnel,
  Download,
  Info
} from '@phosphor-icons/react';
import { ADFComponent } from '../../../types';
import { ComponentRow } from './ComponentRow';

interface ComponentTableProps {
  type: string;
  components: Array<ADFComponent & { originalIndex: number }>;
  onToggle: (index: number, isSelected: boolean) => void;
  onToggleAll: (indices: number[], isSelected: boolean) => void;
}

interface FilterState {
  hasWarnings: boolean;
  selectionStatus: 'all' | 'selected' | 'unselected';
  folderPath: string | 'all' | 'root';
}

type SortKey = 'name' | 'status' | 'warnings';
type SortDirection = 'asc' | 'desc';

export function ComponentTable({ 
  type, 
  components, 
  onToggle, 
  onToggleAll 
}: ComponentTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'supported' | 'partiallySupported' | 'unsupported'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ 
    key: 'name', 
    direction: 'asc' 
  });
  const [filters, setFilters] = useState<FilterState>({
    hasWarnings: false,
    selectionStatus: 'all',
    folderPath: 'all'
  });
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  const PAGE_SIZE = 50;

  // Extract unique folder paths for filter
  const uniqueFolderPaths = useMemo(() => {
    const paths = new Set<string>();
    components.forEach(c => {
      if (c.folder?.path) {
        paths.add(c.folder.path);
      }
    });
    return Array.from(paths).sort();
  }, [components]);

  const hasComponentsWithFolders = uniqueFolderPaths.length > 0;

  // Filter and sort components
  const filteredAndSortedComponents = useMemo(() => {
    let result = [...components];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(c => c.compatibilityStatus === statusFilter);
    }

    // Apply advanced filters
    if (filters.hasWarnings) {
      result = result.filter(c => c.warnings && c.warnings.length > 0);
    }

    if (filters.selectionStatus === 'selected') {
      result = result.filter(c => c.isSelected);
    } else if (filters.selectionStatus === 'unselected') {
      result = result.filter(c => !c.isSelected);
    }

    // Apply folder filter
    if (filters.folderPath === 'root') {
      result = result.filter(c => !c.folder || !c.folder.path);
    } else if (filters.folderPath !== 'all') {
      result = result.filter(c => c.folder?.path === filters.folderPath);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortConfig.key) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          const statusOrder = { supported: 0, partiallySupported: 1, unsupported: 2 };
          comparison = statusOrder[a.compatibilityStatus] - statusOrder[b.compatibilityStatus];
          break;
        case 'warnings':
          comparison = (a.warnings?.length || 0) - (b.warnings?.length || 0);
          break;
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [components, searchTerm, statusFilter, filters, sortConfig]);

  // Conditional pagination - only paginate for large datasets
  const shouldPaginate = filteredAndSortedComponents.length > 200;

  // Paginated components
  const paginatedComponents = useMemo(() => {
    if (!shouldPaginate) {
      return filteredAndSortedComponents;
    }
    return filteredAndSortedComponents.slice(visibleRange.start, visibleRange.end);
  }, [filteredAndSortedComponents, visibleRange, shouldPaginate]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleRange({ start: 0, end: PAGE_SIZE });
  }, [searchTerm, statusFilter, filters]);

  // Selection state
  const selectableComponents = filteredAndSortedComponents.filter(
    c => c.compatibilityStatus !== 'unsupported'
  );
  const selectedCount = selectableComponents.filter(c => c.isSelected).length;
  const allSelected = selectableComponents.length > 0 && selectedCount === selectableComponents.length;
  const someSelected = selectedCount > 0 && selectedCount < selectableComponents.length;

  // Active filters count
  const activeFiltersCount = 
    (statusFilter !== 'all' ? 1 : 0) +
    (filters.hasWarnings ? 1 : 0) +
    (filters.selectionStatus !== 'all' ? 1 : 0) +
    (filters.folderPath !== 'all' ? 1 : 0);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleBulkSelect = (scope: 'all' | 'filtered' | 'page', select: boolean) => {
    let indices: number[] = [];

    switch (scope) {
      case 'all':
        indices = components
          .filter(c => c.compatibilityStatus !== 'unsupported')
          .map(c => c.originalIndex);
        break;
      case 'filtered':
        indices = filteredAndSortedComponents
          .filter(c => c.compatibilityStatus !== 'unsupported')
          .map(c => c.originalIndex);
        break;
      case 'page':
        indices = paginatedComponents
          .filter(c => c.compatibilityStatus !== 'unsupported')
          .map(c => c.originalIndex);
        break;
    }

    onToggleAll(indices, select);
  };

  const handleSelectAllVisible = (checked: boolean) => {
    // Apply to ALL filtered items, not just visible page
    handleBulkSelect('filtered', checked as boolean);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setFilters({
      hasWarnings: false,
      selectionStatus: 'all',
      folderPath: 'all'
    });
  };

  const handleExportSelected = () => {
    const selected = components.filter(c => c.isSelected);
    const csvContent = [
      ['Name', 'Status', 'Warnings', 'Target Type', 'Target Name'].join(','),
      ...selected.map(c => [
        c.name,
        c.compatibilityStatus,
        c.warnings?.length || 0,
        c.fabricTarget?.type || '',
        c.fabricTarget?.name || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-selection.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) {
      return null;
    }
    return sortConfig.direction === 'asc' ? 
      <CaretUp size={14} className="ml-1" /> : 
      <CaretDown size={14} className="ml-1" />;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all visible
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleBulkSelect('filtered', true);
      }

      // Ctrl/Cmd + D: Deselect all
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleBulkSelect('filtered', false);
      }

      // Escape: Clear search/filters
      if (e.key === 'Escape') {
        clearFilters();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [filteredAndSortedComponents]);

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search Input */}
        <div className="flex-1 w-full sm:w-auto">
          <Input
            type="search"
            placeholder={`Search ${type}s...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="supported">Supported</SelectItem>
            <SelectItem value="partiallySupported">Needs Attention</SelectItem>
            <SelectItem value="unsupported">Unsupported</SelectItem>
          </SelectContent>
        </Select>

        {/* Folder Filter - Only show for pipelines with folders */}
        {type === 'pipeline' && hasComponentsWithFolders && (
          <Select value={filters.folderPath} onValueChange={(value: any) => setFilters(prev => ({ ...prev, folderPath: value }))}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Folders</SelectItem>
              <SelectItem value="root">Root Level (No Folder)</SelectItem>
              {uniqueFolderPaths.map(path => (
                <SelectItem key={path} value={path}>
                  {path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Advanced Filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Funnel size={16} className="mr-2" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Advanced Filters</h4>
              </div>

              {/* Has Warnings Filter */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasWarnings"
                  checked={filters.hasWarnings}
                  onCheckedChange={(checked) =>
                    setFilters(prev => ({ ...prev, hasWarnings: checked as boolean }))
                  }
                />
                <label htmlFor="hasWarnings" className="text-sm cursor-pointer">
                  Has Warnings
                </label>
              </div>

              {/* Selection Status Filter */}
              <div className="space-y-2">
                <Label className="text-sm">Selection Status</Label>
                <RadioGroup 
                  value={filters.selectionStatus} 
                  onValueChange={(value: any) =>
                    setFilters(prev => ({ ...prev, selectionStatus: value }))
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="all" />
                    <label htmlFor="all" className="text-sm cursor-pointer">All</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="selected" id="selected" />
                    <label htmlFor="selected" className="text-sm cursor-pointer">Selected Only</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unselected" id="unselected" />
                    <label htmlFor="unselected" className="text-sm cursor-pointer">Unselected Only</label>
                  </div>
                </RadioGroup>
              </div>

              {/* Clear Filters */}
              <Button
                variant="outline"
                className="w-full"
                onClick={clearFilters}
              >
                Clear All Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Bulk Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkSelect('all', true)}
            disabled={components.length === 0}
          >
            Select All ({components.filter(c => c.compatibilityStatus !== 'unsupported').length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkSelect('filtered', true)}
            disabled={filteredAndSortedComponents.length === 0}
          >
            Select Filtered ({selectableComponents.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkSelect('page', true)}
            disabled={paginatedComponents.length === 0}
          >
            Select Page ({paginatedComponents.filter(c => c.compatibilityStatus !== 'unsupported').length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkSelect('filtered', false)}
            disabled={selectedCount === 0}
          >
            Deselect All
          </Button>
          {selectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSelected}
            >
              <Download size={16} className="mr-2" />
              Export ({selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between mb-4 text-sm">
        <div className="flex items-center gap-4">
          <Badge variant="outline">
            {filteredAndSortedComponents.length} total matches
          </Badge>
          <Badge variant="outline">
            Showing {paginatedComponents.length} of {filteredAndSortedComponents.length}
          </Badge>
          <Badge variant={selectedCount > 0 ? 'default' : 'secondary'}>
            {selectedCount} of {selectableComponents.length} selected
          </Badge>
        </div>
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {/* Alert for unloaded items */}
      {shouldPaginate && visibleRange.end < filteredAndSortedComponents.length && (
        <Alert>
          <Info size={16} />
          <AlertDescription>
            <div className="flex items-center justify-between gap-4">
              <span>
                Showing {paginatedComponents.length} of {filteredAndSortedComponents.length} items. 
                <strong> Selection and filter operations apply to ALL items</strong>, including those not yet loaded.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleRange({ start: 0, end: filteredAndSortedComponents.length })}
              >
                Load All ({filteredAndSortedComponents.length - visibleRange.end} more)
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Select All Checkbox */}
                <TableHead className="w-[50px]">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el) (el as any).indeterminate = someSelected && !allSelected;
                      }}
                      onCheckedChange={handleSelectAllVisible}
                      aria-label={`Select all ${selectableComponents.length} filtered ${type}s`}
                    />
                    <span className="text-xs text-muted-foreground">
                      ({selectableComponents.length})
                    </span>
                  </div>
                </TableHead>

                {/* Sortable Name Column */}
                <TableHead className="min-w-[250px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-semibold -ml-3"
                    onClick={() => handleSort('name')}
                  >
                    Name
                    <SortIcon column="name" />
                  </Button>
                </TableHead>

                {/* Folder Column - Only for pipelines */}
                {type === 'pipeline' && (
                  <TableHead className="w-[200px]">
                    Folder
                  </TableHead>
                )}

                {/* Sortable Status Column */}
                <TableHead className="w-[180px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-semibold -ml-3"
                    onClick={() => handleSort('status')}
                  >
                    Status
                    <SortIcon column="status" />
                  </Button>
                </TableHead>

                {/* Sortable Warnings Column */}
                <TableHead className="w-[120px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 font-semibold -ml-3"
                    onClick={() => handleSort('warnings')}
                  >
                    Warnings
                    <SortIcon column="warnings" />
                  </Button>
                </TableHead>

                {/* Actions */}
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedComponents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={type === 'pipeline' ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    No components found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedComponents.map((component) => (
                  <ComponentRow
                    key={component.originalIndex}
                    component={component}
                    onToggle={onToggle}
                    componentType={type}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Load More Button */}
      {shouldPaginate && visibleRange.end < filteredAndSortedComponents.length && (
        <div className="flex flex-col items-center gap-3 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            Loaded {visibleRange.end} of {filteredAndSortedComponents.length} items
            {selectedCount > 0 && ` (${selectedCount} selected)`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setVisibleRange(prev => ({
                start: prev.start,
                end: Math.min(prev.end + PAGE_SIZE, filteredAndSortedComponents.length)
              }))}
            >
              Load {Math.min(PAGE_SIZE, filteredAndSortedComponents.length - visibleRange.end)} More
            </Button>
            <Button
              variant="secondary"
              onClick={() => setVisibleRange({ 
                start: 0, 
                end: filteredAndSortedComponents.length 
              })}
            >
              Load All Remaining ({filteredAndSortedComponents.length - visibleRange.end})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
