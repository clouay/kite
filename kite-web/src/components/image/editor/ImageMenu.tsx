import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayersIcon,
  BoxIcon,
  CogIcon,
  PlusIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  Trash2Icon,
  CopyIcon,
  CopyPlusIcon,
  XIcon,
  TypeIcon,
  SquareIcon,
  CircleIcon,
  StarIcon,
  ImageIcon,
  ActivityIcon,
  TagIcon,
  ListOrderedIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronsUpIcon,
  ChevronsDownIcon,
  MoreVerticalIcon,
  GripVerticalIcon,
  LucideIcon,
  BracesIcon,
  PencilIcon,
  CheckIcon,
  MaximizeIcon,
  LayoutTemplateIcon,
  HexagonIcon,
  DiamondIcon,
  SearchIcon,
  ChevronRightIcon,
  SlidersHorizontalIcon,
  HelpCircleIcon,
  ExternalLinkIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorInput, toHexColor } from "./ColorPicker";
import { ColorPanelDock, ColorPanelProvider, useColorPanel } from "./ColorPanel";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useImageEditorStore,
  DEFAULT_PLACEHOLDER_PHOTO,
  extractPlaceholdersFromLayers,
} from "@/lib/image/state";
import { Layer } from "@/lib/types/image.gen";
import { TEMPLATE_PRESETS } from "@/lib/image/presets";
import { toast } from "sonner";

const FONT_OPTIONS = [
  { label: "Default Sans (Inter / System)", value: "inherit" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Oswald", value: "Oswald, sans-serif" },
  { label: "Bebas Neue", value: "'Bebas Neue', sans-serif" },
  { label: "Fira Code (Monospace)", value: "'Fira Code', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Merriweather (Serif)", value: "Merriweather, serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Impact (Bold Display)", value: "Impact, sans-serif" },
  { label: "Comic Neue", value: "'Comic Neue', sans-serif" },
  { label: "Orbitron (Gaming / Sci-Fi)", value: "Orbitron, sans-serif" },
  { label: "Press Start 2P (Retro 8-bit)", value: "'Press Start 2P', monospace" },
];

interface VariableFieldInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  defaultVarName?: string;
  defaultSampleValue?: any;
  className?: string;
  rows?: number;
}

function VariableFieldInput({
  value,
  onChange,
  placeholder,
  multiline,
  defaultVarName = "variable",
  defaultSampleValue,
  className,
  rows = 2,
}: VariableFieldInputProps) {
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [editingVar, setEditingVar] = React.useState<string | null>(null);
  const [renameVal, setRenameVal] = React.useState("");

  const variables = React.useMemo(() => {
    if (!value) return [];
    const matches = Array.from(value.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g));
    return Array.from(new Set(matches.map((m) => m[1])));
  }, [value]);

  const ensureSampleValue = (varName: string) => {
    const currentSample = useImageEditorStore.getState().template.sample_data || {};
    const fallback =
      defaultSampleValue !== undefined ? defaultSampleValue : `Sample ${varName}`;
    const parts = varName.split(".");
    if (parts.length === 1) {
      if (currentSample[varName] === undefined) {
        useImageEditorStore.getState().setSampleData({
          ...currentSample,
          [varName]: fallback,
        });
      }
    } else {
      const nextSample = JSON.parse(JSON.stringify(currentSample));
      let cur = nextSample;
      for (let i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) {
          cur[parts[i]] = {};
        }
        cur = cur[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (cur[last] === undefined) {
        cur[last] = fallback;
        useImageEditorStore.getState().setSampleData(nextSample);
      }
    }
  };

  const handleInsert = () => {
    const el = inputRef.current;
    let varName = defaultVarName;

    if (
      el &&
      el.selectionStart !== null &&
      el.selectionEnd !== null &&
      el.selectionStart !== el.selectionEnd
    ) {
      const selected = value.substring(el.selectionStart, el.selectionEnd).trim();
      const slug = selected
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (slug) varName = slug;

      const before = value.substring(0, el.selectionStart);
      const after = value.substring(el.selectionEnd);
      const next = `${before}{{${varName}}}${after}`;
      onChange(next);
      ensureSampleValue(varName);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(before.length, before.length + varName.length + 4);
      }, 0);
      return;
    }

    let candidate = varName;
    let counter = 2;
    while (variables.includes(candidate)) {
      candidate = `${varName}_${counter++}`;
    }
    varName = candidate;

    if (el && el.selectionStart !== null) {
      const pos = el.selectionStart;
      const before = value.substring(0, pos);
      const after = value.substring(pos);
      const next = `${before}{{${varName}}}${after}`;
      onChange(next);
      setTimeout(() => {
        el.focus();
        const newPos = pos + varName.length + 4;
        el.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      const next = value ? `${value} {{${varName}}}` : `{{${varName}}}`;
      onChange(next);
    }

    ensureSampleValue(varName);
  };

  const handleRename = (oldName: string) => {
    const clean = renameVal
      .trim()
      .replace(/[^a-zA-Z0-9_.-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!clean || clean === oldName) {
      setEditingVar(null);
      return;
    }

    const regex = new RegExp(
      `\\{\\{\\s*${oldName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*\\}\\}`,
      "g"
    );
    const nextVal = value.replace(regex, `{{${clean}}}`);
    onChange(nextVal);

    const sampleData = useImageEditorStore.getState().template.sample_data || {};
    const nextSample = { ...sampleData };
    if (nextSample[oldName] !== undefined) {
      nextSample[clean] = nextSample[oldName];
      delete nextSample[oldName];
      useImageEditorStore.getState().setSampleData(nextSample);
    } else {
      ensureSampleValue(clean);
    }

    setEditingVar(null);
    setRenameVal("");
  };

  const handleRemove = (varName: string) => {
    const regex = new RegExp(
      `\\{\\{\\s*${varName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*\\}\\}`,
      "g"
    );
    const nextVal = value.replace(regex, "").trim();
    onChange(nextVal);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative flex items-center">
        {multiline ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className={cn("font-mono resize-none pr-9", className)}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn("font-mono pr-9", className)}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-1 text-muted-foreground hover:text-foreground",
            multiline ? "top-1.5 h-7 w-7" : "top-1/2 -translate-y-1/2 h-7 w-7"
          )}
          onClick={handleInsert}
          title="Insert variable placeholder {{name}}"
        >
          <BracesIcon className="h-4 w-4" />
        </Button>
      </div>

      {variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {variables.map((v) => (
            <div key={v} className="inline-flex items-center">
              {editingVar === v ? (
                <div className="flex items-center gap-1 bg-background border border-input rounded px-1.5 py-0.5">
                  <input
                    type="text"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    className="h-4 text-xs font-mono w-24 bg-transparent outline-none text-foreground"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(v);
                      if (e.key === "Escape") setEditingVar(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(v)}
                    className="text-primary hover:text-primary/80"
                    title="Save name"
                  >
                    <CheckIcon className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingVar(null)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Cancel"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-xs font-mono py-0 px-1.5 h-5 flex items-center gap-1"
                >
                  <span>&#123;&#123;{v}&#125;&#125;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVar(v);
                      setRenameVal(v);
                    }}
                    className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-foreground ml-0.5"
                    title="Rename variable"
                  >
                    <PencilIcon className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(v)}
                    className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-destructive"
                    title="Remove variable"
                  >
                    <XIcon className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <Select value={value || "inherit"} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FONT_OPTIONS.map((f) => (
          <SelectItem key={f.value} value={f.value}>
            <span style={{ fontFamily: f.value !== "inherit" ? f.value : undefined }}>
              {f.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Tab = "layers" | "add" | "templates" | "settings";

interface Props {
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
}

export default function ImageMenu({ selectedLayerId, onSelectLayer }: Props) {
  const [tab, setTab] = useState<Tab>("layers");

  const wrappedSetTab = useCallback(
    (newTab: Tab) => {
      setTab(newTab);
      onSelectLayer(null);
    },
    [onSelectLayer]
  );

  return (
    <div className="hidden md:flex flex-none h-full min-h-0 overflow-hidden">
      {/* Icon Rail - Identical width and styling to FlowMenu */}
      <div className="flex-none flex flex-col justify-between bg-muted/50 h-full">
        <div className="flex-none flex flex-col items-center gap-1">
          <MenuTab
            id="layers"
            icon={LayersIcon}
            title="Layers"
            tab={tab}
            setTab={wrappedSetTab}
          />
          <MenuTab
            id="add"
            icon={BoxIcon}
            title="Add Layer"
            tab={tab}
            setTab={wrappedSetTab}
          />
          <MenuTab
            id="templates"
            icon={LayoutTemplateIcon}
            title="Starter Templates"
            tab={tab}
            setTab={wrappedSetTab}
          />
        </div>
        <div className="flex-none flex flex-col items-center gap-1">
          <MenuTab
            id="settings"
            icon={CogIcon}
            title="Editor Settings"
            tab={tab}
            setTab={wrappedSetTab}
          />
        </div>
      </div>

      {/* Drawer Panel - Exact same w-96 width as FlowMenu */}
      <ColorPanelProvider selectedLayerId={selectedLayerId} tab={tab}>
        <div className="flex-none relative w-96 h-full min-h-0 overflow-hidden bg-muted/30">
          {tab === "layers" && (
            <LayersTab
              onSelectLayer={onSelectLayer}
              onSwitchToAdd={() => setTab("add")}
              onSwitchToSettings={() => setTab("settings")}
            />
          )}
          {tab === "add" && <AddLayerTab onSelectLayer={onSelectLayer} />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "settings" && (
            <SettingsTab onSwitchToCanvas={() => onSelectLayer("canvas")} />
          )}

          {/* Properties Overlays - Exact same w-96 as FlowNodeEditor */}
          {selectedLayerId && (
            selectedLayerId === "canvas" ? (
              <CanvasProperties onClose={() => onSelectLayer(null)} />
            ) : (
              <LayerProperties
                layerId={selectedLayerId}
                onClose={() => onSelectLayer(null)}
              />
            )
          )}

          {/* Color Panel Dock: bottom drawer inside the rail */}
          <ColorPanelDock />
        </div>
      </ColorPanelProvider>
    </div>
  );
}

function MenuTab({
  id,
  icon: Icon,
  title,
  tab,
  setTab,
}: {
  id: Tab;
  icon: LucideIcon;
  title: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "p-3 cursor-pointer",
            tab === id
              ? "text-foreground bg-background/50 border-l-[3px] border-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-background/20"
          )}
          onClick={() => setTab(id)}
          role="button"
        >
          <div className="relative">
            <Icon className="size-8" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  );
}

function getLayerVisual(type: Layer["type"], shapeType?: string) {
  switch (type) {
    case "text":
      return { icon: TypeIcon, color: "#3b82f6" };
    case "image":
      return { icon: ImageIcon, color: "#10b981" };
    case "shape":
      if (shapeType === "circle") return { icon: CircleIcon, color: "#8b5cf6" };
      if (shapeType === "hexagon") return { icon: HexagonIcon, color: "#8b5cf6" };
      if (shapeType === "diamond") return { icon: DiamondIcon, color: "#eb459e" };
      if (shapeType === "star") return { icon: StarIcon, color: "#faa61a" };
      return { icon: SquareIcon, color: "#8b5cf6" };
    case "progress_bar":
      return { icon: ActivityIcon, color: "#f59e0b" };
    case "badge":
      return { icon: TagIcon, color: "#ec4899" };
    case "repeater":
      return { icon: ListOrderedIcon, color: "#06b6d4" };
    case "background":
    default:
      return { icon: LayersIcon, color: "#64748b" };
  }
}

function getLayerSubtitle(layer: Layer): string | null {
  switch (layer.type) {
    case "text":
      if (layer.content) {
        return layer.content.length > 28
          ? layer.content.slice(0, 28) + "…"
          : layer.content;
      }
      return `${layer.font_size ?? 16}px text`;
    case "image":
      if (layer.image_url) {
        if (layer.image_url.startsWith("{{") && layer.image_url.endsWith("}}")) {
          return layer.image_url;
        }
        return layer.mask ? `${layer.mask} mask` : "Image";
      }
      return layer.mask ? `${layer.mask} mask` : "Custom image";
    case "progress_bar":
      return `${layer.value ?? 0} / ${layer.max_value ?? 100}`;
    case "badge":
      return layer.label || "Badge";
    case "shape":
      return `${Math.round(layer.width)} × ${Math.round(layer.height)} px`;
    case "repeater":
      return `${layer.items_expression || "List"} • ${layer.max_items || 5} items`;
    case "background":
      return layer.fill_type === "linear-gradient" ? "Gradient fill" : (layer.color || "Canvas fill");
    default:
      return null;
  }
}

function LayersTab({
  onSelectLayer,
  onSwitchToAdd,
  onSwitchToSettings,
}: {
  onSelectLayer: (id: string) => void;
  onSwitchToAdd: () => void;
  onSwitchToSettings?: () => void;
}) {
  const template = useImageEditorStore((s) => s.template);
  const selectedLayerId = useImageEditorStore((s) => s.selectedLayerId);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);

  const canvasRadius =
    template.data?.border_radius ??
    template.data?.layers?.find((l: Layer) => l.type === "background")?.border_radius ??
    0;

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    visualIndex: number;
    position: "top" | "bottom";
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (layer: Layer) => {
    setEditingId(layer.id);
    setRenameText(layer.name);
  };

  const commitRename = () => {
    if (editingId && renameText.trim()) {
      updateLayer(editingId, { name: renameText.trim() });
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  const layers = useMemo(
    () => [...template.data.layers].reverse(),
    [template.data.layers]
  );

  // Auto-scroll while dragging when approaching top or bottom of the scroll container
  const handleContainerDragOver = (e: React.DragEvent) => {
    if (!draggedId || !scrollAreaRef.current) return;
    const viewport = scrollAreaRef.current.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const mouseY = e.clientY;
    const topEdge = rect.top;
    const bottomEdge = rect.bottom;
    const threshold = 55;

    if (mouseY >= topEdge && mouseY < topEdge + threshold) {
      const intensity = Math.max(0.1, (topEdge + threshold - mouseY) / threshold);
      viewport.scrollTop -= Math.round(18 * intensity);
    } else if (mouseY <= bottomEdge && mouseY > bottomEdge - threshold) {
      const intensity = Math.max(0.1, (mouseY - (bottomEdge - threshold)) / threshold);
      viewport.scrollTop += Math.round(18 * intensity);
    }
  };

  const isSlotValid = useCallback(
    (slot: number, fromVisIdx: number | null): boolean => {
      if (fromVisIdx === null || fromVisIdx === -1) return false;
      // No-op: dragging to immediately before or after its current slot does not change position
      if (slot === fromVisIdx || slot === fromVisIdx + 1) return false;
      if (slot < 0 || slot > layers.length) return false;

      const draggedLayer = template.data.layers.find((l: Layer) => l.id === draggedId);
      if (!draggedLayer || draggedLayer.locked) return false;

      return true;
    },
    [layers.length, template.data.layers, draggedId]
  );

  const filteredLayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((layer) => {
      const subtitle = getLayerSubtitle(layer) || "";
      return (
        layer.name.toLowerCase().includes(q) ||
        layer.type.toLowerCase().includes(q) ||
        subtitle.toLowerCase().includes(q)
      );
    });
  }, [layers, search]);

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-5 flex-none">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-foreground">Layers</div>
            <Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal">
              {layers.length}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={onSwitchToAdd}
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Layer</span>
          </Button>
        </div>

        <div className="relative">
          <Input
            placeholder="Search ..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchIcon className="absolute size-5 left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Layers List with auto-scroll on drag */}
      <ScrollArea
        ref={scrollAreaRef}
        onDragOver={handleContainerDragOver}
        className="flex-1 min-h-0 mr-1"
      >
        <div className="space-y-1 pl-3 pr-2 pb-5">
            {filteredLayers.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No layers match "{search}"
              </div>
            )}

            {filteredLayers.map((layer, reverseIdx) => {
              const actualIndex = template.data.layers.findIndex((l: Layer) => l.id === layer.id);
              const { icon: Icon, color } = getLayerVisual(layer.type, layer.shape_type);
              const isSelected = selectedLayerId === layer.id;
              const subtitle = getLayerSubtitle(layer);
              const fromVisIdx = layers.findIndex((l) => l.id === draggedId);
              const isDraggable =
                !editingId &&
                !layer.locked &&
                !search.trim();

              const isDropTop =
                dropTarget?.visualIndex === reverseIdx &&
                dropTarget?.position === "top";
              const isDropBottom =
                dropTarget?.visualIndex === reverseIdx &&
                dropTarget?.position === "bottom";

              return (
                <div
                  key={layer.id}
                  draggable={isDraggable}
                  onDragStart={(e) => {
                    if (!isDraggable) {
                      e.preventDefault();
                      return;
                    }
                    setDraggedId(layer.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", layer.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!draggedId || draggedId === layer.id || search.trim()) {
                      if (dropTarget) setDropTarget(null);
                      e.dataTransfer.dropEffect = "none";
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "top" | "bottom" =
                      e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
                    const targetSlot = position === "top" ? reverseIdx : reverseIdx + 1;

                    if (isSlotValid(targetSlot, fromVisIdx)) {
                      e.dataTransfer.dropEffect = "move";
                      if (
                        dropTarget?.visualIndex !== reverseIdx ||
                        dropTarget?.position !== position
                      ) {
                        setDropTarget({ visualIndex: reverseIdx, position });
                      }
                    } else {
                      e.dataTransfer.dropEffect = "none";
                      if (dropTarget) setDropTarget(null);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dropTarget?.visualIndex === reverseIdx) {
                        setDropTarget(null);
                      }
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!draggedId || draggedId === layer.id || search.trim()) {
                      setDraggedId(null);
                      setDropTarget(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position: "top" | "bottom" =
                      e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
                    const targetSlot = position === "top" ? reverseIdx : reverseIdx + 1;

                    if (isSlotValid(targetSlot, fromVisIdx)) {
                      const totalRemaining = template.data.layers.length - 1;
                      const effectiveSlot =
                        targetSlot > fromVisIdx ? targetSlot - 1 : targetSlot;
                      const newTargetDataIndex = Math.max(
                        0,
                        Math.min(totalRemaining, totalRemaining - effectiveSlot)
                      );
                      reorderLayer(draggedId, newTargetDataIndex);
                    }
                    setDraggedId(null);
                    setDropTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDropTarget(null);
                  }}
                  onClick={() => onSelectLayer(layer.id)}
                  className={cn(
                    "group relative flex items-center justify-between p-2 rounded-md select-none transition-colors",
                    isDraggable
                      ? "cursor-pointer active:cursor-grabbing"
                      : "cursor-default",
                    isSelected
                      ? "bg-accent text-foreground ring-1 ring-primary/40 shadow-sm"
                      : "hover:bg-muted/70 text-foreground",
                    isDropTop && "border-t-2 border-t-primary shadow-[0_-2px_4px_rgba(var(--primary),0.2)]",
                    isDropBottom && "border-b-2 border-b-primary shadow-[0_2px_4px_rgba(var(--primary),0.2)]"
                  )}
                >
                {/* Icon + Name / Subtitle (flush, matching FlowNodeExplorer) */}
                <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                  <div
                    className="rounded-md w-8 h-8 flex justify-center items-center flex-none shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>

                  <div className="overflow-hidden flex-1 min-w-0">
                    {editingId === layer.id ? (
                      <Input
                        ref={renameInputRef}
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={commitRename}
                        className="h-6 py-0 px-1 text-sm font-medium w-full"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div
                          className="font-medium text-foreground leading-5 truncate select-none text-sm"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startRename(layer);
                          }}
                          title="Double-click to rename"
                        >
                          {layer.name}
                        </div>
                        {subtitle && (
                          <div className="text-xs text-muted-foreground truncate select-none">
                            {subtitle}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right side controls: permanently exposed Eye + Lock + More */}
                <div
                  className="flex items-center space-x-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Visibility button: exposed */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { visible: !layer.visible });
                    }}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                  >
                    {layer.visible ? (
                      <EyeIcon className="h-4 w-4" />
                    ) : (
                      <EyeOffIcon className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </Button>

                  {/* Lock button: exposed */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { locked: !layer.locked });
                    }}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                  >
                    {layer.locked ? (
                      <LockIcon className="h-4 w-4 text-amber-500 hover:text-amber-400" />
                    ) : (
                      <UnlockIcon className="h-4 w-4 text-muted-foreground/60 hover:text-foreground" />
                    )}
                  </Button>

                  {/* Dropdown Menu for additional actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
                        title="More options"
                      >
                        <MoreVerticalIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        disabled={actualIndex >= template.data.layers.length - 1}
                        onClick={() => reorderLayer(layer.id, actualIndex + 1)}
                      >
                        <ChevronUpIcon className="mr-2 h-4 w-4" />
                        <span>Bring forward</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={actualIndex >= template.data.layers.length - 1}
                        onClick={() => reorderLayer(layer.id, template.data.layers.length - 1)}
                      >
                        <ChevronsUpIcon className="mr-2 h-4 w-4" />
                        <span>Bring to front</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={actualIndex <= 0}
                        onClick={() => reorderLayer(layer.id, actualIndex - 1)}
                      >
                        <ChevronDownIcon className="mr-2 h-4 w-4" />
                        <span>Send backward</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={actualIndex <= 0}
                        onClick={() => reorderLayer(layer.id, 0)}
                      >
                        <ChevronsDownIcon className="mr-2 h-4 w-4" />
                        <span>Send to back</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => startRename(layer)}>
                        <PencilIcon className="mr-2 h-4 w-4" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateLayer(layer.id)}>
                        <CopyPlusIcon className="mr-2 h-4 w-4" />
                        <span>Duplicate</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                      >
                        {layer.locked ? (
                          <>
                            <UnlockIcon className="mr-2 h-4 w-4" />
                            <span>Unlock</span>
                          </>
                        ) : (
                          <>
                            <LockIcon className="mr-2 h-4 w-4" />
                            <span>Lock</span>
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => removeLayer(layer.id)}
                      >
                        <Trash2Icon className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}

          {/* Canvas Base Card */}
          <div className="pt-3 mt-2 border-t border-border/50">
            <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
              Canvas base
            </div>
            <div
              onClick={() => onSelectLayer("canvas")}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md select-none cursor-pointer transition-colors",
                selectedLayerId === "canvas"
                  ? "bg-accent text-foreground ring-1 ring-primary/40 shadow-sm"
                  : "hover:bg-muted/70 text-foreground"
              )}
            >
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div
                  className="rounded-md w-8 h-8 flex justify-center items-center flex-none shadow-sm"
                  style={{ backgroundColor: "#475569" }}
                >
                  <LayoutTemplateIcon className="h-4 w-4 text-white" />
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="font-medium text-foreground leading-5 truncate text-sm">
                    Canvas
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {template.width} × {template.height} px
                    {canvasRadius > 0 ? ` • ${canvasRadius}px radius` : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function AddLayerTab({
  onSelectLayer,
}: {
  onSelectLayer: (id: string) => void;
}) {
  const template = useImageEditorStore((s) => s.template);
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapsed = (title: string) =>
    setCollapsed((c) => ({ ...c, [title]: !c[title] }));

  const handleAdd = (type: string) => {
    // Stagger newly added layers diagonally so each successive layer is offset (+24px, +48px...)
    const nonBgLayers = template.data.layers.filter((l: Layer) => l.type !== "background");
    const count = nonBgLayers.length;
    const step = (count % 8) * 24;

    const baseCenterX = Math.round(template.width / 2 - 120);
    const baseCenterY = Math.round(template.height / 2 - 24);

    const artboardCenterX = Math.max(20, Math.min(template.width - 240, baseCenterX + step));
    const artboardCenterY = Math.max(20, Math.min(template.height - 80, baseCenterY + step));

    const items: Record<
      string,
      Partial<Layer> & { type: Layer["type"]; name: string }
    > = {
      text: {
        name: "Text",
        type: "text",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 260,
        height: 48,
        content: "New Text",
        font_size: 24,
        font_weight: "bold",
        color: "#ffffff",
        text_align: "left",
      },
      dynamic_text: {
        name: "Dynamic Text",
        type: "text",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 280,
        height: 48,
        content: "{{user.username}}",
        font_size: 24,
        font_weight: "bold",
        color: "#5865F2",
        text_align: "left",
        auto_fit: true,
      },
      image: {
        name: "Image / Avatar",
        type: "image",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 120,
        height: 120,
        image_url: DEFAULT_PLACEHOLDER_PHOTO,
        border_radius: 12,
        object_fit: "cover",
      },
      background: {
        name: "Background",
        type: "background",
        x: 0,
        y: 0,
        width: template.width,
        height: template.height,
        color: "#1e1f22",
        border_radius: 0,
      },
      progress_bar: {
        name: "Progress Bar",
        type: "progress_bar",
        progress_style: "bar",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 340,
        height: 24,
        value: "65",
        max_value: "100",
        fill_color: "#5865F2",
        background_color: "rgba(255, 255, 255, 0.15)",
        border_radius: 12,
      },
      progress_ring: {
        name: "Progress Ring",
        type: "progress_bar",
        progress_style: "ring",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 110,
        height: 110,
        value: "65",
        max_value: "100",
        fill_color: "#5865F2",
        background_color: "rgba(255, 255, 255, 0.15)",
        show_text: true,
        font_size: 16,
      },
      progress_segmented: {
        name: "Segmented Bar",
        type: "progress_bar",
        progress_style: "segmented",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 340,
        height: 22,
        value: "65",
        max_value: "100",
        fill_color: "#57f287",
        background_color: "rgba(255, 255, 255, 0.15)",
        border_radius: 4,
      },
      badge: {
        name: "Badge",
        type: "badge",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 100,
        height: 32,
        label: "VIP",
        color: "#5865F2",
        text_color: "#ffffff",
        font_size: 13,
        border_radius: 16,
      },
      repeater: {
        name: "Leaderboard List",
        type: "repeater",
        x: artboardCenterX,
        y: artboardCenterY,
        width: 420,
        height: 160,
        items_expression: "leaderboard",
        max_items: 5,
        gap: 8,
      },
      shape: {
        name: "Rectangle",
        type: "shape",
        shape_type: "rectangle",
        freeform: true,
        x: artboardCenterX,
        y: artboardCenterY,
        width: 240,
        height: 120,
        color: "#2b2d31",
        border_radius: 8,
        border_width: 1,
        border_color: "#3f4147",
      },
      circle: {
        name: "Circle",
        type: "shape",
        shape_type: "circle",
        freeform: false,
        x: artboardCenterX,
        y: artboardCenterY,
        width: 120,
        height: 120,
        color: "#5865F2",
        border_radius: 9999,
        border_width: 0,
      },
      hexagon: {
        name: "Hexagon",
        type: "shape",
        shape_type: "hexagon",
        freeform: false,
        x: artboardCenterX,
        y: artboardCenterY,
        width: 120,
        height: 120,
        color: "#5865F2",
        border_width: 0,
      },
      diamond: {
        name: "Diamond",
        type: "shape",
        shape_type: "diamond",
        freeform: false,
        x: artboardCenterX,
        y: artboardCenterY,
        width: 120,
        height: 120,
        color: "#eb459e",
        border_width: 0,
      },
      star: {
        name: "Star",
        type: "shape",
        shape_type: "star",
        freeform: false,
        x: artboardCenterX,
        y: artboardCenterY,
        width: 100,
        height: 100,
        color: "#faa61a",
        border_width: 0,
      },
    };

    const item = items[type];
    if (item) {
      addLayer(item);
    }
  };

  const sections = [
    {
      title: "Core Elements",
      items: [
        {
          id: "text",
          title: "Text",
          desc: "Heading, label, or dynamic text.",
          icon: TypeIcon,
          color: "#3b82f6",
        },
        {
          id: "image",
          title: "Image / Avatar",
          desc: "Custom graphic or profile picture.",
          icon: ImageIcon,
          color: "#10b981",
        },
        {
          id: "background",
          title: "Background",
          desc: "Full-canvas background fill.",
          icon: LayersIcon,
          color: "#64748b",
        },
      ],
    },
    {
      title: "Components & Dynamic",
      items: [
        {
          id: "dynamic_text",
          title: "Auto-Fit Text",
          desc: "Placeholder text that shrinks to fit.",
          icon: BracesIcon,
          color: "#5865F2",
        },
        {
          id: "progress_bar",
          title: "Progress Bar",
          desc: "Horizontal bar for XP or levels.",
          icon: ActivityIcon,
          color: "#f59e0b",
        },
        {
          id: "progress_ring",
          title: "Progress Ring",
          desc: "Circular progress gauge with percentage.",
          icon: CircleIcon,
          color: "#f59e0b",
        },
        {
          id: "progress_segmented",
          title: "Segmented Bar",
          desc: "10-step bar for health or rank tiers.",
          icon: ActivityIcon,
          color: "#57f287",
        },
        {
          id: "badge",
          title: "Badge",
          desc: "Rounded pill tag for roles or rank.",
          icon: TagIcon,
          color: "#ec4899",
        },
        {
          id: "repeater",
          title: "Leaderboard List",
          desc: "Repeating rows bound to a list variable.",
          icon: ListOrderedIcon,
          color: "#06b6d4",
        },
      ],
    },
    {
      title: "Shapes & Containers",
      items: [
        {
          id: "shape",
          title: "Rectangle",
          desc: "Card container, divider, or panel.",
          icon: SquareIcon,
          color: "#8b5cf6",
        },
        {
          id: "circle",
          title: "Circle",
          desc: "Circular frame or accent shape.",
          icon: CircleIcon,
          color: "#8b5cf6",
        },
        {
          id: "hexagon",
          title: "Hexagon",
          desc: "Six-sided polygon shape.",
          icon: HexagonIcon,
          color: "#8b5cf6",
        },
        {
          id: "diamond",
          title: "Diamond",
          desc: "Four-sided diamond shape.",
          icon: DiamondIcon,
          color: "#eb459e",
        },
        {
          id: "star",
          title: "Star",
          desc: "Five-pointed star icon.",
          icon: StarIcon,
          color: "#faa61a",
        },
      ],
    },
  ];

  const normalizedSearch = search.toLowerCase().trim();
  const filteredSections = sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (item) =>
          item.title.toLowerCase().includes(normalizedSearch) ||
          item.desc.toLowerCase().includes(normalizedSearch)
      ),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      {/* Header exactly matching FlowNodeExplorer */}
      <div className="p-5 flex-none">
        <div className="text-xl font-bold text-foreground mb-2">Add Layer</div>
        <div className="text-muted-foreground mb-5">
          Choose an element to place on your canvas.
        </div>
        <div className="relative">
          <Input
            placeholder="Search ..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchIcon className="absolute size-5 left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Sections and Items matching FlowNodeExplorer */}
      <ScrollArea className="flex-1 min-h-0 mr-1">
        <div className="space-y-3 pl-3 pr-1 pb-5">
          {filteredSections.map((section, i) => {
            const isCollapsed = !normalizedSearch && collapsed[section.title];
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(section.title)}
                  className="w-full flex items-center gap-1 text-foreground font-medium mb-2 px-2 hover:text-foreground/80"
                >
                  {isCollapsed ? (
                    <ChevronRightIcon className="h-4 w-4 flex-none" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4 flex-none" />
                  )}
                  <span>{section.title}</span>
                  <span className="ml-auto text-muted-foreground text-sm font-normal">
                    {section.items.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleAdd(item.id)}
                          className="p-2 hover:bg-muted rounded-md relative select-none cursor-pointer"
                        >
                          <div className="flex items-start space-x-3">
                            <div
                              className="rounded-md w-8 h-8 flex justify-center items-center flex-none"
                              style={{ backgroundColor: item.color }}
                            >
                              <Icon className="h-5 w-5 text-white" />
                            </div>
                            <div className="overflow-hidden">
                              <div className="font-medium text-foreground leading-5 truncate mb-1">
                                {item.title}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function TemplatesTab() {
  const template = useImageEditorStore((s) => s.template);
  const replaceAll = useImageEditorStore((s) => s.replaceAll);
  const setHasUnsavedChanges = useImageEditorStore((s) => s.setHasUnsavedChanges);
  const beginAction = useImageEditorStore((s) => s.beginAction);

  const handleApplyPreset = (presetId: string) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    beginAction();
    replaceAll({
      ...template,
      width: preset.width,
      height: preset.height,
      data: JSON.parse(JSON.stringify(preset.data)),
      sample_data: JSON.parse(JSON.stringify(preset.sample_data)),
    });
    setHasUnsavedChanges(true);
    toast.success(`Applied "${preset.name}" template`);
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      <div className="p-5 flex-none">
        <div className="text-xl font-bold text-foreground mb-2">
          Starter Templates
        </div>
        <div className="text-muted-foreground">
          Replace the current canvas with a pre-built layout.
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 mr-1">
        <div className="space-y-2 pl-3 pr-2 pb-5">
          {TEMPLATE_PRESETS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleApplyPreset(preset.id)}
              className="p-2 hover:bg-muted rounded-md select-none cursor-pointer"
            >
              <div className="flex items-start space-x-3">
                <div
                  className="rounded-md w-8 h-8 flex justify-center items-center flex-none"
                  style={{ backgroundColor: "#5865F2" }}
                >
                  <LayoutTemplateIcon className="h-5 w-5 text-white" />
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-medium text-foreground leading-5 truncate">
                      {preset.name}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono flex-none">
                      {preset.width}×{preset.height}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {preset.description}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function SettingsTab({ onSwitchToCanvas }: { onSwitchToCanvas?: () => void }) {
  const editorPreferences = useImageEditorStore((s) => s.editorPreferences);
  const setEditorPreferences = useImageEditorStore((s) => s.setEditorPreferences);

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      <div className="p-5 flex-none">
        <div className="text-xl font-bold text-foreground mb-2">
          Editor Settings
        </div>
        <div className="text-muted-foreground">
          Configure workspace guides, snapping, and grid styling.
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 w-full px-5 pb-5">
        <div className="space-y-6 pb-6">
          <div>
            <div className="font-medium text-foreground mb-1">
              Smart Alignment Guides
            </div>
            <div className="text-muted-foreground text-sm mb-3">
              Show guidelines when aligning layers with edges and center points.
            </div>
            <Switch
              checked={editorPreferences.smartGuides}
              onCheckedChange={(checked) =>
                setEditorPreferences({ smartGuides: checked })
              }
            />
          </div>

          <div>
            <div className="font-medium text-foreground mb-1">
              Snap to Grid
            </div>
            <div className="text-muted-foreground text-sm mb-3">
              Snap layer coordinates to 8px intervals when dragging.
            </div>
            <Switch
              checked={editorPreferences.snapToGrid}
              onCheckedChange={(checked) =>
                setEditorPreferences({ snapToGrid: checked })
              }
            />
          </div>

          <div>
            <div className="font-medium text-foreground mb-1">
              Hover Outlines
            </div>
            <div className="text-muted-foreground text-sm mb-3">
              Highlight layers with an outline when hovering over them on canvas.
            </div>
            <Switch
              checked={editorPreferences.showHoverOutlines}
              onCheckedChange={(checked) =>
                setEditorPreferences({ showHoverOutlines: checked })
              }
            />
          </div>

          <div>
            <div className="font-medium text-foreground mb-1">
              Canvas Background
            </div>
            <div className="text-muted-foreground text-sm mb-2">
              Workspace pattern behind the canvas in the viewport.
            </div>
            <Select
              value={editorPreferences.gridStyle}
              onValueChange={(val: any) =>
                setEditorPreferences({ gridStyle: val })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dots">Dots</SelectItem>
                <SelectItem value="lines">Lines</SelectItem>
                <SelectItem value="cross">Cross</SelectItem>
                <SelectItem value="none">Blank</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 border-t border-border/50">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={onSwitchToCanvas}
            >
              <LayoutTemplateIcon className="h-4 w-4 text-muted-foreground" />
              <span>Canvas Settings</span>
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function getNestedValue(obj: any, path: string): any {
  if (!obj) return "";
  if (obj[path] !== undefined) return obj[path];
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return "";
    cur = cur[p];
  }
  return cur !== undefined && cur !== null ? cur : "";
}

function setNestedValue(obj: any, path: string, value: any): any {
  const copy = JSON.parse(JSON.stringify(obj || {}));
  const parts = path.split(".");
  if (parts.length === 1) {
    copy[path] = value;
    return copy;
  }
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return copy;
}

function deleteNestedValue(obj: any, path: string): any {
  const copy = JSON.parse(JSON.stringify(obj || {}));
  if (copy[path] !== undefined) {
    delete copy[path];
    return copy;
  }
  const parts = path.split(".");
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== "object") return copy;
    cur = cur[parts[i]];
  }
  if (cur && typeof cur === "object") {
    delete cur[parts[parts.length - 1]];
  }
  return copy;
}

function CanvasProperties({ onClose }: { onClose: () => void }) {
  const template = useImageEditorStore((s) => s.template);
  const setName = useImageEditorStore((s) => s.setName);
  const setDescription = useImageEditorStore((s) => s.setDescription);
  const setDimensions = useImageEditorStore((s) => s.setDimensions);
  const setCanvasBorderRadius = useImageEditorStore((s) => s.setCanvasBorderRadius);
  const setSampleData = useImageEditorStore((s) => s.setSampleData);
  const setFormat = useImageEditorStore((s) => s.setFormat);

  const canvasRadius = template.data?.border_radius ?? 0;
  const maxRadius = Math.round(Math.min(template.width, template.height) / 2);

  const presets = [
    { label: "Rank & Level Card (850 × 280)", w: 850, h: 280 },
    { label: "Welcome Banner (800 × 360)", w: 800, h: 360 },
    { label: "Standard Card (800 × 400)", w: 800, h: 400 },
    { label: "Server Leaderboard (800 × 480)", w: 800, h: 480 },
    { label: "Level Up Announcement (800 × 260)", w: 800, h: 260 },
    { label: "Discord Welcome Banner (1200 × 400)", w: 1200, h: 400 },
    { label: "Discord Server Banner (960 × 540)", w: 960, h: 540 },
    { label: "Discord Embed Card (800 × 450)", w: 800, h: 450 },
    { label: "Discord Profile Banner (600 × 240)", w: 600, h: 240 },
    { label: "Discord Server Icon (512 × 512)", w: 512, h: 512 },
  ];

  const matchedPreset = presets.find(
    (p) => p.w === template.width && p.h === template.height
  );
  const selectedPresetValue = matchedPreset ? matchedPreset.label : "custom";

  const detectedMetaMap = useMemo(() => {
    return extractPlaceholdersFromLayers(template.data.layers);
  }, [template.data.layers]);

  const sampleData = template.sample_data || {};

  const allVarKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [key] of detectedMetaMap.entries()) {
      if (!/\.(dominant|average|inverse|dominant_inverse)$/.test(key) && key !== "_layers") {
        keys.add(key);
      }
    }
    Object.keys(sampleData).forEach((k) => {
      if (!/\.(dominant|average|inverse|dominant_inverse)$/.test(k) && k !== "_layers") {
        keys.add(k);
      }
    });
    return Array.from(keys);
  }, [detectedMetaMap, sampleData]);

  const [viewMode, setViewMode] = useState<"fields" | "json">("fields");
  const [showAddVar, setShowAddVar] = useState(false);
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarVal, setNewVarVal] = useState("");

  const [rawJson, setRawJson] = useState(() =>
    JSON.stringify(template.sample_data || {}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setRawJson(JSON.stringify(template.sample_data || {}, null, 2));
      setJsonError(null);
    } catch {
      // ignore
    }
  }, [template.sample_data]);

  const handleRawJsonChange = (val: string) => {
    setRawJson(val);
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);
      setSampleData(parsed);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  const handleVarChange = (key: string, val: string) => {
    let parsedVal: any = val;
    if (val !== "" && !isNaN(Number(val)) && !val.startsWith("0x")) {
      parsedVal = Number(val);
    }
    const next = setNestedValue(sampleData, key, parsedVal);
    setSampleData(next);
  };

  const handleRemoveVar = (key: string) => {
    const next = deleteNestedValue(sampleData, key);
    setSampleData(next);
  };

  const handleAddVariable = () => {
    const trimmed = newVarKey.trim();
    if (!trimmed) return;
    let parsedVal: any = newVarVal;
    if (newVarVal !== "" && !isNaN(Number(newVarVal)) && !newVarVal.startsWith("0x")) {
      parsedVal = Number(newVarVal);
    }
    const next = setNestedValue(sampleData, trimmed, parsedVal);
    setSampleData(next);
    setNewVarKey("");
    setNewVarVal("");
    setShowAddVar(false);
  };

  const colorPanel = useColorPanel();
  const tmplSlug =
    (template.name || "image")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "image";

  return (
    <div className="absolute top-0 left-0 w-96 h-full bg-background flex flex-col min-h-0 overflow-hidden z-20">
      <ScrollArea className="flex-1 min-h-0 w-full">
        <div className="p-5 space-y-5 pb-8">
          {/* Header Block matching Block Settings pattern */}
          <div className="flex-none">
            <div className="flex items-start justify-between mb-4">
              <div className="text-xl font-bold text-foreground">
                Canvas Settings
              </div>
              <XIcon
                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={onClose}
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="text-lg font-bold text-foreground">
                  Image Template
                </div>
                <a
                  href="https://docs.kitebot.io/image-generation"
                  target="_blank"
                  rel="noreferrer"
                  title="View documentation"
                  className="inline-flex items-center"
                >
                  <HelpCircleIcon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                </a>
              </div>
              <div className="text-sm text-muted-foreground mb-3 leading-relaxed">
                Configure template dimensions, corner rounding, and dynamic variable preview data.
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`{{${tmplSlug}}}`);
                        toast.success("Template tag copied");
                      }}
                      className="bg-primary/10 hover:bg-primary/20 text-primary font-mono rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <CopyIcon className="h-3 w-3 opacity-70" />
                      <span>{`{{${tmplSlug}}}`}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Click to copy template tag</TooltipContent>
                </Tooltip>

                <span className="bg-muted text-muted-foreground font-mono rounded px-2 py-1 text-xs">
                  {template.width} × {template.height}
                </span>
              </div>
            </div>
          </div>

          {/* Template Info */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Template Name</Label>
              <Input
                value={template.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description (Optional)</Label>
              <Input
                value={template.description || ""}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Canvas Size & Rounding */}
          <div className="space-y-4 pt-3 border-t border-border/50">
            <div className="text-sm font-medium text-foreground">Canvas Dimensions</div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Size Preset</Label>
              <Select
                value={selectedPresetValue}
                onValueChange={(val) => {
                  if (val === "custom") return;
                  const preset = presets.find((p) => p.label === val);
                  if (preset) setDimensions(preset.w, preset.h);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a size preset..." />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.label} value={p.label}>
                      {p.label}
                    </SelectItem>
                  ))}
                  {!matchedPreset && (
                    <SelectItem value="custom">
                      Custom ({template.width} × {template.height})
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Width (px)</Label>
                <NumberInput
                  min={50}
                  max={4000}
                  value={template.width}
                  fallbackOnBlur={800}
                  onChange={(val) => setDimensions(val, template.height)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Height (px)</Label>
                <NumberInput
                  min={50}
                  max={4000}
                  value={template.height}
                  fallbackOnBlur={360}
                  onChange={(val) => setDimensions(template.width, val)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Corner Radius (px)</Label>
                <span className="text-xs text-muted-foreground font-mono">{canvasRadius}px</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={maxRadius}
                  step={1}
                  value={canvasRadius}
                  onChange={(e) => setCanvasBorderRadius(parseInt(e.target.value) || 0)}
                  className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
                />
                <NumberInput
                  min={0}
                  max={maxRadius}
                  value={canvasRadius}
                  onChange={(val) => setCanvasBorderRadius(val)}
                  className="w-16 h-8 text-xs font-mono text-center"
                />
              </div>
            </div>
          </div>

          {/* Sample Preview Data */}
          <div className="space-y-4 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Sample Preview Data</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Values for previewing variables on canvas.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setViewMode(viewMode === "fields" ? "json" : "fields")}
              >
                {viewMode === "fields" ? (
                  <>
                    <BracesIcon className="h-3.5 w-3.5" />
                    <span>JSON</span>
                  </>
                ) : (
                  <>
                    <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                    <span>Fields</span>
                  </>
                )}
              </Button>
            </div>

            {viewMode === "json" ? (
              <div className="space-y-2">
                <Textarea
                  value={rawJson}
                  onChange={(e) => handleRawJsonChange(e.target.value)}
                  rows={8}
                  className="font-mono text-xs leading-relaxed"
                  placeholder="{}"
                />
                {jsonError && (
                  <div className="text-xs text-destructive font-mono">{jsonError}</div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {allVarKeys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-1">
                    <div className="text-xs text-muted-foreground">
                      No dynamic variables detected on this template.
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Add variables like <code className="text-foreground">{"{{username}}"}</code> to text or image layers.
                    </div>
                  </div>
                ) : (
                  allVarKeys.map((key) => {
                    const val = getNestedValue(sampleData, key);
                    const displayVal =
                      typeof val === "object" ? JSON.stringify(val) : String(val ?? "");

                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground font-mono">
                            {`{{${key}}}`}
                          </Label>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive text-xs"
                            onClick={() => handleRemoveVar(key)}
                            title="Remove variable"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Input
                          value={displayVal}
                          onChange={(e) => handleVarChange(key, e.target.value)}
                          placeholder={`Sample ${key}...`}
                        />
                      </div>
                    );
                  })
                )}

                {showAddVar ? (
                  <div className="space-y-3 p-3 rounded-md bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Variable Name</Label>
                      <Input
                        value={newVarKey}
                        onChange={(e) => setNewVarKey(e.target.value.trim())}
                        placeholder="e.g. username"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sample Value</Label>
                      <Input
                        value={newVarVal}
                        onChange={(e) => setNewVarVal(e.target.value)}
                        placeholder="e.g. Kite User"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddVar(false);
                          setNewVarKey("");
                          setNewVarVal("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddVariable}
                        disabled={!newVarKey.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => setShowAddVar(true)}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    <span>Add Custom Variable</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
function getLayerMeta(type: string): {
  title: string;
  description: string;
  docsPage: string;
} {
  switch (type) {
    case "text":
      return {
        title: "Text Layer",
        description:
          "Renders dynamic or static text with customizable typography, alignment, and wrapping.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#text",
      };
    case "image":
      return {
        title: "Image / Avatar Layer",
        description:
          "Displays images or user avatars with aspect fitting, rounding, and status dots.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#image",
      };
    case "shape":
      return {
        title: "Shape Layer",
        description:
          "Vector shapes including rectangles, circles, and polygons with solid or gradient fills.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#shape",
      };
    case "background":
      return {
        title: "Background Layer",
        description:
          "Full-card background layer supporting solid colors, gradients, and wallpaper styles.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#background",
      };
    case "progress_bar":
      return {
        title: "Progress Bar Layer",
        description:
          "Visual indicator supporting linear bars, circular rings, and step segments.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#progress-bar",
      };
    case "badge":
      return {
        title: "Badge Layer",
        description:
          "Compact pill or badge container for ranks, status labels, or counters.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#badge",
      };
    case "repeater":
      return {
        title: "Repeater Layer",
        description:
          "Dynamically repeats items or leaderboard rows from array data.",
        docsPage: "https://docs.kitebot.io/image-generation/layers#repeater",
      };
    default:
      return {
        title: "Layer",
        description: "Customize appearance and positioning for this layer.",
        docsPage: "https://docs.kitebot.io/image-generation/layers",
      };
  }
}

function CornerRadiusControl({
  value,
  onChange,
  max = 120,
}: {
  value: number;
  onChange: (val: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Corner Radius</Label>
        <span className="text-xs text-muted-foreground font-mono">{value || 0}px</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value || 0}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
        />
        <NumberInput
          min={0}
          max={max}
          value={value || 0}
          onChange={(val) => onChange(val)}
          className="w-16 h-8 text-xs font-mono text-center"
        />
      </div>
    </div>
  );
}

function BorderControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasBorder = (layer.border_width || 0) > 0;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Border</Label>
          <div className="text-[11px] text-muted-foreground">Add an outline around this element</div>
        </div>
        <Switch
          checked={hasBorder}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                border_width: layer.border_width && layer.border_width > 0 ? layer.border_width : 2,
                border_color: layer.border_color || "#3f4147",
              });
            } else {
              onUpdate({ border_width: 0 });
            }
          }}
        />
      </div>

      {hasBorder && (
        <div className="pt-2 border-t border-border/40 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Width</Label>
              <span className="text-xs text-muted-foreground font-mono">{layer.border_width || 0}px</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={layer.border_width || 2}
                onChange={(e) => onUpdate({ border_width: parseInt(e.target.value) || 1 })}
                className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
              />
              <NumberInput
                min={0}
                max={40}
                value={layer.border_width || 2}
                onChange={(val) => onUpdate({ border_width: val })}
                className="w-16 h-8 text-xs font-mono text-center"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Border Color</Label>
            <ColorInput
              value={layer.border_color || "#3f4147"}
              onChange={(border_color) => onUpdate({ border_color })}
              placeholder="#3f4147"
            />
          </div>

          {layer.type === "image" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Border Style</Label>
              <Select
                value={layer.border_mode || "silhouette"}
                onValueChange={(val) => onUpdate({ border_mode: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="silhouette">
                    Silhouette (Hugs transparent graphic)
                  </SelectItem>
                  <SelectItem value="box">
                    Bounding Box (Outer frame)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShadowControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasShadow = (layer.shadow_blur || 0) > 0 || !!layer.shadow_color;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Drop Shadow</Label>
          <div className="text-[11px] text-muted-foreground">Soft shadow cast beneath this layer</div>
        </div>
        <Switch
          checked={hasShadow}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                shadow_blur: layer.shadow_blur && layer.shadow_blur > 0 ? layer.shadow_blur : 8,
                shadow_color: layer.shadow_color || "rgba(0, 0, 0, 0.5)",
              });
            } else {
              onUpdate({ shadow_blur: 0, shadow_color: undefined });
            }
          }}
        />
      </div>

      {hasShadow && (
        <div className="pt-2 border-t border-border/40 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Blur Radius</Label>
              <span className="text-xs text-muted-foreground font-mono">{layer.shadow_blur || 0}px</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={layer.shadow_blur || 8}
                onChange={(e) => onUpdate({ shadow_blur: parseInt(e.target.value) || 1 })}
                className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
              />
              <NumberInput
                min={0}
                max={60}
                value={layer.shadow_blur || 8}
                onChange={(val) => onUpdate({ shadow_blur: val })}
                className="w-16 h-8 text-xs font-mono text-center"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Shadow Color</Label>
            <ColorInput
              value={layer.shadow_color || "rgba(0, 0, 0, 0.5)"}
              onChange={(shadow_color) => onUpdate({ shadow_color })}
              placeholder="rgba(0, 0, 0, 0.5)"
            />
          </div>

          {layer.type === "image" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Shadow Style</Label>
              <Select
                value={layer.shadow_mode || "silhouette"}
                onValueChange={(val) => onUpdate({ shadow_mode: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="silhouette">
                    Silhouette (Hugs transparent graphic)
                  </SelectItem>
                  <SelectItem value="box">
                    Bounding Box (Outer frame)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BackdropBlurControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasBlur = (layer.backdrop_blur || 0) > 0;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Backdrop Blur</Label>
          <div className="text-[11px] text-muted-foreground">Glassmorphism frosted background</div>
        </div>
        <Switch
          checked={hasBlur}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                backdrop_blur: layer.backdrop_blur && layer.backdrop_blur > 0 ? layer.backdrop_blur : 16,
                border_width: layer.border_width || 1,
                border_color: layer.border_color || "rgba(255, 255, 255, 0.2)",
              });
            } else {
              onUpdate({ backdrop_blur: 0 });
            }
          }}
        />
      </div>

      {hasBlur && (
        <div className="pt-2 border-t border-border/40 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Blur Intensity</Label>
            <span className="text-xs text-muted-foreground font-mono">{layer.backdrop_blur || 0}px</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={layer.backdrop_blur || 12}
              onChange={(e) => onUpdate({ backdrop_blur: parseInt(e.target.value) || 1 })}
              className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
            />
            <NumberInput
              min={0}
              max={60}
              value={layer.backdrop_blur || 12}
              onChange={(val) => onUpdate({ backdrop_blur: val })}
              className="w-16 h-8 text-xs font-mono text-center"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LayerBlurControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasBlur = (layer.blur || 0) > 0;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Layer Blur</Label>
          <div className="text-[11px] text-muted-foreground">Gaussian blur on this element</div>
        </div>
        <Switch
          checked={hasBlur}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({ blur: layer.blur && layer.blur > 0 ? layer.blur : 8 });
            } else {
              onUpdate({ blur: 0 });
            }
          }}
        />
      </div>

      {hasBlur && (
        <div className="pt-2 border-t border-border/40 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Blur Radius</Label>
            <span className="text-xs text-muted-foreground font-mono">{layer.blur || 0}px</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={layer.blur || 8}
              onChange={(e) => onUpdate({ blur: parseInt(e.target.value) || 1 })}
              className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
            />
            <NumberInput
              min={0}
              max={100}
              value={layer.blur || 8}
              onChange={(val) => onUpdate({ blur: val })}
              className="w-16 h-8 text-xs font-mono text-center"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TextOutlineControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasOutline = (layer.stroke_width || 0) > 0;
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Text Outline</Label>
          <div className="text-[11px] text-muted-foreground">Contour stroke around text letters</div>
        </div>
        <Switch
          checked={hasOutline}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                stroke_width: layer.stroke_width && layer.stroke_width > 0 ? layer.stroke_width : 2,
                stroke_color: layer.stroke_color || "#000000",
              });
            } else {
              onUpdate({ stroke_width: 0 });
            }
          }}
        />
      </div>

      {hasOutline && (
        <div className="pt-2 border-t border-border/40 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Stroke Width</Label>
              <span className="text-xs text-muted-foreground font-mono">{layer.stroke_width || 0}px</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={layer.stroke_width || 2}
                onChange={(e) => onUpdate({ stroke_width: parseInt(e.target.value) || 1 })}
                className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
              />
              <NumberInput
                min={0}
                max={20}
                value={layer.stroke_width || 2}
                onChange={(val) => onUpdate({ stroke_width: val })}
                className="w-16 h-8 text-xs font-mono text-center"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Outline Color</Label>
            <ColorInput
              value={layer.stroke_color || "#000000"}
              onChange={(stroke_color) => onUpdate({ stroke_color })}
              placeholder="#000000"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DiscordStatusControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasStatus = !!layer.status_value && layer.status_value !== "none";
  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Discord Status Dot</Label>
          <div className="text-[11px] text-muted-foreground">Authentic status cutout icon on corner</div>
        </div>
        <Switch
          checked={hasStatus}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({ status_value: "online" });
            } else {
              onUpdate({ status_value: undefined });
            }
          }}
        />
      </div>

      {hasStatus && (
        <div className="pt-2 border-t border-border/40 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status Value</Label>
          <Select
            value={layer.status_value || "online"}
            onValueChange={(val: any) => onUpdate({ status_value: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">Online (Active)</SelectItem>
              <SelectItem value="idle">Idle (Away moon)</SelectItem>
              <SelectItem value="dnd">Do Not Disturb (Bar)</SelectItem>
              <SelectItem value="offline">Offline / Invisible</SelectItem>
              <SelectItem value="streaming">Streaming</SelectItem>
              <SelectItem value="{{status}}">Dynamic User Status ({"{{status}}"})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

const DECORATION_PRESETS = [
  {
    id: "dynamic",
    label: "Dynamic (Equipped User Decor)",
    value: "{{user.avatar_decoration}}",
  },
  {
    id: "sparks",
    label: "Spirit Sparks (Embers)",
    value:
      "https://cdn.discordapp.com/avatar-decoration-presets/a_1005898c6acf56a9ac5010baf444f6fd.png?size=240&passthrough=true",
  },
  {
    id: "sakura",
    label: "Sakura Blossoms",
    value:
      "https://cdn.discordapp.com/avatar-decoration-presets/a_0c0eeb351ae2cf48c6e1eee2cae49d40.png?size=240&passthrough=true",
  },
];

function DiscordAvatarDecorControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  const hasDecor = !!layer.avatar_decoration;
  const currentVal = layer.avatar_decoration || "";

  // Check if current value matches any known preset
  const matchedPreset = DECORATION_PRESETS.find((p) => p.value === currentVal);
  const selectValue = matchedPreset ? matchedPreset.id : "custom";

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-foreground">Discord Avatar Decoration</Label>
          <div className="text-[11px] text-muted-foreground">Equipped Discord frame or collectible decor</div>
        </div>
        <Switch
          checked={hasDecor}
          onCheckedChange={(checked) => {
            if (checked) {
              onUpdate({
                avatar_decoration:
                  layer.avatar_decoration || "{{user.avatar_decoration}}",
              });
            } else {
              onUpdate({ avatar_decoration: undefined });
            }
          }}
        />
      </div>

      {hasDecor && (
        <div className="pt-2 border-t border-border/40 space-y-2">
          <Label className="text-xs text-muted-foreground">Decoration Asset / Preset</Label>
          <Select
            value={selectValue}
            onValueChange={(val: string) => {
              if (val === "custom") {
                // Keep current or let user type
                if (matchedPreset) {
                  onUpdate({ avatar_decoration: "" });
                }
              } else {
                const found = DECORATION_PRESETS.find((p) => p.id === val);
                if (found) {
                  onUpdate({ avatar_decoration: found.value });
                }
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECORATION_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom URL / Variable</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={currentVal}
            onChange={(e) => onUpdate({ avatar_decoration: e.target.value })}
            placeholder="https://... or {{user.avatar_decoration}}"
            className="text-xs font-mono"
          />
        </div>
      )}
    </div>
  );
}

function TransformControls({
  layer,
  onUpdate,
}: {
  layer: Layer;
  onUpdate: (data: Partial<Layer>) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium text-foreground">Transform & Dimensions</Label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">X (px)</Label>
          <NumberInput
            value={layer.x}
            onChange={(val) => onUpdate({ x: val })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Y (px)</Label>
          <NumberInput
            value={layer.y}
            onChange={(val) => onUpdate({ y: val })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Width (px)</Label>
          <NumberInput
            min={1}
            max={8000}
            value={layer.width}
            onChange={(val) => onUpdate({ width: Math.max(1, val) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Height (px)</Label>
          <NumberInput
            min={1}
            max={8000}
            value={layer.height}
            onChange={(val) => onUpdate({ height: Math.max(1, val) })}
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Rotation (°)</Label>
            <span className="text-xs text-muted-foreground font-mono">{layer.rotation || 0}°</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={layer.rotation || 0}
              onChange={(e) => onUpdate({ rotation: parseFloat(e.target.value) || 0 })}
              className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
            />
            <NumberInput
              min={-360}
              max={360}
              value={layer.rotation || 0}
              onChange={(val) => onUpdate({ rotation: val })}
              className="w-16 h-8 text-xs font-mono text-center"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerProperties({
  layerId,
  onClose,
}: {
  layerId: string;
  onClose: () => void;
}) {
  const template = useImageEditorStore((s) => s.template);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const renameLayerId = useImageEditorStore((s) => s.renameLayerId);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const layer = template.data.layers.find((l: Layer) => l.id === layerId);

  if (!layer) return null;

  const colorPanel = useColorPanel();
  const tmplSlug =
    (template.name || "image")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "image";
  const fieldName =
    layer.type === "text"
      ? "text"
      : layer.type === "image"
      ? "image_url"
      : layer.type === "progress_bar"
      ? "value"
      : layer.type === "badge"
      ? "label"
      : "items";
  const layerVarTag = `{{${tmplSlug}.${layer.id}.${fieldName}}}`;
  const meta = getLayerMeta(layer.type);

  return (
    <div className="absolute top-0 left-0 w-96 h-full bg-background flex flex-col min-h-0 overflow-hidden z-20">
      <ScrollArea className="flex-1 min-h-0 w-full">
        <div className="p-5 space-y-5 pb-8">
          {/* Header Block matching FlowNodeEditor pattern */}
          <div className="flex-none">
            <div className="flex items-start justify-between mb-4">
              <div className="text-xl font-bold text-foreground">
                Layer Settings
              </div>
              <XIcon
                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={onClose}
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="text-lg font-bold text-foreground">
                  {meta.title}
                </div>
                {meta.docsPage && (
                  <a
                    href={meta.docsPage}
                    target="_blank"
                    rel="noreferrer"
                    title="View documentation"
                    className="inline-flex items-center"
                  >
                    <HelpCircleIcon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                  </a>
                )}
              </div>
              <div className="text-sm text-muted-foreground mb-3 leading-relaxed">
                {meta.description}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(layer.id);
                        toast.success("Layer ID copied");
                      }}
                      className="bg-muted hover:bg-muted/80 text-foreground font-mono rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <CopyIcon className="h-3 w-3 text-muted-foreground" />
                      <span>{layer.id}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Click to copy layer ID</TooltipContent>
                </Tooltip>

                {layer.type !== "shape" && layer.type !== "background" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(layerVarTag);
                          toast.success("Layer variable copied");
                        }}
                        className="bg-primary/10 hover:bg-primary/20 text-primary font-mono rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <CopyIcon className="h-3 w-3 opacity-70" />
                        <span>{layerVarTag}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click to copy template variable</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* Name & Visibility Toolbar */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center space-x-2">
              <Input
                value={layer.name}
                onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                className="flex-1"
                placeholder="Layer name"
              />
              <Button
                variant="outline"
                size="icon"
                className="flex-none"
                onClick={() =>
                  updateLayer(layer.id, { visible: !layer.visible })
                }
                title={layer.visible ? "Hide layer" : "Show layer"}
              >
                {layer.visible ? (
                  <EyeIcon className="h-4 w-4" />
                ) : (
                  <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="flex-none"
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                title={layer.locked ? "Unlock layer" : "Lock layer"}
              >
                {layer.locked ? (
                  <LockIcon className="h-4 w-4 text-amber-500" />
                ) : (
                  <UnlockIcon className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Opacity with Slider & Numeric Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Opacity</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round((layer.opacity ?? 1) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((layer.opacity ?? 1) * 100)}
                  onChange={(e) => {
                    const pct = parseInt(e.target.value) || 0;
                    updateLayer(layer.id, { opacity: pct / 100 });
                  }}
                  className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
                />
                <NumberInput
                  min={0}
                  max={100}
                  value={Math.round((layer.opacity ?? 1) * 100)}
                  onChange={(val) => updateLayer(layer.id, { opacity: val / 100 })}
                  className="w-16 h-8 text-xs font-mono text-center"
                />
              </div>
            </div>
          </div>

          {/* ==================== TYPE-SPECIFIC REGULAR SETTINGS ==================== */}

          {/* Text Layer Settings */}
          {layer.type === "text" && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Text Content
                </Label>
                <VariableFieldInput
                  value={layer.content || ""}
                  onChange={(content) => updateLayer(layer.id, { content })}
                  multiline
                  rows={3}
                  defaultVarName={
                    (layer.name || "text")
                      .toLowerCase()
                      .replace(/[^a-z0-9_]+/g, "_")
                      .replace(/^_+|_+$/g, "") || "text"
                  }
                  placeholder="e.g. Welcome {{username}}!"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Font</Label>
                  <FontSelect
                    value={layer.font_family || "inherit"}
                    onChange={(val) =>
                      updateLayer(layer.id, { font_family: val })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Size (px)
                  </Label>
                  <NumberInput
                    min={6}
                    max={300}
                    value={layer.font_size || 16}
                    onChange={(val) => updateLayer(layer.id, { font_size: val })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Weight
                  </Label>
                  <Select
                    value={layer.font_weight || "normal"}
                    onValueChange={(val) =>
                      updateLayer(layer.id, { font_weight: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Regular</SelectItem>
                      <SelectItem value="500">Medium</SelectItem>
                      <SelectItem value="600">Semibold</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                      <SelectItem value="900">Black</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <ColorInput
                    value={layer.color || "#ffffff"}
                    onChange={(color) => updateLayer(layer.id, { color })}
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              {/* 9-Point Text Alignment Pad + Selector */}
              {(() => {
                const raw = (layer.text_align || "left").toLowerCase();
                const hAlign = raw.includes("right")
                  ? "right"
                  : raw.includes("center") || raw === "middle"
                  ? "center"
                  : "left";
                const vAlign = layer.vertical_align
                  ? layer.vertical_align.toLowerCase()
                  : raw.includes("top")
                  ? "top"
                  : raw.includes("bottom")
                  ? "bottom"
                  : "middle";

                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Alignment & Anchor
                    </Label>
                    <div className="flex items-center gap-3">
                      {/* 3x3 Grid Pad */}
                      <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-md border border-border/50 shrink-0">
                        {[
                          { h: "left", v: "top", label: "Top Left", arrow: "↖" },
                          { h: "center", v: "top", label: "Top Middle", arrow: "↑" },
                          { h: "right", v: "top", label: "Top Right", arrow: "↗" },
                          { h: "left", v: "middle", label: "Middle Left", arrow: "←" },
                          { h: "center", v: "middle", label: "Center", arrow: "•" },
                          { h: "right", v: "middle", label: "Middle Right", arrow: "→" },
                          { h: "left", v: "bottom", label: "Bottom Left", arrow: "↙" },
                          { h: "center", v: "bottom", label: "Bottom Middle", arrow: "↓" },
                          { h: "right", v: "bottom", label: "Bottom Right", arrow: "↘" },
                        ].map((pos) => {
                          const isSelected = hAlign === pos.h && vAlign === pos.v;
                          return (
                            <button
                              key={`${pos.v}-${pos.h}`}
                              type="button"
                              title={pos.label}
                              onClick={() =>
                                updateLayer(layer.id, {
                                  text_align: pos.h,
                                  vertical_align: pos.v,
                                })
                              }
                              className={cn(
                                "w-7 h-7 rounded flex items-center justify-center text-xs transition-colors",
                                isSelected
                                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )}
                            >
                              {pos.arrow}
                            </button>
                          );
                        })}
                      </div>

                      {/* Alignment Dropdown */}
                      <div className="flex-1 space-y-1">
                        <Select
                          value={`${vAlign}-${hAlign}`}
                          onValueChange={(val) => {
                            const [v, h] = val.split("-");
                            updateLayer(layer.id, {
                              text_align: h,
                              vertical_align: v,
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="top-left">Top Left</SelectItem>
                            <SelectItem value="top-center">Top Middle</SelectItem>
                            <SelectItem value="top-right">Top Right</SelectItem>
                            <SelectItem value="middle-left">Middle Left</SelectItem>
                            <SelectItem value="middle-center">Center</SelectItem>
                            <SelectItem value="middle-right">Middle Right</SelectItem>
                            <SelectItem value="bottom-left">Bottom Left</SelectItem>
                            <SelectItem value="bottom-center">Bottom Middle</SelectItem>
                            <SelectItem value="bottom-right">Bottom Right</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-[11px] text-muted-foreground">
                          Wrapped text aligns to position
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium text-foreground">
                      Auto-shrink text
                    </Label>
                    <div className="text-[11px] text-muted-foreground">
                      Scales down font size if text overflows width
                    </div>
                  </div>
                  <Switch
                    checked={!!layer.auto_fit}
                    onCheckedChange={(checked) =>
                      updateLayer(layer.id, { auto_fit: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium text-foreground">
                      Truncate with ellipsis
                    </Label>
                    <div className="text-[11px] text-muted-foreground">
                      Cuts off overflow with ... on a single line
                    </div>
                  </div>
                  <Switch
                    checked={!!layer.truncate}
                    onCheckedChange={(checked) =>
                      updateLayer(layer.id, { truncate: checked })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Image Layer Settings */}
          {layer.type === "image" && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Image URL
                </Label>
                <VariableFieldInput
                  value={layer.image_url || ""}
                  onChange={(image_url) => updateLayer(layer.id, { image_url })}
                  defaultVarName="avatar_url"
                  defaultSampleValue={DEFAULT_PLACEHOLDER_PHOTO}
                  placeholder="https://... or {{user.avatar}}"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fit</Label>
                <Select
                  value={layer.object_fit || "cover"}
                  onValueChange={(val: any) =>
                    updateLayer(layer.id, { object_fit: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cover (Crop to fill)</SelectItem>
                    <SelectItem value="contain">Contain (Fit inside)</SelectItem>
                    <SelectItem value="fill">Fill (Stretch)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <CornerRadiusControl
                value={layer.border_radius || 0}
                onChange={(border_radius) => updateLayer(layer.id, { border_radius })}
                max={150}
              />
            </div>
          )}

          {/* Shape & Background Layers */}
          {(layer.type === "shape" || layer.type === "background") && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">
                  {layer.type === "shape" ? "Shape & Fill" : "Background"}
                </div>
                {layer.type === "background" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      updateLayer(layer.id, {
                        x: 0,
                        y: 0,
                        width: template.width,
                        height: template.height,
                      })
                    }
                  >
                    <MaximizeIcon className="h-3.5 w-3.5" />
                    <span>Fit to Canvas</span>
                  </Button>
                )}
              </div>

              {layer.type === "shape" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Shape</Label>
                  <Select
                    value={layer.shape_type || "rectangle"}
                    onValueChange={(val: any) => {
                      if (val === "rectangle") {
                        updateLayer(layer.id, {
                          shape_type: "rectangle",
                          freeform: true,
                        });
                      } else {
                        const size = Math.max(layer.width, layer.height);
                        updateLayer(layer.id, {
                          shape_type: val,
                          width: size,
                          height: size,
                          border_radius:
                            val === "circle" ? 9999 : layer.border_radius,
                          freeform: false,
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rectangle">Rectangle</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="hexagon">Hexagon</SelectItem>
                      <SelectItem value="diamond">Diamond</SelectItem>
                      <SelectItem value="star">Star</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Fill Type */}
              {(() => {
                const isGrad =
                  layer.fill_type === "solid"
                    ? false
                    : Boolean(
                        layer.fill_type === "gradient" ||
                        layer.fill_type === "linear-gradient" ||
                        (!layer.fill_type &&
                          layer.gradient?.stops &&
                          layer.gradient.stops.length > 0)
                      );
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Fill Type
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={isGrad ? "outline" : "secondary"}
                          size="sm"
                          onClick={() =>
                            updateLayer(layer.id, {
                              fill_type: "solid",
                              color:
                                layer.color ||
                                (layer.type === "background"
                                  ? "#1e1f22"
                                  : "#2b2d31"),
                            })
                          }
                        >
                          Solid Color
                        </Button>
                        <Button
                          type="button"
                          variant={isGrad ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => {
                            const existingGrad =
                              layer.gradient &&
                              layer.gradient.stops &&
                              layer.gradient.stops.length >= 2
                                ? layer.gradient
                                : {
                                    angle: 90,
                                    stops: [
                                      {
                                        offset: 0,
                                        color:
                                          layer.color ||
                                          (layer.type === "background"
                                            ? "#1e1f22"
                                            : "#5865F2"),
                                      },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  };
                            updateLayer(layer.id, {
                              fill_type: "linear-gradient",
                              gradient: existingGrad,
                            });
                          }}
                        >
                          Gradient
                        </Button>
                      </div>
                    </div>

                    {!isGrad ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Color
                        </Label>
                        <ColorInput
                          value={
                            layer.color ||
                            (layer.type === "background"
                              ? "#1e1f22"
                              : "#2b2d31")
                          }
                          onChange={(color) =>
                            updateLayer(layer.id, {
                              color,
                              fill_type: "solid",
                            })
                          }
                          placeholder={
                            layer.type === "background"
                              ? "#1e1f22"
                              : "#2b2d31"
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            Start Color
                          </Label>
                          <ColorInput
                            value={
                              layer.gradient?.stops?.[0]?.color || "#5865F2"
                            }
                            onChange={(color) => {
                              const stops = [
                                ...(layer.gradient?.stops || [
                                  { offset: 0, color: "#5865F2" },
                                  { offset: 100, color: "#eb459e" },
                                ]),
                              ];
                              stops[0] = { offset: 0, color };
                              updateLayer(layer.id, {
                                fill_type: "linear-gradient",
                                gradient: {
                                  angle: layer.gradient?.angle ?? 90,
                                  stops,
                                },
                              });
                            }}
                            placeholder="#5865F2"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            End Color
                          </Label>
                          <ColorInput
                            value={
                              layer.gradient?.stops?.[1]?.color || "#eb459e"
                            }
                            onChange={(color) => {
                              const stops = [
                                ...(layer.gradient?.stops || [
                                  { offset: 0, color: "#5865F2" },
                                  { offset: 100, color: "#eb459e" },
                                ]),
                              ];
                              stops[1] = { offset: 100, color };
                              updateLayer(layer.id, {
                                fill_type: "linear-gradient",
                                gradient: {
                                  angle: layer.gradient?.angle ?? 90,
                                  stops,
                                },
                              });
                            }}
                            placeholder="#eb459e"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              Angle (°)
                            </Label>
                            <span className="text-xs text-muted-foreground font-mono">
                              {layer.gradient?.angle ?? 90}°
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min={0}
                              max={360}
                              step={1}
                              value={layer.gradient?.angle ?? 90}
                              onChange={(e) =>
                                updateLayer(layer.id, {
                                  fill_type: "linear-gradient",
                                  gradient: {
                                    angle: parseFloat(e.target.value) || 0,
                                    stops: layer.gradient?.stops || [
                                      { offset: 0, color: "#5865F2" },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  },
                                })
                              }
                              className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={360}
                              value={layer.gradient?.angle ?? 90}
                              onChange={(e) =>
                                updateLayer(layer.id, {
                                  fill_type: "linear-gradient",
                                  gradient: {
                                    angle: parseFloat(e.target.value) || 0,
                                    stops: layer.gradient?.stops || [
                                      { offset: 0, color: "#5865F2" },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  },
                                })
                              }
                              className="w-16 h-8 text-xs font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {layer.shape_type !== "circle" &&
                layer.shape_type !== "star" &&
                layer.shape_type !== "hexagon" &&
                layer.shape_type !== "diamond" && (
                  <CornerRadiusControl
                    value={layer.border_radius || 0}
                    onChange={(border_radius) => updateLayer(layer.id, { border_radius })}
                    max={120}
                  />
                )}
            </div>
          )}

          {/* Progress Bar Layer Settings */}
          {layer.type === "progress_bar" && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Style</Label>
                <Select
                  value={layer.progress_style || "bar"}
                  onValueChange={(val: any) => {
                    if (val === "ring") {
                      const size = Math.max(layer.width, layer.height, 96);
                      updateLayer(layer.id, {
                        progress_style: "ring",
                        width: size,
                        height: size,
                      });
                    } else {
                      updateLayer(layer.id, { progress_style: val });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Linear Bar</SelectItem>
                    <SelectItem value="ring">Circular Ring</SelectItem>
                    <SelectItem value="segmented">Segmented Steps</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Value</Label>
                  <VariableFieldInput
                    value={layer.value || "0"}
                    onChange={(value) => updateLayer(layer.id, { value })}
                    defaultVarName="xp"
                    defaultSampleValue={65}
                    placeholder="65 or {{xp}}"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Max Value
                  </Label>
                  <VariableFieldInput
                    value={layer.max_value || "100"}
                    onChange={(max_value) =>
                      updateLayer(layer.id, { max_value })
                    }
                    defaultVarName="max_xp"
                    defaultSampleValue={100}
                    placeholder="100 or {{max_xp}}"
                  />
                </div>
              </div>

              {/* Progress Bar Fill Type */}
              {(() => {
                const isBarGrad =
                  layer.fill_type === "gradient" ||
                  layer.fill_type === "linear-gradient" ||
                  (!layer.fill_type &&
                    layer.fill_gradient?.stops &&
                    layer.fill_gradient.stops.length > 0 &&
                    layer.fill_type !== "solid");
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Fill Type
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={isBarGrad ? "outline" : "secondary"}
                          size="sm"
                          onClick={() =>
                            updateLayer(layer.id, {
                              fill_type: "solid",
                              fill_color: layer.fill_color || "#5865F2",
                            })
                          }
                        >
                          Solid Color
                        </Button>
                        <Button
                          type="button"
                          variant={isBarGrad ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => {
                            const existingGrad =
                              layer.fill_gradient &&
                              layer.fill_gradient.stops &&
                              layer.fill_gradient.stops.length >= 2
                                ? layer.fill_gradient
                                : {
                                    angle: 90,
                                    stops: [
                                      {
                                        offset: 0,
                                        color: layer.fill_color || "#5865F2",
                                      },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  };
                            updateLayer(layer.id, {
                              fill_type: "linear-gradient",
                              fill_gradient: existingGrad,
                            });
                          }}
                        >
                          Gradient
                        </Button>
                      </div>
                    </div>

                    {!isBarGrad ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Fill Color
                        </Label>
                        <ColorInput
                          value={layer.fill_color || "#5865F2"}
                          onChange={(fill_color) =>
                            updateLayer(layer.id, {
                              fill_color,
                              fill_type: "solid",
                            })
                          }
                          placeholder="#5865F2"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            Start Color
                          </Label>
                          <ColorInput
                            value={
                              layer.fill_gradient?.stops?.[0]?.color || "#5865F2"
                            }
                            onChange={(color) => {
                              const stops = [
                                ...(layer.fill_gradient?.stops || [
                                  { offset: 0, color: "#5865F2" },
                                  { offset: 100, color: "#eb459e" },
                                ]),
                              ];
                              stops[0] = { offset: 0, color };
                              updateLayer(layer.id, {
                                fill_type: "linear-gradient",
                                fill_gradient: {
                                  angle: layer.fill_gradient?.angle ?? 90,
                                  stops,
                                },
                              });
                            }}
                            placeholder="#5865F2"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            End Color
                          </Label>
                          <ColorInput
                            value={
                              layer.fill_gradient?.stops?.[1]?.color || "#eb459e"
                            }
                            onChange={(color) => {
                              const stops = [
                                ...(layer.fill_gradient?.stops || [
                                  { offset: 0, color: "#5865F2" },
                                  { offset: 100, color: "#eb459e" },
                                ]),
                              ];
                              stops[1] = { offset: 100, color };
                              updateLayer(layer.id, {
                                fill_type: "linear-gradient",
                                fill_gradient: {
                                  angle: layer.fill_gradient?.angle ?? 90,
                                  stops,
                                },
                              });
                            }}
                            placeholder="#eb459e"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              Angle (°)
                            </Label>
                            <span className="text-xs text-muted-foreground font-mono">
                              {layer.fill_gradient?.angle ?? 90}°
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min={0}
                              max={360}
                              step={1}
                              value={layer.fill_gradient?.angle ?? 90}
                              onChange={(e) =>
                                updateLayer(layer.id, {
                                  fill_type: "linear-gradient",
                                  fill_gradient: {
                                    angle: parseFloat(e.target.value) || 0,
                                    stops: layer.fill_gradient?.stops || [
                                      { offset: 0, color: "#5865F2" },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  },
                                })
                              }
                              className="flex-1 accent-primary h-2 bg-muted rounded cursor-pointer"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={360}
                              value={layer.fill_gradient?.angle ?? 90}
                              onChange={(e) =>
                                updateLayer(layer.id, {
                                  fill_type: "linear-gradient",
                                  fill_gradient: {
                                    angle: parseFloat(e.target.value) || 0,
                                    stops: layer.fill_gradient?.stops || [
                                      { offset: 0, color: "#5865F2" },
                                      { offset: 100, color: "#eb459e" },
                                    ],
                                  },
                                })
                              }
                              className="w-16 h-8 text-xs font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Track (Background) Color
                </Label>
                <ColorInput
                  value={layer.background_color || "#2b2d31"}
                  onChange={(background_color) =>
                    updateLayer(layer.id, { background_color })
                  }
                  placeholder="#2b2d31"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <Label className="text-xs font-medium text-foreground">
                    Show Percentage Text
                  </Label>
                  <div className="text-[11px] text-muted-foreground">
                    Displays value percentage inside bar
                  </div>
                </div>
                <Switch
                  checked={!!layer.show_text}
                  onCheckedChange={(checked) =>
                    updateLayer(layer.id, { show_text: checked })
                  }
                />
              </div>

              <CornerRadiusControl
                value={layer.border_radius || 0}
                onChange={(border_radius) => updateLayer(layer.id, { border_radius })}
                max={40}
              />
            </div>
          )}

          {/* Badge Layer Settings */}
          {layer.type === "badge" && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">
                  Label
                </Label>
                <VariableFieldInput
                  value={layer.label || ""}
                  onChange={(label) => updateLayer(layer.id, { label })}
                  defaultVarName="badge"
                  defaultSampleValue="VIP"
                  placeholder="VIP or {{rank}}"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Badge Color
                  </Label>
                  <ColorInput
                    value={layer.color || "#5865F2"}
                    onChange={(color) => updateLayer(layer.id, { color })}
                    placeholder="#5865F2"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Text Color
                  </Label>
                  <ColorInput
                    value={layer.text_color || "#ffffff"}
                    onChange={(text_color) =>
                      updateLayer(layer.id, { text_color })
                    }
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              <CornerRadiusControl
                value={layer.border_radius || 6}
                onChange={(border_radius) => updateLayer(layer.id, { border_radius })}
                max={40}
              />
            </div>
          )}

          {/* Repeater Layer Settings */}
          {layer.type === "repeater" && (
            <div className="space-y-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  List Data Variable
                </Label>
                <VariableFieldInput
                  value={layer.items_expression || "leaderboard"}
                  onChange={(items_expression) =>
                    updateLayer(layer.id, { items_expression })
                  }
                  defaultVarName="leaderboard"
                  placeholder="e.g. {{leaderboard}}"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Max Rows
                  </Label>
                  <NumberInput
                    min={1}
                    max={50}
                    value={layer.max_items || 5}
                    onChange={(val) =>
                      updateLayer(layer.id, {
                        max_items: val,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Row Spacing (px)
                  </Label>
                  <NumberInput
                    min={0}
                    max={100}
                    value={layer.gap || 6}
                    onChange={(val) =>
                      updateLayer(layer.id, {
                        gap: val,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* ==================== COLLAPSIBLE ADVANCED SECTION ==================== */}
          <Collapsible
            open={showAdvanced}
            onOpenChange={setShowAdvanced}
            className="pt-2 border-t border-border/50"
          >
            <div className="flex items-center space-x-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="space-x-2 -ml-2 font-medium">
                  {showAdvanced ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                  <span>Advanced Settings</span>
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="space-y-4 pt-3">
              {/* Conditional Decorators by Layer Type */}
              {layer.type === "text" && (
                <div className="space-y-3">
                  <TextOutlineControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <ShadowControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />

                  {/* Typography Details */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Line Height
                      </Label>
                      <Input
                        type="number"
                        step={0.05}
                        min={0.5}
                        max={3}
                        value={layer.line_height ?? 1.25}
                        onChange={(e) =>
                          updateLayer(layer.id, {
                            line_height: parseFloat(e.target.value) || 1.25,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Letter Spacing (px)
                      </Label>
                      <Input
                        type="number"
                        step={0.5}
                        min={-5}
                        max={20}
                        value={layer.letter_spacing ?? 0}
                        onChange={(e) =>
                          updateLayer(layer.id, {
                            letter_spacing: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Style
                      </Label>
                      <Select
                        value={layer.font_style || "normal"}
                        onValueChange={(val: any) =>
                          updateLayer(layer.id, { font_style: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="italic">Italic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Case Transform
                      </Label>
                      <Select
                        value={layer.text_transform || "none"}
                        onValueChange={(val: any) =>
                          updateLayer(layer.id, { text_transform: val })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Default</SelectItem>
                          <SelectItem value="uppercase">UPPERCASE</SelectItem>
                          <SelectItem value="lowercase">lowercase</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {layer.type === "image" && (
                <div className="space-y-3">
                  <BorderControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <LayerBlurControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <ShadowControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />

                  {/* Mask Select */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-muted-foreground">
                      Shape Mask
                    </Label>
                    <Select
                      value={layer.mask || "none"}
                      onValueChange={(val: any) =>
                        updateLayer(layer.id, {
                          mask: val === "none" ? undefined : val,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Standard)</SelectItem>
                        <SelectItem value="circle">Circle</SelectItem>
                        <SelectItem value="hexagon">Hexagon</SelectItem>
                        <SelectItem value="diamond">Diamond</SelectItem>
                        <SelectItem value="star">Star</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {(layer.type === "shape" || layer.type === "background") && (
                <div className="space-y-3">
                  {layer.type === "shape" && (
                    <div className="flex items-center justify-between pb-1">
                      <div>
                        <Label className="text-xs font-medium text-foreground">
                          Lock 1:1 Aspect Ratio
                        </Label>
                        <div className="text-[11px] text-muted-foreground">
                          Keeps width and height equal
                        </div>
                      </div>
                      <Switch
                        checked={!layer.freeform}
                        onCheckedChange={(checked) =>
                          updateLayer(layer.id, { freeform: !checked })
                        }
                      />
                    </div>
                  )}

                  <BorderControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <BackdropBlurControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <LayerBlurControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <ShadowControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                </div>
              )}

              {layer.type === "progress_bar" && (
                <div className="space-y-3">
                  <BorderControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <ShadowControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                </div>
              )}

              {layer.type === "badge" && (
                <div className="space-y-3">
                  <BorderControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                  <ShadowControls
                    layer={layer}
                    onUpdate={(data) => updateLayer(layer.id, data)}
                  />
                </div>
              )}

              {/* Transform & Dimensions */}
              <div className="pt-2 border-t border-border/40">
                <TransformControls
                  layer={layer}
                  onUpdate={(data) => updateLayer(layer.id, data)}
                />
              </div>

              {/* Conditional Display (show_if) */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <Label className="text-xs text-muted-foreground">
                  Only Show If Condition (Optional)
                </Label>
                <VariableFieldInput
                  value={layer.show_if || ""}
                  onChange={(show_if) => updateLayer(layer.id, { show_if })}
                  defaultVarName="condition"
                  placeholder="e.g. {{is_vip}}"
                />
                <div className="text-[11px] text-muted-foreground">
                  Layer will be hidden when this expression evaluates to false
                </div>
              </div>

              {/* Layer ID Rename */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <Label className="text-xs text-muted-foreground">
                  Rename Layer ID
                </Label>
                <Input
                  value={layer.id}
                  onChange={(e) => {
                    const newId = e.target.value.trim().replace(/\s+/g, "_");
                    if (newId) renameLayerId(layer.id, newId);
                  }}
                  className="font-mono text-xs"
                  placeholder="layer_id"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Layer Actions Footer */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => duplicateLayer(layer.id)}
                className="flex-1 flex gap-2"
              >
                <CopyPlusIcon className="h-4 w-4" />
                <span>Duplicate</span>
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  removeLayer(layer.id);
                  onClose();
                }}
                className="flex gap-2"
              >
                <Trash2Icon className="h-4 w-4" />
                <span>Delete</span>
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
