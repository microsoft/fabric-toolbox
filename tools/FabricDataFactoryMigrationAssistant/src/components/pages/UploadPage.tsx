import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CloudArrowUp, FilePlus, CheckCircle, Warning, ChartBar, GitBranch } from '@phosphor-icons/react';
import { WizardLayout } from '../WizardLayout';
import { useAppContext } from '../../contexts/AppContext';
import { adfParserService } from '../../services/adfParserService';
import { ComponentSummary } from '../../types';
import { ADFProfile } from '../../types/profiling';
import { validateFileInput } from '../../lib/validation';
import { NavigationDebug } from '../NavigationDebug';
import { ProfilingDashboard } from '../profiling/ProfilingDashboard';
import { ProfilingErrorBoundary } from '../profiling/ProfilingErrorBoundary';
import { ProfilingDashboardSkeleton } from '../profiling/LoadingSkeletons';
import { toast } from 'sonner';

export function UploadPage() {
  const { state, dispatch } = useAppContext();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ComponentSummary | null>(null);
  const [profile, setProfile] = useState<ADFProfile | null>(null);
  const [activeView, setActiveView] = useState<'summary' | 'profile'>('summary');
  const [showReuploadWarning, setShowReuploadWarning] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Check if user has progressed past upload (authenticated)
  const hasProgressedPastUpload = Boolean(state.auth?.isAuthenticated);

  // Cache: Restore profile from AppContext if returning to page
  useEffect(() => {
    if (state.adfProfile && !profile) {
      setProfile(state.adfProfile);
      console.log('📦 Profile restored from cache');
    }
    if (state.uploadedFile && !summary && state.adfComponents.length > 0) {
      const cachedSummary = adfParserService.getComponentSummary(state.adfComponents);
      setSummary(cachedSummary);
      console.log('📦 Summary restored from cache');
    }
  }, [state.adfProfile, state.uploadedFile, state.adfComponents, profile, summary]);

  const performFileUpload = useCallback(async (file: File) => {
    if (!validateFileInput(file)) {
      setError('Please upload a valid JSON file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSummary(null);
    setProfile(null);

    try {
      const content = await file.text();
      const components = await adfParserService.parseARMTemplate(content);
      
      // Validate we have components
      if (!components || components.length === 0) {
        throw new Error('No Data Factory components found in the ARM template');
      }
      
      const componentSummary = adfParserService.getComponentSummary(components);
      
      // Generate comprehensive profile with error handling
      let generatedProfile: ADFProfile | null = null;
      try {
        generatedProfile = adfParserService.generateProfile(
          components,
          file.name,
          file.size
        );
      } catch (profileError) {
        console.warn('Profile generation failed, continuing with basic parsing:', profileError);
        // Continue even if profiling fails - don't block the upload
      }

      // Dispatch to AppContext for persistence
      dispatch({ type: 'SET_UPLOADED_FILE', payload: file });
      dispatch({ type: 'SET_ADF_COMPONENTS', payload: components });
      
      // Extract global parameter references from detected components (NEW)
      const pipelineComponents = components.filter(c => c.type === 'pipeline');
      if (pipelineComponents.length > 0 && pipelineComponents[0].globalParameterReferences) {
        const globalParams = pipelineComponents[0].globalParameterReferences;
        console.log(`[UploadPage] Found ${globalParams.length} global parameters`);
        dispatch({ type: 'SET_GLOBAL_PARAMETER_REFERENCES', payload: globalParams });
        
        if (globalParams.length > 0) {
          toast.success(`Detected ${globalParams.length} global parameter(s) for migration`);
        }
      }
      
      // Check for parameterized LinkedServices (NEW)
      if (componentSummary.parameterizedLinkedServicesCount && componentSummary.parameterizedLinkedServicesCount > 0) {
        console.log(`[UploadPage] Found ${componentSummary.parameterizedLinkedServicesCount} parameterized LinkedServices`);
        toast.warning(
          `Detected ${componentSummary.parameterizedLinkedServicesCount} LinkedService(s) with parameters`,
          {
            description: 'These will require manual reconfiguration in Fabric. Connections do not support parameters yet.'
          }
        );
      }
      
      if (generatedProfile) {
        dispatch({ type: 'SET_ADF_PROFILE', payload: generatedProfile });
        setProfile(generatedProfile);
      }
      
      setSummary(componentSummary);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse ARM template';
      setError(errorMessage);
      console.error('ARM template parsing error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [dispatch]);

  const handleFileUpload = useCallback((file: File) => {
    // If user has already authenticated/progressed and is re-uploading, show warning
    if (hasProgressedPastUpload && state.uploadedFile) {
      setPendingFile(file);
      setShowReuploadWarning(true);
    } else {
      // First upload or no progress yet - proceed directly
      performFileUpload(file);
    }
  }, [hasProgressedPastUpload, state.uploadedFile, performFileUpload]);

  const confirmReupload = useCallback(() => {
    if (pendingFile) {
      // Clear all downstream state - reset to fresh state but keep minimal auth
      dispatch({ type: 'SET_SELECTED_WORKSPACE', payload: null });
      dispatch({ type: 'SET_GLOBAL_PARAMETER_REFERENCES', payload: [] });
      dispatch({ type: 'SET_GLOBAL_PARAMETER_CONFIG_COMPLETED', payload: false });
      dispatch({ type: 'SET_DEPLOYMENT_RESULTS', payload: [] });
      dispatch({ type: 'SET_CURRENT_STEP', payload: 0 }); // Reset to upload step
      
      // Perform the upload
      performFileUpload(pendingFile);
      
      // Close dialog and clear pending file
      setShowReuploadWarning(false);
      setPendingFile(null);
      
      toast.info('Previous configuration cleared. You may need to reconfigure connections and mappings.');
    }
  }, [pendingFile, dispatch, performFileUpload]);

  const cancelReupload = useCallback(() => {
    setShowReuploadWarning(false);
    setPendingFile(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const firstFile = files[0];
    if (firstFile) {
      handleFileUpload(firstFile);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const firstFile = files?.[0];
    if (firstFile) {
      handleFileUpload(firstFile);
    }
  }, [handleFileUpload]);

  const handleExportSuccess = useCallback(() => {
    toast.success('Profile exported successfully', {
      description: 'Your ARM template profile has been downloaded as a Markdown file.',
    });
  }, []);

  return (
    <WizardLayout
      title="Upload ARM Template"
      description="Upload your ARM template to begin the migration process"
      nextButtonText="Proceed with Migration"
    >
      <div className="space-y-4">
        {/* Compact Upload Area */}
        <Card className="border-2">
          <CardContent className="p-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                ${isProcessing ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:border-primary/50 hover:bg-primary/5'}
              `}
            >
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={isProcessing}
              />
              
              <label htmlFor="file-upload" className="cursor-pointer block">
                <CloudArrowUp size={32} className="mx-auto mb-3 text-muted-foreground" />
                <h3 className="text-base font-semibold mb-1">
                  {isProcessing ? 'Processing file...' : 'Upload ARM Template'}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Drag and drop your ARM template JSON file here, or click to browse
                </p>
                <Button variant="outline" size="sm" disabled={isProcessing}>
                  <FilePlus size={14} className="mr-1.5" />
                  Choose File
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Processing UI with Skeleton */}
        {isProcessing && (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Processing ARM Template</h4>
                  <Progress value={undefined} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    Parsing JSON structure, extracting components, and generating comprehensive profile...
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {/* Show skeleton preview */}
            <div className="opacity-60 pointer-events-none">
              <ProfilingDashboardSkeleton />
            </div>
          </>
        )}

        {/* Compact Error Display */}
        {error && (
          <Alert variant="destructive" className="py-3">
            <Warning size={14} />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Compact Upload Success & Summary */}
        {state.uploadedFile && summary && (
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'summary' | 'profile')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="summary">
                <CheckCircle size={16} className="mr-2" />
                Quick Summary
              </TabsTrigger>
              <TabsTrigger value="profile" disabled={!profile}>
                <ChartBar size={16} className="mr-2" />
                Full Profile
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-accent text-base">
                    <CheckCircle size={16} />
                    Upload Successful
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Found {summary.total} components in your ARM template
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-accent/10 rounded-lg p-3 text-center">
                      <div className="text-lg font-semibold text-accent">{summary.supported}</div>
                      <div className="text-xs text-muted-foreground">Supported</div>
                    </div>
                    <div className="bg-warning/10 rounded-lg p-3 text-center">
                      <div className="text-lg font-semibold text-warning">{summary.partiallySupported}</div>
                      <div className="text-xs text-muted-foreground">Partial</div>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-3 text-center">
                      <div className="text-lg font-semibold text-destructive">{summary.unsupported}</div>
                      <div className="text-xs text-muted-foreground">Unsupported</div>
                    </div>
                  </div>
                  
                  {Object.keys(summary.byType).length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm text-muted-foreground mb-2">Component Types:</div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(summary.byType).map(([type, count]) => (
                          <div key={type} className="bg-muted rounded-lg p-2 flex justify-between text-sm">
                            <span className="capitalize">{type.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="font-medium">{count as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Custom Activity Detection Alert */}
                  {profile && profile.metrics.customActivitiesCount > 0 && (
                    <Alert className="mt-3 bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-300 dark:border-fuchsia-700">
                      <GitBranch size={14} className="text-fuchsia-600 dark:text-fuchsia-400" />
                      <AlertDescription className="text-sm">
                        <div className="font-semibold text-fuchsia-900 dark:text-fuchsia-100 mb-1">
                          Custom Activities Detected: {profile.metrics.customActivitiesCount}
                        </div>
                        <div className="text-fuchsia-800 dark:text-fuchsia-200 space-y-1">
                          <div>
                            Found <strong>{profile.metrics.totalCustomActivityReferences} LinkedService references</strong> across {profile.metrics.customActivitiesCount} Custom activities.
                          </div>
                          {profile.metrics.customActivitiesWithMultipleReferences > 0 && (
                            <div className="text-xs">
                              ⚠️ {profile.metrics.customActivitiesWithMultipleReferences} activities have multiple references requiring special attention.
                            </div>
                          )}
                          <div className="text-xs mt-2 pt-2 border-t border-fuchsia-300 dark:border-fuchsia-700">
                            <strong>Action Required:</strong> Custom activities reference LinkedServices in up to 3 locations. 
                            You'll need to map each reference on the <strong>Map Components</strong> page.
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Parameterized LinkedServices Warning Alert */}
                  {summary.parameterizedLinkedServicesCount && summary.parameterizedLinkedServicesCount > 0 && (
                    <Alert className="mt-3 bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700">
                      <Warning size={14} className="text-orange-600 dark:text-orange-400" />
                      <AlertDescription className="text-sm">
                        <div className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                          Parameterized LinkedServices Detected: {summary.parameterizedLinkedServicesCount}
                        </div>
                        <div className="text-orange-800 dark:text-orange-200 space-y-1">
                          <div>
                            Found <strong>{summary.parameterizedLinkedServicesNames?.join(', ')}</strong> with parameters.
                          </div>
                          <div>
                            Affects <strong>{summary.parameterizedLinkedServicesPipelineCount} pipeline(s)</strong> that will require manual reconfiguration.
                          </div>
                          <div className="text-xs mt-2 pt-2 border-t border-orange-300 dark:border-orange-700">
                            <strong>Note:</strong> Fabric Connections don't support parameters yet (feature on roadmap). 
                            You can deploy unaffected pipelines immediately.
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="profile" className="space-y-4 mt-4">
              {profile ? (
                <ProfilingErrorBoundary fallbackMessage="Unable to render the profiling dashboard. Please try the Quick Summary view.">
                  <ProfilingDashboard 
                    profile={profile as ADFProfile}
                    onExport={handleExportSuccess}
                  />
                </ProfilingErrorBoundary>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Warning size={32} className="mx-auto mb-3 text-warning" />
                    <h3 className="text-base font-semibold mb-2">Profile Generation Unavailable</h3>
                    <p className="text-sm text-muted-foreground">
                      Advanced profiling features couldn't be generated for this template.
                      <br />
                      You can continue with the Quick Summary view.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Re-upload Warning Dialog */}
      <Dialog open={showReuploadWarning} onOpenChange={setShowReuploadWarning}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Warning size={24} weight="fill" />
              Warning: This will clear all your work
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-4">
              <p className="text-base">
                Uploading a different ARM template will reset:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm pl-2">
                <li>Authentication and workspace selection</li>
                <li>Connection configurations</li>
                <li>Component mappings</li>
                <li>All deployment progress</li>
              </ul>
              <p className="text-sm font-medium pt-2">
                Are you sure you want to continue?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cancelReupload}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReupload}>
              Clear Everything & Re-upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WizardLayout>
  );
}