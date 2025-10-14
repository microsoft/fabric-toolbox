/**
 * Loading Skeleton Components
 * 
 * Provides skeleton screens for better UX during profile generation.
 * Prevents layout shift and gives users visual feedback.
 */

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * MetricCardSkeleton - Skeleton for metric overview cards
 */
export function MetricCardSkeleton() {
  return (
    <div className="bg-muted/30 rounded-lg p-4 animate-pulse">
      <div className="h-4 w-24 bg-muted rounded mb-2"></div>
      <div className="h-8 w-16 bg-muted rounded mb-1"></div>
      <div className="h-3 w-32 bg-muted rounded"></div>
    </div>
  );
}

/**
 * MetricsOverviewSkeleton - Skeleton for full metrics overview
 */
export function MetricsOverviewSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 bg-muted rounded animate-pulse"></div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        
        {/* Activity breakdown skeleton */}
        <div className="mt-6 space-y-3 animate-pulse">
          <div className="h-5 w-40 bg-muted rounded"></div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 bg-muted rounded"></div>
              <div className="h-4 flex-1 bg-muted rounded"></div>
              <div className="h-4 w-12 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * TableSkeleton - Skeleton for artifact tables
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* Table header */}
      <div className="flex gap-4 pb-2 border-b animate-pulse">
        <div className="h-4 w-32 bg-muted rounded"></div>
        <div className="h-4 w-24 bg-muted rounded"></div>
        <div className="h-4 w-40 bg-muted rounded"></div>
        <div className="h-4 w-20 bg-muted rounded"></div>
      </div>
      
      {/* Table rows */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 py-3 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded"></div>
          <div className="h-4 w-24 bg-muted rounded"></div>
          <div className="h-4 w-40 bg-muted rounded"></div>
          <div className="h-4 w-20 bg-muted rounded"></div>
        </div>
      ))}
    </div>
  );
}

/**
 * ArtifactTablesSkeleton - Skeleton for tabbed artifact tables
 */
export function ArtifactTablesSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-4"></div>
        
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-24 bg-muted rounded animate-pulse"></div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search bar skeleton */}
        <div className="h-10 w-full bg-muted rounded animate-pulse mb-4"></div>
        
        {/* Table content */}
        <TableSkeleton rows={8} />
      </CardContent>
    </Card>
  );
}

/**
 * GraphSkeleton - Skeleton for dependency graph
 */
export function GraphSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-muted rounded animate-pulse"></div>
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-9 w-9 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Graph area skeleton */}
        <div className="h-[600px] bg-muted/20 rounded-lg animate-pulse relative">
          {/* Simulated nodes */}
          <div className="absolute top-20 left-20 w-16 h-16 bg-muted rounded-full"></div>
          <div className="absolute top-40 right-32 w-12 h-12 bg-muted rounded-full"></div>
          <div className="absolute bottom-24 left-40 w-14 h-14 bg-muted rounded-full"></div>
          <div className="absolute bottom-32 right-24 w-16 h-16 bg-muted rounded-full"></div>
          <div className="absolute top-60 left-1/2 w-12 h-12 bg-muted rounded-full"></div>
          
          {/* Simulated edges */}
          <svg className="absolute inset-0 w-full h-full">
            <line x1="20%" y1="20%" x2="70%" y2="40%" className="stroke-muted" strokeWidth="2" />
            <line x1="40%" y1="70%" x2="75%" y2="60%" className="stroke-muted" strokeWidth="2" />
            <line x1="50%" y1="50%" x2="80%" y2="30%" className="stroke-muted" strokeWidth="2" />
          </svg>
        </div>
        
        {/* Legend skeleton */}
        <div className="mt-4 flex gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-3 bg-muted rounded-full"></div>
              <div className="h-3 w-20 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * InsightsPanelSkeleton - Skeleton for insights panel
 */
export function InsightsPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 bg-muted rounded animate-pulse"></div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 bg-muted/10 rounded-lg animate-pulse">
              <div className="flex items-start gap-3">
                <div className="h-5 w-5 bg-muted rounded-full mt-0.5"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 bg-muted rounded"></div>
                  <div className="h-4 w-full bg-muted rounded"></div>
                  <div className="h-4 w-5/6 bg-muted rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ProfilingDashboardSkeleton - Full dashboard skeleton
 */
export function ProfilingDashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-muted rounded animate-pulse"></div>
              <div className="h-4 w-64 bg-muted rounded animate-pulse"></div>
            </div>
            <div className="h-9 w-32 bg-muted rounded animate-pulse"></div>
          </div>
        </CardHeader>
      </Card>

      {/* Insights skeleton */}
      <InsightsPanelSkeleton />

      {/* Tabs skeleton */}
      <div className="flex gap-2 mb-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-28 bg-muted rounded animate-pulse"></div>
        ))}
      </div>

      {/* Content skeleton (default to metrics) */}
      <MetricsOverviewSkeleton />
    </div>
  );
}
