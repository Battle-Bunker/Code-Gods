/**
 * An object's detail as an overlay, wherever the object appears (production's hover view: lib/object-views views.tsx
 * GridView on `main`, made generic): pointing at it with a mouse opens it after a moment and leaving closes it; a click
 * pins it open, or toggles it; on touch a tap opens and closes it. The content is the One line detail (the object in
 * every representation the viewer's rule reads, its parts and why it scores), mounted only while open.
 */
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ObjectDetail } from "@/panes/object";

export function ObjectHover({ objectId, label, children, className = "", testId }: {
  objectId: string; label: string; children: ReactNode; className?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
  const hoverIn = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; clear(); if (!open) timer.current = setTimeout(() => setOpen(true), 120); };
  const hoverOut = (e: PointerEvent) => { if (e.pointerType !== "mouse" || pinned.current) return; clear(); timer.current = setTimeout(() => setOpen(false), 160); };
  return (
    <Popover.Root open={open} onOpenChange={o => { clear(); pinned.current = o; setOpen(o); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={label} data-testid={testId} data-object-hover={objectId}
          className={`text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className}`}
          onPointerEnter={hoverIn} onPointerLeave={hoverOut}
          onClick={e => {
            // A click pins a hover-opened view, or toggles; Radix's own toggle is skipped.
            e.preventDefault(); e.stopPropagation(); clear();
            if (open && !pinned.current) { pinned.current = true; return; }
            pinned.current = !open; setOpen(!open);
          }}>
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8}
          onOpenAutoFocus={e => { if (!pinned.current) e.preventDefault(); }}
          onPointerEnter={clear} onPointerLeave={hoverOut}
          aria-label={`${label}: details`} data-testid="object-hover-detail"
          className="z-50 w-[min(calc(100vw-16px),40rem)] max-h-[min(85vh,44rem,var(--radix-popover-content-available-height))] overflow-auto border bg-popover text-popover-foreground shadow-lg text-left whitespace-normal font-sans">
          <ObjectDetail objectId={objectId} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
