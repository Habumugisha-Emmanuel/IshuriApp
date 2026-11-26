import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import { act, notify } from "./notice.js";
import { PrintHeading } from "./officialReport.jsx";

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function clipMessage(value) {
  const chars = [...String(value || "")];
  return chars.length <= 155 ? chars.join("") : chars.slice(0, 155).join("");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function downloadReport(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function reportSlug(title) {
  return String(title || "report").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "report";
}

function reportCsv(tables) {
  const lines = [];
  tables.forEach((table) => {
    if (table.caption) lines.push(csvCell(table.caption));
    lines.push(table.headers.map(csvCell).join(","));
    table.rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
    lines.push("");
  });
  return `\uFEFF${lines.join("\n")}`;
}

function reportWord(schoolName, title, tables) {
  const body = tables.map((table) => {
    const head = `<tr>${table.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>`;
    const rows = table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    return `<h2>${escapeHtml(table.caption || title)}</h2><table border="1" cellspacing="0" cellpadding="6">${head}${rows}</table>`;
  }).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(schoolName || "IshuriApp")}</h1><p>${escapeHtml(title)}</p>${body}</body></html>`;
}

function ReportPreview({ school, title, literal = false, tables, onClose }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const heading = literal ? title : t(title);
  return createPortal(
    <div className="doc-preview is-landscape" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="doc-toolbar no-print">
        <strong>{heading}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <PaperHead school={school} title={title} literal={literal} />
          {tables.map((table) => (
            <table className="doc-table fee-paper" key={table.caption || table.headers.join("-")}>
              {table.caption ? <caption>{table.caption}</caption> : null}
              <thead><tr>{table.headers.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
            </table>
          ))}
        </article>
      </div>
    </div>,
    document.body
  );
}

function ReportActions({ school, title, literal = false, tables, modes = ["pdf", "excel", "word"] }) {
  const [open, setOpen] = useState(false);
  const ready = (tables || []).some((table) => table.rows.length);
  if (!ready) return null;
  const heading = literal ? title : t(title);
  const stamp = todayStamp();
  const slug = reportSlug(literal ? title : title);
  return (
    <div className="actions no-print">
      {modes.includes("pdf") ? <button className="solid" type="button" onClick={() => setOpen(true)}>{t("Print / Save PDF")}</button> : null}
      {modes.includes("excel") ? <button className="ghost" type="button" onClick={() => downloadReport(`ishuriapp-${slug}-${stamp}.csv`, "text/csv;charset=utf-8", reportCsv(tables))}>{t("Excel")}</button> : null}
      {modes.includes("word") ? <button className="ghost" type="button" onClick={() => downloadReport(`ishuriapp-${slug}-${stamp}.doc`, "application/msword", reportWord(school?.name, heading, tables))}>{t("Word")}</button> : null}
      {open ? <ReportPreview school={school} title={title} literal={literal} tables={tables} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function rwf(value) {
  return `${new Intl.NumberFormat("en-RW").format(Number(value) || 0)} RWF`;
}

function todayStamp() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dayLabel(value) {
  const text = String(value || "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match) return match[1];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const PERIODS = [
  { id: "", label: "All dates" },
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];
const STATUSES = [
  { id: "", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "partial", label: "Part paid" },
  { id: "unpaid", label: "Unpaid" },
];
const RISKS = [
  { id: "", label: "All" },
  { id: "normal", label: "Normal" },
  { id: "medium", label: "Medium" },
  { id: "at_risk", label: "At risk" },
];

function shiftDay(stamp, days) {
  const date = new Date(`${stamp}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(stamp) {
  const date = new Date(`${stamp}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] || 0;
  return shiftDay(stamp, -back);
}

function inPeriod(value, filters) {
  const day = dayLabel(value);
  const yearText = String(filters.year || "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.from || "")) ? filters.from : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.to || "")) ? filters.to : "";
  const yearOn = /^\d{4}$/.test(yearText);
  if (!filters.period && !yearOn && !from && !to) return true;
  if (!day) return false;
  if (yearOn && day.slice(0, 4) !== yearText) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  if (!filters.period) return true;
  if (filters.period === "day") return day === filters.on;
  if (filters.period === "year") {
    const month = Number(day.slice(5, 7));
    if (filters.term === "1") return month >= 1 && month <= 4;
    if (filters.term === "2") return month >= 5 && month <= 8;
    if (filters.term === "3") return month >= 9 && month <= 12;
    return true;
  }
  if (filters.period === "month") return day.slice(0, 7) === `${yearText}-${String(filters.month).padStart(2, "0")}`;
  const start = mondayOf(filters.on);
  return day >= start && day <= shiftDay(start, 6);
}

function applyPeriod(row, filters) {
  const yearOn = /^\d{4}$/.test(String(filters.year || ""));
  if (!filters.period && !yearOn && !filters.from && !filters.to) return row;
  const list = row.payments || [];
  if (!list.length) return row;
  const paid = list.filter((payment) => inPeriod(payment.paidOn, filters)).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  return { ...row, amountPaid: paid, lifetimePaid: row.amountPaid };
}

function settledPaid(row) {
  return Number(row.lifetimePaid != null ? row.lifetimePaid : row.amountPaid) || 0;
}

function studentMatches(balance, filters) {
  const paid = balance.paid;
  const unpaid = balance.unpaid;
  const status = unpaid <= 0 ? "paid" : paid <= 0 ? "unpaid" : "partial";
  const risk = unpaid <= 0 ? "normal" : paid <= 0 ? "at_risk" : "medium";
  if (filters.status && status !== filters.status) return false;
  if (filters.risk && risk !== filters.risk) return false;
  if (filters.min !== "" && unpaid < Number(filters.min)) return false;
  if (filters.max !== "" && unpaid > Number(filters.max)) return false;
  if (filters.below !== "" && (balance.feeBilled <= 0 || balance.feesPaid >= Number(filters.below))) return false;
  if (filters.items.length) {
    const owes = balance.items.some((item) => filters.items.includes(String(item.accountId)) && item.unpaid > 0);
    if (!owes) return false;
  }
  return true;
}

function viewOf(items, roster, filters) {
  const dated = (items || []).map((row) => applyPeriod(row, filters));
  const balances = new Map();
  dated.forEach((row) => {
    const id = String(row.studentId || "");
    if (!id) return;
    const current = balances.get(id) || { paid: 0, unpaid: 0, feesPaid: 0, feeBilled: 0, items: [] };
    current.paid += settledPaid(row);
    current.unpaid += Number(row.unpaid) || 0;
    if (row.accountGroup === "fee") {
      current.feesPaid += settledPaid(row);
      current.feeBilled += Number(row.amountDue) || 0;
    }
    current.items.push(row);
    balances.set(id, current);
  });
  const shownRoster = roster.filter((student) => {
    const classId = String(student.classRoom?._id || student.classRoom || "");
    if (filters.classId && classId !== String(filters.classId)) return false;
    if (filters.studentId && String(student._id) !== String(filters.studentId)) return false;
    const balance = balances.get(String(student._id)) || { paid: 0, unpaid: 0, feesPaid: 0, feeBilled: 0, items: [] };
    return studentMatches(balance, filters);
  });
  const ids = new Set(shownRoster.map((student) => String(student._id)));
  return {
    dated,
    shownRoster,
    shownCharges: dated.filter((row) => ids.has(String(row.studentId))),
  };
}

function LedgerFilters({ value, classes, items, onChange }) {
  function set(patch) { onChange({ ...value, ...patch }); }
  return (
    <form className="panel books-filters" onSubmit={(event) => event.preventDefault()}>
      <div className="span chips">
        {PERIODS.map((item) => <button type="button" key={item.id || "all"} className={value.period === item.id ? "on" : ""} onClick={() => set({ period: item.id })}>{t(item.label)}</button>)}
      </div>
      <label className="field">{t("Year")}<input inputMode="numeric" value={value.year} onChange={(event) => set({ year: event.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
      <label className="field">{t("From")}<input type="date" value={value.from || ""} onChange={(event) => set({ from: event.target.value })} /></label>
      <label className="field">{t("To")}<input type="date" value={value.to || ""} onChange={(event) => set({ to: event.target.value })} /></label>
      {value.period === "day" || value.period === "week" ? <label className="field">{t("Date")}<input type="date" value={value.on} onChange={(event) => set({ on: event.target.value })} /></label> : null}
      {value.period === "year" ? (
        <label className="field">{t("Term")}
          <select value={value.term || ""} onChange={(event) => set({ term: event.target.value })}>
            <option value="">{t("Annual")}</option>
            <option value="1">{t("Term 1")}</option>
            <option value="2">{t("Term 2")}</option>
            <option value="3">{t("Term 3")}</option>
          </select>
        </label>
      ) : null}
      {value.period === "year" && value.term ? <p className="muted span">{t("Term 1 is January to April. Term 2 is May to August. Term 3 is September to December.")}</p> : null}
      {value.period === "month" ? <label className="field">{t("Month")}<input type="number" min="1" max="12" value={value.month} onChange={(event) => set({ month: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /></label> : null}
      <label className="field">{t("Class")}
        <select value={value.classId} onChange={(event) => set({ classId: event.target.value })}>
          <option value="">{t("All classes")}</option>
          {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
        </select>
      </label>
      <label className="field">{t("Status")}
        <select value={value.status} onChange={(event) => set({ status: event.target.value })}>
          {STATUSES.map((item) => <option key={item.id || "all"} value={item.id}>{t(item.label)}</option>)}
        </select>
      </label>
      <label className="field">{t("Risk")}
        <select value={value.risk} onChange={(event) => set({ risk: event.target.value })}>
          {RISKS.map((item) => <option key={item.id || "all"} value={item.id}>{t(item.label)}</option>)}
        </select>
      </label>
      <label className="field">{t("Unpaid from (RWF)")}<input inputMode="numeric" value={value.min} onChange={(event) => set({ min: digits(event.target.value) })} /></label>
      <label className="field">{t("Unpaid to (RWF)")}<input inputMode="numeric" value={value.max} onChange={(event) => set({ max: digits(event.target.value) })} /></label>
      <label className="field">{t("School fees paid below (RWF)")}<input inputMode="numeric" value={value.below} onChange={(event) => set({ below: digits(event.target.value) })} /></label>
      <div className="span">
        <p className="kicker">{t("Still unpaid on")}</p>
        <div className="chips">
          {items.map((item) => {
            const id = String(item.id);
            return <button type="button" key={id} className={value.items.includes(id) ? "on" : ""} onClick={() => set({ items: value.items.includes(id) ? value.items.filter((itemId) => itemId !== id) : [...value.items, id] })}>{item.name}</button>;
          })}
        </div>
      </div>
    </form>
  );
}

function fitsClass(account, roomId) {
  const ids = (account.classIds || []).map(String);
  return ids.length === 0 || ids.includes(String(roomId));
}

export function accountantNav(accounts) {
  return (accounts || [])
    .filter((item) => item.group === "fee" || item.group === "material")
    .slice()
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "fee" ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
}

function buildSheet(room, roster, accounts, charges) {
  const people = roster
    .filter((student) => String(student.classRoom?._id || student.classRoom) === String(room._id))
    .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  const columns = accounts.filter((account) => fitsClass(account, room._id));
  if (!people.length || !columns.length) return null;
  const students = people.map((student) => {
    let paid = 0;
    let unpaid = 0;
    const marks = columns.map((account) => {
      const rows = charges.filter((row) => String(row.studentId) === String(student._id) && String(row.accountId) === String(account.id));
      const got = rows.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
      const kept = rows.reduce((sum, row) => sum + settledPaid(row), 0);
      const price = Number(account.amount) || 0;
      const due = price || rows.reduce((sum, row) => sum + row.amountDue, 0);
      const left = Math.max(0, due - kept);
      paid += got;
      unpaid += left;
      return { id: account.id, name: account.name, due, left, paidAmount: got, settled: kept > 0 };
    });
    return { id: student._id, name: student.fullName, marks, paid, unpaid };
  });
  return {
    id: room._id,
    name: room.name,
    columns,
    students,
    paid: students.reduce((sum, student) => sum + student.paid, 0),
    unpaid: students.reduce((sum, student) => sum + student.unpaid, 0),
  };
}

function PaperHead({ school, title, place, literal = false }) {
  return <PrintHeading school={school} title={literal ? title : t(title)} note={place} />;
}

function SheetTable({ sheet }) {
  const showClass = Boolean(sheet.showClass);
  return (
    <table className="doc-table fee-paper">
      <caption>{sheet.columns.length === 1 ? sheet.columns[0].name : sheet.columns.map((column) => column.name).join(" · ")}</caption>
      <thead>
        <tr>
          <th>{t("No.")}</th>
          {showClass ? <th>{t("Class")}</th> : null}
          <th>{t("Student")}</th>
          {sheet.columns.map((column) => <th key={column.id}>{column.name}</th>)}
          <th className="num">{t("Amount paid")}</th>
          <th className="num">{t("Unpaid")}</th>
        </tr>
      </thead>
      <tbody>
        {sheet.students.map((student, index) => (
          <tr key={`${student.className || ""}:${student.id}`}>
            <td>{index + 1}</td>
            {showClass ? <td>{student.className}</td> : null}
            <td>{student.name}</td>
            {student.marks.map((mark) => (
              <td key={mark.id} className={`doc-mark${mark.settled ? " is-paid" : " is-unpaid"}`} aria-label={`${mark.name} ${mark.settled ? t("Paid") : t("Unpaid")}`}>{mark.settled ? "✓" : "✗"}</td>
            ))}
            <td className="num">{rwf(student.paid)}</td>
            <td className="num">{rwf(student.unpaid)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={(showClass ? 3 : 2) + sheet.columns.length}>{t("Class total")}</td>
          <td className="num">{rwf(sheet.paid)}</td>
          <td className="num">{rwf(sheet.unpaid)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function SheetPaper({ school, title, sheet, onClose, literal = false }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const heading = literal ? title : t(title);
  return createPortal(
    <div className="doc-preview is-landscape" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="doc-toolbar no-print">
        <strong>{heading} · {sheet.name}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <PaperHead school={school} title={title} place={sheet.name} literal={literal} />
          <p className="muted">{t("A tick means the item is paid. A cross means it is still unpaid.")}</p>
          <SheetTable sheet={sheet} />
        </article>
      </div>
    </div>,
    document.body
  );
}

function unpaidOf(due, paid) {
  const total = Number(due) || 0;
  const settled = Number(paid) || 0;
  return Math.max(0, total - settled);
}

function Balance({ due, paid, title = "" }) {
  const unpaid = unpaidOf(due, paid);
  const over = String(paid || "") !== "" && Number(paid) > Number(due || 0);
  return (
    <table className="doc-table fee-paper">
      {title ? <caption>{title}</caption> : null}
      <thead>
        <tr>
          <th className="num">{t("Amount due")}</th>
          <th className="num">{t("Amount paid")}</th>
          <th className="num">{t("Unpaid")}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="num">{rwf(due)}</td>
          <td className="num">{rwf(paid)}</td>
          <td className="num">{over ? "—" : rwf(unpaid)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ClassChoice({ allClasses, classIds, classes, submitted, onChange }) {
  const selected = classIds.map(String);
  return (
    <>
      <div className="chips">
        <button type="button" className={allClasses ? "on" : ""} onClick={() => onChange(true, [])}>{t("All classes")}</button>
        <button type="button" className={allClasses ? "" : "on"} onClick={() => onChange(false, selected)}>{t("Some classes")}</button>
      </div>
      {allClasses ? null : (
        <div className="chips">
          {classes.map((room) => {
            const id = String(room._id);
            const on = selected.includes(id);
            return <button type="button" key={id} className={on ? "on" : ""} onClick={() => onChange(false, on ? selected.filter((item) => item !== id) : [...selected, id])}>{room.name}</button>;
          })}
          {submitted && selected.length === 0 ? <span className="field-error" role="alert">{t("Choose the classes for this item.")}</span> : null}
        </div>
      )}
    </>
  );
}

function readBooksRoute(viewId) {
  const parts = String(viewId || "").split("/").filter(Boolean);
  const base = { kind: "home", classId: "", mode: "", itemId: "", studentId: "" };
  if (parts[0] === "student" && parts[1]) return { ...base, kind: "student", studentId: parts[1] };
  if (parts[0] === "class" && parts[1]) {
    const mode = parts[2] === "pay" || parts[2] === "report" ? parts[2] : "home";
    return { ...base, kind: "class", classId: parts[1], mode, itemId: mode === "pay" ? (parts[3] || "") : "" };
  }
  if (parts[0] === "fees") return { ...base, kind: "fees", classId: parts[1] || "" };
  if (parts[0] === "materials") return { ...base, kind: "materials", classId: parts[1] || "" };
  if (parts[0] === "status") return { ...base, kind: "status" };
  if (parts[0] === "income") return { ...base, kind: "income" };
  if (parts[0] === "another") return { ...base, kind: "another" };
  if (parts[0] === "expenses") return { ...base, kind: "expenses" };
  if (parts[0]) return { ...base, kind: "item", itemId: parts[0] };
  return base;
}

export function StudentSearch({ roster, classes, onPick, placeholder = "" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const text = query.trim().toLowerCase();
  const matches = text
    ? roster.filter((student) => `${student.fullName || ""} ${student.studentCode || ""}`.toLowerCase().includes(text)).slice(0, 8)
    : [];
  function className(student) {
    const id = String(student.classRoom?._id || student.classRoom || "");
    return classes.find((room) => String(room._id) === id)?.name || "";
  }
  function choose(student) {
    setQuery(student.fullName);
    setOpen(false);
    onPick(student);
  }
  return (
    <div className="fee-find">
      <form className="search" onSubmit={(event) => { event.preventDefault(); if (matches[0]) choose(matches[0]); }}>
        <input aria-label={t("Student")} placeholder={placeholder || t("Type a student name")} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      </form>
      {open && text && matches.length === 0 ? <p className="muted">{t("No one matches that search.")}</p> : null}
      {open && matches.length ? (
        <ul>
          {matches.map((student) => (
            <li key={student._id}>
              <button type="button" onClick={() => choose(student)}>
                <strong>{student.fullName}</strong>
                <span>{[className(student), student.studentCode].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ClassPick({ classes, active, onPick }) {
  return (
    <div className="chips">
      {classes.map((room) => {
        const id = String(room._id);
        return <button type="button" key={id} className={id === String(active) ? "on" : ""} onClick={() => onPick(id)}>{room.name}</button>;
      })}
    </div>
  );
}

function itemScope(item, classes) {
  const ids = (item.classIds || []).map(String);
  if (!ids.length) return t("All classes");
  return classes.filter((room) => ids.includes(String(room._id))).map((room) => room.name).join(", ");
}

function ChargeTable({ rows, empty, payAmounts, setPayAmounts, onPay }) {
  if (!rows.length) return <p className="roster-empty">{t(empty)}</p>;
  const names = [...new Set(rows.map((row) => row.accountName).filter(Boolean))];
  return (
    <article className="doc-student">
      {names.map((name) => {
        const group = rows.filter((row) => row.accountName === name);
        return (
      <table className="doc-table fee-paper" key={name}>
        <caption>{name}</caption>
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Student")}</th>
            <th>{t("Class")}</th>
            <th>{t("Item")}</th>
            <th className="num">{t("Amount due")}</th>
            <th className="num">{t("Amount paid")}</th>
            <th className="num">{t("Unpaid")}</th>
            <th>{t("Record payment")}</th>
          </tr>
        </thead>
        <tbody>
          {group.map((row, index) => {
            const value = payAmounts[row.id] || "";
            const over = String(value) !== "" && Number(value) > row.unpaid;
            return (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>{row.studentName}</td>
                <td>{row.className || t("Class")}</td>
                <td>{row.accountName}</td>
                <td className="num">{rwf(row.amountDue)}</td>
                <td className="num">{rwf(row.amountPaid)}</td>
                <td className="num">{rwf(row.unpaid)}</td>
                <td>
                  {row.unpaid > 0 ? (
                    <div className="fee-pay">
                      <input className={over ? "invalid" : undefined} inputMode="numeric" aria-invalid={over || undefined} aria-label={`${name} ${t("Amount paid")}`} value={value} onChange={(event) => setPayAmounts((current) => ({ ...current, [row.id]: digits(event.target.value) }))} />
                      <button className="solid" type="button" onClick={() => onPay(row)}>{t("Record payment")}</button>
                      {over ? <span className="field-error" role="alert">{t("The amount paid cannot be above the total.")}</span> : null}
                    </div>
                  ) : t("Paid")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        );
      })}
    </article>
  );
}

function accountCalc(account, classes, roster, charges) {
  const rooms = classes.filter((room) => fitsClass(account, room._id));
  const rows = rooms.map((room) => {
    const people = roster.filter((student) => String(student.classRoom?._id || student.classRoom) === String(room._id));
    const ids = new Set(people.map((student) => String(student._id)));
    const each = Number(account.amount) || 0;
    const matched = (charges || []).filter((row) => String(row.accountId) === String(account.id) && ids.has(String(row.studentId)));
    const paid = matched.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
    const kept = matched.reduce((sum, row) => sum + settledPaid(row), 0);
    const expected = each * people.length;
    return { id: `${account.id}:${room._id}`, classId: String(room._id), className: room.name, item: account.name, count: people.length, ids: [...ids], each, expected, paid, unpaid: Math.max(0, expected - kept) };
  });
  return { rows, school: schoolTotal(rows) };
}

const BOARD_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const BOARD_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOARD_COLORS = ["#2F6BFF", "#7C4DFF", "#22A06B", "#F5A623", "#0D47A1", "#5B8DEF"];

function shortRwf(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${abs}`;
}

export function shiftStamp(stamp, days) {
  const date = new Date(`${stamp}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function moneyFlow(items, entries, stamp, span) {
  const windows = { "7d": 7, "30d": 30, "3m": 90, "1y": 366 };
  const length = windows[span] || 30;
  const start = shiftStamp(stamp, -length);
  const prevStart = shiftStamp(stamp, -length * 2);
  const inside = (day) => Boolean(day) && day > start && day <= stamp;
  const previous = (day) => Boolean(day) && day > prevStart && day <= start;
  const byDay = new Map();
  const expenseAccounts = new Map();
  const classPaid = new Map();
  const recent = [];
  let fee = 0;
  let material = 0;
  let other = 0;
  let expense = 0;
  let prevIncome = 0;
  let prevExpense = 0;
  const addDay = (day, key, amount) => {
    const row = byDay.get(day) || { income: 0, expense: 0 };
    row[key] += amount;
    byDay.set(day, row);
  };
  (items || []).forEach((charge) => {
    const group = charge.accountGroup === "fee" ? "fee" : "material";
    const payments = charge.payments || [];
    if (payments.length) {
      payments.forEach((payment, index) => {
        const day = dayLabel(payment.paidOn);
        const amount = Number(payment.amount) || 0;
        if (inside(day)) {
          if (group === "fee") fee += amount;
          else material += amount;
          if (day) addDay(day, "income", amount);
          classPaid.set(String(charge.classId || ""), (classPaid.get(String(charge.classId || "")) || 0) + amount);
          recent.push({ id: `${charge.id}-${index}`, title: `${charge.studentName || ""} · ${charge.accountName || ""}`, day, amount, incoming: true });
        }
        if (previous(day)) {
          prevIncome += amount;
          if (day) addDay(day, "income", amount);
        }
      });
    }
  });
  (entries || []).forEach((entry) => {
    const day = dayLabel(entry.occurredOn);
    const amount = Number(entry.amount) || 0;
    const income = entry.kind === "other_income";
    if (inside(day)) {
      if (income) {
        other += amount;
        if (day) addDay(day, "income", amount);
      } else {
        expense += amount;
        if (day) addDay(day, "expense", amount);
        const name = entry.accountName || entry.title || "Expenses";
        expenseAccounts.set(name, (expenseAccounts.get(name) || 0) + amount);
      }
      recent.push({ id: String(entry.id), title: entry.title || entry.accountName || "", day, amount, incoming: income });
    }
    if (previous(day)) {
      if (income) prevIncome += amount;
      else prevExpense += amount;
      if (day) addDay(day, income ? "income" : "expense", amount);
    }
  });
  recent.sort((a, b) => String(b.day).localeCompare(String(a.day)));
  return { fee, material, other, expense, prevIncome, prevExpense, byDay, expenseAccounts, classPaid, recent: recent.slice(0, 6) };
}

export function flowSeries(flow, span, stamp) {
  const days = span === "7d" ? 7 : span === "3m" ? 90 : span === "1y" ? 366 : 30;
  if (span === "3m" || span === "1y") {
    const count = span === "3m" ? 3 : 12;
    return Array.from({ length: count }, (_, index) => {
      const cursor = new Date(`${stamp}T12:00:00.000Z`);
      cursor.setUTCMonth(cursor.getUTCMonth() - (count - 1 - index));
      const key = cursor.toISOString().slice(0, 7);
      let income = 0;
      let expense = 0;
      flow.byDay.forEach((row, day) => {
        if (day.slice(0, 7) === key) {
          income += row.income;
          expense += row.expense;
        }
      });
      return { label: t(BOARD_MONTHS[cursor.getUTCMonth()]), income, expense };
    });
  }
  return Array.from({ length: days }, (_, index) => {
    const day = shiftStamp(stamp, index - (days - 1));
    const row = flow.byDay.get(day) || { income: 0, expense: 0 };
    return { label: day.slice(5), income: row.income, expense: row.expense };
  });
}

export function donutSlices(rows) {
  return rows.filter((row) => row.value > 0).map((row, index) => ({ ...row, color: BOARD_COLORS[index % BOARD_COLORS.length] }));
}

function niceMax(value) {
  const amount = Number(value) || 0;
  if (amount <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(amount));
  const step = amount / pow;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * pow;
}

function countMax(value) {
  const amount = Math.ceil(Number(value) || 0);
  if (amount <= 0) return 4;
  return Math.max(4, Math.ceil(amount / 4) * 4);
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const prev = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const c1x = current.x + (next.x - prev.x) / 6;
    const c1y = current.y + (next.y - prev.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`;
  }
  return path;
}

export function MoneyDonut({ slices, total, format = shortRwf, unit = "RWF", empty = "No payments in this period." }) {
  if (!slices.length) return <p className="muted hint-line"><Icon name="info" /> {t(empty)}</p>;
  const radius = 54;
  const length = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 8 : 0;
  const usable = Math.max(0, length - gap * slices.length);
  let cursor = 0;
  return (
    <div className="acct-donut-row">
      <div className="acct-donut">
        <svg viewBox="0 0 160 160" role="img">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#eef3f8" strokeWidth="18" />
          {slices.map((slice) => {
            const span = total ? (slice.value / total) * usable : 0;
            const ring = (
              <circle
                key={slice.name}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="18"
                strokeDasharray={`${span} ${length - span}`}
                strokeDashoffset={-cursor}
                transform="rotate(-90 80 80)"
              />
            );
            cursor += span + gap;
            return ring;
          })}
        </svg>
        <div className="acct-donut-hole">
          <strong>{format(total)}</strong>
          {unit ? <span>{unit}</span> : null}
        </div>
      </div>
      <ul className="legend">
        {slices.map((slice) => (
          <li key={slice.name}>
            <i style={{ background: slice.color }} />
            <span>{slice.name}</span>
            <b>{total ? Math.round((slice.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const RANGES = [
  ["7d", "7D", "Last 7 days"],
  ["30d", "30D", "This month"],
  ["3m", "3M", "3M"],
  ["1y", "1Y", "This year"],
];

export function MiniBars({ rows, dataKey, color }) {
  const source = rows.length ? rows : [{ [dataKey]: 0 }];
  const shown = Array.from({ length: 7 }, (_, index) => {
    const at = Math.round((index / 6) * (source.length - 1));
    return Number(source[at][dataKey]) || 0;
  });
  const max = Math.max(...shown, 1);
  return (
    <svg className="acct-bars" viewBox="0 0 64 48" aria-hidden="true">
      {shown.map((value, index) => {
        const bar = Math.max(value > 0 ? 8 : 4, (value / max) * 42);
        return <rect key={index} x={index * 9} y={48 - bar} width="6" height={bar} rx="2" fill={color} opacity={0.35 + (index / 6) * 0.65} />;
      })}
    </svg>
  );
}

export function WaveChart({ series, format = rwf, count = false }) {
  if (!series.length) return null;
  const width = 640;
  const height = 250;
  const pad = { l: 48, r: 12, t: 16, b: 28 };
  const peakValue = Math.max(0, ...series.map((row) => Math.max(row.income, row.expense)));
  const top = count ? countMax(peakValue) : niceMax(peakValue);
  const axis = count ? format : shortRwf;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index) => pad.l + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yAt = (value) => pad.t + innerH - (value / top) * innerH;
  const income = series.map((row, index) => ({ x: xAt(index), y: yAt(row.income), ...row }));
  const expense = series.map((row, index) => ({ x: xAt(index), y: yAt(row.expense) }));
  const incomeLine = smoothPath(income);
  const expenseLine = smoothPath(expense);
  const baseline = yAt(0);
  const incomeArea = `${incomeLine} L ${income[income.length - 1].x} ${baseline} L ${income[0].x} ${baseline} Z`;
  const expenseArea = `${expenseLine} L ${expense[expense.length - 1].x} ${baseline} L ${expense[0].x} ${baseline} Z`;
  const peak = income.reduce((best, point) => (point.income > best.income ? point : best), income[0]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labels = [0, Math.floor(series.length / 2), series.length - 1];
  const tipX = Math.min(Math.max(peak.x - 58, pad.l), width - pad.r - 124);
  return (
    <svg className="acct-wave" viewBox={`0 0 ${width} ${height}`} role="img">
      <defs>
        <linearGradient id="acct-income-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2F6BFF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#2F6BFF" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="acct-expense-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5A623" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#F5A623" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((part) => (
        <g key={part}>
          <line x1={pad.l} x2={width - pad.r} y1={yAt(top * part)} y2={yAt(top * part)} stroke="#e7eef6" />
          <text x={pad.l - 8} y={yAt(top * part) + 4} textAnchor="end" className="acct-axis">{axis(top * part)}</text>
        </g>
      ))}
      <path d={expenseArea} fill="url(#acct-expense-fill)" />
      <path d={incomeArea} fill="url(#acct-income-fill)" />
      <path d={expenseLine} fill="none" stroke="#F5A623" strokeWidth="2.6" strokeLinejoin="round" />
      <path d={incomeLine} fill="none" stroke="#2F6BFF" strokeWidth="2.8" strokeLinejoin="round" />
      {peak.income > 0 ? (
        <g>
          <line x1={peak.x} x2={peak.x} y1={peak.y} y2={baseline} stroke="#d5e2f2" strokeDasharray="3 4" />
          <circle cx={peak.x} cy={peak.y} r="5.5" fill="#2F6BFF" stroke="#ffffff" strokeWidth="2.5" />
          <g transform={`translate(${tipX} ${Math.max(6, peak.y - 48)})`}>
            <rect width="124" height="38" rx="10" fill="#ffffff" stroke="#e6eef8" />
            <text x="10" y="16" className="acct-tip">{format(peak.income)}</text>
            <text x="10" y="30" className="acct-axis">{peak.label}</text>
          </g>
        </g>
      ) : null}
      {labels.map((index) => (
        <text key={index} x={xAt(index)} y={height - 6} textAnchor="middle" className="acct-axis">{series[index]?.label}</text>
      ))}
    </svg>
  );
}

export function WeekBars({ rows, format = shortRwf, count = false }) {
  const width = 420;
  const height = 210;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const peak = Math.max(0, ...rows.flatMap((row) => [row.now, row.before]));
  const top = count ? countMax(peak) : niceMax(peak);
  const innerH = height - pad.t - pad.b;
  const group = (width - pad.l - pad.r) / Math.max(rows.length, 1);
  const yAt = (value) => pad.t + innerH - (value / top) * innerH;
  const base = yAt(0);
  return (
    <svg className="acct-wave" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, 0.5, 1].map((part) => (
        <g key={part}>
          <line x1={pad.l} x2={width - pad.r} y1={yAt(top * part)} y2={yAt(top * part)} stroke="#e7eef6" />
          <text x={pad.l - 6} y={yAt(top * part) + 4} textAnchor="end" className="acct-axis">{format(top * part)}</text>
        </g>
      ))}
      {rows.map((row, index) => {
        const center = pad.l + group * index + group / 2;
        const before = Math.max(row.before > 0 ? 3 : 0, base - yAt(row.before));
        const now = Math.max(row.now > 0 ? 3 : 0, base - yAt(row.now));
        return (
          <g key={`${row.label}-${index}`}>
            <rect x={center - 10} y={base - before} width="8" height={before} rx="2" fill="#B9D4FF" />
            <rect x={center + 1} y={base - now} width="8" height={now} rx="2" fill="#2F6BFF" />
            <text x={center} y={height - 6} textAnchor="middle" className="acct-axis">{row.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ClassCollection({ rows, total, format = rwf, empty = "No payments in this period." }) {
  if (!rows.length) return <p className="muted hint-line"><Icon name="info" /> {t(empty)}</p>;
  return (
    <div className="acct-collect">
      <div className="acct-collect-stack" aria-hidden="true">
        {rows.map((row, index) => {
          const share = total ? (row.paid / total) * 100 : 0;
          return <i key={row.id} style={{ width: `${share}%`, background: BOARD_COLORS[index % BOARD_COLORS.length] }} />;
        })}
      </div>
      <ul>
        {rows.map((row, index) => {
          const share = total ? Math.round((row.paid / total) * 100) : 0;
          const color = BOARD_COLORS[index % BOARD_COLORS.length];
          return (
            <li key={row.id}>
              <i style={{ background: color }} />
              <div>
                <strong>{row.name}</strong>
                <small>{format(row.paid)}</small>
                <span><b style={{ width: `${share}%`, background: color }} /></span>
              </div>
              <em>{share}%</em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccountantBoard({ userName, classes, roster, links, items, entries }) {
  const [span, setSpan] = useState("30d");
  const stamp = todayStamp();
  const flow = useMemo(() => moneyFlow(items, entries, stamp, span), [items, entries, stamp, span]);
  const series = flowSeries(flow, span, stamp);
  const stock = useMemo(() => links.reduce((total, account) => {
    const calc = accountCalc(account, classes, roster, items);
    total.expected += calc.school.expected;
    total.unpaid += calc.school.unpaid;
    return total;
  }, { expected: 0, unpaid: 0 }), [links, classes, roster, items]);
  const income = flow.fee + flow.material + flow.other;
  const net = income - flow.expense;
  const incomeChange = flow.prevIncome > 0 ? Math.round(((income - flow.prevIncome) / flow.prevIncome) * 100) : null;
  const expenseChange = flow.prevExpense > 0 ? Math.round(((flow.expense - flow.prevExpense) / flow.prevExpense) * 100) : null;
  const netPrev = flow.prevIncome - flow.prevExpense;
  const netChange = netPrev !== 0 ? Math.round(((net - netPrev) / Math.abs(netPrev)) * 100) : null;
  const incomeSlices = donutSlices([
    { name: t("School fees"), value: flow.fee },
    { name: t("Other items"), value: flow.material },
    { name: t("Another income"), value: flow.other },
  ]);
  const expenseSlices = donutSlices([...flow.expenseAccounts.entries()].map(([name, value]) => ({ name: t(name), value })));
  const classRows = classes.map((room) => ({ id: room._id, name: room.name, paid: flow.classPaid.get(String(room._id)) || 0 })).sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name));
  const spark = series.slice(-12);
  const classTotal = classRows.reduce((sum, row) => sum + row.paid, 0);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = shiftStamp(stamp, index - 6);
    const before = shiftStamp(stamp, index - 13);
    const now = flow.byDay.get(day) || { income: 0 };
    const prev = flow.byDay.get(before) || { income: 0 };
    return { label: t(BOARD_DAYS[new Date(`${day}T12:00:00.000Z`).getUTCDay()]), now: now.income, before: prev.income };
  });
  function changeLine(value) {
    if (value == null) return null;
    const change = `${value > 0 ? "+" : ""}${value}`;
    return t("{change}% vs the previous period", { change });
  }
  return (
    <>
      <header className="acct-top">
        <div>
          <h2>{t("Welcome back, {name}.", { name: userName || t("Accountant") })}</h2>
          <p>{t("Here is the school money for this period.")}</p>
        </div>
        <label className="acct-period">
          <Icon name="calendar" />
          <select value={span} aria-label={t("Period")} onChange={(event) => setSpan(event.target.value)}>
            {RANGES.map(([id, , label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </label>
      </header>
      <div className="acct-kpis">
        <article className="acct-kpi is-income">
          <span className="acct-kpi-icon"><Icon name="coins" /></span>
          <div>
            <span>{t("Total income")}</span>
            <strong>{rwf(income)}</strong>
            {changeLine(incomeChange) ? <em className={incomeChange < 0 ? "is-down" : "is-up"}><Icon name={incomeChange < 0 ? "down" : "up"} /> {changeLine(incomeChange)}</em> : null}
          </div>
          <MiniBars rows={spark} dataKey="income" color="#2F6BFF" />
        </article>
        <article className="acct-kpi is-expense">
          <span className="acct-kpi-icon"><Icon name="receipt" /></span>
          <div>
            <span>{t("Total expenses")}</span>
            <strong>{rwf(flow.expense)}</strong>
            {changeLine(expenseChange) ? <em className={expenseChange < 0 ? "is-down" : "is-up"}><Icon name={expenseChange < 0 ? "down" : "up"} /> {changeLine(expenseChange)}</em> : null}
          </div>
          <MiniBars rows={spark} dataKey="expense" color="#22A06B" />
        </article>
        <article className="acct-kpi is-net">
          <span className="acct-kpi-icon"><Icon name="scale" /></span>
          <div>
            <span>{t("Net")}</span>
            <strong>{rwf(net)}</strong>
            {changeLine(netChange) ? <em className={netChange < 0 ? "is-down" : "is-up"}><Icon name={netChange < 0 ? "down" : "up"} /> {changeLine(netChange)}</em> : null}
          </div>
          <MiniBars rows={spark.map((row) => ({ ...row, net: row.income - row.expense }))} dataKey="net" color="#7C4DFF" />
        </article>
        <article className="acct-kpi is-due">
          <span className="acct-kpi-icon"><Icon name="wallet" /></span>
          <div>
            <span>{t("Unpaid")}</span>
            <strong>{rwf(stock.unpaid)}</strong>
          </div>
          <MiniBars rows={spark} dataKey="income" color="#F5A623" />
        </article>
      </div>
      <div className="acct-split">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t("Income and expenses")}</h2>
            <div className="acct-card-tools">
              <p className="acct-key"><span><i className="is-income" />{t("Income")}</span><span><i className="is-expense" />{t("Expenses")}</span></p>
              <div className="acct-pills">
                {RANGES.map(([id, label]) => (
                  <button key={id} type="button" className={span === id ? "on" : ""} onClick={() => setSpan(id)}>{t(label)}</button>
                ))}
              </div>
            </div>
          </header>
          <WaveChart series={series} />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t("Income by source")}</h2>
          </header>
          <MoneyDonut slices={incomeSlices} total={income} />
        </section>
      </div>
      <div className="acct-three">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t("Expenses by account")}</h2>
          </header>
          {expenseSlices.length ? <MoneyDonut slices={expenseSlices} total={flow.expense} /> : <p className="muted hint-line"><Icon name="info" /> {t("No expenses yet.")}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="receipt" /> {t("Recent payments")}</h2>
          </header>
          {flow.recent.length ? flow.recent.map((row) => (
            <div className="acct-tx" key={row.id}>
              <span className={row.incoming ? "acct-dir is-in" : "acct-dir is-out"}><Icon name={row.incoming ? "up" : "down"} /></span>
              <div>
                <strong>{row.title}</strong>
                <span>{row.day}</span>
              </div>
              <b className={row.incoming ? "is-in" : "is-out"}>{row.incoming ? "+" : "−"}{rwf(row.amount)}</b>
            </div>
          )) : <p className="muted hint-line"><Icon name="info" /> {t("No payments in this period.")}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="people" /> {t("Classes")}</h2>
          </header>
          {classRows.map((row, index) => (
              <button className="acct-rank" type="button" key={row.id} onClick={() => { window.location.hash = `#/desk/books/class/${row.id}`; }}>
                <span className={index === 0 ? "is-gold" : ""}>{index === 0 ? <Icon name="award" /> : index + 1}</span>
                <strong>{row.name}</strong>
                <em>{rwf(row.paid)}</em>
              </button>
          ))}
        </section>
      </div>
      <div className="acct-bottom">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t("Payments this week")}</h2>
            <p className="acct-key"><span><i className="is-income" />{t("This period")}</span><span><i className="is-before" />{t("Previous period")}</span></p>
          </header>
          <WeekBars rows={week} />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="map" /> {t("Collection by class")}</h2>
          </header>
          <ClassCollection rows={classRows} total={classTotal} />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="bolt" /> {t("Quick actions")}</h2>
          </header>
          <div className="acct-actions">
            <button type="button" onClick={() => { window.location.hash = "#/desk/books/fees"; }}><span><Icon name="receipt" /></span> {t("School fees")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/books/expenses"; }}><span><Icon name="coins" /></span> {t("Expenses")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/books/income"; }}><span><Icon name="chart" /></span> {t("Income")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/books/status"; }}><span><Icon name="people" /></span> {t("Student status")}</button>
          </div>
        </section>
      </div>
    </>
  );
}

function schoolTotal(rows) {
  const seen = new Set();
  rows.forEach((row) => (row.ids || []).forEach((id) => seen.add(id)));
  return rows.reduce((total, row) => ({
    count: seen.size,
    expected: total.expected + row.expected,
    paid: total.paid + row.paid,
    unpaid: total.unpaid + row.unpaid,
  }), { count: seen.size, expected: 0, paid: 0, unpaid: 0 });
}

function moneyTables(accounts, classes, roster, charges, classId = "") {
  return (accounts || []).map((account) => {
    const calc = accountCalc(account, classes, roster, charges);
    const rows = classId ? calc.rows.filter((row) => String(row.classId) === String(classId)) : calc.rows;
    if (!rows.length) return null;
    return {
      caption: account.name,
      headers: [t("Class"), t("Students"), t("Amount to be paid"), t("Expected amount"), t("Amount paid"), t("Unpaid")],
      rows: [
        ...rows.map((row) => [row.className, row.count, rwf(row.each), rwf(row.expected), rwf(row.paid), rwf(row.unpaid)]),
        [t("Total Amount"), calc.school.count, "", rwf(calc.school.expected), rwf(calc.school.paid), rwf(calc.school.unpaid)],
      ],
    };
  }).filter(Boolean);
}

function sheetTable(sheet) {
  const headers = [t("No.")];
  if (sheet.showClass) headers.push(t("Class"));
  headers.push(t("Student"), ...sheet.columns.map((column) => column.name), t("Amount paid"), t("Unpaid"));
  const rows = sheet.students.map((student, index) => {
    const cells = [index + 1];
    if (sheet.showClass) cells.push(student.className || "");
    cells.push(student.name);
    student.marks.forEach((mark) => cells.push(mark.settled ? t("Paid") : t("Unpaid")));
    cells.push(rwf(student.paid), rwf(student.unpaid));
    return cells;
  });
  const foot = Array(headers.length).fill("");
  foot[0] = t("Class total");
  foot[headers.length - 2] = rwf(sheet.paid);
  foot[headers.length - 1] = rwf(sheet.unpaid);
  rows.push(foot);
  return { caption: sheet.columns.map((column) => column.name).join(" · ") || t("Class sheet"), headers, rows };
}

function AccountReports({ accounts, classes, roster, charges, classId = "", school, fileTitle }) {
  const reports = accounts.map((account) => {
    const calc = accountCalc(account, classes, roster, charges);
    const rows = classId ? calc.rows.filter((row) => String(row.classId) === String(classId)) : calc.rows;
    return { account, rows, school: calc.school };
  }).filter((item) => item.rows.length);
  if (!reports.length) return null;
  const tables = moneyTables(accounts, classes, roster, charges, classId);
  return (
    <>
      {school && fileTitle ? <ReportActions school={school} title={fileTitle} tables={tables} /> : null}
      {reports.map((item) => <MoneyReport key={item.account.id} title={item.account.name} rows={item.rows} school={item.school} activeClassId={classId} />)}
    </>
  );
}

function MoneyReport({ title, rows, school, activeClassId = "" }) {
  return (
    <>
      <p className="muted">{t("Expected amount is the amount to be paid multiplied by the number of students.")}</p>
      <table className="doc-table fee-paper">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>{t("Class")}</th>
            <th className="num">{t("Students")}</th>
            <th className="num">{t("Amount to be paid")}</th>
            <th className="num">{t("Expected amount")}</th>
            <th className="num">{t("Amount paid")}</th>
            <th className="num">{t("Unpaid")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={activeClassId && String(row.classId) === String(activeClassId) ? "is-on" : ""}>
              <td>{row.className}</td>
              <td className="num">{row.count}</td>
              <td className="num">{rwf(row.each)}</td>
              <td className="num">{rwf(row.expected)}</td>
              <td className="num">{rwf(row.paid)}</td>
              <td className="num">{rwf(row.unpaid)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{t("Total Amount")}</td>
            <td className="num">{school.count}</td>
            <td />
            <td className="num">{rwf(school.expected)}</td>
            <td className="num">{rwf(school.paid)}</td>
            <td className="num">{rwf(school.unpaid)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function ParentNote({ note, setNote, people, classId, onSend, line }) {
  const inClass = classId ? people.filter((row) => String(row.classId) === String(classId)) : people;
  const targets = note.scope === "one"
    ? inClass.filter((row) => String(row.id) === String(note.studentId))
    : note.scope === "some"
      ? inClass.filter((row) => note.picked.includes(String(row.id)))
      : classId ? inClass : [];
  const count = [...note.text].length;
  return (
    <form className="panel form-grid" onSubmit={(event) => onSend(event, targets)}>
      <h2 className="span">{t("Send a message")}</h2>
      <div className="chips span">
        {[["status", "Student status"], ["reminder", "Reminder"], ["special", "Special message"]].map(([id, label]) => (
          <button type="button" key={id} className={note.kind === id ? "on" : ""} onClick={() => setNote({ ...note, kind: id, submitted: false })}>{t(label)}</button>
        ))}
      </div>
      <div className="chips span">
        {[["one", "One parent"], ["some", "Some students"], ["class", "Whole class"]].map(([id, label]) => (
          <button type="button" key={id} className={note.scope === id ? "on" : ""} onClick={() => setNote({ ...note, scope: id, submitted: false })}>{t(label)}</button>
        ))}
      </div>
      {note.scope === "one" ? (
        <label className={`field${note.submitted && !targets.length ? " invalid" : ""}`}>{t("Student")}
          <select value={note.studentId} onChange={(event) => setNote({ ...note, studentId: event.target.value })}>
            <option value="">{t("Choose a student")}</option>
            {inClass.map((row) => <option key={row.id} value={row.id}>{row.name}{row.className ? ` · ${row.className}` : ""}</option>)}
          </select>
          {note.submitted && !targets.length ? <span className="field-error" role="alert">{t("Choose a student")}</span> : null}
        </label>
      ) : null}
      {note.scope !== "one" && !classId ? <p className="field-error span" role="alert">{t("Choose a class")}</p> : null}
      {note.scope === "some" && classId ? (
        <div className="chips span">
          {inClass.map((row) => {
            const on = note.picked.includes(String(row.id));
            return <button type="button" key={row.id} className={on ? "on" : ""} onClick={() => setNote({ ...note, picked: on ? note.picked.filter((id) => id !== String(row.id)) : [...note.picked, String(row.id)] })}>{row.name}</button>;
          })}
          {note.submitted && !targets.length ? <span className="field-error" role="alert">{t("Choose a student")}</span> : null}
        </div>
      ) : null}
      {note.kind === "special" ? (
        <label className={`field span${note.submitted && (!note.text.trim() || count > 155) ? " invalid" : ""}`}>{t("Special message")}
          <textarea rows={3} maxLength={155} value={note.text} onChange={(event) => setNote({ ...note, text: clipMessage(event.target.value) })} />
          <span className="muted">{count}/155</span>
          {note.submitted && !note.text.trim() ? <span className="field-error" role="alert">{t("Write the message first.")}</span> : null}
          {note.submitted && count > 155 ? <span className="field-error" role="alert">{t("Keep the message under 155 characters.")}</span> : null}
        </label>
      ) : (
        <p className="muted span">{t("Each parent receives that student's own amounts.")} {targets[0] ? line(note.kind, targets[0]) : ""}</p>
      )}
      <div className="actions"><button className="solid" type="submit"><Icon name="message" />{t("Send a message")}</button></div>
    </form>
  );
}

export function AccountantPortal({ token, school, userName = "", viewId = "", onItems, watch = false }) {
  const [ready, setReady] = useState(false);
  const [ledger, setLedger] = useState({ items: [], accounts: [], fees: { due: 0, paid: 0, unpaid: 0 }, materials: { due: 0, paid: 0, unpaid: 0 } });
  const [classes, setClasses] = useState([]);
  const [material, setMaterial] = useState({ classRoom: "", studentId: "", accountId: "", itemName: "", amountDue: "", amountPaid: "" });
  const [materialStudents, setMaterialStudents] = useState([]);
  const [materialSubmitted, setMaterialSubmitted] = useState(false);
  const [payAmounts, setPayAmounts] = useState({});
  const [roster, setRoster] = useState([]);
  const [itemDraft, setItemDraft] = useState({ name: "", amount: "", allClasses: true, classIds: [] });
  const [itemSubmitted, setItemSubmitted] = useState(false);
  const [materialEdit, setMaterialEdit] = useState(null);
  const [materialEditSubmitted, setMaterialEditSubmitted] = useState(false);
  const [paper, setPaper] = useState(null);
  const [feeRate, setFeeRate] = useState({ amount: "", allClasses: true, classIds: [] });
  const [feeRateReady, setFeeRateReady] = useState(false);
  const [feeRateSubmitted, setFeeRateSubmitted] = useState(false);
  const [anotherDraft, setAnotherDraft] = useState({ title: "", amount: "", occurredOn: todayStamp() });
  const [anotherSubmitted, setAnotherSubmitted] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState({ title: "", amount: "", occurredOn: todayStamp(), accountName: "" });
  const [expenseSubmitted, setExpenseSubmitted] = useState(false);
  const [filters, setFilters] = useState(() => {
    const today = todayStamp();
    return { period: "", on: today, year: today.slice(0, 4), from: "", to: "", month: Number(today.slice(5, 7)), term: "", classId: "", status: "", risk: "", min: "", max: "", below: "", items: [] };
  });
  const [note, setNote] = useState({ kind: "status", scope: "one", studentId: "", picked: [], text: "", submitted: false });
  const route = useMemo(() => (watch ? { kind: "status" } : readBooksRoute(viewId)), [viewId, watch]);

  function load() {
    return api("/accounts/ledger", { token }).then(setLedger);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api("/accounts/ledger", { token }),
      api("/academics/classes", { token }),
      api("/students", { token }),
    ]).then(([book, rooms, people]) => {
      if (cancel) return;
      setLedger(book);
      setClasses(rooms.items || []);
      setRoster(people.items || []);
      setReady(true);
    }).catch((error) => {
      if (!cancel) notify(t("Not completed"), error.message, "bad");
    });
    return () => { cancel = true; };
  }, [token]);

  useEffect(() => {
    if (!material.classRoom) { setMaterialStudents([]); return undefined; }
    let cancel = false;
    api(`/students?classRoom=${material.classRoom}`, { token })
      .then((data) => { if (!cancel) setMaterialStudents(data.items || []); })
      .catch(() => { if (!cancel) setMaterialStudents([]); });
    return () => { cancel = true; };
  }, [token, material.classRoom]);

  useEffect(() => {
    if (route.kind !== "materials" || !route.classId) return;
    setMaterial((current) => (current.classRoom === route.classId ? current : { ...current, classRoom: route.classId, studentId: "" }));
  }, [route.kind, route.classId]);

  const links = useMemo(() => accountantNav(ledger.accounts), [ledger.accounts]);
  const materialAccounts = useMemo(
    () => links.filter((item) => item.group === "material"),
    [links]
  );
  const view = useMemo(() => viewOf(ledger.items || [], roster, filters), [ledger.items, roster, filters]);
  const shownRoster = view.shownRoster;
  const shownCharges = view.shownCharges;
  const shownClasses = useMemo(
    () => (filters.classId ? classes.filter((room) => String(room._id) === String(filters.classId)) : classes),
    [classes, filters.classId]
  );
  const shownEntries = useMemo(
    () => (ledger.entries || []).filter((entry) => inPeriod(entry.occurredOn, filters)),
    [ledger.entries, filters]
  );
  const materialRows = shownCharges.filter((item) => item.accountGroup === "material");
  const catalog = useMemo(
    () => links.filter((item) => Number(item.amount) > 0),
    [links]
  );
  const payAccount = links.find((item) => String(item.id) === String(route.itemId)) || null;
  const payRows = useMemo(() => {
    if (!payAccount || !route.classId) return [];
    return classes.filter((room) => String(room._id) === String(route.classId) && fitsClass(payAccount, room._id)).flatMap((room) => {
      const sheet = buildSheet(room, shownRoster, [payAccount], shownCharges);
      if (!sheet) return [];
      return sheet.students.map((student) => ({
        key: `${room._id}:${student.id}`,
        className: room.name,
        studentId: student.id,
        studentName: student.name,
        mark: student.marks[0],
      }));
    });
  }, [payAccount, route.classId, classes, shownRoster, shownCharges]);
  const classSheets = useMemo(() => {
    return classes.map((room) => buildSheet(room, shownRoster, catalog, shownCharges)).filter(Boolean);
  }, [classes, shownRoster, shownCharges, catalog]);
  useEffect(() => {
    onItems?.({
      items: links,
      classes: classes.map((room) => ({ id: room._id, name: room.name })),
    });
  }, [links, classes, onItems]);
  const schoolFee = links.find((item) => item.group === "fee" && item.name === "School fees") || links.find((item) => item.group === "fee") || null;
  useEffect(() => {
    if (feeRateReady || !schoolFee) return;
    setFeeRate({
      amount: schoolFee.amount ? String(schoolFee.amount) : "",
      allClasses: !(schoolFee.classIds || []).length,
      classIds: (schoolFee.classIds || []).map(String),
    });
    setFeeRateReady(true);
  }, [schoolFee, feeRateReady]);
  const materialOver = material.studentId && Number(material.amountPaid) > Number(material.amountDue || 0);

  async function saveFeeRate(event) {
    event.preventDefault();
    setFeeRateSubmitted(true);
    if (!feeRate.amount || (!feeRate.allClasses && feeRate.classIds.length === 0)) return;
    const ok = await act(() => api("/accounts/items", {
      method: "POST",
      token,
      body: {
        name: "School fees",
        amount: feeRate.amount,
        allClasses: feeRate.allClasses,
        classIds: feeRate.allClasses ? [] : feeRate.classIds,
      },
    }), t("School fees"), t("The amount due is on the books."));
    if (!ok) return;
    setFeeRateSubmitted(false);
    await load();
  }

  async function saveMaterial(event) {
    event.preventDefault();
    setMaterialSubmitted(true);
    if (!material.classRoom || !material.amountDue || materialOver) return;
    if (!material.itemName.trim() && !material.accountId) return;
    const ok = await act(() => api("/accounts/register", {
      method: "POST",
      token,
      body: {
        group: "material",
        classRoom: material.classRoom,
        studentId: material.studentId,
        accountId: material.itemName.trim() ? "" : material.accountId,
        itemName: material.itemName.trim(),
        amountDue: material.amountDue,
        amountPaid: material.studentId ? material.amountPaid : "",
      },
    }), t("School materials"), t("The amount due is on the books."));
    if (!ok) return;
    setMaterial((current) => ({ ...current, itemName: "", amountDue: "", amountPaid: "" }));
    setMaterialSubmitted(false);
    await load();
  }

  async function saveItem(event) {
    event.preventDefault();
    setItemSubmitted(true);
    if (!itemDraft.name.trim() || !itemDraft.amount || (!itemDraft.allClasses && itemDraft.classIds.length === 0)) return;
    const saved = await act(() => api("/accounts/items", {
      method: "POST",
      token,
      body: {
        name: itemDraft.name.trim(),
        amount: itemDraft.amount,
        allClasses: itemDraft.allClasses,
        classIds: itemDraft.allClasses ? [] : itemDraft.classIds,
      },
    }), t("Add item"), t("The amount due is on the books."));
    if (!saved?.account?.id) return;
    setItemDraft({ name: "", amount: "", allClasses: true, classIds: [] });
    setItemSubmitted(false);
    await load();
  }

  function beginMaterialEdit(item) {
    setMaterialEditSubmitted(false);
    setMaterialEdit({
      id: String(item.id),
      name: item.name,
      amount: item.amount ? String(item.amount) : "",
      allClasses: !(item.classIds || []).length,
      classIds: (item.classIds || []).map(String),
    });
  }

  async function saveMaterialEdit(event) {
    event.preventDefault();
    setMaterialEditSubmitted(true);
    if (!materialEdit?.name.trim() || !materialEdit.amount || (!materialEdit.allClasses && materialEdit.classIds.length === 0)) return;
    const ok = await act(() => api(`/accounts/items/${materialEdit.id}`, {
      method: "PATCH",
      token,
      body: {
        name: materialEdit.name.trim(),
        amount: materialEdit.amount,
        allClasses: materialEdit.allClasses,
        classIds: materialEdit.allClasses ? [] : materialEdit.classIds,
      },
    }), t("School materials"), t("The amount due is on the books."));
    if (!ok) return;
    setMaterialEdit(null);
    setMaterialEditSubmitted(false);
    await load();
  }

  async function removeMaterial(item) {
    if (!window.confirm(t("Delete {name}? This cannot be undone.", { name: item.name }))) return;
    const ok = await act(() => api(`/accounts/items/${item.id}`, { method: "DELETE", token }), t("School materials"), t("The material item is off the books."));
    if (!ok) return;
    if (materialEdit?.id === String(item.id)) setMaterialEdit(null);
    if (String(viewId) === String(item.id)) window.location.hash = "#/desk/books";
    await load();
  }

  async function saveCash(event, kind) {
    event.preventDefault();
    const expense = kind === "expense";
    const draft = expense ? expenseDraft : anotherDraft;
    const markSubmitted = expense ? setExpenseSubmitted : setAnotherSubmitted;
    markSubmitted(true);
    if (!draft.title.trim() || Number(draft.amount) < 1 || !draft.occurredOn) return;
    if (expense && !draft.accountName) return;
    const ok = await act(() => api("/accounts/cash", {
      method: "POST",
      token,
      body: {
        kind: expense ? "expense" : "other_income",
        title: draft.title.trim(),
        amount: draft.amount,
        occurredOn: draft.occurredOn,
        accountName: expense ? draft.accountName : draft.title.trim(),
      },
    }), expense ? t("Expenses") : t("Another income"), t("The entry is on the books."));
    if (!ok) return;
    if (expense) {
      setExpenseDraft((current) => ({ ...current, title: "", amount: "" }));
      setExpenseSubmitted(false);
    } else {
      setAnotherDraft((current) => ({ ...current, title: "", amount: "" }));
      setAnotherSubmitted(false);
    }
    await load();
  }

  function parentLine(kind, row) {
    if (!row) return "";
    const className = row.className || t("School");
    const totalUnpaid = row.feeUnpaid + row.itemUnpaid;
    if (kind === "reminder") {
      return clipMessage(t("{name}, {className}. Please pay {totalUnpaid} RWF. Fees unpaid {feeUnpaid}. Items unpaid {itemUnpaid}.", {
        name: row.name,
        className,
        totalUnpaid,
        feeUnpaid: row.feeUnpaid,
        itemUnpaid: row.itemUnpaid,
      }));
    }
    return clipMessage(t("{name}, {className}. Fees due {feeDue} paid {feePaid} unpaid {feeUnpaid}. Items due {itemDue} paid {itemPaid} unpaid {itemUnpaid}.", {
      name: row.name,
      className,
      feeDue: row.feeDue,
      feePaid: row.feePaid,
      feeUnpaid: row.feeUnpaid,
      itemDue: row.itemDue,
      itemPaid: row.itemPaid,
      itemUnpaid: row.itemUnpaid,
    }));
  }

  async function sendParentNote(event, targets) {
    event.preventDefault();
    setNote((current) => ({ ...current, submitted: true }));
    if (!targets.length) {
      notify(t("Not completed"), t(note.scope === "class" ? "Choose a class" : "Choose a student"), "bad");
      return;
    }
    const text = note.text.trim();
    if (note.kind === "special" && !text) {
      notify(t("Not completed"), t("Write the message first."), "bad");
      return;
    }
    if (note.kind === "special" && [...text].length > 155) {
      notify(t("Not completed"), t("Keep the message under 155 characters."), "bad");
      return;
    }
    const sent = await act(() => api("/accounts/notify", {
      method: "POST",
      token,
      body: {
        kind: note.kind,
        studentIds: targets.map((row) => row.id),
        message: note.kind === "special" ? text : "",
        messages: note.kind === "special" ? [] : targets.map((row) => ({ studentId: row.id, text: parentLine(note.kind, row) })),
      },
    }));
    if (!sent) return;
    notify(t("Reminder sent"), sent.message);
    if (sent.skipped?.length) notify(t("Left out"), sent.skipped.map((item) => item.name).join(", "));
    if (note.kind === "special") setNote((current) => ({ ...current, text: "", submitted: false }));
  }

  async function removeCash(entry) {
    if (!window.confirm(t("Delete {name}? This cannot be undone.", { name: entry.title }))) return;
    const ok = await act(() => api(`/accounts/cash/${entry.id}`, { method: "DELETE", token }), t("Remove"), t("The entry is off the books."));
    if (!ok) return;
    await load();
  }

  async function payItem(studentId, mark) {
    const key = `${studentId}:${mark.id}`;
    const amount = payAmounts[key];
    if (!amount || Number(amount) < 1 || Number(amount) > mark.left) {
      notify(t("Not completed"), t("The amount paid cannot be above the total."), "bad");
      return;
    }
    const ok = await act(() => api("/accounts/pay", {
      method: "POST",
      token,
      body: { studentId, accountId: mark.id, amount },
    }), t("Record payment"), t("The paid amount is recorded."));
    if (!ok) return;
    setPayAmounts((current) => ({ ...current, [key]: "" }));
    await load();
  }

  async function pay(row) {
    const amount = payAmounts[row.id];
    if (!amount || Number(amount) < 1 || Number(amount) > row.unpaid) {
      notify(t("Not completed"), t("The amount paid cannot be above the total."), "bad");
      return;
    }
    const ok = await act(() => api(`/accounts/charges/${row.id}/pay`, {
      method: "POST",
      token,
      body: { amount },
    }), t("Record payment"), t("The paid amount is recorded."));
    if (!ok) return;
    setPayAmounts((current) => ({ ...current, [row.id]: "" }));
    await load();
  }

  if (!ready) {
    return (
      <div className="acct-load" role="status">
        <div className="acct-load-card">
          <span className="loader-stage">
            <span className="loader-ring" />
          </span>
          <strong>{t("Opening the books")}</strong>
          <p>{t("The school money is on its way.")}</p>
        </div>
      </div>
    );
  }

  const finder = (
    <>
      <StudentSearch roster={roster} classes={classes} onPick={(student) => {
        if (watch) {
          setFilters((current) => ({ ...current, classId: String(student.classRoom?._id || student.classRoom || ""), studentId: String(student._id) }));
          return;
        }
        window.location.hash = `#/desk/books/student/${student._id}`;
      }} />
      <LedgerFilters value={filters} classes={classes} items={links} onChange={setFilters} />
    </>
  );

  const editing = materialEdit && (!viewId || String(materialEdit.id) === String(viewId)) ? (
    <form className="panel form-grid" onSubmit={saveMaterialEdit}>
      <h2 className="span">{t("Update")} · {materialEdit.name}</h2>
      <label className={`field${materialEditSubmitted && !materialEdit.name.trim() ? " invalid" : ""}`}>{t("Material item")}
        <input value={materialEdit.name} onChange={(event) => setMaterialEdit({ ...materialEdit, name: event.target.value })} />
        {materialEditSubmitted && !materialEdit.name.trim() ? <span className="field-error" role="alert">{t("Enter the material item.")}</span> : null}
      </label>
      <label className={`field${materialEditSubmitted && !materialEdit.amount ? " invalid" : ""}`}>{t("Amount to be paid")}
        <input inputMode="numeric" value={materialEdit.amount} onChange={(event) => setMaterialEdit({ ...materialEdit, amount: digits(event.target.value) })} />
        {materialEditSubmitted && !materialEdit.amount ? <span className="field-error" role="alert">{t("Enter the amount due, in Rwandan francs.")}</span> : null}
      </label>
      <ClassChoice allClasses={materialEdit.allClasses} classIds={materialEdit.classIds} classes={classes} submitted={materialEditSubmitted} onChange={(allClasses, classIds) => setMaterialEdit({ ...materialEdit, allClasses, classIds })} />
      <div className="actions">
        <button className="solid" type="submit"><Icon name="pen" />{t("Save changes")}</button>
        <button className="ghost" type="button" onClick={() => setMaterialEdit(null)}>{t("Cancel")}</button>
      </div>
    </form>
  ) : null;

  if (route.kind === "student") {
    const person = roster.find((student) => String(student._id) === String(route.studentId));
    if (!person) {
      return (
        <div className="sections accountant-portal">{finder}
          <p className="roster-empty">{t("No one matches that search.")}</p>
        </div>
      );
    }
    const room = classes.find((item) => String(item._id) === String(person.classRoom?._id || person.classRoom));
    const accounts = links.filter((item) => room && fitsClass(item, room._id));
    const sheet = room ? buildSheet(room, [person], accounts, view.dated) : null;
    const row = sheet?.students.find((student) => String(student.id) === String(person._id));
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title={person.fullName} place={room?.name || ""} literal />
          <p className="muted">{t("A tick means the item is paid. A cross means it is still unpaid.")}</p>
          {row ? <ReportActions school={school} title={person.fullName} literal tables={[{
            caption: person.fullName,
            headers: [t("Item"), t("Amount to be paid"), t("Amount paid"), t("Unpaid")],
            rows: [
              ...row.marks.map((mark) => [`${mark.settled ? t("Paid") : t("Unpaid")} ${mark.name}`, rwf(mark.due), rwf(mark.paidAmount), rwf(mark.left)]),
              [person.fullName, rwf(row.marks.reduce((sum, mark) => sum + mark.due, 0)), rwf(row.paid), rwf(row.unpaid)],
            ],
          }]} /> : null}
          {!row ? <p className="roster-empty">{t("Choose the items first.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{person.fullName}</caption>
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th className="num">{t("Amount to be paid")}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                  <th>{t("Record payment")}</th>
                </tr>
              </thead>
              <tbody>
                {row.marks.map((mark) => {
                  const key = `${person._id}:${mark.id}`;
                  const value = payAmounts[key] || "";
                  const over = String(value) !== "" && Number(value) > mark.left;
                  return (
                    <tr key={mark.id}>
                      <td className={`doc-mark${mark.settled ? " is-paid" : " is-unpaid"}`}>{mark.settled ? "✓" : "✗"} {mark.name}</td>
                      <td className="num">{rwf(mark.due)}</td>
                      <td className="num">{rwf(mark.paidAmount)}</td>
                      <td className="num">{rwf(mark.left)}</td>
                      <td>
                        {mark.left > 0 ? (
                          <div className="fee-pay">
                            <input className={over ? "invalid" : undefined} inputMode="numeric" aria-invalid={over || undefined} aria-label={`${mark.name} ${t("Amount paid")}`} value={value} onChange={(event) => setPayAmounts((current) => ({ ...current, [key]: digits(event.target.value) }))} />
                            <button className="solid" type="button" onClick={() => payItem(person._id, mark)}>{t("Record payment")}</button>
                            {over ? <span className="field-error" role="alert">{t("The amount paid cannot be above the total.")}</span> : null}
                          </div>
                        ) : t("Paid")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{person.fullName}</td>
                  <td className="num">{rwf(row.marks.reduce((sum, mark) => sum + mark.due, 0))}</td>
                  <td className="num">{rwf(row.paid)}</td>
                  <td className="num">{rwf(row.unpaid)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (route.kind === "class") {
    const room = classes.find((item) => String(item._id) === route.classId);
    const sheet = classSheets.find((item) => String(item.id) === route.classId) || null;
    if (!room) return <section className="panel"><p className="muted">{t("That item was not found.")}</p></section>;
    if (route.mode === "home") {
      return (
        <div className="sections accountant-portal">{finder}
          <article className="doc-student">
            <PaperHead school={school} title="Class" place={room.name} />
            <p className="muted">{t("Choose a class, then record a payment or open the class sheet.")}</p>
            <div className="actions">
              <button className="solid" type="button" onClick={() => { window.location.hash = `#/desk/books/class/${room._id}/pay`; }}>{t("Record payment")}</button>
              <button className="ghost" type="button" onClick={() => { window.location.hash = `#/desk/books/class/${room._id}/report`; }}>{t("Open class sheet")}</button>
            </div>
          </article>
        </div>
      );
    }
    if (route.mode === "report") {
      return (
        <div className="sections accountant-portal">{finder}
          <article className="doc-student">
            <PaperHead school={school} title="Class sheet" place={room.name} />
            <p className="muted">{t("A tick means the item is paid. A cross means it is still unpaid.")}</p>
            <ReportActions school={school} title="Class sheet" tables={[...moneyTables([schoolFee, ...materialAccounts].filter(Boolean), shownClasses, shownRoster, shownCharges, room._id), ...(sheet ? [sheetTable(sheet)] : [])]} />
            <AccountReports accounts={[schoolFee, ...materialAccounts].filter(Boolean)} classes={shownClasses} roster={shownRoster} charges={shownCharges} classId={room._id} />
            {sheet ? <SheetTable sheet={sheet} /> : <p className="roster-empty">{t("Choose the items first.")}</p>}
          </article>
          {paper ? <SheetPaper school={school} title={paper.title} sheet={paper.sheet} literal={paper.literal} onClose={() => setPaper(null)} /> : null}
        </div>
      );
    }
    if (!route.itemId) {
      const roomItems = links.filter((item) => fitsClass(item, room._id));
      return (
        <div className="sections accountant-portal">{finder}
          <article className="doc-student">
            <PaperHead school={school} title="Record payment" place={room.name} />
            <p className="muted">{t("Choose a class, then record a payment or open the class sheet.")}</p>
            {roomItems.length === 0 ? <p className="roster-empty">{t("Choose the items first.")}</p> : roomItems.map((item) => (
              <table className="doc-table fee-paper" key={item.id}>
                <caption>{item.name}</caption>
                <thead>
                  <tr>
                    <th>{t("Class")}</th>
                    <th className="num">{t("Amount to be paid")}</th>
                    <th>{t("Open to pay")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{room.name}</td>
                    <td className="num">{rwf(item.amount)}</td>
                    <td><button className="solid" type="button" onClick={() => { window.location.hash = `#/desk/books/class/${room._id}/pay/${item.id}`; }}>{t("Open to pay")}</button></td>
                  </tr>
                </tbody>
              </table>
            ))}
          </article>
        </div>
      );
    }
  }

  if (route.kind === "fees") {
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title="School fees" place={t("Set the total school fees and the amount paid. The unpaid amount is shown for you.")} />
          <form className="form-grid" onSubmit={saveFeeRate}>
            <label className={`field${feeRateSubmitted && !feeRate.amount ? " invalid" : ""}`}>{t("Amount to be paid")}
              <input inputMode="numeric" value={feeRate.amount} onChange={(event) => setFeeRate({ ...feeRate, amount: digits(event.target.value) })} />
              {feeRateSubmitted && !feeRate.amount ? <span className="field-error" role="alert">{t("Enter the amount due, in Rwandan francs.")}</span> : null}
            </label>
            <ClassChoice allClasses={feeRate.allClasses} classIds={feeRate.classIds} classes={classes} submitted={feeRateSubmitted} onChange={(allClasses, classIds) => setFeeRate({ ...feeRate, allClasses, classIds })} />
            <div className="actions"><button className="solid" type="submit"><Icon name="check" />{t("Save")}</button></div>
          </form>
          {schoolFee ? <AccountReports accounts={[schoolFee]} classes={shownClasses} roster={shownRoster} charges={shownCharges} classId="" school={school} fileTitle="School fees" /> : <p className="roster-empty">{t("Choose the classes for this item.")}</p>}
          <p className="muted">{t("Choose a class")}</p>
          <ClassPick classes={classes} active={route.classId} onPick={(id) => { window.location.hash = schoolFee ? `#/desk/books/class/${id}/pay/${schoolFee.id}` : `#/desk/books/class/${id}/pay`; }} />
        </article>
      </div>
    );
  }

  if (route.kind === "materials") {
    return (
      <div className="sections accountant-portal">{finder}
        {editing}
        <form className="panel form-grid" onSubmit={saveItem}>
          <h2 className="span">{t("Add item")}</h2>
          <label className={`field${itemSubmitted && !itemDraft.name.trim() ? " invalid" : ""}`}>{t("Material item")}
            <input value={itemDraft.name} onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })} />
            {itemSubmitted && !itemDraft.name.trim() ? <span className="field-error" role="alert">{t("Enter the material item.")}</span> : null}
          </label>
          <label className={`field${itemSubmitted && !itemDraft.amount ? " invalid" : ""}`}>{t("Amount to be paid")}
            <input inputMode="numeric" value={itemDraft.amount} onChange={(event) => setItemDraft({ ...itemDraft, amount: digits(event.target.value) })} />
            {itemSubmitted && !itemDraft.amount ? <span className="field-error" role="alert">{t("Enter the amount due, in Rwandan francs.")}</span> : null}
          </label>
          <ClassChoice allClasses={itemDraft.allClasses} classIds={itemDraft.classIds} classes={classes} submitted={itemSubmitted} onChange={(allClasses, classIds) => setItemDraft({ ...itemDraft, allClasses, classIds })} />
          <div className="actions"><button className="solid" type="submit"><Icon name="check" />{t("Add item")}</button></div>
        </form>
        <article className="doc-student">
          {links.map((item) => (
            <table className="doc-table fee-paper" key={item.id}>
              <caption>{item.name}</caption>
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th className="num">{t("Amount to be paid")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Update")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><button className="ghost" type="button" onClick={() => { window.location.hash = `#/desk/books/${item.id}`; }}>{item.name}</button></td>
                  <td className="num">{rwf(item.amount)}</td>
                  <td>{itemScope(item, classes)}</td>
                  <td>
                    {item.group === "material" ? (
                      <div className="actions">
                        <button className="acct-act is-update" type="button" onClick={() => beginMaterialEdit(item)}><Icon name="pen" />{t("Update")}</button>
                        <button className="acct-act is-delete" type="button" onClick={() => removeMaterial(item)}><Icon name="trash" />{t("Delete")}</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </article>
        <article className="doc-student">
          <PaperHead school={school} title="School materials" place={t("Register a material item, then record what was paid. The rest stays unpaid.")} />
          <p className="muted">{t("Change the name, the amount, and the classes of a school material.")}</p>
          {materialAccounts.length ? <AccountReports accounts={materialAccounts} classes={shownClasses} roster={shownRoster} charges={shownCharges} school={school} fileTitle="School materials" /> : <p className="roster-empty">{t("No school materials yet.")}</p>}
          <p className="muted">{t("Choose a class")}</p>
          <ClassPick classes={classes} active={route.classId} onPick={(id) => { window.location.hash = `#/desk/books/materials/${id}`; }} />
        </article>
        {route.classId ? <form className="panel form-grid" onSubmit={saveMaterial}>
          <h2 className="span">{t("Register materials")}</h2>
          <label className="field">{t("School materials")}
            <select value={material.accountId} onChange={(event) => setMaterial({ ...material, accountId: event.target.value })}>
              <option value="">{t("Material item")}</option>
              {materialAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className={`field${materialSubmitted && !material.itemName.trim() && !material.accountId ? " invalid" : ""}`}>{t("Material item")}
            <input value={material.itemName} onChange={(event) => setMaterial({ ...material, itemName: event.target.value })} />
            {materialSubmitted && !material.itemName.trim() && !material.accountId ? <span className="field-error" role="alert">{t("Enter the material item.")}</span> : null}
          </label>
          <label className={`field${materialSubmitted && !material.classRoom ? " invalid" : ""}`}>{t("Class")}
            <select value={material.classRoom} onChange={(event) => { const id = event.target.value; setMaterial({ ...material, classRoom: id, studentId: "" }); window.location.hash = id ? `#/desk/books/materials/${id}` : "#/desk/books/materials"; }}>
              <option value="">{t("Choose a class")}</option>
              {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
            </select>
            {materialSubmitted && !material.classRoom ? <span className="field-error" role="alert">{t("Choose a class")}</span> : null}
          </label>
          <label className="field">{t("Student")}
            <select value={material.studentId} onChange={(event) => setMaterial({ ...material, studentId: event.target.value, amountPaid: event.target.value ? material.amountPaid : "" })}>
              <option value="">{t("Every student in this class")}</option>
              {materialStudents.map((student) => <option key={student._id} value={student._id}>{student.fullName}</option>)}
            </select>
          </label>
          <label className={`field${materialSubmitted && !material.amountDue ? " invalid" : ""}`}>{t("Amount due")}
            <input inputMode="numeric" value={material.amountDue} onChange={(event) => setMaterial({ ...material, amountDue: digits(event.target.value) })} />
            {materialSubmitted && !material.amountDue ? <span className="field-error" role="alert">{t("Enter the amount due, in Rwandan francs.")}</span> : null}
          </label>
          {material.studentId ? (
            <label className={`field${materialOver ? " invalid" : ""}`}>{t("Amount paid")}
              <input inputMode="numeric" value={material.amountPaid} onChange={(event) => setMaterial({ ...material, amountPaid: digits(event.target.value) })} />
              {materialOver ? <span className="field-error" role="alert">{t("The amount paid cannot be above the total.")}</span> : null}
            </label>
          ) : <p className="muted">{t("Payments for the whole class are recorded on each student.")}</p>}
          <div className="span"><Balance title={material.itemName.trim() || materialAccounts.find((item) => String(item.id) === String(material.accountId))?.name || t("School materials")} due={material.amountDue} paid={material.studentId ? material.amountPaid : 0} /></div>
          <div className="actions"><button className="solid" type="submit"><Icon name="check" />{t("Save")}</button></div>
        </form> : null}
        {route.classId ? <ChargeTable rows={materialRows.filter((row) => String(row.classId) === String(route.classId))} empty="No school materials yet." payAmounts={payAmounts} setPayAmounts={setPayAmounts} onPay={pay} /> : null}
      </div>
    );
  }

  if (route.kind === "status") {
    function describe(student, charges) {
      const classId = String(student.classRoom?._id || student.classRoom || "");
      const room = classes.find((item) => String(item._id) === classId);
      const fitting = links.filter((account) => fitsClass(account, classId));
      const bag = { feeDue: 0, feePaid: 0, feeUnpaid: 0, itemDue: 0, itemPaid: 0, itemUnpaid: 0 };
      fitting.forEach((account) => {
        const marks = charges.filter((row) => String(row.studentId) === String(student._id) && String(row.accountId) === String(account.id));
        const got = marks.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
        const kept = marks.reduce((sum, row) => sum + settledPaid(row), 0);
        const price = Number(account.amount) || 0;
        const due = price || marks.reduce((sum, row) => sum + (Number(row.amountDue) || 0), 0);
        const left = Math.max(0, due - kept);
        const side = account.group === "fee" ? "fee" : "item";
        bag[`${side}Due`] += due;
        bag[`${side}Paid`] += got;
        bag[`${side}Unpaid`] += left;
      });
      return { id: student._id, name: student.fullName, classId, className: room?.name || "", ...bag };
    }
    const rows = shownRoster.map((student) => describe(student, shownCharges)).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    const everyone = roster.map((student) => describe(student, view.dated)).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    const total = rows.reduce((sum, row) => ({
      feeDue: sum.feeDue + row.feeDue,
      feePaid: sum.feePaid + row.feePaid,
      feeUnpaid: sum.feeUnpaid + row.feeUnpaid,
      itemDue: sum.itemDue + row.itemDue,
      itemPaid: sum.itemPaid + row.itemPaid,
      itemUnpaid: sum.itemUnpaid + row.itemUnpaid,
    }), { feeDue: 0, feePaid: 0, feeUnpaid: 0, itemDue: 0, itemPaid: 0, itemUnpaid: 0 });
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title="Student status" />
          <div className="chips">
            <button type="button" className={filters.classId ? "" : "on"} onClick={() => setFilters((current) => ({ ...current, classId: "", studentId: "" }))}>{t("All classes")}</button>
            {classes.map((room) => {
              const id = String(room._id);
              return <button type="button" key={id} className={id === String(filters.classId) ? "on" : ""} onClick={() => setFilters((current) => ({ ...current, classId: id, studentId: "" }))}>{room.name}</button>;
            })}
          </div>
          {watch ? null : <ParentNote note={note} setNote={setNote} people={everyone} classId={filters.classId} onSend={sendParentNote} line={parentLine} />}
          {rows.length ? <ReportActions school={school} title="Student status" tables={[{
            caption: t("Student status"),
            headers: [t("No."), t("Student"), t("Class"), `${t("School fees")} ${t("Amount to be paid")}`, `${t("School fees")} ${t("Amount paid")}`, `${t("School fees")} ${t("Unpaid")}`, `${t("Other items")} ${t("Amount to be paid")}`, `${t("Other items")} ${t("Amount paid")}`, `${t("Other items")} ${t("Unpaid")}`, `${t("Total")} ${t("Amount to be paid")}`, `${t("Total")} ${t("Amount paid")}`, `${t("Total")} ${t("Unpaid")}`],
            rows: [
              ...rows.map((row, index) => [index + 1, row.name, row.className, rwf(row.feeDue), rwf(row.feePaid), rwf(row.feeUnpaid), rwf(row.itemDue), rwf(row.itemPaid), rwf(row.itemUnpaid), rwf(row.feeDue + row.itemDue), rwf(row.feePaid + row.itemPaid), rwf(row.feeUnpaid + row.itemUnpaid)]),
              [t("Total Amount"), "", "", rwf(total.feeDue), rwf(total.feePaid), rwf(total.feeUnpaid), rwf(total.itemDue), rwf(total.itemPaid), rwf(total.itemUnpaid), rwf(total.feeDue + total.itemDue), rwf(total.feePaid + total.itemPaid), rwf(total.feeUnpaid + total.itemUnpaid)],
            ],
          }]} /> : null}
          {rows.length === 0 ? <p className="roster-empty">{t("No balances in this period.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{t("Student status")}</caption>
              <thead>
                <tr>
                  <th rowSpan={2}>{t("No.")}</th>
                  <th rowSpan={2}>{t("Student")}</th>
                  <th rowSpan={2}>{t("Class")}</th>
                  <th colSpan={3}>{t("School fees")}</th>
                  <th colSpan={3}>{t("Other items")}</th>
                  <th colSpan={3}>{t("Total")}</th>
                </tr>
                <tr>
                  <th className="num">{t("Amount to be paid")}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                  <th className="num">{t("Amount to be paid")}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                  <th className="num">{t("Amount to be paid")}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>{watch ? row.name : <button className="ghost" type="button" onClick={() => { window.location.hash = `#/desk/books/student/${row.id}`; }}>{row.name}</button>}</td>
                    <td>{row.className}</td>
                    <td className="num">{rwf(row.feeDue)}</td>
                    <td className="num">{rwf(row.feePaid)}</td>
                    <td className="num">{rwf(row.feeUnpaid)}</td>
                    <td className="num">{rwf(row.itemDue)}</td>
                    <td className="num">{rwf(row.itemPaid)}</td>
                    <td className="num">{rwf(row.itemUnpaid)}</td>
                    <td className="num">{rwf(row.feeDue + row.itemDue)}</td>
                    <td className="num">{rwf(row.feePaid + row.itemPaid)}</td>
                    <td className="num">{rwf(row.feeUnpaid + row.itemUnpaid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t("Total Amount")}</td>
                  <td className="num">{rwf(total.feeDue)}</td>
                  <td className="num">{rwf(total.feePaid)}</td>
                  <td className="num">{rwf(total.feeUnpaid)}</td>
                  <td className="num">{rwf(total.itemDue)}</td>
                  <td className="num">{rwf(total.itemPaid)}</td>
                  <td className="num">{rwf(total.itemUnpaid)}</td>
                  <td className="num">{rwf(total.feeDue + total.itemDue)}</td>
                  <td className="num">{rwf(total.feePaid + total.itemPaid)}</td>
                  <td className="num">{rwf(total.feeUnpaid + total.itemUnpaid)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (route.kind === "income") {
    const rows = links.map((account) => {
      const calc = accountCalc(account, shownClasses, shownRoster, shownCharges);
      return { id: account.id, name: account.name, expected: calc.school.expected, paid: calc.school.paid, unpaid: calc.school.unpaid };
    });
    const total = rows.reduce((sum, row) => ({
      expected: sum.expected + row.expected,
      paid: sum.paid + row.paid,
      unpaid: sum.unpaid + row.unpaid,
    }), { expected: 0, paid: 0, unpaid: 0 });
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title="Income" />
          <p className="muted">{t("Income is the amount paid on school fees and school materials.")}</p>
          {rows.length ? <ReportActions school={school} title="Income" tables={[{
            caption: t("Income"),
            headers: [t("Item"), t("Expected amount"), t("Amount paid"), t("Unpaid")],
            rows: [...rows.map((row) => [row.name, rwf(row.expected), rwf(row.paid), rwf(row.unpaid)]), [t("Total Amount"), rwf(total.expected), rwf(total.paid), rwf(total.unpaid)]],
          }]} /> : null}
          {rows.length === 0 ? <p className="roster-empty">{t("Choose the items first.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{t("Income")}</caption>
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th className="num">{t("Expected amount")}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="num">{rwf(row.expected)}</td>
                    <td className="num">{rwf(row.paid)}</td>
                    <td className="num">{rwf(row.unpaid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t("Total Amount")}</td>
                  <td className="num">{rwf(total.expected)}</td>
                  <td className="num">{rwf(total.paid)}</td>
                  <td className="num">{rwf(total.unpaid)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (route.kind === "another") {
    const rows = shownEntries.filter((entry) => entry.kind === "other_income");
    const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title="Another income" />
          <form className="form-grid" onSubmit={(event) => saveCash(event, "other_income")}>
            <label className={`field${anotherSubmitted && !anotherDraft.title.trim() ? " invalid" : ""}`}>{t("Entry title")}
              <input value={anotherDraft.title} onChange={(event) => setAnotherDraft({ ...anotherDraft, title: event.target.value })} />
              {anotherSubmitted && !anotherDraft.title.trim() ? <span className="field-error" role="alert">{t("Enter a title.")}</span> : null}
            </label>
            <label className={`field${anotherSubmitted && Number(anotherDraft.amount) < 1 ? " invalid" : ""}`}>{t("Amount")}
              <input inputMode="numeric" value={anotherDraft.amount} onChange={(event) => setAnotherDraft({ ...anotherDraft, amount: digits(event.target.value) })} />
              {anotherSubmitted && Number(anotherDraft.amount) < 1 ? <span className="field-error" role="alert">{t("Enter the amount, in Rwandan francs.")}</span> : null}
            </label>
            <label className={`field${anotherSubmitted && !anotherDraft.occurredOn ? " invalid" : ""}`}>{t("Date")}
              <input type="date" value={anotherDraft.occurredOn} onChange={(event) => setAnotherDraft({ ...anotherDraft, occurredOn: event.target.value })} />
              {anotherSubmitted && !anotherDraft.occurredOn ? <span className="field-error" role="alert">{t("Enter the date.")}</span> : null}
            </label>
            <div className="actions"><button className="solid" type="submit"><Icon name="check" />{t("Save entry")}</button></div>
          </form>
          {rows.length ? <ReportActions school={school} title="Another income" tables={[{
            caption: t("Another income"),
            headers: [t("Date"), t("Entry title"), t("Amount")],
            rows: [...rows.map((row) => [dayLabel(row.occurredOn), row.title, rwf(row.amount)]), [t("Total Amount"), "", rwf(total)]],
          }]} /> : null}
          {rows.length === 0 ? <p className="roster-empty">{t("No other income yet.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{t("Another income")}</caption>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Entry title")}</th>
                  <th className="num">{t("Amount")}</th>
                  <th>{t("Delete")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{dayLabel(row.occurredOn)}</td>
                    <td>{row.title}</td>
                    <td className="num">{rwf(row.amount)}</td>
                    <td><button className="acct-act is-delete" type="button" onClick={() => removeCash(row)}><Icon name="trash" />{t("Delete")}</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{t("Total Amount")}</td>
                  <td className="num">{rwf(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (route.kind === "expenses") {
    const rows = shownEntries.filter((entry) => entry.kind === "expense");
    const accounts = ledger.expenseAccounts || [];
    const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title="Expenses" />
          <form className="form-grid" onSubmit={(event) => saveCash(event, "expense")}>
            <label className={`field${expenseSubmitted && !expenseDraft.accountName ? " invalid" : ""}`}>{t("Expenses")}
              <select value={expenseDraft.accountName} onChange={(event) => setExpenseDraft({ ...expenseDraft, accountName: event.target.value })}>
                <option value="">{t("Choose an expense account")}</option>
                {accounts.map((item) => <option key={item.id} value={item.name}>{t(item.name)}</option>)}
              </select>
              {expenseSubmitted && !expenseDraft.accountName ? <span className="field-error" role="alert">{t("Choose an expense account")}</span> : null}
            </label>
            <label className={`field${expenseSubmitted && !expenseDraft.title.trim() ? " invalid" : ""}`}>{t("Entry title")}
              <input value={expenseDraft.title} onChange={(event) => setExpenseDraft({ ...expenseDraft, title: event.target.value })} />
              {expenseSubmitted && !expenseDraft.title.trim() ? <span className="field-error" role="alert">{t("Enter a title.")}</span> : null}
            </label>
            <label className={`field${expenseSubmitted && Number(expenseDraft.amount) < 1 ? " invalid" : ""}`}>{t("Amount")}
              <input inputMode="numeric" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: digits(event.target.value) })} />
              {expenseSubmitted && Number(expenseDraft.amount) < 1 ? <span className="field-error" role="alert">{t("Enter the amount, in Rwandan francs.")}</span> : null}
            </label>
            <label className={`field${expenseSubmitted && !expenseDraft.occurredOn ? " invalid" : ""}`}>{t("Date")}
              <input type="date" value={expenseDraft.occurredOn} onChange={(event) => setExpenseDraft({ ...expenseDraft, occurredOn: event.target.value })} />
              {expenseSubmitted && !expenseDraft.occurredOn ? <span className="field-error" role="alert">{t("Enter the date.")}</span> : null}
            </label>
            <div className="actions"><button className="solid" type="submit"><Icon name="check" />{t("Save entry")}</button></div>
          </form>
          {rows.length ? <ReportActions school={school} title="Expenses" tables={[{
            caption: t("Expenses"),
            headers: [t("Date"), t("Expenses"), t("Entry title"), t("Amount")],
            rows: [...rows.map((row) => [dayLabel(row.occurredOn), t(row.accountName || row.title), row.title, rwf(row.amount)]), [t("Total Amount"), "", "", rwf(total)]],
          }]} /> : null}
          {rows.length === 0 ? <p className="roster-empty">{t("No expenses yet.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{t("Expenses")}</caption>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("Expenses")}</th>
                  <th>{t("Entry title")}</th>
                  <th className="num">{t("Amount")}</th>
                  <th>{t("Delete")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{dayLabel(row.occurredOn)}</td>
                    <td>{t(row.accountName || row.title)}</td>
                    <td>{row.title}</td>
                    <td className="num">{rwf(row.amount)}</td>
                    <td><button className="acct-act is-delete" type="button" onClick={() => removeCash(row)}><Icon name="trash" />{t("Delete")}</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t("Total Amount")}</td>
                  <td className="num">{rwf(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (route.kind === "item") {
    if (!payAccount) return <section className="panel"><p className="muted">{t("That item was not found.")}</p></section>;
    const rooms = classes.filter((room) => fitsClass(payAccount, room._id));
    return (
      <div className="sections accountant-portal">{finder}
        <article className="doc-student">
          <PaperHead school={school} title={payAccount.name} place={itemScope(payAccount, classes)} literal />
          <p className="muted">{t("Choose a class, then record a payment or open the class sheet.")}</p>
          <p className="muted">{t("Amount to be paid")} {rwf(payAccount.amount)}</p>
          {rooms.length === 0 ? <p className="roster-empty">{t("Choose the classes for this item.")}</p> : <ClassPick classes={rooms} active="" onPick={(id) => { window.location.hash = `#/desk/books/class/${id}/pay/${payAccount.id}`; }} />}
        </article>
      </div>
    );
  }

  if (route.kind === "class" && route.mode === "pay" && route.itemId) {
    if (!payAccount) return <section className="panel"><p className="muted">{t("That item was not found.")}</p></section>;
    const paySheet = {
      name: payAccount.name,
      showClass: true,
      columns: [{ id: payAccount.id, name: payAccount.name }],
      students: payRows.map((row) => ({
        id: row.studentId,
        name: row.studentName,
        className: row.className,
        marks: [row.mark],
        paid: row.mark.paidAmount,
        unpaid: row.mark.left,
      })),
      paid: payRows.reduce((sum, row) => sum + row.mark.paidAmount, 0),
      unpaid: payRows.reduce((sum, row) => sum + row.mark.left, 0),
    };
    return (
      <div className="sections accountant-portal">{finder}
        {editing}
        <article className="doc-student">
          <PaperHead school={school} title={payAccount.name} place={classes.find((room) => String(room._id) === String(route.classId))?.name || ""} literal />
          <p className="muted">{t("Amount to be paid")} {rwf(payAccount.amount)}</p>
          <p className="muted">{t("A tick means the item is paid. A cross means it is still unpaid.")}</p>
          <div className="actions no-print">
            {payRows.length ? <button className="solid" type="button" onClick={() => setPaper({ title: payAccount.name, sheet: paySheet, literal: true })}>{t("Print / Save PDF")}</button> : null}
            {payRows.length ? <ReportActions school={school} title={payAccount.name} literal tables={[sheetTable(paySheet)]} modes={["excel", "word"]} /> : null}
            {payAccount.group === "material" ? <button className="acct-act is-update" type="button" onClick={() => beginMaterialEdit(payAccount)}><Icon name="pen" />{t("Update")}</button> : null}
            {payAccount.group === "material" ? <button className="acct-act is-delete" type="button" onClick={() => removeMaterial(payAccount)}><Icon name="trash" />{t("Delete")}</button> : null}
          </div>
          {payRows.length === 0 ? <p className="roster-empty">{t("Choose the classes for this item.")}</p> : (
            <table className="doc-table fee-paper">
              <caption>{payAccount.name}</caption>
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Student")}</th>
                  <th>{payAccount.name}</th>
                  <th className="num">{t("Amount paid")}</th>
                  <th className="num">{t("Unpaid")}</th>
                  <th>{t("Record payment")}</th>
                </tr>
              </thead>
              <tbody>
                {payRows.map((row, index) => {
                  const key = `${row.studentId}:${row.mark.id}`;
                  const value = payAmounts[key] || "";
                  const over = String(value) !== "" && Number(value) > row.mark.left;
                  return (
                    <tr key={row.key}>
                      <td>{index + 1}</td>
                      <td>{row.className}</td>
                      <td>{row.studentName}</td>
                      <td className={`doc-mark${row.mark.settled ? " is-paid" : " is-unpaid"}`} aria-label={`${row.mark.name} ${row.mark.settled ? t("Paid") : t("Unpaid")}`}>{row.mark.settled ? "✓" : "✗"}</td>
                      <td className="num">{rwf(row.mark.paidAmount)}</td>
                      <td className="num">{rwf(row.mark.left)}</td>
                      <td>
                        {row.mark.left > 0 ? (
                          <div className="fee-pay">
                            <input className={over ? "invalid" : undefined} inputMode="numeric" aria-invalid={over || undefined} aria-label={`${row.mark.name} ${t("Amount paid")}`} value={value} onChange={(event) => setPayAmounts((current) => ({ ...current, [key]: digits(event.target.value) }))} />
                            <button className="solid" type="button" onClick={() => payItem(row.studentId, row.mark)}>{t("Record payment")}</button>
                            {over ? <span className="field-error" role="alert">{t("The amount paid cannot be above the total.")}</span> : null}
                          </div>
                        ) : t("Paid")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t("Class total")}</td>
                  <td className="num">{rwf(paySheet.paid)}</td>
                  <td className="num">{rwf(paySheet.unpaid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </article>
        {paper ? <SheetPaper school={school} title={paper.title} sheet={paper.sheet} literal={paper.literal} onClose={() => setPaper(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="acct-board">
      <AccountantBoard userName={userName} classes={classes} roster={roster} links={links} items={ledger.items || []} entries={ledger.entries || []} />
    </div>
  );
}

