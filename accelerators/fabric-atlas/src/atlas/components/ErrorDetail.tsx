import { useId, useState } from "react";
import { summarizeError } from "../workspace-sync";
import { cn } from "../ui";
import { LINK_BUTTON } from "./button-styles";

/**
 * Shows a bounded one-line summary of an error and reveals the complete text
 * in place on request, so long upstream messages never stretch their layout.
 */
export function ErrorDetail({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const { summary, truncated } = summarizeError(message);
  return (
    <div className={cn("min-w-0", className)}>
      {!open && <p className="break-words">{summary}</p>}
      {open && (
        <p id={detailId} className="whitespace-pre-wrap break-words">
          {message}
        </p>
      )}
      {truncated && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
          className={LINK_BUTTON}
        >
          {open ? "Hide full error" : "Show full error"}
        </button>
      )}
    </div>
  );
}
