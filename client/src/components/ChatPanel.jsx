import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function ChatPanel({ myName, isOpen, onClose, onUnread }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Listen for incoming messages
  useEffect(() => {
    function onMessage(msg) {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen) onUnread?.();
    }
    socket.on('chat-message', onMessage);
    return () => socket.off('chat-message', onMessage);
  }, [isOpen, onUnread]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('chat-message', { text: trimmed }, (res) => {
      if (res?.error) console.warn('[chat]', res.error);
    });
    setText('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function fmt(ts) {
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
