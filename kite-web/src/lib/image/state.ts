import { create } from "zustand";
import { ImageTemplate } from "@/lib/types/wire.gen";
import { Layer } from "@/lib/types/image.gen";

interface HistoryState {
  past: ImageTemplate[];
  future: ImageTemplate[];
}

export interface EditorPreferences {
  smartGuides: boolean;
  snapToGrid: boolean;
  gridStyle: "dots" | "lines" | "cross" | "none";
  showHoverOutlines: boolean;
}

export interface ImageEditorState {
  template: ImageTemplate;
  selectedLayerId: string | null;
  zoom: number;
  history: HistoryState;
  hasUnsavedChanges: boolean;
  editorPreferences: EditorPreferences;
  setEditorPreferences: (prefs: Partial<EditorPreferences>) => void;

  // Actions
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setDimensions: (width: number, height: number) => void;
  setCanvasBorderRadius: (borderRadius: number) => void;
  setFormat: (format: string) => void;
  setSelectedLayerId: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;

  beginAction: () => void;
  endAction: () => void;
  addLayer: (layer: Partial<Layer> & { type: Layer["type"]; name: string }) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  updateLayerTransient: (id: string, updates: Partial<Layer>) => void;
  renameLayerId: (oldId: string, newId: string) => void;
  commitLayerChange: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, toIndex: number) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  setSampleData: (sampleData: Record<string, any>) => void;
  replaceAll: (template: ImageTemplate) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const DEFAULT_PLACEHOLDER_PHOTO =
  "https://cdn.discordapp.com/app-icons/1500112380464726106/dc6d484228e2e40291d539e809e392fe?size=1024";

export interface PlaceholderMeta {
  key: string;
  isImage: boolean;
  isNumeric: boolean;
  isMax: boolean;
  isStatus: boolean;
  fallbackValue: any;
}

export function extractPlaceholdersFromLayers(
  layers: Layer[]
): Map<string, PlaceholderMeta> {
  const map = new Map<string, PlaceholderMeta>();

  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;

    for (const [propName, propVal] of Object.entries(layer)) {
      if (typeof propVal !== "string" || !propVal.includes("{{")) continue;

      const matches = Array.from(
        propVal.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)
      );
      for (const m of matches) {
        const key = m[1].trim();
        if (!key) continue;

        // Skip dynamic auto-computed photo color expressions (e.g. {{image_avatar.average}}, {{user.avatar.dominant}})
        if (
          key.endsWith(".average") ||
          key.endsWith(".dominant") ||
          key.endsWith(".color") ||
          key.startsWith("photo.") ||
          key.startsWith("avatar.")
        ) {
          continue;
        }

        const isDecoration =
          propName === "avatar_decoration" || /(decoration|frame|decor)/i.test(key);

        const isImage =
          !isDecoration &&
          (propName === "image_url" ||
            layer.type === "image" ||
            /(avatar|image|icon|photo|pfp|pic|banner|logo|thumbnail|img)/i.test(key));

        const isStatus =
          propName === "status_value" || /(status|presence)/i.test(key);

        const isMax =
          propName === "max_value" || /(max|limit|target|goal)/i.test(key);

        const isNumeric =
          (layer.type === "progress_bar" && propName === "value") ||
          isMax ||
          /(xp|exp|score|points|level|rank|count|total|members|percent|pct)/i.test(
            key
          );

        let fallbackValue: any = `Sample ${key}`;
        if (isDecoration) {
          fallbackValue =
            "https://cdn.discordapp.com/avatar-decoration-presets/a_1005898c6acf56a9ac5010baf444f6fd.png?size=240&passthrough=true";
        } else if (isImage) {
          fallbackValue = DEFAULT_PLACEHOLDER_PHOTO;
        } else if (isStatus) {
          fallbackValue = "online";
        } else if (isMax) {
          fallbackValue = /(xp|exp|score)/i.test(key) ? 2000 : 100;
        } else if (isNumeric) {
          if (/(xp|exp|score)/i.test(key)) fallbackValue = 1250;
          else if (/(count|total|members)/i.test(key)) fallbackValue = 500;
          else if (/(rank)/i.test(key)) fallbackValue = 1;
          else fallbackValue = 65;
        }

        const existing = map.get(key);
        if (!existing) {
          map.set(key, { key, isImage, isNumeric, isMax, isStatus, fallbackValue });
        } else {
          if (isImage) {
            existing.isImage = true;
            existing.fallbackValue = DEFAULT_PLACEHOLDER_PHOTO;
          } else if (isNumeric && !existing.isImage) {
            existing.isNumeric = true;
            existing.fallbackValue = fallbackValue;
          }
        }
      }
    }
  }

  return map;
}

export function syncSampleDataWithLayers(
  layers: Layer[],
  currentSampleData: Record<string, any> = {}
): Record<string, any> {
  const placeholders = extractPlaceholdersFromLayers(layers);
  const nextData: Record<string, any> = {};

  for (const [key, meta] of placeholders.entries()) {
    let existingVal = currentSampleData[key];

    if (existingVal === undefined && key.includes(".")) {
      const parts = key.split(".");
      let cur: any = currentSampleData;
      for (const part of parts) {
        if (cur == null || typeof cur !== "object") {
          cur = undefined;
          break;
        }
        cur = cur[part];
      }
      existingVal = cur;
    }

    if (existingVal !== undefined && existingVal !== null) {
      if (meta.isImage) {
        const sVal = String(existingVal).trim();
        if (
          sVal.includes("unsplash.com") ||
          (!sVal.startsWith("http://") &&
            !sVal.startsWith("https://") &&
            !sVal.startsWith("data:") &&
            !sVal.startsWith("blob:"))
        ) {
          nextData[key] = DEFAULT_PLACEHOLDER_PHOTO;
        } else {
          nextData[key] = existingVal;
        }
      } else if (meta.isNumeric) {
        const parsed = Number(existingVal);
        if (
          isNaN(parsed) ||
          (typeof existingVal === "string" && existingVal.startsWith("Sample "))
        ) {
          nextData[key] = meta.fallbackValue;
        } else {
          nextData[key] =
            typeof existingVal === "string" && !isNaN(Number(existingVal))
              ? Number(existingVal)
              : existingVal;
        }
      } else {
        nextData[key] = existingVal;
      }
    } else {
      nextData[key] = meta.fallbackValue;
    }
  }

  return nextData;
}

const defaultTemplate: ImageTemplate = {
  id: "",
  app_id: "",
  name: "New Image Template",
  description: null,
  width: 800,
  height: 400,
  format: "png",
  data: {
    layers: [],
  },
  sample_data: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let continuousTimer: any = null;
let continuousSnapshot: ImageTemplate | null = null;
let actionSnapshot: ImageTemplate | null = null;

function flushContinuous(get: () => ImageEditorState, set: any) {
  if (continuousTimer) {
    clearTimeout(continuousTimer);
    continuousTimer = null;
  }
  if (continuousSnapshot) {
    const snap = continuousSnapshot;
    continuousSnapshot = null;
    const current = get().template;
    if (JSON.stringify(snap) !== JSON.stringify(current)) {
      set((state: ImageEditorState) => ({
        hasUnsavedChanges: true,
        history: {
          past: [...state.history.past.slice(-50), snap],
          future: [],
        },
      }));
    }
  }
}

export const useImageEditorStore = create<ImageEditorState>((set, get) => ({
  template: defaultTemplate,
  selectedLayerId: null,
  zoom: 1,
  hasUnsavedChanges: false,
  editorPreferences: {
    smartGuides: true,
    snapToGrid: false,
    gridStyle: "dots",
    showHoverOutlines: true,
  },
  setEditorPreferences: (prefs) =>
    set((state) => ({
      editorPreferences: { ...state.editorPreferences, ...prefs },
    })),
  history: {
    past: [],
    future: [],
  },

  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),

  beginAction: () => {
    flushContinuous(get, set);
    if (!actionSnapshot) {
      actionSnapshot = JSON.parse(JSON.stringify(get().template));
    }
  },

  endAction: () => {
    if (continuousTimer) {
      clearTimeout(continuousTimer);
      continuousTimer = null;
    }
    if (actionSnapshot) {
      const snap = actionSnapshot;
      actionSnapshot = null;
      const current = get().template;
      if (JSON.stringify(snap) !== JSON.stringify(current)) {
        set((state) => ({
          hasUnsavedChanges: true,
          history: {
            past: [...state.history.past.slice(-50), snap],
            future: [],
          },
        }));
      }
    }
  },

  setName: (name) => {
    flushContinuous(get, set);
    const current = get().template;
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: { ...current, name },
    }));
  },

  setDescription: (description) => {
    flushContinuous(get, set);
    const current = get().template;
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: { ...current, description },
    }));
  },

  setDimensions: (width, height) => {
    flushContinuous(get, set);
    const current = get().template;
    const layers = current.data.layers.map((l: Layer) =>
      l.type === "background" ? { ...l, width, height } : l
    );
    const data = { ...current.data, layers };
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: { ...current, width, height, data },
    }));
  },

  setCanvasBorderRadius: (borderRadius) => {
    flushContinuous(get, set);
    const current = get().template;
    const r = Math.max(0, borderRadius);
    const layers = current.data.layers.map((l: Layer) =>
      l.type === "background" ? { ...l, border_radius: r } : l
    );
    const data = { ...current.data, border_radius: r, layers };
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: { ...current, data },
    }));
  },

  setFormat: (format) => {
    flushContinuous(get, set);
    const current = get().template;
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: { ...current, format },
    }));
  },

  setSelectedLayerId: (id) => set({ selectedLayerId: id }),

  setZoom: (zoom) => set({ zoom: Math.max(0.2, Math.min(3, zoom)) }),

  addLayer: (layer) => {
    flushContinuous(get, set);
    const current = get().template;
    const id =
      layer.id ||
      `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newLayer: Layer = {
      ...layer,
      id,
      visible: layer.visible !== false,
      opacity: layer.opacity ?? 1,
      x: layer.x ?? Math.max(20, Math.round(current.width / 2 - 120)),
      y: layer.y ?? Math.max(20, Math.round(current.height / 2 - 25)),
      width: layer.width ?? 200,
      height: layer.height ?? 50,
    };
    const layers = [...current.data.layers, newLayer];
    const sample_data = syncSampleDataWithLayers(layers, current.sample_data);
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      selectedLayerId: newLayer.id,
      template: {
        ...current,
        sample_data,
        data: { ...current.data, layers },
      },
    }));
  },

  updateLayer: (id, updates) => {
    // If an action (e.g. resize, drag) is currently active, update template transiently
    if (actionSnapshot) {
      const current = get().template;
      const targetLayer = current.data.layers.find((l: Layer) => l.id === id);
      const layers = current.data.layers.map((l: Layer) =>
        l.id === id ? { ...l, ...updates } : l
      );
      const data = {
        ...current.data,
        layers,
        ...(targetLayer?.type === "background" && updates.border_radius !== undefined
          ? { border_radius: updates.border_radius }
          : {}),
      };
      set({
        hasUnsavedChanges: true,
        template: {
          ...current,
          data,
        },
      });
      return;
    }

    // Capture snapshot for continuous edits (typing, sliders, color picker)
    if (!continuousSnapshot) {
      continuousSnapshot = JSON.parse(JSON.stringify(get().template));
    }

    const current = get().template;
    const targetLayer = current.data.layers.find((l: Layer) => l.id === id);
    const layers = current.data.layers.map((l: Layer) =>
      l.id === id ? { ...l, ...updates } : l
    );
    const sample_data = syncSampleDataWithLayers(layers, current.sample_data);
    const data = {
      ...current.data,
      layers,
      ...(targetLayer?.type === "background" && updates.border_radius !== undefined
        ? { border_radius: updates.border_radius }
        : {}),
    };

    set({
      hasUnsavedChanges: true,
      template: {
        ...current,
        sample_data,
        data,
      },
    });

    if (continuousTimer) {
      clearTimeout(continuousTimer);
    }
    continuousTimer = setTimeout(() => {
      flushContinuous(get, set);
    }, 600);
  },

  updateLayerTransient: (id, updates) => {
    const current = get().template;
    const targetLayer = current.data.layers.find((l: Layer) => l.id === id);
    const layers = current.data.layers.map((l: Layer) =>
      l.id === id ? { ...l, ...updates } : l
    );
    const data = {
      ...current.data,
      layers,
      ...(targetLayer?.type === "background" && updates.border_radius !== undefined
        ? { border_radius: updates.border_radius }
        : {}),
    };
    set({
      hasUnsavedChanges: true,
      template: {
        ...current,
        data,
      },
    });
  },

  renameLayerId: (oldId, newId) => {
    if (!newId || oldId === newId) return;
    flushContinuous(get, set);
    const current = get().template;
    const existing = current.data.layers.find((l: Layer) => l.id === newId);
    if (existing) return; // Prevent duplicate IDs

    const layers = current.data.layers.map((l: Layer) => {
      if (l.id !== oldId) return l;
      const updated = { ...l, id: newId };
      if (updated.content === `{{${oldId}}}`) updated.content = `{{${newId}}}`;
      if (updated.image_url === `{{${oldId}}}`) updated.image_url = `{{${newId}}}`;
      if (updated.value === `{{${oldId}}}`) updated.value = `{{${newId}}}`;
      if (updated.label === `{{${oldId}}}`) updated.label = `{{${newId}}}`;
      return updated;
    });

    const baseSample = { ...(current.sample_data || {}) };
    if (baseSample[oldId] !== undefined) {
      baseSample[newId] = baseSample[oldId];
      delete baseSample[oldId];
    }
    const sample_data = syncSampleDataWithLayers(layers, baseSample);

    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      selectedLayerId: state.selectedLayerId === oldId ? newId : state.selectedLayerId,
      template: {
        ...current,
        sample_data,
        data: { ...current.data, layers },
      },
    }));
  },

  commitLayerChange: () => {
    flushContinuous(get, set);
  },

  duplicateLayer: (id) => {
    flushContinuous(get, set);
    const current = get().template;
    const target = current.data.layers.find((l: Layer) => l.id === id);
    if (!target) return;
    const newId = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned: Layer = {
      ...JSON.parse(JSON.stringify(target)),
      id: newId,
      name: `${target.name} (Copy)`,
      x: target.x + 20,
      y: target.y + 20,
    };
    const layers = [...current.data.layers, cloned];
    const sample_data = syncSampleDataWithLayers(layers, current.sample_data);
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      selectedLayerId: newId,
      template: {
        ...current,
        sample_data,
        data: { ...current.data, layers },
      },
    }));
  },

  reorderLayer: (id, toIndex) => {
    flushContinuous(get, set);
    const current = get().template;
    const layers = [...current.data.layers];
    const fromIndex = layers.findIndex((l: Layer) => l.id === id);
    if (fromIndex === -1) return;
    const [moved] = layers.splice(fromIndex, 1);
    const targetIndex = Math.max(0, Math.min(layers.length, toIndex));
    layers.splice(targetIndex, 0, moved);
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: {
        ...current,
        data: { ...current.data, layers },
      },
    }));
  },

  removeLayer: (id) => {
    flushContinuous(get, set);
    const current = get().template;
    const layers = current.data.layers.filter((l: Layer) => l.id !== id);
    const sample_data = syncSampleDataWithLayers(layers, current.sample_data);
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      selectedLayerId:
        state.selectedLayerId === id ? null : state.selectedLayerId,
      template: {
        ...current,
        sample_data,
        data: { ...current.data, layers },
      },
    }));
  },

  reorderLayers: (fromIndex, toIndex) => {
    flushContinuous(get, set);
    const current = get().template;
    const layers = [...current.data.layers];
    const [moved] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, moved);
    set((state) => ({
      hasUnsavedChanges: true,
      history: {
        past: [...state.history.past.slice(-50), current],
        future: [],
      },
      template: {
        ...current,
        data: { ...current.data, layers },
      },
    }));
  },

  setSampleData: (sample_data) => {
    const current = get().template;
    set({
      hasUnsavedChanges: true,
      template: { ...current, sample_data },
    });
  },

  replaceAll: (template) => {
    if (continuousTimer) {
      clearTimeout(continuousTimer);
      continuousTimer = null;
    }
    continuousSnapshot = null;
    actionSnapshot = null;
    const layers = template.data?.layers || [];
    const sample_data = syncSampleDataWithLayers(
      layers,
      template.sample_data || {}
    );
    set({
      template: {
        ...template,
        sample_data,
      },
      selectedLayerId: layers[0]?.id ?? null,
      history: { past: [], future: [] },
      hasUnsavedChanges: false,
    });
  },

  undo: () => {
    flushContinuous(get, set);
    const { past, future } = get().history;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    set((state) => ({
      hasUnsavedChanges: true,
      template: previous,
      history: {
        past: newPast,
        future: [state.template, ...future],
      },
    }));
  },

  redo: () => {
    flushContinuous(get, set);
    const { past, future } = get().history;
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    set((state) => ({
      hasUnsavedChanges: true,
      template: next,
      history: {
        past: [...past, state.template],
        future: newFuture,
      },
    }));
  },

  canUndo: () =>
    get().history.past.length > 0 ||
    continuousSnapshot !== null ||
    actionSnapshot !== null,
  canRedo: () => get().history.future.length > 0,
}));
