import { RotateCcw, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  validateGovernanceTargets,
  type GovernanceTargets,
} from "../governance-policy";
import { POSTURE_PILLARS, type PosturePillar } from "../posture";
import { Card } from "../ui";

const LABELS: Record<PosturePillar, string> = {
  documentation: "Documentation",
  ownership: "Ownership",
  sensitivity: "Sensitivity",
  access: "Access",
  lineage: "Lineage",
  operations: "Operations",
};

export function GovernancePolicyEditor({
  targets,
  loading,
  error,
  canEdit,
  onRetry,
  onSave,
  onReset,
}: {
  targets: GovernanceTargets;
  loading: boolean;
  error?: string;
  canEdit: boolean;
  onRetry: () => Promise<void>;
  onSave: (targets: GovernanceTargets) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<GovernanceTargets>({ ...targets });
  const [formError, setFormError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setFormError(undefined);
      await onSave(validateGovernanceTargets(draft));
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    }
  };

  if (loading) {
    return (
      <div role="status">
        <Card className="p-l">
          <p className="text-300 text-muted-foreground">
            Loading workspace governance targets...
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert">
        <Card
          className="flex flex-col gap-m border-status-warning/30 bg-status-warning/10 p-l sm:flex-row sm:items-center"
        >
          <p className="min-w-0 flex-1 text-300 text-status-warning">
            Governance targets could not be loaded. {error}
          </p>
          <button
            type="button"
            onClick={() => void onRetry().catch(() => undefined)}
            className="atlas-control inline-flex items-center justify-center gap-s rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent"
          >
            <RotateCcw className="icon-size-100" aria-hidden="true" />
            Retry targets
          </button>
        </Card>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="atlas-row flex flex-col gap-s border-b border-border bg-secondary/55 px-l py-m sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-300 font-semibold">Workspace targets</h3>
          <p className="text-200 text-muted-foreground">
            The standard target is 70% for every pillar. Custom workspace goals
            apply to the live score and historical comparisons.
          </p>
        </div>
        {!canEdit && (
          <span className="text-200 text-muted-foreground">
            Only the configured sync administrator can edit.
          </span>
        )}
      </div>
      <form onSubmit={submit}>
        <div className="grid gap-m p-l sm:grid-cols-2 xl:grid-cols-3">
          {POSTURE_PILLARS.map((pillar) => (
            <label key={pillar} className="grid gap-xs text-200 font-semibold">
              {LABELS[pillar]}
              <span className="flex items-center gap-s">
                <input
                  aria-label={`${LABELS[pillar]} target`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!canEdit || loading}
                  value={draft[pillar]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [pillar]: Number(event.target.value),
                    }))
                  }
                  className="atlas-control min-w-0 flex-1 rounded-lg border border-input bg-card px-m font-numeric disabled:opacity-60"
                />
                <span className="text-muted-foreground">%</span>
              </span>
            </label>
          ))}
        </div>
        {(formError || error) && (
          <p
            role="alert"
            className="border-t border-status-warning/25 bg-status-warning/10 px-l py-s text-200 text-status-warning"
          >
            {formError ?? error}
          </p>
        )}
        {canEdit && (
          <div className="atlas-toolbar flex flex-wrap justify-end gap-s border-t border-border px-l py-m">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setFormError(undefined);
                void onReset().catch((resetError) => {
                  setFormError(
                    resetError instanceof Error
                      ? resetError.message
                      : String(resetError),
                  );
                });
              }}
              className="atlas-control inline-flex items-center gap-s rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent disabled:opacity-50"
            >
              <RotateCcw className="icon-size-100" aria-hidden="true" />
              Restore 70% defaults
            </button>
            <button
              type="submit"
              disabled={loading}
              className="atlas-control inline-flex items-center gap-s rounded-lg bg-primary px-m font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
            >
              <Save className="icon-size-100" aria-hidden="true" />
              Save targets
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}
