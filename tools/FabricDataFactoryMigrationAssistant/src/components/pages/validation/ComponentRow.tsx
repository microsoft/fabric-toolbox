import React, { useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  CaretRight, 
  CaretDown, 
  Warning, 
  CheckCircle, 
  XCircle,
  FolderOpen,
  Folder
} from '@phosphor-icons/react';
import { ADFComponent } from '../../../types';

interface ComponentRowProps {
  component: ADFComponent & { originalIndex: number };
  onToggle: (index: number, isSelected: boolean) => void;
  componentType?: string;
}

export function ComponentRow({ component, onToggle, componentType }: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusBadge = (status: ADFComponent['compatibilityStatus']) => {
    switch (status) {
      case 'supported':
        return (
          <Badge variant="default" className="bg-accent">
            <CheckCircle size={14} className="mr-1" />
            Supported
          </Badge>
        );
      case 'partiallySupported':
        return (
          <Badge variant="outline" className="border-warning text-warning">
            <Warning size={14} className="mr-1" />
            Needs Attention
          </Badge>
        );
      case 'unsupported':
        return (
          <Badge variant="destructive">
            <XCircle size={14} className="mr-1" />
            Unsupported
          </Badge>
        );
    }
  };

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        {/* Checkbox */}
        <TableCell>
          <Checkbox
            checked={component.isSelected}
            disabled={component.compatibilityStatus === 'unsupported'}
            onCheckedChange={(checked) =>
              onToggle(component.originalIndex, checked as boolean)
            }
          />
        </TableCell>

        {/* Name with expand button */}
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
            </Button>
            <span className="font-medium truncate">{component.name}</span>
          </div>
        </TableCell>

        {/* Folder Path - Only for pipelines */}
        {componentType === 'pipeline' && (
          <TableCell>
            {component.folder?.path ? (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <FolderOpen size={14} />
                <span className="truncate" title={component.folder.path}>
                  {component.folder.path}
                </span>
                {component.folder.isFlattened && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    Flattened
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm text-muted-foreground/50">
                <Folder size={14} />
                <span>Root</span>
              </div>
            )}
          </TableCell>
        )}

        {/* Status Badge */}
        <TableCell>
          {getStatusBadge(component.compatibilityStatus)}
        </TableCell>

        {/* Warning Count */}
        <TableCell>
          {component.warnings && component.warnings.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Warning size={14} />
              {component.warnings.length}
            </Badge>
          )}
        </TableCell>

        {/* Quick Actions */}
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Details'}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expandable Details Row */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={componentType === 'pipeline' ? 6 : 5} className="bg-muted/30">
            <div className="py-3 space-y-3">
              {/* Warnings */}
              {component.warnings && component.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Warning size={16} className="text-warning" />
                    Warnings
                  </h4>
                  <div className="space-y-1 pl-6">
                    {component.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className="text-sm text-warning flex items-start gap-2"
                      >
                        <span className="text-warning">•</span>
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fabric Target */}
              {component.fabricTarget && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Fabric Target</h4>
                  <div className="pl-6 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Type:</span>{' '}
                      {component.fabricTarget.type}
                    </div>
                    <div>
                      <span className="font-medium">Name:</span>{' '}
                      {component.fabricTarget.name}
                    </div>
                  </div>
                </div>
              )}

              {/* Component Type */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Component Type</h4>
                <div className="pl-6 text-sm text-muted-foreground">
                  {component.type}
                </div>
              </div>

              {/* Migration Notes */}
              {component.compatibilityStatus === 'partiallySupported' && (
                <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded-md">
                  <p className="text-sm text-warning">
                    <strong>Note:</strong> This component is partially supported. 
                    Manual configuration may be required after migration.
                  </p>
                </div>
              )}

              {component.compatibilityStatus === 'unsupported' && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">
                    <strong>Note:</strong> This component is not supported for automatic migration. 
                    Consider alternative approaches in Fabric.
                  </p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
