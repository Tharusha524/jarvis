import { useCallback, useEffect, useState } from "react";
import { getAiStatus } from "../services/backend";
import type { AiStatus } from "../types/assistant";

const POLL_MS = 5000;
// The backend takes a few seconds to start, so look again sooner while it is off.
const OFFLINE_POLL_MS = 1000;

export interface AiConnection {
  /** Null until the backend first answers, or when it is offline. */
  status: AiStatus | null;
  backendOnline: boolean;
  /** True once the first check has finished. */
  checked: boolean;
  refresh: () => Promise<void>;
}

export function useAiStatus(): AiConnection {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAiStatus());
      setBackendOnline(true);
    } catch {
      setStatus(null);
      setBackendOnline(false);
    }
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked) void refresh();
    const timer = window.setInterval(() => void refresh(), backendOnline ? POLL_MS : OFFLINE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, backendOnline]);

  return { status, backendOnline, checked, refresh };
}
