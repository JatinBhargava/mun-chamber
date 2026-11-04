"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, loadSession, sendAction, clearSession } from "@/lib/client";
import type { Action, CommitteeView } from "@/lib/types";

export type Status = "connecting" | "joined" | "need-join" | "kicked" | "error";

export function useCommittee(code: string) {
  const [state, setState] = useState<CommitteeView | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const offset = useRef(0); // server clock minus local clock, for accurate timers

  const rejoin = useCallback(async () => {
    const session = loadSession(code);
    if (!session) return setStatus("need-join");
    const res = await getSocket().request<{ memberId: string }>("join", { token: session.token, name: session.name });
    if (res.error) {
      setError(res.error);
      if (res.error.startsWith("No committee")) { setStatus("error"); getSocket().close(); }
      else if (!res.error.startsWith("Reconnecting") && !res.error.startsWith("The server")) setStatus("need-join");
    } else setStatus("joined");
  }, [code]);

  useEffect(() => {
    const s = getSocket();
    const onState = (v: CommitteeView) => {
      offset.current = v.serverNow - Date.now();
      setState(v);
    };
    const onKicked = () => { clearSession(code); setStatus("kicked"); setState(null); };
    s.on("state", onState);
    s.on("kicked", onKicked);
    s.on("connect", rejoin); // also fires again after a dropped connection
    s.connect(code);
    if (s.connected) rejoin();
    return () => { s.off("state", onState); s.off("kicked", onKicked); s.off("connect", rejoin); s.close(); };
  }, [code, rejoin]);

  const send = useCallback(async (a: Action) => {
    const res = await sendAction(a);
    if (res.error) {
      setToast(res.error);
      setTimeout(() => setToast((t) => (t === res.error ? null : t)), 4000);
    }
    return res;
  }, []);

  const now = useCallback(() => Date.now() + offset.current, []);

  return { state, status, error, toast, setToast, send, now, rejoin };
}

/** Re-render every `ms` so countdowns move. */
export function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
