import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, CheckCircle } from '@phosphor-icons/react';
import { WorkspaceInfo } from '../../types';

interface WorkspaceSummaryProps {
  workspace: WorkspaceInfo;
  className?: string;
}

export function WorkspaceSummary({ workspace, className = '' }: WorkspaceSummaryProps) {
  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-sm">
          <Database className="w-4 h-4 mr-2" />
          Target Workspace
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{workspace.name}</span>
            {workspace.hasContributorAccess && (
              <Badge variant="default" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Contributor
              </Badge>
            )}
          </div>
          {workspace.description && (
            <p className="text-sm text-muted-foreground">{workspace.description}</p>
          )}
          <div className="flex items-center text-xs text-muted-foreground">
            <span>ID:</span>
            <code className="bg-muted px-1 py-0.5 rounded ml-1 text-xs">
              {workspace.id}
            </code>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}