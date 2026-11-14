import React, { useId, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Link2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { toHexColor } from "@/lib/image/photoColors";
import {
  ColorPanelBody,
  DYNAMIC_COLOR_RE,
  DYNAMIC_KIND_LABELS,
  isDynamicColor,
  rememberRecentColor,
  useColorPanel,
  useResolvedHex,
} from "./ColorPanel";

export { toHexColor };
export { ColorPanelProvider, ColorPanelDock } from "./ColorPanel";

interface ColorPickerProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  className?: string;
  /** Title shown in the color panel. Defaults to the field's <label>. */
  label?: string;
}

/** Finds the visible label for a field, e.g. <div><Label>Fill Color</Label><ColorInput/></div>. */
function findFieldLabel(el: HTMLElement | null): string | null {
  let node = el?.parentElement ?? null;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const label = node.querySelector(":scope > label");
    const text = label?.textContent?.trim();
    if (text) return text;
  }
  return null;
}

/**
 * Color field: a swatch + hex input. Inside the image editor rail the swatch
 * opens the shared docked color panel; elsewhere it falls back to a popover
 * (desktop) or bottom sheet (mobile).
 */
export function ColorInput({
  value,
  onChange,
  placeholder = "#000000",
  className,
  label,
}: ColorPickerProps) {
  const id = useId();
  const panel = useColorPanel();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  const resolvedHex = useResolvedHex(value, placeholder);
  const dynamicMatch = isDynamicColor(value) ? value.trim().match(DYNAMIC_COLOR_RE) : null;

  // Local text input state (only while actively typing invalid/partial hex strings)
  const [typedText, setTypedText] = useState<string | null>(null);
  const displayText = typedText ?? (value || "");

  const [fallbackOpen, setFallbackOpen] = useState(false);

  // Stable onChange reference for panel activation
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const stableOnChange = useRef((v: string) => onChangeRef.current(v)).current;

  const docked = !!panel && !isMobile;
  const isActive = docked && panel.open && panel.target?.id === id;

  const openPicker = () => {
    if (!docked) {
      setFallbackOpen(true);
      return;
    }
    panel.activate({
      id,
      label: label || findFieldLabel(rootRef.current) || "Color",
      value,
      placeholder,
      onChange: stableOnChange,
    });
    // Scroll field into view inside the rail
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      )
    );
  };

  const swatch = (
    <button
      type="button"
      onClick={docked ? openPicker : undefined}
      aria-label="Choose color"
      aria-expanded={docked ? isActive : fallbackOpen}
      className={cn(
        "relative h-9 w-9 shrink-0 rounded-md border border-input shadow-sm transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
        isActive && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
      )}
      style={{ backgroundColor: resolvedHex }}
    >
      {dynamicMatch && (
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border bg-background">
          <Link2Icon className="size-2.5 text-foreground" />
        </span>
      )}
    </button>
  );

  const field = dynamicMatch ? (
    <div
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-muted/40 pl-2.5 pr-1 text-xs",
        isActive && "border-foreground/40"
      )}
    >
      <button
        type="button"
        onClick={openPicker}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
        title={value}
      >
        <Link2Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {dynamicMatch[1]} · {DYNAMIC_KIND_LABELS[dynamicMatch[2]] || dynamicMatch[2]}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange(resolvedHex)}
        title="Unlink and keep the current color"
        aria-label="Unlink from image"
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  ) : (
    <Input
      value={displayText}
      onChange={(e) => {
        const val = e.target.value;
        setTypedText(val);
        onChange(val);
        if (isActive && panel) {
          panel.update(id, val);
        }
      }}
      onBlur={() => {
        setTypedText(null);
        rememberRecentColor(toHexColor(displayText));
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "h-9 min-w-0 flex-1 font-mono text-xs uppercase placeholder:normal-case",
        isActive && "border-foreground/40"
      )}
    />
  );

  // Docked: the shared panel lives in the rail (see ColorPanelDock).
  if (docked) {
    return (
      <div ref={rootRef} className={cn("flex min-w-0 gap-2", className)}>
        {swatch}
        {field}
      </div>
    );
  }

  // Mobile fallback: bottom sheet.
  if (isMobile) {
    return (
      <>
        <div ref={rootRef} className={cn("flex min-w-0 gap-2", className)}>
          <span onClick={() => setFallbackOpen(true)} className="contents">
            {swatch}
          </span>
          {field}
        </div>
        <Drawer open={fallbackOpen} onOpenChange={setFallbackOpen} shouldScaleBackground={false}>
          <DrawerContent className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]">
            <DrawerTitle className="px-4 pt-3 text-sm font-semibold">
              Color Picker
            </DrawerTitle>
            <DrawerDescription className="px-4 text-xs text-muted-foreground">
              {label || "Pick a color, a swatch, or link to an image"}
            </DrawerDescription>
            <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pt-2 max-h-[calc(85dvh-4rem)]">
              <ColorPanelBody value={value} placeholder={placeholder} onChange={onChange} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop fallback (used outside the editor rail): popover.
  return (
    <Popover open={fallbackOpen} onOpenChange={setFallbackOpen}>
      <div ref={rootRef} className={cn("flex min-w-0 gap-2", className)}>
        <PopoverTrigger asChild>{swatch}</PopoverTrigger>
        {field}
      </div>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex w-[min(18rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 pt-3 max-h-[min(34rem,var(--radix-popover-content-available-height))]"
      >
        <ColorPanelBody value={value} placeholder={placeholder} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export default ColorInput;
