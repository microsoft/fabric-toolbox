import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CaretDown, CaretRight, Copy, Eye, EyeSlash } from '@phosphor-icons/react';
import { inspectToken, getScopeDescriptions } from '../lib/tokenUtils';
import { useAppContext } from '../contexts/AppContext';
import { toast } from 'sonner';

export function TokenDebugPanel() {
  const { state } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [showFullToken, setShowFullToken] = useState(false);

  if (!state.auth?.accessToken) {
    return null;
  }

  const tokenInspection = inspectToken(state.auth.accessToken);
  const scopeDescriptions = getScopeDescriptions();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard`);
    }).catch(() => {
      toast.error(`Failed to copy ${label}`);
    });
  };

  const formatToken = (token: string) => {
    if (showFullToken) {
      return token;
    }
    return `${token.substring(0, 20)}...${token.substring(token.length - 20)}`;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto mt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {isOpen ? <CaretDown size={20} /> : <CaretRight size={20} />}
                  Token Debug Information
                </CardTitle>
                <CardDescription>
                  View token scopes and validation status (Development Mode)
                </CardDescription>
              </div>
              <Badge variant={tokenInspection.scopeValidation.isValid ? "default" : "destructive"}>
                {tokenInspection.scopeValidation.isValid ? "Valid" : "Invalid"}
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Token Overview */}
            <div className="space-y-2">
              <h3 className="font-semibold">Access Token</h3>
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 px-2 py-1 rounded text-sm flex-1 break-all">
                  {formatToken(state.auth.accessToken)}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullToken(!showFullToken)}
                >
                  {showFullToken ? <EyeSlash size={16} /> : <Eye size={16} />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(state.auth.accessToken || '', 'Token')}
                >
                  <Copy size={16} />
                </Button>
              </div>
            </div>

            {/* Expiration Info */}
            {tokenInspection.expirationInfo.expiresAt && (
              <div className="space-y-2">
                <h3 className="font-semibold">Token Expiration</h3>
                <div className="text-sm">
                  <p>Expires at: {tokenInspection.expirationInfo.expiresAt.toLocaleString()}</p>
                  {tokenInspection.expirationInfo.expiresInMinutes !== null && (
                    <p>Expires in: {tokenInspection.expirationInfo.expiresInMinutes} minutes</p>
                  )}
                  {tokenInspection.expirationInfo.isExpired && (
                    <Badge variant="destructive">Token Expired</Badge>
                  )}
                </div>
              </div>
            )}

            {/* Scope Validation */}
            <div className="space-y-3">
              <h3 className="font-semibold">Scope Validation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-green-700 mb-2">
                    Present Scopes ({tokenInspection.scopeValidation.presentScopes.length})
                  </h4>
                  <div className="space-y-1">
                    {tokenInspection.scopeValidation.presentScopes.map(scope => (
                      <div key={scope} className="text-xs">
                        <Badge variant="outline" className="mb-1">
                          {scope}
                        </Badge>
                        {scopeDescriptions[scope] && (
                          <p className="text-gray-600 ml-2">
                            {scopeDescriptions[scope]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-red-700 mb-2">
                    Missing Scopes ({tokenInspection.scopeValidation.missingScopes.length})
                  </h4>
                  <div className="space-y-1">
                    {tokenInspection.scopeValidation.missingScopes.map(scope => (
                      <div key={scope} className="text-xs">
                        <Badge variant="destructive" className="mb-1">
                          {scope}
                        </Badge>
                        {scopeDescriptions[scope] && (
                          <p className="text-gray-600 ml-2">
                            {scopeDescriptions[scope]}
                          </p>
                        )}
                      </div>
                    ))}
                    {tokenInspection.scopeValidation.missingScopes.length === 0 && (
                      <p className="text-green-600 text-sm">All required scopes are present</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Token Payload */}
            {tokenInspection.payload && (
              <div className="space-y-2">
                <h3 className="font-semibold">Token Payload</h3>
                <div className="bg-gray-100 p-3 rounded overflow-auto">
                  <pre className="text-xs">
                    {JSON.stringify(tokenInspection.payload, null, 2)}
                  </pre>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(
                    JSON.stringify(tokenInspection.payload, null, 2),
                    'Token payload'
                  )}
                >
                  <Copy size={16} className="mr-2" />
                  Copy Payload
                </Button>
              </div>
            )}

            {/* Validation Status */}
            <div className="space-y-2">
              <h3 className="font-semibold">Validation Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Badge variant={tokenInspection.scopeValidation.isValid ? "default" : "destructive"}>
                  {tokenInspection.scopeValidation.isValid ? "Valid" : "Invalid"}
                </Badge>
                <Badge variant={tokenInspection.scopeValidation.hasRequiredScopes ? "default" : "destructive"}>
                  {tokenInspection.scopeValidation.hasRequiredScopes ? "All Scopes" : "Missing Scopes"}
                </Badge>
                <Badge variant={tokenInspection.scopeValidation.tokenExpired ? "destructive" : "default"}>
                  {tokenInspection.scopeValidation.tokenExpired ? "Expired" : "Not Expired"}
                </Badge>
                <Badge variant={tokenInspection.scopeValidation.tokenNotYetValid ? "destructive" : "default"}>
                  {tokenInspection.scopeValidation.tokenNotYetValid ? "Not Yet Valid" : "Valid Time"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}