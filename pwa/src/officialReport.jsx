import { t } from "./i18n.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const APP_LOGO = "/logo-512.png";

export function termLabel(term) {
  const key = String(term || "").trim().toLowerCase();
  if (key === "1" || key === "term 1") return t("Term 1");
  if (key === "2" || key === "term 2") return t("Term 2");
  if (key === "3" || key === "term 3") return t("Term 3");
  if (key === "annual" || key === "year") return t("Annual");
  return term ? t(term) : t("Term");
}

function reportDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kigali" });
}

function percentText(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  return Number.isInteger(number) ? `${number}%` : `${number.toFixed(1)}%`;
}

function SchoolMark({ school }) {
  const [failed, setFailed] = useState(false);
  if (!school?.logoUrl || failed) return <em>{t("School logo")}</em>;
  return <img src={school.logoUrl} alt={`${school.name || "School"} logo`} onError={() => setFailed(true)} />;
}

export function ReportLogos({ school }) {
  return (
    <div className="logo-pair">
      <div className="logo-slot">
        <img src={APP_LOGO} alt={t("IshuriApp")} />
        <span>{t("IshuriApp")}</span>
      </div>
      <div className="logo-slot">
        <SchoolMark school={school} />
        <span>{school?.name || t("School")}</span>
      </div>
    </div>
  );
}

function DocHeader({ school, kicker, title }) {
  const contact = [school?.phone, school?.email].filter(Boolean).join(" · ");
  return (
    <header className="doc-head">
      <div className="logo-slot">
        <img src={APP_LOGO} alt={t("IshuriApp")} />
        <span>{t("IshuriApp")}</span>
      </div>
      <div className="doc-identity">
        <p className="doc-kicker">{t(kicker)}</p>
        <h1>{t(title)}</h1>
        <p className="doc-school">{school?.name}</p>
        {school?.motto ? <p className="doc-motto">{school.motto}</p> : null}
        {contact ? <p className="doc-place">{contact}</p> : null}
      </div>
      <div className="logo-slot">
        <SchoolMark school={school} />
        <span>{school?.name || t("School")}</span>
      </div>
    </header>
  );
}

function Signatures({ labels }) {
  return (
    <footer className="doc-sign">
      {labels.map((label) => (
        <div key={label}>
          <span>{t(label)}</span>
          <i />
          <em>{t("Name and signature")}</em>
        </div>
      ))}
    </footer>
  );
}

function AcademicSheet({ report, item }) {
  const comments = item.rows.filter((row) => row.comment);
  return (
    <article className="doc-student">
      <DocHeader school={report.school} kicker="Official academic record" title={t("Student Academic Performance Report")} />
      <div className="doc-who">
        <strong>{item.student.fullName}</strong>
        <span>{[item.student.studentCode, report.classRoom?.name, report.academicYear, termLabel(report.term)].filter(Boolean).join(" · ")}</span>
      </div>
      <section className="doc-cards">
        <article><span>{t("Total marks")}</span><strong>{item.totalMax ? `${item.totalScore} / ${item.totalMax}` : "—"}</strong></article>
        <article><span>{t("Average")}</span><strong>{percentText(item.averagePercent)}</strong></article>
        <article><span>{t("Grade")}</span><strong>{item.grade?.letter || "—"}</strong></article>
        <article><span>{t("Class position")}</span><strong>{item.position ? `${item.position} of ${item.classSize}` : "—"}</strong></article>
      </section>
      <table className="doc-table">
        <thead>
          <tr>
            <th>{t("No.")}</th>
            <th>{t("Subject")}</th>
            <th>{t("Assessment")}</th>
            <th>{t("Date")}</th>
            <th className="num">{t("Score")}</th>
            <th className="num">{t("Maximum")}</th>
            <th className="num">{t("Grade")}</th>
          </tr>
        </thead>
        <tbody>
          {item.rows.length === 0 ? (
            <tr><td colSpan={7}>{t("No marks were recorded for this term.")}</td></tr>
          ) : item.rows.map((row, index) => (
            <tr key={row.id}>
              <td data-label="No.">{index + 1}</td>
              <td data-label="Subject">{row.subject}</td>
              <td data-label="Assessment">{row.title}</td>
              <td data-label="Date">{reportDate(row.date)}</td>
              <td data-label="Score" className="num">{row.score}</td>
              <td data-label="Maximum" className="num">{row.maxScore}</td>
              <td data-label="Grade" className="num">{row.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="doc-notes">
        <h2>{t("Teacher comments")}</h2>
        {comments.length === 0 ? <p>{t("No written comment on this record.")}</p> : (
          <ul>
            {comments.map((row) => <li key={row.id}><strong>{row.subject} · {row.title}.</strong> {row.comment}</li>)}
          </ul>
        )}
      </section>
      <Signatures labels={["Class teacher", "School administration", "Parent / guardian"]} />
    </article>
  );
}

function DisciplineSheet({ report, item }) {
  return (
    <article className="doc-student">
      <DocHeader school={report.school} kicker="Official conduct record" title={t("Student Discipline Report")} />
      <div className="doc-who">
        <strong>{item.student.fullName}</strong>
        <span>{[item.student.studentCode, item.className, report.academicYear, termLabel(report.term)].filter(Boolean).join(" · ")}</span>
      </div>
      <section className="doc-cards">
        <article><span>{t("Starting points")}</span><strong>{item.starting}</strong></article>
        <article><span>{t("Deducted")}</span><strong>{item.deducted}</strong></article>
        <article><span>{t("Remaining")}</span><strong>{item.remaining} / {item.starting}</strong></article>
        <article><span>{t("Incidents")}</span><strong>{item.incidents.length}</strong></article>
      </section>
      {item.incidents.length === 0 ? <p className="doc-empty">{t("No discipline cases were recorded in this academic year.")}</p> : (
        <table className="doc-table">
          <thead>
            <tr>
              <th>{t("No.")}</th>
              <th>{t("Date")}</th>
              <th>{t("Incident")}</th>
              <th className="num">{t("Deducted")}</th>
              <th className="num">{t("Remaining")}</th>
              <th>{t("Staff")}</th>
            </tr>
          </thead>
          <tbody>
            {item.incidents.map((incident, index) => (
              <tr key={incident.id}>
                <td data-label="No.">{index + 1}</td>
                <td data-label="Date">{reportDate(incident.date)}</td>
                <td data-label="Incident">
                  <strong>{incident.title}</strong>
                  {incident.description ? <p>{incident.description}</p> : null}
                  {incident.actionTaken ? <p className="doc-action">Action: {incident.actionTaken}</p> : null}
                </td>
                <td data-label="Deducted" className="num">{incident.marksLost}</td>
                <td data-label="Remaining" className="num">{incident.scoreAfter == null ? "—" : incident.scoreAfter}</td>
                <td data-label="Staff">{incident.staff || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section className="doc-notes">
        <h2>{t("School remarks")}</h2>
        <p>{item.remarks || "Remarks may be written here before the report is signed."}</p>
      </section>
      <Signatures labels={["Discipline officer", "School administration", "Parent / guardian"]} />
    </article>
  );
}

export function OfficialPreview({ report, orientation, onOrientation, onClose }) {
  useEffect(() => {
    document.body.classList.add("doc-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("doc-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pages = report?.items || [];
  return createPortal(
    <div className={`doc-preview ${orientation === "landscape" ? "is-landscape" : "is-portrait"}`} role="dialog" aria-modal="true" aria-label={t("Report preview")}>
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 14mm 12mm 18mm; @bottom-left { content: "${t("IshuriApp · Official report")}"; font-size: 9pt; color: #5c738a; } @bottom-right { content: "${t("Page")} " counter(page) " ${t("of")} " counter(pages); font-size: 9pt; color: #0D47A1; } } }`}</style>
      <div className="doc-toolbar no-print">
        <strong>{report?.kind === "discipline" ? t("Student Discipline Report") : t("Student Academic Performance Report")}</strong>
        <div className="chips">
          <button type="button" className={orientation === "portrait" ? "on" : ""} onClick={() => onOrientation("portrait")}>{t("Portrait")}</button>
          <button type="button" className={orientation === "landscape" ? "on" : ""} onClick={() => onOrientation("landscape")}>{t("Landscape")}</button>
        </div>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        {pages.length === 0 ? (
          <article className="doc-student">
            <DocHeader school={report?.school} kicker="Official report" title={report?.kind === "discipline" ? "Student Discipline Report" : "Student Academic Performance Report"} />
            <p className="doc-empty">{t("No records match this class, term and academic year.")}</p>
          </article>
        ) : pages.map((item) => (
          report.kind === "discipline"
            ? <DisciplineSheet key={item.student._id} report={report} item={item} />
            : <AcademicSheet key={item.student._id} report={report} item={item} />
        ))}
      </div>
    </div>,
    document.body
  );
}
