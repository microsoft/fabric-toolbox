import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

/** Link to a native Fabric or documentation page, always in a new tab. */
export function NativeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-xs text-200 font-semibold text-brand-foreground underline-offset-4 hover:underline sm:min-h-0"
    >
      {children}
      <ExternalLink className="icon-size-100 shrink-0" aria-hidden="true" />{" "}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
