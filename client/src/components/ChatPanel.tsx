import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getSocket } from '@/stores/socketStore';

interface ChatMessage { from: string; text: string; ts: number; }

interface ChatPanelProps {
  myName: string;
  isOpen: boolean;
  onClose: () => void;
  onUnread?: () => void;
}

export function ChatPanel({ myName, isOpen, onClose, onUnread }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen) onUnread?.();
    };
    socket.on('chat-message', onMessage);
    return () => { socket.off('chat-message', onMessage); };
  }, [isOpen, onUnread]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    getSocket().emit('chat-message', { text: trimmed }, (res) => {
      if (res?.error) console.warn('[chat]', res.error);
    });
    setText('');
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function fmt(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className={`chat-drawer${isOpen ? ' chat-drawer-open' : ''}`}>
      <div className="chat-header">
        <span className="chat-title">Room Chat</span>
        <button className="chat-close" onClick={onClose}>×</button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">No messages yet. Say something!</p>
        )}
        {messages.map((m, i) => {
          const isMe = m.from === myName;
          return (
            <div key={i} className={`chat-msg${isMe ? ' chat-msg-me' : ''}`}>
              {!isMe && <span className="chat-msg-from">{m.from}</span>}
              <span className="chat-msg-bubble">{m.text}</span>
              <span className="chat-msg-time">{fmt(m.ts)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          className="input chat-input"
          placeholder="Type a message…"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className="btn-primary chat-send" disabled={!text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
