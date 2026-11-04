"use client";

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "gold" | "ghost" | "danger" | "outline";
// Solid buttons get a darker "brick edge" underneath, made from their own colour.
const EDGE: Partial<Record<Variant, string>> = {
  primary: "0 4px 0 color-mix(in srgb, var(--un) 62%, black)",
  gold: "0 4px 0 color-mix(in srgb, var(--gold) 62%, black)",
  outline: "0 3px 0 var(--line)",
};
export function Button({ variant = "outline", size = "md", className, style, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const v: Record<Variant, string> = {
    primary: "bg-un text-white hover:brightness-110 border-transparent",
    gold: "bg-gold text-ink hover:brightness-110 border-transparent",
    ghost: "border-transparent hover:bg-black/5 text-fg",
    danger: "bg-red-500/15 text-red-700 border-red-500/30 hover:bg-red-500/25",
    outline: "border-line bg-panel text-fg hover:bg-black/5",
  };
  return (
    <button
      {...p}
      style={{ boxShadow: EDGE[variant], ...style }}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border font-bold transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm",
        v[variant],
        className,
      )}
    />
  );
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-panel", className)} style={{ boxShadow: "0 5px 0 var(--line)" }}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h3 className="text-lg font-extrabold leading-tight" style={{ fontFamily: "var(--display)" }}>{title}</h3>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "un" | "gold" | "green" | "red" }) {
  const t = {
    default: "bg-black/5 text-muted border-line",
    un: "bg-un/15 text-un border-un/30",
    gold: "bg-gold/15 text-gold border-gold/30",
    green: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    red: "bg-red-500/15 text-red-700 border-red-500/30",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

const field = "w-full rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-un focus:outline-none";
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, "resize-y", className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, className)} />;

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted">
      {children} {hint && <span className="font-normal text-muted/60">{hint}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl" style={{ boxShadow: "0 8px 0 var(--line), 0 30px 60px -20px rgba(0,0,0,0.4)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold" style={{ fontFamily: "var(--display)" }}>{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-center text-sm text-muted/70">{children}</p>;
}

export { cx };
