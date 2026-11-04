// Delegate figure at a desk: chair, desk, microphone, country nameplate, and a toy-block person
// with an anime face in formal clothes (suit and tie, or blazer and blouse).
// Returns an SVG string so the app and the showcase page draw exactly the same thing.
// Local drawing box is about 26 x 32 units, scaled so 10 units = the seat radius.

export interface FigureOpts {
  seed: string; // stable look per country
  country: string; // text on the nameplate
  flag: string; // flag emoji for the nameplate
  speaking?: boolean;
  placard?: boolean; // nameplate lifted up to be recognized
  ballot?: "yes" | "no" | "abstain" | null;
  voting?: boolean; // present and voting: gold lapel pin
  absent?: boolean; // empty seat: chair, desk and nameplate only
  chair?: boolean; // the Chair / President
}

const SUITS = ["#1f2a44", "#2d2f36", "#111827", "#4b5563", "#3b2f2f", "#1e3a5f", "#3f3f46", "#14532d"];
const BLAZERS = ["#7f1d1d", "#0f766e", "#d6c3ad", "#1e3a8a", "#111827", "#9d174d", "#6b21a8", "#374151"];
const TIES = ["#b91c1c", "#1d4ed8", "#ca8a04", "#7c3aed", "#0f766e", "#be185d", "#ea580c", "#475569"];
const BLOUSES = ["#ffffff", "#fde2e4", "#e0f2fe", "#fef3c7", "#ede9fe"];
const HAIR = ["#1f1a24", "#3b2a20", "#5b3a29", "#8b5a2b", "#b4441b", "#e5e7eb", "#7b2cbf", "#c1121f", "#1e3a8a"];
const SKIN = "#ffcf3a";
const EDGE = "#d9a514";
const INK = "#1e1b2e";
const BALLOT: Record<string, [string, string]> = { yes: ["#22c55e", "YES"], no: ["#ef4444", "NO"], abstain: ["#94a3b8", "ABST."] };

const SHORT: Record<string, string> = {
  "United States": "USA", "United Kingdom": "UK", "Russian Federation": "RUSSIA", "Republic of Korea": "KOREA",
  "United Arab Emirates": "UAE", "Saudi Arabia": "SAUDI ARABIA", "South Africa": "S. AFRICA", "New Zealand": "N. ZEALAND",
  "Palestine (Observer)": "PALESTINE", "Viet Nam": "VIET NAM", "Sri Lanka": "SRI LANKA",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function nameplate(x: number, y: number, label: string, flagEmoji: string, chair: boolean): string {
  const text = esc(label);
  const len = Math.min(chair ? 12 : 14.2, Math.max(4, label.length * 2.25));
  const bg = chair ? "#1f1a14" : "#fdfcf7";
  const fg = chair ? "#f0c674" : INK;
  return `<g><rect x="${x - 9.6}" y="${y}" width="19.2" height="6" rx="0.6" fill="${bg}" stroke="${chair ? "#a07b1f" : "#cfcab8"}" stroke-width="0.4"/>`
    + `<rect x="${x - 9.6}" y="${y}" width="19.2" height="1" fill="#000" opacity="0.08"/>`
    + `<text x="${x - 7.4}" y="${y + 4.5}" text-anchor="middle" font-size="3.6">${flagEmoji}</text>`
    + `<text x="${x + 1.6}" y="${y + 4.3}" text-anchor="middle" font-size="3.3" font-weight="800" letter-spacing="0.15" fill="${fg}" font-family="Inter, system-ui, sans-serif" textLength="${len}" lengthAdjust="spacingAndGlyphs">${text}</text></g>`;
}

function hairBack(style: number, female: boolean, c: string): string {
  if (!female) return "";
  if (style === 0) return `<rect x="-7.3" y="-12" width="14.6" height="12.5" rx="3" fill="${c}"/>`; // long
  if (style === 2) return `<circle cx="0" cy="-15.6" r="2.8" fill="${c}"/>`; // bun
  if (style === 3) return `<path d="M 5 -12.5 Q 12.5 -11 10.8 -1.5 Q 9.2 -6 5.8 -8 Z" fill="${c}"/>`; // ponytail
  if (style === 4) return `<path d="M -7.6 2 L -7.6 -8 Q -7.6 -15.6 0 -15.6 Q 7.6 -15.6 7.6 -8 L 7.6 2 Z" fill="${c}"/>`; // headscarf
  return "";
}

function hairFront(style: number, female: boolean, c: string): string {
  if (female) {
    switch (style) {
      case 0: return `<path d="M -6.8 -6 Q -7 -14.6 0 -14.6 Q 7 -14.6 6.8 -6 L 5.6 -9 Q 3 -10.4 0.4 -12.2 Q -2.6 -9.8 -5.6 -9 Z" fill="${c}"/>`;
      case 1: return `<path d="M -7 -2.5 L -7 -9 Q -7 -14.6 0 -14.6 Q 7 -14.6 7 -9 L 7 -2.5 L 5.4 -2.5 L 5.4 -8.6 L 3 -9.6 L 1.4 -8.4 L -0.6 -9.8 L -2.6 -8.4 L -5.4 -9.4 L -5.4 -2.5 Z" fill="${c}"/>`;
      case 2:
      case 3: return `<path d="M -6.6 -7.8 Q -6.6 -14.4 0 -14.4 Q 6.6 -14.4 6.6 -7.8 Q 4 -11 0.6 -11.4 Q -3.4 -11.2 -6.6 -7.8 Z" fill="${c}"/>`;
      default: return `<path d="M -6.6 -1 L -6.6 -8 Q -6.6 -14 0 -14 Q 6.6 -14 6.6 -8 L 6.6 -1 L 5.6 -1 L 5.6 -9 Q 5.6 -12.3 0 -12.3 Q -5.6 -12.3 -5.6 -9 L -5.6 -1 Z" fill="${c}"/>`;
    }
  }
  switch (style) {
    case 0: return `<path d="M -6.6 -6.5 Q -7 -14.6 0 -14.6 Q 7 -14.6 6.6 -6.5 L 6 -9.6 Q 2 -11.8 -1.6 -10.4 Q -4.6 -9.8 -6 -9.6 Z" fill="${c}"/>`; // side parting
    case 1: return `<path d="M -6.8 -6 L -7.6 -12 L -5 -10.5 L -4.4 -15.5 L -1.6 -11.8 L 0.6 -16.4 L 2.4 -12 L 5 -15.2 L 5.4 -10.8 L 7.8 -12.4 L 6.8 -6 L 5.2 -9.2 L 2.6 -8.2 L 0 -9.6 L -2.6 -8.2 L -5.2 -9.2 Z" fill="${c}"/>`; // anime spikes
    case 2: return `<path d="M -6.4 -8.5 Q -6.4 -14.8 0 -14.8 Q 6.4 -14.8 6.4 -8.5 Q 3 -11.6 0 -11.4 Q -3 -11.6 -6.4 -8.5 Z" fill="${c}"/>`; // slicked back
    case 3: return `<path d="M -6.7 -7 Q -7 -15 0 -15 Q 7 -15 6.7 -7 L 5.8 -10 L 3.6 -9.4 L 1.6 -10.6 L -0.6 -9.4 L -2.8 -10.6 L -4.6 -9.4 L -5.8 -10 Z" fill="${c}"/>`; // short fringe
    default: return `<rect x="-2.8" y="-15.2" width="5.6" height="2.6" rx="0.8" fill="${SKIN}" stroke="${EDGE}" stroke-width="0.5"/>`; // no hair: the stud shows
  }
}

export function figureSvg(x: number, y: number, r: number, o: FigureOpts): string {
  const t = `translate(${x} ${y + r * 0.2}) scale(${r / 10})`;
  const h = hashSeed(o.seed);
  const female = !o.chair && ((h >>> 11) & 1) === 1;
  const style = h % 5;
  const hair = HAIR[(h >>> 3) % HAIR.length];
  const jacket = o.chair ? "#14110f" : female ? BLAZERS[(h >>> 7) % BLAZERS.length] : SUITS[(h >>> 7) % SUITS.length];
  const tie = o.chair ? "#d4a937" : TIES[(h >>> 13) % TIES.length];
  const blouse = BLOUSES[(h >>> 17) % BLOUSES.length];
  const glasses = !female && ((h >>> 21) & 3) === 0;
  const lifted = !o.absent && (o.placard || !!o.ballot);
  const label = o.chair ? "CHAIR" : SHORT[o.country] ?? o.country.toUpperCase();

  let g = `<g transform="${t}">`;
  // floor shadow and chair back
  g += `<ellipse cx="0" cy="12.4" rx="12.5" ry="1.8" fill="#000" opacity="0.3"/>`;
  g += `<rect x="-8.6" y="-9" width="17.2" height="17" rx="4.2" fill="color-mix(in srgb, var(--un) 22%, #17171f)" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>`;
  g += `<rect x="-6.8" y="-7.4" width="13.6" height="3" rx="1.5" fill="#fff" opacity="0.05"/>`;

  if (!o.absent) {
    g += hairBack(style, female, hair);
    // neck and jacket
    g += `<rect x="-2" y="-1.6" width="4" height="2.2" fill="${SKIN}"/>`;
    g += female
      ? `<path d="M -5 0 L 5 0 L 7.2 11 L -7.2 11 Z" fill="${jacket}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>`
      : `<path d="M -5.8 0 L 5.8 0 L 7.8 11 L -7.8 11 Z" fill="${jacket}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>`;
    if (female) {
      g += `<path d="M -2.7 0 Q 0 4.6 2.7 0 Z" fill="${blouse}"/>`;
      g += `<path d="M -2.7 0 L -0.7 4.8 L -2.3 5.2 L -4.4 1.1 Z M 2.7 0 L 0.7 4.8 L 2.3 5.2 L 4.4 1.1 Z" fill="${jacket}" stroke="rgba(0,0,0,0.35)" stroke-width="0.35"/>`;
      g += `<path d="M -2 0.7 Q 0 3.4 2 0.7" fill="none" stroke="#fffaf0" stroke-width="0.75" stroke-dasharray="0.15 0.75" stroke-linecap="round"/>`;
    } else {
      g += `<path d="M -2.5 0 L 0 5.4 L 2.5 0 Z" fill="#f8fafc"/>`;
      g += `<path d="M -0.75 0.5 L 0.75 0.5 L 1.05 4.7 L 0 5.9 L -1.05 4.7 Z" fill="${tie}"/>`;
      g += `<path d="M -2.5 0 L 0 5.4 L -1.9 5.8 L -4.2 1.1 Z M 2.5 0 L 0 5.4 L 1.9 5.8 L 4.2 1.1 Z" fill="${jacket}" stroke="rgba(255,255,255,0.12)" stroke-width="0.35"/>`;
      g += `<path d="M 3 3 L 4.6 3 L 4.2 3.9 Z" fill="#fff" opacity="0.9"/>`;
    }
    if (o.voting || o.chair) g += `<circle cx="-3.4" cy="3" r="0.75" fill="var(--gold)" stroke="#a07b1f" stroke-width="0.2"/>`;
    // left arm to the desk
    g += `<path d="M -5.2 1.4 L -9.2 4.6" stroke="${jacket}" stroke-width="3.2" stroke-linecap="round"/>`;
    // right arm: on the desk, or raised with the nameplate / vote card
    if (lifted) g += `<path d="M 5.2 1.4 L 9 -7.2" stroke="${jacket}" stroke-width="3.2" stroke-linecap="round"/>`;
    else g += `<path d="M 5.2 1.4 L 9.2 4.6" stroke="${jacket}" stroke-width="3.2" stroke-linecap="round"/>`;
  }

  // desk
  g += `<rect x="-12.6" y="4.2" width="25.2" height="1.8" rx="0.6" fill="color-mix(in srgb, #8a6239 75%, var(--panel))"/>`;
  g += `<rect x="-12" y="5.8" width="24" height="6.2" rx="0.6" fill="color-mix(in srgb, #5b3d22 80%, var(--panel))"/>`;
  g += `<line x1="-12" y1="8.9" x2="12" y2="8.9" stroke="#000" stroke-opacity="0.15" stroke-width="0.4"/>`;
  // microphone, red light while speaking
  g += `<ellipse cx="9.6" cy="4.6" rx="1.7" ry="0.6" fill="#1f1f24"/><path d="M 9.6 4.4 Q 10.4 0.6 7.6 -0.6" fill="none" stroke="#3a3a42" stroke-width="0.6"/><ellipse cx="7.3" cy="-0.8" rx="1" ry="0.65" fill="#55555f"/>`;
  g += `<circle cx="9.6" cy="4.3" r="0.5" fill="${o.speaking ? "#ef4444" : "#3f3f46"}">${o.speaking ? `<animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite"/>` : ""}</circle>`;
  if (o.chair) g += `<rect x="-11.6" y="2.6" width="4.6" height="1.8" rx="0.5" fill="#7a4a22"/><line x1="-9.3" y1="3.4" x2="-5.8" y2="1.6" stroke="#7a4a22" stroke-width="0.8" stroke-linecap="round"/>`;

  if (!o.absent) {
    // hands resting on the desk
    g += `<circle cx="-9.6" cy="4.8" r="1.6" fill="${SKIN}" stroke="${EDGE}" stroke-width="0.4"/>`;
    if (!lifted) g += `<circle cx="9.6" cy="4.8" r="1.6" fill="${SKIN}" stroke="${EDGE}" stroke-width="0.4"/>`;
  }
  // nameplate on the desk (unless it's lifted up)
  if (!(lifted && o.placard)) g += `<g opacity="${o.absent ? 0.75 : 1}">${nameplate(0, 6.2, label, o.flag, !!o.chair)}</g>`;

  if (!o.absent) {
    // head
    g += `<rect x="-6" y="-13" width="12" height="12" rx="3.6" fill="${SKIN}" stroke="${EDGE}" stroke-width="0.6"/>`;
    g += hairFront(style, female, hair);
    if (female) g += `<circle cx="-6.2" cy="-4.4" r="0.55" fill="#f0c674"/><circle cx="6.2" cy="-4.4" r="0.55" fill="#f0c674"/>`;
    // anime face
    g += `<path d="M -4 -9.4 Q -2.7 -10.1 -1.5 -9.5 M 4 -9.4 Q 2.7 -10.1 1.5 -9.5" stroke="${INK}" stroke-width="0.5" fill="none" stroke-linecap="round"/>`;
    g += `<ellipse cx="-2.7" cy="-6.9" rx="1.35" ry="1.9" fill="${INK}"/><ellipse cx="2.7" cy="-6.9" rx="1.35" ry="1.9" fill="${INK}"/>`;
    g += `<circle cx="-2.25" cy="-7.6" r="0.58" fill="#fff"/><circle cx="3.15" cy="-7.6" r="0.58" fill="#fff"/><circle cx="-3.05" cy="-6.2" r="0.26" fill="#fff"/><circle cx="2.35" cy="-6.2" r="0.26" fill="#fff"/>`;
    if (female) g += `<path d="M -4.1 -8.3 L -4.9 -9 M 4.1 -8.3 L 4.9 -9" stroke="${INK}" stroke-width="0.45" stroke-linecap="round"/>`;
    if (glasses) g += `<g fill="none" stroke="${INK}" stroke-width="0.45"><rect x="-4.5" y="-8.9" width="3.6" height="3.6" rx="1"/><rect x="0.9" y="-8.9" width="3.6" height="3.6" rx="1"/><line x1="-0.9" y1="-7.4" x2="0.9" y2="-7.4"/></g>`;
    g += `<ellipse cx="-4.3" cy="-4.4" rx="1.1" ry="0.55" fill="#ff6b8b" opacity="0.5"/><ellipse cx="4.3" cy="-4.4" rx="1.1" ry="0.55" fill="#ff6b8b" opacity="0.5"/>`;
    g += o.speaking
      ? `<ellipse cx="0" cy="-3.1" rx="1" ry="0.8" fill="#7a1f2b"><animate attributeName="ry" values="0.25;1.1;0.5;1;0.25" dur="0.6s" repeatCount="indefinite"/></ellipse>`
      : `<path d="M -1.2 -3.5 Q 0 -2.6 1.2 -3.5" stroke="${female ? "#c0264f" : INK}" stroke-width="0.6" fill="none" stroke-linecap="round"/>`;

    // raised hand holding the nameplate or a vote card
    if (lifted) {
      g += `<circle cx="9.2" cy="-8.2" r="1.6" fill="${SKIN}" stroke="${EDGE}" stroke-width="0.4"/>`;
      if (o.ballot) {
        const [col, txt] = BALLOT[o.ballot];
        g += `<rect x="5" y="-17.6" width="9" height="7" rx="1" fill="${col}" stroke="rgba(0,0,0,0.25)" stroke-width="0.4"/><text x="9.5" y="-12.9" text-anchor="middle" font-size="2.9" font-weight="800" fill="#fff" font-family="Inter, system-ui, sans-serif">${txt}</text>`;
      } else {
        g += `<line x1="9.2" y1="-8.6" x2="9.2" y2="-13.4" stroke="#9a7b55" stroke-width="0.8"/>`;
        g += nameplate(9.2, -19.6, label, o.flag, !!o.chair);
      }
    }
    // speech bubble
    if (o.speaking) {
      g += `<path d="M -13.5 -21 h 9 a 2.6 2.6 0 0 1 2.6 2.6 v 0.6 a 2.6 2.6 0 0 1 -2.6 2.6 h -4.6 l -2.2 2.2 v -2.2 h -2.2 a 2.6 2.6 0 0 1 -2.6 -2.6 v -0.6 a 2.6 2.6 0 0 1 2.6 -2.6 Z" fill="#fff"/>`;
      [-11.4, -9, -6.6].forEach((cx, i) => {
        g += `<circle cx="${cx}" cy="-17.7" r="0.8" fill="${INK}"><animate attributeName="opacity" values="0.2;1;0.2" dur="1s" begin="${i * 0.2}s" repeatCount="indefinite"/></circle>`;
      });
    }
  }
  return g + `</g>`;
}
