const BUTTON_BASE =
  "inline-flex min-h-[var(--atlas-touch-target)] items-center justify-center gap-s rounded-md px-l text-300 font-semibold transition-colors disabled:opacity-60 sm:min-h-[var(--atlas-control-height)]";

export const PRIMARY_BUTTON = `${BUTTON_BASE} bg-primary text-primary-foreground shadow-fabric-2 hover:bg-primary-hover`;
export const SECONDARY_BUTTON = `${BUTTON_BASE} border border-input bg-card text-foreground hover:bg-accent`;
export const LINK_BUTTON =
  "inline-flex min-h-[var(--atlas-touch-target)] items-center gap-xs rounded-md text-200 font-semibold text-brand-foreground underline-offset-4 hover:underline sm:min-h-0";
