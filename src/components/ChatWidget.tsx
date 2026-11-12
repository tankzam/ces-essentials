'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'What does the Starter plan include?',
  'What can I buy à la carte?',
  'What does the legal plan include?',
  'How does pricing work for my company of 12 people?',
];

const GREETING = 'Hi! Ask me anything about CES Essentials plans, prices, and benefits, for you, your family, or your business.';

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (pathname?.startsWith('/admin')) return null;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.filter((m) => m.content) }),
      });
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', content: reply }]);
      }
      if (!reply.trim()) setMessages([...history, { role: 'assistant', content: 'Sorry, I did not get an answer. Please try again.' }]);
    } catch {
      setMessages([...history, { role: 'assistant', content: 'Sorry, I could not connect. Please check your internet and try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 inline-flex min-h-[56px] items-center gap-2.5 rounded-full bg-amber px-5 text-[16px] font-bold text-navy shadow-[0_8px_24px_rgba(11,12,27,0.25)] sm:bottom-6 sm:right-6"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          Ask a question
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="CES Essentials chat"
          className="fixed inset-0 z-50 flex flex-col bg-cream sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-48px)] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line sm:shadow-[0_16px_48px_rgba(11,12,27,0.3)]"
        >
          <div className="flex items-center justify-between gap-3 bg-navy px-4 py-3 text-white">
            <div>
              <p className="text-[17px] font-bold">Ask CES Essentials</p>
              <p className="text-[13px] text-mist">Plans, prices, and benefits</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-2xl hover:bg-navy-2">
              ×
            </button>
          </div>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <p className="max-w-[88%] self-start rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-[15px] leading-relaxed">{GREETING}</p>
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="min-h-11 rounded-xl border border-navy/20 bg-white px-3.5 py-2 text-left text-[15px] font-medium text-navy hover:border-navy">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <p key={i} className="max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-3 text-[15px] leading-relaxed text-white">{m.content}</p>
              ) : (
                <p key={i} className="max-w-[88%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-[15px] leading-relaxed">
                  {m.content || <span className="text-subtle">Typing…</span>}
                </p>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-line bg-white p-3"
          >
            <label className="sr-only" htmlFor="ces-chat-input">Your question</label>
            <textarea
              id="ces-chat-input"
              ref={inputRef}
              rows={1}
              maxLength={1500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Type your question"
              className="max-h-32 min-h-12 flex-1 resize-none rounded-lg border border-[#C8C7BF] px-3 py-3 text-base"
            />
            <button type="submit" disabled={busy || !input.trim()} className="min-h-12 rounded-lg bg-amber px-4 font-bold text-navy disabled:bg-line disabled:text-subtle">
              Send
            </button>
          </form>
          <p className="bg-white px-3 pb-2 text-center text-[12px] text-subtle">Answers are automated. For account help, email us from the Contact page.</p>
        </div>
      )}
    </>
  );
}
