// Per-device reading preferences. Every tunable value is a --reading-* CSS
// variable; this module is the single source of truth for the step scales and
// the localStorage shape, shared by the settings UI and the pre-paint script.

// -v2: the step scales were rebuilt so each slider's centre (default) is the tuned
// reading look. Old stored indices addressed the previous 8-step scale and would
// misread onto this one, so the bump drops them — readers fall to the new defaults.
export const STORAGE_KEY = "scholia:reading-prefs-v2";

export type PrefKey = "size" | "line" | "word" | "block" | "width";

// Inline-highlight display mode. Unlike the slider prefs above it's a two-value
// choice, so it lives in its own key and is applied as a root data-attribute
// (not a CSS var slider). "filled" is the default and needs no attribute — only
// "underline" is materialised — so default readers get zero pre-paint work.
export type HlMode = "filled" | "underline";
export const HL_MODE_KEY = "scholia:hl-mode";
export const DEFAULT_HL_MODE: HlMode = "filled";

export function readStoredHlMode(): HlMode {
  if (typeof localStorage === "undefined") return DEFAULT_HL_MODE;
  try {
    return localStorage.getItem(HL_MODE_KEY) === "underline" ? "underline" : DEFAULT_HL_MODE;
  } catch {
    return DEFAULT_HL_MODE;
  }
}

export function writeStoredHlMode(mode: HlMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (mode === DEFAULT_HL_MODE) localStorage.removeItem(HL_MODE_KEY);
    else localStorage.setItem(HL_MODE_KEY, mode);
  } catch {
    /* private-mode / quota — preferences are best-effort */
  }
}

export function applyHlMode(mode: HlMode): void {
  const el = document.documentElement;
  if (mode === "underline") el.setAttribute("data-hl-mode", "underline");
  else el.removeAttribute("data-hl-mode");
}

// steps are pre-formatted CSS values (line-height is unitless) so mapping is a
// plain lookup. 7 steps per control (a tick per step in the UI) — odd, so the
// middle step is a true centre. Index `default` is that centre (3), tuned to the
// preferred reading look, with three tighter/smaller steps below and three
// looser/larger above. (block/word centre at their floor: the "tighter" side is
// a slight negative, since you can't loosen below flush / normal word spacing.)
export const CONTROLS: Record<PrefKey, { cssVar: string; steps: string[]; default: number }> = {
  size:  { cssVar: "--reading-font-size",    steps: ["0.875rem", "0.9375rem", "1rem", "1.0625rem", "1.125rem", "1.1875rem", "1.25rem"], default: 3 },
  line:  { cssVar: "--reading-line-height",  steps: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"], default: 3 },
  word:  { cssVar: "--reading-word-spacing", steps: ["-0.06em", "-0.04em", "-0.02em", "0em", "0.04em", "0.08em", "0.12em"], default: 3 },
  block: { cssVar: "--reading-block-gap",    steps: ["-0.2rem", "-0.12rem", "-0.05rem", "0rem", "0.5rem", "1rem", "1.6rem"], default: 3 },
  width: { cssVar: "--reading-measure",      steps: ["30rem", "36rem", "40rem", "44rem", "50rem", "56rem", "62rem"], default: 3 },
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
    `d.style.setProperty(c.v,c.s[i]);}` +
    `if(localStorage.getItem(${JSON.stringify(HL_MODE_KEY)})==="underline")d.setAttribute("data-hl-mode","underline");` +
    `}catch(e){}})();`;
}
