import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { notify } from "./notice.js";
import { Icon } from "./icons.jsx";
import { PrintHeading } from "./officialReport.jsx";

function dayOf(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function prettyDay(value) {
  const key = dayOf(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

function statusLabel(status) {
  if (status === "absent") return t("Did not attend");
  if (status === "missing") return t("Not recorded");
  return t("Attended");
}

function kindLabel(kind) {
  return kind === "exam" ? t("Examination") : t("Assessments");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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

function listNo(index) {
  return String(index + 1).padStart(2, "0");
}

function papersOf(rows) {
  const rank = { absent: 0, missing: 1, attended: 2 };
  const groups = [];
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.id || "").split(":")[0] || row.title;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        title: row.title,
        kind: row.kind,
        className: row.className,
        subject: row.subject,
        date: row.date,
        teacher: row.teacher,
        rows: [],
      };
      map.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  });
  groups.forEach((group) => {
    group.rows.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || String(a.student).localeCompare(String(b.student)));
  });
  return groups;
}

function FollowPreview({ school, rows, tallies, onClose }) {
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
    <div className="doc-preview is-landscape" role="dialog" aria-modal="true" aria-label={t("Follow-up")}>
      <div className="doc-toolbar no-print">
        <strong>{t("Follow-up")}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <FollowSheets rows={rows} preview school={school} tallies={tallies} />
        </article>
      </div>
    </div>,
    document.body
  );
}

function papersByClass(papers) {
  const groups = [];
  const map = new Map();
  papers.forEach((paper) => {
    const key = paper.className || "";
    let group = map.get(key);
    if (!group) {
      group = { key, papers: [] };
      map.set(key, group);
      groups.push(group);
    }
    group.papers.push(paper);
  });
  return groups;
}

function tallyOf(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.id || "").split(":")[0] || row.title;
    const item = map.get(key) || { absent: 0, missing: 0 };
    if (row.status === "absent" || row.status === "missing") item[row.status] += 1;
    map.set(key, item);
  });
  return map;
}

function missCount(rows, kind) {
  return rows.filter((row) => row.kind === kind && (row.status === "absent" || row.status === "missing")).length;
}

function classNote(papers, tallies) {
  const total = (kind) => papers.filter((paper) => paper.kind === kind).reduce((sum, paper) => {
    const tally = tallies?.get(paper.key) || {};
    return sum + (tally.absent || 0) + (tally.missing || 0);
  }, 0);
  const name = papers[0]?.className || t("Class");
  return `${name} · ${t("Missing assessments")} ${total("assessment")} · ${t("Missing examinations")} ${total("exam")}`;
}

function PaperBlock({ paper, preview, tally }) {
  const absent = tally?.absent || 0;
  const missing = tally?.missing || 0;
  return (
    <section className={preview ? undefined : "panel sections"}>
      <header className="roster-head">
        <div>
          <p className="kicker">{kindLabel(paper.kind)}</p>
          <h2>{paper.title}</h2>
          <p className="muted">{[paper.className, paper.subject, prettyDay(paper.date), paper.teacher].filter(Boolean).join(" · ")}</p>
          <p className="follow-nums"><span><b>{absent}</b> {t("Did not attend")}</span><span><b>{missing}</b> {t("Not recorded")}</span></p>
        </div>
        <span className="roster-count">{absent + missing}</span>
      </header>
      <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Student")}</th>
            <th>{t("Attended")}</th>
            <th>{t("Reason")}</th>
          </tr>
        </thead>
        <tbody>
          {paper.rows.map((row, index) => (
            <tr key={row.id} className={row.status === "absent" ? "follow-miss" : undefined}>
              <td data-label={t("No.")}><span className="roster-no">{listNo(index)}</span></td>
              <td data-label={t("Student")} className="roster-name">{row.student}</td>
              <td data-label={t("Attended")}>{statusLabel(row.status)}</td>
              <td data-label={t("Reason")} className="follow-reason">{row.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FollowSheets({ rows, preview, school, tallies }) {
  const papers = papersOf(rows);
  if (!preview) {
    return (
      <div className="sections">
        {papers.map((paper) => <PaperBlock paper={paper} tally={tallies?.get(paper.key)} key={paper.key} />)}
      </div>
    );
  }
  return (
    <div className="sections">
      {papersByClass(papers).map((group) => (
        <section className="print-class" key={group.key || "class"}>
          <PrintHeading school={school} title={t("Follow-up")} note={classNote(group.papers, tallies)} />
          {group.papers.map((paper) => <PaperBlock paper={paper} preview tally={tallies?.get(paper.key)} key={paper.key} />)}
        </section>
      ))}
    </div>
  );
}

export function FollowUp({ token, school }) {
  const today = new Date();
  const [year, setYear] = useState(String(today.getFullYear()));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [classId, setClassId] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [classes, setClasses] = useState([]);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api("/academics/classes", { token })
      .then((page) => setClasses(page.items || []))
      .catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [token]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (/^\d{4}$/.test(year)) query.set("year", year);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (classId) query.set("classRoom", classId);
    let cancelled = false;
    api(`/marks/follow?${query.toString()}`, { token })
      .then((page) => { if (!cancelled) setRows(page.rows || []); })
      .catch((err) => { if (!cancelled) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancelled = true; };
  }, [token, year, from, to, classId]);

  const scoped = useMemo(() => rows.filter((row) => !kind || row.kind === kind), [rows, kind]);
  const visible = useMemo(() => scoped.filter((row) => !status || row.status === status), [scoped, status]);
  const tallies = useMemo(() => tallyOf(rows), [rows]);
  const attended = scoped.filter((row) => row.status === "attended").length;
  const absent = scoped.filter((row) => row.status === "absent").length;
  const missing = scoped.filter((row) => row.status === "missing").length;
  const missingAssessments = missCount(rows, "assessment");
  const missingExams = missCount(rows, "exam");

  function paperBlocks() {
    const header = [t("No."), t("Student"), t("Attended"), t("Reason")];
    return papersOf(visible).map((paper) => ({
      title: [paper.title, kindLabel(paper.kind), paper.className, paper.subject, prettyDay(paper.date), paper.teacher, `${t("Did not attend")} ${tallies.get(paper.key)?.absent || 0}`, `${t("Not recorded")} ${tallies.get(paper.key)?.missing || 0}`].filter(Boolean).join(" · "),
      header,
      lines: paper.rows.map((row, index) => [listNo(index), row.student, statusLabel(row.status), row.reason]),
    }));
  }

  function saveExcel() {
    const blocks = paperBlocks();
    const lines = [`\uFEFF${csvCell(t("Follow-up"))}`];
    blocks.forEach((block) => {
      lines.push(csvCell(block.title));
      lines.push(block.header.map(csvCell).join(","));
      block.lines.forEach((line) => lines.push(line.map(csvCell).join(",")));
      lines.push("");
    });
    downloadFile(`ishuriapp-follow-up-${dayOf(new Date())}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
  }

  function saveWord() {
    const blocks = paperBlocks();
    const body = blocks.map((block) => {
      const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>${block.lines.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
      return `<h2>${escapeHtml(block.title)}</h2>${table}`;
    }).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(t("Follow-up"))}</title></head><body><h1>${escapeHtml(school?.name || "IshuriApp")}</h1><p>${escapeHtml(t("Students who attended and students who did not, with the reason."))}</p>${body}</body></html>`;
    downloadFile(`ishuriapp-follow-up-${dayOf(new Date())}.doc`, "application/msword", html);
  }

  return (
    <div className="sections">
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="check" /></span>
          <div>
            <p className="kicker">{t("Follow-up")}</p>
            <h2>{t("Follow-up")}</h2>
          </div>
        </header>
        <p className="muted">{t("Students who attended and students who did not, with the reason.")}</p>
        <p className="muted">{t("A student who did not attend is saved as 0. Write the reason.")}</p>
        <div className="form-grid">
          <label className="field">{t("Year")}
            <input type="number" min="2020" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label className="field">{t("From")}
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">{t("To")}
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="field">{t("Class")}
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">{t("All classes")}</option>
              {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="follow-sums">
          <article>
            <span>{t("Missing assessments")}</span>
            <strong>{missingAssessments}</strong>
            <em>{t("Did not attend")} · {rows.filter((row) => row.kind === "assessment" && row.status === "absent").length} · {t("Not recorded")} · {rows.filter((row) => row.kind === "assessment" && row.status === "missing").length}</em>
          </article>
          <article>
            <span>{t("Missing examinations")}</span>
            <strong>{missingExams}</strong>
            <em>{t("Did not attend")} · {rows.filter((row) => row.kind === "exam" && row.status === "absent").length} · {t("Not recorded")} · {rows.filter((row) => row.kind === "exam" && row.status === "missing").length}</em>
          </article>
        </div>
        <div className="chips">
          <button type="button" className={kind === "" ? "on" : ""} onClick={() => setKind("")}>{t("All")}</button>
          <button type="button" className={kind === "assessment" ? "on" : ""} onClick={() => setKind("assessment")}>{t("Assessments")}</button>
          <button type="button" className={kind === "exam" ? "on" : ""} onClick={() => setKind("exam")}>{t("Examination")}</button>
        </div>
        <div className="chips">
          <button type="button" className={status === "" ? "on" : ""} onClick={() => setStatus("")}>{t("All")} · {scoped.length}</button>
          <button type="button" className={status === "attended" ? "on" : ""} onClick={() => setStatus("attended")}>{t("Attended")} · {attended}</button>
          <button type="button" className={status === "absent" ? "on" : ""} onClick={() => setStatus("absent")}>{t("Did not attend")} · {absent}</button>
          <button type="button" className={status === "missing" ? "on" : ""} onClick={() => setStatus("missing")}>{t("Not recorded")} · {missing}</button>
        </div>
        <div className="actions">
          <button className="solid" type="button" onClick={() => setOpen(true)} disabled={!visible.length}>{t("Print / Save PDF")}</button>
          <button className="ghost" type="button" onClick={saveExcel} disabled={!visible.length}>{t("Excel")}</button>
          <button className="ghost" type="button" onClick={saveWord} disabled={!visible.length}>{t("Word")}</button>
        </div>
      </section>
      {visible.length === 0 ? <p className="roster-empty">{rows.length ? t("No students in this follow-up.") : t("No assessments yet.")}</p> : <FollowSheets rows={visible} tallies={tallies} />}
      {open ? <FollowPreview school={school} rows={visible} tallies={tallies} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
