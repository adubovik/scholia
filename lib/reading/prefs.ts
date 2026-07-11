// Per-device reading preferences. Every tunable value is a --reading-* CSS
// variable; this module is the single source of truth for the step scales and
// the localStorage shape, shared by the settings UI and the pre-paint script.

export const STORAGE_KEY = "scholia:reading-prefs";

export type PrefKey = "size" | "line" | "word" | "block" | "width";

// steps are pre-formatted CSS values (line-height is unitless) so mapping is a
// plain lookup. 8 steps per control (a tick per step in the UI). Index `default`
// reproduces today's look (except block, tightened).
export const CONTROLS: Record<PrefKey, { cssVar: string; steps: string[]; default: number }> = {
  size:  { cssVar: "--reading-font-size",    steps: ["1rem", "1.0625rem", "1.125rem", "1.1875rem", "1.25rem", "1.3125rem", "1.375rem", "1.4375rem"], default: 3 },
  line:  { cssVar: "--reading-line-height",  steps: ["1.4", "1.5", "1.6", "1.72", "1.85", "1.95", "2.05", "2.15"], default: 3 },
  word:  { cssVar: "--reading-word-spacing", steps: ["0em", "0.02em", "0.04em", "0.06em", "0.09em", "0.12em", "0.16em", "0.2em"], default: 0 },
  block: { cssVar: "--reading-block-gap",    steps: ["0rem", "0.2rem", "0.5rem", "0.8rem", "1.15rem", "1.5rem", "1.9rem", "2.3rem"], default: 2 },
  width: { cssVar: "--reading-measure",      steps: ["30rem", "36rem", "40rem", "44rem", "50rem", "56rem", "62rem", "70rem"], default: 3 },
};

const KEYS = Object.keys(CONTROLS) as PrefKey[];

export type PrefIndices = Record<PrefKey, number>;

export const DEFAULT_INDICES: PrefIndices = KEYS.reduce((acc, k) => {
  acc[k] = CONTROLS[k].default;
  return acc;
}, {} as PrefIndices);

export function clampIndices(raw: unknown): PrefIndices {
  const obj = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  return KEYS.reduce((acc, k) => {
    const v = obj[k];
    const max = CONTROLS[k].steps.length - 1;
    acc[k] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : CONTROLS[k].default;
    return acc;
  }, {} as PrefIndices);
}

export function stepsToVars(indices: PrefIndices): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of KEYS) vars[CONTROLS[k].cssVar] = CONTROLS[k].steps[indices[k]];
  return vars;
}

export function readStoredIndices(): PrefIndices {
  if (typeof localStorage === "undefined") return { ...DEFAULT_INDICES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return clampIndices(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_INDICES };
  }
}

export function writeStoredIndices(indices: PrefIndices): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(indices));
  } catch {
    /* private-mode / quota — preferences are best-effort */
  }
}

export function clearStoredIndices(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Self-contained IIFE string for a pre-paint <script>. It can't import this
// module (it runs before the bundle), so the scales are serialized in. Kept
// here, next to CONTROLS, so the two copies are generated from one source.
export function preloadScript(): string {
  const map = KEYS.reduce((acc, k) => {
    acc[k] = { v: CONTROLS[k].cssVar, s: CONTROLS[k].steps, d: CONTROLS[k].default };
    return acc;
  }, {} as Record<string, { v: string; s: string[]; d: number }>);
  return `(function(){try{var C=${JSON.stringify(map)},K=${JSON.stringify(STORAGE_KEY)};` +
    `var raw=localStorage.getItem(K),p=raw?JSON.parse(raw):{},d=document.documentElement;` +
    `for(var k in C){var c=C[k],i=p&&typeof p[k]==="number"&&p[k]>=0&&p[k]<c.s.length&&Math.floor(p[k])===p[k]?p[k]:c.d;` +
    `d.style.setProperty(c.v,c.s[i]);}}catch(e){}})();`;
}
