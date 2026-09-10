import * as Dialog from "@radix-ui/react-dialog";
import { CalendarClock, ShieldCheck, Trash2, X } from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  governanceExceptionStatus,
  type GovernanceException,
} from "../governance-exceptions";
import { cn } from "../ui";

function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function nextDay(): string {
  return localDateTime(new Date(Date.now() + 86_400_000).toISOString());
}

function useLiveExceptionStatus(
  exception: GovernanceException | undefined,
) {
  const expiresAt = exception ? Date.parse(exception.expiresAt) : Number.NaN;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!Number.isFinite(expiresAt)) return () => undefined;
      let timer: number | undefined;
      const schedule = () => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          notify();
          return;
        }
        timer = window.setTimeout(
          schedule,
          Math.min(remaining + 10, 60_000),
        );
      };
      schedule();
      return () => {
        if (timer != null) window.clearTimeout(timer);
      };
    },
    [expiresAt],
  );
  const getSnapshot = useCallback(
    () => Number.isFinite(expiresAt) && Date.now() >= expiresAt,
    [expiresAt],
  );
  const expired = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!exception) return undefined;
  if (!Number.isFinite(expiresAt)) return "invalid";
  return expired
    ? "expired"
    : governanceExceptionStatus(exception, expiresAt - 1);
}

export function GovernanceExceptionControl({
  findingId,
  findingTitle,
  exception,
  canEdit,
  loading,
  pending,
  onSave,
  onRemove,
}: {
  findingId: string;
  findingTitle: string;
  exception?: GovernanceException;
  canEdit: boolean;
  loading: boolean;
  pending: boolean;
  onSave: (input: {
    findingId: string;
    reason: string;
    expiresAt: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(exception?.reason ?? "");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string>();
  const status = useLiveExceptionStatus(exception);

  const statusLabel = useMemo(() => {
    if (status === "active") return "Active exception";
    if (status === "expired") return "Expired exception";
    if (status === "invalid") return "Invalid exception";
    return undefined;
  }, [status]);

  if (!canEdit && !exception) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setError(undefined);
      const parsedExpiry = new Date(expiresAt);
      if (!Number.isFinite(parsedExpiry.valueOf())) {
        throw new Error("Enter a valid exception expiry.");
      }
      await onSave({
        findingId,
        reason,
        expiresAt: parsedExpiry.toISOString(),
      });
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setReason(exception?.reason ?? "");
          setExpiresAt(
            exception ? localDateTime(exception.expiresAt) : nextDay(),
          );
          setError(undefined);
        }
        setOpen(nextOpen);
      }}
    >
      <div className="flex flex-wrap items-center gap-s">
        {statusLabel && (
          <span
            className={cn(
              "rounded-md border px-s py-xxs text-100 font-semibold",
              status === "active"
                ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                : status === "expired"
                  ? "border-border bg-secondary text-muted-foreground"
                  : "border-status-failing/30 bg-status-failing/10 text-status-failing",
            )}
          >
            {statusLabel}
          </span>
        )}
        <Dialog.Trigger asChild>
          <button
            type="button"
            disabled={loading || pending}
            className="atlas-control inline-flex items-center gap-s rounded-lg border border-border px-m font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <CalendarClock className="icon-size-100" aria-hidden="true" />
            {exception ? "Review exception" : "Add exception"}
          </button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/55" />
        <div className="pointer-events-none fixed inset-0 z-[111] flex items-center justify-center p-m">
          <Dialog.Content className="pointer-events-auto w-full max-w-xl rounded-xl border border-border bg-card shadow-fabric-16">
            <header className="atlas-page-header flex items-start gap-m border-b border-border">
              <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
                <ShieldCheck className="icon-size-200" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-400 font-semibold">
                  Governance exception
                </Dialog.Title>
                <Dialog.Description className="mt-xs text-200 text-muted-foreground">
                  {findingTitle}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close governance exception"
                  className="atlas-control rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="icon-size-200" />
                </button>
              </Dialog.Close>
            </header>

            <form onSubmit={submit} className="grid gap-m p-l">
              {exception && (
                <div className="rounded-lg bg-secondary px-m py-s text-200 text-muted-foreground">
                  {statusLabel}. Recorded by {exception.authorName} and expires{" "}
                  {new Date(exception.expiresAt).toLocaleString()}.
                </div>
              )}
              <label className="grid gap-xs text-200 font-semibold">
                Justification
                <textarea
                  required
                  maxLength={2000}
                  disabled={!canEdit || pending}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="atlas-control min-h-28 resize-y rounded-lg border border-input bg-card px-m text-300 disabled:opacity-60"
                />
              </label>
              <label className="grid gap-xs text-200 font-semibold">
                Expires
                <input
                  required
                  type="datetime-local"
                  disabled={!canEdit || pending}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className="atlas-control rounded-lg border border-input bg-card px-m disabled:opacity-60"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-m py-s text-200 text-status-warning"
                >
                  {error}
                </p>
              )}
              <div className="atlas-toolbar flex flex-wrap justify-end gap-s border-t border-border pt-m">
                {canEdit && exception && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void onRemove(exception.id)
                        .then(() => setOpen(false))
                        .catch((removeError) =>
                          setError(
                            removeError instanceof Error
                              ? removeError.message
                              : String(removeError),
                          ),
                        )
                    }
                    className="atlas-control mr-auto inline-flex items-center gap-s rounded-lg border border-status-failing/30 px-m font-semibold text-status-failing hover:bg-status-failing/10 disabled:opacity-50"
                  >
                    <Trash2 className="icon-size-100" aria-hidden="true" />
                    Remove exception
                  </button>
                )}
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="atlas-control rounded-lg border border-border px-m font-semibold hover:bg-accent"
                  >
                    Close
                  </button>
                </Dialog.Close>
                {canEdit && (
                  <button
                    type="submit"
                    disabled={pending}
                    className="atlas-control rounded-lg bg-primary px-m font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                  >
                    {exception ? "Update exception" : "Save exception"}
                  </button>
                )}
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
