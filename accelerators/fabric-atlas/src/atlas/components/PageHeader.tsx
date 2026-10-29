import { useRef, type ReactNode } from "react";
import { cn } from "../ui";

export function PageHelp({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="shrink-0" onKeyDown={(event) => {
      if (event.key !== "Escape" || !ref.current?.open) return;
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
      event.stopPropagation();
    }}>
      <summary aria-label={`Help: ${title}`} className="atlas-help-trigger flex cursor-pointer list-none items-center justify-center rounded-full border border-border text-200 font-semibold text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        ?
      </summary>
      <div className="atlas-help-popover absolute left-l top-full z-30 mt-s rounded-lg border border-border bg-popover p-m text-200 leading-300 text-popover-foreground shadow-fabric-8">
        {children}
      </div>
    </details>
  );
}

export function PageHeader({
  title, purpose, actions, help, titleId, className,
}: {
  title: string; purpose: ReactNode; actions?: ReactNode; help?: ReactNode;
  titleId?: string; className?: string;
}) {
  return (
    <div data-slot="page-header" className={cn("atlas-page-header relative flex min-w-0 flex-wrap items-center justify-between", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-s">
          <h1 id={titleId} className="min-w-0 break-words font-heading text-500 font-semibold leading-500">{title}</h1>
          {help && <PageHelp title={title}>{help}</PageHelp>}
        </div>
        <p className="mt-xxs text-200 leading-300 text-muted-foreground">{purpose}</p>
      </div>
      {actions && <div className="atlas-toolbar flex max-w-full flex-wrap items-center">{actions}</div>}
    </div>
  );
}
