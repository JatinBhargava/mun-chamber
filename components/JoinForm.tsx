"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveSession } from "@/lib/client";
import { flag } from "@/lib/countries";
import { Button, Input, Label, Select } from "./ui";

/** Accepts a bare code or a pasted invite link (…/room/K7QM2D) and returns the 6-character code. */
function toCode(v: string) {
  const fromLink = v.match(/\/room\/([A-Za-z0-9]{6})/)?.[1];
  return (fromLink ?? v.replace(/[^A-Za-z0-9]/g, "")).toUpperCase().slice(0, 6);
}

interface Peek { name: string; type: string; countries: { name: string; iso?: string }[]; error?: string }

/** `light` is for the white home page: darker status colours and a yellow brick button. */
export default function JoinForm({ initialCode = "", onJoined, light }: { initialCode?: string; onJoined?: () => void; light?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(toCode(initialCode));
  const [peek, setPeek] = useState<Peek | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"delegate" | "observer">("delegate");
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { setPeek(null); return; }
    api<Peek>(`/api/peek/${c}`).then((r) => {
      if (r.error) { setPeek(null); setError(r.error); }
      else { setPeek(r); setError(null); setCountry((x) => (r.countries.some((k) => k.name === x) ? x : "")); }
    });
  }, [code]);

  const join = async () => {
    setBusy(true);
    const c = code.trim().toUpperCase();
    const res = await api<{ memberId: string; token: string }>(`/api/join/${c}`, { name, role, country });
    setBusy(false);
    if (res.error) return setError(res.error);
    saveSession(c, { token: res.token, memberId: res.memberId, name });
    if (onJoined) onJoined();
    else router.push(`/room/${c}`);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Committee code</Label>
        <Input value={code} onChange={(e) => setCode(toCode(e.target.value))} placeholder="e.g. K7QM2D or paste the invite link" className="font-mono tracking-[0.3em] uppercase placeholder:tracking-normal" />
        {peek && <p className={`mt-1 text-xs ${light ? "font-semibold text-emerald-700" : "text-emerald-300"}`}>Found: {peek.name} ({peek.type === "SC" ? "Security Council" : peek.type === "GA" ? "General Assembly" : "Custom"})</p>}
      </div>
      <div>
        <Label>Your name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={40} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["delegate", "observer"] as const).map((r) => (
          <button key={r} onClick={() => setRole(r)} className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${role === r ? "border-un bg-un/15 text-fg" : "border-line text-muted hover:bg-white/5"}`}>
            {r === "observer" ? "Observer / Press" : "Delegate"}
          </button>
        ))}
      </div>
      {role === "delegate" && (
        <div>
          <Label hint={peek ? `${peek.countries.length} available` : undefined}>Country</Label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)} disabled={!peek}>
            <option value="">{peek ? "Choose your country…" : "Enter a code first"}</option>
            {peek?.countries.map((c) => (
              <option key={c.name} value={c.name}>{flag(c.iso)} {c.name}</option>
            ))}
          </Select>
        </div>
      )}
      {error && <p className={`text-sm ${light ? "font-semibold text-red-700" : "text-red-300"}`} role="alert">{error}</p>}
      {light ? (
        <button
          type="button"
          onClick={join}
          disabled={busy || !peek || !name.trim() || (role === "delegate" && !country)}
          className="w-full rounded-[14px] bg-[#ffcf3a] px-6 py-3 text-xl font-extrabold text-[#10213a] transition active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ boxShadow: "0 6px 0 #c99a12", fontFamily: '"Baloo 2", system-ui, sans-serif' }}
        >
          {busy ? "Joining…" : "Enter the chamber"}
        </button>
      ) : (
        <Button variant="primary" className="w-full" disabled={busy || !peek || !name.trim() || (role === "delegate" && !country)} onClick={join}>
          {busy ? "Joining…" : "Enter the chamber"}
        </Button>
      )}
    </div>
  );
}
