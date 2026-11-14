import React, { useId } from "react";
import { cn } from "@/lib/utils";

export interface DiscordStatusBadgeProps {
  status: string;
  size?: number;
  className?: string;
  borderColor?: string;
}

export function DiscordStatusBadge({
  status,
  size = 24,
  className,
  borderColor = "#111214",
}: DiscordStatusBadgeProps) {
  const maskId = useId().replace(/:/g, "_");
  const normalized = (status || "").trim().toLowerCase();
  const effectiveStatus = normalized.startsWith("{{") ? "online" : normalized;

  const validStatuses = [
    "online",
    "active",
    "idle",
    "away",
    "dnd",
    "do_not_disturb",
    "offline",
    "invisible",
    "streaming",
  ];

  if (!normalized || normalized === "none" || !validStatuses.includes(effectiveStatus)) {
    return null;
  }

  const strokeWidth = Math.max(2, Math.round(size * 0.14));

  return (
    <div
      className={cn("relative flex items-center justify-center shrink-0", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      title={`Discord Status: ${effectiveStatus}`}
    >
      {/* Outer Cutout Border Ring to match Discord's avatar border cut */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: `0 0 0 ${strokeWidth}px ${borderColor}`,
          borderRadius: "9999px",
        }}
      />

      {(effectiveStatus === "online" || effectiveStatus === "active") && (
        <svg viewBox="0 0 24 24" className="w-full h-full block">
          <circle cx="12" cy="12" r="12" fill="#23a55a" />
        </svg>
      )}

      {(effectiveStatus === "idle" || effectiveStatus === "away") && (
        <svg viewBox="0 0 24 24" className="w-full h-full block">
          <mask id={`idle-mask-${maskId}`}>
            <rect width="24" height="24" fill="white" />
            <circle cx="6" cy="6" r="9" fill="black" />
          </mask>
          <circle
            cx="12"
            cy="12"
            r="12"
            fill="#f0b232"
            mask={`url(#idle-mask-${maskId})`}
          />
        </svg>
      )}

      {(effectiveStatus === "dnd" || effectiveStatus === "do_not_disturb") && (
        <svg viewBox="0 0 24 24" className="w-full h-full block">
          <circle cx="12" cy="12" r="12" fill="#f23f43" />
          <rect x="4" y="10" width="16" height="4" rx="2" fill={borderColor} />
        </svg>
      )}

      {(effectiveStatus === "offline" || effectiveStatus === "invisible") && (
        <svg viewBox="0 0 24 24" className="w-full h-full block">
          <circle cx="12" cy="12" r="12" fill="#80848e" />
          <circle cx="12" cy="12" r="6" fill={borderColor} />
        </svg>
      )}

      {effectiveStatus === "streaming" && (
        <svg viewBox="0 0 24 24" className="w-full h-full block">
          <circle cx="12" cy="12" r="12" fill="#593695" />
          <polygon points="9,6 18,12 9,18" fill="#ffffff" />
        </svg>
      )}
    </div>
  );
}
