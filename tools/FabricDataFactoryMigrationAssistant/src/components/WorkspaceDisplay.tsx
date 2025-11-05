import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Building } from '@phosphor-icons/react';
import { useAppContext } from '../contexts/AppContext';

interface WorkspaceDisplayProps {
  className?: string;
}

export function WorkspaceDisplay({ className = '' }: WorkspaceDisplayProps) {
  const { state } = useAppContext();

  if (!state.selectedWorkspace) {
    return null;
  }

  return (
    <Card className={`bg-muted/30 border-primary/20 ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Building size={16} className="text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground">
              Target Workspace
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {state.selectedWorkspace.name}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}