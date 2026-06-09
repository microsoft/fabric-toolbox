import { describe, it, expect, beforeEach } from 'vitest';
import { InvokePipelineService } from '../invokePipelineService';
import { ADFComponent } from '../../types';

describe('InvokePipelineService - Nested ExecutePipeline Detection', () => {
  let service: InvokePipelineService;

  beforeEach(() => {
    service = new InvokePipelineService();
  });

  it('should detect ExecutePipeline in top-level activities (baseline)', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'Execute Child',
                type: 'ExecutePipeline',
                typeProperties: {
                  pipeline: {
                    referenceName: 'ChildPipeline'
                  },
                  waitOnCompletion: true
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child');
  });

  it('should detect ExecutePipeline nested inside ForEach container', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'ForEach Loop',
                type: 'ForEach',
                typeProperties: {
                  items: {
                    value: '@pipeline().parameters.items',
                    type: 'Expression'
                  },
                  activities: [
                    {
                      name: 'Execute Child in Loop',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child in Loop');
  });

  it('should detect ExecutePipeline nested inside IfCondition (ifTrue branch)', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'If Condition',
                type: 'IfCondition',
                typeProperties: {
                  expression: {
                    value: '@equals(1, 1)',
                    type: 'Expression'
                  },
                  ifTrueActivities: [
                    {
                      name: 'Execute Child If True',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ],
                  ifFalseActivities: []
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child If True');
  });

  it('should detect ExecutePipeline nested inside IfCondition (ifFalse branch)', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'If Condition',
                type: 'IfCondition',
                typeProperties: {
                  expression: {
                    value: '@equals(1, 1)',
                    type: 'Expression'
                  },
                  ifTrueActivities: [],
                  ifFalseActivities: [
                    {
                      name: 'Execute Child If False',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child If False');
  });

  it('should detect ExecutePipeline nested inside Until container', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'Until Loop',
                type: 'Until',
                typeProperties: {
                  expression: {
                    value: '@equals(1, 1)',
                    type: 'Expression'
                  },
                  activities: [
                    {
                      name: 'Execute Child in Until',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child in Until');
  });

  it('should detect ExecutePipeline nested inside Switch container (case branch)', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'Switch Activity',
                type: 'Switch',
                typeProperties: {
                  on: {
                    value: '@pipeline().parameters.switchValue',
                    type: 'Expression'
                  },
                  cases: [
                    {
                      value: 'case1',
                      activities: [
                        {
                          name: 'Execute Child in Case',
                          type: 'ExecutePipeline',
                          typeProperties: {
                            pipeline: {
                              referenceName: 'ChildPipeline'
                            },
                            waitOnCompletion: true
                          }
                        }
                      ]
                    }
                  ],
                  defaultActivities: []
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child in Case');
  });

  it('should detect ExecutePipeline nested inside Switch container (default branch)', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'Switch Activity',
                type: 'Switch',
                typeProperties: {
                  on: {
                    value: '@pipeline().parameters.switchValue',
                    type: 'Expression'
                  },
                  cases: [],
                  defaultActivities: [
                    {
                      name: 'Execute Child in Default',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(1);
    expect(references[0].parentPipelineName).toBe('ParentPipeline');
    expect(references[0].targetPipelineName).toBe('ChildPipeline');
    expect(references[0].activityName).toBe('Execute Child in Default');
  });

  it('should calculate correct deployment order for nested ExecutePipeline', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'ForEach Loop',
                type: 'ForEach',
                typeProperties: {
                  items: {
                    value: '@pipeline().parameters.items',
                    type: 'Expression'
                  },
                  activities: [
                    {
                      name: 'Execute Child',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const deploymentOrder = service.calculateDeploymentOrder();

    // Assert
    expect(deploymentOrder).toHaveLength(2);
    
    // Find the deployment order entries
    const childOrder = deploymentOrder.find(o => o.pipelineName === 'ChildPipeline');
    const parentOrder = deploymentOrder.find(o => o.pipelineName === 'ParentPipeline');

    expect(childOrder).toBeDefined();
    expect(parentOrder).toBeDefined();

    // Child should be level 0 (no dependencies)
    expect(childOrder!.level).toBe(0);
    expect(childOrder!.dependsOnPipelines).toEqual([]);

    // Parent should be level 1 (depends on child)
    expect(parentOrder!.level).toBe(1);
    expect(parentOrder!.dependsOnPipelines).toEqual(['ChildPipeline']);

    // Verify deployment order: ChildPipeline before ParentPipeline
    const childIndex = deploymentOrder.indexOf(childOrder!);
    const parentIndex = deploymentOrder.indexOf(parentOrder!);
    expect(childIndex).toBeLessThan(parentIndex);
  });

  it('should handle multiple nested ExecutePipeline activities', () => {
    // Arrange
    const components: ADFComponent[] = [
      {
        name: 'ParentPipeline',
        type: 'pipeline',
        definition: {
          properties: {
            activities: [
              {
                name: 'ForEach Loop',
                type: 'ForEach',
                typeProperties: {
                  items: {
                    value: '@pipeline().parameters.items',
                    type: 'Expression'
                  },
                  activities: [
                    {
                      name: 'Execute Child1',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline1'
                        },
                        waitOnCompletion: true
                      }
                    },
                    {
                      name: 'Execute Child2',
                      type: 'ExecutePipeline',
                      typeProperties: {
                        pipeline: {
                          referenceName: 'ChildPipeline2'
                        },
                        waitOnCompletion: true
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      },
      {
        name: 'ChildPipeline1',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      },
      {
        name: 'ChildPipeline2',
        type: 'pipeline',
        definition: {
          properties: {
            activities: []
          }
        }
      }
    ];

    // Act
    service.parseExecutePipelineActivities(components);
    const references = service.getPipelineReferences();

    // Assert
    expect(references).toHaveLength(2);
    expect(references.map(r => r.targetPipelineName)).toEqual(
      expect.arrayContaining(['ChildPipeline1', 'ChildPipeline2'])
    );
  });
});
