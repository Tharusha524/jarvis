import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { Chat } from "../hooks/useChat";
import { Panel } from "./Panel";

interface ConversationPanelProps {
  chat: Chat;
  /** Explains why chat cannot be used right now. Null when it can. */
  blockedReason: string | null;
}

export function ConversationPanel({ chat, blockedReason }: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const canSend = !chat.busy && !blockedReason && draft.trim().length > 0;

  // Follow the reply as it is written.
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    void chat.send(draft.trim());
    setDraft("");
  };

  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Panel title="Conversation" className="conversation">
      <div className="message-list" ref={list} role="log" aria-live="polite">
        {chat.messages.length === 0 && (
          <div className="conversation-empty">
            <p>No conversation yet.</p>
            <p className="panel-note">{blockedReason ?? "Type a message below."}</p>
          </div>
        )}
        {chat.messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            {message.text || <span className="typing" aria-label="JARVIS is thinking"><i /><i /><i /></span>}
            {message.note && <small>{message.note}</small>}
          </div>
        ))}
      </div>

      {chat.messages.length > 0 && blockedReason && <p className="chat-blocked">{blockedReason}</p>}

      <form className="chat-form" onSubmit={submit}>
        <textarea
          value={draft}
          rows={2}
          maxLength={4000}
          placeholder="Message JARVIS"
          aria-label="Message JARVIS"
          disabled={Boolean(blockedReason)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKey}
        />
        <div className="chat-actions">
          <button
            type="button"
            disabled={chat.busy || chat.messages.length === 0}
            onClick={() => void chat.clear()}
          >
            Clear
          </button>
          {chat.busy ? (
            <button type="button" className="chat-primary" onClick={chat.stop}>
              Stop
            </button>
          ) : (
            <button type="submit" className="chat-primary" disabled={!canSend}>
              Send
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}
