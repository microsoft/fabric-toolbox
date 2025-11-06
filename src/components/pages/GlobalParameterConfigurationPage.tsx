import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { CheckCircle, Warning, GitBranch, Spinner, ArrowRight, ArrowLeft, Info } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { globalParameterDetectionService } from '../../services/globalParameterDetectionService';
import { variableLibraryService } from '../../services/variableLibraryService';
import type { GlobalParameterReference, VariableLibraryConfig } from '../../types';

export function GlobalParameterConfigurationPage() {
  const { state, dispatch } = useAppContext();
  const [isDeploying, setIsDeploying] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [description, setDescription] = useState('');
  const [variables, setVariables] = useState<GlobalParameterReference[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize library name and variables on mount
  useEffect(() => {
    // Use existing config if available, otherwise generate default
    if (state.variableLibraryConfig) {
      setLibraryName(state.variableLibraryConfig.displayName);
      setDescription(state.variableLibraryConfig.description || '');
      setVariables(state.variableLibraryConfig.variables);
    } else if (state.globalParameterReferences && state.globalParameterReferences.length > 0) {
      // Generate default library name
      // TODO: Extract factory name from ARM template if available
      const defaultName = variableLibraryService.generateDefaultLibraryName('DataFactory');
      setLibraryName(defaultName);
      setDescription('Global parameters migrated from Data Factory');
      
      // Initialize variables with default values for booleans
      const initializedVariables = state.globalParameterReferences.map(variable => {
        if (variable.adfDataType === 'Bool' && (variable.defaultValue === null || variable.defaultValue === undefined || variable.defaultValue === '')) {
          return { ...variable, defaultValue: false };
        }
        return variable;
      });
      
      setVariables(initializedVariables);
    }
  }, [state.variableLibraryConfig, state.globalParameterReferences]);

  const handleVariableUpdate = (index: number, field: keyof GlobalParameterReference, value: any) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    
    // If updating adfDataType, also update fabricDataType
    if (field === 'adfDataType') {
      const adfType = value as string;
      let fabricType: 'String' | 'Integer' | 'Number' | 'Boolean' = 'String';
      
      if (adfType === 'Int') fabricType = 'Integer';
      else if (adfType === 'Float') fabricType = 'Number';
      else if (adfType === 'Bool') fabricType = 'Boolean';
      
      updated[index].fabricDataType = fabricType;
      
      // Initialize defaultValue when changing to Boolean type
      if (fabricType === 'Boolean' && (updated[index].defaultValue === '' || updated[index].defaultValue === null || updated[index].defaultValue === undefined)) {
        updated[index].defaultValue = false;
      }
    }
    
    setVariables(updated);
  };

  const validateConfiguration = (): { valid: boolean; error?: string } => {
    // Validate library name
    const nameValidation = variableLibraryService.validateLibraryName(libraryName);
    if (!nameValidation.valid) {
      return { valid: false, error: nameValidation.error };
    }

    // Validate variables
    for (const variable of variables) {
      if (!variable.name || variable.name.trim() === '') {
        return { valid: false, error: 'All variables must have a name' };
      }
      
      if (variable.defaultValue === '' || variable.defaultValue === null || variable.defaultValue === undefined) {
        return { valid: false, error: `Variable "${variable.name}" must have a default value` };
      }
      
      if (variable.isSecure && variable.defaultValue === 'SECRET') {
        return { valid: false, error: `Secure variable "${variable.name}" requires a real value (not placeholder "SECRET")` };
      }
    }

    return { valid: true };
  };

  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      setError(null);

      // Validation
      const validation = validateConfiguration();
      if (!validation.valid) {
        setError(validation.error || 'Configuration validation failed');
        toast.error(validation.error);
        return;
      }

      if (!state.selectedWorkspace?.id) {
        throw new Error('No workspace selected');
      }

      // Build configuration
      const config: VariableLibraryConfig = {
        displayName: libraryName,
        description: description,
        variables: variables,
        workspaceId: state.selectedWorkspace.id,
        deploymentStatus: 'deploying',
      };

      // Save config to state
      dispatch({ type: 'SET_VARIABLE_LIBRARY_CONFIG', payload: config });

      console.log('[GlobalParameterConfig] Deploying Variable Library...', config);
      toast.info(`Deploying Variable Library: ${libraryName}...`);

      // Deploy Variable Library
      const result = await variableLibraryService.createVariableLibrary(
        state.selectedWorkspace.id,
        config,
        state.auth.accessToken || ''
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create Variable Library');
      }

      console.log('[GlobalParameterConfig] Variable Library deployed successfully', result);

      // Update config with deployment result
      const updatedConfig: VariableLibraryConfig = {
        ...config,
        deploymentStatus: 'success',
        fabricItemId: result.fabricItemId,
      };

      dispatch({ type: 'SET_VARIABLE_LIBRARY_CONFIG', payload: updatedConfig });
      dispatch({ type: 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED', payload: true });

      toast.success(`Variable Library "${libraryName}" deployed successfully!`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deploy Variable Library';
      console.error('[GlobalParameterConfig] Deployment error:', err);
      setError(errorMessage);
      
      // Update config with error
      if (state.variableLibraryConfig) {
        const failedConfig: VariableLibraryConfig = {
          ...state.variableLibraryConfig,
          deploymentStatus: 'failed',
          deploymentError: errorMessage,
        };
        dispatch({ type: 'SET_VARIABLE_LIBRARY_CONFIG', payload: failedConfig });
      }
      
      toast.error(errorMessage);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSkip = () => {
    console.log('[GlobalParameterConfig] User skipped Variable Library configuration');
    toast.info('Skipped Variable Library deployment. Pipelines will not reference global parameters.');
    
    // Mark as completed (skipped)
    dispatch({ type: 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED', payload: true });
  };

  const handleBack = () => {
    // Navigate back to previous step
    // This will be handled by navigation logic
    console.log('[GlobalParameterConfig] Navigating back...');
  };

  const isDeployed = state.variableLibraryConfig?.deploymentStatus === 'success';
  const hasErrors = state.variableLibraryConfig?.deploymentStatus === 'failed';

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <GitBranch className="h-5 w-5 text-blue-600" />
            Global Parameters Configuration
          </CardTitle>
          <CardDescription className="text-gray-700">
            {variables.length} global parameter{variables.length !== 1 ? 's' : ''} detected. 
            Configure the Fabric Variable Library to migrate these parameters.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Info Alert */}
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-gray-800">
          <strong>What's happening:</strong> Data Factory Global Parameters will be migrated to a Fabric Variable Library. 
          The Variable Library will be created first, then pipelines will reference it using 
          <code className="mx-1 px-1 bg-white rounded">@pipeline().libraryVariables.VariableLibrary_X</code> expressions.
        </AlertDescription>
      </Alert>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <Warning className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {isDeployed && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-gray-800">
            Variable Library deployed successfully! Item ID: {state.variableLibraryConfig?.fabricItemId}
          </AlertDescription>
        </Alert>
      )}

      {/* Library Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Variable Library Settings</CardTitle>
          <CardDescription className="text-gray-700">
            Configure the name and description for the Fabric Variable Library
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="libraryName" className="text-gray-900">Library Name</Label>
            <Input
              id="libraryName"
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              placeholder="Enter library name"
              className="w-full"
              disabled={isDeployed || isDeploying}
            />
            <p className="text-sm text-gray-500 mt-1">
              Name for the Variable Library in Fabric (previously Data Factory global parameters)
            </p>
          </div>

          <div>
            <Label htmlFor="description" className="text-gray-900">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Global parameters migrated from Azure Data Factory"
              disabled={isDeployed || isDeploying}
              className="mt-1"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Variables Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-gray-900">Variables</CardTitle>
          <CardDescription className="text-gray-700">
            Configure the data types and default values for each variable
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-gray-900">Parameter Name</TableHead>
                  <TableHead className="text-gray-900">Source Type</TableHead>
                  <TableHead className="text-gray-900">Fabric Type</TableHead>
                  <TableHead className="text-gray-900">Default Value</TableHead>
                  <TableHead className="text-gray-900">Note</TableHead>
                  <TableHead className="text-gray-900">Referenced By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((variable, index) => (
                  <TableRow key={variable.name}>
                    <TableCell className="font-mono text-sm text-gray-900">{variable.name}</TableCell>
                    <TableCell>
                      <select
                        value={variable.adfDataType}
                        onChange={(e) => handleVariableUpdate(index, 'adfDataType', e.target.value)}
                        disabled={isDeployed || isDeploying}
                        className="w-full border rounded px-2 py-1 text-sm text-gray-900"
                      >
                        <option value="String">String</option>
                        <option value="Int">Int</option>
                        <option value="Float">Float</option>
                        <option value="Bool">Bool</option>
                        <option value="Array">Array</option>
                        <option value="Object">Object</option>
                        <option value="SecureString">SecureString</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-gray-900">
                        {variable.fabricDataType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {variable.fabricDataType === 'Boolean' ? (
                        <select
                          value={variable.defaultValue === true ? 'true' : 'false'}
                          onChange={(e) => {
                            const value = e.target.value === 'true';
                            handleVariableUpdate(index, 'defaultValue', value);
                          }}
                          disabled={isDeployed || isDeploying}
                          className="w-full border rounded px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <Input
                          value={String(variable.defaultValue)}
                          onChange={(e) => {
                            let value: string | number | boolean = e.target.value;
                            
                            // Type conversion
                            if (variable.fabricDataType === 'Integer' || variable.fabricDataType === 'Number') {
                              value = parseFloat(e.target.value) || 0;
                            }
                            
                            handleVariableUpdate(index, 'defaultValue', value);
                          }}
                          disabled={isDeployed || isDeploying}
                          className={`w-full ${variable.isSecure && variable.defaultValue === 'SECRET' ? 'border-yellow-500 bg-yellow-50' : ''}`}
                          placeholder={variable.isSecure ? 'Enter secure value' : 'Enter value'}
                        />
                      )}
                      {variable.isSecure && (
                        <p className="text-xs text-yellow-700 mt-1">
                          ⚠️ SecureString: Enter actual value
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={variable.note || ''}
                        onChange={(e) => handleVariableUpdate(index, 'note', e.target.value)}
                        disabled={isDeployed || isDeploying}
                        className="w-full"
                        placeholder="Optional note"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-700">
                        {variable.referencedByPipelines.length > 0 ? (
                          <ul className="list-disc list-inside">
                            {variable.referencedByPipelines.slice(0, 3).map(pipeline => (
                              <li key={pipeline}>{pipeline}</li>
                            ))}
                            {variable.referencedByPipelines.length > 3 && (
                              <li>+{variable.referencedByPipelines.length - 3} more</li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-gray-500">None</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={isDeploying}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="flex gap-3">
          {!isDeployed && (
            <>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={isDeploying}
              >
                Skip (No Variable Library)
              </Button>
              
              <Button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isDeploying ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    Deploy Variable Library
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}
          
          {isDeployed && (
            <Button
              onClick={() => dispatch({ type: 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED', payload: true })}
              className="bg-green-600 hover:bg-green-700"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
