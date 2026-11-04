export interface Country {
  name: string;
  iso?: string;
}

export const P5 = ["China", "France", "Russian Federation", "United Kingdom", "United States"];

// Security Council composition for 2026 (5 permanent + 10 elected).
export const UNSC: Country[] = [
  { name: "China", iso: "CN" },
  { name: "France", iso: "FR" },
  { name: "Russian Federation", iso: "RU" },
  { name: "United Kingdom", iso: "GB" },
  { name: "United States", iso: "US" },
  { name: "Bahrain", iso: "BH" },
  { name: "Colombia", iso: "CO" },
  { name: "DR Congo", iso: "CD" },
  { name: "Denmark", iso: "DK" },
  { name: "Greece", iso: "GR" },
  { name: "Latvia", iso: "LV" },
  { name: "Liberia", iso: "LR" },
  { name: "Pakistan", iso: "PK" },
  { name: "Panama", iso: "PA" },
  { name: "Somalia", iso: "SO" },
];

export const UNGA: Country[] = [
  { name: "Afghanistan", iso: "AF" },
  { name: "Argentina", iso: "AR" },
  { name: "Australia", iso: "AU" },
  { name: "Bangladesh", iso: "BD" },
  { name: "Brazil", iso: "BR" },
  { name: "Canada", iso: "CA" },
  { name: "Chile", iso: "CL" },
  { name: "China", iso: "CN" },
  { name: "Cuba", iso: "CU" },
  { name: "Egypt", iso: "EG" },
  { name: "Ethiopia", iso: "ET" },
  { name: "France", iso: "FR" },
  { name: "Germany", iso: "DE" },
  { name: "Ghana", iso: "GH" },
  { name: "India", iso: "IN" },
  { name: "Indonesia", iso: "ID" },
  { name: "Iran", iso: "IR" },
  { name: "Iraq", iso: "IQ" },
  { name: "Israel", iso: "IL" },
  { name: "Italy", iso: "IT" },
  { name: "Japan", iso: "JP" },
  { name: "Kenya", iso: "KE" },
  { name: "Malaysia", iso: "MY" },
  { name: "Mexico", iso: "MX" },
  { name: "Nepal", iso: "NP" },
  { name: "Netherlands", iso: "NL" },
  { name: "New Zealand", iso: "NZ" },
  { name: "Nigeria", iso: "NG" },
  { name: "Norway", iso: "NO" },
  { name: "Pakistan", iso: "PK" },
  { name: "Palestine (Observer)", iso: "PS" },
  { name: "Philippines", iso: "PH" },
  { name: "Qatar", iso: "QA" },
  { name: "Republic of Korea", iso: "KR" },
  { name: "Russian Federation", iso: "RU" },
  { name: "Saudi Arabia", iso: "SA" },
  { name: "Singapore", iso: "SG" },
  { name: "South Africa", iso: "ZA" },
  { name: "Spain", iso: "ES" },
  { name: "Sri Lanka", iso: "LK" },
  { name: "Sweden", iso: "SE" },
  { name: "Switzerland", iso: "CH" },
  { name: "Türkiye", iso: "TR" },
  { name: "Ukraine", iso: "UA" },
  { name: "United Arab Emirates", iso: "AE" },
  { name: "United Kingdom", iso: "GB" },
  { name: "United States", iso: "US" },
  { name: "Venezuela", iso: "VE" },
  { name: "Viet Nam", iso: "VN" },
];

export function flag(iso?: string): string {
  if (!iso || iso.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65));
}
