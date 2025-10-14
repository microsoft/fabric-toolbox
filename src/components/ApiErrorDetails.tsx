import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CaretDown, 
  CaretRight, 
  Copy, 
  Code, 
  Globe,
  FileText,
  Eye,
  EyeSlash
} from '@phosphor-icons/react';
import { APIRequestDetails } from '../types';
import { toast } from 'sonner';

interface ApiErrorDetailsProps {
  errorMessage: string;
  apiRequestDetails?: APIRequestDetails | undefined;
  componentName: string;
}

export function ApiErrorDetails({ errorMessage, apiRequestDetails, componentName }: ApiErrorDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSensitiveData, setShowSensitiveData] = useState(false);

  if (!apiRequestDetails) {
    return (
      <div className="bg-destructive/5 p-3 rounded border-l-4 border-destructive/30">
        <div className="text-sm font-medium text-destructive mb-1">Error Details:</div>
        <div className="text-sm text-destructive/80 font-mono whitespace-pre-wrap break-words">
          {errorMessage}
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          No API request details available. This error occurred outside of API calls.
        </div>
      </div>
    );
  }

  const sanitizePayload = (payload: Record<string, any>): Record<string, any> => {
    if (showSensitiveData) {
      return payload;
    }

    const sanitized = JSON.parse(JSON.stringify(payload)); // Deep clone
    
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'connectionString', 
      'clientSecret', 'accessToken', 'refreshToken', 'credential'
    ];

    const maskSensitive = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => maskSensitive(item));
      }
      
      if (obj && typeof obj === 'object') {
        const masked: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
          
          if (isSensitive && typeof value === 'string') {
            masked[key] = '***[MASKED]***';
          } else if (typeof value === 'object') {
            masked[key] = maskSensitive(value);
          } else {
            masked[key] = value;
          }
        }
        return masked;
      }
      
      return obj;
    };

    return maskSensitive(sanitized);
  };

  const copyToClipboard = async (text: string, description: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${description} copied to clipboard`);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyFullDetails = async () => {
    const details = {
      component: componentName,
      error: errorMessage,
      request: {
        method: apiRequestDetails.method,
        endpoint: apiRequestDetails.endpoint,
        payload: sanitizePayload(apiRequestDetails.payload),
        headers: apiRequestDetails.headers ? Object.fromEntries(
          Object.entries(apiRequestDetails.headers).filter(([key]) => 
            !key.toLowerCase().includes('authorization')
          )
        ) : undefined
      }
    };

    await copyToClipboard(JSON.stringify(details, null, 2), 'Error details');
  };

  const sanitizedPayload = sanitizePayload(apiRequestDetails.payload);
  const sanitizedHeaders = apiRequestDetails.headers ? Object.fromEntries(
    Object.entries(apiRequestDetails.headers).filter(([key]) => 
      !key.toLowerCase().includes('authorization')
    )
  ) : {};

  return (
    <div className="bg-destructive/5 rounded border-l-4 border-destructive/30">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-destructive">API Error Details</div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyFullDetails}
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

        <div className="text-sm text-destructive/80 font-mono whitespace-pre-wrap break-words mb-2">
          {errorMessage}
        </div>

        {/* Show enhanced troubleshooting for connection mapping errors */}
        {errorMessage.includes('FabricDataPipelines connection mapping') && (
          <div className="mb-2 p-2 bg-warning/10 border border-warning/30 rounded">
            <div className="text-xs font-medium text-warning-foreground mb-1">
              Connection Mapping Issue Detected
            </div>
            <div className="text-xs text-warning-foreground/80">
              This error indicates that the connection mapping format is incorrect. 
              The application should use the actual Connection ID value for the "externalReferences.connection" property.
              Check that the connection mappings from the Map Components stage are being correctly applied to the pipeline definition.
              This error typically occurs when InvokePipeline activities are not properly mapped to FabricDataPipelines connections in the Map Components stage.
            </div>
          </div>
        )}

        {/* Show enhanced troubleshooting for general connection mapping errors */}
        {(errorMessage.includes('connection mapping') || errorMessage.includes('selectedConnectionId') || errorMessage.includes('externalReferences')) && (
          <div className="mb-2 p-2 bg-info/10 border border-info/30 rounded">
            <div className="text-xs font-medium text-info-foreground mb-1">
              Connection Mapping Debug Info
            </div>
            <div className="text-xs text-info-foreground/80 space-y-1">
              <div>• Verify the connection ID format in Map Components is correct</div>
              <div>• Check that selectedConnectionId contains the actual Fabric connection GUID</div>
              <div>• Ensure externalReferences.connection uses the proper connection ID</div>
              <div>• Verify the connection mapping key format matches expectations</div>
            </div>
          </div>
        )}

        {/* Show enhanced troubleshooting for pipeline reference errors */}
        {(errorMessage.includes('Target pipeline') && errorMessage.includes('not found')) && (
          <div className="mb-2 p-2 bg-info/10 border border-info/30 rounded">
            <div className="text-xs font-medium text-info-foreground mb-1">
              Pipeline Reference Issue Detected
            </div>
            <div className="text-xs text-info-foreground/80">
              The target pipeline referenced by an InvokePipeline activity was not found. The system automatically checks for existing pipelines in the workspace as a fallback. 
              Ensure the target pipeline exists or is included in the migration batch.
            </div>
          </div>
        )}

        {/* Show information about fallback lookup */}
        {errorMessage.includes('fallback lookup') && (
          <div className="mb-2 p-2 bg-accent/10 border border-accent/30 rounded">
            <div className="text-xs font-medium text-accent-foreground mb-1">
              Fallback Pipeline Lookup Active
            </div>
            <div className="text-xs text-accent-foreground/80">
              The system is attempting to resolve pipeline references using the Fabric API to check for existing pipelines in the workspace.
            </div>
          </div>
        )}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent className="space-y-3">
            <div className="grid gap-3 mt-3">
              {/* HTTP Method and Endpoint */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe size={14} className="text-muted-foreground flex-shrink-0" />
                  <Badge variant="outline" className="text-xs">
                    {apiRequestDetails.method}
                  </Badge>
                </div>
                <div className="font-mono text-xs bg-muted p-2 rounded flex-1 overflow-auto">
                  {apiRequestDetails.endpoint}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(
                    `${apiRequestDetails.method} ${apiRequestDetails.endpoint}`, 
                    'API endpoint'
                  )}
                  className="h-7 px-2 flex-shrink-0"
                >
                  <Copy size={12} />
                </Button>
              </div>

              {/* Request Headers */}
              {Object.keys(sanitizedHeaders).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-muted-foreground" />
                    <span className="text-xs font-medium">Headers</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(
                        JSON.stringify(sanitizedHeaders, null, 2), 
                        'Request headers'
                      )}
                      className="h-6 px-2 ml-auto"
                    >
                      <Copy size={10} />
                    </Button>
                  </div>
                  <div className="font-mono text-xs bg-muted p-2 rounded max-h-32 overflow-auto">
                    <pre>{JSON.stringify(sanitizedHeaders, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* Request Payload */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Code size={14} className="text-muted-foreground" />
                  <span className="text-xs font-medium">Request Payload</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSensitiveData(!showSensitiveData)}
                    className="h-6 px-2 ml-auto"
                    title={showSensitiveData ? 'Hide sensitive data' : 'Show sensitive data'}
                  >
                    {showSensitiveData ? <EyeSlash size={10} /> : <Eye size={10} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(
                      JSON.stringify(sanitizedPayload, null, 2), 
                      'Request payload'
                    )}
                    className="h-6 px-2"
                  >
                    <Copy size={10} />
                  </Button>
                </div>
                <div className="font-mono text-xs bg-muted p-2 rounded max-h-48 overflow-auto">
                  <pre>{JSON.stringify(sanitizedPayload, null, 2)}</pre>
                </div>
                {!showSensitiveData && (
                  <div className="mt-1">
                    <Alert className="p-2">
                      <AlertDescription className="text-xs">
                        Sensitive information is masked. Click the eye icon to reveal.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}