import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CheckIcon, PipetteIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImageEditorStore, DEFAULT_PLACEHOLDER_PHOTO } from "@/lib/image/state";
import { resolveValue } from "@/lib/image/interpolate";
import { Layer } from "@/lib/types/image.gen";
import {
  toHexColor,
  isLightColor,
  invertHexColor,
  extractColorsFromImage,
  getCachedPhotoColors,
  getDistinctFallbackColors,
  rgbToHex,
} from "@/lib/image/photoColors";

// ===========================================================================
// Shared constants & helpers
// ===========================================================================

const DEFAULT_COLORS = [
  "#000000", "#1e1f22", "#4e5058", "#80848e", "#b5bac1", "#ffffff",
  "#ed4245", "#f26522", "#fee75c", "#57f287", "#00b0f4", "#5865f2",
  "#9b59b6", "#eb459e",
];

const DEFAULT_SAVED_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245"];

const RECENT_KEY = "kite_img_recent_colors";
const SAVED_KEY = "kite_img_saved_colors";
const PANEL_HEIGHT_KEY = "kite_img_color_panel_height";
const MAX_RECENT = 12;

type PhotoKind = "dominant" | "average" | "inverse";

const PHOTO_KINDS: { kind: PhotoKind; label: string; hint: string }[] = [
  { kind: "dominant", label: "Dominant", hint: "Most prominent color in this image" },
  { kind: "average", label: "Average", hint: "Average pixel color of this image" },
  { kind: "inverse", label: "Inverse", hint: "Inverted complement of this image" },
];

/** Matches {{some_var.dominant}} / .average / .inverse (+ legacy aliases). */
export const DYNAMIC_COLOR_RE =
  /^\{\{\s*([a-zA-Z0-9_.-]+?)\.(dominant|average|color|inverse|inverted|average_inverse|dominant_inverse)\s*\}\}$/;

export const DYNAMIC_KIND_LABELS: Record<string, string> = {
  dominant: "Dominant",
  average: "Average",
  color: "Average",
  inverse: "Inverse",
  inverted: "Inverse",
  average_inverse: "Inverse",
  dominant_inverse: "Dominant inverse",
};

export function isHexColor(v: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export function isDynamicColor(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("{{") && v.trim().endsWith("}}");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Resolves a static or dynamic color value to a displayable hex. */
export function useResolvedHex(value: string, placeholder = "#000000") {
  const template = useImageEditorStore((s) => s.template);
  const sampleData = template.sample_data;
  const layers = template.data?.layers;
  const context = useMemo(
    () => ({ ...(sampleData || {}), _layers: layers || [] }),
    [sampleData, layers]
  );
  const dynamic = isDynamicColor(value);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!dynamic) return;
    const onReady = () => setTick((t) => t + 1);
    window.addEventListener("photo-colors-ready", onReady);
    return () => window.removeEventListener("photo-colors-ready", onReady);
  }, [dynamic]);

  if (dynamic) {
    const res = resolveValue(value, context);
    if (typeof res === "string" && (res.startsWith("#") || res.startsWith("rgb"))) {
      return toHexColor(res);
    }
  }
  return toHexColor(value || placeholder);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = toHexColor(hex).slice(1);
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function readList(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : fallback;
  } catch {
    return fallback;
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage unavailable
  }
}

function pushRecentColor(hex: string): string[] {
  const lower = toHexColor(hex);
  const next = [lower, ...readList(RECENT_KEY, []).filter((c) => c !== lower)].slice(0, MAX_RECENT);
  writeList(RECENT_KEY, next);
  window.dispatchEvent(new CustomEvent("kite-recent-colors"));
  return next;
}

export function rememberRecentColor(hex: string) {
  if (isHexColor(hex)) pushRecentColor(hex);
}

// ===========================================================================
// Panel context — lets every ColorInput in the rail share one docked panel
// ===========================================================================

export interface ColorTarget {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}

interface ColorPanelContextValue {
  open: boolean;
  target: ColorTarget | null;
  activate: (t: ColorTarget) => void;
  update: (id: string, value: string) => void;
  release: (id: string) => void;
  close: () => void;
}

const ColorPanelContext = createContext<ColorPanelContextValue | null>(null);

export function useColorPanel() {
  return useContext(ColorPanelContext);
}

export function ColorPanelProvider({
  children,
  selectedLayerId,
  tab,
}: {
  children: React.ReactNode;
  selectedLayerId?: string | null;
  tab?: string;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ColorTarget | null>(null);

  // Automatically close color panel with drawer closing animation when leaving settings or switching layers/tabs
  const prevLayerIdRef = useRef(selectedLayerId);
  const prevTabRef = useRef(tab);

  useEffect(() => {
    if (prevLayerIdRef.current !== selectedLayerId || prevTabRef.current !== tab) {
      prevLayerIdRef.current = selectedLayerId;
      prevTabRef.current = tab;
      setOpen(false);
      setTarget(null);
    }
  }, [selectedLayerId, tab]);

  const activate = useCallback((t: ColorTarget) => {
    setTarget(t);
    setOpen(true);
  }, []);

  const update = useCallback((id: string, value: string) => {
    setTarget((t) => {
      if (t && t.id === id && t.value !== value) {
        return { ...t, value };
      }
      return t;
    });
  }, []);

  const release = useCallback((id: string) => {
    setTarget((t) => {
      if (t && t.id === id) {
        setOpen(false);
        return null;
      }
      return t;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTarget(null);
  }, []);

  const ctx = useMemo(
    () => ({ open, target, activate, update, release, close }),
    [open, target, activate, update, release, close]
  );

  return <ColorPanelContext.Provider value={ctx}>{children}</ColorPanelContext.Provider>;
}

// ===========================================================================
// Docked panel (bottom drawer inside the side rail)
// ===========================================================================

const MIN_PANEL_HEIGHT = 240;
const MIN_CONTENT_HEIGHT = 140;

export function ColorPanelDock() {
  const ctx = useColorPanel();
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem(PANEL_HEIGHT_KEY));
    if (stored > 0) setHeight(stored);
  }, []);

  const open = !!ctx?.open;
  const target = ctx?.target;
  const close = ctx?.close;

  // Cache last active target during the 300ms slide-down animation so it doesn't flicker blank
  const lastTargetRef = useRef(target);
  if (target) {
    lastTargetRef.current = target;
  }
  const displayTarget = target || lastTargetRef.current;

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const panel = panelRef.current;
    if (!panel) return;
    const startH = panel.offsetHeight;
    const parent = panel.parentElement;
    const max = parent ? parent.clientHeight - MIN_CONTENT_HEIGHT : 640;

    setIsResizing(true);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    panel.style.transition = "none";

    let lastH = startH;

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      lastH = Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(max, startH + delta)));
      panel.style.height = `${lastH}px`;
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (panel) {
        panel.style.transition = "";
      }
      setIsResizing(false);
      setHeight(lastH);
      localStorage.setItem(PANEL_HEIGHT_KEY, String(lastH));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const cur = panelRef.current?.offsetHeight ?? 400;
    const parent = panelRef.current?.parentElement;
    const max = parent ? parent.clientHeight - MIN_CONTENT_HEIGHT : 640;
    const next = Math.round(
      Math.max(MIN_PANEL_HEIGHT, Math.min(max, cur + (e.key === "ArrowUp" ? 24 : -24)))
    );
    setHeight(next);
    localStorage.setItem(PANEL_HEIGHT_KEY, String(next));
  };

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Color Picker"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close?.();
        }
      }}
      style={{
        height: open ? (height ? `${height}px` : "360px") : 0,
      }}
      className={cn(
        "absolute bottom-0 left-0 right-0 z-30 flex min-h-0 flex-none flex-col bg-background shadow-[0_-8px_20px_-8px_rgba(0,0,0,0.5)] overflow-hidden",
        isResizing
          ? "transition-none"
          : "transition-[height] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
        open ? "border-t" : "border-t-0 pointer-events-none"
      )}
    >
      {/* Smooth resize handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize color panel"
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={onResizeKey}
        onDoubleClick={() => {
          setHeight(null);
          localStorage.removeItem(PANEL_HEIGHT_KEY);
        }}
        className="group flex h-3.5 shrink-0 cursor-row-resize touch-none items-center justify-center focus-visible:outline-none"
      >
        <span className="h-1 w-10 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/60 group-focus-visible:bg-ring" />
      </div>

      {/* Header: Title is "Color Picker" */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-foreground">Color Picker</span>
          {displayTarget?.label && (
            <span className="text-[11px] text-muted-foreground truncate font-normal">
              · {displayTarget.label}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close color panel"
          title="Close (Esc)"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground rounded-md"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {displayTarget ? (
        <ColorPanelBody
          key={displayTarget.id}
          value={displayTarget.value}
          placeholder={displayTarget.placeholder}
          onChange={(next) => {
            displayTarget.onChange(next);
            displayTarget.value = next;
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 pb-6 text-center">
          <p className="text-sm font-medium">No color selected</p>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Swatch components
// ===========================================================================

interface PhotoSource {
  key: string;
  layerName: string;
  varName: string;
  url: string;
  colors: Record<PhotoKind, string>;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex h-5 items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function SwatchGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] gap-1.5 [@media(pointer:coarse)]:grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] [@media(pointer:coarse)]:gap-2">
      {children}
    </div>
  );
}

function Swatch({
  color,
  selected,
  label,
  onSelect,
  onRemove,
}: {
  color: string;
  selected: boolean;
  label?: string;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const hex = toHexColor(color);
  const light = isLightColor(hex);
  const name = label ? `${label} ${hex.toUpperCase()}` : hex.toUpperCase();
  return (
    <div className="relative aspect-square">
      <button
        type="button"
        onClick={onSelect}
        title={name}
        aria-label={name}
        aria-pressed={selected}
        className={cn(
          "flex size-full items-center justify-center rounded-md shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background cursor-pointer",
          light && "shadow-[inset_0_0_0_1px_hsl(var(--border))]",
          selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
        )}
        style={{ backgroundColor: hex }}
      >
        {selected && (
          <CheckIcon className={cn("size-3.5", light ? "text-black" : "text-white")} strokeWidth={3} />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${hex.toUpperCase()} from saved`}
          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground cursor-pointer"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// Panel body — swatches on top, custom picker at the bottom
// ===========================================================================

export function ColorPanelBody({
  value,
  placeholder = "#000000",
  onChange,
  className,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const template = useImageEditorStore((s) => s.template);
  const sampleData = useMemo(() => template.sample_data || {}, [template.sample_data]);

  // Keep live value in state, initialized to prop and synced if external prop changes
  const [currentValue, setCurrentValue] = useState<string>(value);
  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const resolvedHex = useResolvedHex(currentValue, placeholder);
  const dynamic = isDynamicColor(currentValue);
  const dynamicMatch = dynamic ? currentValue.trim().match(DYNAMIC_COLOR_RE) : null;

  // Local text input state (only while actively typing in the hex box)
  const [typedHex, setTypedHex] = useState<string | null>(null);
  const displayHexText = typedHex ?? resolvedHex.toUpperCase();

  const [recent, setRecent] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [editingSaved, setEditingSaved] = useState(false);
  const [photos, setPhotos] = useState<PhotoSource[]>([]);
  // Track which photo is selected in the dropdown
  const [selectedPhotoKey, setSelectedPhotoKey] = useState<string>("");
  const lastCommitted = useRef<string | null>(null);

  useEffect(() => {
    setRecent(readList(RECENT_KEY, []));
    setSaved(readList(SAVED_KEY, DEFAULT_SAVED_COLORS));
    const sync = () => setRecent(readList(RECENT_KEY, []));
    window.addEventListener("kite-recent-colors", sync);
    return () => window.removeEventListener("kite-recent-colors", sync);
  }, []);

  useEffect(() => {
    return () => {
      if (lastCommitted.current) pushRecentColor(lastCommitted.current);
    };
  }, []);

  const commit = useCallback(
    (next: string) => {
      setCurrentValue(next);
      setTypedHex(null);
      lastCommitted.current = isHexColor(next) ? toHexColor(next) : null;
      onChange(next);
    },
    [onChange]
  );

  const saveCurrent = () => {
    setSaved((prev) => {
      if (prev.includes(resolvedHex)) return prev;
      const next = [...prev, resolvedHex];
      writeList(SAVED_KEY, next);
      return next;
    });
  };

  const removeSaved = (hex: string) => {
    setSaved((prev) => {
      const next = prev.filter((c) => c !== hex);
      writeList(SAVED_KEY, next);
      if (next.length === 0) setEditingSaved(false);
      return next;
    });
  };

  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const pickFromScreen = async () => {
    try {
      const res = await new (window as any).EyeDropper().open();
      if (res?.sRGBHex) commit(toHexColor(res.sRGBHex));
    } catch {
      // cancelled
    }
  };

  // Only re-extract document colors when layers structure changes
  const docColorsKey = useMemo(() => {
    return (template.data?.layers || [])
      .map(
        (l: Layer) =>
          `${l.color}|${l.fill_color}|${l.background_color}|${l.border_color}`
      )
      .join(";");
  }, [template.data?.layers]);

  const documentColors = useMemo(() => {
    const set = new Set<string>();
    const add = (c?: string) => {
      if (c && typeof c === "string" && !c.includes("{{")) set.add(toHexColor(c));
    };
    for (const l of (template.data?.layers || []) as Layer[]) {
      const a = l as any;
      [
        l.color, l.fill_color, l.background_color, l.border_color, l.shadow_color,
        l.overlay_color, l.stroke_color, a.badge_bg, a.badge_color,
      ].forEach(add);
      l.gradient?.stops?.forEach((s) => add(s.color));
    }
    return Array.from(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docColorsKey]);

  // Extract photo layers and colors
  const imageLayerKey = useMemo(() => {
    const imgLayers = (template.data?.layers || []).filter(
      (l: Layer) => l.type === "image"
    );
    return imgLayers.map((l: Layer) => `${l.id}:${l.image_url}`).join(";");
  }, [template.data?.layers]);

  useEffect(() => {
    const layers = ((template.data?.layers || []) as Layer[]).filter(
      (l) => l.type === "image"
    );
    if (layers.length === 0) {
      setPhotos([]);
      return;
    }

    let cancelled = false;
    const usedSlugs = new Map<string, number>();
    const usedVarNames = new Set<string>();

    const sources = layers.map((l, i) => {
      let url = l.image_url || "";
      const m = url.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/);

      const baseSlug = l.name ? slugify(l.name) : `image_${i + 1}`;
      const count = (usedSlugs.get(baseSlug) || 0) + 1;
      usedSlugs.set(baseSlug, count);
      const disambiguatedSlug = count === 1 ? baseSlug : `${baseSlug}_${count}`;

      let varName: string;
      if (m && !usedVarNames.has(m[1].toLowerCase())) {
        varName = m[1];
      } else {
        varName = disambiguatedSlug;
      }
      usedVarNames.add(varName.toLowerCase());

      if (url.includes("{{")) {
        const r = resolveValue(url, { ...sampleData, _layers: template.data?.layers || [] });
        url = r ? String(r) : "";
      }
      if (!/^(https?:|data:)/.test(url)) url = DEFAULT_PLACEHOLDER_PHOTO;
      return {
        key: `${l.id || `img_${i}`}`,
        layerName: l.name || `Image ${i + 1}`,
        varName,
        url,
        slotIndex: i,
      };
    });

    const build = () => {
      if (cancelled) return;
      setPhotos(
        sources.map((s) => {
          const c =
            getCachedPhotoColors(s.url) ||
            getDistinctFallbackColors(
              s.url === DEFAULT_PLACEHOLDER_PHOTO ? s.key : s.url,
              s.slotIndex
            );
          return {
            ...s,
            colors: {
              dominant: c.dominant,
              average: c.average,
              inverse: c.inverse || invertHexColor(c.average),
            },
          };
        })
      );
    };

    build();
    sources.forEach((s) => {
      if (!getCachedPhotoColors(s.url)) {
        extractColorsFromImage(s.url, build, s.slotIndex);
      }
    });

    const onColorsReady = () => build();
    window.addEventListener("photo-colors-ready", onColorsReady);

    return () => {
      cancelled = true;
      window.removeEventListener("photo-colors-ready", onColorsReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageLayerKey, sampleData]);

  // Which photo is currently selected for the "From image" swatches
  const activePhoto = useMemo(() => {
    if (photos.length === 0) return null;
    // 1. User explicitly picked an image from the dropdown in this session
    if (selectedPhotoKey) {
      const found = photos.find((p) => p.key === selectedPhotoKey);
      if (found) return found;
    }
    // 2. Bound variable from current color expression
    if (dynamicMatch) {
      const targetVar = dynamicMatch[1].toLowerCase();
      const exact = photos.find(
        (p) =>
          p.varName.toLowerCase() === targetVar ||
          p.key.toLowerCase() === targetVar
      );
      if (exact) return exact;

      const matched = photos.find(
        (p) =>
          p.layerName.toLowerCase() === targetVar ||
          slugify(p.layerName) === targetVar
      );
      if (matched) return matched;
    }
    // 3. Fallback to first available photo
    return photos[0];
  }, [photos, selectedPhotoKey, dynamicMatch]);

  const handlePhotoChange = (newKey: string) => {
    setSelectedPhotoKey(newKey);
    const chosen = photos.find((p) => p.key === newKey);
    if (!chosen) return;

    // If the color is already dynamic, immediately switch binding to the chosen image
    if (dynamicMatch) {
      const kind = dynamicMatch[2];
      const normalizedKind =
        kind === "color"
          ? "average"
          : kind === "inverted" || kind === "average_inverse"
          ? "inverse"
          : kind;
      commit(`{{${chosen.varName}.${normalizedKind}}}`);
    }
  };

  const staticSelected = (hex: string) => !dynamic && toHexColor(hex) === resolvedHex;
  const rgb = hexToRgb(resolvedHex);

  return (
    <ScrollArea className="flex-1 min-h-0 w-full">
      <div className={cn("space-y-4 px-4 py-3 pb-6", className)}>
        {/* 1. From image (with multi-image selector) */}
        {photos.length > 0 && activePhoto && (
          <section className="space-y-2">
            <div className="flex h-6 items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground shrink-0">
                From image
              </h4>

              {photos.length > 1 ? (
                <Select
                  value={activePhoto.key}
                  onValueChange={handlePhotoChange}
                >
                  <SelectTrigger className="h-6 w-auto max-w-[200px] gap-1.5 px-2 py-0 text-[11px] border-border/60 bg-muted/40 cursor-pointer">
                    <div className="flex items-center gap-1.5 truncate">
                      <img
                        src={activePhoto.url}
                        alt=""
                        className="size-3.5 rounded-sm object-cover shrink-0"
                      />
                      <span className="truncate">{activePhoto.layerName}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end" className="z-50">
                    {photos.map((p) => (
                      <SelectItem key={p.key} value={p.key} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2">
                          <img
                            src={p.url}
                            alt=""
                            className="size-4 rounded-sm object-cover shrink-0"
                          />
                          <span className="truncate">{p.layerName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ({p.varName})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate max-w-[190px]">
                  <img
                    src={activePhoto.url}
                    alt=""
                    className="size-3.5 rounded-sm object-cover shrink-0"
                  />
                  <span className="truncate">{activePhoto.layerName}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                {PHOTO_KINDS.map(({ kind, label, hint }) => {
                  const token = `{{${activePhoto.varName}.${kind}}}`;
                  const active =
                    !!dynamicMatch &&
                    (dynamicMatch[1].toLowerCase() === activePhoto.varName.toLowerCase() ||
                      dynamicMatch[1].toLowerCase() === activePhoto.key.toLowerCase()) &&
                    (DYNAMIC_KIND_LABELS[dynamicMatch[2]] || "") === label;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => commit(token)}
                      title={`${hint}. Updates automatically from ${activePhoto.layerName}.`}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-md border text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                        active && "border-foreground ring-1 ring-foreground"
                      )}
                    >
                      <span
                        className="flex h-7 items-center justify-center"
                        style={{ backgroundColor: activePhoto.colors[kind] }}
                      >
                        {active && (
                          <CheckIcon
                            className={cn(
                              "size-3.5",
                              isLightColor(activePhoto.colors[kind])
                                ? "text-black"
                                : "text-white"
                            )}
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      <span className="px-1.5 py-1 text-[11px] font-medium leading-tight">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] leading-snug text-muted-foreground">
                Linked to <span className="font-mono text-foreground">{activePhoto.layerName}</span> (
                <span className="font-mono text-muted-foreground">{activePhoto.varName}</span>).
                Recalculates dynamically when generated.
              </p>
            </div>
          </section>
        )}

        {/* 2. In this design */}
        {documentColors.length > 0 && (
          <Section title="In this design">
            <SwatchGrid>
              {documentColors.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={staticSelected(c)}
                  onSelect={() => commit(c)}
                />
              ))}
            </SwatchGrid>
          </Section>
        )}

        {/* 3. Saved */}
        <Section
          title="Saved"
          action={
            saved.length > 0 && (
              <button
                type="button"
                onClick={() => setEditingSaved((e) => !e)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {editingSaved ? "Done" : "Edit"}
              </button>
            )
          }
        >
          <SwatchGrid>
            {saved.map((c) => (
              <Swatch
                key={c}
                color={c}
                label="Saved"
                selected={staticSelected(c)}
                onSelect={() => commit(c)}
                onRemove={editingSaved ? () => removeSaved(c) : undefined}
              />
            ))}
            {!editingSaved && (
              <button
                type="button"
                onClick={saveCurrent}
                disabled={saved.includes(resolvedHex)}
                title="Save current color"
                aria-label="Save current color"
                className="flex aspect-square items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <PlusIcon className="size-3.5" />
              </button>
            )}
          </SwatchGrid>
        </Section>

        {/* 4. Recent */}
        {recent.length > 0 && (
          <Section title="Recent">
            <SwatchGrid>
              {recent.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={staticSelected(c)}
                  onSelect={() => commit(c)}
                />
              ))}
            </SwatchGrid>
          </Section>
        )}

        {/* 5. Default */}
        <Section title="Default">
          <SwatchGrid>
            {DEFAULT_COLORS.map((c) => (
              <Swatch
                key={c}
                color={c}
                selected={staticSelected(c)}
                onSelect={() => commit(c)}
              />
            ))}
          </SwatchGrid>
        </Section>

        {/* 6. Custom color picker AT THE BOTTOM */}
        <Section title="Custom">
          <div className="space-y-2.5">
            <div className="kite-color-picker">
              <HexColorPicker color={resolvedHex} onChange={commit} />
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                value={displayHexText}
                onChange={(e) => {
                  const v = e.target.value;
                  setTypedHex(v);
                  const withHash = v.startsWith("#") ? v : `#${v}`;
                  if (isHexColor(withHash)) commit(toHexColor(withHash));
                }}
                onBlur={() => setTypedHex(null)}
                spellCheck={false}
                aria-label="Hex color"
                className="h-8 min-w-0 flex-[1.6] px-2 font-mono text-xs uppercase"
              />
              {(["R", "G", "B"] as const).map((ch, i) => (
                <label key={ch} className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
                    {ch}
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={255}
                    value={rgb[i]}
                    onChange={(e) => {
                      const n = Math.max(
                        0,
                        Math.min(255, parseInt(e.target.value, 10) || 0)
                      );
                      const next = [...rgb] as [number, number, number];
                      next[i] = n;
                      commit(rgbToHex(next[0], next[1], next[2]));
                    }}
                    aria-label={ch === "R" ? "Red" : ch === "G" ? "Green" : "Blue"}
                    className="h-8 pl-4 pr-0.5 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
              ))}
              {hasEyeDropper && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={pickFromScreen}
                  title="Pick a color from the screen"
                  aria-label="Pick a color from the screen"
                  className="size-8 shrink-0 cursor-pointer"
                >
                  <PipetteIcon className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}
