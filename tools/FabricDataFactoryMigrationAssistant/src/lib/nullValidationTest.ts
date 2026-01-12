/**
 * Validation tests for null reference fixes
 * This file contains basic tests to verify our null checks work correctly
 */

import { fabricService } from '../services/fabricService';
import { ADFComponent, DeploymentResult } from '../types';

/**
 * Test null/undefined component handling in fabricService
 */
export function testNullComponentHandling(): boolean {
  try {
    // Test with null component
    const result1 = fabricService.generateDeploymentPlan(
      [null as any], 
      'test-workspace', 
      'Test Workspace'
    );
    
    // Should complete without error and have 0 total calls
    if (result1.summary.totalCalls !== 0) {
      console.error('Failed: Should skip null components');
      return false;
    }

    // Test with component missing name
    const invalidComponent: any = {
      type: 'pipeline',
      definition: {},
      isSelected: true,
      compatibilityStatus: 'supported',
      warnings: [],
      fabricTarget: {
        type: 'dataPipeline',
        name: 'TestPipeline'
      }
    };

    const result2 = fabricService.generateDeploymentPlan(
      [invalidComponent], 
      'test-workspace', 
      'Test Workspace'
    );

    // Should complete without error and have 0 total calls
    if (result2.summary.totalCalls !== 0) {
      console.error('Failed: Should skip components without name');
      return false;
    }

    // Test with component missing fabricTarget
    const componentWithoutTarget: ADFComponent = {
      name: 'TestComponent',
      type: 'pipeline',
      definition: {},
      isSelected: true,
      compatibilityStatus: 'supported',
      warnings: []
      // No fabricTarget
    };

    const result3 = fabricService.generateDeploymentPlan(
      [componentWithoutTarget], 
      'test-workspace', 
      'Test Workspace'
    );

    // Should complete without error and have 0 total calls
    if (result3.summary.totalCalls !== 0) {
      console.error('Failed: Should skip components without fabricTarget');
      return false;
    }

    console.log('✅ All null reference tests passed');
    return true;
  } catch (error) {
    console.error('❌ Null reference test failed:', error);
    return false;
  }
}

/**
 * Test invalid input handling in deployment methods
 */
export async function testInvalidInputHandling(): Promise<boolean> {
  try {
    // Test deployment with null component
    const result1 = await fabricService.deployComponent(
      null as any,
      'fake-token',
      'fake-workspace'
    );

    if (result1.status !== 'failed' || !result1.errorMessage?.includes('Invalid input parameters')) {
      console.error('Failed: Should handle null component gracefully');
      return false;
    }

    // Test deployment with component missing name
    const invalidComponent: any = {
      type: 'pipeline',
      definition: {},
      fabricTarget: {
        type: 'dataPipeline',
        name: 'TestPipeline'
      }
    };

    const result2 = await fabricService.deployComponent(
      invalidComponent,
      'fake-token',
      'fake-workspace'
    );

    if (result2.status !== 'failed' || !result2.errorMessage?.includes('name is required')) {
      console.error('Failed: Should handle component without name gracefully');
      return false;
    }

    // Test deployment with missing fabricTarget
    const componentWithoutTarget: any = {
      name: 'TestComponent',
      type: 'pipeline',
      definition: {}
      // No fabricTarget
    };

    const result3 = await fabricService.deployComponent(
      componentWithoutTarget,
      'fake-token',
      'fake-workspace'
    );

    if (result3.status !== 'skipped' || !result3.errorMessage?.includes('No Fabric target defined')) {
      console.error('Failed: Should handle component without fabricTarget gracefully');
      return false;
    }

    console.log('✅ All invalid input tests passed');
    return true;
  } catch (error) {
    console.error('❌ Invalid input test failed:', error);
    return false;
  }
}

/**
 * Run all validation tests
 */
export async function runAllNullValidationTests(): Promise<boolean> {
  console.log('🧪 Running null reference validation tests...');
  
  const test1 = testNullComponentHandling();
  const test2 = await testInvalidInputHandling();
  
  const allPassed = test1 && test2;
  
  if (allPassed) {
    console.log('🎉 All null reference validation tests passed!');
  } else {
    console.log('❌ Some null reference validation tests failed!');
  }
  
  return allPassed;
}