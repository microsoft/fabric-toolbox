/**
 * Graph Optimization Utilities
 * 
 * Performance optimizations for large dependency graphs (2000+ nodes)
 */

import { GraphNode, GraphEdge } from '@/types/profiling';

/**
 * Viewport culling - returns only nodes visible in current viewport
 * @param nodes All graph nodes
 * @param transform Current D3 zoom transform
 * @param width Viewport width
 * @param height Viewport height
 * @param buffer Buffer zone in pixels (nodes rendered slightly outside viewport for smooth panning)
 */
export function getVisibleNodes(
  nodes: GraphNode[],
  transform: { x: number; y: number; k: number },
  width: number,
  height: number,
  buffer: number = 100
): GraphNode[] {
  const { x, y, k } = transform;
  
  // Calculate viewport bounds in graph coordinates
  const viewBounds = {
    left: -x / k - buffer,
    right: (width - x) / k + buffer,
    top: -y / k - buffer,
    bottom: (height - y) / k + buffer
  };
  
  return nodes.filter(node => {
    const nodeX = (node as any).x || 0;
    const nodeY = (node as any).y || 0;
    
    return (
      nodeX >= viewBounds.left &&
      nodeX <= viewBounds.right &&
      nodeY >= viewBounds.top &&
      nodeY <= viewBounds.bottom
    );
  });
}

/**
 * Get visible edges (both endpoints must be visible)
 * @param edges All graph edges
 * @param visibleNodes Currently visible nodes
 */
export function getVisibleEdges(
  edges: GraphEdge[],
  visibleNodes: GraphNode[]
): GraphEdge[] {
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  
  return edges.filter(edge => {
    const sourceId = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
    const targetId = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;
    
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });
}

/**
 * FPS counter utility
 */
export function updateFPS(
  fpsCounter: { frames: number; lastTime: number },
  callback: (fps: number) => void
) {
  fpsCounter.frames++;
  const now = performance.now();
  
  if (now >= fpsCounter.lastTime + 1000) {
    const fps = Math.round((fpsCounter.frames * 1000) / (now - fpsCounter.lastTime));
    callback(fps);
    fpsCounter.frames = 0;
    fpsCounter.lastTime = now;
  }
}

/**
 * Color scheme by component type
 */
export const COLOR_MAP: Record<string, string> = {
  pipeline: '#464feb',
  dataset: '#10b981',
  linkedService: '#f59e0b',
  trigger: '#8b5cf6',
  dataflow: '#06b6d4',
  default: '#6b7280'
};

/**
 * Get node color
 */
export function getNodeColor(type: string): string {
  return COLOR_MAP[type] || COLOR_MAP.default;
}

/**
 * Canvas rendering utilities
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.ctx = canvas.getContext('2d')!;
    this.width = width;
    this.height = height;
    this.dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    canvas.width = width * this.dpr;
    canvas.height = height * this.dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  drawEdge(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    opacity: number = 0.6
  ) {
    this.ctx.beginPath();
    this.ctx.moveTo(sourceX, sourceY);
    this.ctx.lineTo(targetX, targetY);
    this.ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
    const arrowLength = 10;
    const arrowWidth = 5;

    // Calculate arrowhead position (at edge of target node)
    const nodeRadius = 20;
    const arrowX = targetX - Math.cos(angle) * nodeRadius;
    const arrowY = targetY - Math.sin(angle) * nodeRadius;

    this.ctx.beginPath();
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fillStyle = `rgba(148, 163, 184, ${opacity})`;
    this.ctx.fill();
  }

  drawNode(x: number, y: number, radius: number, color: string, label: string) {
    // Draw circle
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Draw label
    this.ctx.fillStyle = 'currentColor';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(label.substring(0, 10), x, y + radius + 5);
  }

  drawHighlight(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }
}

/**
 * Find node at given coordinates (for mouse interaction)
 */
export function findNodeAt(
  nodes: GraphNode[],
  x: number,
  y: number,
  radius: number = 20
): GraphNode | null {
  for (const node of nodes) {
    const nodeX = (node as any).x || 0;
    const nodeY = (node as any).y || 0;
    const distance = Math.sqrt((x - nodeX) ** 2 + (y - nodeY) ** 2);
    
    if (distance <= radius) {
      return node;
    }
  }
  
  return null;
}
