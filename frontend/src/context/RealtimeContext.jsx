import { createContext, useContext, useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const RealtimeCtx = createContext({ subscribe: () => () => {}, connected: false });

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const subscribers = useRef(new Set());
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer.current = setTimeout(open, 3000);
        }
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          subscribers.current.forEach((cb) => cb(msg));
        } catch {}
      };
    };

    open();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try { wsRef.current?.close(); } catch {}
    };
  }, [user]);

  const subscribe = (cb) => {
    subscribers.current.add(cb);
    return () => subscribers.current.delete(cb);
  };

  return (
    <RealtimeCtx.Provider value={{ subscribe, connected }}>
      {children}
    </RealtimeCtx.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeCtx);
}
