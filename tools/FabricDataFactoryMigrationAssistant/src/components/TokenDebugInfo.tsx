import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CaretDown, Copy, Eye, EyeSlash } from '@phosphor-icons/react';
import { authService } from '../services/authService';
import { useAppContext } from '../contexts/AppContext';
import { toast } from 'sonner';

export function TokenDebugInfo() {
  const { state } = useAppContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToken, setShowToken] = useState(false);

  if (!state.auth.isAuthenticated || !state.auth.accessToken) {
    return null;
  }

  const tokenInfo = authService.getTokenInfo(state.auth.accessToken);
  const scopeValidation = authService.validateTokenScopes(state.auth.accessToken);

  const copyToClipboard = (text: string, description: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${description} copied to clipboard`);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return date.toLocaleString();
  };

  const maskToken = (token: string) => {
    if (token.length < 20) return '***';
    return `${token.substring(0, 10)}...${token.substring(token.length - 10)}`;
  };

  return (
    <Card className="mt-4">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Token Debug Information</CardTitle>
                <CardDescription>
                  Current authentication token details
                </CardDescription>
              </div>
              <CaretDown 
                className={`h-4 w-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {/* Token Validation Status */}
              <div>
                <h4 className="text-sm font-medium mb-2">Token Validation</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={scopeValidation.isValid ? "default" : "destructive"}>
                    {scopeValidation.isValid ? "Valid" : "Invalid"}
                  </Badge>
                  {scopeValidation.errorMessage && (
                    <Badge variant="outline" className="text-warning">
                      {scopeValidation.errorMessage}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Token Expiration */}
              {tokenInfo && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Token Expiration</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant={tokenInfo.isExpired ? "destructive" : "default"}>
                      {tokenInfo.isExpired ? "Expired" : "Valid"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Expires: {formatDate(tokenInfo.expiresAt)}
                    </span>
                  </div>
                </div>
              )}

              {/* Scopes */}
              <div>
                <h4 className="text-sm font-medium mb-2">Granted Scopes</h4>
                <div className="space-y-1">
                  {state.auth.tokenScopes?.scopes && Array.isArray(state.auth.tokenScopes.scopes) && state.auth.tokenScopes.scopes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {state.auth.tokenScopes.scopes.map((scope, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No scope information available</p>
                  )}
                </div>
              </div>

              {/* Missing Scopes */}
              {scopeValidation.missingScopes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-warning">Missing Scopes</h4>
                  <div className="flex flex-wrap gap-1">
                    {scopeValidation.missingScopes.map((scope, index) => (
                      <Badge key={index} variant="destructive" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* User Information */}
              <div>
                <h4 className="text-sm font-medium mb-2">User Information</h4>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">Name:</span> {state.auth.user?.name}</p>
                  <p><span className="font-medium">Email:</span> {state.auth.user?.email}</p>
                  <p><span className="font-medium">Tenant ID:</span> {state.auth.user?.tenantId}</p>
                </div>
              </div>

              {/* Token (masked by default) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Access Token</h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowToken(!showToken)}
                      className="h-6 px-2"
                    >
                      {showToken ? <EyeSlash className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showToken ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(state.auth.accessToken!, 'Token')}
                      className="h-6 px-2"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                </div>
                <div className="bg-muted p-2 rounded text-xs font-mono break-all">
                  {showToken ? state.auth.accessToken : maskToken(state.auth.accessToken!)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(tokenInfo, null, 2), 'Token info')}
                >
                  Copy Debug Info
                </Button>
                {scopeValidation.missingScopes.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      try {
                        const newAuthState = await authService.acquireAdditionalScopes(scopeValidation.missingScopes);
                        // Update the auth state in context
                        // dispatch({ type: 'SET_AUTH', payload: newAuthState });
                        toast.success('Additional permissions granted successfully');
                      } catch (error: any) {
                        toast.error('Failed to acquire additional permissions', {
                          description: error.message
                        });
                      }
                    }}
                  >
                    Request Missing Scopes
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}