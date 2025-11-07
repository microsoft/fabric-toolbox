import { useAppContext } from '../contexts/AppContext';

interface WizardNavigationHook {
  canGoPrevious: boolean;
  canGoNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
}

export function useWizardNavigation(): WizardNavigationHook {
  const { state, dispatch } = useAppContext();

  const canGoPrevious = state.currentStep > 0;
  
  const canGoNext = (() => {
    switch (state.currentStep) {
      case 0: // Login
        return state.auth.isAuthenticated;
      case 1: // Workspace Selection
        return state.selectedWorkspace !== null;
      case 2: // Upload
        return state.uploadedFile !== null && state.adfComponents.length > 0;
      case 3: // Validation
        return state.selectedComponents.length > 0;
      case 4: // Mapping
        return state.selectedComponents.every(component => component.fabricTarget);
      case 5: // Deployment
        return state.deploymentResults.length > 0;
      case 6: // Complete
        return false; // Final step
      default:
        return false;
    }
  })();

  const goPrevious = () => {
    if (canGoPrevious) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep - 1 });
    }
  };

  const goNext = () => {
    if (canGoNext) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
    }
  };

  return {
    canGoPrevious,
    canGoNext,
    goPrevious,
    goNext
  };
}