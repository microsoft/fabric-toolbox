import { Ellipsis, ExternalLink, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "../ui";

export interface RowMenuAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** External destination, opened in a new tab. */
  href?: string;
  disabled?: boolean;
  /** Visible reason announced with a disabled action. */
  disabledReason?: string;
}

/** Space the menu needs below its trigger before it opens upward instead. */
const MENU_FLIP_THRESHOLD_PX = 220;

const ITEM_CLASS =
  "flex min-h-[var(--atlas-touch-target)] w-full items-start gap-s rounded-md px-s py-s text-left text-300 text-popover-foreground outline-none hover:bg-accent focus:bg-accent focus-visible:ring-offset-0 sm:min-h-[var(--atlas-control-height)]";

/**
 * Compact row overflow menu following the WAI-ARIA menu button pattern:
 * arrow keys move between items, Escape closes and restores focus to the
 * trigger, and disabled items stay focusable so their reason is announced.
 */
export function RowActionsMenu({
  label,
  actions,
  className,
}: {
  label: string;
  actions: RowMenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placeAbove, setPlaceAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const buttonId = useId();
  const menuId = useId();

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("mousedown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const openAt = (index: number) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    setPlaceAbove(
      rect != null &&
        window.innerHeight - rect.bottom < MENU_FLIP_THRESHOLD_PX &&
        rect.top > MENU_FLIP_THRESHOLD_PX,
    );
    setActiveIndex(index);
    setOpen(true);
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(actions.length - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = actions.length - 1;
    const move = (index: number) => {
      event.preventDefault();
      setActiveIndex(index);
      itemRefs.current[index]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(activeIndex >= last ? 0 : activeIndex + 1);
        break;
      case "ArrowUp":
        move(activeIndex <= 0 ? last : activeIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(last);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground motion-reduce:transition-none sm:min-h-[var(--atlas-control-height)] sm:min-w-[var(--atlas-control-height)]"
      >
        <Ellipsis className="icon-size-200" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute right-0 z-50 flex w-max min-w-[13rem] max-w-[min(20rem,calc(100vw-2rem))] flex-col rounded-lg border border-border bg-popover p-xs text-left shadow-fabric-8",
            placeAbove ? "bottom-full mb-xs" : "top-full mt-xs",
          )}
        >
          {actions.map((action, index) => {
            const Icon = action.href ? ExternalLink : action.icon;
            const reasonId = action.disabled && action.disabledReason
              ? `${menuId}-${action.id}-reason`
              : undefined;
            const content = (
              <>
                {Icon && (
                  <Icon
                    className="mt-xxs icon-size-200 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0">
                  <span className="block">{action.label}</span>
                  {reasonId && (
                    <span
                      id={reasonId}
                      className="block text-200 leading-200 text-muted-foreground"
                    >
                      {action.disabledReason}
                    </span>
                  )}
                </span>
              </>
            );
            const shared = {
              role: "menuitem" as const,
              tabIndex: -1,
              ref: (element: HTMLElement | null) => {
                itemRefs.current[index] = element;
              },
              onFocus: () => setActiveIndex(index),
              "aria-label": reasonId ? action.label : undefined,
              "aria-describedby": reasonId,
            };
            if (action.href && !action.disabled) {
              return (
                <a
                  key={action.id}
                  {...shared}
                  href={action.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => close(false)}
                  className={ITEM_CLASS}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={action.id}
                {...shared}
                type="button"
                aria-disabled={action.disabled || undefined}
                onClick={() => {
                  if (action.disabled) return;
                  close(true);
                  action.onSelect?.();
                }}
                className={cn(
                  ITEM_CLASS,
                  action.disabled &&
                    "cursor-not-allowed text-muted-foreground hover:bg-transparent",
                )}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
