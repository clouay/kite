import {
  getCachedPhotoColors,
  extractColorsFromImage,
  getDistinctFallbackColors,
} from "./photoColors";
import { DEFAULT_PLACEHOLDER_PHOTO } from "./state";

export function resolveValue(path: string, context: Record<string, any>): any {
  if (!path || !context) return "";
  const trimmed = path.trim();

  // If path is an expression like {{foo.bar}}
  const exprMatch = trimmed.match(/^\{\{\s*(.*?)\s*\}\}$/);
  const target = exprMatch ? exprMatch[1] : trimmed;

  // 1. Direct match (e.g. context["rank_card.username.text"])
  if (context[target] !== undefined && context[target] !== null) {
    return context[target];
  }
  if (context[trimmed] !== undefined && context[trimmed] !== null) {
    return context[trimmed];
  }
  if (context[`{{${target}}}`] !== undefined && context[`{{${target}}}`] !== null) {
    return context[`{{${target}}}`];
  }

  // 2. Suffix match (e.g. key ends with .username.text or .username)
  const targetSuffix = "." + target;
  for (const [k, v] of Object.entries(context)) {
    if (v === undefined || v === null || v === "") continue;
    const cleanK = k.replace(/^\{\{\s*|\s*\}\}$/g, "");
    if (cleanK === target || cleanK.endsWith(targetSuffix)) {
      return v;
    }
  }

  // 3. Deep property lookup: foo.bar
  const parts = target.split(".");
  let current: any = context;
  for (const part of parts) {
    if (current == null) break;
    current = current[part];
  }
  if (current !== undefined && current !== null) {
    return current;
  }

  // 4. Dynamic photo color lookup: e.g. {{image_avatar.average}}, {{image_avatar.dominant}}, {{image_avatar.inverse}}
  if (
    target.endsWith(".average") ||
    target.endsWith(".dominant") ||
    target.endsWith(".inverse") ||
    target.endsWith(".inverted") ||
    target.endsWith(".dominant_inverse") ||
    target.endsWith(".average_inverse") ||
    target.endsWith(".color") ||
    target === "photo.average" ||
    target === "avatar.average" ||
    target === "photo.dominant" ||
    target === "avatar.dominant" ||
    target === "photo.inverse" ||
    target === "avatar.inverse"
  ) {
    const isDom = target.endsWith(".dominant") || target.endsWith(".dominant_inverse");
    const isInv =
      target.endsWith(".inverse") ||
      target.endsWith(".inverted") ||
      target.endsWith(".average_inverse") ||
      target.endsWith(".dominant_inverse") ||
      target === "photo.inverse" ||
      target === "avatar.inverse";

    const baseKey = target.replace(
      /\.(average|dominant|inverse|inverted|dominant_inverse|average_inverse|color)$/,
      ""
    );

    let imgUrl: string | undefined;
    let slotIndex = 0;

    const getRawOrInterpolatedUrl = (val?: string): string | undefined => {
      if (!val || typeof val !== "string") return undefined;
      const trimmedVal = val.trim();
      if (/^(https?:|data:)/.test(trimmedVal)) return trimmedVal;
      // If it contains a template placeholder e.g. {{avatar}}
      if (trimmedVal.includes("{{")) {
        const interpolated = interpolateTemplate(trimmedVal, context);
        if (/^(https?:|data:)/.test(interpolated)) return interpolated;
      }
      const direct = resolveValue(trimmedVal, context);
      if (typeof direct === "string" && /^(https?:|data:)/.test(direct)) {
        return direct;
      }
      return undefined;
    };

    if (Array.isArray(context._layers)) {
      const imgLayers = context._layers.filter((l: any) => l && l.type === "image");
      const usedSlugs = new Map<string, number>();

      for (let i = 0; i < imgLayers.length; i++) {
        const l = imgLayers[i];
        const identifiers: string[] = [];
        if (l.id) identifiers.push(l.id.toLowerCase());

        const m = typeof l.image_url === "string" ? l.image_url.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/) : null;
        if (m) identifiers.push(m[1].toLowerCase());

        if (l.name) {
          const rawSlug = l.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "image";
          const count = (usedSlugs.get(rawSlug) || 0) + 1;
          usedSlugs.set(rawSlug, count);
          const disambiguated = count === 1 ? rawSlug : `${rawSlug}_${count}`;
          identifiers.push(disambiguated);
          if (count === 1) identifiers.push(rawSlug);
        }

        identifiers.push(`image_${i + 1}`);
        identifiers.push(`photo_${i + 1}`);
        if (i === 0) {
          identifiers.push("photo");
          identifiers.push("avatar");
          identifiers.push("image");
        }

        const baseLower = baseKey.toLowerCase();
        if (identifiers.includes(baseLower)) {
          imgUrl = getRawOrInterpolatedUrl(l.image_url);
          slotIndex = i;
          break;
        }
      }
    }

    if (!imgUrl) {
      const direct = resolveValue(baseKey, context);
      if (typeof direct === "string" && /^(https?:|data:)/.test(direct)) {
        imgUrl = direct;
      }
    }

    if (!imgUrl && (baseKey === "photo" || baseKey === "avatar" || baseKey === "image")) {
      if (Array.isArray(context._layers)) {
        const first = context._layers.find((l: any) => l && l.type === "image");
        if (first) {
          imgUrl = getRawOrInterpolatedUrl(first.image_url);
        }
      }
    }

    if (!imgUrl) {
      for (const val of Object.values(context)) {
        if (typeof val === "string" && /^(https?:|data:)/.test(val)) {
          imgUrl = val;
          break;
        }
      }
    }

    if (!imgUrl) {
      imgUrl =
        "https://cdn.discordapp.com/app-icons/1500112380464726106/dc6d484228e2e40291d539e809e392fe?size=1024";
    }

    const cached = getCachedPhotoColors(imgUrl);
    if (cached) {
      if (isInv) {
        return isDom ? (cached.dominantInverse || cached.inverse) : cached.inverse;
      }
      return isDom ? cached.dominant : cached.average;
    }
    extractColorsFromImage(imgUrl, undefined, slotIndex);
    const fallback = getDistinctFallbackColors(imgUrl || baseKey, slotIndex);
    if (isInv) return isDom ? (fallback.dominantInverse || fallback.inverse) : fallback.inverse;
    return isDom ? fallback.dominant : fallback.average;
  }

  return undefined;
}

export function resolveLayerValueClient(
  layer: { id: string; name?: string; type: string; [key: string]: any },
  fieldName: string,
  defaultValue: string,
  vars: Record<string, any>
): string {
  if (!vars || Object.keys(vars).length === 0) return defaultValue;

  const aliases =
    fieldName === "content" || fieldName === "text"
      ? ["text", "content"]
      : fieldName === "image_url" || fieldName === "url" || fieldName === "avatar"
      ? ["image_url", "url", "avatar"]
      : fieldName === "label"
      ? ["label", "text"]
      : fieldName === "items" || fieldName === "items_expression"
      ? ["items", "items_expression"]
      : [fieldName];

  const candidates: string[] = [];
  if (layer.id) candidates.push(layer.id);
  if (layer.name) {
    candidates.push(layer.name);
    const slug = layer.name.toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
    if (slug && slug !== layer.id.toLowerCase()) {
      candidates.push(slug);
    }
  }

  // 1. Candidate + alias checks (e.g. "player_name.text", "xp_value", "avatar_url")
  for (const cand of candidates) {
    for (const alias of aliases) {
      for (const k of [`${cand}.${alias}`, `${cand}_${alias}`]) {
        if (vars[k] !== undefined && vars[k] !== null && vars[k] !== "") {
          return String(vars[k]);
        }
        if (vars[`{{${k}}}`] !== undefined && vars[`{{${k}}}`] !== null && vars[`{{${k}}}`] !== "") {
          return String(vars[`{{${k}}}`]);
        }
      }
    }
  }

  // 2. Direct layer ID check
  if (layer.id) {
    if (vars[layer.id] !== undefined && vars[layer.id] !== null && vars[layer.id] !== "") {
      return String(vars[layer.id]);
    }
    if (vars[`{{${layer.id}}}`] !== undefined && vars[`{{${layer.id}}}`] !== null && vars[`{{${layer.id}}}`] !== "") {
      return String(vars[`{{${layer.id}}}`]);
    }
  }

  const isExplicitImageUrl =
    (fieldName === "image_url" || fieldName === "url" || fieldName === "avatar") &&
    /^(https?:|data:)/.test(defaultValue) &&
    defaultValue !== DEFAULT_PLACEHOLDER_PHOTO;

  // 3. Candidate name check alone, provided defaultValue doesn't contain an inline template placeholder
  if (!defaultValue.includes("{{") && !isExplicitImageUrl) {
    for (const cand of candidates) {
      if (vars[cand] !== undefined && vars[cand] !== null && vars[cand] !== "") {
        return String(vars[cand]);
      }
      if (vars[`{{${cand}}}`] !== undefined && vars[`{{${cand}}}`] !== null && vars[`{{${cand}}}`] !== "") {
        return String(vars[`{{${cand}}}`]);
      }
    }
  }

  // 4. Suffix matching (e.g. "tmpl.layer.text")
  for (const cand of candidates) {
    for (const alias of aliases) {
      const dotSuffix = `.${cand}.${alias}`;
      const underSuffix = `.${cand}_${alias}`;
      for (const [k, v] of Object.entries(vars)) {
        if (v === undefined || v === null || v === "") continue;
        const cleanK = k.replace(/^\{\{\s*|\s*\}\}$/g, "");
        if (cleanK.endsWith(dotSuffix) || cleanK.endsWith(underSuffix)) {
          return String(v);
        }
      }
    }

    if (!isExplicitImageUrl) {
      const candSuffix = `.${cand}`;
      for (const [k, v] of Object.entries(vars)) {
        if (v === undefined || v === null || v === "") continue;
        const cleanK = k.replace(/^\{\{\s*|\s*\}\}$/g, "");
        if (cleanK.endsWith(candSuffix)) {
          return String(v);
        }
      }
    }
  }

  return defaultValue;
}

export function interpolateTemplate(
  template: string,
  context: Record<string, any>
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const val = resolveValue(key, context);
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}
