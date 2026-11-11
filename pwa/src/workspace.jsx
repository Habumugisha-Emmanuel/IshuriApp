import { t } from "./i18n.js";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, uploadFile } from "./api.js";
import { act, notify, track } from "./notice.js";
import { Icon, TILE_ICON } from "./icons.jsx";
import { MessageAnalytics, MessagesGraphic } from "./messageAnalytics.jsx";
import { MessageWallets, WalletBanner } from "./messageWallet.jsx";
import { OfficialPreview, ReportLogos } from "./officialReport.jsx";
import { LiveChat, MessageBell, useChatInbox } from "./liveChat.jsx";

const SESSION_KEY = "ishuri.pwa.session";

function go(path) {
  window.location.hash = path;
}

function Field({ label, value, onChange, type = "text", placeholder, multiline, autoComplete }) {
  const [visible, setVisible] = useState(false);
  const secret = type === "password";
  return (
    <label className="field">
      {t(label)}
      {multiline ? (
        <textarea value={value} rows={4} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <span className={secret ? "secret-field" : undefined}>
          <input type={secret && visible ? "text" : type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
          {secret ? (
            <button className="secret-toggle" type="button" aria-pressed={visible} aria-label={visible ? t("Hide password") : t("Show password")} onClick={() => setVisible((current) => !current)}>
              {visible ? t("Hide") : t("Show")}
            </button>
          ) : null}
        </span>
      )}
    </label>
  );
}

function parentOf(student) {
  return student.guardians?.find((item) => item.isPrimary) || student.guardians?.[0];
}

function tilesFor(session) {
  const role = session?.user?.role;
  const isUni = session?.school?.type === "university";
  const tiles = [];
  if (role === "super_admin") {
    tiles.push(
      { id: "reports", group: "Overview", title: t("School analysis"), hint: t("Filter schools, then compare period activity against today’s register") },
      { id: "chat", group: "Overview", title: "Messages", hint: t("Reply, react, edit, delete, and see when a director has seen a message") },
      { id: "approvals", group: "Schools", title: t("Directors and schools"), hint: t("Create accounts, then approve, reject, activate or delete") },
      { id: "wallets", group: "Schools", title: t("Message wallets"), hint: t("Top up a school, set the messages left, and read earnings from sent messages") },
      { id: "ads", group: "Platform", title: t("In-app ads"), hint: t("Publish, preview, suspend or remove ads") }
    );
  }
  if (role === "school_admin") {
    tiles.push(
      { id: "chat", group: "School", title: "Messages", hint: t("Reply, react, and chat with directors or IshuriApp") },
      { id: "profile", group: "School", title: t("School profile"), hint: t("Create the profile and send it for approval") },
      { id: "staff", group: "People", title: t("Staff accounts"), hint: t("Teachers and discipline officers, with email and password") }
    );
    if (!isUni) {
      tiles.push(
        { id: "classes", group: "People", title: "Classes", hint: t("Create the class and its subjects. The teacher is chosen when you register a teacher.") },
        { id: "students", group: "People", title: "Students", hint: t("Registers and the one parent phone") }
      );
    }
    tiles.push(
      { id: "publish", group: "School life", title: "Events", hint: t("Meetings, sports and scholarships") },
      { id: "sms", group: "School life", title: t("Send a message"), hint: t("Write a notice and send it to parent phones") },
      { id: "analytics", group: "School life", title: t("Message analytics"), hint: t("Today, week, month and year, with paid and unpaid graphs") }
    );
  }
  if (role === "teacher" && !isUni) {
    tiles.push(
      { id: "students", group: "My class", title: t("Register students"), hint: t("One parent phone receives every message") },
      { id: "marks", group: "My class", title: "Assessments", hint: t("Create an assessment in any class, save marks, and print the report") },
      { id: "analytics", group: "My class", title: t("My messages"), hint: t("Messages you sent, by day, week, month, year, paid and unpaid") }
    );
  }
  if (role === "discipline") {
    tiles.push(
      { id: "discipline", group: "Discipline", title: t("Discipline report"), hint: t("Scores, cases, and a printable report by date and student") },
      { id: "analytics", group: "Discipline", title: t("My messages"), hint: t("Discipline texts you sent, with paid and unpaid totals") }
    );
  }
  return tiles;
}

export function Workspace({ session, section, onSignOut, onSession }) {
  const tiles = tilesFor(session);
  const allowed = new Set(tiles.map((tile) => tile.id));
  const sectionId = String(section || "home").split("/")[0] || "home";
  const peerId = String(section || "").split("/")[1] || "";
  const current = sectionId !== "home" && allowed.has(sectionId) ? sectionId : "home";
  const canChat = session?.user?.role === "school_admin" || session?.user?.role === "super_admin";
  const inbox = useChatInbox(session?.token, canChat);
  usePresence(session?.token);

  function openChat(peer) {
    go(peer ? `#/desk/chat/${peer}` : "#/desk/chat");
  }

  if (!session) {
    return (
      <div className="page">
        <h1>{t("The desk is locked.")}</h1>
        <button className="solid" onClick={() => go("#/gate")}>{t("Sign in")}</button>
      </div>
    );
  }

  const superHome = session.user?.role === "super_admin" && current === "home";
  return (
    <div className={`page${current === "chat" ? " chat-page" : ""}`}>
      <header className={`page-head${canChat && !superHome ? " has-bell" : ""}${current === "home" ? " is-overview" : ""}`}>
        <div>
          <p className="kicker">{current === "home" ? <Icon name="home" /> : null}{(session.user?.role || "").replaceAll("_", " ")}</p>
          <h1>{session.school?.name || session.user?.fullName}</h1>
          <p className="lede">
            {session.school
              ? `${session.school.name} · ${String(session.school.status || "").replaceAll("_", " ")}`
              : "Sign in, then follow the steps for your role."}
          </p>
          {session.school?.status === "pending_review" ? <p>{t("Your school is under IshuriApp review. It is not public yet.")}</p> : null}
          {session.school?.status === "rejected" ? <p>Application was returned: {session.school.rejectionReason}</p> : null}
          {session.school?.type === "university" ? <p className="muted">{t("Universities publish events and scholarships. Class marks stay with primary, secondary and TVET schools.")}</p> : null}
        </div>
        {superHome ? <MessageSaleGraphic /> : current === "home" ? <OverviewGraphic /> : null}
        {canChat && !superHome ? <MessageBell inbox={inbox} activePeer={current === "chat" ? peerId : ""} onOpen={openChat} /> : null}
      </header>
      {session.user?.role === "school_admin" && current !== "chat" ? <SchoolAdminReach /> : null}
      <div className="work">
        <aside className="work-nav panel">
          <button className={current === "home" ? "on" : ""} onClick={() => go("#/desk")}><Icon name="home" />{t("Overview")}</button>
          {tiles.map((tile) => (
            <button key={tile.id} className={current === tile.id ? "on" : ""} onClick={() => go(`#/desk/${tile.id}`)}>
              <Icon name={TILE_ICON[tile.id] || "school"} />
              <span>{t(tile.title)}</span>
              {tile.id === "chat" && inbox?.unread ? <b className="nav-alert">{inbox.unread > 9 ? "9+" : inbox.unread}</b> : null}
            </button>
          ))}
          <button onClick={onSignOut}><Icon name="door" />{t("Log out")}</button>
        </aside>
        <div>
          {current === "home" && session.user?.role === "super_admin" ? <PlatformPulse token={session.token} /> : null}
          {current === "home" && <HomeTiles tiles={tiles} unread={inbox?.unread || 0} />}
          {current === "students" && <Students token={session.token} />}
          {current === "staff" && <StaffDesk token={session.token} />}
          {current === "classes" && <Classes token={session.token} />}
          {current === "marks" && <Marks token={session.token} school={session.school} />}
          {current === "discipline" && <Discipline token={session.token} school={session.school} />}
          {current === "profile" && <Profile session={session} onSession={onSession} />}
          {current === "publish" && <Publish token={session.token} school={session.school} />}
          {current === "sms" && <Messages token={session.token} role={session.user?.role} school={session.school} />}
          {current === "analytics" && <MessageAnalytics token={session.token} role={session.user?.role} />}
          {current === "reports" && <Reports token={session.token} />}
          {current === "approvals" && <Approvals token={session.token} />}
          {current === "wallets" && <MessageWallets token={session.token} />}
          {current === "ads" && <Ads token={session.token} />}
          {current === "chat" && <LiveChat token={session.token} peerId={peerId} inbox={inbox} onInbox={inbox.reload} onOpen={openChat} />}
        </div>
      </div>
    </div>
  );
}

function usePresence(token) {
  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    const ping = () => {
      if (stop || document.hidden) return;
      api("/auth/presence", { method: "POST", token }).catch(() => {});
    };
    ping();
    const timer = window.setInterval(ping, 25000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [token]);
}

const STAFF_LABELS = { school_admin: "Directors", teacher: "Teachers", discipline: "Discipline", accountant: "Accountants" };

function PlatformPulse({ token }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let stop = false;
    let told = false;
    const load = () => {
      api("/admin/presence", { token })
        .then((next) => { if (!stop) setData(next); })
        .catch((err) => {
          if (stop || told) return;
          told = true;
          notify(t("Not completed"), err.message, "bad");
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [token]);
  const staffLine = Object.entries(STAFF_LABELS)
    .filter(([role]) => data?.staffByRole?.[role])
    .map(([role, label]) => `${label} ${data.staffByRole[role]}`)
    .join(" · ");
  const trend = data?.trend?.length > 1 ? data.trend : (data?.trend || []).flatMap((point) => [point, point]);
  const staffBars = (data?.items || [])
    .map((item) => ({ ...item, name: item.name.length > 22 ? `${item.name.slice(0, 20)}…` : item.name }))
    .sort((a, b) => b.staff - a.staff || a.name.localeCompare(b.name));
  const maxOnline = Math.max(1, ...(data?.items || []).map((item) => item.online));
  const onlineShare = data?.schools ? Math.round((data.onlineSchools / data.schools) * 100) : 0;
  return (
    <section className="sections">
      <article className="chart-card pulse-card">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="school" /></span>
          <div>
            <h2>{t("Schools and staff")}</h2>
            <p className="muted">{data ? `${data.schools} schools · ${data.staff} staff${staffLine ? ` · ${staffLine}` : ""}` : "Checking the register…"}</p>
          </div>
        </header>
        <div className="pulse-chart" role="img" aria-label={data ? `${data.schools} schools and ${data.staff} staff over time` : "Schools and staff trend"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="schoolsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1565C0" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#1565C0" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="staffFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4FC3F7" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#4FC3F7" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e3f2fd" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip />
              <Legend />
              <Area type="monotone" name="Schools" dataKey="schools" stroke="#0D47A1" strokeWidth={3} fill="url(#schoolsFill)" isAnimationActive animationDuration={800} />
              <Area type="monotone" name="Staff" dataKey="staff" stroke="#0288D1" strokeWidth={3} fill="url(#staffFill)" isAnimationActive animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <h2><Icon name="people" />{t("Staff in each school")}</h2>
        <div className="pulse-chart bars" role="img" aria-label={t("Staff in each school")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={staffBars} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e3f2fd" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={128} tick={{ fill: "#0a2540", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar name="Directors" dataKey="directors" stackId="staff" fill="#0D47A1" isAnimationActive animationDuration={800} />
              <Bar name="Teachers" dataKey="teachers" stackId="staff" fill="#1565C0" isAnimationActive animationDuration={800} />
              <Bar name="Discipline" dataKey="discipline" stackId="staff" fill="#4FC3F7" radius={staffBars.some((item) => item.accountants) ? undefined : [0, 6, 6, 0]} isAnimationActive animationDuration={800} />
              {staffBars.some((item) => item.accountants) ? <Bar name="Accountants" dataKey="accountants" stackId="staff" fill="#90CAF9" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={800} /> : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="chart-card pulse-card">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="bolt" /></span>
          <div>
            <h2>{t("Schools online now")}</h2>
            <p className="muted">{t("A school is online while one of its staff has IshuriApp open. The count clears about 90 seconds after they leave.")}</p>
          </div>
        </header>
        <div className="split-bar" role="img" aria-label={data ? `${data.onlineSchools} schools online, ${data.offlineSchools} offline` : "Online schools"}>
          <i style={{ width: `${onlineShare}%`, background: "#2E7D32" }} />
          <i style={{ width: `${100 - onlineShare}%`, background: "#e7eef5" }} />
        </div>
        <p className="muted">{data ? `${data.onlineSchools} online · ${data.offlineSchools} offline · ${data.onlinePeople} staff on IshuriApp` : "Checking who is online…"}</p>
        {(data?.items || []).map((item) => (
          <div key={item.id} className="pulse-school">
            <p className="pulse-school-name"><Icon name={item.online ? "bolt" : "building"} /><strong>{item.name}</strong> <span>{item.online ? `${item.online} online` : "Offline"}</span></p>
            <div className="track"><div className="fill live" style={{ width: item.online ? `${(item.online / maxOnline) * 100}%` : "0%" }} /></div>
            {item.online ? <p className="muted">{item.people.map((person) => person.fullName).join(", ")}</p> : null}
          </div>
        ))}
      </article>
    </section>
  );
}

function SchoolAdminReach() {
  return (
    <div className="ishuri-reach">
      <a className="solid" href="https://wa.me/250795645441" target="_blank" rel="noreferrer">
        <Icon name="chat" />Join the IshuriApp WhatsApp group
      </a>
      <a className="ghost" href="tel:+250795645441">
        <Icon name="phone" />Call +250 795645441
      </a>
    </div>
  );
}

const GROUP_ICON = {
  Overview: "home",
  Schools: "school",
  Platform: "megaphone",
  School: "school",
  People: "people",
  "School life": "calendar",
  "My class": "graduate",
  Discipline: "scale",
};

function MessageSaleGraphic() {
  return (
    <svg className="overview-crest sale-crest" viewBox="0 0 360 160" role="img" aria-label={t("Super admin selling messages to schools")}>
      <rect x="6" y="8" width="348" height="144" rx="24" fill="#e3f2fd" />
      <rect x="16" y="22" width="108" height="116" rx="18" fill="#ffffff" />
      <circle cx="70" cy="58" r="16" fill="#0D47A1" />
      <path d="M46 108c3-20 12-30 24-30s21 10 24 30" fill="#1565C0" />
      <text x="70" y="126" textAnchor="middle" fill="#0D47A1" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("Super admin")}</text>
      <g className="sale-pack">
        <rect x="98" y="66" width="42" height="26" rx="8" fill="#0D47A1" />
        <text x="119" y="83" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <path className="sale-flow" d="M146 80 H214" />
      <path d="M206 74l10 6-10 6" fill="none" stroke="#1565C0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <g className="sale-pack late">
        <rect x="158" y="52" width="40" height="24" rx="8" fill="#1565C0" />
        <text x="178" y="68" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <g className="sale-pack later">
        <rect x="168" y="92" width="40" height="24" rx="8" fill="#0288D1" />
        <text x="188" y="108" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <g>
        <rect x="228" y="28" width="56" height="78" rx="12" fill="#0D47A1" />
        <path d="M228 46h56" stroke="#4FC3F7" strokeWidth="3" />
        <rect x="238" y="54" width="12" height="10" rx="2" fill="#ffffff" />
        <rect x="256" y="54" width="12" height="10" rx="2" fill="#ffffff" />
        <rect x="238" y="70" width="12" height="10" rx="2" fill="#90CAF9" />
        <rect x="256" y="70" width="12" height="10" rx="2" fill="#90CAF9" />
        <rect x="236" y="86" width="40" height="14" rx="7" fill="#ffffff" />
        <text x="256" y="97" textAnchor="middle" fill="#0D47A1" fontSize="8" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <text x="256" y="124" textAnchor="middle" fill="#0D47A1" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("School")}</text>
      <g>
        <rect x="292" y="28" width="56" height="78" rx="12" fill="#1565C0" />
        <path d="M292 46h56" stroke="#4FC3F7" strokeWidth="3" />
        <rect x="302" y="54" width="12" height="10" rx="2" fill="#ffffff" />
        <rect x="320" y="54" width="12" height="10" rx="2" fill="#ffffff" />
        <rect x="302" y="70" width="12" height="10" rx="2" fill="#90CAF9" />
        <rect x="320" y="70" width="12" height="10" rx="2" fill="#90CAF9" />
        <rect x="300" y="86" width="40" height="14" rx="7" fill="#ffffff" />
        <text x="320" y="97" textAnchor="middle" fill="#1565C0" fontSize="8" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <text x="320" y="124" textAnchor="middle" fill="#1565C0" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("School")}</text>
    </svg>
  );
}

function OverviewGraphic() {
  return (
    <svg className="overview-crest" viewBox="0 0 280 150" role="img" aria-label={t("A school desk sending marks and discipline to a parent phone")}>
      <rect x="8" y="12" width="264" height="126" rx="24" fill="#e3f2fd" />
      <rect x="22" y="34" width="96" height="84" rx="14" fill="#0D47A1" />
      <path d="M22 56h96" stroke="#4FC3F7" strokeWidth="4" />
      <rect x="36" y="68" width="18" height="14" rx="3" fill="#ffffff" />
      <rect x="62" y="68" width="18" height="14" rx="3" fill="#ffffff" />
      <rect x="36" y="90" width="18" height="14" rx="3" fill="#90CAF9" />
      <rect x="62" y="90" width="18" height="14" rx="3" fill="#90CAF9" />
      <circle cx="150" cy="58" r="16" fill="#ffffff" />
      <path d="M134 112c2-18 10-26 16-26s14 8 16 26" fill="#ffffff" />
      <g className="assess-pen">
        <rect x="178" y="26" width="76" height="102" rx="16" fill="#1565C0" />
        <rect x="186" y="38" width="60" height="66" rx="8" fill="#ffffff" />
        <text x="216" y="64" textAnchor="middle" fill="#0D47A1" fontSize="13" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94/100</text>
        <text x="216" y="84" textAnchor="middle" fill="#1565C0" fontSize="11" fontFamily="Instrument Sans, sans-serif">{t("Discipline")}</text>
        <circle cx="216" cy="114" r="4" fill="#4FC3F7" />
      </g>
    </svg>
  );
}

function HomeTiles({ tiles, unread = 0 }) {
  const groups = [...new Set(tiles.map((tile) => tile.group))];
  if (!tiles.length) return <p className="muted">{t("This account has no workspace tools.")}</p>;
  return (
    <div className="sections">
      {groups.map((group) => (
        <section key={group}>
          <p className="kicker"><Icon name={GROUP_ICON[group] || "compass"} />{t(group)}</p>
          <div className="card-grid">
            {tiles.filter((tile) => tile.group === group).map((tile) => (
              <button key={tile.id} className="panel tile" onClick={() => go(`#/desk/${tile.id}`)}>
                <span className="assess-mark tile-mark">
                  <Icon name={TILE_ICON[tile.id] || "school"} />
                  {tile.id === "chat" && unread ? <b className="nav-alert">{unread > 9 ? "9+" : unread}</b> : null}
                </span>
                <span className="tile-copy">
                  <strong>{t(tile.title)}</strong>
                  <span className="muted">{t(tile.hint)}</span>
                </span>
                <Icon name="right" className="ico tile-go" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Students({ token }) {
  const empty = { fullName: "", studentCode: "", classRoom: "", parentName: "", parentPhone: "" };
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    const [students, rooms] = await Promise.all([api("/students", { token }), api("/academics/classes", { token })]);
    setItems(students.items || []);
    setClasses(rooms.items || []);
    setForm((current) => ({ ...current, classRoom: current.classRoom || rooms.items?.[0]?._id || "" }));
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  function beginEdit(student) {
    const parent = parentOf(student);
    setEditingId(student._id);
    setForm({
      fullName: student.fullName,
      studentCode: student.studentCode,
      classRoom: student.classRoom?._id || "",
      parentName: parent?.fullName === "Parent" ? "" : parent?.fullName || "",
      parentPhone: parent?.phone || "",
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!form.fullName.trim() || !form.studentCode.trim()) return notify(t("Not completed"), t("Enter the student name and student code."), "bad");
    if (!form.classRoom) return notify(t("Not completed"), t("Choose a class first."), "bad");
    if (!form.parentPhone.trim()) return notify(t("Not completed"), t("Enter the parent phone. That number receives the messages."), "bad");
    const body = {
      fullName: form.fullName.trim(),
      studentCode: form.studentCode.trim(),
      classRoom: form.classRoom,
      guardians: [{ relation: "guardian", fullName: form.parentName.trim() || "Parent", phone: form.parentPhone.trim(), isPrimary: true }],
    };
    const ok = await act(async () => {
      if (editingId) await api(`/students/${editingId}`, { method: "PATCH", token, body });
      else await api("/students", { method: "POST", token, body });
      await load();
    }, editingId ? t("Student updated") : t("Student registered"), t("The parent phone is saved for messages."));
    if (ok) {
      setEditingId(null);
      setForm((current) => ({ ...empty, classRoom: current.classRoom }));
    }
  }

  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={save}>
        <h2>{editingId ? "Update student" : "Register student"}</h2>
        <Field label="Student name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
        <Field label="Student code" value={form.studentCode} onChange={(value) => setForm({ ...form, studentCode: value })} />
        <label className="field">Assigned class
          <select value={form.classRoom} onChange={(event) => setForm({ ...form, classRoom: event.target.value })}>
            <option value="">{t("Choose a class")}</option>
            {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
          </select>
        </label>
        <Field label="Parent name" value={form.parentName} onChange={(value) => setForm({ ...form, parentName: value })} />
        <Field label="Parent telephone" value={form.parentPhone} onChange={(value) => setForm({ ...form, parentPhone: value })} placeholder="250780000000" />
        <div className="actions">
          <button className="solid" type="submit">{editingId ? "Save changes" : "Register student"}</button>
          {editingId ? <button className="ghost" type="button" onClick={() => { setEditingId(null); setForm((current) => ({ ...empty, classRoom: current.classRoom })); }}>{t("Cancel")}</button> : null}
        </div>
      </form>
      <section className="roster">
        <header className="roster-head">
          <div>
            <p className="kicker"><Icon name="graduate" /> {t("Class register")}</p>
            <h2>{t("Registered students")}</h2>
          </div>
          <strong className="roster-count">{items.length}</strong>
        </header>
        {items.length === 0 ? <p className="muted roster-empty">{t("No students in your classes yet.")}</p> : (
          <div className="table-wrap roster-table">
            <table>
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Student")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Student code")}</th>
                  <th>{t("Parent telephone")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((student, index) => {
                  const parent = parentOf(student);
                  return (
                    <tr key={student._id} className={editingId === student._id ? "on" : ""}>
                      <td data-label="No."><span className="roster-no">{index + 1}</span></td>
                      <td data-label="Student" className="roster-name">{student.fullName}</td>
                      <td data-label="Class"><span className="roster-pill">{student.classRoom?.name || t("No class")}</span></td>
                      <td data-label={t("Student code")} className="roster-code">{student.studentCode}</td>
                      <td data-label={t("Parent telephone")} className="roster-phone">{parent?.phone || t("No phone")}</td>
                      <td data-label="Actions">
                        <div className="roster-actions">
                          <button className="ghost" type="button" onClick={() => beginEdit(student)}>{t("Update")}</button>
                          <button className="danger" type="button" onClick={async () => {
                            if (!window.confirm(t("Remove {name} from this class list?", { name: student.fullName }))) return;
                            const ok = await act(() => api(`/students/${student._id}`, { method: "DELETE", token }).then(load), t("Student removed"), `${student.fullName} is no longer on the class list.`);
                            if (ok && editingId === student._id) setEditingId(null);
                          }}>{t("Delete")}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function subjectRows(room, schoolSubjects) {
  const onClass = (room?.subjects || []).map((row) => row.subject).filter((subject) => subject?._id);
  return onClass.length ? onClass : schoolSubjects;
}

function StaffDesk({ token }) {
  const categories = ["teacher", "discipline", "leadership", "support"];
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectIds, setSubjectIds] = useState([]);
  const blank = { fullName: "", email: "", phone: "", password: "Staff@123", roleTitle: "Teacher", category: "teacher", qualifications: "", classRoom: "" };
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [passwordAgain, setPasswordAgain] = useState("Staff@123");

  async function load() {
    const [people, rooms, subjectData] = await Promise.all([
      api("/staff", { token }),
      api("/academics/classes", { token }).catch(() => ({ items: [] })),
      api("/academics/subjects", { token }).catch(() => ({ items: [] })),
    ]);
    setItems(people.items || []);
    setClasses(rooms.items || []);
    setSubjects(subjectData.items || []);
    setForm((current) => ({ ...current, classRoom: current.classRoom || rooms.items?.[0]?._id || "" }));
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  const listed = subjectRows(classes.find((room) => room._id === form.classRoom), subjects);

  function resetForm() {
    setEditingId(null);
    setForm(blank);
    setPasswordAgain("Staff@123");
    setSubjectIds([]);
  }

  function beginEdit(member) {
    const managed = classes.find((room) => (room.classTeacher?._id || room.classTeacher) === member._id);
    const classRoom = managed?._id || member.classes?.[0]?._id || "";
    setEditingId(member._id);
    setForm({
      fullName: member.fullName || "",
      email: member.email || member.user?.email || "",
      phone: member.phone || member.whatsapp || "",
      password: "",
      roleTitle: member.roleTitle || "",
      category: member.category || "teacher",
      qualifications: member.qualifications || "",
      classRoom,
    });
    setPasswordAgain("");
    setSubjectIds((member.subjects || []).map((subject) => subject._id));
  }

  async function assignTeacher(staffId) {
    const picked = listed.filter((subject) => subjectIds.includes(subject._id));
    if (form.category !== "teacher" || !form.classRoom) {
      const previous = classes.filter((room) => (room.classTeacher?._id || room.classTeacher) === staffId);
      await Promise.all(previous.map((room) => api(`/academics/classes/${room._id}`, { method: "PATCH", token, body: { classTeacher: null } })));
      return;
    }
    const previous = classes.filter((room) => (room.classTeacher?._id || room.classTeacher) === staffId && room._id !== form.classRoom);
    await Promise.all(previous.map((room) => api(`/academics/classes/${room._id}`, { method: "PATCH", token, body: { classTeacher: null } })));
    await api(`/academics/classes/${form.classRoom}`, { method: "PATCH", token, body: { classTeacher: staffId } });
    const room = classes.find((item) => item._id === form.classRoom);
    const dropped = (room?.subjects || []).filter((row) => (row.teacher?._id || row.teacher) === staffId && !subjectIds.includes(row.subject?._id));
    await Promise.all([
      ...picked.map((subject) => api(`/academics/classes/${form.classRoom}/assign`, { method: "POST", token, body: { subjectId: subject._id, teacherId: staffId } })),
      ...dropped.map((row) => api(`/academics/classes/${form.classRoom}/assign`, { method: "POST", token, body: { subjectId: row.subject._id, teacherId: null } })),
    ]);
    await api(`/staff/${staffId}`, { method: "PATCH", token, body: { subjects: picked.map((subject) => subject._id), classes: [form.classRoom] } });
  }

  async function save(event) {
    event.preventDefault();
    const changingPassword = Boolean(form.password || passwordAgain);
    if (changingPassword && form.password !== passwordAgain) return notify(t("Passwords do not match"), t("Type the same password in both fields."), "bad");
    if (!editingId && !form.password) return notify(t("Password required"), t("Set a password and confirm it."), "bad");
    if (form.category === "teacher" && classes.length && !form.classRoom) return notify(t("Choose a class"), t("Select the class this teacher will manage."), "bad");
    const body = { fullName: form.fullName, email: form.email, phone: form.phone, roleTitle: form.roleTitle, category: form.category, qualifications: form.qualifications, whatsapp: form.phone };
    if (form.password) body.password = form.password;
    const ok = await act(async () => {
      if (editingId) {
        await api(`/staff/${editingId}`, { method: "PATCH", token, body });
        await assignTeacher(editingId);
      } else {
        const created = await api("/staff", { method: "POST", token, body });
        await assignTeacher(created.staff._id);
      }
      await load();
    }, editingId ? t("Staff updated") : form.category === "teacher" ? t("Teacher registered") : t("Staff created"), editingId ? t("The account, class, and subjects are saved.") : t("They can sign in with the email and password you set."));
    if (ok) resetForm();
  }

  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={save}>
        <h2>{editingId ? "Update staff" : "New account"}</h2>
        <Field label="Full name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
        <Field label="Role title" value={form.roleTitle} onChange={(value) => setForm({ ...form, roleTitle: value })} />
        <div className="chips span">{categories.map((item) => <button type="button" key={item} className={form.category === item ? "on" : ""} onClick={() => setForm({ ...form, category: item })}>{item}</button>)}</div>
        <Field label="Email (login)" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Field label="Phone / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="250788000000" />
        <Field label={editingId ? "New password" : "Password"} type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder={editingId ? "Leave blank to keep the current password" : ""} />
        <Field label="Confirm password" type="password" value={passwordAgain} onChange={setPasswordAgain} placeholder={editingId ? "Leave blank to keep the current password" : ""} />
        <Field label="Qualifications" value={form.qualifications} onChange={(value) => setForm({ ...form, qualifications: value })} />
        {form.category === "teacher" ? (
          <>
            <label className="field span">Class this teacher manages
              <select value={form.classRoom} onChange={(event) => { setForm({ ...form, classRoom: event.target.value }); setSubjectIds([]); }}>
                <option value="">{t("Choose a class")}</option>
                {classes.map((room) => <option key={room._id} value={room._id}>{room.name}{room.classTeacher?.fullName ? ` · ${room.classTeacher.fullName}` : ""}</option>)}
              </select>
            </label>
            {classes.length === 0 ? <p className="muted span">{t("Create the class first. The class teacher is chosen here, not on the class form.")}</p> : null}
            <div className="span">
              <p className="kicker">{t("Subjects in this class")}</p>
              <div className="chips">
                {listed.map((subject) => (
                  <button type="button" key={subject._id} className={subjectIds.includes(subject._id) ? "on" : ""} onClick={() => setSubjectIds((current) => current.includes(subject._id) ? current.filter((id) => id !== subject._id) : [...current, subject._id])}>{subject.name}</button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        <div className="actions">
          <button className="solid" type="submit">{editingId ? "Save changes" : form.category === "teacher" ? "Register and assign teacher" : "Register staff member"}</button>
          {editingId ? <button className="ghost" type="button" onClick={resetForm}>{t("Cancel")}</button> : null}
        </div>
      </form>
      <div className="card-grid">
        {items.map((member) => {
          const managed = classes.filter((room) => (room.classTeacher?._id || room.classTeacher) === member._id);
          const savedClasses = (member.classes || []).filter((room) => !managed.some((item) => item._id === (room._id || room)));
          const classNames = [...managed.map((room) => `${room.name}${room.academicYear ? ` (${room.academicYear})` : ""}`), ...savedClasses.map((room) => room.name || "Class")];
          const taught = classes.flatMap((room) => (room.subjects || []).filter((row) => (row.teacher?._id || row.teacher) === member._id).map((row) => `${row.subject?.name || "Subject"} · ${room.name}`));
          const subjectNames = member.subjects?.length ? member.subjects.map((subject) => subject.name).join(", ") : t("None selected");
          return (
            <article key={member._id} className="panel sections">
              <p className="kicker">{member.category || "staff"}</p>
              <h2>{member.fullName}</h2>
              <p><strong>{t("Role title.")}</strong> {member.roleTitle || t("Not given")}</p>
              <p><strong>{t("Email.")}</strong> {member.email || member.user?.email || t("Not given")}</p>
              <p><strong>{t("Phone / WhatsApp.")}</strong> {member.phone || member.whatsapp || t("Not given")}</p>
              <p><strong>{t("Qualifications.")}</strong> {member.qualifications || t("Not given")}</p>
              <p><strong>{t("Login.")}</strong> {member.user?.email ? t("Password saved. It is not shown again.") : t("No login account")}</p>
              <p><strong>{t("Class.")}</strong> {classNames.length ? classNames.join(", ") : t("No class yet")}</p>
              <p><strong>{t("Subjects.")}</strong> {subjectNames}</p>
              {taught.length ? <p><strong>{t("Teaching.")}</strong> {taught.join("; ")}</p> : null}
              <p className="muted">{member.visibility || "draft"}</p>
              <div className="actions">
                <button className="ghost" type="button" onClick={() => beginEdit(member)}>{t("Update")}</button>
                <button className="danger" type="button" onClick={() => {
                  if (!window.confirm(t("Remove {name}? They will no longer be able to sign in.", { name: member.fullName }))) return;
                  act(() => api(`/staff/${member._id}`, { method: "DELETE", token }).then(load), t("Staff removed"), `${member.fullName} is no longer on the staff list.`).then((ok) => { if (ok && editingId === member._id) resetForm(); });
                }}>{t("Delete")}</button>
                {member.visibility === "pending" ? <button className="solid" type="button" onClick={() => act(() => api(`/staff/${member._id}/approve`, { method: "POST", token }).then(load), "Published", `${member.fullName} is now visible on the school website.`)}>{t("Approve for public website")}</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Classes({ token }) {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjectName, setSubjectName] = useState("");
  const [picked, setPicked] = useState([]);
  const [className, setClassName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [editingId, setEditingId] = useState(null);

  async function load() {
    const [subjectData, classData] = await Promise.all([
      api("/academics/subjects", { token }),
      api("/academics/classes", { token }),
    ]);
    setSubjects(subjectData.items || []);
    setClasses(classData.items || []);
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  function resetForm() {
    setEditingId(null);
    setClassName("");
    setSubjectName("");
    setPicked([]);
    setYear(String(new Date().getFullYear()));
  }

  function beginEdit(room) {
    setEditingId(room._id);
    setClassName(room.name || "");
    setYear(room.academicYear || String(new Date().getFullYear()));
    setSubjectName("");
    setPicked((room.subjects || []).map((row) => row.subject).filter((subject) => subject?.name));
  }

  function addSubject() {
    const name = subjectName.trim();
    if (!name) return notify(t("Add a subject"), t("Type the subject name, then add it to this class."), "bad");
    if (picked.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setSubjectName("");
      return;
    }
    const existing = subjects.find((item) => item.name.toLowerCase() === name.toLowerCase());
    setPicked((current) => [...current, existing || { name }]);
    setSubjectName("");
  }

  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={(event) => {
        event.preventDefault();
        const pending = subjectName.trim();
        const draft = pending && !picked.some((item) => item.name.toLowerCase() === pending.toLowerCase())
          ? [...picked, subjects.find((item) => item.name.toLowerCase() === pending.toLowerCase()) || { name: pending }]
          : picked;
        if (!className.trim()) return notify(t("Class name"), t("Enter the class name."), "bad");
        if (!draft.length) return notify(t("Add the subjects"), t("Add at least one subject before saving the class."), "bad");
        act(async () => {
          const ids = [];
          for (const subject of draft) {
            let id = subject._id;
            if (!id) {
              const made = await api("/academics/subjects", { method: "POST", token, body: { name: subject.name } });
              id = made.item._id;
            }
            ids.push(id);
          }
          if (editingId) {
            await api(`/academics/classes/${editingId}`, { method: "PATCH", token, body: { name: className.trim(), academicYear: year, subjectIds: ids } });
          } else {
            const created = await api("/academics/classes", { method: "POST", token, body: { name: className.trim(), academicYear: year } });
            await api(`/academics/classes/${created.item._id}`, { method: "PATCH", token, body: { subjectIds: ids } });
          }
          await load();
        }, editingId ? t("Class updated") : t("Class created"), `${className.trim()}: ${draft.map((subject) => subject.name).join(", ")}.`).then((ok) => { if (ok) resetForm(); });
      }}>
        <h2>{editingId ? "Update class" : "Classes"}</h2>
        <Field label="Class name" value={className} onChange={setClassName} placeholder={t("S6 PCM")} />
        <Field label="Academic year" value={year} onChange={setYear} />
        <Field label="Subject" value={subjectName} onChange={setSubjectName} placeholder={t("Mathematics")} />
        <button className="ghost" type="button" onClick={addSubject}>{t("Add subject")}</button>
        <div className="span">
          <p className="kicker">{t("Subjects on this class")}</p>
          {picked.length === 0 ? <p className="muted">{t("No subjects added yet.")}</p> : null}
          <div className="chips">
            {picked.map((subject) => (
              <button type="button" key={subject._id || subject.name} className="on" onClick={() => setPicked((current) => current.filter((item) => item.name !== subject.name))}>{subject.name}</button>
            ))}
          </div>
          {subjects.some((subject) => !picked.some((item) => item.name.toLowerCase() === subject.name.toLowerCase())) ? <p className="kicker">{t("Already in the school")}</p> : null}
          <div className="chips">
            {subjects.filter((subject) => !picked.some((item) => item.name.toLowerCase() === subject.name.toLowerCase())).map((subject) => (
              <button type="button" key={subject._id} onClick={() => setPicked((current) => [...current, subject])}>{subject.name}</button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="solid" type="submit">{editingId ? "Save changes" : "Add class"}</button>
          {editingId ? <button className="ghost" type="button" onClick={resetForm}>{t("Cancel")}</button> : null}
        </div>
      </form>
      {classes.map((room) => (
        <article key={room._id} className="panel sections">
          <h2>{room.name}</h2>
          <p className="muted">{room.academicYear} · {room.classTeacher?.fullName || "No teacher yet. Choose one when you register a teacher."}</p>
          <p>{(room.subjects || []).map((row) => row.subject?.name || "Subject").join(" · ") || "No subjects on this class yet."}</p>
          <div className="actions">
            <button className="ghost" type="button" onClick={() => beginEdit(room)}>{t("Update")}</button>
            <button className="danger" type="button" onClick={() => {
              if (!window.confirm(t("Remove {name}? It will leave the class list. Students already registered stay on their records.", { name: room.name }))) return;
              act(() => api(`/academics/classes/${room._id}`, { method: "DELETE", token }).then(load), t("Class removed"), `${room.name} is no longer on the class list.`).then((ok) => { if (ok && editingId === room._id) resetForm(); });
            }}>{t("Delete")}</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const PERIODS = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
  { id: "all", label: "All dates" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function kigaliParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return { year: Number(read("year")), month: Number(read("month")), day: Number(read("day")), weekday: read("weekday") };
}

function periodRange(period) {
  const { year, month, day, weekday } = kigaliParts();
  const today = `${year}-${pad2(month)}-${pad2(day)}`;
  if (period === "day") return { from: today, to: today };
  if (period === "week") {
    const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] ?? 0;
    const start = new Date(Date.UTC(year, month - 1, day));
    start.setUTCDate(start.getUTCDate() - back);
    return { from: `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-${pad2(start.getUTCDate())}`, to: today };
  }
  if (period === "month") return { from: `${year}-${pad2(month)}-01`, to: today };
  if (period === "year") return { from: `${year}-01-01`, to: today };
  return { from: "", to: "" };
}

function dayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function prettyKey(key) {
  if (!key) return "";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function rangeLabel(period, from, to) {
  if (period === "day") return `Daily · ${prettyKey(from)}`;
  if (period === "week") return `Weekly · ${prettyKey(from)} – ${prettyKey(to)}`;
  if (period === "month") return `Monthly · ${prettyKey(from)} – ${prettyKey(to)}`;
  if (period === "year") return `Yearly · ${prettyKey(from)} – ${prettyKey(to)}`;
  if (from && to) return `${prettyKey(from)} – ${prettyKey(to)}`;
  if (from) return `From ${prettyKey(from)}`;
  if (to) return `To ${prettyKey(to)}`;
  return t("All dates");
}

function reportIsFiltered({ classId, fromDate, toDate, search }) {
  return Boolean(classId || fromDate || toDate || String(search || "").trim());
}

function highlightName(name, query) {
  const needle = query.trim();
  if (!needle) return name;
  const index = name.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + needle.length)}</mark>
      {name.slice(index + needle.length)}
    </>
  );
}

function NameField({ label, value, onChange, names, placeholder, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = value.trim().toLowerCase();
  const matches = useMemo(() => names
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const rank = (item) => (query && item.name.toLowerCase().startsWith(query) ? 0 : 1);
      const byRank = rank(a) - rank(b);
      return byRank || a.name.localeCompare(b.name);
    })
    .slice(0, 8), [names, query]);

  function pick(item) {
    onChange(item.name);
    onPick?.(item);
    setOpen(false);
  }

  return (
    <label className="field name-field">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && matches[active]) {
            event.preventDefault();
            pick(matches[active]);
          } else if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
      />
      {open && matches.length ? (
        <ul className="name-menu" role="listbox">
          {matches.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === active} className={index === active ? "on" : ""} onMouseDown={(event) => { event.preventDefault(); pick(item); }}>
              <strong>{highlightName(item.name, query)}</strong>
              {item.detail ? <span>{item.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open && query && !matches.length ? <p className="name-empty">{t("No student with that name")}</p> : null}
    </label>
  );
}

function ReportBar({ extra, period, onPeriod, fromDate, onFrom, toDate, onTo, search, onSearch, names, onPick }) {
  return (
    <div className="report-filters no-print">
      {extra}
      <div className="chips">
        {PERIODS.map((item) => (
          <button key={item.id} type="button" className={period === item.id ? "on" : ""} onClick={() => onPeriod(item.id)}>{t(item.label)}</button>
        ))}
      </div>
      <Field label="From" type="date" value={fromDate} onChange={onFrom} />
      <Field label="To" type="date" value={toDate} onChange={onTo} />
      <NameField label="Student" value={search} onChange={onSearch} names={names} placeholder={t("Type a student name")} onPick={onPick} />
    </div>
  );
}

function AssessGraphic() {
  return (
    <svg className="assess-crest" viewBox="0 0 280 150" role="img" aria-label={t("A teacher recording marks")}>
      <rect x="8" y="12" width="264" height="126" rx="24" fill="#e3f2fd" />
      <rect x="24" y="28" width="148" height="96" rx="16" fill="#ffffff" />
      <path d="M40 52h72M40 70h56M40 88h64" fill="none" stroke="#90caf9" strokeWidth="6" strokeLinecap="round" />
      <text x="168" y="78" fill="#0D47A1" fontSize="28" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94</text>
      <text x="210" y="78" fill="#1565C0" fontSize="14" fontWeight="700" fontFamily="Instrument Sans, sans-serif">/100</text>
      <g className="assess-pen">
        <rect x="196" y="88" width="52" height="22" rx="11" fill="#1565C0" />
        <path d="M208 99h28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Marks({ token, school }) {
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [title, setTitle] = useState("Periodic test");
  const [maxScore, setMaxScore] = useState("100");
  const [assessmentDate, setAssessmentDate] = useState(isoDay(new Date()));
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [history, setHistory] = useState([]);
  const [historyClassId, setHistoryClassId] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [period, setPeriod] = useState("all");
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportTerm, setReportTerm] = useState("1");
  const [reportStudentId, setReportStudentId] = useState("");
  const [official, setOfficial] = useState(null);
  const [orientation, setOrientation] = useState("portrait");

  async function load() {
    const [sheet, rooms] = await Promise.all([
      api("/marks/assessments", { token }),
      api("/academics/classes?scope=all", { token }),
    ]);
    setAssessments(sheet.items || []);
    setClasses(rooms.items || []);
    setClassId((current) => current || rooms.items?.[0]?._id || "");
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);
  useEffect(() => {
    const ids = historyClassId ? [historyClassId] : classes.map((item) => item._id);
    if (!ids.length) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all(ids.map((id) => api(`/marks/classes/${id}/history`, { token })))
      .then((pages) => { if (!cancelled) setHistory(pages.flatMap((page) => page.items || [])); })
      .catch((err) => { if (!cancelled) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancelled = true; };
  }, [historyClassId, classes, token, assessments]);
  useEffect(() => {
    if (!selected) return;
    const assessment = assessments.find((item) => item._id === selected);
    const query = assessment?.classRoom?._id ? `?classRoom=${assessment.classRoom._id}` : "";
    Promise.all([api(`/marks/assessments/${selected}/marks`, { token }), api(`/students${query}`, { token })]).then(([sheet, roster]) => {
      const next = {};
      const nextComments = {};
      (sheet.items || []).forEach((row) => {
        next[row.student._id] = String(row.score);
        nextComments[row.student._id] = row.comment || "";
      });
      setMarks(next);
      setComments(nextComments);
      setStudents(roster.items || []);
    }).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [selected, token]);

  const room = classes.find((item) => item._id === classId);
  const listed = useMemo(() => (
    (room?.subjects || []).map((row) => row.subject).filter((subject) => subject?._id && subject?.name)
  ), [room]);

  useEffect(() => {
    const ids = listed.map((item) => String(item._id));
    if (!ids.length) {
      if (subjectId) setSubjectId("");
      return;
    }
    if (!ids.includes(String(subjectId))) setSubjectId(ids[0]);
  }, [listed, subjectId]);

  function notifyParents(id) {
    track((async () => {
      try {
        const sent = await api(`/marks/assessments/${id}/notify-parents`, { method: "POST", token });
        const line = sent.message || t("The marks were sent to the parent phones.");
        notify(line.startsWith(t("Sent to")) ? t("Parents notified") : t("Some messages were not sent"), line, line.startsWith(t("Sent to")) ? "ok" : "bad");
      } catch (err) {
        notify(t("Not completed"), err instanceof Error ? err.message : t("Could not send this message"), "bad");
      }
    })());
  }

  async function saveAssessment(event) {
    event.preventDefault();
    const over = Number(maxScore);
    if (!classId || !subjectId) return notify(t("Not completed"), t("Choose a class and a subject first"), "bad");
    const chosen = listed.find((item) => String(item._id) === String(subjectId));
    if (!chosen) return notify(t("Not completed"), t("Choose a subject that is on this class."), "bad");
    if (!Number.isFinite(over) || over <= 0) return notify(t("Not completed"), t("Set the mark the assessment is over, for example 100"), "bad");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate)) return notify(t("Not completed"), t("Set the assessment date as year-month-day, for example 2026-10-16"), "bad");
    const body = { title, classRoom: classId, subject: chosen._id, maxScore: over, date: assessmentDate, term: "1", academicYear: String(new Date().getFullYear()) };
    const ok = await act(async () => {
      if (editingId) await api(`/marks/assessments/${editingId}`, { method: "PATCH", token, body });
      else {
        const created = await api("/marks/assessments", { method: "POST", token, body });
        setSelected(created.assessment._id);
      }
      await load();
    }, editingId ? t("Assessment updated") : t("Assessment created"), editingId ? `${title} is now over ${over}.` : t("Open it to enter marks and comments."));
    if (ok) setEditingId(null);
  }

  function choosePeriod(id) {
    const range = periodRange(id);
    setPeriod(id);
    setFromDate(range.from);
    setToDate(range.to);
  }

  const historyClass = classes.find((item) => item._id === historyClassId);
  const nameOptions = history.map((row) => ({ id: row.student._id, name: row.student.fullName, detail: row.student.studentCode || historyClass?.name || "" }));
  const datesFlipped = Boolean(fromDate && toDate && fromDate > toDate);
  const query = search.trim().toLowerCase();
  const reportRows = datesFlipped ? [] : history.flatMap((row) => {
    if (query && !row.student.fullName.toLowerCase().includes(query)) return [];
    return (row.marks || []).flatMap((mark) => {
      const day = dayKey(mark.assessment?.date || mark.createdAt);
      if (fromDate && (!day || day < fromDate)) return [];
      if (toDate && (!day || day > toDate)) return [];
      const total = mark.assessment?.maxScore ?? 100;
      return [{
        id: mark._id,
        day,
        student: row.student.fullName,
        subject: mark.assessment?.subject?.name || "Subject",
        title: mark.assessment?.title || "Assessment",
        score: mark.score,
        total,
        comment: mark.comment || "",
      }];
    });
  }).sort((a, b) => (b.day || "").localeCompare(a.day || "") || a.student.localeCompare(b.student));
  const average = reportRows.length
    ? Math.round(reportRows.reduce((sum, row) => sum + (Number(row.score) / Number(row.total || 1)) * 100, 0) / reportRows.length)
    : 0;

  function openOfficial() {
    if (!reportIsFiltered({ classId: historyClassId, fromDate, toDate, search })) {
      notify(t("Choose a filter"), t("Select a class, or set the dates or a student name, before printing."), "bad");
      return;
    }
    const typed = nameOptions.filter((item) => item.name.toLowerCase() === search.trim().toLowerCase());
    const student = reportStudentId || (typed.length === 1 ? typed[0].id : "");
    if (search.trim() && !student) {
      notify(t("Choose a student"), t("Pick the name from the suggestions, or clear the box to include the whole class."), "bad");
      return;
    }
    if (!historyClassId && !student) {
      notify(t("Choose a class or a student"), t("The academic report needs a class or a student. A date range prints on the register."), "bad");
      return;
    }
    if (!reportYear.trim() || !reportTerm) {
      notify(t("Choose the report"), t("Enter the academic year and the term."), "bad");
      return;
    }
    const query = new URLSearchParams({ academicYear: reportYear.trim(), term: reportTerm });
    if (historyClassId) query.set("classRoom", historyClassId);
    if (student) query.set("student", student);
    track(api(`/marks/report?${query}`, { token }))
      .then((data) => {
        setOfficial(data);
        notify(t("Report ready"), t("Review the preview, then print or save the PDF."));
      })
      .catch((err) => notify(t("Not completed"), err.message, "bad"));
  }

  const openAssessment = assessments.find((item) => item._id === selected);
  return (
    <div className="sections assess">
      <WalletBanner token={token} className="no-print" />
      <form className="panel form-grid assess-create no-print" onSubmit={saveAssessment}>
        <header className="assess-head">
          <span className="assess-mark"><Icon name="pen" /></span>
          <div>
            <p className="kicker"><Icon name="book" />{t("My class")}</p>
            <h2>{editingId ? "Edit assessment" : "New assessment"}</h2>
          </div>
          <AssessGraphic />
        </header>
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Over" value={maxScore} onChange={setMaxScore} />
        <Field label="Assessment date" value={assessmentDate} onChange={setAssessmentDate} placeholder="2026-10-16" />
        <label className="field">Class
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">Subject
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {listed.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
            {listed.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </label>
        <div className="actions">
          <button className="solid" type="submit"><Icon name="pen" />{editingId ? "Save changes" : "Create assessment"}</button>
          {editingId ? <button className="ghost" type="button" onClick={() => setEditingId(null)}>{t("Cancel edit")}</button> : null}
        </div>
      </form>
      <div className="assess-board no-print">
        {assessments.map((item) => (
          <article key={item._id} className={`assess-card${selected === item._id ? " on" : ""}`}>
            <div className="assess-art">
              <span className="assess-mark"><Icon name="pen" /></span>
              <strong>{item.maxScore}</strong>
              <span>{t("over")}</span>
            </div>
            <div className="assess-copy">
              <h2>{item.title}</h2>
              <ul className="assess-facts">
                <li><Icon name="book" />{item.subject?.name || "Subject"}</li>
                <li><Icon name="graduate" />{item.classRoom?.name || "Class"}</li>
                {item.date ? <li><Icon name="calendar" />{isoDay(new Date(item.date))}</li> : null}
              </ul>
              <div className="actions">
                <button className="ghost" type="button" onClick={() => setSelected(item._id)}><Icon name="book" />{selected === item._id ? "Selected" : t("Open marks")}</button>
                <button className="solid" type="button" onClick={() => notifyParents(item._id)}><Icon name="message" />{t("Notify parents")}</button>
                <button className="ghost" type="button" onClick={() => { setEditingId(item._id); setTitle(item.title); setMaxScore(String(item.maxScore)); setAssessmentDate(item.date ? isoDay(new Date(item.date)) : isoDay(new Date())); if (item.classRoom?._id) setClassId(item.classRoom._id); if (item.subject?._id) setSubjectId(item.subject._id); }}><Icon name="pen" />{t("Edit")}</button>
                <button className="danger" type="button" onClick={() => {
                  if (!window.confirm(t("Delete {name}? The saved marks will be removed too.", { name: item.title }))) return;
                  act(async () => {
                    await api(`/marks/assessments/${item._id}`, { method: "DELETE", token });
                    if (selected === item._id) setSelected(null);
                    await load();
                  }, t("Assessment deleted"), `${item.title} and its marks were removed.`);
                }}>{t("Delete")}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {selected ? (
        <section className="roster assess-sheet no-print">
          <header className="roster-head">
            <div>
              <p className="kicker"><Icon name="graduate" />{t("Sheet")}</p>
              <h2>{t("Students and parent phones")}</h2>
              {openAssessment ? <p className="muted">{openAssessment.title} · {openAssessment.subject?.name || "Subject"} · {openAssessment.classRoom?.name || "Class"}</p> : null}
              <p className="muted">{t("Save the sheet first. Notify parents after it is saved.")}</p>
            </div>
            <span className="roster-count">{students.length}</span>
          </header>
          <table className="board roster-table">
            <thead>
              <tr><th>{t("No.")}</th><th>{t("Student")}</th><th>{t("Parent phone")}</th><th>{t("Marks")}</th><th>{t("Comment")}</th></tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <tr key={student._id}>
                  <td data-label="No."><span className="roster-no">{index + 1}</span></td>
                  <td data-label="Student" className="roster-name">{student.fullName}</td>
                  <td data-label="Parent phone" className="roster-phone">{parentOf(student)?.phone || "No phone"}</td>
                  <td data-label="Marks"><input aria-label={t("Marks")} inputMode="decimal" value={marks[student._id] || ""} onChange={(event) => setMarks({ ...marks, [student._id]: event.target.value })} /></td>
                  <td data-label="Comment"><input aria-label={t("Comment")} value={comments[student._id] || ""} onChange={(event) => setComments({ ...comments, [student._id]: event.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions assess-save">
            <button className="solid" type="button" onClick={() => act(() => api(`/marks/assessments/${selected}/marks`, { method: "POST", token, body: { marks: students.map((student) => ({ studentId: student._id, score: Number(marks[student._id] || 0), comment: comments[student._id] })) } }), "Sheet saved", "Marks and comments are stored. You can notify parents now.")}><Icon name="check" />{t("Save sheet")}</button>
            <button className="solid" type="button" onClick={() => notifyParents(selected)}><Icon name="message" />{t("Notify parents")}</button>
          </div>
        </section>
      ) : null}
      <section className="sections">
        <ReportBar
          period={period}
          onPeriod={choosePeriod}
          fromDate={fromDate}
          onFrom={(value) => { setPeriod("custom"); setFromDate(value); }}
          toDate={toDate}
          onTo={(value) => { setPeriod("custom"); setToDate(value); }}
          search={search}
          onSearch={(value) => { setSearch(value); setReportStudentId(""); }}
          names={nameOptions}
          onPick={(item) => setReportStudentId(item.id)}
          extra={(
            <label className="field">Class
              <select value={historyClassId} onChange={(event) => setHistoryClassId(event.target.value)}>
                <option value="">{t("Select a class")}</option>
                {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
          )}
        />
        <div className="report-filters no-print">
          <Field label="Academic year" value={reportYear} onChange={setReportYear} placeholder="2026" />
          <label className="field">Term
            <select value={reportTerm} onChange={(event) => setReportTerm(event.target.value)}>
              <option value="1">{t("Term 1")}</option>
              <option value="2">{t("Term 2")}</option>
              <option value="3">{t("Term 3")}</option>
              <option value="annual">{t("Annual")}</option>
            </select>
          </label>
          <button className="solid" type="button" onClick={openOfficial}><Icon name="award" />{t("Academic performance report")}</button>
        </div>
        <div className="roster report-sheet">
          <ReportLogos school={school} />
          <header className="roster-head">
            <div>
              <p className="kicker"><Icon name="award" />{t("IshuriApp")}</p>
              <h2>{t("Assessment report")}</h2>
              <p className="muted">{school?.name || "School"} · {historyClass?.name || "All classes"} · {rangeLabel(period, fromDate, toDate)}{query ? ` · ${search.trim()}` : ""}</p>
              <p className="muted">{reportRows.length === 1 ? "1 mark" : `${reportRows.length} marks`}{reportRows.length ? ` · average ${average}%` : ""}</p>
            </div>
            <button className="solid no-print" type="button" onClick={() => {
              if (!reportIsFiltered({ classId: historyClassId, fromDate, toDate, search })) {
                notify(t("Choose a filter"), t("Select a class, or set the dates or a student name, before printing."), "bad");
                return;
              }
              window.print();
            }}><Icon name="book" />{t("Print register")}</button>
          </header>
          {datesFlipped ? <p className="roster-empty">{t("Choose an end date on or after the start date.")}</p> : reportRows.length === 0 ? <p className="roster-empty">{t("No assessments in this period.")}</p> : (
            <table className="board roster-table report-table premium-table">
              <thead>
                <tr><th>{t("No.")}</th><th>{t("Date")}</th><th>{t("Student")}</th><th>{t("Subject")}</th><th>{t("Assessment")}</th><th>{t("Score")}</th><th>{t("Comment")}</th></tr>
              </thead>
              <tbody>
                {reportRows.map((row, index) => (
                  <tr key={row.id}>
                    <td data-label="No."><span className="roster-no">{index + 1}</span></td>
                    <td data-label="Date">{prettyKey(row.day)}</td>
                    <td data-label="Student" className="roster-name">{row.student}</td>
                    <td data-label="Subject">{row.subject}</td>
                    <td data-label="Assessment">{row.title}</td>
                    <td data-label="Score" className="num">{row.score == null || row.score === "" ? "—" : row.score}/{row.total}</td>
                    <td data-label="Comment">{row.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {official ? <OfficialPreview report={official} orientation={orientation} onOrientation={setOrientation} onClose={() => setOfficial(null)} /> : null}
    </div>
  );
}

const BANDS = { normal: "Normal", medium: "Medium", abnormal: "Abnormal", at_risk: t("At risk") };

function Discipline({ token, school }) {
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState([]);
  const [term, setTerm] = useState(null);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [finder, setFinder] = useState("");
  const [history, setHistory] = useState([]);
  const [historyScores, setHistoryScores] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [marksLost, setMarksLost] = useState("2");
  const [setup, setSetup] = useState({ academicYear: String(new Date().getFullYear()), term: "Term 1", maxMarks: "40", normalFrom: "30", mediumFrom: "20", abnormalFrom: "10" });
  const [reportClassId, setReportClassId] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [period, setPeriod] = useState("all");
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportTerm, setReportTerm] = useState("Term 1");
  const [reportStudentId, setReportStudentId] = useState("");
  const [official, setOfficial] = useState(null);
  const [orientation, setOrientation] = useState("portrait");

  async function loadBase() {
    const [cases, rooms, sheet, roster] = await Promise.all([
      api("/discipline", { token }),
      api("/academics/classes", { token }),
      api("/discipline/term", { token }),
      api("/students", { token }),
    ]);
    setItems(cases.items || []);
    setClasses(rooms.items || []);
    setDirectory(roster.items || []);
    setTerm(sheet.term);
    setScores(sheet.scores || []);
    if (sheet.term) {
      setSetup({
        academicYear: sheet.term.academicYear,
        term: sheet.term.term,
        maxMarks: String(sheet.term.maxMarks),
        normalFrom: String(sheet.term.normalFrom),
        mediumFrom: String(sheet.term.mediumFrom),
        abnormalFrom: String(sheet.term.abnormalFrom),
      });
    }
  }

  useEffect(() => { loadBase().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);
  useEffect(() => {
    if (!classId) return setStudents([]);
    api(`/students?classRoom=${classId}`, { token }).then((data) => setStudents(data.items || [])).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [classId, token, items]);
  useEffect(() => {
    if (!studentId) return setHistory([]);
    api(`/discipline?student=${studentId}`, { token }).then((data) => { setHistory(data.items || []); setHistoryScores(data.scores || []); }).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [studentId, token, items]);

  function scoreOf(id) { return scores.find((row) => String(row.student?._id || row.student) === String(id)); }
  const selected = students.find((item) => item._id === studentId);
  const finderQuery = finder.trim().toLowerCase();
  const shownStudents = students.filter((student) => !finderQuery || student.fullName.toLowerCase().includes(finderQuery));
  const directoryNames = directory.map((student) => ({
    id: student._id,
    name: student.fullName,
    detail: student.classRoom?.name || student.studentCode || "",
    classId: student.classRoom?._id || "",
  }));

  function choosePeriod(id) {
    const range = periodRange(id);
    setPeriod(id);
    setFromDate(range.from);
    setToDate(range.to);
  }

  const datesFlipped = Boolean(fromDate && toDate && fromDate > toDate);
  const reportQuery = search.trim().toLowerCase();
  const reportClass = classes.find((item) => item._id === reportClassId);
  const reportNames = (reportClassId ? directory.filter((student) => String(student.classRoom?._id || "") === reportClassId) : directory)
    .map((student) => ({ id: student._id, name: student.fullName, detail: student.classRoom?.name || student.studentCode || "", classId: student.classRoom?._id || "" }));
  const standing = datesFlipped ? [] : scores.filter((row) => {
    const name = row.student?.fullName || "";
    const roomId = String(row.student?.classRoom?._id || row.student?.classRoom || "");
    if (reportClassId && roomId && roomId !== reportClassId) return false;
    if (reportClassId && !roomId) {
      const known = directory.find((student) => String(student._id) === String(row.student?._id || row.student));
      if (known && String(known.classRoom?._id || "") !== reportClassId) return false;
    }
    return !reportQuery || name.toLowerCase().includes(reportQuery);
  }).sort((a, b) => (a.student?.fullName || "").localeCompare(b.student?.fullName || ""));
  const cases = datesFlipped ? [] : items.filter((item) => {
    const day = dayKey(item.occurredAt || item.createdAt);
    if (fromDate && (!day || day < fromDate)) return false;
    if (toDate && (!day || day > toDate)) return false;
    const name = item.student?.fullName || "";
    if (reportQuery && !name.toLowerCase().includes(reportQuery)) return false;
    if (!reportClassId) return true;
    const roomId = String(item.student?.classRoom?._id || "");
    if (roomId) return roomId === reportClassId;
    const known = directory.find((student) => String(student._id) === String(item.student?._id));
    return known ? String(known.classRoom?._id || "") === reportClassId : false;
  }).sort((a, b) => (dayKey(b.occurredAt || b.createdAt)).localeCompare(dayKey(a.occurredAt || a.createdAt)) || (a.student?.fullName || "").localeCompare(b.student?.fullName || ""));
  const marksTaken = cases.reduce((sum, item) => sum + Number(item.marksLost || 0), 0);
  const groupedCases = [];
  const seenCases = new Map();
  cases.forEach((item) => {
    const id = String(item.student?._id || item._id);
    if (!seenCases.has(id)) {
      const standingRow = standing.find((row) => String(row.student?._id || row.student) === id);
      const known = directory.find((student) => String(student._id) === id);
      seenCases.set(id, {
        id,
        name: item.student?.fullName || known?.fullName || "Student",
        code: item.student?.studentCode || known?.studentCode || "",
        className: item.student?.classRoom?.name || known?.classRoom?.name || "",
        remaining: standingRow ? `${standingRow.score} / ${term?.maxMarks ?? setup.maxMarks}` : (item.scoreAfter ?? "—"),
        cases: [],
      });
      groupedCases.push(seenCases.get(id));
    }
    seenCases.get(id).cases.push(item);
  });

  function openDisciplineReport() {
    if (!reportIsFiltered({ classId: reportClassId, fromDate, toDate, search })) {
      notify(t("Choose a filter"), t("Select a class, or set the dates or a student name, before printing."), "bad");
      return;
    }
    const typed = reportNames.filter((item) => item.name.toLowerCase() === search.trim().toLowerCase());
    const student = reportStudentId || (typed.length === 1 ? typed[0].id : "");
    if (search.trim() && !student) {
      notify(t("Choose a student"), t("Pick the name from the suggestions, or clear the box to include every student in the class."), "bad");
      return;
    }
    if (!reportYear.trim() || !reportTerm.trim()) {
      notify(t("Choose the report"), t("Enter the academic year and the term."), "bad");
      return;
    }
    const classRoom = reportClassId || typed[0]?.classId || "";
    const query = new URLSearchParams({ academicYear: reportYear.trim(), term: reportTerm.trim() });
    if (classRoom) query.set("classRoom", classRoom);
    if (student) query.set("student", student);
    track(api(`/discipline/report?${query}`, { token }))
      .then((data) => {
        const next = { ...data };
        if (fromDate || toDate) {
          next.items = (data.items || []).map((item) => ({
            ...item,
            incidents: (item.incidents || []).filter((incident) => {
              const day = dayKey(incident.date);
              if (fromDate && (!day || day < fromDate)) return false;
              if (toDate && (!day || day > toDate)) return false;
              return true;
            }),
          })).filter((item) => item.incidents.length);
        }
        setOfficial(next);
        notify(t("Report ready"), t("Review the preview, then print or save the PDF."));
      })
      .catch((err) => notify(t("Not completed"), err.message, "bad"));
  }

  return (
    <div className="sections">
      <WalletBanner token={token} className="no-print" />
      <form className="panel form-grid no-print" onSubmit={(event) => {
        event.preventDefault();
        act(async () => {
          const data = await api("/discipline/term", { method: "POST", token, body: { academicYear: setup.academicYear, term: setup.term, maxMarks: Number(setup.maxMarks), normalFrom: Number(setup.normalFrom), mediumFrom: Number(setup.mediumFrom), abnormalFrom: Number(setup.abnormalFrom) } });
          await loadBase();
          return data;
        }, t("Term ready"), t("Students now start at the maximum mark."));
      }}>
        <h2>{term ? `${term.maxMarks} marks this term` : "Set the term marks"}</h2>
        <Field label="Academic year" value={setup.academicYear} onChange={(value) => setSetup({ ...setup, academicYear: value })} />
        <Field label="Term" value={setup.term} onChange={(value) => setSetup({ ...setup, term: value })} />
        <Field label="Maximum marks" value={setup.maxMarks} onChange={(value) => setSetup({ ...setup, maxMarks: value })} />
        <Field label="Normal from" value={setup.normalFrom} onChange={(value) => setSetup({ ...setup, normalFrom: value })} />
        <Field label="Medium from" value={setup.mediumFrom} onChange={(value) => setSetup({ ...setup, mediumFrom: value })} />
        <Field label="Abnormal from" value={setup.abnormalFrom} onChange={(value) => setSetup({ ...setup, abnormalFrom: value })} />
        <p className="muted span">Below {setup.abnormalFrom || "0"} is at risk, including 0 and negative marks.</p>
        <button className="solid" type="submit">{t("Initialize term marks")}</button>
      </form>
      <section className="panel no-print">
        <h2>{t("Choose a class")}</h2>
        <NameField
          label="Find a student"
          value={finder}
          onChange={setFinder}
          names={directoryNames}
          placeholder={t("Type a student name")}
          onPick={(item) => {
            setFinder(item.name);
            if (item.classId) setClassId(item.classId);
            setStudentId(item.id);
          }}
        />
        <div className="chips">{classes.map((room) => <button key={room._id} type="button" className={classId === room._id ? "on" : ""} onClick={() => { setClassId(room._id); setStudentId(""); setFinder(""); }}>{room.name}</button>)}</div>
        {classId ? (
          <div className="stats" style={{ marginTop: 16 }}>
            <article><h2>{students.length}</h2><p>{t("Students")}</p></article>
            <article><h2>{students.filter((student) => scoreOf(student._id)?.band === "normal").length}</h2><p>{t("Normal")}</p></article>
            <article><h2>{students.filter((student) => scoreOf(student._id)?.band === "medium").length}</h2><p>{t("Medium")}</p></article>
            <article><h2>{students.filter((student) => scoreOf(student._id)?.band === "abnormal").length}</h2><p>{t("Abnormal")}</p></article>
            <article><h2>{students.filter((student) => scoreOf(student._id)?.band === "at_risk").length}</h2><p>{t("At risk")}</p></article>
          </div>
        ) : <p className="muted">{t("Select a class, or type a student name.")}</p>}
      </section>
      {classId ? (
        <div className="split no-print">
          <div className="sections">
            {shownStudents.length === 0 ? <p className="muted">{t("No student with that name in this class.")}</p> : shownStudents.map((student) => {
              const row = scoreOf(student._id);
              return (
                <button key={student._id} className={`choice${studentId === student._id ? " on" : ""}`} type="button" onClick={() => { setStudentId(student._id); setFinder(student.fullName); }}>
                  <strong>{student.fullName}</strong>
                  <span className="muted">{row ? `${row.score} / ${term?.maxMarks ?? setup.maxMarks} · ${BANDS[row.band]}` : t("No term mark yet")}</span>
                </button>
              );
            })}
          </div>
          {selected ? (
            <form className="panel sections" onSubmit={(event) => {
              event.preventDefault();
              act(async () => {
                const data = await api("/discipline", { method: "POST", token, body: { student: selected._id, title, description, category: "misconduct", marksLost: Number(marksLost || 0) } });
                setTitle("");
                setDescription("");
                await loadBase();
                notify(data.notified ? t("Marks subtracted and parent notified") : t("Marks subtracted"), data.message || `${selected.fullName} was updated.`, data.notified ? "ok" : "bad");
                return data;
              });
            }}>
              <h2>{selected.fullName}</h2>
              {historyScores.map((row) => <p key={row._id}>{row.term} {row.academicYear}: {row.score}{row.maxMarks != null ? ` / ${row.maxMarks}` : ""}</p>)}
              {history.map((item) => <p key={item._id}><strong>{item.title}</strong> {item.marksLost ? `−${item.marksLost}` : ""} {item.scoreAfter != null ? `· ${item.scoreAfter} left` : ""}</p>)}
              <Field label="Case title" value={title} onChange={setTitle} placeholder={t("Late to assembly")} />
              <Field label="What happened" value={description} onChange={setDescription} multiline />
              <Field label="Marks to subtract" value={marksLost} onChange={setMarksLost} />
              <button className="solid" type="submit">{t("Subtract and notify parent")}</button>
            </form>
          ) : null}
        </div>
      ) : null}
      <section className="sections">
        <ReportBar
          period={period}
          onPeriod={choosePeriod}
          fromDate={fromDate}
          onFrom={(value) => { setPeriod("custom"); setFromDate(value); }}
          toDate={toDate}
          onTo={(value) => { setPeriod("custom"); setToDate(value); }}
          search={search}
          onSearch={(value) => { setSearch(value); setReportStudentId(""); }}
          names={reportNames}
          onPick={(item) => { setReportStudentId(item.id); if (item.classId) setReportClassId(item.classId); }}
          extra={(
            <label className="field">Class
              <select value={reportClassId} onChange={(event) => setReportClassId(event.target.value)}>
                <option value="">{t("All classes")}</option>
                {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
          )}
        />
        <div className="report-filters no-print">
          <Field label="Academic year" value={reportYear} onChange={setReportYear} placeholder="2026" />
          <Field label="Term" value={reportTerm} onChange={setReportTerm} placeholder={t("Term 1")} />
          <button className="solid" type="button" onClick={openDisciplineReport}>{t("Discipline report")}</button>
        </div>
        <div className="roster report-sheet">
          <ReportLogos school={school} />
          <header className="roster-head">
            <div>
              <p className="kicker">{t("IshuriApp")}</p>
              <h2>{t("Discipline report")}</h2>
              <p className="muted">{school?.name || "School"} · {reportClass?.name || "All classes"} · {rangeLabel(period, fromDate, toDate)}{reportQuery ? ` · ${search.trim()}` : ""}</p>
              <p className="muted">{groupedCases.length === 1 ? "1 student" : `${groupedCases.length} students`} · {cases.length === 1 ? "1 case" : `${cases.length} cases`} · {marksTaken === 1 ? "1 mark" : `${marksTaken} marks`} subtracted</p>
            </div>
            <button className="solid no-print" type="button" onClick={() => {
              if (!reportIsFiltered({ classId: reportClassId, fromDate, toDate, search })) {
                notify(t("Choose a filter"), t("Select a class, or set the dates or a student name, before printing."), "bad");
                return;
              }
              window.print();
            }}>{t("Print register")}</button>
          </header>
          {datesFlipped ? <p className="roster-empty">{t("Choose an end date on or after the start date.")}</p> : groupedCases.length === 0 ? <p className="roster-empty">{t("No discipline cases in this period.")}</p> : (
            <ol className="case-register">
              {groupedCases.map((group) => (
                <li key={group.id}>
                  <div className="case-who">
                    <strong>{group.name}</strong>
                    <span>{[group.code, group.className, group.remaining === "—" ? "" : `${group.remaining} remaining`].filter(Boolean).join(" · ")}</span>
                  </div>
                  <ul>
                    {group.cases.map((item) => (
                      <li key={item._id}>
                        <strong>{prettyKey(dayKey(item.occurredAt || item.createdAt))} · {item.title}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                        <p className="case-detail">Deducted {item.marksLost || 0} · Remaining {item.scoreAfter ?? "—"} · {item.parentNotifiedAt ? "Parent notified" : "Parent not notified"}{item.reportedBy?.fullName ? ` · ${item.reportedBy.fullName}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
      {official ? <OfficialPreview report={official} orientation={orientation} onOrientation={setOrientation} onClose={() => setOfficial(null)} /> : null}
    </div>
  );
}

const TYPES = ["primary", "secondary", "tvet", "university"];
const emptyDraft = () => ({ name: "", type: "secondary", motto: "", tagline: "", about: "", history: "", vision: "", mission: "", performanceSummary: "", programs: "", facilities: "", email: "", phone: "", whatsapp: "", visitingHours: "", province: "", district: "", sector: "", address: "", establishedYear: "", studentCount: "", teacherCount: "", logoUrl: "", coverUrl: "" });

function payloadFrom(draft) {
  const num = (value) => value.trim() && !Number.isNaN(Number(value)) ? Number(value) : undefined;
  const list = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
  return {
    name: draft.name.trim(), type: draft.type, motto: draft.motto, tagline: draft.tagline, about: draft.about, history: draft.history, vision: draft.vision, mission: draft.mission, performanceSummary: draft.performanceSummary,
    programs: list(draft.programs), facilities: list(draft.facilities), email: draft.email, phone: draft.phone, whatsapp: draft.whatsapp, visitingHours: draft.visitingHours, logoUrl: draft.logoUrl, coverUrl: draft.coverUrl,
    establishedYear: num(draft.establishedYear), studentCount: num(draft.studentCount), teacherCount: num(draft.teacherCount),
    location: { province: draft.province, district: draft.district, sector: draft.sector, address: draft.address },
  };
}

function Profile({ session, onSession }) {
  const token = session.token;
  const [draft, setDraft] = useState(emptyDraft);
  const [missing, setMissing] = useState(false);
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [eventTitle, setEventTitle] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [caption, setCaption] = useState("");
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  function fill(school) {
    setDraft({
      name: school.name || "", type: school.type || "secondary", motto: school.motto || "", tagline: school.tagline || "", about: school.about || "", history: school.history || "", vision: school.vision || "", mission: school.mission || "", performanceSummary: school.performanceSummary || "",
      programs: school.programs?.join(", ") || "", facilities: school.facilities?.join(", ") || "", email: school.email || "", phone: school.phone || "", whatsapp: school.whatsapp || "", visitingHours: school.visitingHours || "",
      province: school.location?.province || "", district: school.location?.district || "", sector: school.location?.sector || "", address: school.location?.address || "",
      establishedYear: school.establishedYear ? String(school.establishedYear) : "", studentCount: school.studentCount ? String(school.studentCount) : "", teacherCount: school.teacherCount ? String(school.teacherCount) : "", logoUrl: school.logoUrl || "", coverUrl: school.coverUrl || "",
    });
  }

  async function refreshSession() {
    const data = await api("/auth/me", { token });
    const next = { ...session, user: data.user, school: data.school };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    onSession(next);
  }

  useEffect(() => {
    api("/schools/mine", { token }).then(async (data) => {
      fill(data.school);
      const [people, posted, photos] = await Promise.all([api("/staff", { token }), api("/content/events", { token }), api("/content/gallery", { token })]);
      setStaff(people.items || []);
      setEvents(posted.items || []);
      setGallery(photos.items || []);
    }).catch((err) => {
      if (/not found|403|no school/i.test(err.message)) setMissing(true);
      else notify(t("Not completed"), err.message, "bad");
    });
  }, [token]);

  async function onFile(folder, key, file) {
    if (!file) return;
    const uploaded = await act(() => uploadFile(token, folder, file), "Uploaded", t("The image is ready to save with the profile."));
    if (uploaded?.url) set(key, uploaded.url);
  }

  const fields = (
    <div className="form-grid">
      <Field label="School name" value={draft.name} onChange={(value) => set("name", value)} />
      <label className="field">{t("Type")}
        <select value={draft.type} onChange={(event) => set("type", event.target.value)}>{TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select>
      </label>
      <Field label="Motto" value={draft.motto} onChange={(value) => set("motto", value)} />
      <Field label="Tagline" value={draft.tagline} onChange={(value) => set("tagline", value)} />
      <Field label="About" value={draft.about} onChange={(value) => set("about", value)} multiline />
      <Field label="Performance summary" value={draft.performanceSummary} onChange={(value) => set("performanceSummary", value)} multiline />
      <Field label="Students" value={draft.studentCount} onChange={(value) => set("studentCount", value)} />
      <Field label="Teachers" value={draft.teacherCount} onChange={(value) => set("teacherCount", value)} />
      <Field label="Founded" value={draft.establishedYear} onChange={(value) => set("establishedYear", value)} />
      <Field label="History" value={draft.history} onChange={(value) => set("history", value)} multiline />
      <Field label="Vision" value={draft.vision} onChange={(value) => set("vision", value)} multiline />
      <Field label="Mission" value={draft.mission} onChange={(value) => set("mission", value)} multiline />
      <Field label="Programs" value={draft.programs} onChange={(value) => set("programs", value)} placeholder={t("Sciences, TVET, Languages")} />
      <Field label="Facilities" value={draft.facilities} onChange={(value) => set("facilities", value)} placeholder={t("Library, Laboratory, Pitch")} />
      <Field label="Province" value={draft.province} onChange={(value) => set("province", value)} />
      <Field label="District" value={draft.district} onChange={(value) => set("district", value)} />
      <Field label="Sector" value={draft.sector} onChange={(value) => set("sector", value)} />
      <Field label="Address" value={draft.address} onChange={(value) => set("address", value)} />
      <Field label="Email" value={draft.email} onChange={(value) => set("email", value)} />
      <Field label="Phone" value={draft.phone} onChange={(value) => set("phone", value)} placeholder="250788000000" />
      <Field label="WhatsApp" value={draft.whatsapp} onChange={(value) => set("whatsapp", value)} placeholder="250788000000" />
      <Field label="Visiting hours" value={draft.visitingHours} onChange={(value) => set("visitingHours", value)} />
    </div>
  );

  return (
    <div className="sections">
      <section className="panel sections">
        <h2>{missing ? t("Create your school") : t("School website")}</h2>
        {draft.coverUrl ? <img src={draft.coverUrl} alt="" style={{ height: 180, width: "100%", objectFit: "cover", borderRadius: 16 }} /> : null}
        <div className="actions">
          <label className="ghost">{t("Upload cover")}<input hidden type="file" accept="image/*" onChange={(event) => onFile("covers", "coverUrl", event.target.files?.[0])} /></label>
          <label className="ghost">{t("Upload logo")}<input hidden type="file" accept="image/*" onChange={(event) => onFile("logos", "logoUrl", event.target.files?.[0])} /></label>
        </div>
        {fields}
        <button className="solid" type="button" onClick={() => act(async () => {
          const data = missing
            ? await api("/schools", { method: "POST", token, body: payloadFrom(draft) })
            : await api("/schools/mine", { method: "PATCH", token, body: payloadFrom(draft) });
          fill(data.school);
          setMissing(false);
          await refreshSession();
        }, missing ? "Submitted" : "Saved", missing ? "IshuriApp will review this school." : "The school website now shows these details.")}>{missing ? "Submit for approval" : "Save website profile"}</button>
      </section>
      {!missing ? (
        <>
          <section className="panel"><h2>{t("Staff")}</h2>{staff.map((member) => <p key={member._id}><strong>{member.fullName}</strong> · {member.roleTitle} · {member.visibility === "public" ? "Visible" : "Hidden until approved"}</p>)}</section>
          <form className="panel form-grid" onSubmit={(event) => {
            event.preventDefault();
            if (!eventTitle.trim()) return notify(t("Add a title"), t("Every event needs a title."), "bad");
            act(() => api("/content/events", { method: "POST", token, body: { title: eventTitle.trim(), venue: eventVenue, startsAt: new Date().toISOString(), category: "ceremony" } }).then(async () => {
              const posted = await api("/content/events", { token });
              setEvents(posted.items || []);
            }), t("Event added"), t("It will show on the school website.")).then((ok) => { if (ok) { setEventTitle(""); setEventVenue(""); } });
          }}>
            <h2>{t("Events")}</h2>
            <Field label="Event title" value={eventTitle} onChange={setEventTitle} />
            <Field label="Venue" value={eventVenue} onChange={setEventVenue} />
            <button className="solid" type="submit">{t("Add event")}</button>
            <div className="span">{events.map((item) => <p key={item._id}><strong>{item.title}</strong> · {item.venue || "Campus"}</p>)}</div>
          </form>
          <section className="panel sections">
            <h2>{t("Gallery")}</h2>
            <Field label="Caption" value={caption} onChange={setCaption} />
            <label className="solid" style={{ justifySelf: "start" }}>{t("Upload gallery photo")}<input hidden type="file" accept="image/*" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const uploaded = await act(() => uploadFile(token, "gallery", file));
              if (!uploaded?.url) return;
              await act(async () => {
                await api("/content/gallery", { method: "POST", token, body: { imageUrl: uploaded.url, caption: caption.trim() || "Campus", album: "Campus" } });
                const photos = await api("/content/gallery", { token });
                setGallery(photos.items || []);
                setCaption("");
              }, t("Photo added"), t("It will show in the school gallery."));
            }} /></label>
            <div className="gallery">{gallery.map((photo) => (
              <div key={photo._id}>
                <img src={photo.imageUrl} alt={photo.caption || ""} />
                <button className="danger" type="button" onClick={() => act(async () => {
                  await api(`/content/gallery/${photo._id}`, { method: "DELETE", token });
                  const photos = await api("/content/gallery", { token });
                  setGallery(photos.items || []);
                }, "Photo removed", "It is no longer on the school gallery.")}>{t("Remove")}</button>
              </div>
            ))}</div>
          </section>
        </>
      ) : null}
    </div>
  );
}

const EVENT_TYPES = ["parents_meeting", "sport", "competition", "debate", "ceremony", "visiting_day", "graduation", "scholarship"];

function Publish({ token, school }) {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("parents_meeting");
  const [venue, setVenue] = useState("Campus");
  const [startsAt, setStartsAt] = useState(isoDay(new Date()));

  async function load() {
    const data = await api("/content/events", { token });
    setEvents(data.items || []);
  }
  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  return (
    <div className="sections">
      <p className="muted">{school?.type === "university" ? t("Publish scholarships, graduations, competitions and ceremonies.") : t("Publish parent meetings, sports, debates, visiting days and school advertisements.")}</p>
      <form className="panel form-grid" onSubmit={(event) => {
        event.preventDefault();
        act(() => api("/content/events", { method: "POST", token, body: { title, description: body, category, startsAt: new Date(startsAt).toISOString(), venue } }).then(load), t("Event published"), title || t("The event is on the school page.")).then((ok) => { if (ok) { setTitle(""); setBody(""); } });
      }}>
        <Field label="Title" value={title} onChange={setTitle} />
        <label className="field">Event type
          <select value={category} onChange={(event) => setCategory(event.target.value)}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        </label>
        <Field label="Details" value={body} onChange={setBody} multiline />
        <Field label="Venue" value={venue} onChange={setVenue} />
        <Field label="Date" value={startsAt} onChange={setStartsAt} />
        <button className="solid" type="submit">{t("Publish event")}</button>
      </form>
      <label className="ghost" style={{ justifySelf: "start" }}>{t("Add gallery photo")}<input hidden type="file" accept="image/*" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const uploaded = await act(() => uploadFile(token, "gallery", file));
        if (!uploaded?.url) return;
        await act(() => api("/content/gallery", { method: "POST", token, body: { imageUrl: uploaded.url, caption: title || "Campus", album: "Campus" } }), t("Photo added"), t("The gallery was updated."));
      }} /></label>
      <div className="card-grid">{events.map((item) => <article key={item._id} className="panel"><p className="kicker">{String(item.category || "").replaceAll("_", " ")}</p><h2>{item.title}</h2></article>)}</div>
    </div>
  );
}

function Messages({ token, role, school }) {
  const [phones, setPhones] = useState("");
  const [message, setMessage] = useState("");
  if (role === "super_admin") {
    return (
      <section className="panel assess-create">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="wallet" /></span>
          <div>
            <p className="kicker"><Icon name="message" />{t("Messages")}</p>
            <h2>{t("Schools send the messages")}</h2>
          </div>
        </header>
        <p>{t("Record each school payment under Message wallets. A school sends until that allowance is used, then it is asked to top up.")}</p>
      </section>
    );
  }
  return (
    <form className="panel form-grid assess-create" onSubmit={(event) => {
      event.preventDefault();
      track((async () => {
        try {
          const sent = await api("/sms/send", {
            method: "POST",
            token,
            body: { phones: phones.split(",").map((phone) => phone.trim()).filter(Boolean), message },
          });
          notify(t("Message sent"), sent.message || t("The notice was sent."));
          setMessage("");
        } catch (err) {
          notify(t("Not completed"), err instanceof Error ? err.message : t("Could not send this message"), "bad");
        }
      })());
    }}>
      <header className="assess-head">
        <span className="assess-mark"><Icon name="message" /></span>
        <div>
          <p className="kicker"><Icon name="megaphone" />{school?.name || "School"}</p>
          <h2>{t("Send a message")}</h2>
        </div>
        <MessagesGraphic />
      </header>
      <WalletBanner token={token} className="span" />
      <p className="muted span">{t("Write the notice and the parent phone numbers. Each parent uses one message from the Message Wallet.")}</p>
      <Field label="Phones, separated by commas" value={phones} onChange={setPhones} placeholder="250788000000" />
      <Field label="Message" value={message} onChange={setMessage} multiline placeholder={t("Parents meeting Saturday 09:00.")} />
      <button className="solid" type="submit"><Icon name="message" />{t("Send message")}</button>
      <p className="muted span">{t("Every number is sent as 250 followed by 9 digits, for example 250788000000. A number typed as 0795645441 is sent as 250795645441.")}</p>
    </form>
  );
}

function kigaliDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function addDays(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}
function weekStart(day) {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - weekday + 1);
  return utc.toISOString().slice(0, 10);
}
function messageTotals(rows, grain, fromDay, toDay) {
  const daily = new Map();
  rows.forEach((row) => (row.history || []).forEach((point) => daily.set(point.bucket, (daily.get(point.bucket) || 0) + point.messages)));
  const keys = new Set();
  if (grain === "year") daily.forEach((_value, day) => keys.add(day.slice(0, 4)));
  else if (grain === "month") daily.forEach((_value, day) => keys.add(day.slice(0, 7)));
  else {
    let cursor = fromDay;
    while (cursor && cursor <= toDay && keys.size < 400) {
      keys.add(grain === "week" ? weekStart(cursor) : cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return [...keys].sort().map((bucket) => ({
    bucket,
    messages: [...daily.entries()].reduce((total, [day, count]) => {
      if (grain === "year" && day.slice(0, 4) !== bucket) return total;
      if (grain === "month" && day.slice(0, 7) !== bucket) return total;
      if (grain === "week" && weekStart(day) !== bucket) return total;
      if (grain === "day" && day !== bucket) return total;
      return total + count;
    }, 0),
  }));
}

const MESSAGE_CATEGORIES = [
  ["marks", "Marks", "#1565C0"],
  ["results", "Term results", "#2E7D32"],
  ["discipline", "Discipline", "#E65100"],
  ["notice", "School notice", "#6A1B9A"],
];

function blankCategories() {
  return { marks: 0, results: 0, discipline: 0, notice: 0 };
}

function sumCategories(rows) {
  const total = blankCategories();
  rows.forEach((row) => {
    const categories = { ...blankCategories(), ...(row.categories || {}) };
    MESSAGE_CATEGORIES.forEach(([id]) => {
      total[id] += categories[id] || 0;
    });
  });
  return total;
}

function TrendChart({ points }) {
  if (!points.length) return <p className="muted">{t("No days in this view.")}</p>;
  const max = Math.max(1, ...points.map((point) => point.messages));
  return (
    <div className="columns" role="img" aria-label={t("Messages over time")}>
      {points.map((point) => (
        <div key={point.bucket} className="column" title={`${point.bucket}: ${point.messages} messages`}>
          <span className="column-value">{point.messages || ""}</span>
          <span className="column-plot">
            <span className="column-fill" style={{ height: point.messages ? `${Math.max(8, Math.round((point.messages / max) * 150))}px` : "0px" }} />
          </span>
          <span className="column-label">{point.bucket.slice(5) || point.bucket}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryDonut({ totals }) {
  const slices = MESSAGE_CATEGORIES.map(([id, label, color]) => ({ id, label, color, value: totals[id] || 0 }));
  const sum = slices.reduce((total, slice) => total + slice.value, 0);
  const radius = 58;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut" role="img" aria-label={t("Messages by category")}>
        <circle cx="80" cy="80" r={radius} className="donut-track" />
        <g transform="rotate(-90 80 80)">
          {sum === 0 ? null : slices.map((slice) => {
            const length = (slice.value / sum) * circ;
            const node = (
              <circle key={slice.id} cx="80" cy="80" r={radius} fill="none" stroke={slice.color} strokeWidth="16" strokeDasharray={`${length} ${circ - length}`} strokeDashoffset={-offset}>
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return node;
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" className="donut-total">{sum}</text>
        <text x="80" y="94" textAnchor="middle" className="donut-caption">{t("messages")}</text>
      </svg>
      <ul className="legend">
        {slices.map((slice) => (
          <li key={slice.id} style={{ color: slice.color }}><i style={{ background: slice.color }} />{slice.label}<strong>{slice.value}</strong></li>
        ))}
      </ul>
    </div>
  );
}

function SchoolCategoryChart({ rows }) {
  const ranked = [...rows].sort((a, b) => (b.messages || 0) - (a.messages || 0) || a.school.name.localeCompare(b.school.name));
  if (!ranked.length) return <p className="muted">{t("No schools match this filter.")}</p>;
  return (
    <div className="school-bars">
      {ranked.map((row) => {
        const categories = { ...blankCategories(), ...(row.categories || {}) };
        return (
          <div key={row.school._id} className="school-bar">
            <div className="school-bar-head"><strong>{row.school.name}</strong><span>{row.messages || 0}</span></div>
            <div className="stack" aria-label={`${row.school.name} messages by category`}>
              {MESSAGE_CATEGORIES.map(([id, label, color]) => {
                const value = categories[id] || 0;
                if (!value) return null;
                return <i key={id} title={`${label}: ${value}`} style={{ flexGrow: value, background: color }} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const REPORT_METRICS = [
  ["messages", "Messages"],
  ["studentsJoined", "New students"],
  ["teachersJoined", "New teachers"],
  ["students", "Students now"],
  ["teachers", "Teachers now"],
  ["discipline", "Discipline now"],
  ["parents", "Parent phone"],
];

const METRIC_ICON = {
  messages: "message",
  studentsJoined: "graduate",
  teachersJoined: "people",
  students: "graduate",
  teachers: "people",
  discipline: "scale",
  parents: "phone",
};

function AnalysisGraphic() {
  return (
    <svg className="overview-crest analysis-crest" viewBox="0 0 280 150" role="img" aria-label={t("School figures compared")}>
      <rect x="8" y="12" width="264" height="126" rx="24" fill="#e3f2fd" />
      <rect x="22" y="34" width="72" height="84" rx="12" fill="#0D47A1" />
      <path d="M22 52h72" stroke="#4FC3F7" strokeWidth="3" />
      <rect x="34" y="62" width="14" height="10" rx="2" fill="#ffffff" />
      <rect x="54" y="62" width="14" height="10" rx="2" fill="#ffffff" />
      <rect x="34" y="80" width="14" height="10" rx="2" fill="#90CAF9" />
      <rect x="54" y="80" width="14" height="10" rx="2" fill="#90CAF9" />
      <g className="assess-pen">
        <rect x="112" y="78" width="22" height="40" rx="6" fill="#90CAF9" />
        <rect x="142" y="58" width="22" height="60" rx="6" fill="#4FC3F7" />
        <rect x="172" y="44" width="22" height="74" rx="6" fill="#1565C0" />
        <rect x="202" y="30" width="22" height="88" rx="6" fill="#0D47A1" />
      </g>
    </svg>
  );
}

function Reports({ token }) {
  const [period, setPeriod] = useState("month");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [metric, setMetric] = useState("messages");
  const [grain, setGrain] = useState("day");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState(null);
  useEffect(() => {
    api(`/admin/reports?period=${period}`, { token }).then(setReport).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [period, token]);
  const rows = (report?.items || []).filter((row) => (status === "all" || row.school.status === status) && (type === "all" || row.school.type === type) && (!query.trim() || row.school.name.toLowerCase().includes(query.trim().toLowerCase())));
  const ranked = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.school.name.localeCompare(b.school.name));
  const max = Math.max(1, ...ranked.map((row) => row[metric] || 0));
  const totals = report ? messageTotals(rows, grain, kigaliDay(new Date(report.from)), kigaliDay(new Date())) : [];
  const messageTotal = totals.reduce((total, row) => total + row.messages, 0);
  const categories = sumCategories(rows);
  const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
  if (!report) {
    return (
      <div className="sections school-analysis" aria-hidden="true">
        <header className="panel">
          <div className="assess-head">
            <span className="assess-mark skel" />
            <span className="skel-copy"><i className="skel short" /><i className="skel" /></span>
            <span className="skel skel-graphic" />
          </div>
        </header>
        <section className="panel skel-rows">
          <i className="skel" />
          <i className="skel short" />
          <i className="skel" />
        </section>
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((item) => <article key={item} className="kpi skel-card"><i className="skel skel-avatar" /><span className="skel-copy"><i className="skel short" /><i className="skel" /></span></article>)}
        </div>
        <section className="analytics">
          <article className="chart-card"><div className="skel skel-stage" /></article>
          <article className="chart-card"><div className="skel skel-stage" /></article>
        </section>
      </div>
    );
  }
  return (
    <div className="sections school-analysis">
      <header className="panel">
        <div className="assess-head">
          <span className="assess-mark"><Icon name="chart" /></span>
          <div>
            <p className="kicker"><Icon name="school" />{t("Analysis")}</p>
            <h2>{t("School figures")}</h2>
          </div>
          <AnalysisGraphic />
        </div>
        <p className="muted">{report ? `${new Date(report.from).toLocaleDateString("en-GB", { timeZone: "Africa/Kigali" })} – ${new Date(report.to).toLocaleDateString("en-GB", { timeZone: "Africa/Kigali" })} · ${report.timezone}` : "Weekly, monthly and annual figures."}</p>
      </header>
      <section className="panel sections">
        <h2><Icon name="calendar" />{t("Period")}</h2>
        <p className="muted">{t("Week starts Monday. Month starts on the 1st. Year starts on 1 January. All dates are Africa/Kigali.")}</p>
        <div className="chips">{["week", "month", "year"].map((item) => <button key={item} type="button" className={period === item ? "on" : ""} onClick={() => setPeriod(item)}>{t(item[0].toUpperCase() + item.slice(1))}</button>)}</div>
        <h2><Icon name="filter" />{t("Filter")}</h2>
        <p className="muted">{t("Totals and charts use only the schools that pass every filter.")}</p>
        <Field label="Search school" value={query} onChange={setQuery} placeholder={t("School name")} />
        <p className="kicker"><Icon name="shield" />{t("Status")}</p>
        <div className="chips">{["all", "approved", "pending_review", "draft", "rejected", "suspended"].map((item) => <button key={item} type="button" className={status === item ? "on" : ""} onClick={() => setStatus(item)}>{item === "all" ? t("All statuses") : t(item.replaceAll("_", " "))}</button>)}</div>
        <p className="kicker"><Icon name="school" />{t("Type")}</p>
        <div className="chips">{["all", "primary", "secondary", "tvet", "university"].map((item) => <button key={item} type="button" className={type === item ? "on" : ""} onClick={() => setType(item)}>{item === "all" ? t("All types") : t(item)}</button>)}</div>
      </section>
      <section className="panel sections">
        <h2><Icon name="chart" />{t("In this filter")}</h2>
        <p className="muted">{t("{count} of {total} schools.", { count: rows.length, total: report?.items.length || 0 })}</p>
        <div className="kpi-grid">{REPORT_METRICS.map(([id, label]) => (
          <article key={id} className="kpi msg-kpi">
            <span className="assess-mark"><Icon name={METRIC_ICON[id] || "chart"} /></span>
            <div>
              <h2>{sum(id)}</h2>
              <p>{t(label)}</p>
            </div>
          </article>
        ))}</div>
      </section>
      <section className="analytics">
        <article className="chart-card pulse-card">
          <header className="assess-head">
            <span className="assess-mark"><Icon name="chart" /></span>
            <div>
              <h2>{t("Messages over time")}</h2>
              <p className="muted">{t("The line follows the same day, week, month, or year totals as the list below.")}</p>
            </div>
          </header>
          <div className="chips">{["day", "week", "month", "year"].map((item) => <button key={item} type="button" className={grain === item ? "on" : ""} onClick={() => setGrain(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          <TrendChart points={totals} />
        </article>
        <article className="chart-card pulse-card">
          <header className="assess-head">
            <span className="assess-mark"><Icon name="pie" /></span>
            <div>
              <h2>{t("By category")}</h2>
              <p className="muted">{t("Marks, term results, discipline, and school notices sent in this period.")}</p>
            </div>
          </header>
          <CategoryDonut totals={categories} />
        </article>
      </section>
      <section className="chart-card pulse-card">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="message" /></span>
          <div>
            <h2>{t("How each school sent")}</h2>
            <p className="muted">{t("Each bar is that school’s messages in this period, split by category. The colours match the chart above.")}</p>
          </div>
        </header>
        <ul className="legend">
          {MESSAGE_CATEGORIES.map(([id, label, color]) => <li key={id}><i style={{ background: color }} />{label}</li>)}
        </ul>
        <SchoolCategoryChart rows={rows} />
      </section>
      <section className="panel sections">
        <h2><Icon name="school" />{t("Compare schools")}</h2>
        <div className="chips">{REPORT_METRICS.map(([id, label]) => <button key={id} type="button" className={metric === id ? "on" : ""} onClick={() => setMetric(id)}>{label}</button>)}</div>
        {report?.rules?.[metric] ? <p className="muted">{report.rules[metric]}</p> : null}
        {ranked.map((row) => (
          <div key={row.school._id} className="pulse-school">
            <p className="pulse-school-name"><Icon name="school" /><strong>{row.school.name}</strong> <span>{row[metric] || 0}</span></p>
            <div className="track"><div className="fill" style={{ width: `${((row[metric] || 0) / max) * 100}%` }} /></div>
          </div>
        ))}
      </section>
      <section className="panel sections">
        <h2><Icon name="message" />{t("Total messages")}</h2>
        <p className="muted">{t("Each row is the total for that day, week, month, or year.")}</p>
        <div className="chips">{["day", "week", "month", "year"].map((item) => <button key={item} type="button" className={grain === item ? "on" : ""} onClick={() => setGrain(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <p className="analysis-total"><Icon name="message" /><strong>{messageTotal} messages</strong></p>
        <ul className="analysis-buckets">
          {totals.map((row) => <li key={row.bucket}>{row.bucket} · {row.messages}</li>)}
        </ul>
      </section>
      <section className="panel sections">
        <h2><Icon name="info" />{t("How a figure is counted")}</h2>
        {report ? Object.entries(report.rules || {}).map(([key, text]) => <p key={key}><strong>{REPORT_METRICS.find(([id]) => id === key)?.[1] || key}. </strong>{text}</p>) : null}
      </section>
      <section className="sections">
        <h2><Icon name="school" />{t("Schools")}</h2>
        <p className="muted">{t("Each card repeats the same definitions. Period figures and today’s register are kept apart.")}</p>
        {ranked.length === 0 ? <p className="muted">{t("No schools match this filter. Clear the search or choose All statuses.")}</p> : null}
        {ranked.map((row) => (
          <article key={row.school._id} className="panel analysis-school">
            <header className="assess-head">
              <span className="assess-mark"><Icon name="school" /></span>
              <div>
                <h2>{row.school.name}</h2>
                <p className="muted">{t(row.school.status.replaceAll("_", " "))} · {t(row.school.type)}</p>
              </div>
            </header>
            <p className="kicker"><Icon name="calendar" />{t("Inside this period")}</p>
            <p>Messages {row.messages} · New students {row.studentsJoined} · New teachers {row.teachersJoined}</p>
            <p className="muted">Marks {(row.categories || {}).marks || 0} · Term results {(row.categories || {}).results || 0} · Discipline {(row.categories || {}).discipline || 0} · School notice {(row.categories || {}).notice || 0}</p>
            <p className="kicker"><Icon name="people" />{t("Register today")}</p>
            <p>Students {row.students} · Teachers {row.teachers} · Discipline {row.discipline} · Parent phone {row.parents}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Approvals({ token }) {
  const [items, setItems] = useState([]);
  const [director, setDirector] = useState({ fullName: "", email: "", password: "School@123", phone: "" });
  async function load() {
    const data = await api("/schools", { token });
    setItems(data.items || []);
  }
  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);
  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={(event) => {
        event.preventDefault();
        act(() => api("/admin/school-admins", { method: "POST", token, body: director }), t("Director created"), t("They can sign in and submit a school profile.")).then((ok) => { if (ok) setDirector({ ...director, fullName: "", email: "", phone: "" }); });
      }}>
        <h2>{t("New school director")}</h2>
        <Field label="Full name" value={director.fullName} onChange={(value) => setDirector({ ...director, fullName: value })} />
        <Field label="Email" value={director.email} onChange={(value) => setDirector({ ...director, email: value })} />
        <Field label="Phone" value={director.phone} onChange={(value) => setDirector({ ...director, phone: value })} placeholder="250788000000" />
        <Field label="Password" type="password" value={director.password} onChange={(value) => setDirector({ ...director, password: value })} autoComplete="new-password" />
        <button className="solid" type="submit">{t("Create director account")}</button>
      </form>
      <div className="card-grid">
        {items.map((school) => (
          <article key={school._id} className="panel sections">
            <h2>{school.name}</h2>
            <p className="muted">{t((school.status || "").replaceAll("_", " "))} · {t(school.type)} · {school.location?.district || t("No district")}</p>
            <div className="actions">
              {school.status === "pending_review" || school.status === "draft" ? <button className="solid" type="button" onClick={() => act(() => api(`/schools/${school._id}/approve`, { method: "POST", token, body: {} }).then(load), "Approved", `${school.name} is now public.`)}>{t("Approve and publish")}</button> : null}
              {school.status === "pending_review" ? <button className="danger" type="button" onClick={() => act(() => api(`/schools/${school._id}/reject`, { method: "POST", token, body: { reason: t("More verification documents needed") } }).then(load), "Rejected", `${school.name} was not approved.`)}>{t("Reject")}</button> : null}
              {school.status === "approved" ? <button className="ghost" type="button" onClick={() => act(() => api(`/schools/${school._id}/suspend`, { method: "POST", token, body: {} }).then(load), "Deactivated", `${school.name} is hidden from the public.`)}>{t("Deactivate")}</button> : null}
              {school.status === "suspended" || school.status === "rejected" ? <button className="solid" type="button" onClick={() => act(() => api(`/schools/${school._id}/activate`, { method: "POST", token }).then(load), "Active", `${school.name} is public again.`)}>{t("Activate")}</button> : null}
              <button className="danger" type="button" onClick={() => { if (!window.confirm(t("Delete {name}? This cannot be undone.", { name: school.name }))) return; act(() => api(`/schools/${school._id}`, { method: "DELETE", token }).then(load), "Deleted", `${school.name} was removed.`); }}>{t("Delete school")}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const AD_CATEGORIES = ["internship", "new_school", "event", "opportunity", "sponsor", "other"];

function Ads({ token }) {
  const blank = { title: "", body: "", category: "internship", imageUrl: "", videoUrl: "", ctaLabel: "Learn more", ctaUrl: "" };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function load() {
    const data = await api("/ads", { token });
    setItems(data.items || []);
  }
  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  async function onFile(kind, file) {
    if (!file) return;
    const uploaded = await act(() => uploadFile(token, "ads", file), "Uploaded", t("Check the preview, then publish."));
    if (!uploaded?.url) return;
    if (kind === "video" && uploaded.resourceType === "video") set("videoUrl", uploaded.url);
    else set("imageUrl", uploaded.url);
  }

  return (
    <div className="sections ad-desk">
      <form className="panel form-grid assess-create" onSubmit={(event) => {
        event.preventDefault();
        if (!form.title.trim()) return notify(t("Add a title"), t("Every ad needs a title."), "bad");
        act(async () => {
          if (editingId) await api(`/ads/${editingId}`, { method: "PATCH", token, body: form });
          else await api("/ads", { method: "POST", token, body: form });
          setEditingId(null);
          setForm(blank);
          await load();
        }, editingId ? t("Ad saved") : t("Ad published"), t("It is ready on the home page."));
      }}>
        <header className="assess-head">
          <span className="assess-mark"><Icon name="megaphone" /></span>
          <div>
            <p className="kicker"><Icon name="image" />{t("In-app ads")}</p>
            <h2>{editingId ? "Edit ad" : "Publish home ad"}</h2>
          </div>
        </header>
        <Field label="Title" value={form.title} onChange={(value) => set("title", value)} />
        <label className="field">Category
          <select value={form.category} onChange={(event) => set("category", event.target.value)}>{AD_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <Field label="Body" value={form.body} onChange={(value) => set("body", value)} multiline />
        {(form.imageUrl || form.videoUrl) ? (
          <div className="span">
            {form.imageUrl ? <img src={form.imageUrl} alt="" style={{ height: 180, width: "100%", objectFit: "cover", borderRadius: 12 }} /> : null}
            {form.videoUrl ? <video src={form.videoUrl} controls style={{ width: "100%", maxHeight: 220 }} /> : null}
          </div>
        ) : null}
        <div className="actions span">
          <label className="ghost">{t("Upload image")}<input hidden type="file" accept="image/*" onChange={(event) => onFile("image", event.target.files?.[0])} /></label>
          <label className="ghost">{t("Upload video")}<input hidden type="file" accept="video/*" onChange={(event) => onFile("video", event.target.files?.[0])} /></label>
        </div>
        <Field label="Or paste a video URL" value={form.videoUrl} onChange={(value) => set("videoUrl", value)} />
        <Field label="Image URL" value={form.imageUrl} onChange={(value) => set("imageUrl", value)} />
        <Field label="Button label" value={form.ctaLabel} onChange={(value) => set("ctaLabel", value)} />
        <Field label="Button link" value={form.ctaUrl} onChange={(value) => set("ctaUrl", value)} />
        <div className="actions">
          <button className="solid" type="submit"><Icon name="megaphone" />{editingId ? t("Save changes") : t("Publish home ad")}</button>
          {editingId ? <button className="ghost" type="button" onClick={() => { setEditingId(null); setForm(blank); }}>{t("Cancel edit")}</button> : null}
        </div>
      </form>
      <div className="card-grid">
        {items.map((ad) => (
          <article key={ad._id} className="panel ad-manage">
            <div className="ad-media">
              {ad.imageUrl ? <img src={ad.imageUrl} alt="" /> : ad.videoUrl ? <video src={ad.videoUrl} muted /> : <div className="ad-blank" aria-hidden="true"><Icon name="megaphone" /></div>}
            </div>
            <p className="kicker">{ad.isActive === false ? "suspended" : "active"} · {ad.videoUrl ? "video" : "image"}</p>
            <h2>{ad.title}</h2>
            {ad.body ? <p className="muted">{ad.body}</p> : null}
            {ad.ctaLabel ? <span className="ad-action">{ad.ctaLabel}{ad.ctaUrl ? <Icon name="right" /> : null}</span> : null}
            <div className="actions">
              <button className="ghost" type="button" onClick={() => { setEditingId(ad._id); setForm({ title: ad.title || "", body: ad.body || "", category: ad.category || "other", imageUrl: ad.imageUrl || "", videoUrl: ad.videoUrl || "", ctaLabel: ad.ctaLabel || t("Learn more"), ctaUrl: ad.ctaUrl || "" }); }}>{t("Edit")}</button>
              <button className="ghost" type="button" onClick={() => act(() => api(`/ads/${ad._id}`, { method: "PATCH", token, body: { isActive: ad.isActive === false } }).then(load), ad.isActive === false ? "Ad activated" : "Ad suspended", ad.title)}> {ad.isActive === false ? "Activate" : "Suspend"}</button>
              <button className="danger" type="button" onClick={() => { if (!window.confirm(t("Delete “{name}”?", { name: ad.title }))) return; act(() => api(`/ads/${ad._id}`, { method: "DELETE", token }).then(load), t("Ad deleted"), ad.title); }}>{t("Delete")}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
