export interface PhotoColorResult {
  average: string;
  dominant: string;
  inverse: string;
  dominantInverse: string;
  palette: string[];
}

export const photoColorCache = new Map<string, PhotoColorResult>();

export const PRESET_DISTINCT_PALETTES: PhotoColorResult[] = [
  {
    dominant: "#5865f2",
    average: "#4752c4",
    inverse: "#fee75c",
    dominantInverse: "#fee75c",
    palette: ["#5865f2", "#4752c4", "#fee75c", "#ffffff"],
  },
  {
    dominant: "#22c55e",
    average: "#16a34a",
    inverse: "#ec4899",
    dominantInverse: "#ec4899",
    palette: ["#22c55e", "#16a34a", "#ec4899", "#ffffff"],
  },
  {
    dominant: "#f59e0b",
    average: "#d97706",
    inverse: "#3b82f6",
    dominantInverse: "#3b82f6",
    palette: ["#f59e0b", "#d97706", "#3b82f6", "#ffffff"],
  },
  {
    dominant: "#ec4899",
    average: "#db2777",
    inverse: "#22c55e",
    dominantInverse: "#22c55e",
    palette: ["#ec4899", "#db2777", "#22c55e", "#ffffff"],
  },
  {
    dominant: "#06b6d4",
    average: "#0891b2",
    inverse: "#f97316",
    dominantInverse: "#f97316",
    palette: ["#06b6d4", "#0891b2", "#f97316", "#ffffff"],
  },
  {
    dominant: "#8b5cf6",
    average: "#7c3aed",
    inverse: "#84cc16",
    dominantInverse: "#84cc16",
    palette: ["#8b5cf6", "#7c3aed", "#84cc16", "#ffffff"],
  },
];

export function getDistinctFallbackColors(
  identifier = "",
  slotIndex = 0
): PhotoColorResult {
  if (!identifier) {
    return PRESET_DISTINCT_PALETTES[slotIndex % PRESET_DISTINCT_PALETTES.length];
  }
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash + slotIndex) % PRESET_DISTINCT_PALETTES.length;
  return PRESET_DISTINCT_PALETTES[idx];
}

export function toHexColor(c?: string): string {
  if (!c) return "#000000";
  const s = c.trim();
  if (s.startsWith("#")) {
    if (s.length === 7) return s.toLowerCase();
    if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    if (s.length === 9) return s.slice(0, 7).toLowerCase();
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const r = parseInt(m[1]).toString(16).padStart(2, "0");
    const g = parseInt(m[2]).toString(16).padStart(2, "0");
    const b = parseInt(m[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`.toLowerCase();
  }
  return "#000000";
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hR = Math.max(0, Math.min(255, r)).toString(16).padStart(2, "0");
  const hG = Math.max(0, Math.min(255, g)).toString(16).padStart(2, "0");
  const hB = Math.max(0, Math.min(255, b)).toString(16).padStart(2, "0");
  return `#${hR}${hG}${hB}`.toLowerCase();
}

export function invertHexColor(hex: string): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length < 6) return "#ffffff";
  const r = 255 - (parseInt(clean.slice(0, 2), 16) || 0);
  const g = 255 - (parseInt(clean.slice(2, 4), 16) || 0);
  const b = 255 - (parseInt(clean.slice(4, 6), 16) || 0);
  return rgbToHex(r, g, b);
}

export function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return false;
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 185;
}

export function getCachedPhotoColors(url: string): PhotoColorResult | null {
  if (!url) return null;
  return photoColorCache.get(url) || null;
}

const activeRequests = new Set<string>();

export function extractColorsFromImage(
  url: string,
  onDone?: (data: PhotoColorResult) => void,
  slotIndex = 0
): void {
  if (!url) return;
  if (photoColorCache.has(url)) {
    if (onDone) onDone(photoColorCache.get(url)!);
    return;
  }

  if (typeof window === "undefined") return;

  if (activeRequests.has(url)) {
    return;
  }
  activeRequests.add(url);

  const notify = (res: PhotoColorResult) => {
    activeRequests.delete(url);
    photoColorCache.set(url, res);
    window.dispatchEvent(
      new CustomEvent("photo-colors-ready", { detail: { url, result: res } })
    );
    if (onDone) onDone(res);
  };

  // 1. First attempt: call the server-side proxy route which bypasses browser CORS completely
  fetch("/api/image/colors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && data.dominant && data.average) {
        notify({
          dominant: toHexColor(data.dominant),
          average: toHexColor(data.average),
          inverse: toHexColor(data.inverse || invertHexColor(data.average)),
          dominantInverse: toHexColor(data.dominant_inverse || invertHexColor(data.dominant)),
          palette: data.palette || [data.dominant, data.average],
        });
        return;
      }
      throw new Error("Server extraction fallback");
    })
    .catch(() => {
      // 2. Client-side canvas fallback
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("No canvas context");
          const size = 32;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);
          const imgData = ctx.getImageData(0, 0, size, size).data;

          let rSum = 0,
            gSum = 0,
            bSum = 0,
            count = 0;
          const bucketCounts = new Map<
            string,
            { r: number; g: number; b: number; count: number }
          >();

          for (let i = 0; i < imgData.length; i += 4) {
            const a = imgData[i + 3];
            if (a < 128) continue;
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];

            rSum += r;
            gSum += g;
            bSum += b;
            count++;

            const qr = Math.floor(r / 32) * 32 + 16;
            const qg = Math.floor(g / 32) * 32 + 16;
            const qb = Math.floor(b / 32) * 32 + 16;
            const key = `${qr},${qg},${qb}`;

            const item = bucketCounts.get(key);
            if (item) {
              item.count++;
            } else {
              bucketCounts.set(key, { r: qr, g: qg, b: qb, count: 1 });
            }
          }

          if (count === 0) throw new Error("Blank image");

          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);
          const average = rgbToHex(avgR, avgG, avgB);

          const sorted = Array.from(bucketCounts.values()).sort(
            (a, b) => b.count - a.count
          );

          let dominant = average;
          let maxScore = -1;
          for (const bucket of sorted) {
            const maxC = Math.max(bucket.r, bucket.g, bucket.b);
            const minC = Math.min(bucket.r, bucket.g, bucket.b);
            const sat = maxC - minC;
            const score = bucket.count * (sat + 30);
            if (score > maxScore) {
              maxScore = score;
              dominant = rgbToHex(bucket.r, bucket.g, bucket.b);
            }
          }

          const palette: string[] = [];
          for (const bucket of sorted) {
            const hex = rgbToHex(bucket.r, bucket.g, bucket.b);
            if (hex !== average && hex !== dominant && !palette.includes(hex)) {
              palette.push(hex);
            }
            if (palette.length >= 4) break;
          }

          const inverse = invertHexColor(average);
          const dominantInverse = invertHexColor(dominant);

          notify({ average, dominant, inverse, dominantInverse, palette });
        } catch {
          notify(getDistinctFallbackColors(url, slotIndex));
        }
      };
      img.onerror = () => {
        notify(getDistinctFallbackColors(url, slotIndex));
      };
      img.src = url;
    });
}
