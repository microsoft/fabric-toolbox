import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CaretDown, CaretUp, Copy, Eye, EyeSlash } from '@phosphor-icons/react';
import { useAppContext } from '../../contexts/AppContext';
import { authService } from '../../services/authService';
import { validateTokenScopes, formatScopesForDisplay } from '../../lib/tokenUtils';

interface ScopeDebugPanelProps {
  showInProduction?: boolean;
}

export function ScopeDebugPanel({ showInProduction = false }: ScopeDebugPanelProps) {
  const { state } = useAppContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Only show in development unless explicitly requested
  if (!showInProduction && process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!state.auth?.accessToken) {
    return null;
  }

  const { accessToken } = state.auth;
  const scopeValidation = validateTokenScopes(accessToken);
  const tokenScopes = authService.getTokenScopesForDisplay(accessToken);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  };

  const truncatedToken = `${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 20)}`;

  return (
    <Card className="border-dashed border-warning/50 bg-warning/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div>
                <CardTitle className="text-sm text-warning-foreground flex items-center gap-2">
                  Token Scope Debug Panel
                  <Badge 
                    variant={scopeValidation.hasAllRequiredScopes ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {scopeValidation.hasAllRequiredScopes ? 'Valid' : 'Invalid'}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Debug information for OAuth token scopes
                </CardDescription>
              </div>
              {isExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Scope Validation Summary */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Scope Validation</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span>Has All Required:</span>
                  <Badge variant={scopeValidation.hasAllRequiredScopes ? 'default' : 'destructive'}>
                    {scopeValidation.hasAllRequiredScopes ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Total Scopes:</span>
                  <span>{tokenScopes.scopes.length}</span>
                </div>
              </div>
            </div>

            {/* Missing Scopes */}
            {scopeValidation.missingScopes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive">Missing Scopes</h4>
                <div className="flex flex-wrap gap-1">
                  {formatScopesForDisplay(scopeValidation.missingScopes).map((scope, index) => (
                    <Badge key={index} variant="destructive" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Present Scopes */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Present Scopes</h4>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {tokenScopes.formatted.map((scope, index) => (
                  <Badge 
                    key={index} 
                    variant="outline" 
                    className="text-xs"
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Token Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Access Token</h4>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowToken(!showToken)}
                    className="h-6 px-2 text-xs"
                  >
                    {showToken ? <EyeSlash size={12} /> : <Eye size={12} />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(accessToken)}
                    className="h-6 px-2 text-xs"
                  >
                    <Copy size={12} />
                  </Button>
                </div>
              </div>
              <div className="bg-muted p-2 rounded text-xs font-mono break-all">
                {showToken ? accessToken : truncatedToken}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(JSON.stringify({
                  scopeValidation,
                  tokenScopes: tokenScopes.formatted
                }, null, 2))}
                className="text-xs"
              >
                Copy Debug Info
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  console.log('Token Scope Debug Info:', {
                    scopeValidation,
                    tokenScopes,
                    rawToken: accessToken
                  });
                }}
                className="text-xs"
              >
                Log to Console
              </Button>
            </div>

            {/* Error Message */}
            {scopeValidation.error && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {scopeValidation.error}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}