import React from "react";

/**
 * Deterministic avatar via Dicebear's HTTP API. Same seed (username, or wallet
 * address as fallback) always yields the same avatar - no storage needed. When
 * uploads land later, an uploaded URL overrides the generated one.
 */
const STYLE = "bottts";  // change here to swap the whole app's avatar style

export default function Avatar({
  seed, size = 40, uploadedUrl,
}: { seed: string | null | undefined; size?: number; uploadedUrl?: string | null }) {
  const s = (seed || "predarena").toLowerCase();
  const src = uploadedUrl || `https://api.dicebear.com/9.x/${STYLE}/svg?seed=${encodeURIComponent(s)}`;
  return (
    <img
      src={src}
      alt="avatar"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: size * 0.28, background: "var(--panel-2)", flexShrink: 0 }}
    />
  );
}
