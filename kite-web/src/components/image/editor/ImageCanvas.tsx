import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Node,
  NodeProps,
  NodeResizer,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Undo2Icon, Redo2Icon, Maximize2Icon, RotateCwIcon } from "lucide-react";
import { useHookedTheme } from "@/lib/hooks/theme";
import { useImageEditorStore, DEFAULT_PLACEHOLDER_PHOTO } from "@/lib/image/state";
import { Layer } from "@/lib/types/image.gen";
import { ImageTemplate } from "@/lib/types/wire.gen";
import {
  interpolateTemplate,
  resolveLayerValueClient,
  resolveValue,
} from "@/lib/image/interpolate";
import ImageContextMenu from "./ImageContextMenu";
import { cn } from "@/lib/utils";
import { DiscordStatusBadge } from "./DiscordStatusBadge";

export interface SnapGuide {
  orientation: "vertical" | "horizontal";
  position: number;
  label?: string;
}

function getClipPathForPolygon(shapeType?: string): string | undefined {
  switch (shapeType) {
    case "circle":
      return "circle(50% at 50% 50%)";
    case "hexagon":
      return "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "star":
      return "polygon(50% 3%, 63% 36%, 98% 36%, 70% 57%, 81% 91%, 50% 70%, 19% 91%, 30% 57%, 2% 36%, 37% 36%)";
    default:
      return undefined;
  }
}

function getCanvasClipPath(
  layer: Layer,
  canvasWidth: number,
  canvasHeight: number,
  canvasRadius: number = 0
): string | undefined {
  if (layer.type === "background") return undefined;

  const w = layer.width;
  const h = layer.height;
  const x = layer.x;
  const y = layer.y;

  const rot = layer.rotation || 0;
  // If layer is completely outside the canvas bounds
  if (!rot && (x + w <= 0 || x >= canvasWidth || y + h <= 0 || y >= canvasHeight)) {
    return "inset(100%)";
  }

  const topInset = -y;
  const rightInset = x + w - canvasWidth;
  const bottomInset = y + h - canvasHeight;
  const leftInset = -x;

  // If unrotated and completely inside with 0 radius, no clipping needed
  if (!rot && canvasRadius <= 0 && topInset <= 0 && rightInset <= 0 && bottomInset <= 0 && leftInset <= 0) {
    return undefined;
  }

  // If rotated, check if the bounding circle is fully within canvas with 0 radius
  if (rot && canvasRadius <= 0) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.hypot(w, h) / 2;
    if (cx - r >= 0 && cx + r <= canvasWidth && cy - r >= 0 && cy + r <= canvasHeight) {
      return undefined;
    }
  }

  const roundPart = canvasRadius > 0 ? ` round ${Math.round(canvasRadius)}px` : "";
  return `inset(${Math.round(topInset)}px ${Math.round(rightInset)}px ${Math.round(bottomInset)}px ${Math.round(leftInset)}px${roundPart})`;
}

function ArtboardNode({
  data,
}: {
  data: { width: number; height: number; borderRadius?: number; selected?: boolean; snapGuides?: SnapGuide[] };
}) {
  const guides = data.snapGuides || [];
  const r = data.borderRadius || 0;
  return (
    <div
      className={cn(
        "relative shadow-2xl overflow-hidden pointer-events-auto cursor-pointer select-none transition-all",
        data.selected
          ? "ring-2 ring-primary ring-offset-4 ring-offset-background"
          : "ring-1 ring-border/80"
      )}
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
        borderRadius: `${r}px`,
        backgroundColor: "#111214",
        backgroundImage: `
          linear-gradient(45deg, #18191c 25%, transparent 25%),
          linear-gradient(-45deg, #18191c 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #18191c 75%),
          linear-gradient(-45deg, transparent 75%, #18191c 75%)
        `,
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
      }}
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      {/* Canva Magnetic Alignment & Snap Guide Lines */}
      {guides.map((g, i) =>
        g.orientation === "vertical" ? (
          <div
            key={`v-${i}-${g.position}`}
            className="absolute top-0 bottom-0 z-50 pointer-events-none"
            style={{
              left: `${g.position}px`,
              width: "1px",
              backgroundColor: "#ec4899",
              boxShadow: "0 0 6px #ec4899",
            }}
          />
        ) : (
          <div
            key={`h-${i}-${g.position}`}
            className="absolute left-0 right-0 z-50 pointer-events-none"
            style={{
              top: `${g.position}px`,
              height: "1px",
              backgroundColor: "#ec4899",
              boxShadow: "0 0 6px #ec4899",
            }}
          />
        )
      )}
    </div>
  );
}

function LayerNode({ id, data, selected }: NodeProps) {
  const initialLayer = data.layer as Layer;
  const sampleData = (data.sampleData as Record<string, any>) || {};
  const beginAction = useImageEditorStore((s) => s.beginAction);
  const endAction = useImageEditorStore((s) => s.endAction);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const updateLayerTransient = useImageEditorStore((s) => s.updateLayerTransient);
  const layers = useImageEditorStore((s) => s.template.data?.layers);
  const layer = (layers?.find((l: Layer) => l.id === id) || initialLayer) as Layer;
  const canvasWidth = useImageEditorStore((s) => s.template.width) || 800;
  const canvasHeight = useImageEditorStore((s) => s.template.height) || 360;
  const canvasRadius = useImageEditorStore((s) => {
    const t = s.template;
    return (
      t.data?.border_radius ??
      t.data?.layers?.find((l: Layer) => l.type === "background")?.border_radius ??
      0
    );
  });
  const showHoverOutlines = useImageEditorStore(
    (s) => s.editorPreferences.showHoverOutlines
  );

  const canvasClipPath = useMemo(
    () => getCanvasClipPath(layer, canvasWidth, canvasHeight, canvasRadius),
    [layer, canvasWidth, canvasHeight, canvasRadius]
  );

  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState(layer.content || "");
  const nodeRef = useRef<HTMLDivElement>(null);
  const [, setPhotoTick] = useState(0);

  useEffect(() => {
    const onPhotoColors = () => setPhotoTick((t) => t + 1);
    window.addEventListener("photo-colors-ready", onPhotoColors);
    return () => window.removeEventListener("photo-colors-ready", onPhotoColors);
  }, []);

  const resolveColor = useCallback(
    (colorVal?: string, defaultVal = ""): string => {
      if (!colorVal) return defaultVal || "#1e1f22";
      const context = { ...(sampleData || {}), _layers: layers || [] };
      const interpolated = interpolateTemplate(colorVal, context);
      if (interpolated && !interpolated.startsWith("{{")) {
        return interpolated;
      }
      if (defaultVal && !defaultVal.startsWith("{{")) {
        return defaultVal;
      }
      if (
        colorVal.includes(".average") ||
        colorVal.includes(".dominant") ||
        colorVal.includes("photo.")
      ) {
        return colorVal.includes(".dominant") ? "#f26522" : "#e65100";
      }
      return "#1e1f22";
    },
    [sampleData, layers]
  );

  useEffect(() => {
    if (!selected && isEditingText) {
      setIsEditingText(false);
    }
  }, [selected, isEditingText]);

  const isFixedRatioShape =
    layer.type === "shape" &&
    (layer.shape_type === "square" ||
      layer.shape_type === "circle" ||
      layer.shape_type === "star" ||
      layer.shape_type === "hexagon" ||
      layer.shape_type === "diamond");

  const keepAspectRatio = isFixedRatioShape ? !layer.freeform : false;

  const handleResizeStart = useCallback(() => {
    beginAction();
  }, [beginAction]);

  const handleResize = useCallback(
    (
      _evt: any,
      params: { x: number; y: number; width: number; height: number }
    ) => {
      let w = Math.max(10, Math.round(params.width));
      let h = Math.max(10, Math.round(params.height));
      if (isFixedRatioShape && !layer.freeform) {
        const size = Math.max(w, h);
        w = size;
        h = size;
      }
      updateLayerTransient(id, {
        x: Math.round(params.x),
        y: Math.round(params.y),
        width: w,
        height: h,
      });
    },
    [id, isFixedRatioShape, layer.freeform, updateLayerTransient]
  );

  const handleResizeEnd = useCallback(
    (
      _evt: any,
      params: { x: number; y: number; width: number; height: number }
    ) => {
      let w = Math.max(10, Math.round(params.width));
      let h = Math.max(10, Math.round(params.height));
      if (isFixedRatioShape && !layer.freeform) {
        const size = Math.max(w, h);
        w = size;
        h = size;
      }
      updateLayerTransient(id, {
        x: Math.round(params.x),
        y: Math.round(params.y),
        width: w,
        height: h,
      });
      endAction();
    },
    [id, isFixedRatioShape, layer.freeform, updateLayerTransient, endAction]
  );

  const handleRotateMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!nodeRef.current) return;
      beginAction();
      const rect = nodeRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const onMouseMove = (moveEvt: MouseEvent) => {
        const dx = moveEvt.clientX - centerX;
        const dy = moveEvt.clientY - centerY;
        let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
        if (deg < 0) deg += 360;
        if (moveEvt.shiftKey) {
          deg = Math.round(deg / 15) * 15;
        }
        updateLayerTransient(id, { rotation: deg % 360 });
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        endAction();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [id, beginAction, updateLayerTransient, endAction]
  );

  return (
    <div
      ref={nodeRef}
      data-layer-id={id}
      onDoubleClick={(e) => {
        if (layer.type === "text" && !layer.locked) {
          e.stopPropagation();
          setDraftText(layer.content || "");
          setIsEditingText(true);
        }
      }}
      className={cn(
        "relative select-none",
        layer.locked ? "cursor-not-allowed pointer-events-none" : "cursor-move",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background/50 shadow-sm",
        !selected && !layer.locked && showHoverOutlines && "hover:ring-1 hover:ring-primary/40"
      )}
      style={{
        width: `${layer.width}px`,
        height: `${layer.height}px`,
        opacity: layer.opacity ?? 1,
      }}
    >
      {!layer.locked && (
        <NodeResizer
          isVisible={selected}
          minWidth={20}
          minHeight={10}
          keepAspectRatio={keepAspectRatio}
          onResizeStart={handleResizeStart}
          onResize={handleResize}
          onResizeEnd={handleResizeEnd}
          lineClassName="!border-primary !border-[1.5px]"
          handleClassName="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background !rounded-full shadow-md"
        />
      )}

      {/* Canva Rotation Handle */}
      {selected && !layer.locked && (
        <div
          onMouseDown={handleRotateMouseDown}
          className="nodrag nopan absolute -top-7 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-background border-2 border-primary shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing z-50 hover:bg-primary hover:text-primary-foreground transition-colors"
          title={`Rotate (${layer.rotation || 0}° — hold Shift to snap 15°)`}
        >
          <RotateCwIcon className="w-3 h-3" />
        </div>
      )}

      {/* Canvas-Clipped Content Wrapper (Trims overflowing content to canvas boundary) */}
      <div
        className="w-full h-full relative"
        style={{
          clipPath: canvasClipPath,
        }}
      >
        <div
          className="w-full h-full relative"
          style={{
            transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        >
        {/* Polygon SVG Shapes: Star, Hexagon, Diamond */}
        {layer.type === "shape" &&
          (layer.shape_type === "star" ||
            layer.shape_type === "hexagon" ||
            layer.shape_type === "diamond") &&
          (() => {
            const fillId = `poly-grad-${id}`;
            const hasGrad =
              layer.fill_type === "solid"
                ? false
                : Boolean(
                    layer.gradient &&
                    layer.gradient.stops &&
                    layer.gradient.stops.length > 0 &&
                    (layer.fill_type === "gradient" ||
                     layer.fill_type === "linear-gradient" ||
                     !layer.fill_type)
                  );
            const fill = hasGrad
              ? `url(#${fillId})`
              : resolveColor(layer.color, "#2b2d31");

            const pointsMap: Record<string, string> = {
              star: "50,3 63,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 37,36",
              hexagon: "50,2 95,25 95,75 50,98 5,75 5,25",
              diamond: "50,2 98,50 50,98 2,50",
            };

            return (
              <div className="w-full h-full pointer-events-none relative flex items-center justify-center overflow-hidden">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full"
                  preserveAspectRatio={
                    layer.freeform ? "none" : "xMidYMid meet"
                  }
                >
                  {hasGrad && (
                    <defs>
                      <linearGradient
                        id={fillId}
                        gradientTransform={`rotate(${layer.gradient!.angle || 90} 0.5 0.5)`}
                      >
                        {layer.gradient!.stops.map((s, i) => (
                          <stop
                            key={i}
                            offset={`${s.offset > 1 ? s.offset : s.offset * 100}%`}
                            stopColor={resolveColor(
                              s.color,
                              i === 0 ? "#000000" : "#f26522"
                            )}
                          />
                        ))}
                      </linearGradient>
                    </defs>
                  )}
                  <polygon
                    points={pointsMap[layer.shape_type!] || pointsMap.star}
                    fill={fill}
                    stroke={
                      layer.border_width
                        ? resolveColor(layer.border_color, "transparent")
                        : "none"
                    }
                    strokeWidth={
                      layer.border_width
                        ? layer.border_width * (100 / Math.max(1, layer.width))
                        : 0
                    }
                    style={{
                      filter: layer.shadow_color
                        ? `drop-shadow(0 0 ${layer.shadow_blur || 10}px ${layer.shadow_color})`
                        : undefined,
                    }}
                  />
                </svg>
              </div>
            );
          })()}

        {/* Standard Rectangle / Circle / Background / Glassmorphism Card */}
        {(layer.type === "background" ||
          (layer.type === "shape" &&
            layer.shape_type !== "star" &&
            layer.shape_type !== "hexagon" &&
            layer.shape_type !== "diamond")) &&
          (() => {
            const isCircle = layer.shape_type === "circle";
            const effectiveRadius =
              layer.type === "background" && canvasRadius > 0
                ? Math.max(layer.border_radius || 0, canvasRadius)
                : layer.border_radius || 0;
            const borderRadius = isCircle
              ? "9999px"
              : `${effectiveRadius}px`;

            const hasGrad =
              layer.fill_type === "solid"
                ? false
                : Boolean(
                    layer.gradient &&
                    layer.gradient.stops &&
                    layer.gradient.stops.length > 0 &&
                    (layer.fill_type === "gradient" ||
                     layer.fill_type === "linear-gradient" ||
                     !layer.fill_type)
                  );

            const bgValue = hasGrad
              ? `linear-gradient(${layer.gradient!.angle ?? 90}deg, ${layer.gradient!.stops
                  .map((s, idx) => {
                    const num =
                      typeof s.offset === "number"
                        ? s.offset
                        : parseFloat(s.offset as any) || 0;
                    const offsetPct =
                      num > 0 && num <= 1
                        ? `${Math.round(num * 100)}%`
                        : `${num}%`;
                    const fallbackColor = idx === 0 ? "#000000" : "#f26522";
                    return `${resolveColor(s.color, fallbackColor)} ${offsetPct}`;
                  })
                  .join(", ")})`
              : resolveColor(
                  layer.color,
                  layer.type === "background" ? "#1e1f22" : "#2b2d31"
                );

            const isGlass = Boolean(layer.backdrop_blur && layer.backdrop_blur > 0);
            let finalBg = bgValue;
            if (isGlass && finalBg && !hasGrad) {
              // If opaque hex like #ffffff or #2b2d31, convert to translucent glass so the blur behind it shows!
              if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(finalBg.trim())) {
                const hex = finalBg.trim().replace("#", "");
                const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
                const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
                const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
                finalBg = `rgba(${r}, ${g}, ${b}, 0.25)`;
              }
            }

            return (
              <div
                className="w-full h-full pointer-events-none"
                style={{
                  background: finalBg,
                  borderRadius,
                  borderWidth: `${layer.border_width || (isGlass ? 1 : 0)}px`,
                  borderColor: resolveColor(layer.border_color, isGlass ? "rgba(255, 255, 255, 0.2)" : "transparent"),
                  borderStyle: layer.border_width || isGlass ? "solid" : "none",
                  boxShadow: layer.shadow_color
                    ? `0 0 ${layer.shadow_blur || 10}px ${layer.shadow_color}`
                    : isGlass
                    ? "0 8px 32px 0 rgba(0, 0, 0, 0.3)"
                    : undefined,
                  backdropFilter: layer.backdrop_blur
                    ? `blur(${layer.backdrop_blur}px)`
                    : undefined,
                  WebkitBackdropFilter: layer.backdrop_blur
                    ? `blur(${layer.backdrop_blur}px)`
                    : undefined,
                  filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
                }}
              />
            );
          })()}

        {/* Text Layer (with Inline Double-Click Editing & AutoFit) */}
        {layer.type === "text" &&
          (() => {
            const rawAlign = String(layer.text_align || "left").toLowerCase();
            let hAlign: "left" | "center" | "right" = "left";
            let vAlign: "top" | "middle" | "bottom" =
              (layer.vertical_align as any) || "middle";

            if (rawAlign.includes("top")) vAlign = "top";
            else if (rawAlign.includes("bottom")) vAlign = "bottom";

            if (rawAlign.includes("right")) hAlign = "right";
            else if (rawAlign.includes("center") || rawAlign === "middle")
              hAlign = "center";
            else hAlign = "left";

            if (isEditingText) {
              return (
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    updateLayer(id, { content: e.target.value });
                  }}
                  onBlur={() => setIsEditingText(false)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                      e.preventDefault();
                      setIsEditingText(false);
                    }
                  }}
                  className="nodrag nopan w-full h-full bg-background/90 text-foreground border border-primary rounded px-1.5 py-0.5 outline-none resize-none"
                  style={{
                    fontSize: `${layer.font_size || 16}px`,
                    fontFamily: layer.font_family || "inherit",
                    fontWeight:
                      layer.font_family?.toLowerCase().includes("impact") ||
                      layer.font_family?.toLowerCase().includes("bebas")
                        ? "normal"
                        : layer.font_weight || "normal",
                    fontStyle: layer.font_style || "normal",
                    textAlign: hAlign,
                  }}
                />
              );
            }

            const rawContent = resolveLayerValueClient(
              layer,
              "text",
              layer.content || "",
              sampleData
            );
            let renderedText = interpolateTemplate(rawContent, sampleData);
            if (layer.text_transform === "uppercase") {
              renderedText = renderedText.toUpperCase();
            } else if (layer.text_transform === "lowercase") {
              renderedText = renderedText.toLowerCase();
            }

            let fontSize = layer.font_size || 16;
            if (layer.auto_fit && renderedText.length > 0 && layer.width > 0) {
              const approxCharWidth = fontSize * 0.56;
              const estimatedWidth = renderedText.length * approxCharWidth;
              if (estimatedWidth > layer.width) {
                fontSize = Math.max(
                  10,
                  Math.floor((layer.width / Math.max(1, renderedText.length)) / 0.56)
                );
              }
            }

            const alignItems =
              vAlign === "top"
                ? "flex-start"
                : vAlign === "bottom"
                ? "flex-end"
                : "center";
            const justifyContent =
              hAlign === "center"
                ? "center"
                : hAlign === "right"
                ? "flex-end"
                : "flex-start";

            return (
              <div
                className="w-full h-full flex pointer-events-none overflow-hidden"
                style={{
                  alignItems,
                  justifyContent,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    fontSize: `${fontSize}px`,
                    fontFamily: layer.font_family || "inherit",
                    fontWeight:
                      layer.font_family?.toLowerCase().includes("impact") ||
                      layer.font_family?.toLowerCase().includes("bebas")
                        ? "normal"
                        : layer.font_weight || "normal",
                    fontStyle: layer.font_style || "normal",
                    lineHeight: layer.line_height || 1.25,
                    letterSpacing: layer.letter_spacing
                      ? `${layer.letter_spacing}px`
                      : undefined,
                    color: resolveColor(layer.color, "#ffffff"),
                    textAlign: hAlign,
                    whiteSpace: layer.truncate ? "nowrap" : "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    textOverflow: layer.truncate ? "ellipsis" : "clip",
                    overflow: layer.truncate ? "hidden" : "visible",
                    WebkitTextStroke:
                      layer.stroke_width && layer.stroke_color
                        ? `${layer.stroke_width}px ${resolveColor(layer.stroke_color)}`
                        : undefined,
                    textShadow: layer.shadow_color
                      ? `0 0 ${layer.shadow_blur || 4}px ${layer.shadow_color}`
                      : undefined,
                  }}
                >
                  {renderedText}
                </div>
              </div>
            );
          })()}

        {/* Image / Avatar Layer (with Polygon Masks, ObjectFit, Tint & Discord Status Dot) */}
        {layer.type === "image" &&
          (() => {
            const imgSrc = resolveLayerValueClient(
              layer,
              "image_url",
              layer.image_url || "",
              sampleData
            );
            const rawUrl = interpolateTemplate(imgSrc, sampleData).trim();
            const isValidUrl =
              rawUrl.startsWith("http://") ||
              rawUrl.startsWith("https://") ||
              rawUrl.startsWith("data:") ||
              rawUrl.startsWith("blob:");
            const finalImgUrl = isValidUrl ? rawUrl : DEFAULT_PLACEHOLDER_PHOTO;

            const clipPath = getClipPathForPolygon(layer.mask);
            const isSilhouetteBorder =
              layer.border_mode === "silhouette" ||
              (!layer.border_mode && !layer.mask && (!layer.border_radius || layer.border_radius === 0));

            const isSilhouetteShadow =
              layer.shadow_mode === "silhouette" ||
              (!layer.shadow_mode && !layer.mask && (!layer.border_radius || layer.border_radius === 0));

            const imgFilters: string[] = [];
            if (layer.blur) {
              imgFilters.push(`blur(${layer.blur}px)`);
            }

            if (isSilhouetteBorder && (layer.border_width || 0) > 0) {
              const bw = layer.border_width || 0;
              const bc = resolveColor(layer.border_color, "#ffffff");
              if (bw > 0 && bc) {
                const steps = 16;
                for (let i = 0; i < steps; i++) {
                  const angle = (i * 2 * Math.PI) / steps;
                  const dx = (Math.cos(angle) * bw).toFixed(1);
                  const dy = (Math.sin(angle) * bw).toFixed(1);
                  imgFilters.push(`drop-shadow(${dx}px ${dy}px 0 ${bc})`);
                }
              }
            }

            if (isSilhouetteShadow && layer.shadow_color) {
              const sBlur = layer.shadow_blur || 10;
              const sColor = layer.shadow_color;
              imgFilters.push(`drop-shadow(0px 2px ${sBlur}px ${sColor})`);
            }

            const bgLayer = layers?.find((l: Layer) => l.type === "background");
            const canvasBgColor = resolveColor(bgLayer?.color, "#111214");

            const statusRaw = layer.status_value
              ? interpolateTemplate(layer.status_value, sampleData)
                  .trim()
                  .toLowerCase()
              : "";
            const minDim = Math.min(layer.width, layer.height);
            const dotSize = Math.max(
              12,
              Math.round(minDim * 0.28)
            );
            const isCircularAvatar =
              layer.mask === "circle" ||
              (layer.border_radius ?? 0) >= minDim * 0.4;
            const decorSize = Math.round(minDim * 1.2);

            return (
              <div className="w-full h-full relative pointer-events-none">
                <div
                  className="w-full h-full relative"
                  style={{
                    overflow:
                      isSilhouetteBorder || isSilhouetteShadow
                        ? "visible"
                        : "hidden",
                    borderRadius:
                      layer.mask === "circle"
                        ? "9999px"
                        : `${layer.border_radius || 0}px`,
                    borderWidth: !isSilhouetteBorder
                      ? `${layer.border_width || 0}px`
                      : 0,
                    borderColor: !isSilhouetteBorder
                      ? resolveColor(layer.border_color, "transparent")
                      : "transparent",
                    borderStyle:
                      !isSilhouetteBorder && layer.border_width
                        ? "solid"
                        : "none",
                    boxShadow:
                      !isSilhouetteShadow && layer.shadow_color
                        ? `0 0 ${layer.shadow_blur || 10}px ${layer.shadow_color}`
                        : undefined,
                    clipPath,
                  }}
                >
                  <img
                    src={finalImgUrl}
                    alt={layer.name}
                    className="w-full h-full pointer-events-none"
                    style={{
                      objectFit: (layer.object_fit as any) || "cover",
                      filter:
                        imgFilters.length > 0
                          ? imgFilters.join(" ")
                          : undefined,
                    }}
                    draggable={false}
                  />
                  {layer.overlay_color && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ backgroundColor: layer.overlay_color }}
                    />
                  )}
                </div>

                {/* Discord Avatar Decoration / Frame Overlay */}
                {layer.avatar_decoration && (
                  <img
                    src={interpolateTemplate(layer.avatar_decoration, sampleData)}
                    alt="Discord Avatar Decoration"
                    className="absolute pointer-events-none select-none z-10 max-w-none max-h-none"
                    style={{
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: `${decorSize}px`,
                      height: `${decorSize}px`,
                      objectFit: "contain",
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLElement).style.display = "block";
                    }}
                    draggable={false}
                  />
                )}

                {/* Discord Authentic Status Indicator */}
                {statusRaw && statusRaw !== "none" && (
                  <div
                    className="absolute pointer-events-none z-20"
                    style={
                      isCircularAvatar
                        ? {
                            left: "85%",
                            top: "85%",
                            transform: "translate(-50%, -50%)",
                          }
                        : {
                            right: "0px",
                            bottom: "0px",
                            transform: "translate(15%, 15%)",
                          }
                    }
                  >
                    <DiscordStatusBadge
                      status={statusRaw}
                      size={dotSize}
                      borderColor={canvasBgColor}
                    />
                  </div>
                )}
              </div>
            );
          })()}

        {/* Progress Bar Layer: Linear Bar, Circular Ring, or Segmented */}
        {layer.type === "progress_bar" &&
          (() => {
            const valRaw = resolveLayerValueClient(
              layer,
              "value",
              layer.value || "0",
              sampleData
            );
            const maxRaw = resolveLayerValueClient(
              layer,
              "max_value",
              layer.max_value || "100",
              sampleData
            );
            const rawVal =
              parseFloat(interpolateTemplate(valRaw, sampleData)) || 0;
            const rawMax =
              parseFloat(interpolateTemplate(maxRaw, sampleData)) || 100;
            const pct = Math.min(100, Math.max(0, (rawVal / rawMax) * 100));

            if (layer.progress_style === "ring") {
              const size = Math.min(layer.width, layer.height);
              const strokeWidth = Math.max(6, Math.round(size * 0.12));
              const r = (size - strokeWidth) / 2;
              const c = 2 * Math.PI * r;
              const offset = c - (pct / 100) * c;

              return (
                <div className="w-full h-full relative flex items-center justify-center pointer-events-none">
                  <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    className="-rotate-90"
                  >
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      fill="none"
                      stroke={resolveColor(
                        layer.background_color,
                        "rgba(255, 255, 255, 0.15)"
                      )}
                      strokeWidth={strokeWidth}
                    />
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      fill="none"
                      stroke={resolveColor(layer.fill_color, "#5865F2")}
                      strokeWidth={strokeWidth}
                      strokeDasharray={c}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                    />
                  </svg>
                  {layer.show_text && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        color: resolveColor(layer.text_color, "#ffffff"),
                        fontFamily: layer.font_family || "inherit",
                        fontSize: `${layer.font_size || 14}px`,
                        fontWeight: layer.font_weight || "bold",
                      }}
                    >
                      {Math.round(pct)}%
                    </span>
                  )}
                </div>
              );
            }

            if (layer.progress_style === "segmented") {
              const segments = 10;
              const activeSegments = Math.round((pct / 100) * segments);
              return (
                <div className="w-full h-full flex items-center gap-1.5 pointer-events-none relative">
                  {Array.from({ length: segments }).map((_, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-full transition-colors"
                      style={{
                        borderRadius: `${Math.min(4, layer.border_radius || 4)}px`,
                        backgroundColor:
                          idx < activeSegments
                            ? resolveColor(layer.fill_color, "#5865F2")
                            : resolveColor(
                                layer.background_color,
                                "rgba(255, 255, 255, 0.15)"
                              ),
                      }}
                    />
                  ))}
                  {layer.show_text && (
                    <span
                      className="absolute inset-0 flex items-center justify-center z-10"
                      style={{
                        color: resolveColor(layer.text_color, "#ffffff"),
                        fontFamily: layer.font_family || "inherit",
                        fontSize: `${layer.font_size || 12}px`,
                        fontWeight: layer.font_weight || "bold",
                      }}
                    >
                      {Math.round(pct)}%
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                className="w-full h-full relative overflow-hidden pointer-events-none flex items-center justify-center"
                style={{
                  backgroundColor: resolveColor(
                    layer.background_color,
                    "rgba(255, 255, 255, 0.15)"
                  ),
                  borderRadius: `${layer.border_radius || 0}px`,
                  borderWidth: `${layer.border_width || 0}px`,
                  borderColor: resolveColor(layer.border_color, "transparent"),
                  borderStyle: layer.border_width ? "solid" : "none",
                }}
              >
                <div
                  className="h-full absolute left-0 top-0 transition-all"
                  style={{
                    width: `${pct}%`,
                    background:
                      (layer.fill_type === "gradient" ||
                        layer.fill_type === "linear-gradient") &&
                      layer.fill_gradient &&
                      layer.fill_gradient.stops &&
                      layer.fill_gradient.stops.length >= 2
                        ? `linear-gradient(${layer.fill_gradient.angle || 90}deg, ${layer.fill_gradient.stops
                            .map(
                              (s) =>
                                `${resolveColor(s.color)} ${s.offset > 1 ? s.offset : s.offset * 100}%`
                            )
                            .join(", ")})`
                        : resolveColor(layer.fill_color, "#5865F2"),
                    borderRadius: `${layer.border_radius || 0}px`,
                  }}
                />
                {layer.show_text && (
                  <span
                    className="relative z-10"
                    style={{
                      color: resolveColor(layer.text_color, "#ffffff"),
                      fontFamily: layer.font_family || "inherit",
                      fontSize: `${layer.font_size || 12}px`,
                      fontWeight: layer.font_weight || "bold",
                    }}
                  >
                    {Math.round(pct)}%
                  </span>
                )}
              </div>
            );
          })()}

        {layer.type === "badge" &&
          (() => {
            const lblRaw = resolveLayerValueClient(
              layer,
              "label",
              layer.label || "",
              sampleData
            );
            return (
              <div
                className="w-full h-full flex items-center justify-center font-medium leading-none pointer-events-none"
                style={{
                  backgroundColor: resolveColor(layer.color, "#5865F2"),
                  color: resolveColor(layer.text_color, "#ffffff"),
                  fontSize: `${layer.font_size || 12}px`,
                  fontFamily: layer.font_family || "inherit",
                  fontWeight: layer.font_weight || "bold",
                  borderRadius: `${layer.border_radius || 9999}px`,
                  borderWidth: `${layer.border_width || 0}px`,
                  borderColor: resolveColor(layer.border_color, "transparent"),
                  borderStyle: layer.border_width ? "solid" : "none",
                  boxShadow: layer.shadow_color
                    ? `0 0 ${layer.shadow_blur || 10}px ${layer.shadow_color}`
                    : undefined,
                }}
              >
                {interpolateTemplate(lblRaw, sampleData)}
              </div>
            );
          })()}

        {layer.type === "repeater" &&
          (() => {
            const expr = layer.items_expression || "items";
            const itemsVal = resolveValue(expr, sampleData);
            const itemsList: any[] = Array.isArray(itemsVal)
              ? itemsVal
              : [1, 2, 3];
            const limit = layer.max_items || 5;
            const visibleItems = itemsList.slice(0, limit);
            const tpl: any = layer.item_template || {
              show_rank: true,
              name_field: "username",
              score_field: "xp",
              row_background_color: "#2b2d31",
              border_radius: 8,
            };

            return (
              <div
                className="w-full h-full flex pointer-events-none"
                style={{
                  flexDirection:
                    layer.direction === "horizontal" ? "row" : "column",
                  gap: `${layer.gap || 8}px`,
                }}
              >
                {visibleItems.map((item, idx) => {
                  const itemContext =
                    typeof item === "object" && item !== null
                      ? { ...sampleData, ...item, rank: idx + 1, index: idx + 1 }
                      : { ...sampleData, rank: idx + 1, index: idx + 1 };
                  const name = tpl.name_field
                    ? String(itemContext[tpl.name_field] || `User ${idx + 1}`)
                    : `User ${idx + 1}`;
                  const score = tpl.score_field
                    ? String(
                        itemContext[tpl.score_field] || `${(5 - idx) * 100}`
                      )
                    : "";

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 shrink-0"
                      style={{
                        height: `${layer.item_height || 40}px`,
                        backgroundColor: tpl.row_background_color || "#2b2d31",
                        borderRadius: `${tpl.border_radius || 8}px`,
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        {tpl.show_rank && (
                          <span
                            className="font-bold text-xs"
                            style={{
                              color: tpl.rank_color || "#949ba4",
                              fontFamily: layer.font_family || "inherit",
                            }}
                          >
                            #{idx + 1}
                          </span>
                        )}
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: tpl.name_color || "#ffffff",
                            fontFamily: layer.font_family || "inherit",
                          }}
                        >
                          {name}
                        </span>
                      </div>
                      {score && (
                        <span
                          className="text-xs font-semibold"
                          style={{
                            color: tpl.score_color || "#5865F2",
                            fontFamily: layer.font_family || "inherit",
                          }}
                        >
                          {score}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  artboard: ArtboardNode,
  layer: LayerNode,
};

function buildNodes(
  template: any,
  selectedLayerId: string | null,
  snapGuides: SnapGuide[] = []
): Node[] {
  const sampleData = template.sample_data || {};
  const canvasRadius =
    template.data?.border_radius ??
    template.data?.layers?.find((l: Layer) => l.type === "background")?.border_radius ??
    0;

  const artboardNode: Node = {
    id: "artboard",
    type: "artboard",
    position: { x: 0, y: 0 },
    width: template.width,
    height: template.height,
    style: {
      width: `${template.width}px`,
      height: `${template.height}px`,
      borderRadius: `${canvasRadius}px`,
    },
    data: {
      width: template.width,
      height: template.height,
      borderRadius: canvasRadius,
      selected: selectedLayerId === "canvas",
      snapGuides,
    },
    draggable: false,
    selectable: true,
    deletable: false,
    zIndex: 0,
  };

  const layerNodes: Node[] = template.data.layers
    .filter((l: Layer) => l.visible !== false)
    .map((layer: Layer, index: number) => ({
      id: layer.id,
      type: "layer",
      position: { x: layer.x, y: layer.y },
      width: layer.width,
      height: layer.height,
      style: {
        width: `${layer.width}px`,
        height: `${layer.height}px`,
        zIndex: index + 10,
      },
      selected: selectedLayerId === layer.id,
      draggable: !layer.locked,
      selectable: !layer.locked,
      deletable: true,
      zIndex: index + 10,
      data: {
        layer,
        sampleData,
      },
    }));

  return [artboardNode, ...layerNodes];
}

function InnerImageCanvas() {
  const { theme } = useHookedTheme();
  const { fitView } = useReactFlow();
  const undo = useImageEditorStore((s) => s.undo);
  const redo = useImageEditorStore((s) => s.redo);
  const canUndo = useImageEditorStore((s) => s.canUndo());
  const canRedo = useImageEditorStore((s) => s.canRedo());
  const selectedLayerId = useImageEditorStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useImageEditorStore((s) => s.setSelectedLayerId);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const duplicateLayer = useImageEditorStore((s) => s.duplicateLayer);
  const reorderLayer = useImageEditorStore((s) => s.reorderLayer);
  const updateLayerTransient = useImageEditorStore((s) => s.updateLayerTransient);
  const beginAction = useImageEditorStore((s) => s.beginAction);
  const endAction = useImageEditorStore((s) => s.endAction);
  const template = useImageEditorStore((s) => s.template);

  const editorPreferences = useImageEditorStore((s) => s.editorPreferences);

  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const initialNodes = useMemo(
    () => buildNodes(template, selectedLayerId, snapGuides),
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const hasFitted = React.useRef(false);

  useEffect(() => {
    setNodes((prevNodes) => {
      const nextNodes = buildNodes(template, selectedLayerId, snapGuides);
      return nextNodes.map((n) => {
        const existing = prevNodes.find((p) => p.id === n.id);
        if (existing) {
          return {
            ...existing,
            ...n,
            position: n.position,
            data: n.data,
            selected: n.selected,
            zIndex: n.zIndex,
            width: n.width,
            height: n.height,
            style: n.style,
            measured: { width: n.width, height: n.height },
          };
        }
        return {
          ...n,
          measured: { width: n.width, height: n.height },
        };
      });
    });
  }, [template, selectedLayerId, snapGuides, setNodes]);

  useEffect(() => {
    if (!hasFitted.current) {
      hasFitted.current = true;
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 200, maxZoom: 1 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [fitView]);

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.id === "artboard") {
        setSelectedLayerId("canvas");
      } else {
        setSelectedLayerId(node.id);
      }
    },
    [setSelectedLayerId]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedLayerId(null);
  }, [setSelectedLayerId]);

  const handleNodeDragStart = useCallback(
    (_e: any, node: Node) => {
      if (node.id === "artboard") return;
      beginAction();
    },
    [beginAction]
  );

  // Magnetic Alignment & Snap Detection during Drag
  const handleNodeDrag = useCallback(
    (_e: any, node: Node) => {
      if (node.id === "artboard") return;
      const SNAP_THRESHOLD = 6;
      const w = node.width || 100;
      const h = node.height || 50;
      let nextX = node.position.x;
      let nextY = node.position.y;

      const activeGuides: SnapGuide[] = [];

      if (editorPreferences.smartGuides) {
        // Vertical candidate snap lines (X)
        const vCandidates: number[] = [
          0,
          Math.round(template.width / 2),
          template.width,
        ];
        // Horizontal candidate snap lines (Y)
        const hCandidates: number[] = [
          0,
          Math.round(template.height / 2),
          template.height,
        ];

        for (const other of template.data.layers) {
          if (other.id === node.id || other.visible === false || other.type === "background") {
            continue;
          }
          vCandidates.push(
            other.x,
            Math.round(other.x + other.width / 2),
            other.x + other.width
          );
          hCandidates.push(
            other.y,
            Math.round(other.y + other.height / 2),
            other.y + other.height
          );
        }

        // Check node left, center, right against vertical candidates
        for (const candX of vCandidates) {
          if (Math.abs(nextX - candX) <= SNAP_THRESHOLD) {
            nextX = candX;
            activeGuides.push({ orientation: "vertical", position: candX });
            break;
          }
          if (Math.abs(nextX + w / 2 - candX) <= SNAP_THRESHOLD) {
            nextX = Math.round(candX - w / 2);
            activeGuides.push({ orientation: "vertical", position: candX });
            break;
          }
          if (Math.abs(nextX + w - candX) <= SNAP_THRESHOLD) {
            nextX = candX - w;
            activeGuides.push({ orientation: "vertical", position: candX });
            break;
          }
        }

        // Check node top, middle, bottom against horizontal candidates
        for (const candY of hCandidates) {
          if (Math.abs(nextY - candY) <= SNAP_THRESHOLD) {
            nextY = candY;
            activeGuides.push({ orientation: "horizontal", position: candY });
            break;
          }
          if (Math.abs(nextY + h / 2 - candY) <= SNAP_THRESHOLD) {
            nextY = Math.round(candY - h / 2);
            activeGuides.push({ orientation: "horizontal", position: candY });
            break;
          }
          if (Math.abs(nextY + h - candY) <= SNAP_THRESHOLD) {
            nextY = candY - h;
            activeGuides.push({ orientation: "horizontal", position: candY });
            break;
          }
        }
      }

      if (editorPreferences.snapToGrid) {
        const GRID = 8;
        nextX = Math.round(nextX / GRID) * GRID;
        nextY = Math.round(nextY / GRID) * GRID;
      }

      setSnapGuides(activeGuides);
      updateLayerTransient(node.id, {
        x: Math.round(nextX),
        y: Math.round(nextY),
      });
    },
    [
      template.width,
      template.height,
      template.data.layers,
      updateLayerTransient,
      editorPreferences.smartGuides,
      editorPreferences.snapToGrid,
    ]
  );

  const handleNodeDragStop = useCallback(
    (_e: any, node: Node) => {
      if (node.id === "artboard") return;
      setSnapGuides([]);
      const currentLayer = useImageEditorStore
        .getState()
        .template.data.layers.find((l: Layer) => l.id === node.id);
      updateLayerTransient(node.id, {
        x: currentLayer ? currentLayer.x : Math.round(node.position.x),
        y: currentLayer ? currentLayer.y : Math.round(node.position.y),
      });
      endAction();
    },
    [updateLayerTransient, endAction]
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) {
        if (n.id !== "artboard") {
          removeLayer(n.id);
        }
      }
      setSelectedLayerId(null);
    },
    [removeLayer, setSelectedLayerId]
  );

  const nudgeSnapshotRef = React.useRef<ImageTemplate | null>(null);
  const nudgeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const commitNudge = useCallback(() => {
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    if (nudgeSnapshotRef.current) {
      const snap = nudgeSnapshotRef.current;
      nudgeSnapshotRef.current = null;
      const current = useImageEditorStore.getState().template;
      if (JSON.stringify(snap) !== JSON.stringify(current)) {
        useImageEditorStore.setState((state) => ({
          hasUnsavedChanges: true,
          history: {
            past: [...state.history.past.slice(-50), snap],
            future: [],
          },
        }));
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT")
      ) {
        return;
      }

      if (e.key === "Escape") {
        setSelectedLayerId(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        commitNudge();
        if (e.shiftKey) {
          if (useImageEditorStore.getState().canRedo()) {
            useImageEditorStore.getState().redo();
          }
        } else {
          if (useImageEditorStore.getState().canUndo()) {
            useImageEditorStore.getState().undo();
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        commitNudge();
        if (useImageEditorStore.getState().canRedo()) {
          useImageEditorStore.getState().redo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        if (selectedLayerId) {
          e.preventDefault();
          duplicateLayer(selectedLayerId);
        }
        return;
      }

      // Layer ordering shortcuts: [ and ]
      if ((e.key === "[" || e.key === "]") && selectedLayerId) {
        const idx = template.data.layers.findIndex(
          (l: Layer) => l.id === selectedLayerId
        );
        if (idx !== -1) {
          e.preventDefault();
          if (e.key === "[" && idx > 0) {
            reorderLayer(selectedLayerId, idx - 1);
          } else if (e.key === "]" && idx < template.data.layers.length - 1) {
            reorderLayer(selectedLayerId, idx + 1);
          }
        }
        return;
      }

      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        const selectedLayer = template.data.layers.find(
          (l: Layer) => l.id === selectedLayerId
        );
        if (selectedLayer && !selectedLayer.locked) {
          e.preventDefault();
          if (!nudgeSnapshotRef.current) {
            nudgeSnapshotRef.current = JSON.parse(JSON.stringify(template));
          }
          const step = e.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;
          if (e.key === "ArrowUp") dy = -step;
          if (e.key === "ArrowDown") dy = step;
          if (e.key === "ArrowLeft") dx = -step;
          if (e.key === "ArrowRight") dx = step;

          updateLayerTransient(selectedLayer.id, {
            x: selectedLayer.x + dx,
            y: selectedLayer.y + dy,
          });

          if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
          nudgeTimerRef.current = setTimeout(() => {
            commitNudge();
          }, 500);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, [
    selectedLayerId,
    template,
    duplicateLayer,
    reorderLayer,
    updateLayerTransient,
    setSelectedLayerId,
    commitNudge,
  ]);

  return (
    <ImageContextMenu onFitView={() => fitView({ padding: 0.2, duration: 200 })}>
      <div className="w-full h-full relative flex-1">
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onNodesDelete={handleNodesDelete}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode={null}
          colorMode={theme === "dark" ? "dark" : "light"}
          defaultViewport={{ x: 60, y: 60, zoom: 0.8 }}
          minZoom={0.1}
          maxZoom={3}
          elevateNodesOnSelect={false}
          zIndexMode="manual"
          className="!bg-background flex-auto w-full h-full"
          proOptions={{ hideAttribution: true }}
        >
          <Controls
            showInteractive={false}
            position="bottom-right"
            className="scale-110 !hidden md:!flex"
          >
            <ControlButton onClick={undo} disabled={!canUndo} title="Undo">
              <Undo2Icon className="size-5 !fill-none" />
            </ControlButton>
            <ControlButton onClick={redo} disabled={!canRedo} title="Redo">
              <Redo2Icon className="size-5 !fill-none" />
            </ControlButton>
            <ControlButton
              onClick={() => fitView({ padding: 0.2, duration: 200 })}
              title="Fit View"
            >
              <Maximize2Icon className="size-5 !fill-none" />
            </ControlButton>
          </Controls>
          {editorPreferences.gridStyle !== "none" && (
            <Background
              variant={
                editorPreferences.gridStyle === "lines"
                  ? BackgroundVariant.Lines
                  : editorPreferences.gridStyle === "cross"
                  ? BackgroundVariant.Cross
                  : BackgroundVariant.Dots
              }
              gap={20}
              size={1}
              className="!bg-muted/20"
            />
          )}
        </ReactFlow>
      </div>
    </ImageContextMenu>
  );
}

export default function ImageCanvas() {
  return (
    <ReactFlowProvider>
      <InnerImageCanvas />
    </ReactFlowProvider>
  );
}
