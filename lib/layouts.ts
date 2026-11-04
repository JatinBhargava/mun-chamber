// Room templates: names and colour themes. Seating geometry and artwork live in components/RoomMap.tsx.

import type { CSSProperties } from "react";

export const LAYOUTS = [
  { id: "assembly", name: "Assembly Hall", tagline: "Classic hemicycle under a great dome", emoji: "🏛️" },
  { id: "council", name: "Council Horseshoe", tagline: "The famous horseshoe table, with a mural behind the President", emoji: "🐎" },
  { id: "roundtable", name: "Summit Round Table", tagline: "Leaders face to face around a wooden table", emoji: "🪵" },
  { id: "arena", name: "Neon Arena", tagline: "Debate under neon lights like a championship final", emoji: "⚡" },
  { id: "benches", name: "Parliament Benches", tagline: "Two green benches facing across the aisle", emoji: "🌿" },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];
export const LAYOUT_IDS = LAYOUTS.map((l) => l.id) as LayoutId[];
export const layoutName = (id: LayoutId) => LAYOUTS.find((l) => l.id === id)?.name ?? "Assembly Hall";

interface Theme {
  ink: string; panel: string; line: string; fg: string; muted: string; un: string; gold: string;
  display: string;
  bg: string;
}

const THEMES: Record<LayoutId, Theme> = {
  assembly: {
    ink: "#0a1220", panel: "#101b2e", line: "#22314b", fg: "#e7edf7", muted: "#8ea0bd", un: "#4b92db", gold: "#d6ad55",
    display: '"Source Serif 4", ui-serif, Georgia, serif',
    bg: "radial-gradient(1200px 600px at 50% -200px, rgba(75,146,219,0.16), transparent), #0a1220",
  },
  council: {
    ink: "#0a1615", panel: "#10211f", line: "#21403a", fg: "#eaf4f0", muted: "#8fb3a9", un: "#4fc3a9", gold: "#f0c674",
    display: '"Cinzel", ui-serif, Georgia, serif',
    bg: "radial-gradient(900px 500px at 50% -150px, rgba(240,198,116,0.14), transparent), radial-gradient(800px 600px at 100% 100%, rgba(79,195,169,0.08), transparent), #0a1615",
  },
  roundtable: {
    ink: "#16100b", panel: "#201710", line: "#3a2a1b", fg: "#f7ede1", muted: "#bda78f", un: "#e8955a", gold: "#f2cf6b",
    display: '"Fraunces", ui-serif, Georgia, serif',
    bg: "radial-gradient(1000px 600px at 50% 0%, rgba(232,149,90,0.14), transparent), radial-gradient(600px 400px at 0% 100%, rgba(242,207,107,0.06), transparent), #16100b",
  },
  arena: {
    ink: "#07050f", panel: "#0f0a20", line: "#2b1d52", fg: "#f2edff", muted: "#a698d4", un: "#22d3ee", gold: "#f472b6",
    display: '"Orbitron", ui-sans-serif, system-ui, sans-serif',
    bg: "radial-gradient(700px 500px at 15% 0%, rgba(244,114,182,0.18), transparent), radial-gradient(700px 500px at 85% 10%, rgba(34,211,238,0.16), transparent), #07050f",
  },
  benches: {
    ink: "#08130d", panel: "#0e1c14", line: "#1f3b2b", fg: "#eaf5ee", muted: "#93b6a1", un: "#5fd08f", gold: "#e3bd5b",
    display: '"Playfair Display", ui-serif, Georgia, serif',
    bg: "radial-gradient(1000px 500px at 50% -150px, rgba(95,208,143,0.14), transparent), #08130d",
  },
};

/** CSS variables + background for a template. Put it on a wrapper and everything inside re-themes. */
export function themeStyle(id: LayoutId): CSSProperties {
  const t = THEMES[id] ?? THEMES.assembly;
  return {
    ["--ink" as string]: t.ink,
    ["--panel" as string]: t.panel,
    ["--line" as string]: t.line,
    ["--fg" as string]: t.fg,
    ["--muted" as string]: t.muted,
    ["--un" as string]: t.un,
    ["--gold" as string]: t.gold,
    ["--display" as string]: t.display,
    background: t.bg,
    color: t.fg,
  };
}

/**
 * The app's own light "Clean Block" look (home page and everything around the room map).
 * Same token names as the room themes, so shared components restyle automatically.
 */
export const CLEAN_BLOCK: CSSProperties = {
  ["--ink" as string]: "#f3f7fc",
  ["--panel" as string]: "#ffffff",
  ["--line" as string]: "#d5deea",
  ["--fg" as string]: "#10213a",
  ["--muted" as string]: "#44546d",
  ["--un" as string]: "#1d4ed8",
  ["--gold" as string]: "#d62839",
  ["--display" as string]: '"Baloo 2", system-ui, sans-serif',
  color: "#10213a",
  fontFamily: "Figtree, system-ui, sans-serif",
};

/** Light page background with a faint brick-stud dot grid. */
export const CLEAN_BLOCK_BG = "radial-gradient(circle at 1px 1px, rgba(29,78,216,0.09) 1.5px, transparent 2px) 0 0 / 22px 22px, #f7faff";
