import { describe, it, expect } from 'vitest';
import { PipelineConnectionTransformerService } from '../pipelineConnectionTransformerService';

describe('PipelineConnectionTransformerService.cleanPipelineForFabric', () => {
  it('should remove IntegrationRuntimeReference from connectVia', () => {
    const pipeline = {
      properties: {
        activities: [
          {
            name: 'CopyActivity1',
            type: 'Copy',
            connectVia: {
              referenceName: 'AutoResolveIntegrationRuntime',
              type: 'IntegrationRuntimeReference'
            }
          }
        ]
      }
    };

    const cleaned = PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    expect(cleaned.properties.activities[0].connectVia).toEqual({});
  });

  it('should remove linkedServiceName and linkedService properties', () => {
    const pipeline = {
      properties: {
        activities: [
          {
            name: 'CopyActivity1',
            type: 'Copy',
            linkedServiceName: 'MyLinkedService',
            linkedService: {
              referenceName: 'MyLinkedService',
              type: 'LinkedServiceReference'
            }
          }
        ]
      }
    };

    const cleaned = PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    expect(cleaned.properties.activities[0]).not.toHaveProperty('linkedServiceName');
    expect(cleaned.properties.activities[0]).not.toHaveProperty('linkedService');
  });

  it('should preserve other activity properties', () => {
    const pipeline = {
      properties: {
        activities: [
          {
            name: 'CopyActivity1',
            type: 'Copy',
            typeProperties: {
              source: { type: 'BlobSource' },
              sink: { type: 'BlobSink' }
            },
            inputs: [{ referenceName: 'InputDataset' }],
            outputs: [{ referenceName: 'OutputDataset' }],
            connectVia: {
              referenceName: 'AutoResolveIntegrationRuntime',
              type: 'IntegrationRuntimeReference'
            },
            linkedServiceName: 'MyLinkedService'
          }
        ]
      }
    };

    const cleaned = PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    const activity = cleaned.properties.activities[0];
    expect(activity.name).toBe('CopyActivity1');
    expect(activity.type).toBe('Copy');
    expect(activity.typeProperties).toEqual({
      source: { type: 'BlobSource' },
      sink: { type: 'BlobSink' }
    });
    expect(activity.inputs).toEqual([{ referenceName: 'InputDataset' }]);
    expect(activity.outputs).toEqual([{ referenceName: 'OutputDataset' }]);
    expect(activity.connectVia).toEqual({});
    expect(activity).not.toHaveProperty('linkedServiceName');
  });

  it('should handle pipelines without activities', () => {
    const pipeline = {
      properties: {
        parameters: {},
        variables: {}
      }
    };

    const cleaned = PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    expect(cleaned).toEqual(pipeline);
  });

  it('should handle null or undefined input', () => {
    expect(PipelineConnectionTransformerService.cleanPipelineForFabric(null)).toBe(null);
    expect(PipelineConnectionTransformerService.cleanPipelineForFabric(undefined)).toBe(undefined);
  });

  it('should not mutate the original pipeline definition', () => {
    const pipeline = {
      properties: {
        activities: [
          {
            name: 'CopyActivity1',
            type: 'Copy',
            connectVia: {
              referenceName: 'AutoResolveIntegrationRuntime',
              type: 'IntegrationRuntimeReference'
            }
          }
        ]
      }
    };

    const originalConnectVia = pipeline.properties.activities[0].connectVia;
    PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    // Original should be unchanged
    expect(pipeline.properties.activities[0].connectVia).toBe(originalConnectVia);
    expect(pipeline.properties.activities[0].connectVia.type).toBe('IntegrationRuntimeReference');
  });

  it('should handle multiple activities with different properties', () => {
    const pipeline = {
      properties: {
        activities: [
          {
            name: 'CopyActivity1',
            type: 'Copy',
            connectVia: {
              referenceName: 'AutoResolveIntegrationRuntime',
              type: 'IntegrationRuntimeReference'
            },
            linkedServiceName: 'Service1'
          },
          {
            name: 'WebActivity1',
            type: 'WebActivity',
            connectVia: {},
            linkedService: { referenceName: 'Service2' }
          },
          {
            name: 'LookupActivity1',
            type: 'Lookup'
          }
        ]
      }
    };

    const cleaned = PipelineConnectionTransformerService.cleanPipelineForFabric(pipeline);

    expect(cleaned.properties.activities[0].connectVia).toEqual({});
    expect(cleaned.properties.activities[0]).not.toHaveProperty('linkedServiceName');
    
    expect(cleaned.properties.activities[1].connectVia).toEqual({});
    expect(cleaned.properties.activities[1]).not.toHaveProperty('linkedService');
    
    expect(cleaned.properties.activities[2].name).toBe('LookupActivity1');
  });
});
