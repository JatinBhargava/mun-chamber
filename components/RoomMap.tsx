"use client";

// Draws the committee room for each template: seat positions, room artwork, the Chair's seat,
// and where the podium (current speaker + timer) sits.

import { useEffect, useId, useMemo, useState, type ReactNode, type SVGProps } from "react";
import { figureSvg } from "@/lib/figureSvg";
import { flag } from "@/lib/countries";
import { themeStyle, type LayoutId } from "@/lib/layouts";
import type { Ballot, CommitteeView, Member } from "@/lib/types";
import Podium from "./Podium";

interface Seat { x: number; y: number; nx: number; ny: number } // (nx, ny) points toward the room's centre
interface Geo { seats: Seat[]; r: number; chair?: Seat }
type Shape = "circle" | "square" | "hex";

interface Def {
  w: number;
  h: number;
  maxH: number; // px, keeps tall rooms from taking the whole screen
  shape: Shape;
  nameplates: boolean;
  podium: { x: number; y: number; width: number } | null; // centre overlay (viewBox units), or null = below the room
  geo: (n: number) => Geo;
  crop?: (geo: Geo) => [number, number]; // optional vertical crop [top, height] so sparse rooms don't leave empty bands
  Decor: (p: { uid: string; geo: Geo }) => ReactNode;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const toward = (x: number, y: number, cx: number, cy: number): Seat => {
  const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1;
  return { x, y, nx: dx / d, ny: dy / d };
};

/** Seats on concentric rings, clockwise from the top. The first slot of the first ring is the Chair. */
function rings(cx: number, cy: number, radii: number[], counts: number[]): Seat[] {
  const out: Seat[] = [];
  radii.forEach((R, i) => {
    const k = counts[i];
    if (!k) return;
    const offset = i % 2 ? Math.PI / k : 0;
    for (let j = 0; j < k; j++) {
      const a = -Math.PI / 2 + offset + (2 * Math.PI * j) / k;
      out.push(toward(cx + R * Math.cos(a), cy + R * Math.sin(a), cx, cy));
    }
  });
  return out;
}

function splitByCapacity(total: number, caps: number[]): number[] {
  const out: number[] = [];
  let left = total;
  for (const c of caps) { const k = Math.min(c, left); out.push(k); left -= k; }
  if (left > 0) { // over capacity: spread the rest proportionally
    const sum = caps.reduce((a, b) => a + b, 0);
    return caps.map((c, i) => (i === caps.length - 1 ? total - caps.slice(0, -1).reduce((a, cc) => a + Math.round((total * cc) / sum), 0) : Math.round((total * c) / sum)));
  }
  return out;
}

// ---------------- templates ----------------

const assembly: Def = {
  w: 400, h: 215, maxH: 520, shape: "circle", nameplates: false, podium: null,
  geo(n) {
    if (!n) return { seats: [], r: 12 };
    const rows = n <= 12 ? 2 : n <= 30 ? 3 : n <= 60 ? 4 : 5;
    const inner = 0.42, outer = 0.96, R = 190;
    const radii = Array.from({ length: rows }, (_, i) => R * (inner + ((outer - inner) * i) / Math.max(1, rows - 1)));
    const total = radii.reduce((a, b) => a + b, 0);
    const counts = radii.map((r) => Math.max(1, Math.round((n * r) / total)));
    let diff = n - counts.reduce((a, b) => a + b, 0);
    for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) { counts[i] += Math.sign(diff); diff -= Math.sign(diff); }
    const seats: (Seat & { a: number })[] = [];
    radii.forEach((r, i) => {
      for (let j = 0; j < counts[i]; j++) {
        const a = Math.PI - (Math.PI * (j + 0.5)) / counts[i];
        seats.push({ ...toward(200 + r * Math.cos(a), 200 - r * Math.sin(a), 200, 200), a });
      }
    });
    seats.sort((p, q) => q.a - p.a);
    const rowGap = (radii[1] ?? R) - radii[0] || 40;
    const arcGap = (Math.PI * radii[rows - 1]) / counts[rows - 1];
    return { seats, r: clamp(Math.min(rowGap, arcGap) * 0.42, 6, 14) };
  },
  Decor: ({ uid }) => (
    <>
      <defs>
        <radialGradient id={`${uid}f`} cx="50%" cy="100%" r="75%">
          <stop offset="0" stopColor="var(--un)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--un)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="215" fill={`url(#${uid}f)`} />
      {/* dome ribs */}
      {Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI - (Math.PI * (i + 0.5)) / 9;
        return <line key={i} x1={200} y1={200} x2={200 + 205 * Math.cos(a)} y2={200 - 205 * Math.sin(a)} stroke="var(--line)" strokeOpacity={0.5} />;
      })}
      {[0.42, 0.6, 0.78, 0.96, 1.04].map((k) => (
        <path key={k} d={`M ${200 - 190 * k} 200 A ${190 * k} ${190 * k} 0 0 1 ${200 + 190 * k} 200`} fill="none" stroke="var(--line)" strokeDasharray={k > 1 ? "0" : "2 5"} strokeWidth={k > 1 ? 2 : 1} />
      ))}
      {/* faint globe */}
      <g opacity={0.09} stroke="var(--fg)" fill="none" strokeWidth={1.2}>
        <circle cx={200} cy={200} r={62} />
        <ellipse cx={200} cy={200} rx={30} ry={62} />
        <line x1={138} y1={200} x2={262} y2={200} />
        <path d="M 145 170 Q 200 160 255 170 M 145 230 Q 200 240 255 230" />
      </g>
    </>
  ),
};

const council: Def = {
  w: 400, h: 270, maxH: 560, shape: "square", nameplates: true, podium: { x: 200, y: 168, width: 150 },
  geo(n) {
    const L = 110, R = 112, cx = 200, cy = 140, total = 2 * L + Math.PI * R;
    const at = (s: number): Seat => {
      if (s <= L) return { x: cx - R, y: cy + L - s, nx: 1, ny: 0 };
      if (s <= L + Math.PI * R) {
        const a = Math.PI - (s - L) / R;
        return toward(cx + R * Math.cos(a), cy - R * Math.sin(a), cx, cy);
      }
      return { x: cx + R, y: cy + (s - L - Math.PI * R), nx: -1, ny: 0 };
    };
    const spacing = total / (n + 1);
    const left = Math.ceil(n / 2), right = n - left;
    const seats: Seat[] = [];
    for (let k = left; k >= 1; k--) seats.push(at(total / 2 - spacing * k));
    for (let k = 1; k <= right; k++) seats.push(at(total / 2 + spacing * k));
    return { seats, r: clamp(spacing * 0.36, 6, 14), chair: at(total / 2) };
  },
  Decor: ({ uid }) => (
    <>
      <defs>
        <linearGradient id={`${uid}m`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--un)" stopOpacity="0.05" />
          <stop offset="0.5" stopColor="var(--gold)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--un)" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id={`${uid}w`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="var(--un)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--un)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* mural behind the President: a rising sun and bird */}
      <rect x={60} y={0} width={280} height={74} rx={6} fill={`url(#${uid}m)`} />
      <g opacity={0.35}>
        <circle cx={200} cy={44} r={20} fill="var(--gold)" opacity={0.5} />
        {Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI + (Math.PI * (i + 0.5)) / 11;
          return <line key={i} x1={200 + 26 * Math.cos(a)} y1={44 + 26 * Math.sin(a)} x2={200 + 52 * Math.cos(a)} y2={44 + 52 * Math.sin(a)} stroke="var(--gold)" strokeWidth={1.5} />;
        })}
        <path d="M 200 52 C 170 30 140 34 112 18 C 140 46 165 50 196 60 Z M 200 52 C 230 30 260 34 288 18 C 260 46 235 50 204 60 Z" fill="var(--fg)" opacity={0.55} />
      </g>
      {/* the well and the table */}
      <ellipse cx={200} cy={180} rx={80} ry={90} fill={`url(#${uid}w)`} />
      <path d="M 108 254 L 108 140 A 92 92 0 0 1 292 140 L 292 254" fill="none" stroke="color-mix(in srgb, var(--un) 28%, var(--panel))" strokeWidth={20} strokeLinecap="round" />
      <path d="M 108 254 L 108 140 A 92 92 0 0 1 292 140 L 292 254" fill="none" stroke="var(--un)" strokeOpacity={0.35} strokeWidth={1} />
      <path d="M 98 254 L 98 140 A 102 102 0 0 1 302 140 L 302 254" fill="none" stroke="var(--fg)" strokeOpacity={0.12} strokeWidth={0.8} />
    </>
  ),
};

const roundtable: Def = {
  w: 400, h: 400, maxH: 580, shape: "circle", nameplates: true, podium: { x: 200, y: 200, width: 150 },
  geo(n) {
    const slots = n + 1;
    const radii = slots <= 30 ? [142] : [134, 168];
    const counts = radii.length === 1 ? [slots] : splitByCapacity(slots, [Math.round((slots * 134) / 302), slots]);
    const seats = rings(200, 200, radii, counts);
    const spacing = Math.min(...radii.map((R, i) => (2 * Math.PI * R) / Math.max(1, counts[i])));
    return { seats: seats.slice(1), chair: seats[0], r: clamp(spacing * 0.38, 6, radii.length > 1 ? 13 : 15) };
  },
  Decor: ({ uid }) => (
    <>
      <defs>
        <radialGradient id={`${uid}rug`} cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="var(--un)" stopOpacity="0.1" />
          <stop offset="1" stopColor="var(--un)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}wood`} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#7a5232" />
          <stop offset="0.7" stopColor="#4c311d" />
          <stop offset="1" stopColor="#3a2414" />
        </radialGradient>
      </defs>
      <circle cx={200} cy={200} r={198} fill={`url(#${uid}rug)`} />
      <circle cx={200} cy={200} r={186} fill="none" stroke="var(--gold)" strokeOpacity={0.15} strokeDasharray="1 6" />
      <circle cx={200} cy={200} r={110} fill={`url(#${uid}wood)`} stroke="#8c6440" strokeWidth={2} />
      {[104, 98, 92, 86].map((r) => <circle key={r} cx={200} cy={200} r={r} fill="none" stroke="#fff" strokeOpacity={0.05} />)}
      <circle cx={200} cy={200} r={80} fill="var(--ink)" fillOpacity={0.75} stroke="var(--gold)" strokeOpacity={0.35} />
      {/* compass rose inlay */}
      <g opacity={0.14} stroke="var(--gold)" fill="none">
        <path d="M 200 128 L 208 200 L 200 272 L 192 200 Z M 128 200 L 200 192 L 272 200 L 200 208 Z" />
        <circle cx={200} cy={200} r={40} />
      </g>
    </>
  ),
};

const arena: Def = {
  w: 400, h: 400, maxH: 600, shape: "hex", nameplates: false, podium: { x: 200, y: 200, width: 160 },
  geo(n) {
    const tiers = [130, 158, 186];
    const slots = n + 1;
    const caps = tiers.map((R) => Math.floor((2 * Math.PI * R) / 27));
    const counts = splitByCapacity(slots, caps);
    const used = tiers.filter((_, i) => counts[i] > 0);
    const seats = rings(200, 200, used, counts.filter((k) => k > 0));
    const spacing = Math.min(...used.map((R, i) => (2 * Math.PI * R) / counts[i]));
    return { seats: seats.slice(1), chair: seats[0], r: clamp(spacing * 0.42, 6, 12) };
  },
  Decor: ({ uid }) => (
    <>
      <defs>
        <filter id={`${uid}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id={`${uid}neon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--un)" />
        </linearGradient>
        <radialGradient id={`${uid}floor`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="var(--un)" stopOpacity="0.06" />
          <stop offset="1" stopColor="var(--un)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={200} cy={200} r={200} fill={`url(#${uid}floor)`} />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        return <line key={i} x1={200 + 96 * Math.cos(a)} y1={200 + 96 * Math.sin(a)} x2={200 + 200 * Math.cos(a)} y2={200 + 200 * Math.sin(a)} stroke="var(--line)" strokeOpacity={0.6} />;
      })}
      {[130, 158, 186].map((R) => <circle key={R} cx={200} cy={200} r={R} fill="none" stroke="var(--line)" strokeWidth={22} strokeOpacity={0.35} />)}
      <g className="spin-slow">
        <circle cx={200} cy={200} r={197} fill="none" stroke="var(--un)" strokeOpacity={0.55} strokeDasharray="3 12" strokeWidth={1.5} />
      </g>
      <g className="spin-rev">
        <circle cx={200} cy={200} r={88} fill="none" stroke="var(--gold)" strokeOpacity={0.6} strokeDasharray="10 8" />
      </g>
      <circle cx={200} cy={200} r={96} fill="var(--ink)" fillOpacity={0.85} stroke={`url(#${uid}neon)`} strokeWidth={3} filter={`url(#${uid}glow)`} />
    </>
  ),
};

const benches: Def = {
  w: 400, h: 262, maxH: 480, shape: "square", nameplates: false, podium: null,
  geo(n) {
    const top = Math.ceil(n / 2), bottom = n - top;
    const rowsNeeded = clamp(Math.ceil(top / 13), 1, 4);
    const perRow = Math.max(1, Math.ceil(top / rowsNeeded));
    const x0 = 96, x1 = 390, spacing = Math.min(26, (x1 - x0) / perRow);
    const topY = [94, 68, 42, 16], botY = [168, 194, 220, 246];
    const place = (count: number, ys: number[], ny: number) =>
      Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const inRow = Math.min(perRow, count - row * perRow);
        const start = (x0 + x1) / 2 - (spacing * inRow) / 2;
        return { x: start + spacing * (col + 0.5), y: ys[Math.min(row, 3)], nx: 0, ny };
      });
    return { seats: [...place(top, topY, 1), ...place(bottom, botY, -1)], r: clamp(spacing * 0.38, 5, 10), chair: { x: 40, y: 131, nx: 1, ny: 0 } };
  },
  crop(geo) {
    const ys = geo.seats.map((s) => s.y);
    const y0 = Math.min(84, ...ys) - 20;
    const y1 = Math.max(178, ...ys) + 20;
    return [y0, y1 - y0];
  },
  Decor: ({ geo }) => {
    const ys = [...new Set(geo.seats.map((s) => s.y))];
    return (
      <>
        {/* the floor, the red lines and the table */}
        <rect x={80} y={108} width={316} height={46} fill="var(--un)" fillOpacity={0.05} />
        <line x1={84} y1={110} x2={396} y2={110} stroke="#e05252" strokeOpacity={0.55} strokeWidth={1.2} />
        <line x1={84} y1={152} x2={396} y2={152} stroke="#e05252" strokeOpacity={0.55} strokeWidth={1.2} />
        {ys.map((y) => (
          <g key={y}>
            <rect x={86} y={y - 12} width={308} height={24} rx={7} fill="#1f6b45" fillOpacity={0.45} stroke="#2f8a5c" strokeOpacity={0.5} />
            <line x1={92} y1={y + 8} x2={388} y2={y + 8} stroke="#9fe0bb" strokeOpacity={0.18} strokeDasharray="2 3" />
          </g>
        ))}
        <rect x={130} y={118} width={220} height={26} rx={4} fill="#5a3d22" stroke="#8b6338" />
        <rect x={180} y={120} width={20} height={8} rx={1.5} fill="var(--gold)" fillOpacity={0.6} />
        <rect x={280} y={134} width={20} height={8} rx={1.5} fill="var(--gold)" fillOpacity={0.6} />
        <line x1={215} y1={131} x2={265} y2={131} stroke="var(--gold)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={265} cy={131} r={3} fill="var(--gold)" />
        {/* the presiding officer's canopied chair */}
        <path d="M 22 104 L 40 92 L 58 104 Z" fill="var(--gold)" fillOpacity={0.4} />
        <rect x={26} y={104} width={28} height={50} rx={4} fill="#3b2a17" stroke="var(--gold)" strokeOpacity={0.6} />
      </>
    );
  },
};

const DEFS: Record<LayoutId, Def> = { assembly, council, roundtable, arena, benches };

// ---------------- rendering ----------------

function SeatShape({ shape, x, y, r, ...p }: { shape: Shape; x: number; y: number; r: number } & SVGProps<SVGElement>) {
  const props = p as SVGProps<SVGCircleElement> & SVGProps<SVGRectElement> & SVGProps<SVGPolygonElement>;
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={r * 0.35} {...props} />;
  if (shape === "hex") {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      return `${x + r * 1.08 * Math.cos(a)},${y + r * 1.08 * Math.sin(a)}`;
    }).join(" ");
    return <polygon points={pts} {...props} />;
  }
  return <circle cx={x} cy={y} r={r} {...props} />;
}

const BALLOT_COLOR: Record<Ballot, string> = { yes: "#34d399", no: "#f87171", abstain: "#94a3b8", pass: "#fbbf24" };
const code3 = (m: Member) => (m.iso ?? m.country?.slice(0, 3) ?? "").toUpperCase();
const svgId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

export default function RoomMap({ state, now, onSeat, hint }: { state: CommitteeView; now: () => number; onSeat?: (m: Member) => void; hint?: string }) {
  const def = DEFS[state.layout] ?? assembly;
  const uid = svgId(useId());
  const delegates = useMemo(
    () => Object.values(state.members).filter((m) => m.role === "delegate").sort((a, b) => (a.country ?? "").localeCompare(b.country ?? "")),
    [state.members],
  );
  const geo = useMemo(() => def.geo(delegates.length), [def, delegates.length]);
  const { seats, r } = geo;
  const [vy, vh] = def.crop ? def.crop(geo) : [0, def.h];
  const speakerId = state.speaker?.memberId;
  const vote = state.vote;
  const calling = vote?.rollCall ? vote.rollOrder[vote.rollIndex] : undefined;
  const chairMember = state.members[state.chairId];
  const speakerSeat = speakerId ? seats[delegates.findIndex((d) => d.id === speakerId)] : undefined;
  const p = def.podium;
  const [figures, setFigures] = useFigurePref();
  // Draw back rows first so figures in front overlap the ones behind them.
  const drawOrder = useMemo(() => seats.map((_, i) => i).filter((i) => i < delegates.length).sort((a, b) => seats[a].y - seats[b].y), [seats, delegates.length]);

  return (
    <div key={state.layout} className="room-in">
      <div className="relative mx-auto w-full" style={{ maxWidth: (def.maxH * def.w) / vh }}>
        <button
          onClick={() => setFigures(!figures)}
          className="absolute right-0 top-0 z-10 rounded-full border border-line bg-panel/80 px-2.5 py-1 text-[11px] text-muted backdrop-blur transition hover:text-fg"
          title="Switch between toy figures and simple seats (only on your screen)"
        >
          {figures ? "🧱 Figures" : "● Classic seats"}
        </button>
        <svg viewBox={`0 ${vy} ${def.w} ${vh}`} className="block w-full select-none" role="img" aria-label="Seating plan of the committee">
          <def.Decor uid={uid} geo={geo} />

          {p && speakerSeat && (
            <g>
              <defs>
                <linearGradient id={`${uid}beam`} gradientUnits="userSpaceOnUse" x1={p.x} y1={p.y} x2={speakerSeat.x} y2={speakerSeat.y}>
                  <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
                  <stop offset="1" stopColor="var(--gold)" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <line x1={p.x} y1={p.y} x2={speakerSeat.x} y2={speakerSeat.y} stroke={`url(#${uid}beam)`} strokeWidth={10} strokeOpacity={0.25} strokeLinecap="round" />
              <line x1={p.x} y1={p.y} x2={speakerSeat.x} y2={speakerSeat.y} stroke={`url(#${uid}beam)`} strokeWidth={2.5} strokeDasharray="6 6" className="beam" />
            </g>
          )}

          {geo.chair && (
            <g>
              <title>{`Chair: ${chairMember?.name ?? ""}${state.chairMic ? " (speaking)" : ""}`}</title>
              {state.chairMic && (
                <circle cx={geo.chair.x} cy={geo.chair.y} r={r + 6} fill="var(--un)" opacity={0.25}>
                  <animate attributeName="r" values={`${r + 3};${r + 9};${r + 3}`} dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              {figures ? (
                <g dangerouslySetInnerHTML={{ __html: figureSvg(geo.chair.x, geo.chair.y, r * 1.1, { seed: "chair", country: "Chair", flag: "★", chair: true, speaking: state.chairMic }) }} />
              ) : (
                <>
                  <SeatShape shape={def.shape} x={geo.chair.x} y={geo.chair.y} r={r * 1.15} fill={state.chairMic ? "var(--un)" : "var(--panel)"} stroke="var(--gold)" strokeWidth={2} />
                  <text x={geo.chair.x} y={geo.chair.y + r * 0.42} textAnchor="middle" fontSize={r * 1.2} fill="var(--gold)">★</text>
                </>
              )}
              {def.nameplates && !figures && (
                <text x={geo.chair.x + geo.chair.nx * (r + 9)} y={geo.chair.y + geo.chair.ny * (r + 9) + 2.5} textAnchor="middle" fontSize={6.5} fontWeight={700} letterSpacing={1} fill="var(--gold)">CHAIR</text>
              )}
            </g>
          )}

          {drawOrder.map((i) => {
            const m = delegates[i];
            const s = seats[i];
            if (!s) return null;
            const speaking = m.id === speakerId;
            const ballot = vote?.ballots[m.id];
            const present = m.attendance !== "absent";
            const fill = ballot ? BALLOT_COLOR[ballot] : speaking ? "var(--gold)" : present ? "var(--un)" : "var(--ink)";
            const px = s.x - s.nx * r * 2.2, py = s.y - s.ny * r * 2.2;
            return (
              <g key={m.id} onClick={() => onSeat?.(m)} className={onSeat ? "cursor-pointer" : undefined} opacity={m.online ? 1 : 0.35}>
                <title>{`${m.country} — ${m.name}${m.online ? "" : " (offline)"}${present ? (m.attendance === "present_voting" ? " · present and voting" : " · present") : " · not yet present"}${m.placard ? " · placard raised" : ""}`}</title>
                <g className="seat-in">
                  {speaking && (
                    <circle cx={s.x} cy={s.y} r={r + 6} fill="var(--gold)" opacity={0.3}>
                      <animate attributeName="r" values={`${r + 3};${r + 9};${r + 3}`} dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {calling === m.id && <circle cx={s.x} cy={s.y} r={r + 5} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" />}
                  {figures ? (
                    <>
                      <circle cx={s.x} cy={s.y} r={r * 1.3} fill="transparent" />
                      <g dangerouslySetInnerHTML={{ __html: figureSvg(s.x, s.y, r, {
                        seed: m.country ?? m.id, country: m.country ?? m.name, flag: flag(m.iso),
                        speaking, placard: m.placard && !speaking,
                        ballot: ballot === "yes" || ballot === "no" || ballot === "abstain" ? ballot : null,
                        voting: m.attendance === "present_voting", absent: !present && !ballot,
                      }) }} />
                    </>
                  ) : (
                    <>
                      <SeatShape
                        shape={def.shape} x={s.x} y={s.y} r={r}
                        fill={fill} fillOpacity={present || ballot || speaking ? 0.92 : 0.6}
                        stroke={m.attendance === "present_voting" ? "var(--gold)" : present ? "var(--un)" : "var(--muted)"}
                        strokeWidth={m.attendance === "present_voting" ? 2 : 1.2}
                      />
                      <text x={s.x} y={s.y + r * 0.36} textAnchor="middle" fontSize={r * 1.05}>{flag(m.iso)}</text>
                      {def.nameplates && (
                        <text x={s.x + s.nx * (r + 8)} y={s.y + s.ny * (r + 8) + 2.3} textAnchor="middle" fontSize={6.2} fontWeight={600} fill="var(--muted)">{code3(m)}</text>
                      )}
                      {m.placard && (
                        <g>
                          <line x1={s.x - s.nx * r} y1={s.y - s.ny * r} x2={px} y2={py} stroke="var(--fg)" strokeWidth={1.2} />
                          <rect x={px - r * 0.8} y={py - r * 0.45} width={r * 1.6} height={r * 0.9} rx={1.5} fill="#fff" />
                        </g>
                      )}
                    </>
                  )}
                </g>
              </g>
            );
          })}

          {delegates.length === 0 && (
            <text x={def.w / 2} y={p ? p.y + (def.h - p.y) * 0.75 : def.h * 0.55} textAnchor="middle" fill="var(--muted)" fontSize={12}>Waiting for delegates to join…</text>
          )}
        </svg>

        {p && (
          <div className="absolute hidden -translate-x-1/2 -translate-y-1/2 sm:block" style={{ left: `${(p.x / def.w) * 100}%`, top: `${(p.y / def.h) * 100}%`, width: `${(p.width / def.w) * 100}%` }}>
            <Podium state={state} now={now} compact />
          </div>
        )}
      </div>
      <div className={p ? "mt-3 sm:hidden" : state.layout === "benches" ? "mt-2" : "-mt-4 sm:-mt-10"}>
        <Podium state={state} now={now} />
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {figures ? (
          <>
            <span>💬 speaking (mic light turns red)</span>
            <span><span className="text-gold">●</span> gold pin: present and voting</span>
            <span>🪑 empty desk: not present</span>
            <span>✋ nameplate held up: wants the floor</span>
            <span>🏷️ gold nameplate: the Chair</span>
          </>
        ) : (
          <>
            <Dot color="var(--un)" label="Present" />
            <Dot color="var(--un)" ring label="Present and voting" />
            <Dot color="var(--gold)" label="Speaking" />
            <Dot color="transparent" label="Not present" />
            <span>🪧 placard raised</span>
          </>
        )}
        {hint && <span className="text-un">{hint}</span>}
      </div>
    </div>
  );
}

function Dot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full border" style={{ background: color, borderColor: ring ? "var(--gold)" : color === "transparent" ? "var(--muted)" : color, borderWidth: ring ? 2 : 1 }} />
      {label}
    </span>
  );
}

/** Figures or classic seats: a per-person choice, remembered on this device. */
function useFigurePref(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("mun:seats") === "classic") setOn(false); } catch {}
  }, []);
  return [on, (v: boolean) => {
    setOn(v);
    try { localStorage.setItem("mun:seats", v ? "figures" : "classic"); } catch {}
  }];
}

/** Small static picture of a template for pickers. */
export function LayoutPreview({ id, seats = 12 }: { id: LayoutId; seats?: number }) {
  const def = DEFS[id];
  const uid = svgId(useId());
  const geo = useMemo(() => def.geo(seats), [def, seats]);
  const [vy, vh] = def.crop ? def.crop(geo) : [0, def.h];
  // Drawn only in the browser: server and browser round the trig maths differently,
  // which would make React report a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={themeStyle(id)} className="h-28 rounded-lg" aria-hidden />;
  return (
    <div style={themeStyle(id)} className="overflow-hidden rounded-lg">
      <svg viewBox={`0 ${vy} ${def.w} ${vh}`} className="block h-28 w-full" aria-hidden>
        <def.Decor uid={uid} geo={geo} />
        {geo.chair && <SeatShape shape={def.shape} x={geo.chair.x} y={geo.chair.y} r={geo.r * 1.15} fill="var(--panel)" stroke="var(--gold)" strokeWidth={2} />}
        {geo.seats.map((s, i) => (
          <SeatShape key={i} shape={def.shape} x={s.x} y={s.y} r={geo.r} fill={i === 3 ? "var(--gold)" : "var(--un)"} fillOpacity={0.9} stroke="var(--un)" />
        ))}
      </svg>
    </div>
  );
}
