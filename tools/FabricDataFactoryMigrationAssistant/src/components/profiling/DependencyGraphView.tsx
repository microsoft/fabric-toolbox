/**
 * Enhanced Dependency Graph View Component - Phase 5 Implementation
 * 
 * Performance features for 2000+ nodes:
 * - Canvas rendering for large graphs (500+ nodes)
 * - Viewport culling (only renders visible nodes)
 * - Optimized force simulation
 * - Fullscreen mode
 * - FPS monitoring
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOut,
  ArrowsIn,
  Lightning,
  Network
} from '@phosphor-icons/react';
import { DependencyGraph, GraphNode } from '@/types/profiling';
import {
  getVisibleNodes,
  getVisibleEdges,
  updateFPS,
  getNodeColor,
  CanvasRenderer,
  findNodeAt
} from '@/utils/graphOptimization';

interface DependencyGraphViewProps {
  dependencies: DependencyGraph;
}

export function DependencyGraphView({ dependencies }: DependencyGraphViewProps) {
  // Add null safety check FIRST, before any other code
  if (!dependencies || !dependencies.nodes || dependencies.nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dependency Graph</CardTitle>
          <CardDescription>No dependencies found</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96 text-muted-foreground">
          <div className="text-center space-y-2">
            <Network size={48} className="mx-auto opacity-50" />
            <p>This ARM template has no detectable dependencies between components</p>
            <p className="text-sm">Components exist in isolation without references</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<any>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fps, setFps] = useState(0);
  
  // Determine render mode based on node count
  const useCanvas = dependencies.nodes.length > 500;
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });
  
  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);
  
  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const element = useCanvas ? canvasRef.current : svgRef.current;
    if (!element) return;
    d3.select(element).transition().duration(300).call(
      d3.zoom<any, any>().scaleBy as any, 1.3
    );
  }, [useCanvas]);
  
  const handleZoomOut = useCallback(() => {
    const element = useCanvas ? canvasRef.current : svgRef.current;
    if (!element) return;
    d3.select(element).transition().duration(300).call(
      d3.zoom<any, any>().scaleBy as any, 0.7
    );
  }, [useCanvas]);
  
  const handleResetZoom = useCallback(() => {
    const element = useCanvas ? canvasRef.current : svgRef.current;
    if (!element) return;
    d3.select(element).transition().duration(300).call(
      d3.zoom<any, any>().transform as any, d3.zoomIdentity
    );
  }, [useCanvas]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case '+':
        case '=':
          handleZoomIn();
          e.preventDefault();
          break;
        case '-':
        case '_':
          handleZoomOut();
          e.preventDefault();
          break;
        case '0':
          handleResetZoom();
          e.preventDefault();
          break;
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false);
            e.preventDefault();
          }
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            handleToggleFullscreen();
            e.preventDefault();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFullscreen, handleToggleFullscreen, handleZoomIn, handleZoomOut, handleResetZoom]);
  
  // Main rendering effect
  useEffect(() => {
    if (!containerRef.current || dependencies.nodes.length === 0) return;
    
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = isFullscreen ? window.innerHeight - 100 : Math.max(800, window.innerHeight - 300);
    
    // Clean up previous
    if (simulationRef.current) {
      simulationRef.current.stop();
    }
    
    if (useCanvas) {
      renderWithCanvas(width, height);
    } else {
      renderWithSVG(width, height);
    }
    
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [dependencies, useCanvas, isFullscreen]);
  
  // Canvas rendering for large graphs
  function renderWithCanvas(width: number, height: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const renderer = new CanvasRenderer(canvas, width, height);
    const context = canvas.getContext('2d')!;
    
    // Create optimized force simulation
    const simulation = d3.forceSimulation(dependencies.nodes as any)
      .force('link', d3.forceLink(dependencies.edges)
        .id((d: any) => d.id)
        .distance(150)
        .iterations(1)) // Reduce iterations for performance
      .force('charge', d3.forceManyBody()
        .strength(-300)
        .theta(0.9)) // Barnes-Hut approximation
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(60))
      .alphaMin(0.001)
      .velocityDecay(0.4);
    
    simulationRef.current = simulation;
    
    // Zoom and pan
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
        render();
      });
    
    d3.select(canvas).call(zoom as any);
    
    // Mouse interaction
    d3.select(canvas).on('click', (event) => {
      const [mouseX, mouseY] = d3.pointer(event);
      const transform = transformRef.current;
      
      // Convert screen coordinates to graph coordinates
      const graphX = (mouseX - transform.x) / transform.k;
      const graphY = (mouseY - transform.y) / transform.k;
      
      const node = findNodeAt(dependencies.nodes, graphX, graphY);
      setSelectedNode(node);
    });
    
    // Render function with viewport culling
    function render() {
      renderer.clear();
      
      const transform = transformRef.current;
      context.save();
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);
      
      // Get visible nodes/edges
      const visibleNodes = getVisibleNodes(dependencies.nodes, transform, width, height, 200);
      const visibleEdges = getVisibleEdges(dependencies.edges, visibleNodes);
      
      // Draw edges
      visibleEdges.forEach((edge: any) => {
        const source = edge.source;
        const target = edge.target;
        renderer.drawEdge(source.x, source.y, target.x, target.y);
      });
      
      // Draw nodes
      visibleNodes.forEach((node: any) => {
        const color = getNodeColor(node.type);
        renderer.drawNode(node.x, node.y, 20, color, node.label);
        
        // Highlight selected node
        if (selectedNode && node.id === selectedNode.id) {
          renderer.drawHighlight(node.x, node.y, 20);
        }
      });
      
      context.restore();
      
      // Update FPS
      updateFPS(fpsCounterRef.current, setFps);
    }
    
    // Drag behavior
    const drag = d3.drag<HTMLCanvasElement, unknown>()
      .subject(() => {
        const [mouseX, mouseY] = d3.pointer(event, canvas);
        const transform = transformRef.current;
        const graphX = (mouseX - transform.x) / transform.k;
        const graphY = (mouseY - transform.y) / transform.k;
        return findNodeAt(dependencies.nodes, graphX, graphY);
      })
      .on('start', (event) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on('end', (event) => {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      });
    
    d3.select(canvas).call(drag as any);
    
    // Animation loop
    simulation.on('tick', render);
  }
  
  // SVG rendering for smaller graphs
  function renderWithSVG(width: number, height: number) {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    svg.attr('width', width).attr('height', height);
    
    const g = svg.append('g');
    
    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoomLevel(event.transform.k);
      });
    
    svg.call(zoom as any);
    
    // Create force simulation
    const simulation = d3.forceSimulation(dependencies.nodes as any)
      .force('link', d3.forceLink(dependencies.edges)
        .id((d: any) => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(60));
    
    simulationRef.current = simulation;
    
    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#94a3b8');
    
    // Draw edges
    const links = g.append('g')
      .selectAll('line')
      .data(dependencies.edges)
      .enter()
      .append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)');
    
    // Draw nodes
    const nodes = g.append('g')
      .selectAll('g')
      .data(dependencies.nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);
    
    nodes.append('circle')
      .attr('r', 20)
      .attr('fill', (d: any) => getNodeColor(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);
    
    nodes.append('text')
      .text((d: any) => d.label.substring(0, 10))
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .attr('font-size', '11px')
      .attr('fill', 'currentColor');
    
    nodes.on('click', (event, d: any) => {
      setSelectedNode(d);
    });
    
    simulation.on('tick', () => {
      links
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      
      nodes.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  }
  
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : ''}`}>
      {/* Graph Visualization */}
      <Card className={`lg:col-span-2 ${isFullscreen ? 'h-full' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Dependency Graph
                {useCanvas && (
                  <Badge variant="outline" className="text-xs">
                    <Lightning size={12} className="mr-1" />
                    Canvas Mode
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {dependencies.nodes.length} nodes • {dependencies.edges.length} edges •
                Zoom: {(zoomLevel * 100).toFixed(0)}%
                {useCanvas && fps > 0 && ` • ${fps} FPS`}
                <span className="ml-2 text-muted-foreground">
                  (Shortcuts: <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">+/-</kbd> zoom,
                  <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">0</kbd> reset,
                  <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F</kbd> fullscreen)
                </span>
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In (+)">
                <MagnifyingGlassPlus size={16} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out (-)">
                <MagnifyingGlassMinus size={16} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetZoom} title="Reset (0)">
                <ArrowsOut size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen (ESC)" : "Enter Fullscreen (F)"}
              >
                {isFullscreen ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isFullscreen ? 'h-[calc(100%-5rem)]' : ''}>
          <div ref={containerRef} className="w-full h-full">
            {useCanvas ? (
              <canvas
                ref={canvasRef}
                className="w-full border rounded-lg bg-muted/20 cursor-move"
              />
            ) : (
              <svg
                ref={svgRef}
                className="w-full border rounded-lg bg-muted/20"
              />
            )}
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4">
            {[
              { type: 'pipeline', label: 'Pipeline', color: '#464feb' },
              { type: 'dataset', label: 'Dataset', color: '#10b981' },
              { type: 'linkedService', label: 'Linked Service', color: '#f59e0b' },
              { type: 'trigger', label: 'Trigger', color: '#8b5cf6' },
              { type: 'dataflow', label: 'Dataflow', color: '#06b6d4' }
            ].map(({ type, label, color }) => (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Node Details Panel */}
      <Card className={isFullscreen ? 'h-full overflow-y-auto' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Node Details</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <Badge className="mb-2 capitalize">{selectedNode.type}</Badge>
                <h4 className="font-semibold text-sm break-words">{selectedNode.label}</h4>
              </div>
              
              {selectedNode.metadata?.activityCount && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Activities:</span>
                  <span className="ml-2 font-medium">{selectedNode.metadata.activityCount}</span>
                </div>
              )}
              
              {selectedNode.metadata?.usageCount !== undefined && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Usage Count:</span>
                  <span className="ml-2 font-medium">{selectedNode.metadata.usageCount}</span>
                </div>
              )}

              {selectedNode.metadata?.folder && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Folder:</span>
                  <span className="ml-2 font-medium text-xs">{selectedNode.metadata.folder}</span>
                </div>
              )}
              
              {selectedNode.fabricTarget && (
                <div className="mt-3 p-2 bg-accent/10 rounded">
                  <div className="text-xs font-medium text-accent mb-1">
                    Fabric Mapping
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedNode.fabricTarget}
                  </div>
                </div>
              )}
              
              {selectedNode.criticality && (
                <Badge variant={
                  selectedNode.criticality === 'high' ? 'destructive' :
                  selectedNode.criticality === 'medium' ? 'default' : 'secondary'
                }>
                  {selectedNode.criticality} criticality
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click on a node in the graph to view details
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
