import { useEffect, useState } from "react";
import { checkInternet, getSystemSnapshot, isDesktopApp } from "../services/desktop";
import type { ConnectionStatus, SystemSnapshot } from "../types/assistant";

const SYSTEM_POLL_MS = 3000;
const NETWORK_POLL_MS = 15000;

export interface SystemStatus {
  snapshot: SystemSnapshot | null;
  internet: ConnectionStatus;
  /** True once the first round of checks has finished. */
  loaded: boolean;
}

export function useSystemStatus(): SystemStatus {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [internet, setInternet] = useState<ConnectionStatus>("unknown");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isDesktopApp) {
      // A browser can only report whether the network adapter is connected.
      const update = () => setInternet(navigator.onLine ? "online" : "offline");
      update();
      setLoaded(true);
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }

    let active = true;

    const pollSystem = async () => {
      try {
        const next = await getSystemSnapshot();
        if (active) setSnapshot(next);
      } catch (error) {
        console.error("System information failed", error);
      }
    };

    const pollNetwork = async () => {
      const online = await checkInternet().catch(() => false);
      if (active) setInternet(online ? "online" : "offline");
    };

    void Promise.all([pollSystem(), pollNetwork()]).then(() => {
      if (active) setLoaded(true);
    });
    const systemTimer = window.setInterval(() => void pollSystem(), SYSTEM_POLL_MS);
    const networkTimer = window.setInterval(() => void pollNetwork(), NETWORK_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(systemTimer);
      window.clearInterval(networkTimer);
    };
  }, []);

  return { snapshot, internet, loaded };
}
