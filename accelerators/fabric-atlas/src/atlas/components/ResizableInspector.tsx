import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { GripVertical, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  MAP_INSPECTOR_KEYBOARD_STEP,
  MAP_INSPECTOR_MIN_WIDTH,
  MAP_INSPECTOR_COLLAPSE_SLACK,
  clampMapInspectorWidth,
  mapInspectorMaxWidth,
} from "../map-inspector";
import { cn } from "../ui";

interface ResizableInspectorProps {
  width: number;
  onWidthChange: (width: number) => void;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function ResizableInspector({
  width,
  onWidthChange,
  error,
  children,
  className,
}: ResizableInspectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(() =>
    typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth,
  );
  const [dragWidth, setDragWidth] = useState<number>();
  const [collapsed, setCollapsed] = useState(false);
  const drag = useRef<{
    pointerX: number;
    startWidth: number;
    nextWidth: number;
    collapse?: boolean;
  } | null>(null);
  const effectiveWidth = clampMapInspectorWidth(
    dragWidth ?? width,
    availableWidth,
  );
  const maximumWidth = mapInspectorMaxWidth(availableWidth);

  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    const updateAvailableWidth = () =>
      setAvailableWidth(parent?.clientWidth || window.innerWidth);
    updateAvailableWidth();
    window.addEventListener("resize", updateAvailableWidth);
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateAvailableWidth)
        : undefined;
    if (parent) observer?.observe(parent);
    return () => {
      window.removeEventListener("resize", updateAvailableWidth);
      observer?.disconnect();
    };
  }, []);

  const setClampedWidth = (nextWidth: number) => {
    onWidthChange(clampMapInspectorWidth(nextWidth, availableWidth));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? MAP_INSPECTOR_KEYBOARD_STEP * 3
      : MAP_INSPECTOR_KEYBOARD_STEP;
    let nextWidth: number | undefined;
    if (event.key === "ArrowLeft") nextWidth = effectiveWidth + step;
    if (event.key === "ArrowRight") nextWidth = effectiveWidth - step;
    if (event.key === "Home") nextWidth = MAP_INSPECTOR_MIN_WIDTH;
    if (event.key === "End") nextWidth = maximumWidth;
    if (nextWidth == null) return;
    event.preventDefault();
    setClampedWidth(nextWidth);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      pointerX: event.clientX,
      startWidth: effectiveWidth,
      nextWidth: effectiveWidth,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const rawWidth = drag.current.startWidth + drag.current.pointerX - event.clientX;
    const nextWidth = clampMapInspectorWidth(rawWidth, availableWidth);
    // Dragging well past the minimum width collapses the panel.
    drag.current.collapse = rawWidth < MAP_INSPECTOR_MIN_WIDTH - MAP_INSPECTOR_COLLAPSE_SLACK;
    drag.current.nextWidth = nextWidth;
    setDragWidth(nextWidth);
  };

  const finishPointerResize = () => {
    if (!drag.current) return;
    if (drag.current.collapse) setCollapsed(true);
    else onWidthChange(drag.current.nextWidth);
    drag.current = null;
    setDragWidth(undefined);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    finishPointerResize();
  };

  if (collapsed) {
    return (
      <div
        ref={rootRef}
        className={cn("relative flex min-h-0 w-full shrink-0 flex-col xl:w-[36px]", className)}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show details panel"
          title="Show details panel"
          className="m-xs hidden h-[32px] w-[28px] items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring xl:flex"
        >
          <PanelRightOpen className="icon-size-100" aria-hidden="true" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col xl:hidden">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 w-full shrink-0 flex-col xl:w-[var(--atlas-inspector-width)]",
        className,
      )}
      style={
        {
          "--atlas-inspector-width": `${effectiveWidth}px`,
        } as CSSProperties
      }
    >
      <div
        role="separator"
        aria-label="Resize details inspector"
        aria-orientation="vertical"
        aria-valuemin={MAP_INSPECTOR_MIN_WIDTH}
        aria-valuemax={maximumWidth}
        aria-valuenow={effectiveWidth}
        aria-valuetext={`${effectiveWidth} pixels`}
        tabIndex={0}
        title="Drag to resize. Use Left and Right arrow keys for precise adjustment."
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={finishPointerResize}
        onLostPointerCapture={finishPointerResize}
        className="absolute inset-y-0 left-0 z-30 hidden w-m -translate-x-1/2 touch-none cursor-col-resize items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring xl:flex"
      >
        <span className="flex h-[var(--atlas-touch-target)] w-m items-center justify-center rounded-md border border-border bg-card shadow-fabric-2">
          <GripVertical className="icon-size-100" aria-hidden="true" />
        </span>
      </div>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="Hide details panel"
        title="Hide details panel"
        className="absolute left-0 top-s z-30 hidden h-[28px] w-[22px] -translate-x-1/2 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-fabric-2 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring xl:flex"
      >
        <PanelRightClose className="size-[13px]" aria-hidden="true" />
      </button>
      {error && (
        <div
          role="status"
          className="border-b border-destructive/30 bg-destructive/10 px-l py-s text-200 text-destructive"
        >
          {error}
        </div>
      )}
      {children}
    </div>
  );
}
