import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  fetchArrivageChatMessages,
  sendArrivageChatMessage,
  subscribeArrivageChat,
} from '../../services/api';
import './ArrivageChat.css';

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function participantRole(session) {
  const identity = normalize(`${session?.identifiant || ''} ${session?.nomComplet || ''}`);
  if (identity.includes('imane')) return 'Imane';
  if (identity.includes('oumaima')) return 'Oumaima · Direction';
  if (identity.includes('yasser') || identity.includes('yassir')) return 'Yasser';
  if (identity.includes('nisrine') || identity.includes('nissrin') || identity.includes('nissrine')) return 'Nissrin';
  return '';
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map(message => [message.id || message.code, message]));
  for (const message of incoming || []) {
    if (message?.id || message?.code) byId.set(message.id || message.code, message);
  }
  return [...byId.values()].sort((left, right) => {
    const a = Date.parse(left.createdAt || left.date || 0) || Number(left.ts || 0);
    const b = Date.parse(right.createdAt || right.date || 0) || Number(right.ts || 0);
    return a - b;
  });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ArrivageChat({ arrivageCode, compact = false }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const role = useMemo(() => participantRole(session), [session]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const listRef = useRef(null);
  const currentUserId = String(session?.id || '');
  const currentName = session?.nomComplet || session?.identifiant || '';

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!arrivageCode || !role) return;
    try {
      const payload = await fetchArrivageChatMessages(arrivageCode);
      setMessages(current => mergeMessages(current, payload.items || []));
    } catch (error) {
      if (!silent) toast(error.message || "Impossible de charger la discussion de l'arrivage.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [arrivageCode, role, toast]);

  useEffect(() => {
    if (!arrivageCode || !role) return undefined;
    let active = true;
    let controller = null;
    let retryTimer = null;

    void refresh();
    const pollTimer = window.setInterval(() => void refresh({ silent: true }), 15000);

    const connect = async () => {
      while (active) {
        controller = new AbortController();
        try {
          setLive(false);
          await subscribeArrivageChat(arrivageCode, message => {
            if (!active || !message) return;
            setLive(true);
            setMessages(current => mergeMessages(current, [message]));
          }, {
            signal: controller.signal,
            onReady: () => active && setLive(true),
          });
        } catch (error) {
          if (!active || error?.name === 'AbortError') break;
          setLive(false);
        }
        if (!active) break;
        await new Promise(resolve => { retryTimer = window.setTimeout(resolve, 2000); });
      }
    };
    void connect();

    return () => {
      active = false;
      window.clearInterval(pollTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      controller?.abort();
    };
  }, [arrivageCode, refresh, role]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const message = await sendArrivageChatMessage(arrivageCode, text);
      setMessages(current => mergeMessages(current, [message]));
      setDraft('');
    } catch (error) {
      toast(error.message || "Le message n'a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  };

  if (!role) return null;

  return (
    <section className={`arrivage-chat ${compact ? 'arrivage-chat-compact' : ''}`}>
      <header className="arrivage-chat-header">
        <div>
          <h3><MessageCircle size={18} /> Discussion de l'arrivage</h3>
          <p>Imane · Oumaima · Yasser · Nissrin</p>
        </div>
        <span className={live ? 'arrivage-chat-live' : 'arrivage-chat-reconnect'}>
          <i /> {live ? 'En direct' : 'Reconnexion…'}
        </span>
      </header>

      <div className="arrivage-chat-list" ref={listRef} aria-live="polite">
        {loading && !messages.length && <p className="arrivage-chat-empty">Chargement de la conversation…</p>}
        {!loading && !messages.length && (
          <p className="arrivage-chat-empty">Aucun message. Commencez la discussion sur cet arrivage.</p>
        )}
        {messages.map(message => {
          const mine = String(message.authorId || '') === currentUserId
            || (!message.authorId && message.author === currentName);
          return (
            <article className={mine ? 'mine' : ''} key={message.id || message.code}>
              <div className="arrivage-chat-meta">
                <b>{mine ? 'Vous' : message.author || '—'}</b>
                <span>{message.authorRole || ''}</span>
                <time>{formatDate(message.createdAt || message.date)}</time>
              </div>
              <p dir="auto">{message.text}</p>
            </article>
          );
        })}
      </div>

      <div className="arrivage-chat-compose">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value.slice(0, 2000))}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={compact ? 2 : 3}
          placeholder={`Écrire à Imane, Oumaima, Yasser et Nissrin au sujet de ${arrivageCode}…`}
        />
        <button type="button" className="btn" disabled={!draft.trim() || sending} onClick={submit}>
          <Send size={16} /> {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
      <small className="arrivage-chat-hint">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</small>
    </section>
  );
}
