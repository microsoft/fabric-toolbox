import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ProfileInsight } from '@/types/profiling';
import { Info, Warning, XCircle, Lightbulb } from '@phosphor-icons/react';

interface InsightsPanelProps {
  insights: ProfileInsight[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  if (insights.length === 0) {
    return null;
  }

  const getSeverityConfig = (severity: ProfileInsight['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          icon: XCircle,
          variant: 'destructive' as const,
          bgColor: 'bg-destructive/10',
          borderColor: 'border-destructive/20',
          textColor: 'text-destructive',
          badgeVariant: 'destructive' as const
        };
      case 'warning':
        return {
          icon: Warning,
          variant: 'default' as const,
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning/20',
          textColor: 'text-warning',
          badgeVariant: 'default' as const
        };
      case 'info':
      default:
        return {
          icon: Info,
          variant: 'default' as const,
          bgColor: 'bg-accent/10',
          borderColor: 'border-accent/20',
          textColor: 'text-accent',
          badgeVariant: 'secondary' as const
        };
    }
  };

  // Group insights by severity
  const criticalInsights = insights.filter(i => i.severity === 'critical');
  const warningInsights = insights.filter(i => i.severity === 'warning');
  const infoInsights = insights.filter(i => i.severity === 'info');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb size={18} className="text-accent" weight="duotone" />
            Key Insights & Recommendations
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalInsights.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalInsights.length} Critical
              </Badge>
            )}
            {warningInsights.length > 0 && (
              <Badge variant="default" className="text-xs">
                {warningInsights.length} Warnings
              </Badge>
            )}
            {infoInsights.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {infoInsights.length} Info
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight) => {
            const config = getSeverityConfig(insight.severity);
            const Icon = config.icon;

            return (
              <Alert
                key={insight.id}
                variant={config.variant}
                className={`${config.bgColor} ${config.borderColor} h-full [&>*]:col-start-1`}
              >
                {/* Override Alert's grid to use full width */}
                <div className="col-start-1 col-span-2 space-y-2 w-full">
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-foreground leading-tight">
                          {insight.icon} {insight.title}
                        </h4>
                        <Badge variant={config.badgeVariant} className="text-xs flex-shrink-0">
                          {insight.severity}
                        </Badge>
                      </div>
                    </div>
                    {insight.metric !== undefined && (
                      <div className={`text-lg font-bold ${config.textColor} flex-shrink-0`}>
                        {insight.metric}
                      </div>
                    )}
                  </div>
                  <AlertDescription className="text-sm text-muted-foreground leading-relaxed w-full">
                    {insight.description}
                  </AlertDescription>
                  {insight.recommendation && (
                    <div className="p-2 bg-accent/5 rounded border border-accent/10 w-full">
                      <div className="flex items-start gap-2">
                        <Lightbulb size={12} className="text-accent mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-foreground leading-relaxed flex-1">
                          <span className="font-semibold">Recommendation:</span>{' '}
                          {insight.recommendation}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            </Alert>
          );
        })}
        </div>
      </CardContent>
    </Card>
  );
}
