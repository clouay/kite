import React, { ReactNode, useCallback, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  CopyPlusIcon,
  Trash2Icon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BringToFrontIcon,
  SendToBackIcon,
  Maximize2Icon,
  TypeIcon,
  SparklesIcon,
  SquareIcon,
  ImageIcon,
  ActivityIcon,
  TagIcon,
  ListOrderedIcon,
  LayersIcon,
} from "lucide-react";
import { useImageEditorStore } from "@/lib/image/state";
import { Layer } from "@/lib/types/image.gen";

interface Props {
  children: ReactNode;
  onFitView?: () => void;
}

export default function ImageContextMenu({ children, onFitView }: Props) {
  const [open, setOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState<string | null>(null);
  const pressedPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const template = useImageEditorStore((s) => s.template);
  const selectedLayerId = useImageEditorStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useImageEditorStore((s) => s.setSelectedLayerId);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const addLayer = useImageEditorStore((s) => s.addLayer);

  const activeLayerId = targetLayerId || selectedLayerId;
  const activeLayer = template.data.layers.find((l: Layer) => l.id === activeLayerId);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setOpen(false);
        return;
      }
      setOpen(true);
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      pressedPos.current = { x: e.clientX, y: e.clientY };
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select")) {
        return;
      }
      const layerEl = el.closest("[data-layer-id]");
      if (layerEl) {
        const id = layerEl.getAttribute("data-layer-id");
        if (id) {
          setTargetLayerId(id);
          setSelectedLayerId(id);
          return;
        }
      }
      setTargetLayerId(null);
    },
    [setSelectedLayerId]
  );

  const handleAdd = useCallback(
    (type: Layer["type"]) => {
      const artboardCenterX = Math.round(template.width / 2 - 100);
      const artboardCenterY = Math.round(template.height / 2 - 25);

      const defaults: Record<string, Partial<Layer>> = {
        background: {
          name: "Background Layer",
          type: "background",
          x: 0,
          y: 0,
          width: template.width,
          height: template.height,
          color: "#1e1f22",
          border_radius: 0,
        },
        text: {
          name: "Text Layer",
          type: "text",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 250,
          height: 50,
          content: "Sample Text",
          font_size: 24,
          font_weight: "bold",
          color: "#ffffff",
          text_align: "left",
        },
        image: {
          name: "Image Layer",
          type: "image",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 120,
          height: 120,
          image_url: "https://cdn.discordapp.com/app-icons/1500112380464726106/dc6d484228e2e40291d539e809e392fe?size=1024",
          border_radius: 12,
        },
        shape: {
          name: "Rectangle",
          type: "shape",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 200,
          height: 120,
          color: "#2b2d31",
          border_radius: 8,
          border_width: 1,
          border_color: "#3f4147",
        },
        progress_bar: {
          name: "Progress Bar",
          type: "progress_bar",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 320,
          height: 24,
          value: "75",
          max_value: "100",
          fill_color: "#5865F2",
          background_color: "rgba(255, 255, 255, 0.15)",
          border_radius: 12,
        },
        badge: {
          name: "Badge",
          type: "badge",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 100,
          height: 32,
          label: "PRO",
          color: "#5865F2",
          text_color: "#ffffff",
          font_size: 14,
          border_radius: 16,
        },
        repeater: {
          name: "Leaderboard",
          type: "repeater",
          x: artboardCenterX,
          y: artboardCenterY,
          width: 400,
          height: 220,
          items_expression: "leaderboard",
          max_items: 5,
          item_height: 38,
          gap: 6,
          item_template: {
            show_rank: true,
            show_avatar: true,
            name_field: "username",
            score_field: "points",
            row_background_color: "#2b2d31",
            name_color: "#ffffff",
            score_color: "#5865F2",
            border_radius: 6,
          },
        },
      };

      const layerData = defaults[type] || defaults.text;
      addLayer(layerData as Omit<Layer, "id">);
    },
    [template.width, template.height, addLayer]
  );

  return (
    <ContextMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {activeLayer ? (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground truncate">
              {activeLayer.name}
            </div>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => duplicateLayer(activeLayer.id)}>
              <CopyPlusIcon className="mr-2 h-4 w-4" />
              <span>Duplicate</span>
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                updateLayer(activeLayer.id, { visible: !activeLayer.visible })
              }
            >
              {activeLayer.visible ? (
                <>
                  <EyeOffIcon className="mr-2 h-4 w-4" />
                  <span>Hide Layer</span>
                </>
              ) : (
                <>
                  <EyeIcon className="mr-2 h-4 w-4" />
                  <span>Show Layer</span>
                </>
              )}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                updateLayer(activeLayer.id, { locked: !activeLayer.locked })
              }
            >
              {activeLayer.locked ? (
                <>
                  <UnlockIcon className="mr-2 h-4 w-4" />
                  <span>Unlock Layer</span>
                </>
              ) : (
                <>
                  <LockIcon className="mr-2 h-4 w-4" />
                  <span>Lock Layer</span>
                </>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() =>
                reorderLayer(activeLayer.id, template.data.layers.length - 1)
              }
            >
              <BringToFrontIcon className="mr-2 h-4 w-4" />
              <span>Bring to Front</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => reorderLayer(activeLayer.id, 0)}>
              <SendToBackIcon className="mr-2 h-4 w-4" />
              <span>Send to Back</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                removeLayer(activeLayer.id);
                setSelectedLayerId(null);
              }}
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              <span>Delete</span>
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <SparklesIcon className="mr-2 h-4 w-4" />
                <span>Add Layer</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={() => handleAdd("background")}>
                  <LayersIcon className="mr-2 h-4 w-4" />
                  <span>Background</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("text")}>
                  <TypeIcon className="mr-2 h-4 w-4" />
                  <span>Text</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("shape")}>
                  <SquareIcon className="mr-2 h-4 w-4" />
                  <span>Shape</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("image")}>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  <span>Image</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("progress_bar")}>
                  <ActivityIcon className="mr-2 h-4 w-4" />
                  <span>Progress Bar</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("badge")}>
                  <TagIcon className="mr-2 h-4 w-4" />
                  <span>Badge</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAdd("repeater")}>
                  <ListOrderedIcon className="mr-2 h-4 w-4" />
                  <span>Repeater</span>
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            {onFitView && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onFitView}>
                  <Maximize2Icon className="mr-2 h-4 w-4" />
                  <span>Fit View</span>
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
