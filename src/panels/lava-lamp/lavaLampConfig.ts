/** Matches app panel chrome (`bg-slate-950`). */
export const LAVA_LAMP_BACKGROUND = "#020617";

/** Inset between panel edges and the lava lamp canvas. */
export const LAVA_LAMP_CONTENT_INSET_PX = 4;

/** Warm orange-yellow white, mimicking a tungsten bulb at the base. */
export const LAVA_LAMP_TUNGSTEN_RGB: [number, number, number] = [
  255 / 255,
  241 / 255,
  214 / 255,
];

/** px² of panel area represented by each 1% of blob density. */
const BLOB_SLOT_AREA_PER_PCT = 1_000;

export interface LavaLampLayout {
  blobCount: number;
  minBlobSize: number;
  maxBlobSize: number;
}

export interface LavaLampConfig {
  /** Share of panel area used to determine blob count. */
  blobVolumePct: number;
  /** Minimum blob radius in pixels. */
  minBlobRadius: number;
  /** Maximum blob radius in pixels. */
  maxBlobRadius: number;
  blobSpeed: number;
  stickiness: number;
  glowiness: number;
  /** Hue rotation speed in degrees per second. */
  hueSpeed: number;
  /** Radius in px where pointer repulsion is applied. */
  cursorForceRadius: number;
  /** Outward pointer force strength in px/s². */
  cursorForceStrength: number;
  /** How quickly velocity returns to each blob's drift speed (1/s). */
  viscosity: number;
  backgroundColor: string;
}

export const LAVA_LAMP_CONFIG: LavaLampConfig = {
  blobVolumePct: 3,
  minBlobRadius: 12,
  maxBlobRadius: 55,
  blobSpeed: 1,
  stickiness: 1.1,
  glowiness: 0.6,
  hueSpeed: 6,
  cursorForceRadius: 90,
  cursorForceStrength: 800,
  viscosity: 8,
  backgroundColor: LAVA_LAMP_BACKGROUND,
};

function panelVolume(width: number, height: number): number {
  return Math.max(1, width) * Math.max(1, height);
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return [0, 0, 0];
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ];
}

/** HSV with h in degrees, s and v in 0–1. */
export function hsvToRgb(
  h: number,
  s: number,
  v: number,
): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [r + m, g + m, b + m];
}

export function resolveLavaLampLayout(
  config: LavaLampConfig,
  width: number,
  height: number,
): LavaLampLayout {
  const area = panelVolume(width, height);

  let minBlobSize = config.minBlobRadius;
  let maxBlobSize = config.maxBlobRadius;

  if (minBlobSize > maxBlobSize) {
    [minBlobSize, maxBlobSize] = [maxBlobSize, minBlobSize];
  }

  return {
    blobCount: Math.min(
      100,
      Math.max(
        2,
        Math.round(
          (config.blobVolumePct / 100) * (area / BLOB_SLOT_AREA_PER_PCT),
        ),
      ),
    ),
    minBlobSize: Math.max(3, minBlobSize),
    maxBlobSize: Math.max(3, maxBlobSize),
  };
}

export interface LavaBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
  r: number;
}
