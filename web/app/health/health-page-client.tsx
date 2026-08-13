"use client";

import { useEffect, useState } from "react";
import { HealthPanel } from "../health-panel";
import { beginLogin, finishLoginIfPresent, hasRemoteApi, isConnected } from "../sync-client";

export function HealthPageClient() {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Connecting…");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const authenticated = hasRemoteApi() ? await finishLoginIfPresent() : false;
        if (cancelled) return;
        setConnected(authenticated || isConnected());
        setMessage(authenticated || isConnected() ? "Connected" : "Connect ManageMe to use your private Health data.");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "ManageMe could not connect.");
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="health-standalone">
      <header className="health-standalone-topbar">
        <a href={process.env.NEXT_PUBLIC_BASE_PATH || "/"}>← ManageMe</a>
        <strong>Health</strong>
        {!connected && ready ? <button onClick={() => void beginLogin()}>Connect</button> : <span>{message}</span>}
      </header>
      <div className="health-standalone-body"><HealthPanel connected={connected} /></div>
    </main>
  );
}
