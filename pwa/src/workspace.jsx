import { LANGS, setLanguage, t, useLanguage } from "./i18n.js";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, media, uploadFile } from "./api.js";
import { act, notify, track } from "./notice.js";
import { Icon, TILE_ICON } from "./icons.jsx";
import { MessageAnalytics, MessagesGraphic } from "./messageAnalytics.jsx";
import { MessageWallets, WalletBanner } from "./messageWallet.jsx";
import { OfficialPreview, PrintHeading, ReportLogos, ReportPrint } from "./officialReport.jsx";
import { LiveChat, useChatInbox } from "./liveChat.jsx";
import { AccountantPortal, StudentSearch, accountantNav } from "./accountant.jsx";
import { TeacherBoard } from "./teacher.jsx";
import { DeskLoading, DeskSearch, DirectorBoard, DisciplineBoard, PlatformBoard, QuietBoard, StudiesBoard } from "./deskHome.jsx";
import { Studies } from "./studies.jsx";
import { FollowUp } from "./followUp.jsx";
import { DisciplineStanding } from "./disciplineStanding.jsx";
import { localPhone, takePhone } from "./phone.js";

const SESSION_KEY = "ishuri.pwa.session";

function go(path) {
  window.location.hash = path;
}

function Field({ label, value, onChange, type = "text", placeholder, multiline, autoComplete, error = "", submitted = false, maxLength }) {
  const [visible, setVisible] = useState(false);
  const [touched, setTouched] = useState(false);
  const secret = type === "password";
  const message = error && (touched || submitted) ? error : "";
  const described = message ? `err-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : undefined;
  return (
    <label className={message ? "field invalid" : "field"}>
      {t(label)}
      {multiline ? (
        <textarea value={value} rows={4} maxLength={maxLength} placeholder={placeholder} aria-invalid={message ? true : undefined} aria-describedby={described} onBlur={() => setTouched(true)} onChange={(event) => onChange(maxLength ? event.target.value.slice(0, maxLength) : event.target.value)} />
      ) : (
        <span className={secret ? "secret-field" : undefined}>
          <input type={secret && visible ? "text" : type} value={value} maxLength={maxLength} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={message ? true : undefined} aria-describedby={described} onBlur={() => setTouched(true)} onChange={(event) => onChange(maxLength ? event.target.value.slice(0, maxLength) : event.target.value)} />
          {secret ? (
            <button className="secret-toggle" type="button" aria-pressed={visible} aria-label={visible ? t("Hide password") : t("Show password")} onClick={() => setVisible((current) => !current)}>
              {visible ? t("Hide") : t("Show")}
            </button>
          ) : null}
        </span>
      )}
      {message ? <span className="field-error" id={described} role="alert"><Icon name="alert" />{t(message)}</span> : null}
    </label>
  );
}

function ValidationAlert({ message }) {
  if (!message) return null;
  return (
    <p className="form-alert" role="alert">
      <Icon name="alert" />
      <span>{t(message)}</span>
    </p>
  );
}

function markIssue(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!/^\d+(\.\d+)?$/.test(text)) return true;
  const score = Number(text);
  return !Number.isFinite(score) || score < 0 || score > Number(max);
}

function phoneIssue(value) {
  if (!String(value || "").trim()) return "";
  return localPhone(value) ? "" : "The phone number must be 10 digits and start with 07.";
}

function parentOf(student) {
  return student.guardians?.find((item) => item.isPrimary) || student.guardians?.[0];
}

const ROLE_LABEL = {
  school_admin: "Director",
  teacher: "Teacher",
  dos: "Director of Studies",
  discipline: "Discipline",
  accountant: "Accountant",
  super_admin: "Platform",
};

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
      { id: "ads", group: "Platform", title: t("In-app ads"), hint: t("Publish, preview, suspend or remove ads") },
      { id: "settings", group: "Platform", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  if (role === "school_admin") {
    tiles.push(
      { id: "chat", group: "School", title: "Messages", hint: t("Chat with your staff, other directors, or IshuriApp.") },
      { id: "profile", group: "School", title: t("School profile"), hint: t("Create the profile and send it for approval") },
      { id: "staff", group: "People", title: t("Staff accounts"), hint: t("Teachers, discipline officers and accountants, with email and password") }
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
      { id: "status", group: "People", title: "Student status", hint: t("See what each student was charged, what was paid, and what is still unpaid.") },
      { id: "standing", group: "School", title: "Term Assessment Report", hint: t("Each subject shows its final mark for every assessment in the term.") },
      { id: "summary", group: "School", title: "Summary report", hint: t("Choose a class and a subject. The sheet lists every assessment in the term.") },
      ...(!isUni ? [{ id: "follow", group: "School", title: "Follow-up", hint: t("Students who attended and students who did not, with the reason.") }] : []),
      { id: "analytics", group: "School life", title: t("Message analytics"), hint: t("Filter by date, term and message type, and see what was sent and what stayed unsent.") },
      { id: "settings", group: "School", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  if (role === "teacher" && !isUni) {
    tiles.push(
      { id: "students", group: "My class", title: t("Register students"), hint: t("One parent phone receives every message") },
      { id: "marks", group: "My class", title: "Assessments", hint: t("Create an assessment in any class, save marks, and print the report") },
      { id: "chat", group: "My class", title: "Messages", hint: t("Chat with the staff at your school.") }
    );
  }
  if (role === "teacher") {
    tiles.push(
      { id: "settings", group: "My class", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  if (role === "dos" && !isUni) {
    tiles.push(
      { id: "studies", group: "Studies", title: "Director of Studies", hint: t("See every teacher's assessments, open the marks reports, and send one monthly summary to parents.") },
      { id: "chat", group: "Studies", title: "Messages", hint: t("Chat with the staff at your school.") },
      { id: "settings", group: "Studies", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  if (role === "discipline") {
    tiles.push(
      { id: "discipline", group: "Discipline", title: t("Discipline cases"), hint: t("Scores, cases, and a printable report by date and student") },
      { id: "analytics", group: "Discipline", title: t("My messages"), hint: t("Discipline texts you sent, with sent and unsent totals.") },
      { id: "chat", group: "Discipline", title: "Messages", hint: t("Chat with the staff at your school.") },
      { id: "settings", group: "Discipline", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  if (role === "accountant") {
    tiles.push(
      { id: "books", group: "Books", title: "Accountant portal", hint: "Set the school fees and the material items. Record the amount paid. The unpaid amount is shown for you." },
      { id: "chat", group: "Books", title: "Messages", hint: t("Chat with the staff at your school.") },
      { id: "analytics", group: "Books", title: t("My messages"), hint: t("Student status, reminders and special messages you sent, with the school fees and the unpaid totals.") },
      { id: "settings", group: "Books", title: "Settings", hint: t("Change your name, email, phone and password.") }
    );
  }
  return tiles;
}

function RwandaFlag() {
  return (
    <svg className="acct-flag" viewBox="0 0 24 16" aria-hidden="true">
      <rect width="24" height="16" rx="2" fill="#00A1DE" />
      <rect y="6.2" width="24" height="4.6" fill="#FAD201" />
      <rect y="10.8" width="24" height="5.2" fill="#20603D" />
      <circle cx="19" cy="3.6" r="1.5" fill="#FAD201" />
    </svg>
  );
}

function DashLang() {
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const code = { en: "EN", rw: "RW", sw: "SW", fr: "FR" }[lang] || "EN";
  return (
    <div className="acct-lang">
      <button type="button" aria-label={t("Language")} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <RwandaFlag />
        <span>{code}</span>
        <Icon name="chevron" />
      </button>
      {open ? (
        <ul>
          {LANGS.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => { setLanguage(item.id); setOpen(false); }}>{item.label}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function accountInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] || "A").slice(0, 2);
  return letters.toUpperCase();
}

function Mark({ src, letters, className }) {
  const [failed, setFailed] = useState(false);
  const photo = !failed && src ? media(src) : "";
  if (photo) return <img className={className} src={photo} alt="" onError={() => setFailed(true)} />;
  return <span className={className} aria-hidden="true"><b>{letters}</b></span>;
}

function DashUser({ user, onSignOut, onSettings, roleLabel = "Accountant" }) {
  const [open, setOpen] = useState(false);
  const name = user?.fullName || t(roleLabel);
  return (
    <div className="acct-user">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Mark className="acct-avatar" src={user?.avatarUrl} letters={accountInitials(name)} />
        <span>
          <strong>{name}</strong>
          <em>{t(roleLabel)}</em>
        </span>
        <Icon name="chevron" />
      </button>
      {open ? (
        <ul>
          <li><button type="button" onClick={() => { setOpen(false); onSettings(); }}><Icon name="gear" />{t("Settings")}</button></li>
          <li><button type="button" onClick={onSignOut}><Icon name="door" />{t("Log out")}</button></li>
        </ul>
      ) : null}
    </div>
  );
}

export function Workspace({ session, section, onSignOut, onSession }) {
  useLanguage();
  const tiles = tilesFor(session);
  const allowed = new Set(tiles.map((tile) => tile.id));
  const sectionParts = String(section || "home").split("/").filter(Boolean);
  const sectionId = sectionParts[0] || "home";
  const peerId = sectionParts.slice(1).join("/");
  const current = sectionId !== "home" && allowed.has(sectionId) ? sectionId : "home";
  const [feeDesk, setFeeDesk] = useState({ items: [], classes: [], rooms: [], roster: [] });
  const [teachDesk, setTeachDesk] = useState({ ready: false, classes: [], roster: [], assessments: [] });
  const [homeDesk, setHomeDesk] = useState({ ready: false, students: [], classes: [], staff: [], events: [], assessments: [], cases: [], platform: null });
  const [night, setNight] = useState(() => {
    try { return localStorage.getItem("ishuri.acct.theme") === "night"; } catch { return false; }
  });
  const publishFeeItems = useCallback((desk) => setFeeDesk((currentDesk) => ({
    ...currentDesk,
    items: desk?.items || [],
    classes: desk?.classes || [],
  })), []);
  useEffect(() => {
    const role = session?.user?.role;
    if (!role) return undefined;
    document.body.classList.add("acct-live");
    return () => document.body.classList.remove("acct-live");
  }, [session?.user?.role]);
  useEffect(() => {
    if (session?.user?.role !== "accountant" || !session?.token) return undefined;
    let cancel = false;
    Promise.all([
      api("/accounts/ledger", { token: session.token }),
      api("/academics/classes", { token: session.token }),
      api("/students", { token: session.token }),
    ]).then(([book, rooms, people]) => {
      if (cancel) return;
      setFeeDesk((currentDesk) => ({
        ...currentDesk,
        items: accountantNav(book.accounts),
        classes: (rooms.items || []).map((room) => ({ id: room._id, name: room.name })),
        rooms: rooms.items || [],
        roster: people.items || [],
      }));
    }).catch(() => {});
    return () => { cancel = true; };
  }, [session?.token, session?.user?.role]);
  useEffect(() => {
    if (session?.user?.role !== "teacher" || session?.school?.type === "university" || !session?.token) return undefined;
    let cancel = false;
    Promise.all([
      api("/academics/classes", { token: session.token }),
      api("/students", { token: session.token }),
      api("/marks/assessments", { token: session.token }),
    ]).then(([rooms, people, sheet]) => {
      if (cancel) return;
      setTeachDesk({
        ready: true,
        classes: rooms.items || [],
        roster: people.items || [],
        assessments: sheet.items || [],
      });
    }).catch(() => { if (!cancel) setTeachDesk((currentDesk) => ({ ...currentDesk, ready: true })); });
    return () => { cancel = true; };
  }, [session?.token, session?.user?.role, session?.school?.type]);
  useEffect(() => {
    const role = session?.user?.role;
    const university = session?.school?.type === "university";
    if (!session?.token || role === "accountant" || role === "teacher") return undefined;
    let cancel = false;
    const token = session.token;
    const finish = (patch) => { if (!cancel) setHomeDesk((currentDesk) => ({ ...currentDesk, ready: true, ...patch })); };
    const fail = () => { if (!cancel) setHomeDesk((currentDesk) => ({ ...currentDesk, ready: true })); };
    if (role === "super_admin") {
      api("/admin/presence", { token }).then((data) => finish({ platform: data })).catch(fail);
    } else if (role === "school_admin") {
      const calls = [api("/staff", { token }), api("/content/events", { token })];
      if (!university) calls.push(api("/students", { token }), api("/academics/classes", { token }));
      Promise.all(calls).then((pages) => {
        const [people, posted, students, rooms] = pages;
        finish({
          staff: people.items || [],
          events: posted.items || [],
          students: students?.items || [],
          classes: rooms?.items || [],
        });
      }).catch(fail);
    } else if (role === "dos") {
      Promise.all([
        api("/academics/classes", { token }),
        api("/marks/assessments", { token }),
      ]).then(([rooms, sheet]) => finish({ classes: rooms.items || [], assessments: sheet.items || [] })).catch(fail);
    } else if (role === "discipline") {
      Promise.all([
        api("/discipline", { token }),
        api("/academics/classes", { token }),
        api("/students", { token }),
      ]).then(([cases, rooms, people]) => finish({
        cases: cases.items || [],
        classes: rooms.items || [],
        students: people.items || [],
      })).catch(fail);
    } else finish({});
    return () => { cancel = true; };
  }, [session?.token, session?.user?.role, session?.school?.type]);
  useEffect(() => {
    if (!session?.user?.role) return undefined;
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector(".acct-bar .acct-search input")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session?.user?.role]);
  const canChat = ["school_admin", "super_admin", "accountant", "teacher", "dos", "discipline"].includes(session?.user?.role);
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

  const role = session.user?.role;
  const university = session.school?.type === "university";
  const accountant = role === "accountant";
  const teacher = role === "teacher";
  const teachMarks = teacher && !university;
  const shell = true;
  const roleLabel = ROLE_LABEL[role] || "Director";
  const brandName = session.school?.name || (role === "super_admin" ? "IshuriApp" : session.user?.fullName);
  const studentSearch = accountant || teachMarks || (role === "school_admin" && !university) || role === "discipline";
  const searchRoster = accountant ? feeDesk.roster : teacher ? teachDesk.roster : homeDesk.students;
  const searchClasses = accountant ? feeDesk.rooms : teacher ? teachDesk.classes : homeDesk.classes;
  const textRows = role === "dos"
    ? homeDesk.assessments.map((item) => ({
      id: item._id,
      title: item.title || t("Assessments"),
      detail: [item.classRoom?.name, item.subject?.name].filter(Boolean).join(" · "),
      href: "#/desk/studies",
    }))
    : role === "super_admin"
      ? (homeDesk.platform?.items || []).map((item) => ({
        id: item.id,
        title: item.name,
        detail: `${item.staff || 0} ${t("Staff")}`,
        href: "#/desk/approvals",
      }))
      : [];
  const bellChat = !allowed.has("analytics");
  const brandWords = String(brandName || "").trim().split(/\s+/).filter(Boolean);
  const brandMark = (brandWords.length >= 2 ? `${brandWords[0][0]}${brandWords[1][0]}` : (brandWords[0] || "IS").slice(0, 2)).toUpperCase();
  return (
    <div className={`page${current === "chat" ? " chat-page" : ""}${shell ? " is-accountant" : ""}${night ? " is-night" : ""}`}>
      <header className="acct-bar">
        <div className="acct-brand">
          <Mark className="acct-logo" src={session.school?.logoUrl} letters={brandMark} />
          <div>
            <strong>{brandName}</strong>
            <span>{t(roleLabel)}</span>
          </div>
        </div>
        <div className="acct-bar-main">
          <div className="acct-search">
            {studentSearch ? (
              <StudentSearch
                roster={searchRoster}
                classes={searchClasses}
                placeholder={t("Search a student")}
                onPick={(student) => go(accountant ? `#/desk/books/student/${student._id}` : role === "discipline" ? "#/desk/discipline" : "#/desk/students")}
              />
            ) : textRows.length || role === "dos" || role === "super_admin" ? (
              <DeskSearch
                rows={textRows}
                placeholder={role === "super_admin" ? t("Search a school") : t("Search an assessment")}
                onPick={(row) => go(row.href)}
              />
            ) : null}
          </div>
          <div className="acct-tools">
            <button type="button" className="acct-icon-btn" aria-pressed={night} aria-label={night ? t("Light") : t("Dark")} onClick={() => setNight((value) => {
              const next = !value;
              try { localStorage.setItem("ishuri.acct.theme", next ? "night" : "day"); } catch { /* The choice stays for this visit. */ }
              return next;
            })}>
              <Icon name={night ? "moon" : "sun"} />
            </button>
            <button type="button" className="acct-icon-btn" aria-label={bellChat ? t("Messages") : t("My messages")} onClick={() => go(bellChat ? "#/desk/chat" : "#/desk/analytics")}>
              <Icon name="bell" />
              {bellChat && inbox?.unread ? <b className="nav-alert">{inbox.unread > 9 ? "9+" : inbox.unread}</b> : null}
            </button>
            <DashLang />
            <DashUser user={session.user} roleLabel={roleLabel} onSignOut={onSignOut} onSettings={() => go("#/desk/settings")} />
          </div>
        </div>
      </header>
      <div className="work is-accountant">
        <aside className="work-nav panel">
          <button className={current === "home" ? "on" : ""} onClick={() => go("#/desk")}><Icon name="home" />{t("Dashboard")}</button>
          {tiles.map((tile) => (
            <Fragment key={tile.id}>
              <button className={current === tile.id && !(tile.id === "books" && peerId) && !(tile.id === "marks" && peerId) && !(tile.id === "studies" && peerId) && !(tile.id === "discipline" && peerId) ? "on" : ""} onClick={() => go(`#/desk/${tile.id}`)}>
                <Icon name={TILE_ICON[tile.id] || "school"} />
                <span>{t(tile.title)}</span>
                {tile.id === "chat" && inbox?.unread ? <b className="nav-alert">{inbox.unread > 9 ? "9+" : inbox.unread}</b> : null}
              </button>
              {tile.id === "marks" ? (
                <>
                  <button className={current === "marks" && peerId === "summary" ? "on" : ""} onClick={() => go("#/desk/marks/summary")}>
                    <Icon name="award" />
                    <span>{t("Summary report")}</span>
                  </button>
                  <button className={current === "marks" && peerId === "credits" ? "on" : ""} onClick={() => go("#/desk/marks/credits")}>
                    <Icon name="book" />
                    <span>{t("Credited marks")}</span>
                  </button>
                  <button className={current === "marks" && peerId === "examination" ? "on" : ""} onClick={() => go("#/desk/marks/examination")}>
                    <Icon name="graduate" />
                    <span>{t("Examination")}</span>
                  </button>
                  <button className={current === "marks" && peerId === "follow" ? "on" : ""} onClick={() => go("#/desk/marks/follow")}>
                    <Icon name="check" />
                    <span>{t("Follow-up")}</span>
                  </button>
                </>
              ) : null}
              {tile.id === "books" && session.user?.role === "accountant" ? (
                <>
                  {feeDesk.classes.map((room) => {
                    const open = current === "books" && (peerId === `class/${room.id}` || peerId.startsWith(`class/${room.id}/`));
                    return (
                      <Fragment key={room.id}>
                        <button type="button" className={`nav-sub${open ? " on" : ""}`} onClick={() => go(`#/desk/books/class/${room.id}`)}>
                          <Icon name="graduate" />
                          <span>{room.name}</span>
                        </button>
                        {open ? (
                          <>
                            <button type="button" className={`nav-sub is-deep${peerId.startsWith(`class/${room.id}/pay`) ? " on" : ""}`} onClick={() => go(`#/desk/books/class/${room.id}/pay`)}>
                              <Icon name="coins" />
                              <span>{t("Record payment")}</span>
                            </button>
                            <button type="button" className={`nav-sub is-deep${peerId === `class/${room.id}/report` ? " on" : ""}`} onClick={() => go(`#/desk/books/class/${room.id}/report`)}>
                              <Icon name="award" />
                              <span>{t("Class sheet")}</span>
                            </button>
                          </>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  <button type="button" className={`nav-sub${current === "books" && (peerId === "fees" || peerId.startsWith("fees/")) ? " on" : ""}`} onClick={() => go("#/desk/books/fees")}>
                    <Icon name="receipt" />
                    <span>{t("School fees")}</span>
                  </button>
                  <button type="button" className={`nav-sub${current === "books" && (peerId === "materials" || peerId.startsWith("materials/")) ? " on" : ""}`} onClick={() => go("#/desk/books/materials")}>
                    <Icon name="book" />
                    <span>{t("School materials")}</span>
                  </button>
                  <button type="button" className={`nav-sub${current === "books" && peerId === "income" ? " on" : ""}`} onClick={() => go("#/desk/books/income")}>
                    <Icon name="chart" />
                    <span>{t("Income")}</span>
                  </button>
                  <button type="button" className={`nav-sub${current === "books" && peerId === "another" ? " on" : ""}`} onClick={() => go("#/desk/books/another")}>
                    <Icon name="wallet" />
                    <span>{t("Another income")}</span>
                  </button>
                  <button type="button" className={`nav-sub${current === "books" && peerId === "expenses" ? " on" : ""}`} onClick={() => go("#/desk/books/expenses")}>
                    <Icon name="coins" />
                    <span>{t("Expenses")}</span>
                  </button>
                  <button type="button" className={`nav-sub${current === "books" && peerId === "status" ? " on" : ""}`} onClick={() => go("#/desk/books/status")}>
                    <Icon name="people" />
                    <span>{t("Student status")}</span>
                  </button>
                </>
              ) : null}
              {tile.id === "discipline" ? (
                <button type="button" className={`nav-sub${current === "discipline" && peerId === "annual" ? " on" : ""}`} onClick={() => go("#/desk/discipline/annual")}>
                  <Icon name="award" />
                  <span>{t("Annual discipline report")}</span>
                </button>
              ) : null}
              {tile.id === "studies" ? (
                <>
                  <button className={current === "studies" && peerId === "summary" ? "on" : ""} onClick={() => go("#/desk/studies/summary")}>
                    <Icon name="award" />
                    <span>{t("Summary report")}</span>
                  </button>
                  <button className={current === "studies" && peerId === "midterm" ? "on" : ""} onClick={() => go("#/desk/studies/midterm")}>
                    <Icon name="pen" />
                    <span>{t("Mid Term Tests Report")}</span>
                  </button>
                  <button className={current === "studies" && peerId === "term" ? "on" : ""} onClick={() => go("#/desk/studies/term")}>
                    <Icon name="book" />
                    <span>{t("Term Assessment Report")}</span>
                  </button>
                  <button className={current === "studies" && peerId === "credits" ? "on" : ""} onClick={() => go("#/desk/studies/credits")}>
                    <Icon name="book" />
                    <span>{t("Credit report")}</span>
                  </button>
                  <button className={current === "studies" && peerId === "examination" ? "on" : ""} onClick={() => go("#/desk/studies/examination")}>
                    <Icon name="graduate" />
                    <span>{t("Examination")}</span>
                  </button>
                  <button className={current === "studies" && peerId === "follow" ? "on" : ""} onClick={() => go("#/desk/studies/follow")}>
                    <Icon name="check" />
                    <span>{t("Follow-up")}</span>
                  </button>
                </>
              ) : null}
            </Fragment>
          ))}
          {shell ? (
            <button type="button" className={`acct-side-user${current === "settings" ? " on" : ""}`} onClick={() => go("#/desk/settings")}>
              <Mark className="acct-avatar" src={session.user?.avatarUrl} letters={accountInitials(session.user?.fullName)} />
              <div>
                <strong>{session.user?.fullName}</strong>
                <span>{t(roleLabel)}</span>
              </div>
            </button>
          ) : null}
          <button onClick={onSignOut}><Icon name="door" />{t("Log out")}</button>
        </aside>
        <div>
          {role === "school_admin" && current !== "chat" ? <SchoolAdminReach /> : null}
          {role === "school_admin" && session.school?.status === "pending_review" ? <p className="muted hint-line">{t("Your school is under IshuriApp review. It is not public yet.")}</p> : null}
          {role === "school_admin" && session.school?.status === "rejected" ? <p className="muted hint-line">{t("Application was returned")}: {session.school.rejectionReason}</p> : null}
          {role === "school_admin" && university ? <p className="muted hint-line">{t("Universities publish events and scholarships. Class marks stay with primary, secondary and TVET schools.")}</p> : null}
          {current === "home" && role === "super_admin" ? (
            homeDesk.ready
              ? <PlatformBoard userName={session.user?.fullName} data={homeDesk.platform} />
              : <DeskLoading title={t("Opening the desk")} text={t("Your desk is on the way.")} />
          ) : null}
          {current === "home" && role === "school_admin" ? (
            homeDesk.ready
              ? <DirectorBoard userName={session.user?.fullName} students={homeDesk.students} classes={homeDesk.classes} staff={homeDesk.staff} events={homeDesk.events} university={university} />
              : <DeskLoading title={t("Opening the desk")} text={t("Your desk is on the way.")} />
          ) : null}
          {current === "home" && role === "dos" ? (
            homeDesk.ready
              ? <StudiesBoard userName={session.user?.fullName} classes={homeDesk.classes} assessments={homeDesk.assessments} />
              : <DeskLoading title={t("Opening the desk")} text={t("Your desk is on the way.")} />
          ) : null}
          {current === "home" && role === "discipline" ? (
            homeDesk.ready
              ? <DisciplineBoard userName={session.user?.fullName} students={homeDesk.students} classes={homeDesk.classes} cases={homeDesk.cases} />
              : <DeskLoading title={t("Opening the desk")} text={t("Your desk is on the way.")} />
          ) : null}
          {current === "home" && accountant ? <AccountantPortal token={session.token} school={session.school} userName={session.user?.fullName} viewId="" onItems={publishFeeItems} /> : null}
          {current === "home" && teachMarks && teachDesk.ready ? (
            <div className="acct-board">
              <TeacherBoard userName={session.user?.fullName} classes={teachDesk.classes} roster={teachDesk.roster} assessments={teachDesk.assessments} />
            </div>
          ) : null}
          {current === "home" && teachMarks && !teachDesk.ready ? (
            <div className="acct-load">
              <div className="acct-load-card">
                <span className="loader-ring" />
                <strong>{t("Opening your classes")}</strong>
                <p>{t("Your assessments are on the way.")}</p>
              </div>
            </div>
          ) : null}
          {current === "home" && teacher && !teachMarks ? (
            <QuietBoard
              userName={session.user?.fullName}
              roleLabel={roleLabel}
              welcome="Here is your class work for this period."
              actions={[
                { href: "#/desk/chat", icon: "chat", label: "Messages" },
                { href: "#/desk/settings", icon: "gear", label: "Settings" },
              ]}
            />
          ) : null}
          {current === "students" && <Students token={session.token} />}
          {current === "staff" && <StaffDesk token={session.token} />}
          {current === "classes" && <Classes token={session.token} />}
          {current === "marks" && peerId === "follow" ? <FollowUp token={session.token} school={session.school} /> : null}
          {current === "marks" && peerId !== "follow" ? <Marks token={session.token} school={session.school} view={peerId} /> : null}
          {current === "studies" && !peerId && (
            <Studies token={session.token} school={session.school} view="home">
              <Marks token={session.token} school={session.school} view="reports" reportsOnly />
            </Studies>
          )}
          {current === "studies" && (peerId === "midterm" || peerId === "term") ? <Studies token={session.token} school={session.school} view={peerId} /> : null}
          {current === "studies" && peerId === "follow" ? <FollowUp token={session.token} school={session.school} /> : null}
          {current === "studies" && peerId && peerId !== "midterm" && peerId !== "term" && peerId !== "follow" ? <Marks token={session.token} school={session.school} view={peerId} reportsOnly /> : null}
          {current === "discipline" && peerId === "annual" ? <DisciplineStanding token={session.token} school={session.school} /> : null}
          {current === "discipline" && peerId !== "annual" ? <Discipline token={session.token} school={session.school} /> : null}
          {current === "profile" && <Profile session={session} onSession={onSession} />}
          {current === "publish" && <Publish token={session.token} school={session.school} />}
          {current === "sms" && <Messages token={session.token} role={session.user?.role} school={session.school} />}
          {current === "analytics" && <MessageAnalytics token={session.token} role={session.user?.role} school={session.school} />}
          {current === "reports" && <Reports token={session.token} />}
          {current === "approvals" && <Approvals token={session.token} />}
          {current === "wallets" && <MessageWallets token={session.token} />}
          {current === "ads" && <Ads token={session.token} />}
          {current === "books" && session.user?.role === "accountant" ? <AccountantPortal token={session.token} school={session.school} userName={session.user?.fullName} viewId={peerId} onItems={publishFeeItems} /> : null}
          {current === "status" && role === "school_admin" ? <AccountantPortal token={session.token} school={session.school} userName={session.user?.fullName} viewId="status" watch /> : null}
          {current === "standing" && role === "school_admin" ? <Studies token={session.token} school={session.school} view="term" /> : null}
          {current === "summary" && role === "school_admin" ? <Marks token={session.token} school={session.school} view="summary" reportsOnly /> : null}
          {current === "follow" && role === "school_admin" ? <FollowUp token={session.token} school={session.school} /> : null}
          {current === "chat" && <LiveChat token={session.token} peerId={peerId} inbox={inbox} onInbox={inbox.reload} onOpen={openChat} />}
          {current === "settings" && shell ? <AccountantSettings session={session} onSession={onSession} /> : null}
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
      api("/auth/presence", { method: "POST", token, quiet: true }).catch(() => {});
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
  Books: "coins",
};

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
  const empty = { fullName: "", classRoom: "", parentName: "", parentPhone: "" };
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [submitted, setSubmitted] = useState(false);

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
      classRoom: student.classRoom?._id || "",
      parentName: parent?.fullName === "Parent" ? "" : parent?.fullName || "",
      parentPhone: localPhone(parent?.phone) || takePhone(parent?.phone),
    });
  }

  async function save(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!form.fullName.trim()) return notify(t("Not completed"), t("Type a student name"), "bad");
    if (!form.classRoom) return notify(t("Not completed"), t("Choose a class first."), "bad");
    const parentPhone = localPhone(form.parentPhone);
    if (!form.parentPhone.trim()) return notify(t("Not completed"), t("Enter the parent phone. That number receives the messages."), "bad");
    if (!parentPhone) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
    const body = {
      fullName: form.fullName.trim(),
      classRoom: form.classRoom,
      guardians: [{ relation: "guardian", fullName: form.parentName.trim() || "Parent", phone: parentPhone, isPrimary: true }],
    };
    const ok = await act(async () => {
      if (editingId) await api(`/students/${editingId}`, { method: "PATCH", token, body });
      else await api("/students", { method: "POST", token, body });
      await load();
    }, editingId ? t("Student updated") : t("Student registered"), t("The parent phone is saved for messages."));
    if (ok) {
      setEditingId(null);
      setSubmitted(false);
      setForm((current) => ({ ...empty, classRoom: current.classRoom }));
    }
  }

  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={save}>
        <h2>{editingId ? "Update student" : "Register student"}</h2>
        <Field label="Student name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
        <label className="field">Assigned class
          <select value={form.classRoom} onChange={(event) => setForm({ ...form, classRoom: event.target.value })}>
            <option value="">{t("Choose a class")}</option>
            {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
          </select>
        </label>
        <Field label="Parent name" value={form.parentName} onChange={(value) => setForm({ ...form, parentName: value })} />
        <Field label="Parent telephone" value={form.parentPhone} submitted={submitted} error={phoneIssue(form.parentPhone)} onChange={(value) => setForm({ ...form, parentPhone: takePhone(value) })} placeholder="0788000000" />
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
                      <td data-label={t("Parent telephone")} className="roster-phone">{localPhone(parent?.phone) || t("No phone")}</td>
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

function StaffDesk({ token }) {
  const categories = ["teacher", "dos", "discipline", "accountant", "leadership", "support"];
  const categoryLabel = { teacher: "Teacher", dos: "Director of Studies", discipline: "Discipline", accountant: "Accountant", leadership: "Leadership", support: "Support" };
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [grants, setGrants] = useState({});
  const blank = { fullName: "", email: "", phone: "", password: "Staff@123", roleTitle: "Teacher", category: "teacher", qualifications: "", classRoom: "" };
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [passwordAgain, setPasswordAgain] = useState("Staff@123");
  const [submitted, setSubmitted] = useState(false);

  async function load() {
    const [people, rooms] = await Promise.all([
      api("/staff", { token }),
      api("/academics/classes", { token }).catch(() => ({ items: [] })),
    ]);
    setItems(people.items || []);
    setClasses(rooms.items || []);
    setForm((current) => ({ ...current, classRoom: current.classRoom || rooms.items?.[0]?._id || "" }));
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);

  function resetForm() {
    setEditingId(null);
    setForm(blank);
    setPasswordAgain("Staff@123");
    setGrants({});
    setSubmitted(false);
  }

  function beginEdit(member) {
    const managed = classes.find((room) => (room.classTeacher?._id || room.classTeacher) === member._id);
    const classRoom = managed?._id || member.classes?.[0]?._id || "";
    setEditingId(member._id);
    setForm({
      fullName: member.fullName || "",
      email: member.email || member.user?.email || "",
      phone: localPhone(member.phone || member.whatsapp) || takePhone(member.phone || member.whatsapp),
      password: "",
      roleTitle: member.roleTitle || "",
      category: member.category || "teacher",
      qualifications: member.qualifications || "",
      classRoom,
    });
    setPasswordAgain("");
    const next = {};
    classes.forEach((room) => {
      (room.subjects || []).forEach((row) => {
        if (String(row.teacher?._id || row.teacher || "") !== String(member._id)) return;
        const subjectId = row.subject?._id;
        if (!subjectId) return;
        next[subjectId] = [...(next[subjectId] || []), room._id];
      });
    });
    setGrants(next);
  }

  function toggleGrant(subjectId, classId) {
    setGrants((current) => {
      const classIds = new Set(current[subjectId] || []);
      if (classIds.has(classId)) classIds.delete(classId);
      else classIds.add(classId);
      return { ...current, [subjectId]: [...classIds] };
    });
  }

  const subjectChoices = useMemo(() => {
    const map = new Map();
    classes.forEach((room) => {
      (room.subjects || []).forEach((row) => {
        if (!row.subject?._id) return;
        const current = map.get(row.subject._id) || { subject: row.subject, classes: [] };
        current.classes.push({ id: room._id, name: room.name, teacher: row.teacher });
        map.set(row.subject._id, current);
      });
    });
    return [...map.values()].sort((a, b) => String(a.subject.name).localeCompare(String(b.subject.name)));
  }, [classes]);

  async function assignTeacher(staffId) {
    if (form.category !== "teacher") {
      const previous = classes.filter((room) => (room.classTeacher?._id || room.classTeacher) === staffId);
      await Promise.all(previous.map((room) => api(`/academics/classes/${room._id}`, { method: "PATCH", token, body: { classTeacher: null } })));
      return;
    }
    const tasks = [];
    const subjectIds = new Set();
    const classIds = new Set();
    classes.forEach((room) => {
      (room.subjects || []).forEach((row) => {
        const subjectId = row.subject?._id;
        if (!subjectId) return;
        const selected = (grants[subjectId] || []).includes(room._id);
        const currentTeacher = String(row.teacher?._id || row.teacher || "");
        if (selected) {
          tasks.push(() => api(`/academics/classes/${room._id}/assign`, { method: "POST", token, body: { subjectId, teacherId: staffId } }));
          subjectIds.add(subjectId);
          classIds.add(room._id);
        } else if (currentTeacher === String(staffId)) {
          tasks.push(() => api(`/academics/classes/${room._id}/assign`, { method: "POST", token, body: { subjectId, teacherId: null } }));
        }
      });
    });
    for (const task of tasks) await task();
    const led = classes.filter((room) => (room.classTeacher?._id || room.classTeacher) === staffId);
    if (form.classRoom) {
      await Promise.all(led.filter((room) => room._id !== form.classRoom).map((room) => api(`/academics/classes/${room._id}`, { method: "PATCH", token, body: { classTeacher: null } })));
      await api(`/academics/classes/${form.classRoom}`, { method: "PATCH", token, body: { classTeacher: staffId } });
      classIds.add(form.classRoom);
    } else {
      await Promise.all(led.map((room) => api(`/academics/classes/${room._id}`, { method: "PATCH", token, body: { classTeacher: null } })));
    }
    await api(`/staff/${staffId}`, { method: "PATCH", token, body: { subjects: [...subjectIds], classes: [...classIds] } });
  }

  async function save(event) {
    event.preventDefault();
    setSubmitted(true);
    const changingPassword = Boolean(form.password || passwordAgain);
    if (changingPassword && form.password !== passwordAgain) return notify(t("Passwords do not match"), t("Type the same password in both fields."), "bad");
    if (!editingId && !form.password) return notify(t("Password required"), t("Set a password and confirm it."), "bad");
    if (form.category === "teacher" && classes.length && !Object.values(grants).some((ids) => ids.length)) return notify(t("Choose a class"), t("Choose at least one class for a subject."), "bad");
    const phone = form.phone.trim() ? localPhone(form.phone) : "";
    if (form.phone.trim() && !phone) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
    const body = { fullName: form.fullName, email: form.email, phone, roleTitle: form.roleTitle, category: form.category, qualifications: form.qualifications, whatsapp: phone };
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
        <div className="chips span">{categories.map((item) => <button type="button" key={item} className={form.category === item ? "on" : ""} onClick={() => setForm({ ...form, category: item, roleTitle: item === "dos" ? "Director of Studies" : item === "accountant" && (form.roleTitle === "Teacher" || form.roleTitle === "Director of Studies" || !form.roleTitle) ? "Accountant" : form.roleTitle })}>{t(categoryLabel[item])}</button>)}</div>
        {form.category === "accountant" ? <p className="muted span">{t("They sign in and open the accountant portal.")}</p> : null}
        {form.category === "dos" ? <p className="muted span">{t("They sign in and open the studies desk.")}</p> : null}
        <Field label="Email (login)" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Field label="Phone / WhatsApp" value={form.phone} submitted={submitted} error={phoneIssue(form.phone)} onChange={(value) => setForm({ ...form, phone: takePhone(value) })} placeholder="0788000000" />
        <Field label={editingId ? "New password" : "Password"} type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder={editingId ? "Leave blank to keep the current password" : ""} />
        <Field label="Confirm password" type="password" value={passwordAgain} onChange={setPasswordAgain} placeholder={editingId ? "Leave blank to keep the current password" : ""} />
        <Field label="Qualifications" value={form.qualifications} onChange={(value) => setForm({ ...form, qualifications: value })} />
        {form.category === "teacher" ? (
          <>
            <label className="field span">{t("Class this teacher manages")}
              <select value={form.classRoom} onChange={(event) => setForm({ ...form, classRoom: event.target.value })}>
                <option value="">{t("Choose a class")}</option>
                {classes.map((room) => <option key={room._id} value={room._id}>{room.name}{room.classTeacher?.fullName ? ` · ${room.classTeacher.fullName}` : ""}</option>)}
              </select>
            </label>
            {classes.length === 0 ? <p className="muted span">{t("Create the class first. The class teacher is chosen here, not on the class form.")}</p> : null}
            <div className="span sections">
              <p className="kicker">{t("Subjects")}</p>
              <p className="muted">{t("Choose each subject, then the classes where this teacher may change its marks.")}</p>
              <p className="muted">{t("Only this teacher can update, edit, or delete marks for that subject in the chosen classes.")}</p>
              {subjectChoices.map((choice) => (
                <div key={choice.subject._id}>
                  <p><strong>{choice.subject.name}</strong></p>
                  <div className="chips">
                    {choice.classes.map((room) => {
                      const on = (grants[choice.subject._id] || []).includes(room.id);
                      const otherName = room.teacher?.fullName && String(room.teacher?._id || "") !== String(editingId || "") ? room.teacher.fullName : "";
                      return (
                        <button type="button" key={room.id} className={on ? "on" : ""} onClick={() => toggleGrant(choice.subject._id, room.id)}>
                          {room.name}{otherName && !on ? ` · ${otherName}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
              <p className="kicker">{t(categoryLabel[member.category] || member.category || "staff")}</p>
              <h2>{member.fullName}</h2>
              <p><strong>{t("Role title.")}</strong> {member.roleTitle || t("Not given")}</p>
              <p><strong>{t("Email.")}</strong> {member.email || member.user?.email || t("Not given")}</p>
              <p><strong>{t("Phone / WhatsApp.")}</strong> {localPhone(member.phone || member.whatsapp) || t("Not given")}</p>
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
  const [subjectCredits, setSubjectCredits] = useState("");
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
    setSubjectCredits("");
    setPicked([]);
    setYear(String(new Date().getFullYear()));
  }

  function beginEdit(room) {
    setEditingId(room._id);
    setClassName(room.name || "");
    setYear(room.academicYear || String(new Date().getFullYear()));
    setSubjectName("");
    setSubjectCredits("");
    setPicked((room.subjects || []).map((row) => row.subject).filter((subject) => subject?.name));
  }

  function addSubject() {
    const name = subjectName.trim();
    if (!name) return notify(t("Add a subject"), t("Type the subject name, then add it to this class."), "bad");
    const existing = subjects.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const credits = wholeCredits(subjectCredits) || wholeCredits(existing?.credits);
    if (!credits) return notify(t("Subject credits"), t("Enter the credits for this subject. 1 credit equals 10 marks."), "bad");
    const next = { ...(existing || { name }), name: existing?.name || name, credits };
    setPicked((current) => {
      const without = current.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
      return [...without, next];
    });
    setSubjectName("");
    setSubjectCredits("");
  }

  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={(event) => {
        event.preventDefault();
        const pending = subjectName.trim();
        const pendingExisting = subjects.find((item) => item.name.toLowerCase() === pending.toLowerCase());
        const pendingCredits = wholeCredits(subjectCredits) || wholeCredits(pendingExisting?.credits);
        const draft = pending && !picked.some((item) => item.name.toLowerCase() === pending.toLowerCase())
          ? [...picked, { ...(pendingExisting || { name: pending }), name: pendingExisting?.name || pending, credits: pendingCredits }]
          : picked;
        if (!className.trim()) return notify(t("Class name"), t("Enter the class name."), "bad");
        if (!draft.length) return notify(t("Add the subjects"), t("Add at least one subject before saving the class."), "bad");
        if (draft.some((subject) => !wholeCredits(subject.credits))) return notify(t("Subject credits"), t("Enter the credits for this subject. 1 credit equals 10 marks."), "bad");
        act(async () => {
          const ids = [];
          for (const subject of draft) {
            let id = subject._id;
            const credits = wholeCredits(subject.credits);
            if (!id) {
              const made = await api("/academics/subjects", { method: "POST", token, body: { name: subject.name, credits } });
              id = made.item._id;
            } else if (wholeCredits(subjects.find((item) => item._id === id)?.credits) !== credits) {
              await api(`/academics/subjects/${id}`, { method: "PATCH", token, body: { credits } });
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
        <Field label="Subject credits" value={subjectCredits} onChange={setSubjectCredits} placeholder="6" />
        <p className="muted span">{t("1 credit equals 10 marks.")}</p>
        <button className="ghost" type="button" onClick={addSubject}>{t("Add subject")}</button>
        <div className="span">
          <p className="kicker">{t("Subjects on this class")}</p>
          {picked.length === 0 ? <p className="muted">{t("No subjects added yet.")}</p> : null}
          <div className="chips">
            {picked.map((subject) => (
              <button type="button" key={subject._id || subject.name} className="on" onClick={() => setPicked((current) => current.filter((item) => item.name !== subject.name))}>{subjectLabel(subject)}</button>
            ))}
          </div>
          {subjects.some((subject) => !picked.some((item) => item.name.toLowerCase() === subject.name.toLowerCase())) ? <p className="kicker">{t("Already in the school")}</p> : null}
          <div className="chips">
            {subjects.filter((subject) => !picked.some((item) => item.name.toLowerCase() === subject.name.toLowerCase())).map((subject) => (
              <button type="button" key={subject._id} onClick={() => setPicked((current) => current.some((item) => item.name.toLowerCase() === subject.name.toLowerCase()) ? current : [...current, { ...subject, credits: wholeCredits(subjectCredits) || subject.credits }])}>{subjectLabel(subject)}</button>
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
          <p>{(room.subjects || []).map((row) => subjectLabel(row.subject) || "Subject").join(" · ") || "No subjects on this class yet."}</p>
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

function wholeCredits(value) {
  const credits = Number(value);
  return Number.isInteger(credits) && credits >= 1 && credits <= 40 ? credits : 0;
}

function subjectTotal(credits) {
  return wholeCredits(credits) * 10;
}

function oneDecimal(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function showDecimal(value) {
  const rounded = oneDecimal(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function creditFileName(name) {
  const slug = String(name || "subject").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject";
  return `ishuriapp-${slug}-credits`;
}

function summaryFileName(name) {
  const slug = String(name || "subject").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject";
  return `ishuriapp-${slug}-summary`;
}

function examFileName(name) {
  const slug = String(name || "subject").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject";
  return `ishuriapp-${slug}-examination`;
}

function examCreditFileName(name) {
  const slug = String(name || "subject").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject";
  return `ishuriapp-${slug}-examination-credits`;
}

function summaryHead(test) {
  const mark = `${test.title} /${test.maxScore}`;
  const date = test.date ? prettyKey(dayKey(test.date)) : "";
  return date ? `${mark} · ${date}` : mark;
}

function summaryLine(sheet) {
  return sheet.tests.map(summaryHead).join(" · ");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function downloadFile(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function subjectLabel(subject) {
  const total = subjectTotal(subject?.credits);
  return total ? `${subject.name} · /${total}` : subject?.name || "";
}

function storedTerm(value) {
  const term = String(value || "1").trim().toLowerCase();
  if (term === "2" || term === "term 2") return "2";
  if (term === "3" || term === "term 3") return "3";
  if (term === "annual" || term === "year") return "annual";
  return "1";
}

function termMatches(value, term) {
  return storedTerm(value) === storedTerm(term);
}

function termLabel(term) {
  const key = storedTerm(term);
  if (key === "2") return t("Term 2");
  if (key === "3") return t("Term 3");
  if (key === "annual") return t("Annual");
  return t("Term 1");
}

function TermField({ value, onChange }) {
  return (
    <label className="field">{t("Term")}
      <select value={storedTerm(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="1">{t("Term 1")}</option>
        <option value="2">{t("Term 2")}</option>
        <option value="3">{t("Term 3")}</option>
        <option value="annual">{t("Annual")}</option>
      </select>
    </label>
  );
}

function ReportSpan({ year, onYear, from, onFrom, to, onTo }) {
  return (
    <>
      <label className="field">{t("Year")}
        <input type="number" min="2020" value={year} onChange={(event) => onYear(event.target.value)} />
      </label>
      <label className="field">{t("From")}
        <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
      </label>
      <label className="field">{t("To")}
        <input type="date" value={to} onChange={(event) => onTo(event.target.value)} />
      </label>
    </>
  );
}

function buildCreditSheet({ classroom, subject, assessments, history, term, papers = "assessment", year = "", from = "", to = "" }) {
  const credits = wholeCredits(subject?.credits);
  if (!classroom || !subject || !credits) return null;
  const standard = credits * 10;
  const chosenTerm = storedTerm(term);
  const tests = (assessments || [])
    .filter((item) => {
      if ((papers === "exam" ? item.type !== "exam" : item.type === "exam")) return false;
      if (String(item.classRoom?._id || item.classRoom) !== String(classroom._id)) return false;
      if (String(item.subject?._id || item.subject) !== String(subject._id)) return false;
      if (!termMatches(item.term, chosenTerm)) return false;
      const day = dayKey(item.date);
      const recorded = String(item.academicYear || day.slice(0, 4));
      if (/^\d{4}$/.test(String(year || "")) && recorded !== String(year)) return false;
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => String(a.date || a.createdAt || "").localeCompare(String(b.date || b.createdAt || "")) || String(a.title).localeCompare(String(b.title)));
  const sumMax = tests.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
  const people = (history || [])
    .filter((row) => String(row.classRoom) === String(classroom._id))
    .slice()
    .sort((a, b) => String(a.student?.fullName || "").localeCompare(String(b.student?.fullName || "")));
  const rows = people.map((row) => {
    const scores = new Map((row.marks || []).filter((mark) => mark.assessment?._id).map((mark) => [String(mark.assessment._id), mark.score]));
    const cells = tests.map((test) => {
      const entered = scores.has(String(test._id));
      const max = Number(test.maxScore || 0);
      const raw = entered ? Number(scores.get(String(test._id)) || 0) : 0;
      const share = sumMax > 0 ? (max / sumMax) * standard : 0;
      const onTotal = max > 0 ? oneDecimal((raw / max) * share) : 0;
      return { entered, raw, max, onTotal };
    });
    const final = oneDecimal(cells.reduce((sum, cell) => sum + cell.onTotal, 0));
    return { id: row.student._id, name: row.student.fullName, cells, final };
  });
  return { subject, classroom, credits, standard, tests, rows, sumMax, term: chosenTerm, termLabel: termLabel(chosenTerm) };
}

function buildOpenExamCredit({ assessment, students, marks }) {
  const credits = wholeCredits(assessment?.subject?.credits);
  if (!assessment || assessment.type !== "exam" || !credits) return null;
  const standard = credits * 10;
  const max = Number(assessment.maxScore || 0);
  const rows = (students || []).map((student) => {
    const rawText = marks?.[student._id];
    const raw = rawText === "" || rawText == null ? 0 : Number(rawText);
    const value = Number.isFinite(raw) ? raw : 0;
    const final = max > 0 ? oneDecimal((value / max) * standard) : 0;
    return { id: student._id, name: student.fullName, final };
  });
  return {
    subject: assessment.subject,
    classroom: assessment.classRoom,
    standard,
    tests: [assessment],
    rows,
    termLabel: termLabel(assessment.term),
  };
}

function assessmentLine(sheet) {
  return sheet.tests.map((test) => `${test.title} /${test.maxScore}`).join(" · ");
}

let draftSerial = 1;
function blankDraft(partial = {}) {
  draftSerial += 1;
  return { key: draftSerial, title: "", maxScore: "100", date: isoDay(new Date()), ...partial };
}

function commentForScore(score, ranges) {
  if (score === "" || score == null) return "";
  const value = Number(score);
  if (!Number.isFinite(value)) return "";
  const match = (ranges || []).find((row) => {
    if (row?.from === "" || row?.to === "" || row?.from == null || row?.to == null) return false;
    const from = Number(row.from);
    const to = Number(row.to);
    return Number.isFinite(from) && Number.isFinite(to) && value >= from && value <= to;
  });
  return match ? String(match.comment || "") : "";
}

function blankRange() {
  draftSerial += 1;
  return { key: `range-${draftSerial}`, from: "", to: "", comment: "" };
}

function creditExport(sheet) {
  const header = [t("No."), t("Student"), t("Final /{total}", { total: sheet.standard })];
  const lines = sheet.rows.map((row, index) => [index + 1, row.name, `${showDecimal(row.final)}/${sheet.standard}`]);
  return { header, lines };
}

function summaryExport(sheet) {
  const header = [t("No."), t("Student"), ...sheet.tests.map(summaryHead), t("Final /{total}", { total: sheet.standard })];
  const lines = sheet.rows.map((row, index) => [
    index + 1,
    row.name,
    ...row.cells.map((cell) => (cell.entered ? cell.raw : 0)),
    `${showDecimal(row.final)}/${sheet.standard}`,
  ]);
  return { header, lines };
}

function CreditTable({ sheet, preview }) {
  return (
    <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
      <thead>
        <tr>
          <th>{t("No.")}</th>
          <th>{t("Student")}</th>
          <th>{t("Final /{total}", { total: sheet.standard })}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.rows.map((row, index) => (
          <tr key={row.id}>
            <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
            <td data-label={t("Student")} className="roster-name">{row.name}</td>
            <td data-label={t("Final /{total}", { total: sheet.standard })} className="num">{showDecimal(row.final)}/{sheet.standard}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreditPreview({ school, sheet, onClose, heading = "Credit report", done = "Assessments done" }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="doc-preview" role="dialog" aria-modal="true" aria-label={t(heading)}>
      <div className="doc-toolbar no-print">
        <strong>{t(heading)}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <PrintHeading school={school} title={t(heading)} note={`${sheet.classroom?.name || ""} · ${sheet.termLabel} · ${t("{subject} is marked over {total}.", { subject: sheet.subject.name, total: sheet.standard })}`} />
          <p>{t(done)}: {assessmentLine(sheet)}</p>
          <p>{t("A blank mark counts as 0.")}</p>
          {sheet.rows.length ? <CreditTable sheet={sheet} preview /> : <p>{t("No students in your classes yet.")}</p>}
        </article>
      </div>
    </div>,
    document.body
  );
}

function examMark(value) {
  return value === "" || value == null ? "0" : String(value);
}

function ExamPreview({ school, assessment, students, marks, onClose }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="doc-preview" role="dialog" aria-modal="true" aria-label={t("Examination")}>
      <div className="doc-toolbar no-print">
        <strong>{t("Examination")}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <PrintHeading school={school} title={assessment.title} note={`${assessment.classRoom?.name || t("Class")} · ${assessment.subject?.name || t("Subject")} · ${termLabel(assessment.term)} · /${assessment.maxScore}`} />
          <p>{t("A blank mark counts as 0.")}</p>
          {students.length ? (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Student")}</th>
                  <th>{t("Marks")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={student._id}>
                    <td>{index + 1}</td>
                    <td>{student.fullName}</td>
                    <td>{examMark(marks[student._id])}/{assessment.maxScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>{t("No students in your classes yet.")}</p>}
        </article>
      </div>
    </div>,
    document.body
  );
}

function SummaryTable({ sheet, preview }) {
  return (
    <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
      <thead>
        <tr>
          <th>{t("No.")}</th>
          <th>{t("Student")}</th>
          {sheet.tests.map((test) => <th key={test._id}>{summaryHead(test)}</th>)}
          <th>{t("Final /{total}", { total: sheet.standard })}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.rows.map((row, index) => (
          <tr key={row.id}>
            <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
            <td data-label={t("Student")} className="roster-name">{row.name}</td>
            {row.cells.map((cell, cellIndex) => (
              <td key={sheet.tests[cellIndex]._id} data-label={summaryHead(sheet.tests[cellIndex])} className="num">{cell.entered ? cell.raw : 0}</td>
            ))}
            <td data-label={t("Final /{total}", { total: sheet.standard })} className="num">{showDecimal(row.final)}/{sheet.standard}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryPreview({ school, sheet, onClose }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="doc-preview is-landscape" role="dialog" aria-modal="true" aria-label={t("Summary report")}>
      <div className="doc-toolbar no-print">
        <strong>{t("Summary report")}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <PrintHeading school={school} title={subjectLabel(sheet.subject)} note={`${t("Summary report")} · ${sheet.classroom?.name || ""} · ${sheet.termLabel} · ${t("{subject} is marked over {total}.", { subject: sheet.subject.name, total: sheet.standard })}`} />
          <p>{t("Assessments done")}: {summaryLine(sheet)}</p>
          <p>{t("A blank mark counts as 0.")}</p>
          {sheet.rows.length ? <SummaryTable sheet={sheet} preview /> : <p>{t("No students in your classes yet.")}</p>}
        </article>
      </div>
    </div>,
    document.body
  );
}

function Marks({ token, school, view, reportsOnly = false }) {
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [drafts, setDrafts] = useState(() => [blankDraft()]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [ranges, setRanges] = useState([]);
  const rangeSnap = useRef([]);
  const [assessView, setAssessView] = useState("cards");
  const [history, setHistory] = useState([]);
  const [creditClassId, setCreditClassId] = useState("");
  const [creditSubjectId, setCreditSubjectId] = useState("");
  const [creditDraft, setCreditDraft] = useState("");
  const [creditOpen, setCreditOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [creditTerm, setCreditTerm] = useState("1");
  const [sheetYear, setSheetYear] = useState(String(new Date().getFullYear()));
  const [sheetFrom, setSheetFrom] = useState("");
  const [sheetTo, setSheetTo] = useState("");
  const [assessmentTerm, setAssessmentTerm] = useState("1");
  const [examOpen, setExamOpen] = useState(false);
  const [examCreditOpen, setExamCreditOpen] = useState(false);
  const [examClassId, setExamClassId] = useState("");
  const [attendance, setAttendance] = useState({});
  const [reasons, setReasons] = useState({});

  async function load() {
    const [sheet, rooms] = await Promise.all([
      api("/marks/assessments", { token }),
      api("/academics/classes", { token }),
    ]);
    const roomItems = rooms.items || [];
    const owned = new Set();
    roomItems.forEach((room) => {
      (room.subjects || []).forEach((row) => {
        const subjectKey = row.subject?._id || row.subject;
        if (subjectKey) owned.add(`${room._id}:${subjectKey}`);
      });
    });
    setAssessments((sheet.items || []).filter((item) => owned.has(`${item.classRoom?._id || item.classRoom}:${item.subject?._id || item.subject}`)));
    setClasses(roomItems);
    const withSubject = (rooms.items || []).find((room) => (room.subjects || []).some((row) => row.subject?.name));
    setClassId((current) => current || withSubject?._id || rooms.items?.[0]?._id || "");
    setCreditClassId((current) => current || withSubject?._id || rooms.items?.[0]?._id || "");
  }

  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);
  const historyClassId = view === "examination" ? classId : creditClassId;
  useEffect(() => {
    if (!historyClassId) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    api(`/marks/classes/${historyClassId}/history`, { token })
      .then((page) => { if (!cancelled) setHistory((page.items || []).map((row) => ({ ...row, classRoom: historyClassId }))); })
      .catch((err) => { if (!cancelled) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancelled = true; };
  }, [historyClassId, token, assessments]);
  useEffect(() => {
    if (!selected) return;
    const assessment = assessments.find((item) => item._id === selected);
    const storedRanges = assessment?.ranges?.length ? assessment.ranges : [{ from: "", to: "", comment: "" }];
    setRanges(storedRanges.map((row) => ({ ...blankRange(), from: row.from === 0 || row.from ? String(row.from) : "", to: row.to === 0 || row.to ? String(row.to) : "", comment: row.comment || "" })));
    const roomId = assessment?.classRoom?._id;
    const rosterCall = reportsOnly
      ? (roomId ? api(`/marks/classes/${roomId}/history`, { token }) : Promise.resolve({ items: [] }))
      : api(`/students${roomId ? `?classRoom=${roomId}` : ""}`, { token });
    Promise.all([api(`/marks/assessments/${selected}/marks`, { token }), rosterCall]).then(([sheet, roster]) => {
      const next = {};
      const nextComments = {};
      const nextAttendance = {};
      const nextReasons = {};
      (sheet.items || []).forEach((row) => {
        next[row.student._id] = String(row.score);
        nextComments[row.student._id] = row.comment || commentForScore(row.score, assessment?.ranges);
        nextAttendance[row.student._id] = row.attended === false ? "no" : "yes";
        nextReasons[row.student._id] = row.absenceReason || "";
      });
      setMarks(next);
      setComments(nextComments);
      setAttendance(nextAttendance);
      setReasons(nextReasons);
      if (reportsOnly) {
        const people = new Map();
        (roster.items || []).forEach((row) => {
          if (row.student?._id) people.set(String(row.student._id), { ...row.student });
        });
        (sheet.items || []).forEach((row) => {
          if (!row.student?._id) return;
          const existing = people.get(String(row.student._id)) || {};
          people.set(String(row.student._id), { ...existing, ...row.student });
        });
        setStudents([...people.values()].sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""))));
      } else {
        setStudents(roster.items || []);
      }
    }).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [selected, token]);
  useEffect(() => {
    const previousRanges = rangeSnap.current;
    rangeSnap.current = ranges;
    setComments((current) => {
      const next = { ...current };
      let changed = false;
      students.forEach((student) => {
        const score = marks[student._id];
        const auto = commentForScore(score, ranges);
        const previous = commentForScore(score, previousRanges);
        const existing = current[student._id] || "";
        const previousText = new Set((previousRanges || []).map((row) => String(row.comment || "").trim()).filter(Boolean));
        const followsRange = !existing || existing === previous || previousText.has(existing);
        const replacement = auto ? (followsRange ? auto : existing) : (followsRange ? "" : existing);
        if (replacement !== existing) {
          next[student._id] = replacement;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [ranges]);

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

  const creditRoom = classes.find((item) => item._id === creditClassId);
  const creditSubjects = useMemo(() => (
    (creditRoom?.subjects || []).map((row) => row.subject).filter((subject) => subject?._id && subject?.name)
  ), [creditRoom]);
  const creditSubject = creditSubjects.find((item) => String(item._id) === String(creditSubjectId));

  useEffect(() => {
    const ids = creditSubjects.map((item) => String(item._id));
    if (!ids.length) {
      if (creditSubjectId) setCreditSubjectId("");
      return;
    }
    if (!ids.includes(String(creditSubjectId))) setCreditSubjectId(ids[0]);
  }, [creditSubjects, creditSubjectId]);

  useEffect(() => {
    setCreditDraft(creditSubject?.credits ? String(creditSubject.credits) : "");
  }, [creditSubject]);

  const creditSheet = useMemo(() => buildCreditSheet({
    classroom: creditRoom,
    subject: creditSubject,
    assessments,
    history,
    term: creditTerm,
    year: sheetYear,
    from: sheetFrom,
    to: sheetTo,
  }), [creditRoom, creditSubject, assessments, history, creditTerm, sheetYear, sheetFrom, sheetTo]);

  function updateDraft(index, patch) {
    setDrafts((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function saveAssessment(event) {
    event.preventDefault();
    if (!classId || !subjectId) return notify(t("Not completed"), t("Choose a class and a subject first"), "bad");
    const chosen = listed.find((item) => String(item._id) === String(subjectId));
    if (!chosen) return notify(t("Not completed"), t("Choose a subject that is on this class."), "bad");
    const examPage = view === "examination";
    const source = examPage ? drafts.slice(0, 1) : drafts;
    const items = source.map((row) => ({ title: row.title.trim() || (examPage ? "Examination" : ""), maxScore: Number(row.maxScore), date: row.date, type: examPage ? "exam" : "test" }));
    if (items.some((row) => !row.title)) return notify(t("Not completed"), t("Enter the assessment title"), "bad");
    if (items.some((row) => !Number.isFinite(row.maxScore) || row.maxScore <= 0)) return notify(t("Not completed"), t("Set the mark the assessment is over, for example 100"), "bad");
    if (items.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.date))) return notify(t("Not completed"), t("Set the assessment date as year-month-day, for example 2026-10-16"), "bad");
    const year = String(new Date().getFullYear());
    const ok = await act(async () => {
      if (editingId) {
        await api(`/marks/assessments/${editingId}`, { method: "PATCH", token, body: { ...items[0], classRoom: classId, subject: chosen._id, term: assessmentTerm, type: examPage ? "exam" : "test", academicYear: year } });
      } else {
        const created = await api("/marks/assessments/batch", { method: "POST", token, body: { classRoom: classId, subject: chosen._id, term: assessmentTerm, academicYear: year, items } });
        setSelected(created.items?.[0]?._id || null);
      }
      await load();
    }, examPage ? t("Save examination") : editingId ? t("Assessment updated") : items.length === 1 ? t("Assessment created") : t("{count} assessments created", { count: items.length }), editingId ? `${items[0].title} is now over ${items[0].maxScore}.` : t("Open it to enter marks and comments."));
    if (ok) {
      setEditingId(null);
      setDrafts([blankDraft()]);
    }
  }

  const openAssessment = assessments.find((item) => item._id === selected);
  const examCreditSheet = useMemo(() => buildOpenExamCredit({
    assessment: openAssessment?.type === "exam" ? openAssessment : null,
    students,
    marks,
  }), [openAssessment, students, marks]);
  const assessmentGroups = useMemo(() => {
    const groups = new Map();
    assessments.forEach((item) => {
      if (item.type === "exam") return;
      const key = `${item.classRoom?._id || "class"}:${item.subject?._id || item.subject?.name || "subject"}`;
      const current = groups.get(key) || { key, className: item.classRoom?.name || "Class", subject: subjectLabel(item.subject) || item.subject?.name || "Subject", items: [] };
      current.items.push(item);
      groups.set(key, current);
    });
    return [...groups.values()];
  }, [assessments]);
  function inSheetRange(item) {
    const day = dayKey(item.date);
    const recorded = String(item.academicYear || day.slice(0, 4));
    if (/^\d{4}$/.test(String(sheetYear || "")) && recorded !== String(sheetYear)) return false;
    if (sheetFrom && (!day || day < sheetFrom)) return false;
    if (sheetTo && (!day || day > sheetTo)) return false;
    return true;
  }
  const assessmentList = useMemo(() => (
    assessments.filter((item) => item.type !== "exam" && inSheetRange(item)).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title).localeCompare(String(b.title)))
  ), [assessments, sheetYear, sheetFrom, sheetTo]);
  const examinations = useMemo(() => (
    assessments.filter((item) => item.type === "exam" && inSheetRange(item)).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title).localeCompare(String(b.title)))
  ), [assessments, sheetYear, sheetFrom, sheetTo]);

  function setStudentMark(studentId, value) {
    const text = String(value);
    if (text !== "" && !/^\d*\.?\d*$/.test(text)) return;
    const max = Number(openAssessment?.maxScore);
    if (markIssue(text, max) && !markIssue(marks[studentId], max)) notify(t("Marks"), t("A mark cannot be negative or above the total."), "bad");
    const previous = commentForScore(marks[studentId], ranges);
    const nextAuto = commentForScore(text, ranges);
    const current = comments[studentId] || "";
    setMarks({ ...marks, [studentId]: text });
    if (nextAuto) setComments({ ...comments, [studentId]: nextAuto });
    else if (!current || current === previous) setComments({ ...comments, [studentId]: "" });
  }

  function setAttend(studentId, value) {
    setAttendance({ ...attendance, [studentId]: value });
    if (value !== "no") setReasons({ ...reasons, [studentId]: "" });
  }

  function sheetMarks() {
    const max = Number(openAssessment?.maxScore);
    for (const student of students) {
      const missed = attendance[student._id] === "no";
      if (missed && !String(reasons[student._id] || "").trim()) {
        notify(t("Follow-up"), t("Enter the reason this student did not attend."), "bad");
        return null;
      }
      if (missed) continue;
      const text = String(marks[student._id] ?? "").trim();
      if (!text) continue;
      const score = Number(text);
      if (!Number.isFinite(score) || score < 0 || score > max) {
        notify(t("Marks"), t("A mark cannot be negative or above the total."), "bad");
        return null;
      }
    }
    return students.map((student) => {
      const missed = attendance[student._id] === "no";
      return {
        studentId: student._id,
        score: missed ? 0 : Number(marks[student._id] || 0),
        comment: missed ? "" : comments[student._id],
        attended: !missed,
        absenceReason: missed ? String(reasons[student._id] || "").trim() : "",
      };
    });
  }

  function saveRanges() {
    if (!openAssessment) return;
    const cleaned = [];
    for (const row of ranges) {
      const empty = !String(row.from).trim() && !String(row.to).trim() && !String(row.comment).trim();
      if (empty) continue;
      const from = Number(row.from);
      const to = Number(row.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return notify(t("Mark ranges"), t("Marks ranges must be numbers"), "bad");
      if (from < 0 || to < 0 || from > Number(openAssessment.maxScore) || to > Number(openAssessment.maxScore)) return notify(t("Mark ranges"), t("A mark cannot be negative or above the total."), "bad");
      if (from > to) return notify(t("Mark ranges"), t("The lower mark cannot be above the higher mark."), "bad");
      if (view !== "examination" && !String(row.comment).trim()) return notify(t("Mark ranges"), t("Enter a comment for each range."), "bad");
      cleaned.push({ from, to, comment: row.comment.trim() });
    }
    const date = openAssessment.date ? isoDay(new Date(openAssessment.date)) : isoDay(new Date());
    act(async () => {
      await api(`/marks/assessments/${openAssessment._id}`, {
        method: "PATCH",
        token,
        body: {
          title: openAssessment.title,
          maxScore: openAssessment.maxScore,
          classRoom: openAssessment.classRoom?._id || openAssessment.classRoom,
          subject: openAssessment.subject?._id || openAssessment.subject,
          date,
          term: storedTerm(openAssessment.term),
          ranges: cleaned,
        },
      });
      const nextComments = { ...comments };
      students.forEach((student) => {
        const auto = commentForScore(marks[student._id], cleaned);
        if (auto) nextComments[student._id] = auto;
      });
      setComments(nextComments);
      await load();
    }, t("Ranges saved"), t("The comment follows the mark range."));
  }

  function requireCreditSheet() {
    if (!creditSubject) return notify(t("Subject credits"), t("Choose a class and a subject first"), "bad");
    if (!wholeCredits(creditSubject.credits)) return notify(t("Subject credits"), t("Set the credits before you download."), "bad");
    if (!creditSheet?.tests.length) {
      const hasAny = assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam");
      return notify(t("Credit report"), t(hasAny ? "No assessments in this term." : "Add at least one assessment for this subject first."), "bad");
    }
    return creditSheet;
  }

  function saveSubjectCredits() {
    const credits = wholeCredits(creditDraft);
    if (!creditSubject) return notify(t("Subject credits"), t("Choose a class and a subject first"), "bad");
    if (!credits) return notify(t("Subject credits"), t("Enter the credits for this subject. 1 credit equals 10 marks."), "bad");
    act(() => api(`/academics/subjects/${creditSubject._id}`, { method: "PATCH", token, body: { credits } }).then(load), t("Save credits"), t("{subject} is marked over {total}.", { subject: creditSubject.name, total: credits * 10 }));
  }

  function saveCreditExcel() {
    const sheet = requireCreditSheet();
    if (!sheet) return;
    const { header, lines } = creditExport(sheet);
    const csv = [`\uFEFF${csvCell(sheet.termLabel)}`, `${csvCell(t("Assessments done"))},${csvCell(assessmentLine(sheet))}`, header.map(csvCell).join(","), ...lines.map((line) => line.map(csvCell).join(","))].join("\n");
    downloadFile(`${creditFileName(sheet.subject.name)}.csv`, "text/csv;charset=utf-8", csv);
  }

  function saveCreditWord() {
    const sheet = requireCreditSheet();
    if (!sheet) return;
    const { header, lines } = creditExport(sheet);
    const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>${lines.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(t("Credit report"))}</title></head><body><h1>${escapeHtml(school?.name || "IshuriApp")}</h1><p>${escapeHtml(sheet.classroom.name)} · ${escapeHtml(sheet.termLabel)} · ${escapeHtml(t("{subject} is marked over {total}.", { subject: sheet.subject.name, total: sheet.standard }))}</p><p>${escapeHtml(t("Assessments done"))}: ${escapeHtml(assessmentLine(sheet))}</p><p>${escapeHtml(t("A blank mark counts as 0."))}</p>${table}</body></html>`;
    downloadFile(`${creditFileName(sheet.subject.name)}.doc`, "application/msword", html);
  }

  function saveSummaryExcel() {
    const sheet = requireCreditSheet();
    if (!sheet) return;
    const { header, lines } = summaryExport(sheet);
    const csv = [`\uFEFF${csvCell(sheet.termLabel)}`, `${csvCell(t("Assessments done"))},${csvCell(summaryLine(sheet))}`, header.map(csvCell).join(","), ...lines.map((line) => line.map(csvCell).join(","))].join("\n");
    downloadFile(`${summaryFileName(sheet.subject.name)}.csv`, "text/csv;charset=utf-8", csv);
  }

  function saveSummaryWord() {
    const sheet = requireCreditSheet();
    if (!sheet) return;
    const { header, lines } = summaryExport(sheet);
    const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>${lines.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(t("Summary report"))}</title></head><body><h1>${escapeHtml(school?.name || "IshuriApp")}</h1><p>${escapeHtml(sheet.classroom.name)} · ${escapeHtml(sheet.termLabel)} · ${escapeHtml(t("{subject} is marked over {total}.", { subject: sheet.subject.name, total: sheet.standard }))}</p><p>${escapeHtml(t("Assessments done"))}: ${escapeHtml(summaryLine(sheet))}</p><p>${escapeHtml(t("A blank mark counts as 0."))}</p>${table}</body></html>`;
    downloadFile(`${summaryFileName(sheet.subject.name)}.doc`, "application/msword", html);
  }

  function examinationLines() {
    if (!openAssessment || openAssessment.type !== "exam") return null;
    const header = [t("No."), t("Student"), t("Marks")];
    const lines = students.map((student, index) => [index + 1, student.fullName, `${examMark(marks[student._id])}/${openAssessment.maxScore}`]);
    return { header, lines };
  }

  function saveExaminationExcel() {
    const sheet = examinationLines();
    if (!sheet || !openAssessment) return;
    const subjectName = openAssessment.subject?.name || "subject";
    const csv = [`\uFEFF${csvCell(t("Examination"))}`, `${csvCell(openAssessment.title)},${csvCell(subjectName)},${csvCell(openAssessment.classRoom?.name || "")}`, sheet.header.map(csvCell).join(","), ...sheet.lines.map((line) => line.map(csvCell).join(","))].join("\n");
    downloadFile(`${examFileName(subjectName)}.csv`, "text/csv;charset=utf-8", csv);
  }

  function saveExaminationWord() {
    const sheet = examinationLines();
    if (!sheet || !openAssessment) return;
    const subjectName = openAssessment.subject?.name || "subject";
    const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${sheet.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>${sheet.lines.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(t("Examination"))}</title></head><body><h1>${escapeHtml(school?.name || "IshuriApp")}</h1><p>${escapeHtml(openAssessment.title)} · ${escapeHtml(subjectName)} · ${escapeHtml(openAssessment.classRoom?.name || "")} · ${escapeHtml(termLabel(openAssessment.term))} · /${escapeHtml(openAssessment.maxScore)}</p><p>${escapeHtml(t("A blank mark counts as 0."))}</p>${table}</body></html>`;
    downloadFile(`${examFileName(subjectName)}.doc`, "application/msword", html);
  }

  function requireExamCreditSheet() {
    if (!openAssessment || openAssessment.type !== "exam") return notify(t("Credited examination marks"), t("Open an examination to see its credited marks."), "bad");
    if (!wholeCredits(openAssessment.subject?.credits)) return notify(t("Subject credits"), t("Set the credits before you download."), "bad");
    if (!examCreditSheet?.rows.length) return notify(t("Credited examination marks"), t("No students in your classes yet."), "bad");
    return examCreditSheet;
  }

  function saveExamCreditExcel() {
    const sheet = requireExamCreditSheet();
    if (!sheet) return;
    const { header, lines } = creditExport(sheet);
    const csv = [`\uFEFF${csvCell(sheet.termLabel)}`, `${csvCell(t("Examination"))},${csvCell(assessmentLine(sheet))}`, header.map(csvCell).join(","), ...lines.map((line) => line.map(csvCell).join(","))].join("\n");
    downloadFile(`${examCreditFileName(sheet.subject?.name)}.csv`, "text/csv;charset=utf-8", csv);
  }

  function saveExamCreditWord() {
    const sheet = requireExamCreditSheet();
    if (!sheet) return;
    const { header, lines } = creditExport(sheet);
    const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>${lines.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(t("Credited examination marks"))}</title></head><body><h1>${escapeHtml(school?.name || "IshuriApp")}</h1><p>${escapeHtml(sheet.classroom?.name || "")} · ${escapeHtml(sheet.termLabel)} · ${escapeHtml(t("{subject} is marked over {total}.", { subject: sheet.subject?.name || "", total: sheet.standard }))}</p><p>${escapeHtml(t("Examination"))}: ${escapeHtml(assessmentLine(sheet))}</p><p>${escapeHtml(t("A blank mark counts as 0."))}</p>${table}</body></html>`;
    downloadFile(`${examCreditFileName(sheet.subject?.name)}.doc`, "application/msword", html);
  }

  if (view === "examination" && reportsOnly) {
    const showing = openAssessment?.type === "exam" ? openAssessment : null;
    const visible = examinations.filter((item) => !examClassId || String(item.classRoom?._id || item.classRoom) === String(examClassId));
    return (
      <div className="sections assess">
        <section className="panel sections no-print">
          <header className="assess-head">
            <span className="assess-mark"><Icon name="graduate" /></span>
            <div>
              <p className="kicker">{t("Director of Studies")}</p>
              <h2>{t("Examination")}</h2>
            </div>
          </header>
          <p className="muted">{t("Every examination entered by the teachers, with the class, subject and marks.")}</p>
          <p className="muted">{t("Examination marks are kept on their own. They are not included in assessment reports.")}</p>
          <div className="form-grid">
            <label className="field">{t("Class")}
              <select value={examClassId} onChange={(event) => setExamClassId(event.target.value)}>
                <option value="">{t("All classes")}</option>
                {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
            <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
          </div>
          {visible.length === 0 ? <p className="roster-empty">{t("No examinations yet.")}</p> : (
            <table className="board roster-table">
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Teacher")}</th>
                  <th>{t("Examination")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Subject")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Term")}</th>
                  <th>{t("Over")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, index) => (
                  <tr key={item._id}>
                    <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                    <td data-label={t("Teacher")}>{item.teacher?.fullName || "—"}</td>
                    <td data-label={t("Examination")} className="roster-name">{item.title}</td>
                    <td data-label={t("Class")}>{item.classRoom?.name || t("Class")}</td>
                    <td data-label={t("Subject")}>{item.subject?.name || t("Subject")}</td>
                    <td data-label={t("Date")}>{item.date ? prettyKey(dayKey(item.date)) : "—"}</td>
                    <td data-label={t("Term")}>{termLabel(item.term)}</td>
                    <td data-label={t("Over")} className="num">{item.maxScore}</td>
                    <td data-label={t("Actions")}>
                      <button className="ghost" type="button" onClick={() => setSelected(item._id)}>{selected === item._id ? t("Selected") : t("Open marks")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {showing ? (
          <section className="roster assess-sheet no-print">
            <header className="roster-head">
              <div>
                <p className="kicker">{t("Examination")}</p>
                <h2>{showing.title}</h2>
                <p className="muted">{showing.teacher?.fullName || t("Teacher")} · {showing.subject?.name || t("Subject")} · {showing.classRoom?.name || t("Class")} · {termLabel(showing.term)} · /{showing.maxScore}</p>
              </div>
              <span className="roster-count">{students.length}</span>
            </header>
            <p className="muted">{t("Students who attended and students who did not, with the reason.")}</p>
            <table className="board roster-table">
              <thead>
                <tr><th>{t("No.")}</th><th>{t("Student")}</th><th>{t("Parent phone")}</th><th>{t("Marks")}</th><th>{t("Comment")}</th><th>{t("Attended")}</th><th>{t("Reason")}</th></tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={student._id}>
                    <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                    <td data-label={t("Student")} className="roster-name">{student.fullName}</td>
                    <td data-label={t("Parent phone")}>{localPhone(parentOf(student)?.phone) || t("No phone")}</td>
                    <td data-label={t("Marks")} className="num">{examMark(marks[student._id])}/{showing.maxScore}</td>
                    <td data-label={t("Comment")}>{comments[student._id] || "—"}</td>
                    <td data-label={t("Attended")}>{attendance[student._id] == null ? t("Not recorded") : attendance[student._id] === "no" ? t("Did not attend") : t("Attended")}</td>
                    <td data-label={t("Reason")}>{attendance[student._id] === "no" ? (reasons[student._id] || "—") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="actions assess-save">
              <button className="ghost" type="button" onClick={() => setExamOpen(true)}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveExaminationExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveExaminationWord}>{t("Word")}</button>
            </div>
          </section>
        ) : null}
        {examOpen && showing ? <ExamPreview school={school} assessment={showing} students={students} marks={marks} onClose={() => setExamOpen(false)} /> : null}
        {showing && examCreditSheet ? (
          <section className="panel sections no-print">
            <header className="assess-head">
              <span className="assess-mark"><Icon name="award" /></span>
              <div>
                <p className="kicker">{t("Subject credits")}</p>
                <h2>{t("Credited examination marks")}</h2>
              </div>
            </header>
            <p className="muted">{t("1 credit equals 10 marks.")}</p>
            <p className="muted">{t("Each examination is scaled onto the subject credits. The download lists the credited mark only.")}</p>
            <p>{t("{subject} is marked over {total}.", { subject: examCreditSheet.subject?.name, total: examCreditSheet.standard })}</p>
            <p className="muted">{examCreditSheet.termLabel} · {t("Examination")}: {assessmentLine(examCreditSheet)} · {t("A blank mark counts as 0.")}</p>
            <div className="actions">
              <button className="solid" type="button" onClick={() => { if (requireExamCreditSheet()) setExamCreditOpen(true); }}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveExamCreditExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveExamCreditWord}>{t("Word")}</button>
            </div>
            {examCreditSheet.rows.length ? <CreditTable sheet={examCreditSheet} /> : <p className="roster-empty">{t("No students in your classes yet.")}</p>}
          </section>
        ) : showing ? <p className="muted">{t("Set the credits before you download.")}</p> : <p className="muted">{t("Open an examination to see its credited marks.")}</p>}
        {examCreditOpen && examCreditSheet ? <CreditPreview school={school} sheet={examCreditSheet} onClose={() => setExamCreditOpen(false)} heading="Credited examination marks" done="Examination" /> : null}
      </div>
    );
  }

  if (view === "examination") {
    const row = drafts[0];
    const showing = openAssessment?.type === "exam" ? openAssessment : null;
    return (
      <div className="sections assess">
        <form className="panel form-grid assess-create no-print" onSubmit={saveAssessment}>
          <header className="assess-head">
            <span className="assess-mark"><Icon name="graduate" /></span>
            <div>
              <p className="kicker">{t("Examination")}</p>
              <h2>{editingId ? t("Edit") : t("New examination")}</h2>
            </div>
          </header>
          <p className="muted span">{t("Examination marks are kept on their own. They are not included in assessment reports.")}</p>
          <Field label="Title" value={row.title} onChange={(value) => updateDraft(0, { title: value })} />
          <Field label="Over" value={row.maxScore} onChange={(value) => updateDraft(0, { maxScore: value })} />
          <Field label="Examination" value={row.date} onChange={(value) => updateDraft(0, { date: value })} placeholder="2026-11-12" />
          <TermField value={assessmentTerm} onChange={setAssessmentTerm} />
          <label className="field">{t("Class")}
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">{t("Subject")}
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              {listed.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
              {listed.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
            </select>
          </label>
          <div className="actions">
            <button className="solid" type="submit"><Icon name="pen" />{editingId ? t("Save changes") : t("Save examination")}</button>
            {editingId ? <button className="ghost" type="button" onClick={() => { setEditingId(null); setDrafts([blankDraft()]); }}>{t("Cancel edit")}</button> : null}
          </div>
        </form>
        <div className="sections no-print">
          <div className="form-grid">
            <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
          </div>
          <header className="roster-head">
            <div>
              <p className="kicker">{t("Examination")}</p>
              <h2>{t("Examination")}</h2>
            </div>
          </header>
          {examinations.length === 0 ? <p className="roster-empty">{t("No examinations yet.")}</p> : (
            <table className="board roster-table">
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Examination")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Subject")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Term")}</th>
                  <th>{t("Over")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {examinations.map((item, index) => (
                  <tr key={item._id}>
                    <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                    <td data-label={t("Examination")} className="roster-name">{item.title}</td>
                    <td data-label={t("Class")}>{item.classRoom?.name || t("Class")}</td>
                    <td data-label={t("Subject")}>{item.subject?.name || t("Subject")}</td>
                    <td data-label={t("Date")}>{item.date ? prettyKey(dayKey(item.date)) : "—"}</td>
                    <td data-label={t("Term")}>{termLabel(item.term)}</td>
                    <td data-label={t("Over")} className="num">{item.maxScore}</td>
                    <td data-label={t("Actions")}>
                      <div className="roster-actions">
                        <button className="ghost" type="button" onClick={() => setSelected(item._id)}>{selected === item._id ? t("Selected") : t("Open marks")}</button>
                        <button className="ghost" type="button" onClick={() => { setEditingId(item._id); setAssessmentTerm(storedTerm(item.term)); setDrafts([blankDraft({ title: item.title, maxScore: String(item.maxScore), date: item.date ? isoDay(new Date(item.date)) : isoDay(new Date()) })]); if (item.classRoom?._id) setClassId(item.classRoom._id); if (item.subject?._id) setSubjectId(item.subject._id); }}><Icon name="pen" />{t("Edit")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {showing ? (
          <section className="roster assess-sheet no-print">
            <header className="roster-head">
              <div>
                <p className="kicker">{t("Examination")}</p>
                <h2>{showing.title}</h2>
                <p className="muted">{showing.subject?.name || t("Subject")} · {showing.classRoom?.name || t("Class")} · {termLabel(showing.term)} · /{showing.maxScore}</p>
              </div>
              <span className="roster-count">{students.length}</span>
            </header>
            <section className="range-panel">
              <header className="range-head">
                <h3>{t("Mark ranges")}</h3>
                <p>{t("A comment is optional. When you add one, the first range that contains the mark fills it.")}</p>
              </header>
              <div className="range-board">
                {ranges.map((range, index) => (
                  <article className="range-card" key={range.key}>
                    <div className="range-card-top">
                      <span className="range-index">{index + 1}</span>
                      {ranges.length > 1 ? <button className="danger" type="button" onClick={() => setRanges((current) => current.filter((item) => item.key !== range.key))}>{t("Remove range")}</button> : null}
                    </div>
                    <div className="range-fields">
                      <Field label="From mark" value={range.from} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, from: value } : item))} />
                      <Field label="To mark" value={range.to} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, to: value } : item))} />
                    </div>
                    <Field label="Comment" value={range.comment} placeholder={t("Optional")} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, comment: value } : item))} />
                  </article>
                ))}
              </div>
              <div className="actions">
                <button className="ghost" type="button" onClick={() => setRanges((current) => [...current, blankRange()])}>{t("Add a range")}</button>
                <button className="solid" type="button" onClick={saveRanges}>{t("Save ranges")}</button>
              </div>
            </section>
            <p className="muted">{t("A student who did not attend is saved as 0. Write the reason.")}</p>
            <ValidationAlert message={students.some((student) => attendance[student._id] !== "no" && markIssue(marks[student._id], showing?.maxScore)) ? "A mark cannot be negative or above the total." : ""} />
            <table className="board roster-table">
              <thead>
                <tr><th>{t("No.")}</th><th>{t("Student")}</th><th>{t("Parent phone")}</th><th>{t("Marks")}</th><th>{t("Comment")}</th><th>{t("Attended")}</th><th>{t("Reason")}</th></tr>
              </thead>
              <tbody>
                {students.map((student, index) => {
                  const missed = attendance[student._id] === "no";
                  return (
                  <tr key={student._id}>
                    <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                    <td data-label={t("Student")} className="roster-name">{student.fullName}</td>
                    <td data-label={t("Parent phone")} className="roster-phone">{localPhone(parentOf(student)?.phone) || t("No phone")}</td>
                    <td data-label={t("Marks")}><input disabled={missed} className={!missed && markIssue(marks[student._id], showing?.maxScore) ? "invalid" : undefined} aria-invalid={!missed && markIssue(marks[student._id], showing?.maxScore) ? true : undefined} aria-label={t("Marks")} inputMode="decimal" value={missed ? "0" : (marks[student._id] || "")} onChange={(event) => setStudentMark(student._id, event.target.value)} /></td>
                    <td data-label={t("Comment")}><input disabled={missed} aria-label={t("Comment")} placeholder={t("Optional")} value={missed ? "" : (comments[student._id] || "")} onChange={(event) => setComments({ ...comments, [student._id]: event.target.value })} /></td>
                    <td data-label={t("Attended")}>
                      <select aria-label={t("Attended")} value={missed ? "no" : "yes"} onChange={(event) => setAttend(student._id, event.target.value)}>
                        <option value="yes">{t("Attended")}</option>
                        <option value="no">{t("Did not attend")}</option>
                      </select>
                    </td>
                    <td data-label={t("Reason")}><input aria-label={t("Reason")} maxLength={160} disabled={!missed} placeholder={missed ? t("Reason") : ""} value={reasons[student._id] || ""} onChange={(event) => setReasons({ ...reasons, [student._id]: event.target.value })} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="actions assess-save">
              <button className="solid" type="button" onClick={() => { const rows = sheetMarks(); if (!rows) return; act(async () => { await api(`/marks/assessments/${showing._id}/marks`, { method: "POST", token, body: { marks: rows } }); await load(); }, t("Sheet saved"), t("Marks and comments are stored.")); }}><Icon name="check" />{t("Save sheet")}</button>
              <button className="ghost" type="button" onClick={() => setExamOpen(true)}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveExaminationExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveExaminationWord}>{t("Word")}</button>
            </div>
          </section>
        ) : null}
        {examOpen && showing ? <ExamPreview school={school} assessment={showing} students={students} marks={marks} onClose={() => setExamOpen(false)} /> : null}
        {showing && examCreditSheet ? (
          <section className="panel sections no-print">
            <header className="assess-head">
              <span className="assess-mark"><Icon name="award" /></span>
              <div>
                <p className="kicker">{t("Subject credits")}</p>
                <h2>{t("Credited examination marks")}</h2>
              </div>
            </header>
            <p className="muted">{t("1 credit equals 10 marks.")}</p>
            <p className="muted">{t("Each examination is scaled onto the subject credits. The download lists the credited mark only.")}</p>
            <p>{t("{subject} is marked over {total}.", { subject: examCreditSheet.subject?.name, total: examCreditSheet.standard })}</p>
            <p className="muted">{examCreditSheet.termLabel} · {t("Examination")}: {assessmentLine(examCreditSheet)} · {t("A blank mark counts as 0.")}</p>
            <div className="actions">
              <button className="solid" type="button" onClick={() => { if (requireExamCreditSheet()) setExamCreditOpen(true); }}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveExamCreditExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveExamCreditWord}>{t("Word")}</button>
            </div>
            {examCreditSheet.rows.length ? <CreditTable sheet={examCreditSheet} /> : <p className="roster-empty">{t("No students in your classes yet.")}</p>}
          </section>
        ) : showing ? <p className="muted">{t("Set the credits before you download.")}</p> : <p className="muted">{t("Open an examination to see its credited marks.")}</p>}
        {examCreditOpen && examCreditSheet ? <CreditPreview school={school} sheet={examCreditSheet} onClose={() => setExamCreditOpen(false)} heading="Credited examination marks" done="Examination" /> : null}
      </div>
    );
  }

  if (reportsOnly) {
    const showSummary = view !== "credits";
    const showCredit = view !== "summary";
    const reportFilters = (
      <div className="form-grid">
        <label className="field">{t("Class")}
          <select value={creditClassId} onChange={(event) => setCreditClassId(event.target.value)}>
            {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">{t("Subject")}
          <select value={creditSubjectId} onChange={(event) => setCreditSubjectId(event.target.value)}>
            {creditSubjects.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
            {creditSubjects.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
          </select>
        </label>
        <TermField value={creditTerm} onChange={setCreditTerm} />
        <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
      </div>
    );
    return (
      <div className="sections assess">
        {showSummary ? (
          <section className="panel sections no-print">
            <header className="assess-head">
              <span className="assess-mark"><Icon name="award" /></span>
              <div>
                <p className="kicker">{t("Summary report")}</p>
                <h2>{t("Assessments done")}</h2>
              </div>
            </header>
            <p className="muted">{t("Choose a class and a subject. The sheet lists every assessment in the term.")}</p>
            {reportFilters}
            {creditSubject && wholeCredits(creditSubject.credits) ? (
              <p>{t("{subject} is marked over {total}.", { subject: creditSubject.name, total: subjectTotal(creditSubject.credits) })}</p>
            ) : (
              <p>{t("Set the credits before you download.")}</p>
            )}
            {creditSheet?.tests.length ? <p className="muted">{creditSheet.termLabel} · {t("Assessments done")}: {summaryLine(creditSheet)} · {t("A blank mark counts as 0.")}</p> : <p className="muted">{assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam") ? t("No assessments in this term.") : t("Add at least one assessment for this subject first.")}</p>}
            <div className="actions">
              <button className="solid" type="button" onClick={() => { if (requireCreditSheet()) setSummaryOpen(true); }}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveSummaryExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveSummaryWord}>{t("Word")}</button>
            </div>
            {creditSheet?.tests.length ? (
              creditSheet.rows.length ? <div className="summary-wrap"><SummaryTable sheet={creditSheet} /></div> : <p className="roster-empty">{t("No students in your classes yet.")}</p>
            ) : null}
          </section>
        ) : null}
        {showCredit ? (
          <section className="panel sections no-print">
            <header className="assess-head">
              <span className="assess-mark"><Icon name="award" /></span>
              <div>
                <p className="kicker">{t("Subject credits")}</p>
                <h2>{t("Credit report")}</h2>
              </div>
            </header>
            <p className="muted">{t("1 credit equals 10 marks.")}</p>
            {showSummary ? null : reportFilters}
            {creditSubject && wholeCredits(creditSubject.credits) ? (
              <p>{t("{subject} is marked over {total}.", { subject: creditSubject.name, total: subjectTotal(creditSubject.credits) })}</p>
            ) : (
              <p>{t("Set the credits before you download.")}</p>
            )}
            {creditSheet?.tests.length ? <p className="muted">{creditSheet.termLabel} · {t("Assessments done")}: {assessmentLine(creditSheet)} · {t("A blank mark counts as 0.")}</p> : <p className="muted">{assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam") ? t("No assessments in this term.") : t("Add at least one assessment for this subject first.")}</p>}
            <div className="actions">
              <button className="solid" type="button" onClick={() => { if (requireCreditSheet()) setCreditOpen(true); }}>{t("Print / Save PDF")}</button>
              <button className="ghost" type="button" onClick={saveCreditExcel}>{t("Excel")}</button>
              <button className="ghost" type="button" onClick={saveCreditWord}>{t("Word")}</button>
            </div>
            {creditSheet?.tests.length ? (
              creditSheet.rows.length ? <CreditTable sheet={creditSheet} /> : <p className="roster-empty">{t("No students in your classes yet.")}</p>
            ) : null}
          </section>
        ) : null}
        {summaryOpen && creditSheet ? <SummaryPreview school={school} sheet={creditSheet} onClose={() => setSummaryOpen(false)} /> : null}
        {creditOpen && creditSheet ? <CreditPreview school={school} sheet={creditSheet} onClose={() => setCreditOpen(false)} /> : null}
      </div>
    );
  }

  if (view === "summary") {
    const missingCredits = creditSubject && !wholeCredits(creditSubject.credits);
    return (
      <div className="sections assess">
        <section className="panel sections no-print">
          <header className="assess-head">
            <span className="assess-mark"><Icon name="award" /></span>
            <div>
              <p className="kicker">{t("Summary report")}</p>
              <h2>{t("Assessments done")}</h2>
            </div>
          </header>
          <p className="muted">{t("Choose a class and a subject. The sheet lists every assessment in the term.")}</p>
          <div className="form-grid">
            <label className="field">{t("Class")}
              <select value={creditClassId} onChange={(event) => setCreditClassId(event.target.value)}>
                {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">{t("Subject")}
              <select value={creditSubjectId} onChange={(event) => setCreditSubjectId(event.target.value)}>
                {creditSubjects.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
                {creditSubjects.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
              </select>
            </label>
            <TermField value={creditTerm} onChange={setCreditTerm} />
        <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
            {missingCredits ? <Field label="Subject credits" value={creditDraft} onChange={setCreditDraft} placeholder="6" /> : null}
            {missingCredits ? <div className="actions"><button className="ghost" type="button" onClick={saveSubjectCredits}>{t("Save credits")}</button></div> : null}
          </div>
          {creditSubject && wholeCredits(creditSubject.credits) ? (
            <p>{t("{subject} is marked over {total}.", { subject: creditSubject.name, total: subjectTotal(creditSubject.credits) })}</p>
          ) : (
            <p>{t("Set the credits before you download.")}</p>
          )}
          {creditSheet?.tests.length ? <p className="muted">{creditSheet.termLabel} · {t("Assessments done")}: {summaryLine(creditSheet)} · {t("A blank mark counts as 0.")}</p> : <p className="muted">{assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam") ? t("No assessments in this term.") : t("Add at least one assessment for this subject first.")}</p>}
          <div className="actions">
            <button className="solid" type="button" onClick={() => { if (requireCreditSheet()) setSummaryOpen(true); }}>{t("Print / Save PDF")}</button>
            <button className="ghost" type="button" onClick={saveSummaryExcel}>{t("Excel")}</button>
            <button className="ghost" type="button" onClick={saveSummaryWord}>{t("Word")}</button>
          </div>
        </section>
        {creditSheet?.tests.length ? (
          creditSheet.rows.length ? <div className="summary-wrap"><SummaryTable sheet={creditSheet} /></div> : <p className="roster-empty">{t("No students in your classes yet.")}</p>
        ) : null}
        {summaryOpen && creditSheet ? <SummaryPreview school={school} sheet={creditSheet} onClose={() => setSummaryOpen(false)} /> : null}
      </div>
    );
  }

  if (view === "credits") {
    return (
      <div className="sections assess">
        <section className="panel sections no-print">
          <header className="assess-head">
            <span className="assess-mark"><Icon name="award" /></span>
            <div>
              <p className="kicker">{t("Subject credits")}</p>
              <h2>{t("Credited marks")}</h2>
            </div>
          </header>
          <p className="muted">{t("1 credit equals 10 marks.")}</p>
          <div className="form-grid">
            <label className="field">{t("Class")}
              <select value={creditClassId} onChange={(event) => setCreditClassId(event.target.value)}>
                {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">{t("Subject")}
              <select value={creditSubjectId} onChange={(event) => setCreditSubjectId(event.target.value)}>
                {creditSubjects.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
                {creditSubjects.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
              </select>
            </label>
            <TermField value={creditTerm} onChange={setCreditTerm} />
        <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
            <Field label="Subject credits" value={creditDraft} onChange={setCreditDraft} placeholder="6" />
            <div className="actions">
              <button className="ghost" type="button" onClick={saveSubjectCredits}>{t("Save credits")}</button>
            </div>
          </div>
          {creditSubject && wholeCredits(creditSubject.credits) ? (
            <p>{t("{subject} is marked over {total}.", { subject: creditSubject.name, total: subjectTotal(creditSubject.credits) })}</p>
          ) : (
            <p>{t("Set the credits before you download.")}</p>
          )}
          {creditSheet?.tests.length ? <p className="muted">{creditSheet.termLabel} · {t("Assessments done")}: {assessmentLine(creditSheet)} · {t("A blank mark counts as 0.")}</p> : <p className="muted">{assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam") ? t("No assessments in this term.") : t("Add at least one assessment for this subject first.")}</p>}
          <div className="actions">
            <button className="solid" type="button" onClick={() => { if (requireCreditSheet()) setCreditOpen(true); }}>{t("Print / Save PDF")}</button>
            <button className="ghost" type="button" onClick={saveCreditExcel}>{t("Excel")}</button>
            <button className="ghost" type="button" onClick={saveCreditWord}>{t("Word")}</button>
          </div>
          {creditSheet?.tests.length ? (
            creditSheet.rows.length ? <CreditTable sheet={creditSheet} /> : <p className="roster-empty">{t("No students in your classes yet.")}</p>
          ) : null}
        </section>
        {creditOpen && creditSheet ? <CreditPreview school={school} sheet={creditSheet} onClose={() => setCreditOpen(false)} /> : null}
      </div>
    );
  }

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
        <p className="muted span">{t("Add as many assessments as this subject needs. The final mark uses every one.")}</p>
        <div className="span sections">
          {drafts.map((row, index) => (
            <div className="form-grid" key={row.key}>
              <Field label="Title" value={row.title} onChange={(value) => updateDraft(index, { title: value })} />
              <Field label="Over" value={row.maxScore} onChange={(value) => updateDraft(index, { maxScore: value })} />
              <Field label="Assessment date" value={row.date} onChange={(value) => updateDraft(index, { date: value })} placeholder="2026-10-16" />
              {!editingId && drafts.length > 1 ? <button className="danger" type="button" onClick={() => setDrafts((current) => current.filter((item) => item.key !== row.key))}>{t("Remove assessment")}</button> : null}
            </div>
          ))}
        </div>
        <TermField value={assessmentTerm} onChange={setAssessmentTerm} />
        <label className="field">Class
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">Subject
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {listed.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
            {listed.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
          </select>
        </label>
        <div className="actions">
          <button className="solid" type="submit"><Icon name="pen" />{editingId ? "Save changes" : "Create assessment"}</button>
          {editingId ? <button className="ghost" type="button" onClick={() => { setEditingId(null); setDrafts([blankDraft()]); }}>{t("Cancel edit")}</button> : null}
        </div>
      </form>
      <div className="sections no-print">
        <div className="form-grid">
          <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
        </div>
        <header className="roster-head">
          <div>
            <p className="kicker"><Icon name="book" />{t("Assessment list")}</p>
            <h2>{t("Assessments")}</h2>
            <p className="muted">{t("All assessments, with the date and the term.")}</p>
          </div>
          <div className="chips">
            <button type="button" className={assessView === "cards" ? "on" : ""} onClick={() => setAssessView("cards")}>{t("Cards")}</button>
            <button type="button" className={assessView === "list" ? "on" : ""} onClick={() => setAssessView("list")}>{t("List")}</button>
          </div>
        </header>
        {assessView === "list" ? (
          assessmentList.length === 0 ? <p className="roster-empty">{t("No assessments yet.")}</p> : (
            <div className="assess-list">
              {assessmentList.map((item, index) => (
                <article key={item._id} className={`assess-line${selected === item._id ? " on" : ""}`}>
                  <span className="roster-no">{index + 1}</span>
                  <div className="assess-line-copy">
                    <strong>{item.title}</strong>
                    <ul className="assess-facts">
                      <li><Icon name="graduate" />{item.classRoom?.name || t("Class")}</li>
                      <li><Icon name="book" />{item.subject?.name || t("Subject")}</li>
                      <li><Icon name="calendar" />{item.date ? prettyKey(dayKey(item.date)) : "—"}</li>
                      <li>{termLabel(item.term)}</li>
                      <li>{t("Over")} {item.maxScore}</li>
                    </ul>
                  </div>
                  <div className="roster-actions">
                    <button className="ghost" type="button" onClick={() => setSelected(item._id)}>{selected === item._id ? t("Selected") : t("Open marks")}</button>
                    <button className="ghost" type="button" onClick={() => { setEditingId(item._id); setAssessmentTerm(storedTerm(item.term)); setDrafts([blankDraft({ title: item.title, maxScore: String(item.maxScore), date: item.date ? isoDay(new Date(item.date)) : isoDay(new Date()) })]); if (item.classRoom?._id) setClassId(item.classRoom._id); if (item.subject?._id) setSubjectId(item.subject._id); }}><Icon name="pen" />{t("Edit")}</button>
                    <button className="danger" type="button" onClick={() => {
                      if (!window.confirm(t("Delete {name}? The saved marks will be removed too.", { name: item.title }))) return;
                      act(async () => {
                        await api(`/marks/assessments/${item._id}`, { method: "DELETE", token });
                        if (selected === item._id) setSelected(null);
                        await load();
                      }, t("Assessment deleted"), `${item.title} and its marks were removed.`);
                    }}>{t("Delete")}</button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : assessmentGroups.map((group) => (
          <section key={group.key} className="sections">
            <p className="kicker">{group.className} · {t("{count} assessments in {subject}", { count: group.items.length, subject: group.subject })}</p>
            <div className="assess-board">
        {group.items.map((item) => (
          <article key={item._id} className={`assess-card${selected === item._id ? " on" : ""}`}>
            <div className="assess-art">
              <span className="assess-mark"><Icon name="pen" /></span>
              <strong>{item.maxScore}</strong>
              <span>{t("over")}</span>
            </div>
            <div className="assess-copy">
              <h2>{item.title}</h2>
              <ul className="assess-facts">
                <li><Icon name="book" />{subjectLabel(item.subject) || "Subject"} · {termLabel(item.term)}</li>
                <li><Icon name="graduate" />{item.classRoom?.name || "Class"}</li>
                {item.date ? <li><Icon name="calendar" />{isoDay(new Date(item.date))}</li> : null}
              </ul>
              <div className="actions">
                <button className="ghost" type="button" onClick={() => setSelected(item._id)}><Icon name="book" />{selected === item._id ? "Selected" : t("Open marks")}</button>
                <button className="ghost" type="button" onClick={() => { setEditingId(item._id); setAssessmentTerm(storedTerm(item.term)); setDrafts([blankDraft({ title: item.title, maxScore: String(item.maxScore), date: item.date ? isoDay(new Date(item.date)) : isoDay(new Date()) })]); if (item.classRoom?._id) setClassId(item.classRoom._id); if (item.subject?._id) setSubjectId(item.subject._id); }}><Icon name="pen" />{t("Edit")}</button>
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
          </section>
        ))}
      </div>
      {selected && openAssessment?.type !== "exam" ? (
        <section className="roster assess-sheet no-print">
          <header className="roster-head">
            <div>
              <p className="kicker"><Icon name="graduate" />{t("Sheet")}</p>
              <h2>{t("Students and parent phones")}</h2>
              {openAssessment ? <p className="muted">{openAssessment.title} · {openAssessment.subject?.name || "Subject"} · {openAssessment.classRoom?.name || "Class"}</p> : null}
            </div>
            <span className="roster-count">{students.length}</span>
          </header>
          <section className="range-panel">
            <header className="range-head">
              <h3>{t("Mark ranges")}</h3>
              <p>{t("Set the ranges in this assessment's marks. The first range that contains the mark fills the comment.")}</p>
            </header>
            <div className="range-board">
              {ranges.map((row, index) => (
                <article className="range-card" key={row.key}>
                  <div className="range-card-top">
                    <span className="range-index">{index + 1}</span>
                    {ranges.length > 1 ? <button className="danger" type="button" onClick={() => setRanges((current) => current.filter((item) => item.key !== row.key))}>{t("Remove range")}</button> : null}
                  </div>
                  <div className="range-fields">
                    <Field label="From mark" value={row.from} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, from: value } : item))} />
                    <Field label="To mark" value={row.to} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, to: value } : item))} />
                  </div>
                  <Field label="Comment" value={row.comment} onChange={(value) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, comment: value } : item))} />
                </article>
              ))}
            </div>
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setRanges((current) => [...current, blankRange()])}>{t("Add a range")}</button>
              <button className="solid" type="button" onClick={saveRanges}>{t("Save ranges")}</button>
            </div>
          </section>
          <p className="muted">{t("A student who did not attend is saved as 0. Write the reason.")}</p>
          <ValidationAlert message={students.some((student) => attendance[student._id] !== "no" && markIssue(marks[student._id], openAssessment?.maxScore)) ? "A mark cannot be negative or above the total." : ""} />
          <table className="board roster-table">
            <thead>
              <tr><th>{t("No.")}</th><th>{t("Student")}</th><th>{t("Parent phone")}</th><th>{t("Marks")}</th><th>{t("Comment")}</th><th>{t("Attended")}</th><th>{t("Reason")}</th></tr>
            </thead>
            <tbody>
              {students.map((student, index) => {
                const missed = attendance[student._id] === "no";
                return (
                <tr key={student._id}>
                  <td data-label="No."><span className="roster-no">{index + 1}</span></td>
                  <td data-label="Student" className="roster-name">{student.fullName}</td>
                  <td data-label="Parent phone" className="roster-phone">{localPhone(parentOf(student)?.phone) || t("No phone")}</td>
                  <td data-label="Marks"><input disabled={missed} className={!missed && markIssue(marks[student._id], openAssessment?.maxScore) ? "invalid" : undefined} aria-invalid={!missed && markIssue(marks[student._id], openAssessment?.maxScore) ? true : undefined} aria-label={t("Marks")} inputMode="decimal" value={missed ? "0" : (marks[student._id] || "")} onChange={(event) => setStudentMark(student._id, event.target.value)} /></td>
                  <td data-label="Comment"><input disabled={missed} aria-label={t("Comment")} value={missed ? "" : (comments[student._id] || "")} onChange={(event) => setComments({ ...comments, [student._id]: event.target.value })} /></td>
                  <td data-label={t("Attended")}>
                    <select aria-label={t("Attended")} value={missed ? "no" : "yes"} onChange={(event) => setAttend(student._id, event.target.value)}>
                      <option value="yes">{t("Attended")}</option>
                      <option value="no">{t("Did not attend")}</option>
                    </select>
                  </td>
                  <td data-label={t("Reason")}><input aria-label={t("Reason")} maxLength={160} disabled={!missed} placeholder={missed ? t("Reason") : ""} value={reasons[student._id] || ""} onChange={(event) => setReasons({ ...reasons, [student._id]: event.target.value })} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="actions assess-save">
            <button className="solid" type="button" onClick={() => { const rows = sheetMarks(); if (!rows) return; act(() => api(`/marks/assessments/${selected}/marks`, { method: "POST", token, body: { marks: rows } }), "Sheet saved", "Marks and comments are stored."); }}><Icon name="check" />{t("Save sheet")}</button>
          </div>
        </section>
      ) : null}
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="award" /></span>
          <div>
            <p className="kicker">{t("Subject credits")}</p>
            <h2>{t("Credited marks")}</h2>
          </div>
        </header>
        <p className="muted">{t("1 credit equals 10 marks.")}</p>
        <div className="form-grid">
          <label className="field">Class
            <select value={creditClassId} onChange={(event) => setCreditClassId(event.target.value)}>
              {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">Subject
            <select value={creditSubjectId} onChange={(event) => setCreditSubjectId(event.target.value)}>
              {creditSubjects.length === 0 ? <option value="">{t("No subjects on this class")}</option> : null}
              {creditSubjects.map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}
            </select>
          </label>
          <TermField value={creditTerm} onChange={setCreditTerm} />
        <ReportSpan year={sheetYear} onYear={setSheetYear} from={sheetFrom} onFrom={setSheetFrom} to={sheetTo} onTo={setSheetTo} />
          <Field label="Subject credits" value={creditDraft} onChange={setCreditDraft} placeholder="6" />
          <div className="actions">
            <button className="ghost" type="button" onClick={saveSubjectCredits}>{t("Save credits")}</button>
          </div>
        </div>
        {creditSubject && wholeCredits(creditSubject.credits) ? (
          <p>{t("{subject} is marked over {total}.", { subject: creditSubject.name, total: subjectTotal(creditSubject.credits) })}</p>
        ) : (
          <p>{t("Set the credits before you download.")}</p>
        )}
        {creditSheet?.tests.length ? <p className="muted">{creditSheet.termLabel} · {t("Assessments done")}: {assessmentLine(creditSheet)} · {t("A blank mark counts as 0.")}</p> : <p className="muted">{assessments.some((item) => String(item.classRoom?._id || item.classRoom) === String(creditRoom?._id) && String(item.subject?._id || item.subject) === String(creditSubject?._id) && item.type !== "exam") ? t("No assessments in this term.") : t("Add at least one assessment for this subject first.")}</p>}
        <div className="actions">
          <button className="solid" type="button" onClick={() => { if (requireCreditSheet()) setCreditOpen(true); }}>{t("Print / Save PDF")}</button>
          <button className="ghost" type="button" onClick={saveCreditExcel}>{t("Excel")}</button>
          <button className="ghost" type="button" onClick={saveCreditWord}>{t("Word")}</button>
        </div>
        {creditSheet?.tests.length ? (
          creditSheet.rows.length ? <CreditTable sheet={creditSheet} /> : <p className="roster-empty">{t("No students in your classes yet.")}</p>
        ) : null}
      </section>
      {creditOpen && creditSheet ? <CreditPreview school={school} sheet={creditSheet} onClose={() => setCreditOpen(false)} /> : null}
    </div>
  );
}

const BANDS = { normal: "Normal", medium: "Medium", abnormal: "Abnormal", at_risk: t("At risk") };

function CaseRoll({ students }) {
  return (
    <ol className="case-register">
      {students.map((group) => (
        <li key={group.id}>
          <div className="case-who">
            <strong>{group.name}</strong>
            <span>{[group.code, group.remaining === "—" ? "" : `${group.remaining} remaining`].filter(Boolean).join(" · ")}</span>
          </div>
          <ul>
            {group.cases.map((item) => (
              <li key={item._id}>
                <strong>{prettyKey(dayKey(item.occurredAt || item.createdAt))} · {t(item.title)}</strong>
                {item.description ? <p>{t(item.description)}</p> : null}
                <p className="case-detail">Deducted {item.marksLost || 0} · Remaining {item.scoreAfter ?? "—"} · {item.parentNotifiedAt ? "Parent notified" : "Parent not notified"}{item.reportedBy?.fullName ? ` · ${item.reportedBy.fullName}` : ""}</p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const CASE_MENU = [
  ["Late to assembly", "The student arrived after assembly had started."],
  ["Late to class", "The student arrived after the lesson had started."],
  ["Absent without permission", "The student missed class without permission."],
  ["Incorrect uniform", "The student came without the required uniform."],
  ["Noise in class", "The student disrupted the class."],
  ["Fighting", "The student fought with another student."],
  ["Disrespect to staff", "The student spoke rudely to a staff member."],
  ["Phone in class", "The student used a phone during lessons."],
  ["Left school without permission", "The student left the school grounds without permission."],
  ["Incomplete work", "The student did not complete the assigned work."],
];

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
  const [registerOpen, setRegisterOpen] = useState(false);

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
    if (/^\d{4}$/.test(reportYear.trim()) && (!day || !day.startsWith(reportYear.trim()))) return false;
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
  const classSheets = [];
  const seenSheets = new Map();
  groupedCases.forEach((group) => {
    const name = group.className || t("Class");
    if (!seenSheets.has(name)) {
      const sheet = { name, students: [] };
      seenSheets.set(name, sheet);
      classSheets.push(sheet);
    }
    seenSheets.get(name).students.push(group);
  });
  classSheets.sort((left, right) => left.name.localeCompare(right.name));

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
              const caseTitle = CASE_MENU.some((item) => item[0] === title) ? title : "";
              const caseBody = CASE_MENU.some((item) => item[1] === description) ? description : "";
              if (!caseTitle) return notify(t("Not completed"), t("Choose the case title."), "bad");
              if (!caseBody) return notify(t("Not completed"), t("Choose what happened."), "bad");
              act(async () => {
                const data = await api("/discipline", { method: "POST", token, body: { student: selected._id, title: caseTitle, description: caseBody, category: "misconduct", marksLost: Number(marksLost || 0) } });
                setTitle("");
                setDescription("");
                await loadBase();
                notify(data.notified ? t("Marks subtracted and parent notified") : t("Marks subtracted"), data.message || `${selected.fullName} was updated.`, data.notified ? "ok" : "bad");
                return data;
              });
            }}>
              <h2>{selected.fullName}</h2>
              {historyScores.map((row) => <p key={row._id}>{row.term} {row.academicYear}: {row.score}{row.maxMarks != null ? ` / ${row.maxMarks}` : ""}</p>)}
              {history.map((item) => <p key={item._id}><strong>{t(item.title)}</strong> {item.marksLost ? `−${item.marksLost}` : ""} {item.scoreAfter != null ? `· ${item.scoreAfter} left` : ""}</p>)}
              <label className="field">{t("Case title")}
                <select value={title} onChange={(event) => {
                  const next = event.target.value;
                  setTitle(next);
                  const pair = CASE_MENU.find((item) => item[0] === next);
                  if (pair) setDescription(pair[1]);
                }}>
                  <option value="">{t("Choose the case title.")}</option>
                  {CASE_MENU.map(([label]) => <option key={label} value={label}>{t(label)}</option>)}
                </select>
              </label>
              <label className="field">{t("What happened")}
                <select value={description} onChange={(event) => setDescription(event.target.value)}>
                  <option value="">{t("Choose what happened.")}</option>
                  {CASE_MENU.map(([, label]) => <option key={label} value={label}>{t(label)}</option>)}
                </select>
              </label>
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
          <button className="solid" type="button" onClick={openDisciplineReport}>{t("Discipline cases")}</button>
        </div>
        {datesFlipped ? <p className="roster-empty">{t("Choose an end date on or after the start date.")}</p> : classSheets.length === 0 ? <p className="roster-empty">{t("No discipline cases in this period.")}</p> : (
          <>
            <div className="actions no-print">
              <button className="solid" type="button" onClick={() => {
                if (!reportIsFiltered({ classId: reportClassId, fromDate, toDate, search })) {
                  notify(t("Choose a filter"), t("Select a class, or set the dates or a student name, before printing."), "bad");
                  return;
                }
                setRegisterOpen(true);
              }}>{t("Print / Save PDF")}</button>
            </div>
            {classSheets.map((sheet) => {
              const sheetCases = sheet.students.reduce((sum, group) => sum + group.cases.length, 0);
              const sheetMarks = sheet.students.reduce((sum, group) => sum + group.cases.reduce((marks, item) => marks + Number(item.marksLost || 0), 0), 0);
              return (
                <div className="roster report-sheet" key={sheet.name}>
                  <ReportLogos school={school} />
                  <header className="roster-head">
                    <div>
                      <p className="kicker">{t("IshuriApp")}</p>
                      <h2>{sheet.name}</h2>
                      <p className="muted">{school?.name || "School"} · {t("Discipline cases")} · {rangeLabel(period, fromDate, toDate)}{reportQuery ? ` · ${search.trim()}` : ""}</p>
                      <p className="muted">{sheet.students.length === 1 ? "1 student" : `${sheet.students.length} students`} · {sheetCases === 1 ? "1 case" : `${sheetCases} cases`} · {sheetMarks === 1 ? "1 mark" : `${sheetMarks} marks`} subtracted</p>
                    </div>
                  </header>
                  <CaseRoll students={sheet.students} />
                </div>
              );
            })}
          </>
        )}
      </section>
      {official ? <OfficialPreview report={official} orientation={orientation} onOrientation={setOrientation} onClose={() => setOfficial(null)} /> : null}
      {registerOpen ? (
        <ReportPrint
          title={t("Discipline cases")}
          school={school}
          onClose={() => setRegisterOpen(false)}
          bare
        >
          {classSheets.map((sheet) => (
            <section className="print-class" key={sheet.name}>
              <PrintHeading school={school} title={t("Discipline cases")} note={`${sheet.name} · ${rangeLabel(period, fromDate, toDate)}`} />
              <CaseRoll students={sheet.students} />
            </section>
          ))}
        </ReportPrint>
      ) : null}
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

function AccountantSettings({ session, onSession }) {
  const user = session.user || {};
  const [form, setForm] = useState({
    fullName: user.fullName || "",
    email: user.email || "",
    phone: localPhone(user.phone) || takePhone(user.phone),
    title: user.title || "",
    gender: user.gender || "",
    bio: user.bio || "",
    avatarUrl: user.avatarUrl || "",
    whatsapp: localPhone(user.socials?.whatsapp) || takePhone(user.socials?.whatsapp),
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function onPhoto(file) {
    if (!file) return;
    const uploaded = await act(() => uploadFile(session.token, "avatars", file), "Uploaded", t("The image is ready to save with the profile."));
    if (uploaded?.url) set("avatarUrl", uploaded.url);
  }

  async function save(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!form.fullName.trim()) return notify(t("Not completed"), t("Type your full name."), "bad");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return notify(t("Not completed"), t("Type a valid email."), "bad");
    const phone = form.phone.trim() ? localPhone(form.phone) : "";
    const whatsapp = form.whatsapp.trim() ? localPhone(form.whatsapp) : "";
    if ((form.phone.trim() && !phone) || (form.whatsapp.trim() && !whatsapp)) {
      return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
    }
    const changingPassword = Boolean(form.currentPassword || form.newPassword || form.confirmPassword);
    if (changingPassword) {
      if (!form.currentPassword) return notify(t("Not completed"), t("The current password is not correct."), "bad");
      if (form.newPassword.length < 8) return notify(t("Not completed"), t("The new password needs at least 8 characters."), "bad");
      if (form.newPassword !== form.confirmPassword) return notify(t("Not completed"), t("The new passwords do not match."), "bad");
    }
    const body = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone,
      title: form.title.trim(),
      gender: form.gender,
      bio: form.bio.trim(),
      avatarUrl: form.avatarUrl,
      socials: { ...(user.socials || {}), whatsapp },
    };
    if (changingPassword) {
      body.currentPassword = form.currentPassword;
      body.newPassword = form.newPassword;
      body.confirmPassword = form.confirmPassword;
    }
    await act(async () => {
      const data = await api("/auth/me", { method: "PATCH", token: session.token, body });
      const next = { ...session, user: data.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      onSession(next);
      setForm((current) => ({
        ...current,
        fullName: data.user.fullName || "",
        email: data.user.email || "",
        phone: localPhone(data.user.phone) || "",
        title: data.user.title || "",
        gender: data.user.gender || "",
        bio: data.user.bio || "",
        avatarUrl: data.user.avatarUrl || "",
        whatsapp: localPhone(data.user.socials?.whatsapp) || "",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    }, t("Saved"), t("Your profile is saved."));
  }

  return (
    <form className="acct-settings" onSubmit={save}>
      <section className="acct-settings-card">
        <header>
          <h2>{t("Settings")}</h2>
          <p>{t("Change your name, email, phone and password.")}</p>
        </header>
        <div className="acct-settings-hero">
          {form.avatarUrl ? <img src={media(form.avatarUrl)} alt="" /> : <span>{accountInitials(form.fullName)}</span>}
          <div>
            <strong>{form.fullName || t(ROLE_LABEL[session.user?.role] || "Director")}</strong>
            <em>{session.school?.name}</em>
            <label className="acct-act is-update">
              <Icon name="image" />
              {t("Profile photo")}
              <input hidden type="file" accept="image/*" onChange={(event) => onPhoto(event.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="acct-settings-grid">
          <Field label="Full name" value={form.fullName} autoComplete="name" submitted={submitted} error={form.fullName.trim() ? "" : "Type your full name."} onChange={(value) => set("fullName", value)} />
          <Field label="Email" type="email" value={form.email} autoComplete="email" submitted={submitted} error={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "" : "Type a valid email."} onChange={(value) => set("email", value)} />
          <Field label="Phone" value={form.phone} autoComplete="tel" placeholder="0788000000" submitted={submitted} error={phoneIssue(form.phone)} onChange={(value) => set("phone", takePhone(value))} />
          <Field label="WhatsApp" value={form.whatsapp} autoComplete="tel" placeholder="0788000000" submitted={submitted} error={phoneIssue(form.whatsapp)} onChange={(value) => set("whatsapp", takePhone(value))} />
          <Field label="Title" value={form.title} onChange={(value) => set("title", value)} />
          <label className="field">{t("Gender")}
            <select value={form.gender} onChange={(event) => set("gender", event.target.value)}>
              <option value="">—</option>
              <option value="female">{t("Female")}</option>
              <option value="male">{t("Male")}</option>
              <option value="other">{t("Other")}</option>
            </select>
          </label>
          <div className="span"><Field label="Bio" value={form.bio} multiline onChange={(value) => set("bio", value)} /></div>
        </div>
      </section>
      <section className="acct-settings-card">
        <header>
          <h2>{t("Password")}</h2>
          <p>{t("Leave the password fields empty to keep the current password.")}</p>
        </header>
        <div className="acct-settings-grid">
          <div className="span"><Field label="Current password" type="password" value={form.currentPassword} autoComplete="current-password" onChange={(value) => set("currentPassword", value)} /></div>
          <Field label="New password" type="password" value={form.newPassword} autoComplete="new-password" onChange={(value) => set("newPassword", value)} />
          <Field label="Confirm password" type="password" value={form.confirmPassword} autoComplete="new-password" onChange={(value) => set("confirmPassword", value)} />
        </div>
      </section>
      <div className="acct-settings-save">
        <button className="solid" type="submit"><Icon name="check" />{t("Save")}</button>
      </div>
    </form>
  );
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
  const [profileSubmitted, setProfileSubmitted] = useState(false);
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  function fill(school) {
    setDraft({
      name: school.name || "", type: school.type || "secondary", motto: school.motto || "", tagline: school.tagline || "", about: school.about || "", history: school.history || "", vision: school.vision || "", mission: school.mission || "", performanceSummary: school.performanceSummary || "",
      programs: school.programs?.join(", ") || "", facilities: school.facilities?.join(", ") || "", email: school.email || "", phone: localPhone(school.phone) || takePhone(school.phone), whatsapp: localPhone(school.whatsapp) || takePhone(school.whatsapp), visitingHours: school.visitingHours || "",
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
      <Field label="Phone" value={draft.phone} submitted={profileSubmitted} error={phoneIssue(draft.phone)} onChange={(value) => set("phone", takePhone(value))} placeholder="0788000000" />
      <Field label="WhatsApp" value={draft.whatsapp} submitted={profileSubmitted} error={phoneIssue(draft.whatsapp)} onChange={(value) => set("whatsapp", takePhone(value))} placeholder="0788000000" />
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
        <button className="solid" type="button" onClick={() => {
          setProfileSubmitted(true);
          const phone = draft.phone.trim() ? localPhone(draft.phone) : "";
          const whatsapp = draft.whatsapp.trim() ? localPhone(draft.whatsapp) : "";
          if ((draft.phone.trim() && !phone) || (draft.whatsapp.trim() && !whatsapp)) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
          const body = payloadFrom({ ...draft, phone, whatsapp });
          act(async () => {
          const data = missing
            ? await api("/schools", { method: "POST", token, body })
            : await api("/schools/mine", { method: "PATCH", token, body });
          fill(data.school);
          setMissing(false);
          await refreshSession();
        }, missing ? "Submitted" : "Saved", missing ? "IshuriApp will review this school." : "The school website now shows these details.");
        }}>{missing ? "Submit for approval" : "Save website profile"}</button>
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
  const [submitted, setSubmitted] = useState(false);
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
      setSubmitted(true);
      const typed = phones.split(",").map((phone) => phone.trim()).filter(Boolean);
      const ready = typed.map(localPhone);
      if (!typed.length || ready.some((phone) => !phone)) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
      if (!message.trim()) return notify(t("Not completed"), t("Write the message first."), "bad");
      if (message.trim().length > 160) return notify(t("Not completed"), t("Keep the message under 160 characters."), "bad");
      track((async () => {
        try {
          const sent = await api("/sms/send", {
            method: "POST",
            token,
            body: { phones: ready, message },
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
      <Field label="Phones, separated by commas" value={phones} submitted={submitted} error={phones.split(",").map((item) => item.trim()).filter(Boolean).some((item) => !localPhone(item)) ? "The phone number must be 10 digits and start with 07." : ""} onChange={setPhones} placeholder="0788000000, 0792000000" />
      <Field label="Message" value={message} maxLength={160} multiline onChange={(value) => setMessage(value.slice(0, 160))} placeholder={t("Parents meeting Saturday 09:00.")} />
      <p className="muted span">{message.length}/160 · {t("A message stays within 160 characters.")}</p>
      <button className="solid" type="submit"><Icon name="message" />{t("Send message")}</button>
      <p className="muted span">{t("The phone number must be 10 digits and start with 07.")}</p>
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
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams({ period, year: reportYear, from: fromDate, to: toDate });
    api(`/admin/reports?${params.toString()}`, { token }).then(setReport).catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [period, reportYear, fromDate, toDate, token]);
  const rows = (report?.items || []).filter((row) => (status === "all" || row.school.status === status) && (type === "all" || row.school.type === type) && (!query.trim() || row.school.name.toLowerCase().includes(query.trim().toLowerCase())));
  const ranked = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.school.name.localeCompare(b.school.name));
  const max = Math.max(1, ...ranked.map((row) => row[metric] || 0));
  const totals = report ? messageTotals(rows, grain, kigaliDay(new Date(report.from)), kigaliDay(new Date(report.to || Date.now()))) : [];
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
        <div className="form-grid">
          <Field label="Year" type="number" value={reportYear} onChange={setReportYear} />
          <Field label="From" type="date" value={fromDate} onChange={setFromDate} />
          <Field label="To" type="date" value={toDate} onChange={setToDate} />
        </div>
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
  const [submitted, setSubmitted] = useState(false);
  async function load() {
    const data = await api("/schools", { token });
    setItems(data.items || []);
  }
  useEffect(() => { load().catch((err) => notify(t("Not completed"), err.message, "bad")); }, [token]);
  return (
    <div className="sections">
      <form className="panel form-grid" onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        const phone = director.phone.trim() ? localPhone(director.phone) : "";
        if (director.phone.trim() && !phone) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
        act(() => api("/admin/school-admins", { method: "POST", token, body: { ...director, phone } }), t("Director created"), t("They can sign in and submit a school profile.")).then((ok) => { if (ok) setDirector({ ...director, fullName: "", email: "", phone: "" }); });
      }}>
        <h2>{t("New school director")}</h2>
        <Field label="Full name" value={director.fullName} onChange={(value) => setDirector({ ...director, fullName: value })} />
        <Field label="Email" value={director.email} onChange={(value) => setDirector({ ...director, email: value })} />
        <Field label="Phone" value={director.phone} submitted={submitted} error={phoneIssue(director.phone)} onChange={(value) => setDirector({ ...director, phone: takePhone(value) })} placeholder="0788000000" />
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
