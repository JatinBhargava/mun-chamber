"use client";

// Live audio, no video. The person holding the floor (and the Chair when their mic is on)
// sends their microphone directly to every other browser in the room over WebRTC.
// The server only relays the connection setup and refuses offers from anyone who doesn't have the floor.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, sendAction } from "@/lib/client";

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Signal =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "candidate"; dir: "pub" | "sub"; candidate: RTCIceCandidateInit }
  | { type: "bye" };

interface PeerConn {
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
}

export function useVoice(meId: string | undefined, publishers: string[], peers: string[]) {
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [live, setLive] = useState(false);
  const [listeningTo, setListeningTo] = useState<string[]>([]);

  const pub = useRef(new Map<string, PeerConn>()); // my outgoing calls, by listener id
  const sub = useRef(new Map<string, PeerConn>()); // incoming calls, by publisher id
  const audio = useRef(new Map<string, HTMLAudioElement>());
  const stream = useRef<Promise<MediaStream> | null>(null);
  const publishersRef = useRef(publishers);
  publishersRef.current = publishers;

  const amPublisher = !!meId && publishers.includes(meId);
  const send = (to: string, data: Signal) => getSocket().emit("rtc", { to, data });

  const flush = async (p: PeerConn) => {
    for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  };

  const closeSub = useCallback((id: string) => {
    sub.current.get(id)?.pc.close();
    sub.current.delete(id);
    const el = audio.current.get(id);
    if (el) { el.srcObject = null; el.remove(); }
    audio.current.delete(id);
    setListeningTo([...sub.current.keys()]);
  }, []);

  // ---- incoming signalling ----
  useEffect(() => {
    if (!meId) return;
    const s = getSocket();
    const onRtc = async ({ from, data }: { from: string; data: Signal }) => {
      if (data.type === "offer") {
        if (!publishersRef.current.includes(from)) return;
        closeSub(from);
        const pc = new RTCPeerConnection(ICE);
        const conn: PeerConn = { pc, pending: [] };
        sub.current.set(from, conn);
        pc.onicecandidate = (e) => e.candidate && send(from, { type: "candidate", dir: "sub", candidate: e.candidate.toJSON() });
        pc.ontrack = (e) => {
          let el = audio.current.get(from);
          if (!el) {
            el = document.createElement("audio");
            el.autoplay = true;
            document.body.appendChild(el);
            audio.current.set(from, el);
          }
          el.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
        };
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        await flush(conn);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send(from, { type: "answer", sdp: answer.sdp ?? "" });
        setListeningTo([...sub.current.keys()]);
      } else if (data.type === "answer") {
        const conn = pub.current.get(from);
        if (!conn) return;
        await conn.pc.setRemoteDescription({ type: "answer", sdp: data.sdp }).catch(() => {});
        await flush(conn);
      } else if (data.type === "candidate") {
        const conn = data.dir === "pub" ? sub.current.get(from) : pub.current.get(from);
        if (!conn) return;
        if (conn.pc.remoteDescription) await conn.pc.addIceCandidate(data.candidate).catch(() => {});
        else conn.pending.push(data.candidate);
      } else if (data.type === "bye") {
        closeSub(from);
      }
    };
    s.on("rtc", onRtc);
    return () => { s.off("rtc", onRtc); };
  }, [meId, closeSub]);

  // Hang up on anyone who no longer has the floor.
  useEffect(() => {
    for (const id of [...sub.current.keys()]) if (!publishers.includes(id)) closeSub(id);
  }, [publishers, closeSub]);

  // ---- publishing my mic while I hold the floor ----
  const peersKey = peers.slice().sort().join(",");
  useEffect(() => {
    if (!amPublisher || !meId) return;
    let cancelled = false;
    if (!stream.current) {
      stream.current = navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
        .then((s) => { setMicError(null); setLive(true); return s; });
      stream.current.catch((e: Error) => {
        setMicError(e?.name === "NotAllowedError" ? "Microphone permission was denied. You can still give a written speech." : "No microphone available. You can still give a written speech.");
        stream.current = null;
      });
    }
    const wanted = new Set(peersKey ? peersKey.split(",") : []);
    stream.current?.then(async (ms) => {
      if (cancelled) return;
      for (const [id, conn] of pub.current) {
        if (!wanted.has(id)) { conn.pc.close(); pub.current.delete(id); }
      }
      for (const id of wanted) {
        if (pub.current.has(id)) continue;
        const pc = new RTCPeerConnection(ICE);
        const conn: PeerConn = { pc, pending: [] };
        pub.current.set(id, conn);
        ms.getTracks().forEach((t) => pc.addTrack(t, ms));
        pc.onicecandidate = (e) => e.candidate && send(id, { type: "candidate", dir: "pub", candidate: e.candidate.toJSON() });
        const offer = await pc.createOffer({ offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        send(id, { type: "offer", sdp: offer.sdp ?? "" });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [amPublisher, meId, peersKey]);

  // Stop my mic the moment I lose the floor.
  useEffect(() => {
    if (amPublisher) return;
    for (const [id, conn] of pub.current) { conn.pc.close(); send(id, { type: "bye" }); }
    pub.current.clear();
    stream.current?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    stream.current = null;
    setLive(false);
    setMuted(false);
  }, [amPublisher]);

  // Clean up everything when leaving the room.
  useEffect(() => () => {
    for (const conn of pub.current.values()) conn.pc.close();
    for (const id of [...sub.current.keys()]) closeSub(id);
    stream.current?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
  }, [closeSub]);

  const toggleMute = useCallback(() => {
    stream.current?.then((s) => {
      const next = !muted;
      s.getAudioTracks().forEach((t) => (t.enabled = !next));
      setMuted(next);
    });
  }, [muted]);

  const unblockAudio = useCallback(() => {
    for (const el of audio.current.values()) el.play().catch(() => {});
    setAudioBlocked(false);
  }, []);

  return { amPublisher, live, muted, micError, audioBlocked, listeningTo, toggleMute, unblockAudio };
}

// Optional live captions of the speaker, using the browser's own speech recognition (Chrome, Edge, Safari).
type SR = { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void; onend: () => void; start: () => void; stop: () => void };

export function transcriptionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function useTranscript(active: boolean) {
  useEffect(() => {
    if (!active || !transcriptionSupported()) return;
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    let stopped = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0].transcript.trim()) sendAction({ type: "transcript", text: r[0].transcript.trim() });
      }
    };
    rec.onend = () => { if (!stopped) try { rec.start(); } catch {} };
    try { rec.start(); } catch {}
    return () => { stopped = true; try { rec.stop(); } catch {} };
  }, [active]);
}
