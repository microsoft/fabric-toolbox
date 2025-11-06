import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { useWizardNavigation } from '../contexts/AppContext';
import type { WizardStep } from '../types';

interface WizardLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  showNavigation?: boolean;
  nextButtonText?: string;
}

export function WizardLayout({ children, title, description, showNavigation = true, nextButtonText }: WizardLayoutProps) {
  const { 
    currentStep, 
    totalSteps, 
    canGoNext, 
    canGoPrevious, 
    goNext, 
    goPrevious 
  } = useWizardNavigation();

  const stepTitles: Record<WizardStep, string> = {
    'upload': 'Upload ARM Template',
    'login': 'Login & Authentication',
    'workspace': 'Select Fabric Workspace',
    'managed-identity': 'Managed Identity',
    'connections': 'Map Connections',
    'deploy-connections': 'Deploy Connections',
    'validation': 'Validation',
    'global-parameters': 'Global Parameters',
    'mapping': 'Component Mapping',
    'deployment': 'Deployment',
    'complete': 'Complete'
  };

  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Compact header with progress */}
      <div className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-semibold text-foreground">
              Fabric Toolbox Data Factory Migration Assistant
            </h1>
            <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              Step {currentStep + 1} of {totalSteps}
            </div>
          </div>
          
          <Progress value={progressPercentage} className="h-1.5 mb-3" />
          
          {/* Compact desktop stage indicators */}
          <div className="hidden xl:grid grid-cols-10 gap-1 items-center text-xs">
            {Object.values(stepTitles).map((stepTitle, index) => (
              <div 
                key={index}
                className={`flex flex-col items-center gap-1 ${
                  index === currentStep 
                    ? 'text-primary font-medium' 
                    : index < currentStep 
                      ? 'text-accent' 
                      : 'text-muted-foreground'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  index === currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : index < currentStep 
                      ? 'bg-accent text-accent-foreground' 
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <span className="text-center text-xs leading-tight px-1">
                  {stepTitle}
                </span>
              </div>
            ))}
          </div>

          {/* Mobile/tablet compact indicators */}
          <div className="flex xl:hidden justify-center gap-1.5 text-xs overflow-x-auto pb-1">
            {Object.values(stepTitles).map((stepTitle, index) => (
              <div 
                key={index}
                className={`flex items-center gap-1 whitespace-nowrap ${
                  index === currentStep 
                    ? 'text-primary font-medium' 
                    : index < currentStep 
                      ? 'text-accent' 
                      : 'text-muted-foreground'
                }`}
                title={stepTitle}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  index === currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : index < currentStep 
                      ? 'bg-accent text-accent-foreground' 
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                {index === currentStep && (
                  <span className="text-xs">
                    {stepTitle}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Compact main content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground mb-1">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="mb-6">
          {children}
        </div>

        {/* Compact navigation */}
        {showNavigation && (
          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="outline"
              onClick={goPrevious}
              disabled={!canGoPrevious}
              className="flex items-center gap-1.5 px-4 py-2 text-sm"
            >
              <ArrowLeft size={14} />
              Previous
            </Button>

            <Button
              onClick={goNext}
              disabled={!canGoNext}
              className="flex items-center gap-1.5 px-4 py-2 text-sm"
            >
              {nextButtonText || 'Next'}
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}