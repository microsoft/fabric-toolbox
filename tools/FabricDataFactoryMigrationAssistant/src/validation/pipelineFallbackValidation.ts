import { pipelineFallbackService } from '../services/pipelineFallbackService';

/**
 * Test suite for pipeline fallback lookup functionality
 */
export class PipelineFallbackValidationTest {

  /**
   * Test basic pipeline existence checking
   */
  static async testPipelineExistenceCheck() {
    console.log('Testing pipeline existence check...');
    
    try {
      const result = await pipelineFallbackService.checkPipelineExists(
        'TestPipeline',
        'test-workspace-id',
        'test-access-token'
      );
      
      console.log('Pipeline existence check result:', result);
      return result.found !== undefined && result.error === undefined;
    } catch (error) {
      console.error('Pipeline existence check failed:', error);
      return false;
    }
  }

  /**
   * Test pipeline reference resolution
   */
  static async testPipelineReferenceResolution() {
    console.log('Testing pipeline reference resolution...');
    
    try {
      const pipelineId = await pipelineFallbackService.resolvePipelineReference(
        'TargetPipeline',
        'test-workspace-id',
        'test-access-token'
      );
      
      console.log('Pipeline reference resolution result:', pipelineId);
      return typeof pipelineId === 'string' || pipelineId === null;
    } catch (error) {
      console.error('Pipeline reference resolution failed:', error);
      return false;
    }
  }

  /**
   * Test cache functionality
   */
  static testCacheManagement() {
    console.log('Testing cache management...');
    
    try {
      const initialStats = pipelineFallbackService.getCacheStats();
      console.log('Initial cache stats:', initialStats);
      
      pipelineFallbackService.clearCache();
      
      const clearedStats = pipelineFallbackService.getCacheStats();
      console.log('Cleared cache stats:', clearedStats);
      
      return clearedStats.size === 0;
    } catch (error) {
      console.error('Cache management test failed:', error);
      return false;
    }
  }

  /**
   * Test batch validation functionality
   */
  static async testBatchValidation() {
    console.log('Testing batch validation...');
    
    try {
      const pipelineIds = ['pipeline-1-id', 'pipeline-2-id', 'pipeline-3-id'];
      const results = await pipelineFallbackService.batchValidatePipelines(
        'test-workspace-id',
        pipelineIds,
        'test-access-token'
      );
      
      console.log('Batch validation results:', results);
      
      // Check that we get a result for each pipeline ID
      const hasAllResults = pipelineIds.every(id => results.hasOwnProperty(id));
      const allResultsAreBoolean = Object.values(results).every(result => typeof result === 'boolean');
      
      return hasAllResults && allResultsAreBoolean;
    } catch (error) {
      console.error('Batch validation test failed:', error);
      return false;
    }
  }

  /**
   * Test error handling
   */
  static async testErrorHandling() {
    console.log('Testing error handling...');
    
    try {
      // Test with invalid inputs
      const result1 = await pipelineFallbackService.checkPipelineExists('', '', '');
      console.log('Empty inputs result:', result1);
      
      const result2 = await pipelineFallbackService.resolvePipelineReference('', '', '');
      console.log('Empty pipeline reference result:', result2);
      
      // Both should handle errors gracefully
      return result1.found === false && result2 === null;
    } catch (error) {
      console.error('Error handling test failed:', error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  static async runAllTests() {
    console.log('=== Pipeline Fallback Service Validation ===');
    
    const tests = [
      { name: 'Pipeline Existence Check', test: this.testPipelineExistenceCheck },
      { name: 'Pipeline Reference Resolution', test: this.testPipelineReferenceResolution },
      { name: 'Cache Management', test: this.testCacheManagement },
      { name: 'Batch Validation', test: this.testBatchValidation },
      { name: 'Error Handling', test: this.testErrorHandling }
    ];

    const results: Array<{ name: string; passed: boolean }> = [];
    
    for (const { name, test } of tests) {
      console.log(`\n--- Running ${name} Test ---`);
      try {
        const passed = await test();
        results.push({ name, passed });
        console.log(`${name}: ${passed ? 'PASSED' : 'FAILED'}`);
      } catch (error) {
        console.error(`${name}: ERROR -`, error);
        results.push({ name, passed: false });
      }
    }

    console.log('\n=== Test Summary ===');
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    
    results.forEach(({ name, passed }) => {
      console.log(`${passed ? '✅' : '❌'} ${name}`);
    });
    
    console.log(`\nOverall: ${passedCount}/${totalCount} tests passed`);
    
    return {
      total: totalCount,
      passed: passedCount,
      failed: totalCount - passedCount,
      results
    };
  }
}

// Export for external usage
export const pipelineFallbackValidation = PipelineFallbackValidationTest;