import React, { useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { authService } from './services/authService';
import { validateAuthState } from './lib/stateValidation';
import { ErrorFallback } from './ErrorFallback';
import { LoginPage } from './components/pages/LoginPage';
import { WorkspacePage } from './components/pages/WorkspacePage';
import { UploadPage } from './components/pages/UploadPage';
import { ManagedIdentityPage } from './components/pages/ManagedIdentityPage';
import { LinkedServiceConnectionPage } from './components/pages/LinkedServiceConnectionPage';
import { DeployConnectionsPage } from './components/pages/DeployConnectionsPage';
import { ValidationPage } from './components/pages/ValidationPage';
import { MappingPage } from './components/pages/MappingPage';
import { DeploymentPage } from './components/pages/DeploymentPage';
import { CompletePage } from './components/pages/CompletePage';

function AppContent() {
  const { state, dispatch } = useAppContext();

  // Load stored auth state on app start
  useEffect(() => {
    try {
      const storedAuth = authService.loadAuthState();
      if (storedAuth && validateAuthState(storedAuth)) {
        dispatch({ type: 'SET_AUTH', payload: storedAuth });
      }
    } catch (error) {
      console.error('Failed to load stored auth state:', error);
      // Continue with default state
    }
  }, [dispatch]);

  const renderCurrentStep = () => {
    // Ensure state exists and has a valid currentStep
    const currentStep = state?.currentStep ?? 0;
    
    // Add safety checks to prevent undefined access
    if (!state) {
      console.error('App state is undefined, rendering login page');
      return <LoginPage />;
    }
    
    switch (currentStep) {
      case 0: // login
        return <LoginPage />;
      case 1: // workspace  
        return <WorkspacePage />;
      case 2: // upload
        return <UploadPage />;
      case 3: // managedIdentity - NEW step comes before connections
        return <ManagedIdentityPage />;
      case 4: // connections (was step 3, now step 4)
        return <LinkedServiceConnectionPage />;
      case 5: // deploy-connections (was step 4, now step 5)
        return <DeployConnectionsPage />;
      case 6: // validation (was step 5, now step 6)
        return <ValidationPage />;
      case 7: // mapping (was step 6, now step 7)
        return <MappingPage />;
      case 8: // deployment (was step 7, now step 8)
        return <DeploymentPage />;
      case 9: // complete (was step 8, now step 9)
        return <CompletePage />;
      default:
        return <LoginPage />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentStep()}
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error('Application Error:', error);
        console.error('Error Info:', errorInfo);
      }}
    >
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;