import { useEffect, useRef, useState } from "react";
import { api, media } from "./api.js";
import { track } from "./notice.js";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import { WindField } from "./wind.jsx";
import { ReportPrint } from "./officialReport.jsx";

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kigali" }).format(date);
}

function rwf(value) {
  return `${new Intl.NumberFormat("en-RW").format(Math.round(Number(value) || 0))} RWF`;
}

function termName(value) {
  if (value === "1") return t("Term 1");
  if (value === "2") return t("Term 2");
  if (value === "3") return t("Term 3");
  if (value === "annual") return t("Annual");
  return "";
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function showDecimal(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function placeMark(mark) {
  if (!mark) return "—";
  if (mark.standard) return `${showDecimal(mark.final || 0)}/${mark.standard}`;
  return `${showDecimal(mark.percent || 0)}/100`;
}

function followStatus(value) {
  if (value === "absent") return t("Did not attend");
  if (value === "missing") return t("Not recorded");
  return t("Attended");
}

function caseStatus(value) {
  if (value === "resolved") return t("Resolved");
  if (value === "escalated") return t("Escalated");
  return t("Still open");
}

function MoneyTable({ rows, empty }) {
  if (!rows.length) return <p className="roster-empty">{t(empty)}</p>;
  return (
    <div className="parent-scroll">
      <table className="parent-table fee-paper">
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Paid")}</th>
            <th>{t("Item")}</th>
            <th>{t("Amount due")}</th>
            <th>{t("Amount paid")}</th>
            <th>{t("Unpaid")}</th>
            <th>{t("Due date")}</th>
            <th>{t("Paid on")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td data-label={t("No.")}><span className="roster-no">{String(index + 1).padStart(2, "0")}</span></td>
              <td data-label={t("Paid")} className={`doc-mark${row.settled ? " is-paid" : " is-unpaid"}`} aria-label={row.settled ? t("Paid") : t("Unpaid")}>{row.settled ? "✓" : "✗"}</td>
              <td className="wide" data-label={t("Item")}>{row.name}</td>
              <td className="num" data-label={t("Amount due")}>{rwf(row.amountDue)}</td>
              <td className="num parent-ok" data-label={t("Amount paid")}>{rwf(row.amountPaid)}</td>
              <td className={row.unpaid > 0 ? "num parent-due" : "num"} data-label={t("Unpaid")}>{rwf(row.unpaid)}</td>
              <td data-label={t("Due date")}>{when(row.dueOn)}</td>
              <td className="wide" data-label={t("Paid on")}>
                {row.payments?.length ? row.payments.map((payment, paymentIndex) => (
                  <span className="parent-pay" key={`${row.id}-${paymentIndex}`}>{when(payment.paidOn)} · {rwf(payment.amount)}</span>
                )) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td data-label="" />
            <td data-label="" />
            <td className="wide" data-label="">{t("Total Amount")}</td>
            <td className="num" data-label={t("Amount due")}>{rwf(sum(rows, "amountDue"))}</td>
            <td className="num" data-label={t("Amount paid")}>{rwf(sum(rows, "amountPaid"))}</td>
            <td className="num" data-label={t("Unpaid")}>{rwf(sum(rows, "unpaid"))}</td>
            <td data-label="" />
            <td data-label="" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ClassList({ sheet, studentId, empty }) {
  if (!sheet?.rows?.length || !sheet.subjects?.length) return <p className="roster-empty">{t(empty)}</p>;
  return (
    <>
      <div className="parent-board">
        {sheet.rows.map((row, index) => (
          <article key={row.id} className={String(row.id) === String(studentId) ? "is-mine" : undefined}>
            <header>
              <span className="roster-no">{String(index + 1).padStart(2, "0")}</span>
              <strong>{row.name}</strong>
              <em>{showDecimal(row.average)}/100 · {row.position}/{sheet.rows.length}</em>
            </header>
            <ul>
              {sheet.subjects.map((subject) => (
                <li key={subject.id}>
                  <span>{subject.name}</span>
                  <strong>{placeMark(row.marks.find((mark) => String(mark.id) === String(subject.id)))}</strong>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="parent-scroll parent-sheet">
      <table className="parent-table">
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Student")}</th>
            {sheet.subjects.map((subject) => <th key={subject.id}>{subject.name}</th>)}
            <th>{t("Average")} /100</th>
            <th>{t("Class position")}</th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, index) => (
            <tr key={row.id} className={String(row.id) === String(studentId) ? "parent-mine" : undefined}>
              <td><span className="roster-no">{String(index + 1).padStart(2, "0")}</span></td>
              <td>{row.name}</td>
              {sheet.subjects.map((subject) => (
                <td key={subject.id} className="num">{placeMark(row.marks.find((mark) => String(mark.id) === String(subject.id)))}</td>
              ))}
              <td className="num">{showDecimal(row.average)}/100</td>
              <td className="num">{row.position}/{sheet.rows.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function MarkTable({ rows, empty, kind }) {
  if (!rows.length) return <p className="roster-empty">{t(empty)}</p>;
  return (
    <div className="parent-scroll">
      <table className="parent-table">
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Subject")}</th>
            <th>{kind === "exam" ? t("Examination") : t("Assessments done")}</th>
            <th>{t("Date")}</th>
            <th>{t("Marks")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td data-label={t("No.")}><span className="roster-no">{String(index + 1).padStart(2, "0")}</span></td>
              <td data-label={t("Subject")}>{row.subject || "—"}</td>
              <td className="wide" data-label={kind === "exam" ? t("Examination") : t("Assessments done")}>
                <strong>{row.title}</strong>
                {termName(row.term) ? <span className="parent-pay">{[termName(row.term), row.year].filter(Boolean).join(" · ")}</span> : null}
              </td>
              <td data-label={t("Date")}>{when(row.date)}</td>
              <td data-label={t("Marks")}>
                <strong>{row.maxScore ? `${row.score}/${row.maxScore}` : row.score}</strong>
                {row.attended === false ? <span className="parent-pay parent-due">{t("Did not attend")}{row.reason ? ` · ${row.reason}` : ""}</span> : null}
                {row.comment ? <span className="parent-pay">{row.comment}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FollowTable({ rows }) {
  const missingAssessments = rows.filter((row) => row.kind !== "exam" && row.status !== "attended").length;
  const missingExams = rows.filter((row) => row.kind === "exam" && row.status !== "attended").length;
  return (
    <>
      <div className="parent-follow-nums">
        <p><span>{t("Missing assessments")}</span><strong>{missingAssessments}</strong></p>
        <p><span>{t("Missing examinations")}</span><strong>{missingExams}</strong></p>
      </div>
      {!rows.length ? <p className="roster-empty">{t("No follow-up is recorded for this student.")}</p> : (
    <div className="parent-scroll">
      <table className="parent-table">
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Subject")}</th>
            <th>{t("Assessment")}</th>
            <th>{t("Date")}</th>
            <th>{t("Follow-up")}</th>
            <th>{t("Reason")}</th>
            <th>{t("Marks")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={row.status === "absent" ? "follow-miss" : undefined}>
              <td data-label={t("No.")}><span className="roster-no">{String(index + 1).padStart(2, "0")}</span></td>
              <td data-label={t("Subject")}>{row.subject || "—"}</td>
              <td className="wide" data-label={t("Assessment")}>
                <strong>{row.title}</strong>
                <span className="parent-pay">{row.kind === "exam" ? t("Examination") : t("Assessments done")}</span>
              </td>
              <td data-label={t("Date")}>{when(row.date)}</td>
              <td data-label={t("Follow-up")}>{followStatus(row.status)}</td>
              <td data-label={t("Reason")}>{row.reason || "—"}</td>
              <td className="num" data-label={t("Marks")}>{row.score == null ? t("Not recorded") : row.maxScore ? `${row.score}/${row.maxScore}` : row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
    </>
  );
}

function DisciplineBlock({ years, cases }) {
  const marks = years || [];
  return (
    <>
      {marks.map((year) => (
        <div key={year.year}>
          <h3>{year.year}</h3>
          <div className="parent-scroll">
            <table className="parent-table">
              <thead>
                <tr>
                  <th>{t("Term 1")} /40</th>
                  <th>{t("Term 2")} /40</th>
                  <th>{t("Term 3")} /40</th>
                  <th>{t("Average /40")}</th>
                  <th>{t("50% or above")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {["1", "2", "3"].map((key) => (
                    <td key={key} className="num" data-label={`${termName(key)} /40`}>{year.terms?.[key]?.score == null ? t("Not recorded") : `${year.terms[key].score}/${year.terms[key].max || 40}`}</td>
                  ))}
                  <td className="num" data-label={t("Average /40")}>{year.average == null ? "—" : `${showDecimal(year.average)}/40`}</td>
                  <td className="wide" data-label={t("50% or above")}>{year.reached == null ? t("Not recorded") : year.reached ? t("50% or above") : t("Below 50%")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {cases?.length ? (
        <ul className="parent-feed">
          {cases.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{[when(item.occurredAt), caseStatus(item.status), item.marksLost ? `${t("Marks lost")} ${item.marksLost}` : "", item.scoreAfter == null ? "" : `${item.scoreAfter}/40`].filter(Boolean).join(" · ")}</span>
              {item.description ? <p>{item.description}</p> : null}
              {item.actionTaken ? <p>{item.actionTaken}</p> : null}
            </li>
          ))}
        </ul>
      ) : <p className="roster-empty">{t("No discipline record for this student.")}</p>}
    </>
  );
}

function staffRole(role) {
  return {
    school_admin: t("Director"),
    teacher: t("Teacher"),
    dos: t("Director of Studies"),
    discipline: t("Discipline"),
    accountant: t("Accountant"),
  }[role] || "";
}

const FACE_COLORS = ["#0d47a1", "#1565c0", "#0277bd", "#00838f", "#01579b", "#283593", "#006064", "#0277bd"];
const PANES = [
  ["home", "Home", "home"],
  ["chat", "Your messages", "chat"],
  ["status", "Student status", "wallet"],
  ["midterm", "Mid Term Tests Report", "chart"],
  ["follow", "Follow-up", "check"],
  ["assessments", "Assessments done", "pen"],
  ["exams", "Examinations", "graduate"],
  ["discipline", "Discipline cases", "shield"],
  ["events", "Events", "calendar"],
  ["news", "Announcements", "megaphone"],
];

function faceColor(name) {
  const value = String(name || "");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return FACE_COLORS[hash % FACE_COLORS.length];
}

function faceLetters(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function Face({ name, src, dot = false, mark = false }) {
  const [failed, setFailed] = useState(false);
  const photo = !failed && src ? media(src) : "";
  return (
    <span className={`asana-avatar${mark ? " is-mark" : ""}`} style={photo || mark ? undefined : { background: faceColor(name) }}>
      {photo ? <img src={photo} alt="" onError={() => setFailed(true)} /> : <b>{faceLetters(name)}</b>}
      {dot ? <i className="asana-dot" aria-hidden="true" /> : null}
    </span>
  );
}

function shortName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function senderPhoto(circle, item, me) {
  if (item.mine) return me?.photoUrl || "";
  const match = (circle?.students || []).find((person) => person.name && person.name === item.senderName);
  return match?.photoUrl || "";
}

function orderCircle(rows) {
  return (rows || []).slice().sort((left, right) => Number(Boolean(right.mine)) - Number(Boolean(left.mine)) || Number(Boolean(right.active)) - Number(Boolean(left.active)) || String(left.name).localeCompare(String(right.name)));
}

function PersonRow({ person, selected, onPick, general = false, hint }) {
  return (
    <button type="button" className={`asana-person${selected ? " on" : ""}`} aria-current={selected ? "true" : undefined} onClick={onPick}>
      {general ? (
        <span className="asana-avatar"><img src="/parent-together.png" alt="" /></span>
      ) : (
        <Face name={person.name} src={person.photoUrl} dot={person.active} />
      )}
      <span className="asana-person-copy">
        <strong>{general ? t("General") : person.name}</strong>
        <em>{hint}</em>
      </span>
    </button>
  );
}

function parentTypingLine(rows) {
  const names = (rows || []).map((row) => row.name).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return t("{name} is typing", { name: names[0] });
  if (names.length === 2) return t("{first} and {second} are typing", { first: names[0], second: names[1] });
  return t("{name} and {count} others are typing", { name: names[0], count: names.length - 1 });
}

function ParentChat({ code, circle, onCircle }) {
  const [withId, setWithId] = useState("general");
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const scroller = useRef(null);
  const students = orderCircle(circle?.students).filter((person) => !person.mine);
  const staff = orderCircle(circle?.staff);
  const chosen = withId.startsWith("staff:")
    ? staff.find((person) => `staff:${person.id}` === withId)
    : withId.startsWith("student:")
      ? students.find((person) => `student:${person.id}` === withId)
      : null;

  useEffect(() => {
    if (!code) return undefined;
    let stop = false;
    const load = () => {
      const params = new URLSearchParams({ code });
      if (withId !== "general") params.set("with", withId);
      return api(`/public/parent/chat?${params}`)
        .then((data) => {
          if (stop) return;
          setItems(data.items || []);
          setTyping(data.typing || []);
          setActiveCount(data.activeCount || 0);
          setOfflineCount(data.offlineCount || 0);
          if (data.circle && onCircle) onCircle(data.circle);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") load();
    }, 4000);
    return () => { stop = true; clearInterval(timer); };
  }, [code, withId, onCircle]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [items, typing]);

  useEffect(() => {
    if (!code || !draft.trim()) return undefined;
    const timer = setTimeout(() => {
      api("/public/parent/chat/typing", { method: "POST", body: { code, with: withId }, quiet: true }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [code, draft, withId]);

  async function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const data = await api("/public/parent/chat", { method: "POST", body: { code, body: text, with: withId } });
      setItems((current) => [...current.filter((item) => String(item.id) !== String(data.message.id)), data.message]);
      setDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function choose(next) {
    setWithId(next);
    setItems([]);
    setTyping([]);
    setDraft("");
  }

  const me = (circle?.students || []).find((person) => person.mine);
  const status = typing.length
    ? parentTypingLine(typing)
    : chosen
      ? (chosen.active ? t("Active now") : t("Offline"))
      : t("{active} active · {offline} offline", { active: activeCount, offline: offlineCount });

  return (
    <div className="asana-inbox no-print">
      <div className="asana-people">
        <PersonRow general selected={withId === "general"} hint={t("Everyone on the school staff")} onPick={() => choose("general")} />
        <p className="asana-group">{t("Students")}</p>
        {students.length ? students.map((person) => (
          <PersonRow person={person} key={person.id} hint={person.active ? t("Active now") : t("Classmate")} selected={withId === `student:${person.id}`} onPick={() => choose(`student:${person.id}`)} />
        )) : <p className="asana-quiet">{t("No students are in this class yet.")}</p>}
        <p className="asana-group">{t("Staff")}</p>
        {staff.length ? staff.map((person) => (
          <PersonRow person={person} key={person.id} hint={person.active ? t("Active now") : staffRole(person.role)} selected={withId === `staff:${person.id}`} onPick={() => choose(`staff:${person.id}`)} />
        )) : <p className="asana-quiet">{t("This school has no staff to message yet.")}</p>}
      </div>
      <div className="asana-thread">
        <header>
          <h2>{chosen ? chosen.name : t("General")}</h2>
          <p>{chosen ? (chosen.role ? staffRole(chosen.role) : t("Classmate")) : t("The general chat reaches every staff member. Choose a person to write only to them.")}</p>
          <p className={typing.length ? "is-typing" : ""}>{status}</p>
        </header>
        <div className="asana-log" ref={scroller}>
          {!items.length ? <p className="asana-quiet">{chosen ? t("Say hello to {name}.", { name: shortName(chosen.name) }) : t("Say hello to the school staff.")}</p> : null}
          {items.map((item) => {
            const name = item.mine ? (me?.name || t("You")) : (item.senderName || t("Parent"));
            const role = !item.mine && item.senderRole && item.senderRole !== "parent" ? staffRole(item.senderRole) : "";
            return (
              <article className="asana-note" key={item.id}>
                <Face name={name} src={senderPhoto(circle, item, me)} />
                <div>
                  <header>
                    <strong>{item.mine ? t("You") : name}</strong>
                    {role ? <span>{role}</span> : null}
                    <time>{when(item.createdAt)}</time>
                  </header>
                  <p>{item.unsent ? t("Message unsent") : item.body}</p>
                </div>
              </article>
            );
          })}
          {typing.length ? (
            <p className="chat-typing" aria-live="polite">
              <i /><i /><i />
              <span>{parentTypingLine(typing)}</span>
            </p>
          ) : null}
        </div>
        <form className="chat-compose" onSubmit={submit}>
          <textarea
            value={draft}
            rows={1}
            maxLength={2000}
            placeholder={t("Message…")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
          />
          <button className="solid" type="submit" disabled={sending || !draft.trim()}>{t("Send")}</button>
        </form>
        {error ? <p className="banner">{t(error)}</p> : null}
      </div>
    </div>
  );
}

function sameTermRows(rows, term) {
  return (rows || []).filter((row) => String(row.term || "1") === term);
}

function HomeBoard({ record, term, onPane }) {
  const sheet = record.midterm?.[term];
  const mine = sheet?.rows?.find((row) => String(row.id) === String(record.student.id));
  const unpaid = [...(record.fees || []), ...(record.materials || [])].reduce((total, row) => total + (Number(row.unpaid) || 0), 0);
  const openCases = (record.cases || []).filter((item) => item.status !== "resolved").length;
  const items = [
    ["status", "wallet", "Student status", rwf(unpaid)],
    ["midterm", "chart", "Mid Term Tests Report", mine && sheet?.subjects?.length ? `${mine.position}/${sheet.rows.length}` : "—"],
    ["follow", "check", "Follow-up", String(sameTermRows(record.followUp, term).filter((row) => row.status !== "attended").length)],
    ["assessments", "pen", "Assessments done", String(sameTermRows(record.assessments, term).length)],
    ["exams", "graduate", "Examinations", String(sameTermRows(record.examinations, term).length)],
    ["discipline", "shield", "Discipline cases", String(openCases)],
    ["events", "calendar", "Events", String((record.events || []).length)],
    ["news", "megaphone", "Announcements", String((record.announcements || []).length)],
    ["chat", "chat", "Your messages", ""],
  ];
  return (
    <>
      <div className="asana-metrics">
        <button type="button" onClick={() => onPane("status")}>
          <span>{t("Unpaid")}</span>
          <strong>{rwf(unpaid)}</strong>
        </button>
        <button type="button" onClick={() => onPane("midterm")}>
          <span>{t("Class position")}</span>
          <strong>{mine && sheet?.subjects?.length ? `${mine.position}/${sheet.rows.length}` : "—"}</strong>
        </button>
        <button type="button" onClick={() => onPane("assessments")}>
          <span>{t("Assessments done")}</span>
          <strong>{sameTermRows(record.assessments, term).length}</strong>
        </button>
        <button type="button" onClick={() => onPane("discipline")}>
          <span>{t("Discipline cases")}</span>
          <strong>{openCases}</strong>
        </button>
      </div>
      <section className="parent-card">
        <ul className="asana-projects">
          {items.map(([id, icon, label, meta]) => (
            <li key={id}>
              <button type="button" onClick={() => onPane(id)}>
                <Icon name={icon} />
                <span>{t(label)}</span>
                {meta ? <em>{meta}</em> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ParentBody({ record, term, part = "all" }) {
  const sheet = record.midterm?.[term];
  const mine = sheet?.rows?.find((row) => String(row.id) === String(record.student.id));
  const follow = sameTermRows(record.followUp, term);
  const assessments = sameTermRows(record.assessments, term);
  const examinations = sameTermRows(record.examinations, term);
  const show = (id) => part === "all" || part === id;
  const titled = part === "all";
  return (
    <>
      {titled ? (
        <section className="parent-card">
          <header className="parent-who">
            <Face name={record.student.fullName} src={record.student.photoUrl} />
            <div>
              <p className="asana-kicker">{record.school?.name}</p>
              <h2>{record.student.fullName}</h2>
              <p>{[record.student.className, record.student.studentCode, record.student.academicYear].filter(Boolean).join(" · ")}</p>
              {mine && sheet?.subjects?.length ? <p>{t("Class position")} {mine.position}/{sheet.rows.length} · {t("Average")} {showDecimal(mine.average)}/100</p> : null}
            </div>
          </header>
        </section>
      ) : null}
      {show("status") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Student status")}</h2> : null}
          {titled ? <p className="muted">{t("A tick means the item is paid. A cross means it is still unpaid.")}</p> : null}
          <h3>{t("School fees")}</h3>
          <MoneyTable rows={record.fees || []} empty="No school fees are recorded for this student." />
          <h3>{t("School materials")}</h3>
          <MoneyTable rows={record.materials || []} empty="No school materials are recorded for this student." />
        </section>
      ) : null}
      {show("midterm") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Mid Term Tests Report")}</h2> : null}
          {titled ? <p className="muted">{t("The highlighted row is this student.")} · {termName(term)} · {record.year}</p> : null}
          <ClassList sheet={sheet} studentId={record.student.id} empty="No midterm marks are recorded for this class." />
        </section>
      ) : null}
      {show("follow") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Follow-up")}</h2> : null}
          <FollowTable rows={follow} />
        </section>
      ) : null}
      {show("assessments") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Assessments done")}</h2> : null}
          <MarkTable rows={assessments} empty="No assessments are recorded for this student." kind="assessment" />
        </section>
      ) : null}
      {show("exams") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Examinations")}</h2> : null}
          <MarkTable rows={examinations} empty="No examinations are recorded for this student." kind="exam" />
        </section>
      ) : null}
      {show("discipline") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Discipline cases")}</h2> : null}
          <DisciplineBlock years={record.discipline} cases={record.cases} />
        </section>
      ) : null}
      {show("events") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Events")}</h2> : null}
          {record.events?.length ? (
            <ul className="parent-feed">
              {record.events.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{[when(item.startsAt), item.endsAt ? when(item.endsAt) : "", item.venue].filter(Boolean).join(" · ")}</span>
                  {item.description ? <p>{item.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="roster-empty">{t("No events are published for this school.")}</p>}
        </section>
      ) : null}
      {show("news") ? (
        <section className="parent-card">
          {titled ? <h2>{t("Announcements")}</h2> : null}
          {record.announcements?.length ? (
            <ul className="parent-feed">
              {record.announcements.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{when(item.createdAt)}</span>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          ) : <p className="roster-empty">{t("No announcements are published for this school.")}</p>}
        </section>
      ) : null}
    </>
  );
}

export function ParentPortal({ code = "" }) {
  const [draft, setDraft] = useState(code);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [term, setTerm] = useState("1");
  const [circle, setCircle] = useState(null);
  const [pane, setPane] = useState("home");

  useEffect(() => {
    setDraft(code);
    if (!code) {
      setRecord(null);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    track(api(`/public/parent?code=${encodeURIComponent(code)}`))
      .then((data) => { if (!cancelled) { setRecord(data); setCircle(data.circle || null); setPane("home"); } })
      .catch((err) => { if (!cancelled) { setRecord(null); setError(err.message); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [code]);

  function submit(event) {
    event.preventDefault();
    const next = draft.trim();
    if (!next) {
      setError("Enter the student code.");
      setRecord(null);
      return;
    }
    const target = `#/parent/${encodeURIComponent(next)}`;
    if (window.location.hash === target) {
      window.location.hash = "#/parent";
      window.setTimeout(() => { window.location.hash = target; }, 0);
      return;
    }
    window.location.hash = target;
  }

  const sheet = record?.midterm?.[term];
  const mine = sheet?.rows?.find((row) => String(row.id) === String(record.student.id));
  const termScoped = pane === "home" || pane === "midterm" || pane === "follow" || pane === "assessments" || pane === "exams";
  const note = !record ? "" : pane === "home"
    ? [record.student.className, record.student.studentCode, record.student.academicYear, mine && sheet?.subjects?.length ? `${t("Class position")} ${mine.position}/${sheet.rows.length}` : ""].filter(Boolean).join(" · ")
    : pane === "status"
      ? t("A tick means the item is paid. A cross means it is still unpaid.")
      : pane === "midterm"
        ? `${t("The highlighted row is this student.")} · ${termName(term)} · ${record.year}`
        : (pane === "follow" || pane === "assessments" || pane === "exams")
            ? [termName(term), record.year].filter(Boolean).join(" · ")
            : "";

  if (!record || busy) {
    return (
      <div className="parent-portal parent-fit">
        <section className="parent-wind wind-host">
          <WindField />
          <div className="parent-wind-copy">
            <p className="asana-kicker">{t("For families")}</p>
            <h1>{t("Parent portal")}</h1>
            <p className="lede">{t("Parents and students enter the student code. The page shows fees with a tick or a cross, the class midterm list, follow-up, discipline, assessments, examinations, events and announcements.")}</p>
          </div>
        </section>
        <section className="asana-gate">
          <form className="asana-gate-card" onSubmit={submit}>
            <label className="field">
              {t("Student code")}
              <input value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck="false" placeholder="GSN-2026-014" />
            </label>
            <button className="solid" type="submit" disabled={busy}>{t("Show this student")}</button>
          </form>
          {error ? <p className="banner">{t(error)}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="parent-portal is-open">
      <div className="asana-shell">
        <aside className="asana-side wind-host">
          <WindField />
          <div className="asana-brand">
            <Face name={record.school?.name || "School"} src={record.school?.logoUrl} mark />
            <strong>{record.school?.name}</strong>
          </div>
          <div className="asana-id">
            <Face name={record.student.fullName} src={record.student.photoUrl} />
            <div>
              <strong>{record.student.fullName}</strong>
              <span>{[record.student.className, record.student.studentCode].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <nav className="asana-nav" aria-label={t("Parent portal")}>
            {PANES.map(([id, label, icon]) => (
              <button type="button" key={id} className={pane === id ? "on" : ""} aria-current={pane === id ? "page" : undefined} onClick={() => setPane(id)}>
                <Icon name={icon} />
                <span>{t(label)}</span>
              </button>
            ))}
          </nav>
          <div className="asana-side-actions">
            <button className="solid" type="button" onClick={() => setPrintOpen(true)}>{t("Print / Save PDF")}</button>
            <button className="ghost" type="button" onClick={() => { window.location.hash = "#/parent"; }}>{t("Another student")}</button>
          </div>
        </aside>
        <div className="asana-main">
          <header className="asana-head">
            <div>
              <p className="asana-kicker">{record.school?.name}</p>
              <h1>{pane === "home" ? record.student.fullName : t(PANES.find((item) => item[0] === pane)?.[1] || "Parent portal")}</h1>
              {note ? <p className="asana-sub">{note}</p> : null}
            </div>
            {termScoped ? (
              <div className="chips">
                {["1", "2", "3"].map((key) => (
                  <button type="button" key={key} className={term === key ? "on" : ""} onClick={() => setTerm(key)}>{termName(key)}</button>
                ))}
              </div>
            ) : null}
          </header>
          {pane === "home" ? <HomeBoard record={record} term={term} onPane={setPane} /> : null}
          {pane === "chat" ? <ParentChat code={code} circle={circle || record.circle} onCircle={setCircle} /> : null}
          {pane !== "home" && pane !== "chat" ? <ParentBody record={record} term={term} part={pane} /> : null}
        </div>
      </div>
      {printOpen ? (
        <ReportPrint school={record.school} title={t("Parent portal")} note={[record.student.fullName, record.student.className, record.student.studentCode, termName(term)].filter(Boolean).join(" · ")} onClose={() => setPrintOpen(false)}>
          <ParentBody record={record} term={term} />
        </ReportPrint>
      ) : null}
    </div>
  );
}
