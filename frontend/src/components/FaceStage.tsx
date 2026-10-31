import { useEffect, useRef } from "react";
import { FaceScene } from "../animations/FaceScene";
import { watchMinimized } from "../services/desktop";
import type { AnimationQuality, AssistantState } from "../types/assistant";

interface FaceStageProps {
  state: AssistantState;
  quality: AnimationQuality;
  readAudioLevel: () => number;
  onReady: () => void;
  onFailure: (message: string) => void;
  onFrameRate: (framesPerSecond: number) => void;
}

export function FaceStage({ state, quality, readAudioLevel, onReady, onFailure, onFrameRate }: FaceStageProps) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<FaceScene | null>(null);

  // Keep the newest callbacks without rebuilding the 3D scene.
  const callbacks = useRef({ readAudioLevel, onFrameRate, onReady, onFailure });
  callbacks.current = { readAudioLevel, onFrameRate, onReady, onFailure };

  useEffect(() => {
    if (!container.current) return;
    try {
      const created = new FaceScene(container.current, {
        quality,
        readAudioLevel: () => callbacks.current.readAudioLevel(),
        onFirstFrame: () => callbacks.current.onReady(),
        onFrameRate: (framesPerSecond) => callbacks.current.onFrameRate(framesPerSecond),
      });
      scene.current = created;
      const stopWatching = watchMinimized((minimized) => created.setMinimized(minimized));
      return () => {
        stopWatching();
        created.dispose();
        scene.current = null;
      };
    } catch (error) {
      console.error("3D face failed", error);
      callbacks.current.onFailure("3D graphics could not start. Update your Intel graphics driver and restart JARVIS.");
    }
    // Quality changes are handled below, without rebuilding the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);

  useEffect(() => {
    scene.current?.setQuality(quality);
  }, [quality]);

  return <div className="face-stage" ref={container} aria-hidden="true" />;
}
