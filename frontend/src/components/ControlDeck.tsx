import { QUALITY_PROFILES, STATE_VISUALS } from "../animations/stateVisuals";
import { ASSISTANT_STATES } from "../types/assistant";
import type { AnimationQuality, AssistantState, MicStatus, VoiceLanguage } from "../types/assistant";

const QUALITIES: AnimationQuality[] = ["high", "medium", "low"];
const VOICE_LANGUAGES: { value: VoiceLanguage; label: string }[] = [
  { value: "english", label: "English" },
  { value: "sinhala", label: "සිංහල" },
];

interface ControlDeckProps {
  state: AssistantState;
  preview: AssistantState | null;
  mic: MicStatus;
  quality: AnimationQuality;
  voiceLanguage: VoiceLanguage;
  onVoiceLanguage: (language: VoiceLanguage) => void;
  onToggleMic: () => void;
  onPreview: (state: AssistantState | null) => void;
  onQuality: (quality: AnimationQuality) => void;
}

export function ControlDeck({ state, preview, mic, quality, voiceLanguage, onVoiceLanguage, onToggleMic, onPreview, onQuality }: ControlDeckProps) {
  const micActive = mic === "on" || mic === "requesting";

  return (
    <footer className="control-deck">
      <div className="state-readout" role="status" aria-live="polite">
        <span className="state-name">{STATE_VISUALS[state].label}</span>
        <span className="state-caption">
          {preview ? "Preview only" : STATE_VISUALS[state].caption}
        </span>
      </div>

      <div className="deck-row">
        <button
          type="button"
          className={`mic-button ${micActive ? "is-active" : ""}`}
          aria-pressed={micActive}
          aria-label={micActive ? "Turn microphone off" : "Turn microphone on"}
          title={micActive ? "Turn microphone off" : "Turn microphone on"}
          onClick={onToggleMic}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
            {!micActive && <path className="mic-slash" d="M4 4l16 16" />}
          </svg>
        </button>

        <div className="deck-group">
          <span className={`deck-label ${voiceLanguage === "sinhala" ? "deck-label-online" : ""}`}>
            {voiceLanguage === "sinhala" ? "Voice: online, goes to Google" : "Voice: on this computer"}
          </span>
          <div className="segmented">
            {VOICE_LANGUAGES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={voiceLanguage === value ? "is-selected" : ""}
                aria-pressed={voiceLanguage === value}
                onClick={() => onVoiceLanguage(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="deck-group">
          <span className="deck-label">Preview state</span>
          <div className="segmented">
            {ASSISTANT_STATES.map((name) => (
              <button
                key={name}
                type="button"
                className={preview === name ? "is-selected" : ""}
                aria-pressed={preview === name}
                onClick={() => onPreview(preview === name ? null : name)}
              >
                {STATE_VISUALS[name].label}
              </button>
            ))}
          </div>
        </div>

        <div className="deck-group">
          <span className="deck-label">Animation</span>
          <div className="segmented">
            {QUALITIES.map((name) => (
              <button
                key={name}
                type="button"
                className={quality === name ? "is-selected" : ""}
                aria-pressed={quality === name}
                onClick={() => onQuality(name)}
              >
                {QUALITY_PROFILES[name].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
