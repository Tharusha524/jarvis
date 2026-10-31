import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { STATE_VISUALS } from "./animations/stateVisuals";
import { AlertBanner } from "./components/AlertBanner";
import { ClockPanel } from "./components/ClockPanel";
import { ControlDeck } from "./components/ControlDeck";
import { ConversationPanel } from "./components/ConversationPanel";
import { FaceStage } from "./components/FaceStage";
import { LoadingScreen } from "./components/LoadingScreen";
import { StatusPanel } from "./components/StatusPanel";
import { SystemPanel } from "./components/SystemPanel";
import { TitleBar } from "./components/TitleBar";
import { useAiStatus } from "./hooks/useAiStatus";
import { useChat } from "./hooks/useChat";
import { useMicrophone } from "./hooks/useMicrophone";
import { useQuality, useVoiceLanguage } from "./hooks/useQuality";
import { useSpeaker } from "./hooks/useSpeaker";
import { useVoice } from "./hooks/useVoice";
import { useSystemStatus } from "./hooks/useSystemStatus";
import { chatBlockedReason, deriveAssistantState, sampleSpeechLevel } from "./services/assistantState";
import { chooseModel } from "./services/backend";
import type { AssistantState } from "./types/assistant";

/** Long enough for the loading animation to read, short enough not to annoy. */
const MIN_LOADING_MS = 1400;
const LOADING_FADE_MS = 600;

const MIC_ERRORS = {
  denied: "Windows blocked the microphone. Allow it in Settings > Privacy > Microphone, then try again.",
  unavailable: "No working microphone was found. Connect one, then try again.",
};

export default function App() {
  const [preview, setPreview] = useState<AssistantState | null>(null);
  const [quality, setQuality] = useQuality();
  const [voiceLanguage, setVoiceLanguage] = useVoiceLanguage();
  const [frameRate, setFrameRate] = useState<number | null>(null);
  const [graphicsReady, setGraphicsReady] = useState(false);
  const [graphicsError, setGraphicsError] = useState<string | null>(null);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [loadingGone, setLoadingGone] = useState(false);

  const mic = useMicrophone();
  const system = useSystemStatus();
  const ai = useAiStatus();
  const [modelError, setModelError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const speaker = useSpeaker(setVoiceError);
  // Replies are spoken while the microphone is on. Typed chat stays silent.
  const micOn = mic.status === "on";
  const chat = useChat(micOn ? speaker.say : undefined);
  const voice = useVoice(mic, chat, speaker, chatBlockedReason(ai) === null, voiceLanguage);
  const voiceProblem = voice.problem ?? voiceError;
  const state = deriveAssistantState(graphicsError && !preview ? "error" : preview, mic.status, {
    busy: chat.busy || voice.transcribing,
    failed: Boolean(chat.error || voiceProblem),
    speaking: speaker.speaking,
  });
  const visual = STATE_VISUALS[state];

  const readAudioLevel = useCallback(() => {
    if (state === "speaking" && preview) return sampleSpeechLevel(performance.now() / 1000);
    if (speaker.speaking) return speaker.readLevel();
    return mic.readLevel();
  }, [state, preview, mic.readLevel, speaker.speaking, speaker.readLevel]);

  const dismissVoiceProblem = useCallback(() => {
    voice.dismissProblem();
    setVoiceError(null);
  }, [voice.dismissProblem]);

  const toggleMic = useCallback(() => {
    if (mic.status === "on" || mic.status === "requesting") {
      mic.stop();
      speaker.stop();
    } else {
      void mic.start();
    }
  }, [mic.status, mic.start, mic.stop, speaker.stop]);

  const handleChooseModel = useCallback(
    (name: string) => {
      if (!name) return;
      setModelError(null);
      chooseModel(name)
        .then(ai.refresh)
        .catch((problem: unknown) => setModelError(problem instanceof Error ? problem.message : "Could not switch models."));
    },
    [ai.refresh],
  );

  const handleGraphicsFailure = useCallback((message: string) => {
    setGraphicsError(message);
    setGraphicsReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumTimePassed(true), MIN_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const loaded = graphicsReady && system.loaded && ai.checked && minimumTimePassed;

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => setLoadingGone(true), LOADING_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  const themeStyle = useMemo(
    () => ({ "--state-color": visual.primary, "--state-accent": visual.accent }) as CSSProperties,
    [visual],
  );

  const micProblem = mic.status === "denied" || mic.status === "unavailable";

  return (
    <div className={`app state-${state}`} style={themeStyle}>
      <div className="backdrop" />
      <FaceStage
        state={state}
        quality={quality}
        readAudioLevel={readAudioLevel}
        onReady={() => setGraphicsReady(true)}
        onFailure={handleGraphicsFailure}
        onFrameRate={setFrameRate}
      />

      <TitleBar />

      <main className="hud">
        <div className="hud-left">
          <ClockPanel />
          <SystemPanel snapshot={system.snapshot} loaded={system.loaded} frameRate={frameRate} />
        </div>
        <div className="hud-right">
          <StatusPanel
            mic={mic.status}
            ai={ai}
            internet={system.internet}
            chatBusy={chat.busy}
            onChooseModel={handleChooseModel}
          />
          <ConversationPanel chat={chat} blockedReason={chatBlockedReason(ai)} />
        </div>
      </main>

      <div className="alerts">
        {graphicsError && <AlertBanner tone="error" title="Graphics problem" message={graphicsError} />}
        {micProblem && !preview && (
          <AlertBanner
            tone="error"
            title="Microphone problem"
            message={MIC_ERRORS[mic.status as keyof typeof MIC_ERRORS]}
            actionLabel="Dismiss"
            onAction={mic.stop}
          />
        )}
        {chat.error && (
          <AlertBanner tone="error" title="AI problem" message={chat.error} actionLabel="Dismiss" onAction={chat.dismissError} />
        )}
        {voiceProblem && (
          <AlertBanner tone="error" title="Voice problem" message={voiceProblem} actionLabel="Dismiss" onAction={dismissVoiceProblem} />
        )}
        {modelError && (
          <AlertBanner tone="error" title="Model problem" message={modelError} actionLabel="Dismiss" onAction={() => setModelError(null)} />
        )}
        {preview === "executing" && (
          <AlertBanner tone="task" title="Preview: Executing" message="This shows how a running task will look. No task is running." />
        )}
        {preview === "error" && (
          <AlertBanner tone="error" title="Preview: Error" message="This shows how a problem will look. Nothing is wrong." />
        )}
      </div>

      <ControlDeck
        state={state}
        preview={preview}
        mic={mic.status}
        quality={quality}
        voiceLanguage={voiceLanguage}
        onVoiceLanguage={setVoiceLanguage}
        onToggleMic={toggleMic}
        onPreview={setPreview}
        onQuality={setQuality}
      />

      {!loadingGone && (
        <LoadingScreen graphicsReady={graphicsReady} statusReady={system.loaded && ai.checked} leaving={loaded} />
      )}
    </div>
  );
}
