/**
 * Basic build and type validation runner
 */

interface ValidationResult {
  component: string;
  status: 'success' | 'error';
  message: string;
}

// Test basic imports and type checking
async function validateImports(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  try {
    // Test auth service
    const { authService } = await import('./services/authService');
    results.push({ component: 'authService', status: 'success', message: 'Import successful' });
    
    // Test fabric service  
    const { fabricService } = await import('./services/fabricService');
    results.push({ component: 'fabricService', status: 'success', message: 'Import successful' });
    
    // Test token utils
    const { validateTokenScopes } = await import('./lib/tokenUtils');
    results.push({ component: 'tokenUtils', status: 'success', message: 'Import successful' });
    
    // Test main App component
    const App = await import('./App');
    results.push({ component: 'App', status: 'success', message: 'Import successful' });
    
    // Test pipeline connection transformer service
    const { PipelineConnectionTransformerService } = await import('./services/pipelineConnectionTransformerService');
    results.push({ component: 'pipelineConnectionTransformerService', status: 'success', message: 'Import successful' });
    
  } catch (error) {
    results.push({ 
      component: 'imports', 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown import error' 
    });
  }
  
  return results;
}

// Test basic functionality
function validateFunctionality(): ValidationResult[] {
  const results: ValidationResult[] = [];
  
  try {
    // Test token utils functions - using dynamic import to avoid issues
    import('./lib/tokenUtils').then(({ extractScopesFromToken, isInsufficientScopesError }) => {
      
      // Test with empty string (safe test)
      try {
        const scopes = extractScopesFromToken('');
        results.push({ component: 'extractScopesFromToken', status: 'success', message: `Extracted ${scopes.length} scopes` });
      } catch (e) {
        results.push({ component: 'extractScopesFromToken', status: 'error', message: 'Function call failed' });
      }
      
      // Test error detection
      const isError = isInsufficientScopesError({ status: 403, message: 'Forbidden' });
      results.push({ component: 'isInsufficientScopesError', status: 'success', message: `Detected error: ${isError}` });
      
    }).catch(() => {
      results.push({ component: 'tokenUtils', status: 'error', message: 'Could not import token utils' });
    });
    
  } catch (error) {
    results.push({ 
      component: 'functionality', 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown functionality error' 
    });
  }
  
  return results;
}

// Run validation
export async function runBuildValidation() {
  console.log('=== Build Validation Started ===');
  
  const importResults = await validateImports();
  const funcResults = validateFunctionality();
  
  const allResults = [...importResults, ...funcResults];
  
  console.log('\n=== Import Results ===');
  importResults.forEach(result => {
    const status = result.status === 'success' ? '✅' : '❌';
    console.log(`${status} ${result.component}: ${result.message}`);
  });
  
  console.log('\n=== Functionality Results ===');
  funcResults.forEach(result => {
    const status = result.status === 'success' ? '✅' : '❌';
    console.log(`${status} ${result.component}: ${result.message}`);
  });
  
  const successCount = allResults.filter(r => r.status === 'success').length;
  const errorCount = allResults.filter(r => r.status === 'error').length;
  
  console.log(`\n=== Summary ===`);
  console.log(`${successCount} successful, ${errorCount} errors`);
  
  return {
    success: errorCount === 0,
    results: allResults,
    summary: { successCount, errorCount }
  };
}