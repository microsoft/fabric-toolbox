import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CaretDown, 
  CaretRight, 
  Bug, 
  CheckCircle, 
  XCircle, 
  Warning,
  Copy,
  Info
} from '@phosphor-icons/react';
import { authService } from '../services/authService';
import { validateTokenScopes, REQUIRED_FABRIC_SCOPES } from '../lib/scopeValidation';
import { toast } from 'sonner';

interface ScopeDebugPanelProps {
  accessToken: string | null;
  showDebugInfo?: boolean;
}

export function ScopeDebugPanel({ accessToken, showDebugInfo = false }: ScopeDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!showDebugInfo || !accessToken) {
    return null;
  }

  const debugInfo = authService.getTokenScopeDebugInfo(accessToken);
  
  if (!debugInfo) {
    return null;
  }

  const scopeValidation = validateTokenScopes(accessToken);
  const requiredScopes = Object.values(REQUIRED_FABRIC_SCOPES);

  const copyTokenInfo = async () => {
    const tokenInfo = {
      hasAllRequiredScopes: debugInfo.hasRequiredScopes,
      requiredScopes: requiredScopes,
      missingScopes: debugInfo.missingScopes,
      presentScopes: debugInfo.scopes.filter(scope => requiredScopes.includes(scope as any)),
      allTokenScopes: debugInfo.scopes,
      validationResults: scopeValidation
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(tokenInfo, null, 2));
      toast.success('Token scope information copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Card className="border-info/20 bg-info/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bug size={16} className="text-info" />
            Token Scope Debug Information
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyTokenInfo}
              className="h-7 px-2 text-xs"
            >
              <Copy size={12} className="mr-1" />
              Copy
            </Button>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  {isOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
                  {isOpen ? 'Hide' : 'Show'} Details
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Overall Status */}
        <div className="flex items-center gap-2 mb-3">
          {debugInfo.hasRequiredScopes ? (
            <CheckCircle size={16} className="text-accent" />
          ) : (
            <XCircle size={16} className="text-destructive" />
          )}
          <span className="text-sm font-medium">
            {debugInfo.hasRequiredScopes 
              ? 'All required scopes present' 
              : `Missing ${debugInfo.missingScopes.length} required scope(s)`
            }
          </span>
        </div>

        {/* Missing Scopes Alert */}
        {!debugInfo.hasRequiredScopes && (
          <Alert className="mb-3 border-destructive/20 bg-destructive/5">
            <Warning size={16} className="text-destructive" />
            <AlertDescription className="text-sm">
              <div className="font-medium mb-1">Missing Required Permissions:</div>
              <div className="space-y-1">
                {debugInfo.missingScopes.map((scope, index) => (
                  <div key={index} className="font-mono text-xs bg-background/50 p-1 rounded">
                    {scope}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent className="space-y-4">
            {/* Required Scopes Check */}
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <Info size={14} />
                Required Fabric API Scopes
              </div>
              <div className="space-y-2">
                {requiredScopes.map((scope, index) => {
                  const isPresent = debugInfo.scopes.includes(scope as any);
                  const scopeName = scope.split('/').pop()?.replace('.All', '') || scope;
                  
                  return (
                    <div key={index} className="flex items-center gap-2 p-2 bg-background/50 rounded">
                      {isPresent ? (
                        <CheckCircle size={14} className="text-accent flex-shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-destructive flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant={isPresent ? "default" : "destructive"} 
                            className="text-xs"
                          >
                            {scopeName}
                          </Badge>
                          <span className={`text-xs ${isPresent ? 'text-accent' : 'text-destructive'}`}>
                            {isPresent ? 'Present' : 'Missing'}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground truncate">
                          {scope}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* All Token Scopes */}
            <div>
              <div className="text-sm font-medium mb-2">
                All Token Scopes ({debugInfo.scopes.length})
              </div>
              <div className="bg-background/50 p-3 rounded max-h-40 overflow-auto">
                <div className="space-y-1">
                  {debugInfo.scopes.map((scope, index) => {
                    const isRequired = requiredScopes.includes(scope as any);
                    const scopeName = scope.split('/').pop() || scope;
                    
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <Badge 
                          variant={isRequired ? "default" : "secondary"} 
                          className="text-xs"
                        >
                          {scopeName}
                        </Badge>
                        {isRequired && (
                          <Badge variant="outline" className="text-xs border-accent/30 text-accent">
                            Required
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Raw Scope Data */}
            <div>
              <div className="text-sm font-medium mb-2">Raw Debug Data</div>
              <div className="bg-background/50 p-3 rounded">
                <pre className="text-xs font-mono overflow-auto">
                  {JSON.stringify({
                    hasAllRequiredScopes: debugInfo.hasRequiredScopes,
                    missingCount: debugInfo.missingScopes.length,
                    presentCount: debugInfo.scopes.length,
                    validation: scopeValidation
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}