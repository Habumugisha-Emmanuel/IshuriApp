import { t } from "./i18n.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, media } from "./api.js";
import { notify } from "./notice.js";
import { Icon } from "./icons.jsx";

function logoSrc(person) {
  if (!person) return "";
  if (person.role === "super_admin") return "/logo-512.png";
  const url = person.logoUrl || "";
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return media(url);
}

function ChatMark({ person, active }) {
  const imgRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const src = logoSrc(person);
  useEffect(() => {
    const img = imgRef.current;
    if (!src || !img) return;
    if (img.complete) {
      const ok = img.naturalWidth > 0;
      setReady(ok);
      setFailed(!ok);
      return;
    }
    setReady(false);
    setFailed(false);
  }, [src]);
  const face = !src || failed
    ? <span className="chat-avatar chat-avatar-empty" aria-hidden="true" />
    : (
      <span className={`chat-avatar soft-frame${ready ? " is-ready" : ""}`}>
        <span className="soft-ph" aria-hidden="true" />
        <img ref={imgRef} src={src} alt="" onLoad={() => { setFailed(false); setReady(true); }} onError={() => setFailed(true)} />
      </span>
    );
  return (
    <span className="chat-face">
      {face}
      {typeof active === "boolean" ? <i className={`presence-dot${active ? " is-active" : ""}`} aria-hidden="true" /> : null}
    </span>
  );
}

export function typingLine(rows) {
  const names = (rows || []).map((row) => row.name || row).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return t("{name} is typing", { name: names[0] });
  if (names.length === 2) return t("{first} and {second} are typing", { first: names[0], second: names[1] });
  return t("{name} and {count} others are typing", { name: names[0], count: names.length - 1 });
}

function groupSubtitle(peer, typing) {
  const live = typingLine(typing);
  if (live) return live;
  const names = (peer?.people || []).filter((person) => !person.mine).map((person) => person.fullName).filter(Boolean);
  if (names.length) {
    const preview = names.slice(0, 3).join(", ");
    return names.length > 3 ? `${preview}…` : preview;
  }
  return t("{count} members", { count: peer?.members || 0 });
}

function presenceLine(peer, typing) {
  const live = typingLine(typing);
  if (live) return live;
  if (!peer) return "";
  if (peer.role === "group") return groupSubtitle(peer, typing);
  if (peer.active) return t("Active now");
  if (peer.lastSeenAt) return `${t("Offline")} · ${t("Last seen {time}", { time: when(peer.lastSeenAt) })}`;
  return t("Offline");
}

function when(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function chatPath(peerId) {
  if (peerId === "group") return "/chat/group";
  if (String(peerId || "").startsWith("family/")) return `/chat/family/${String(peerId).slice("family/".length)}`;
  return `/chat/with/${peerId}`;
}

function roleShort(role) {
  return {
    school_admin: t("Director"),
    teacher: t("Teacher"),
    dos: t("Director of Studies"),
    discipline: t("Discipline"),
    accountant: t("Accountant"),
    parent: t("Parent"),
  }[role] || "";
}

function peerLine(peer) {
  if (!peer) return "";
  if (peer.role === "group") return t("Everyone on the school staff");
  if (peer.role === "parent") return peer.note === "Private" ? t("Private") : t("Parent");
  if (peer.role === "super_admin") return "IshuriApp";
  const role = {
    school_admin: t("Director"),
    teacher: t("Teacher"),
    dos: t("Director of Studies"),
    discipline: t("Discipline"),
    accountant: t("Accountant"),
  }[peer.role];
  if (role && peer.schoolName) return `${role} · ${peer.schoolName}`;
  return peer.schoolName || "School";
}

function mergeMessages(current, incoming) {
  const map = new Map(current.map((item) => [String(item.id), item]));
  incoming.forEach((item) => map.set(String(item.id), item));
  return [...map.values()].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

export function useChatInbox(token, enabled) {
  const [inbox, setInbox] = useState({ unread: 0, items: [], ready: false });
  const reload = useCallback(async () => {
    if (!enabled || !token) return;
    try {
      const data = await api("/chat/inbox", { token });
      setInbox({ unread: data.unread || 0, items: data.items || [], ready: true });
    } catch {
      setInbox((current) => ({ ...current, ready: true }));
    }
  }, [token, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let stop = false;
    const tick = () => {
      if (!stop && document.visibilityState !== "hidden") reload();
    };
    tick();
    const timer = setInterval(tick, 4000);
    const onShow = () => tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [enabled, reload]);

  return { unread: inbox.unread, items: inbox.items, ready: inbox.ready, reload };
}

function notificationPlace(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  let right = Math.max(16, window.innerWidth - rect.right);
  if (window.innerWidth - right - width < 16) right = Math.max(16, window.innerWidth - width - 16);
  const top = Math.min(rect.bottom + 8, window.innerHeight - 96);
  return { top, right, width, maxHeight: Math.max(160, window.innerHeight - top - 16) };
}

export function MessageBell({ inbox, activePeer, onOpen }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(null);
  const [place, setPlace] = useState(null);
  const box = useRef(null);
  const pop = useRef(null);
  const seen = useRef("");
  const ready = useRef(false);
  const items = inbox?.items || [];
  const unread = inbox?.unread || 0;
  const showing = Boolean(flash) || open;

  useEffect(() => {
    const newest = items.find((item) => item.unread > 0);
    const key = newest ? `${newest.peer.id}:${newest.lastAt}` : "";
    if (!ready.current) {
      ready.current = true;
      seen.current = key;
      return undefined;
    }
    if (!key || key === seen.current) return undefined;
    seen.current = key;
    if (String(newest.peer.id) === String(activePeer || "")) return undefined;
    setFlash(newest);
    const timer = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(timer);
  }, [items, activePeer]);

  useEffect(() => {
    if (!showing) return undefined;
    const update = () => {
      if (box.current) setPlace(notificationPlace(box.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showing]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      const target = event.target;
      if (box.current?.contains(target) || pop.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function openPeer(peerId) {
    setOpen(false);
    setFlash(null);
    onOpen(peerId);
  }

  return (
    <div className="msg-bell" ref={box}>
      <button
        className="msg-bell-btn"
        type="button"
        aria-expanded={open}
        aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="chat" />
        {unread > 0 ? <span className="msg-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {showing && place ? createPortal(
        <div
          className="msg-pop"
          ref={pop}
          style={{ top: place.top, right: place.right, width: place.width, maxHeight: place.maxHeight }}
        >
          {flash ? (
            <button className="msg-flash" type="button" onClick={() => openPeer(flash.peer.id)}>
              <ChatMark person={flash.peer} active={Boolean(flash.peer.active)} />
              <span className="msg-copy">
                <strong>{flash.peer.role === "group" ? t("School group") : flash.peer.fullName}</strong>
                <em className={flash.typing?.length ? "is-typing" : ""}>{flash.typing?.length ? typingLine(flash.typing) : flash.lastBody}</em>
              </span>
            </button>
          ) : null}
          {open ? (
            <div className="msg-panel" role="dialog" aria-label={t("Incoming messages")}>
              <header>
                <strong>{t("Messages")}</strong>
                <span>{unread ? t("{count} new", { count: unread }) : t("You're caught up")}</span>
              </header>
              {items.length ? items.slice(0, 8).map((item) => (
                <button key={item.threadId} type="button" className={item.unread ? "unread" : ""} onClick={() => openPeer(item.peer.id)}>
                  <ChatMark person={item.peer} active={Boolean(item.peer.active)} />
                  <span className="msg-copy">
                    <strong>{item.peer.role === "group" ? t("School group") : item.peer.fullName}</strong>
                    <em className={item.typing?.length ? "is-typing" : ""}>{item.typing?.length ? typingLine(item.typing) : `${item.lastMine ? t("You: ") : ""}${item.lastBody}`}</em>
                  </span>
                  <span className="msg-meta">
                    <time>{when(item.lastAt)}</time>
                    {item.unread ? <i /> : null}
                  </span>
                </button>
              )) : <p>{t("Incoming messages will show up here.")}</p>}
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function receipt(item) {
  if (item.status === "failed") return t("Not sent");
  if (item.status === "pending") return "Pending";
  if (item.status === "read") return "Seen";
  return "Sent";
}

function reactionLine(reactions = []) {
  const counts = new Map();
  reactions.forEach((row) => counts.set(row.emoji, (counts.get(row.emoji) || 0) + 1));
  return [...counts.entries()].map(([emoji, count]) => (count > 1 ? `${emoji} ${count}` : emoji)).join("  ");
}

function quoteText(reply) {
  if (!reply) return "";
  if (reply.unsent) return t("Message unsent");
  if (reply.kind === "like") return "❤️";
  return reply.body;
}

export function LiveChat({ token, peerId, inbox, onInbox, onOpen }) {
  const [people, setPeople] = useState([]);
  const [peopleReady, setPeopleReady] = useState(false);
  const [canGroup, setCanGroup] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]);
  const [peer, setPeer] = useState(null);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [confirmUnsend, setConfirmUnsend] = useState("");
  const [editing, setEditing] = useState(null);
  const [typing, setTyping] = useState([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dropId, setDropId] = useState("");
  const [loading, setLoading] = useState(false);
  const scroller = useRef(null);
  const stick = useRef(true);
  const sending = pending.some((item) => item.status === "pending");

  useEffect(() => {
    let stop = false;
    api("/chat/people", { token })
      .then((data) => { if (!stop) { setPeople(data.items || []); setCanGroup(Boolean(data.group)); } })
      .catch((err) => { if (!stop) notify("Messages", err.message, "bad"); })
      .finally(() => { if (!stop) setPeopleReady(true); });
    return () => { stop = true; };
  }, [token]);

  useEffect(() => {
    if (!peerId) {
      setPeer(null);
      setMessages([]);
      setPending([]);
      setReply(null);
      setEditing(null);
      setMenuId(null);
      setTyping([]);
      setRosterOpen(false);
      setAddOpen(false);
      setDropId("");
      return undefined;
    }
    let stop = false;
    setLoading(true);
    setPending([]);
    const load = (quiet) => api(`${chatPath(peerId)}?seen=1`, { token })
      .then((data) => {
        if (stop) return;
        setPeer(data.peer);
        setTyping(data.typing || []);
        setMessages((current) => (quiet ? mergeMessages(current, data.items || []) : data.items || []));
        setLoading(false);
        onInbox();
      })
      .catch((err) => {
        if (stop) return;
        setLoading(false);
        if (!quiet) notify("Messages", err.message, "bad");
      });
    load(false);
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") load(true);
    }, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [peerId, token, onInbox]);

  useEffect(() => {
    const node = scroller.current;
    if (stick.current && node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, peerId, typing]);

  useEffect(() => {
    if (!peerId || !draft.trim() || editing) return undefined;
    const timer = setTimeout(() => {
      api(`${chatPath(peerId)}/typing`, { token, method: "POST", body: {}, quiet: true }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, peerId, token, editing]);

  const known = useMemo(() => new Set((inbox?.items || []).map((item) => String(item.peer.id))), [inbox]);
  const needle = query.trim().toLowerCase();
  const matches = (person) => {
    if (!needle) return true;
    return `${person.fullName} ${peerLine(person)}`.toLowerCase().includes(needle);
  };
  const groupRow = (inbox?.items || []).find((item) => item.peer?.id === "group");
  const conversations = (inbox?.items || []).filter((item) => item.peer?.id !== "group" && matches(item.peer));
  const others = people.filter((person) => !known.has(String(person.id)) && matches(person));
  const shown = [...messages, ...pending];

  async function deliver(localId, text, extra = {}) {
    setPending((current) => current.map((item) => (item.id === localId ? { ...item, status: "pending" } : item)));
    try {
      const data = await api(chatPath(peerId), {
        token,
        method: "POST",
        body: { body: text, kind: extra.kind, replyTo: extra.replyTo },
      });
      setPending((current) => current.filter((item) => item.id !== localId));
      setMessages((current) => mergeMessages(current, [data.message]));
      onInbox();
    } catch (err) {
      setPending((current) => current.map((item) => (item.id === localId ? { ...item, status: "failed" } : item)));
      notify(t("Not sent"), err.message, "bad");
    }
  }

  function queueMessage(text, extra = {}) {
    if (!peerId || sending) return;
    const localId = `local-${Date.now()}`;
    stick.current = true;
    setMenuId(null);
    setReply(null);
    setDraft("");
    setPending((current) => [
      ...current,
      {
        id: localId,
        body: text,
        kind: extra.kind || "text",
        status: "pending",
        mine: true,
        reply: extra.reply || null,
        reactions: [],
        createdAt: new Date().toISOString(),
        local: true,
      },
    ]);
    deliver(localId, text, { kind: extra.kind, replyTo: extra.replyTo });
  }

  async function saveEdit(text) {
    const id = editing?.id;
    if (!id) return;
    try {
      const data = await api(`/chat/messages/${id}`, { token, method: "PATCH", body: { body: text } });
      setMessages((current) => current.map((row) => (String(row.id) === String(data.message.id) ? data.message : row)));
      setEditing(null);
      setDraft("");
      onInbox();
    } catch (err) {
      notify(t("Not saved"), err.message, "bad");
    }
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    if (editing) {
      saveEdit(text);
      return;
    }
    queueMessage(text, {
      reply,
      replyTo: reply && !String(reply.id).startsWith("local") ? reply.id : undefined,
    });
  }

  function sendLike() {
    queueMessage("❤️", { kind: "like" });
  }

  async function react(item, emoji) {
    setMenuId(null);
    if (item.local) return;
    try {
      const data = await api(`/chat/messages/${item.id}/react`, { token, method: "POST", body: { emoji } });
      setMessages((current) => current.map((row) => (String(row.id) === String(data.message.id) ? data.message : row)));
    } catch (err) {
      notify(t("Not saved"), err.message, "bad");
    }
  }

  async function unsend(item) {
    if (confirmUnsend !== item.id) {
      setConfirmUnsend(item.id);
      return;
    }
    setMenuId(null);
    setConfirmUnsend("");
    try {
      const data = await api(`/chat/messages/${item.id}`, { token, method: "DELETE" });
      setMessages((current) => current.map((row) => (String(row.id) === String(data.message.id) ? data.message : row)));
      onInbox();
    } catch (err) {
      notify(t("Not unsent"), err.message, "bad");
    }
  }

  async function copyMessage(item) {
    try {
      await navigator.clipboard.writeText(item.body || "");
      notify("Copied", t("Message copied."));
    } catch {
      notify(t("Not copied"), t("Copy is not available in this browser."), "bad");
    }
    setMenuId(null);
  }

  async function changeMember(userId, removing) {
    try {
      const data = await api(removing ? `/chat/group/members/${userId}` : "/chat/group/members", {
        token,
        method: removing ? "DELETE" : "POST",
        body: removing ? undefined : { userId },
      });
      if (data.peer) setPeer(data.peer);
      setDropId("");
      onInbox();
    } catch (err) {
      notify("School group", err.message, "bad");
    }
  }

  const lastMineId = [...shown].reverse().find((item) => item.mine)?.id;
  const picked = shown.find((item) => item.id === menuId && !item.unsent);
  let lastDay = "";

  return (
    <div className={`chat-shell${peerId ? " chat-open" : ""}${rosterOpen && peer?.role === "group" ? " has-info" : ""}`}>
      <aside className="chat-list">
        <header>
          <h2>{t("Messages")}</h2>
          <input value={query} placeholder={t("Search people")} onChange={(event) => setQuery(event.target.value)} />
        </header>
        <div className="chat-people">
          {canGroup ? (
            <button type="button" className={peerId === "group" ? "on" : ""} onClick={() => onOpen("group")}>
              <span className="chat-face">
                <span className="chat-avatar chat-avatar-empty" aria-hidden="true"><Icon name="people" /></span>
                <i className={`presence-dot${groupRow?.peer?.active ? " is-active" : ""}`} aria-hidden="true" />
              </span>
              <span className="msg-copy">
                <strong>{t("School group")}</strong>
                <em className={groupRow?.typing?.length ? "is-typing" : ""}>
                  {groupRow?.typing?.length
                    ? typingLine(groupRow.typing)
                    : groupRow?.lastBody
                      ? `${groupRow.lastMine ? t("You: ") : ""}${groupRow.lastBody}`
                      : t("{count} members", { count: groupRow?.peer?.members || 0 })}
                </em>
              </span>
              <span className="msg-meta">
                {groupRow ? <time>{when(groupRow.lastAt)}</time> : null}
                {groupRow?.unread ? <b>{groupRow.unread}</b> : null}
              </span>
            </button>
          ) : null}
          {conversations.map((item) => (
            <button key={item.threadId} type="button" className={String(peerId) === String(item.peer.id) ? "on" : ""} onClick={() => onOpen(item.peer.id)}>
              <ChatMark person={item.peer} active={Boolean(item.peer.active)} />
              <span className="msg-copy">
                <strong>{item.peer.role === "group" ? t("School group") : item.peer.fullName}</strong>
                <em className={item.typing?.length ? "is-typing" : ""}>
                  {item.typing?.length ? typingLine(item.typing) : `${peerLine(item.peer)} · ${item.lastMine ? t("You: ") : ""}${item.lastBody}`}
                </em>
              </span>
              <span className="msg-meta">
                <time>{when(item.lastAt)}</time>
                {item.lastMine ? <small>{item.lastStatus === "read" ? "Seen" : "Sent"}</small> : null}
                {item.unread ? <b>{item.unread}</b> : null}
              </span>
            </button>
          ))}
          {others.length ? <p className="chat-label">{t("Start a chat")}</p> : null}
          {others.map((person) => (
            <button key={person.id} type="button" className={String(peerId) === String(person.id) ? "on" : ""} onClick={() => onOpen(person.id)}>
              <ChatMark person={person} active={Boolean(person.active)} />
              <span className="msg-copy">
                <strong>{person.fullName}</strong>
                <em>{peerLine(person)}</em>
              </span>
            </button>
          ))}
          {(!inbox?.ready || !peopleReady) && !conversations.length && !others.length ? (
            <div aria-hidden="true">
              {[0, 1, 2, 3].map((item) => (
                <div className="chat-skel" key={item}>
                  <i className="skel skel-avatar" />
                  <span className="skel-copy"><i className="skel" /><i className="skel short" /></span>
                </div>
              ))}
            </div>
          ) : null}
          {inbox?.ready && peopleReady && !conversations.length && !others.length ? <p className="chat-empty">{t("No one matches that search.")}</p> : null}
        </div>
      </aside>
      <section className="chat-thread">
        {peer ? (
          <>
            <header className="chat-thread-head">
              <button className="chat-back" type="button" onClick={() => onOpen("")}>{t("Back")}</button>
              <ChatMark person={peer} active={peer.role === "group" ? Boolean(peer.activeCount) : Boolean(peer.active)} />
              {peer.role === "group" ? (
                <button type="button" className="chat-head-main" aria-expanded={rosterOpen} onClick={() => { setRosterOpen((open) => !open); setAddOpen(false); setDropId(""); }}>
                  <strong>{t("School group")}</strong>
                  <em className={typing.length ? "is-typing" : ""}>{groupSubtitle(peer, typing)}</em>
                </button>
              ) : (
                <span className="chat-head-main">
                  <strong>{peer.fullName}</strong>
                  <em className={typing.length ? "is-typing" : ""}>{presenceLine(peer, typing)}</em>
                </span>
              )}
            </header>
            <div
              className="chat-log"
              ref={scroller}
              onClick={() => { setMenuId(null); setConfirmUnsend(""); }}
              onScroll={(event) => {
                const node = event.currentTarget;
                stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
              }}
            >
              {loading && !shown.length ? (
                <div className="chat-skel-log" aria-hidden="true">
                  {[0, 1, 2, 3].map((item) => <i key={item} className={`skel skel-bubble${item % 2 ? " mine" : ""}`} />)}
                </div>
              ) : null}
              {!loading && !shown.length ? <p className="chat-empty">{t("Say hello. Tap a message to reply, react, copy, edit, or delete.")}</p> : null}
              {shown.map((item) => {
                const label = dayLabel(item.createdAt);
                const showDay = label && label !== lastDay;
                if (showDay) lastDay = label;
                const open = menuId === item.id;
                return (
                  <div key={item.id} className="chat-row">
                    {showDay ? <p className="chat-day">{label}</p> : null}
                    <article className={`${item.mine ? "mine" : "theirs"}${item.kind === "like" ? " like" : ""}${item.unsent ? " unsent" : ""}${open ? " picked" : ""}${peer.role === "group" ? " wa" : ""}`}>
                      {item.unsent ? (
                        <p className="bubble">{t("Message unsent")}</p>
                      ) : (
                        <button
                          className="bubble"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmUnsend("");
                            setMenuId(open ? null : item.id);
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            react(item, "❤️");
                          }}
                        >
                          {item.reply ? <span className="chat-quote">{item.reply.mine ? t("You") : (item.reply.name || (peer.role === "group" ? t("School group") : peer.fullName))}<br />{quoteText(item.reply)}</span> : null}
                          {!item.mine && item.senderName && (peer.role === "group" || peer.role === "parent") ? <b className="chat-who">{item.senderName}{roleShort(item.senderRole) ? ` · ${roleShort(item.senderRole)}` : ""}</b> : null}
                          {item.kind === "like" ? <span className="heart">❤️</span> : item.body}
                          {item.edited ? <small className="chat-edited">{t("Edited")}</small> : null}
                          {peer.role === "group" ? <small className="wa-time">{when(item.createdAt)}</small> : null}
                        </button>
                      )}
                      {item.reactions?.length ? <span className="chat-reactions">{reactionLine(item.reactions)}</span> : null}
                          {item.id === lastMineId && item.status === "failed" ? (
                        <footer>
                          <button type="button" onClick={() => deliver(item.id, item.body, { kind: item.kind, replyTo: item.reply?.id })}>{t("Not sent · Retry")}</button>
                        </footer>
                      ) : item.id === lastMineId && peer.role !== "group" ? (
                        <footer><span>{`${receipt(item)} · ${when(item.createdAt)}`}</span></footer>
                      ) : null}
                    </article>
                  </div>
                );
              })}
              {typing.length ? (
                <p className="chat-typing" aria-live="polite">
                  <i /><i /><i />
                  <span>{typingLine(typing)}</span>
                </p>
              ) : null}
            </div>
            <div className="chat-dock">
              {picked ? (
                <div className="chat-menu">
                  <div className="chat-reacts">
                    {REACTIONS.map((emoji) => (
                      <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => react(picked, emoji)}>{emoji}</button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setReply(picked); setMenuId(null); setConfirmUnsend(""); }}>{t("Reply")}</button>
                  {picked.kind !== "like" ? <button type="button" onClick={() => copyMessage(picked)}>{t("Copy")}</button> : null}
                  {picked.mine && !picked.local && picked.kind !== "like" ? (
                    <button type="button" onClick={() => { setEditing(picked); setDraft(picked.body || ""); setReply(null); setMenuId(null); setConfirmUnsend(""); }}>{t("Edit")}</button>
                  ) : null}
                  {picked.mine && !picked.local ? (
                    <button type="button" className="danger" onClick={() => unsend(picked)}>
                      {confirmUnsend === picked.id ? t("Delete for everyone") : t("Delete")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {editing ? (
                <div className="chat-reply-bar">
                  <span>
                    <strong>{t("Editing your message")}</strong>
                    <em>{editing.body}</em>
                  </span>
                  <button type="button" aria-label={t("Cancel edit")} onClick={() => { setEditing(null); setDraft(""); }}>{t("×")}</button>
                </div>
              ) : null}
              {reply ? (
                <div className="chat-reply-bar">
                  <span>
                    <strong>{reply.mine ? t("Replying to yourself") : t("Replying to {name}", { name: reply.senderName || (peer.role === "group" ? t("School group") : peer.fullName) })}</strong>
                    <em>{quoteText(reply)}</em>
                  </span>
                  <button type="button" aria-label={t("Cancel reply")} onClick={() => setReply(null)}>{t("×")}</button>
                </div>
              ) : null}
              <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                <textarea
                  value={draft}
                  rows={1}
                  maxLength={2000}
                  placeholder={t("Message…")}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                {draft.trim() ? (
                  <button className="solid" type="submit" disabled={sending}>{editing ? t("Save") : t("Send")}</button>
                ) : editing ? null : (
                  <button className="chat-heart" type="button" aria-label={t("Send a heart")} disabled={sending} onClick={sendLike}>❤️</button>
                )}
              </form>
            </div>
          </>
        ) : peerId ? (
          <div className="chat-pick" aria-hidden="true">
            <i className="skel skel-avatar" />
            <i className="skel" />
            <i className="skel short" />
          </div>
        ) : (
          <div className="chat-pick">
            <Icon name="chat" />
            <strong>{t("Choose a conversation")}</strong>
            <p>{t("Tap a message to reply, react, copy, edit, or delete. A heart sends when the box is empty. Seen appears when the other person opens the chat.")}</p>
          </div>
        )}
      </section>
      {rosterOpen && peer?.role === "group" ? (
        <aside className="wa-info">
          <div className="wa-hero">
            <button type="button" className="wa-close" onClick={() => { setRosterOpen(false); setAddOpen(false); setDropId(""); }}>{t("Close")}</button>
            <span className="wa-mark"><Icon name="people" /></span>
            <strong>{t("School group")}</strong>
            <em>{t("{count} members", { count: peer.members || (peer.people || []).length })}</em>
            <p>{t("The director manages this group.")}</p>
          </div>
          {peer.canManage ? (
            <button type="button" className="wa-add" onClick={() => { setAddOpen((open) => !open); setDropId(""); }}>
              <Icon name="people" />
              {t("Add member")}
            </button>
          ) : null}
          {addOpen && peer.canManage ? (
            <div className="wa-outside">
              {(peer.outside || []).length ? (peer.outside || []).map((person) => (
                <button type="button" key={person.id} onClick={() => changeMember(person.id, false)}>
                  <span className="wa-letter" style={{ background: memberColor(person.fullName) }}>{memberLetter(person.fullName)}</span>
                  <span>
                    <strong>{person.fullName}</strong>
                    <em>{roleShort(person.role)}</em>
                  </span>
                  <b>{t("Add member")}</b>
                </button>
              )) : <p className="chat-quiet">{t("Everyone on the school staff is already in this group.")}</p>}
            </div>
          ) : (
            <div className="wa-members">
              {(peer.people || []).map((person) => (
                <div className="wa-member" key={person.id}>
                  <span className="chat-face">
                    <span className="wa-letter" style={{ background: memberColor(person.fullName) }}>{memberLetter(person.fullName)}</span>
                    <i className={`presence-dot${person.active ? " is-active" : ""}`} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{person.mine ? t("You") : person.fullName}</strong>
                    <em>{person.admin ? t("Group admin") : person.active ? t("Active now") : person.lastSeenAt ? t("Last seen {time}", { time: when(person.lastSeenAt) }) : (roleShort(person.role) || t("Offline"))}</em>
                    {dropId === String(person.id) ? <em className="wa-ask">{t("Remove {name} from this group?", { name: person.fullName })}</em> : null}
                  </span>
                  {peer.canManage && !person.admin ? (
                    dropId === String(person.id) ? (
                      <button type="button" className="danger" onClick={() => changeMember(person.id, true)}>{t("Remove")}</button>
                    ) : (
                      <button type="button" className="wa-more" aria-label={t("Remove")} onClick={() => setDropId(String(person.id))}>×</button>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}

function memberLetter(name) {
  return (String(name || "?").trim()[0] || "?").toUpperCase();
}

function memberColor(name) {
  const colors = ["#0d47a1", "#1565c0", "#0277bd", "#00838f", "#01579b"];
  const letter = memberLetter(name);
  return colors[letter.charCodeAt(0) % colors.length];
}
