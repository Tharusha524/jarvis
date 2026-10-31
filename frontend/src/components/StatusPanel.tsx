import type { AiConnection } from "../hooks/useAiStatus";
import { micLabel } from "../services/assistantState";
import type { ConnectionStatus, MicStatus } from "../types/assistant";
import { Panel } from "./Panel";

type Tone = "good" | "warn" | "bad" | "muted";

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <span className={`status-value tone-${tone}`}>
        <i className="status-dot" />
        {value}
      </span>
    </div>
  );
}

function micTone(mic: MicStatus): Tone {
  if (mic === "on") return "good";
  if (mic === "off") return "muted";
  return mic === "requesting" ? "warn" : "bad";
}

function aiRow({ status, backendOnline, checked }: AiConnection): { value: string; tone: Tone } {
  if (!checked) return { value: "Checking", tone: "muted" };
  if (!backendOnline || !status) return { value: "Backend offline", tone: "bad" };
  if (!status.ollamaFound) return { value: "Ollama not installed", tone: "bad" };
  if (!status.ollamaRunning) return { value: "Ollama starting", tone: "warn" };
  if (!status.modelInstalled) return { value: "Model not installed", tone: "warn" };
  return { value: status.activeModel, tone: "good" };
}

function internetRow(internet: ConnectionStatus): { value: string; tone: Tone } {
  if (internet === "online") return { value: "Online", tone: "good" };
  if (internet === "offline") return { value: "Offline", tone: "warn" };
  return { value: "Checking", tone: "muted" };
}

interface StatusPanelProps {
  mic: MicStatus;
  ai: AiConnection;
  internet: ConnectionStatus;
  chatBusy: boolean;
  onChooseModel: (name: string) => void;
}

export function StatusPanel({ mic, ai, internet, chatBusy, onChooseModel }: StatusPanelProps) {
  const models = ai.status?.models ?? [];

  return (
    <Panel title="Status">
      <StatusRow label="Microphone" value={micLabel(mic)} tone={micTone(mic)} />
      <StatusRow label="AI model" {...aiRow(ai)} />
      <StatusRow label="Internet" {...internetRow(internet)} />
      {models.length > 0 && (
        <label className="model-picker">
          <span>Model</span>
          <select
            value={ai.status?.modelInstalled ? ai.status.activeModel : ""}
            disabled={chatBusy}
            onChange={(event) => onChooseModel(event.target.value)}
          >
            {!ai.status?.modelInstalled && <option value="">Choose a model</option>}
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      )}
    </Panel>
  );
}
