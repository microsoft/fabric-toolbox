import { cn } from "../ui";

/** Labelled on/off switch used in dense toolbars. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  tone = "brand",
  className,
  describedBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tone?: "brand" | "preview";
  className?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-[var(--atlas-touch-target)] items-center gap-s rounded-md px-s text-300 font-semibold text-foreground hover:bg-accent sm:min-h-[var(--atlas-control-height)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-l w-xxxl shrink-0 rounded-full border transition-colors after:absolute after:left-xxs after:top-1/2 after:h-m after:w-m after:-translate-y-1/2 after:rounded-full after:transition-transform",
          checked
            ? tone === "preview"
              ? "border-lineage-upstream bg-lineage-upstream after:translate-x-[12px] after:bg-card"
              : "border-primary bg-primary after:translate-x-[12px] after:bg-primary-foreground"
            : "border-input bg-muted after:bg-muted-foreground",
        )}
      />
      <span className="min-w-0 text-left">{label}</span>
    </button>
  );
}
