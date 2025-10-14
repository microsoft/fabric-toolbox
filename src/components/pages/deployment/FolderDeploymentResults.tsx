import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  FolderOpen, 
  Folder,
  Warning,
  ArrowsDownUp
} from '@phosphor-icons/react';
import { FolderDeploymentResult } from '@/types';

interface FolderDeploymentResultsProps {
  results: FolderDeploymentResult[];
}

export function FolderDeploymentResults({ results }: FolderDeploymentResultsProps) {
  if (!results || results.length === 0) {
    return null;
  }

  const successfulFolders = results.filter(r => r.status === 'success');
  const failedFolders = results.filter(r => r.status === 'failed');
  const flattenedFolders = results.filter(r => r.wasFlattened);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen size={20} />
          Folder Structure
        </CardTitle>
        <CardDescription>
          Workspace folder hierarchy created for pipeline organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-accent/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-accent">{successfulFolders.length}</div>
            <div className="text-xs text-muted-foreground">Folders Created</div>
          </div>
          <div className="p-3 bg-destructive/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-destructive">{failedFolders.length}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="p-3 bg-primary/10 rounded-lg text-center">
            <div className="text-2xl font-bold text-primary">{flattenedFolders.length}</div>
            <div className="text-xs text-muted-foreground">Flattened</div>
          </div>
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-2xl font-bold text-foreground">
              {Math.max(...results.map(r => r.depth || 0), 0)}
            </div>
            <div className="text-xs text-muted-foreground">Max Depth</div>
          </div>
        </div>

        {/* Flattening Alert */}
        {flattenedFolders.length > 0 && (
          <Alert>
            <ArrowsDownUp size={16} />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Folder Depth Optimization Applied</div>
                <div className="text-sm">
                  {flattenedFolders.length} folder path{flattenedFolders.length > 1 ? 's' : ''} exceeded 
                  Fabric's 10-level limit and were automatically flattened using underscore notation.
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Example: "Level1/.../Level10/Level11" → "Level1/.../Level9_Level10_Level11"
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Folder List */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Created Folders</h4>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {results.map((result, index) => (
              <div 
                key={index}
                className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {result.status === 'success' ? (
                      <CheckCircle size={18} className="text-accent flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate" title={result.originalPath}>
                          {result.depth === 1 ? (
                            <span className="flex items-center gap-1.5">
                              <Folder size={14} />
                              {result.displayName}
                            </span>
                          ) : (
                            result.displayName
                          )}
                        </div>
                        {result.wasFlattened && (
                          <Badge variant="secondary" className="text-xs">
                            <ArrowsDownUp size={12} className="mr-1" />
                            Flattened
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          Depth: {result.depth}
                        </Badge>
                      </div>
                      
                      <div className="text-xs text-muted-foreground mt-1 truncate" title={result.originalPath || result.path}>
                        Path: {result.originalPath || result.path}
                      </div>
                      
                      {result.wasFlattened && result.path !== result.originalPath && (
                        <div className="text-xs text-muted-foreground mt-1 truncate" title={result.path}>
                          Applied: {result.path}
                        </div>
                      )}
                      
                      {result.folderId && (
                        <div className="text-xs text-muted-foreground/70 mt-1 font-mono truncate" title={result.folderId}>
                          ID: {result.folderId}
                        </div>
                      )}
                      
                      {result.error && (
                        <div className="text-xs text-destructive mt-2 p-2 bg-destructive/5 rounded border-l-2 border-destructive/20">
                          {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0">
                    {result.status === 'success' ? (
                      <Badge variant="default" className="bg-accent">Created</Badge>
                    ) : (
                      <Badge variant="destructive">Failed</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Summary */}
        {failedFolders.length > 0 && (
          <Alert variant="destructive">
            <Warning size={16} />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Folder Creation Failures</div>
                <div className="text-sm">
                  {failedFolders.length} folder{failedFolders.length > 1 ? 's' : ''} could not be created. 
                  Pipelines assigned to these folders will be created at the root level instead.
                </div>
                <ul className="text-sm space-y-1 mt-2 list-disc list-inside">
                  {failedFolders.map((folder, index) => (
                    <li key={index}>
                      <span className="font-medium">{folder.originalPath || folder.path}</span>: {folder.error}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
