import { useEffect, useState } from "react";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import { act, notify } from "./notice.js";
import { PrintHeading, ReportLogos, ReportPrint } from "./officialReport.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function prettyDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function showDecimal(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function termLabel(term) {
  const key = String(term || "1");
  if (key === "2") return t("Term 2");
  if (key === "3") return t("Term 3");
  if (key === "annual") return t("Annual");
  return t("Term 1");
}

function head(test) {
  return `${test.title} /${test.maxScore} · ${prettyDate(test.date)}`;
}

function CombinedTables({ ready, title, term, preview, school, year, from, to }) {
  const dates = [from, to].filter(Boolean).join(" – ");
  return ready.map((room) => (
    <section key={room.classRoom._id} className={preview ? "sections print-class" : "roster report-sheet print-class"}>
      {preview ? <PrintHeading school={school} title={t(title)} note={[room.classRoom.name, termLabel(term), year, dates].filter(Boolean).join(" · ")} /> : (
      <header className="roster-head">
        <div>
          <p className="kicker"><Icon name="award" />{t("IshuriApp")}</p>
          <h2>{room.classRoom.name}</h2>
          <p className="muted">{t(title)} · {termLabel(term)}</p>
        </div>
      </header>
      )}
      <div className="summary-wrap">
        <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
          <thead>
            <tr>
              <th>{t("No.")}</th>
              <th>{t("Student")}</th>
              {(room.ranking[0].marks || []).map((mark) => <th key={mark.id || mark.code}>{mark.code}</th>)}
              <th>{t("Average")} /100</th>
              <th>{t("Class position")}</th>
            </tr>
          </thead>
          <tbody>
            {room.ranking.map((row, index) => (
              <tr key={row.id}>
                <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                <td data-label={t("Student")} className="roster-name">{row.name}</td>
                {(row.marks || []).map((mark) => (
                  <td key={mark.id || mark.code} data-label={mark.code} className="num">{showDecimal(mark.final)}/{mark.standard}</td>
                ))}
                <td data-label={`${t("Average")} /100`} className="num">{showDecimal(row.average)}/100</td>
                <td data-label={t("Class position")} className="num">{row.position}/{room.ranking.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  ));
}

function classLists(listed) {
  const groups = new Map();
  listed.forEach((item) => {
    const name = item.classRoom?.name || t("Class");
    const id = String(item.classRoom?._id || name);
    if (!groups.has(id)) groups.set(id, { id, name, rows: [] });
    groups.get(id).rows.push(item);
  });
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function AssessmentTable({ listed, preview }) {
  return (
    <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
      <thead>
        <tr>
          <th>{t("No.")}</th>
          <th>{t("Teacher")}</th>
          <th>{t("Class")}</th>
          <th>{t("Subject")}</th>
          <th>{t("Assessment")}</th>
          <th>{t("Date")}</th>
          <th>{t("Term")}</th>
          <th>{t("Over")}</th>
        </tr>
      </thead>
      <tbody>
        {listed.map((item, index) => (
          <tr key={item._id}>
            <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
            <td data-label={t("Teacher")}>{item.teacher?.fullName || "—"}</td>
            <td data-label={t("Class")}>{item.classRoom?.name || t("Class")}</td>
            <td data-label={t("Subject")}>{item.subject?.name || t("Subject")}</td>
            <td data-label={t("Assessment")} className="roster-name">{item.title}</td>
            <td data-label={t("Date")}>{prettyDate(item.date)}</td>
            <td data-label={t("Term")}>{termLabel(item.term)}</td>
            <td data-label={t("Over")} className="num">{item.maxScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthlySheets({ ready, school, monthName, year, preview }) {
  return ready.map((room) => (
    <section key={room.classRoom._id} className={preview ? "sections print-class" : "roster report-sheet print-class"}>
      {preview ? <PrintHeading school={school} title={t("Monthly marks sheets")} note={[room.classRoom.name, monthName, year].filter(Boolean).join(" · ")} /> : (
      <>
      <ReportLogos school={school} />
      <header className="roster-head">
        <div>
          <p className="kicker"><Icon name="award" />{t("IshuriApp")}</p>
          <h2>{room.classRoom.name}</h2>
          <p className="muted">{school?.name || t("School")} · {monthName} {year}</p>
          {room.notifiedAt ? <p className="muted">{t("Parents were notified on {date}.", { date: prettyDate(room.notifiedAt) })}</p> : <p className="muted">{t("Parents have not received this month's summary.")}</p>}
        </div>
      </header>
      </>
      )}
      {room.ranking?.length ? (
        <div className="summary-wrap">
          <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
            <thead>
              <tr>
                <th>{t("No.")}</th>
                <th>{t("Student")}</th>
                {(room.ranking[0].marks || []).map((mark) => <th key={mark.id || mark.code}>{mark.code}</th>)}
                <th>{t("Average")} /100</th>
                <th>{t("Class position")}</th>
              </tr>
            </thead>
            <tbody>
              {room.ranking.map((row, index) => (
                <tr key={row.id}>
                  <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                  <td data-label={t("Student")} className="roster-name">{row.name}</td>
                  {(row.marks || []).map((mark) => (
                    <td key={mark.id || mark.code} data-label={mark.code} className="num">{showDecimal(mark.final)}/{mark.standard}</td>
                  ))}
                  <td data-label={`${t("Average")} /100`} className="num">{showDecimal(row.average)}/100</td>
                  <td data-label={t("Class position")} className="num">{row.position}/{room.ranking.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {room.subjects.map((group) => (
        <div key={group.subject._id || group.subject.name} className="sections">
          <h3>{group.subject.name}{group.teacher ? ` · ${group.teacher}` : ""}{group.standard ? ` · /${group.standard}` : ""}</h3>
          <p className="muted">{t("A blank mark counts as 0.")}</p>
          <div className="summary-wrap">
            <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
              <thead>
                <tr>
                  <th>{t("No.")}</th>
                  <th>{t("Student")}</th>
                  {group.tests.map((test) => <th key={test._id}>{head(test)}</th>)}
                  {group.standard ? <th>{t("Final /{total}", { total: group.standard })}</th> : null}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, index) => (
                  <tr key={row.id}>
                    <td data-label={t("No.")}><span className="roster-no">{index + 1}</span></td>
                    <td data-label={t("Student")} className="roster-name">{row.name}</td>
                    {row.cells.map((cell, cellIndex) => (
                      <td key={group.tests[cellIndex]._id} data-label={head(group.tests[cellIndex])} className="num">{cell.entered ? cell.raw : 0}</td>
                    ))}
                    {group.standard ? <td data-label={t("Final /{total}", { total: group.standard })} className="num">{showDecimal(row.final)}/{group.standard}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  ));
}

function CombinedReport({ title, note, term, onTerm, classes, empty, showTerm, school, year, from, to }) {
  const [open, setOpen] = useState(false);
  const ready = (classes || []).filter((room) => room.subjects?.length && room.ranking?.length);
  return (
    <section className="sections">
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="award" /></span>
          <div>
            <p className="kicker">{t("Director of Studies")}</p>
            <h2>{t(title)}</h2>
          </div>
        </header>
        <p className="muted">{t(note)}</p>
        {showTerm ? (
          <label className="field">{t("Term")}
            <select value={term} onChange={(event) => onTerm(event.target.value)}>
              <option value="1">{t("Term 1")}</option>
              <option value="2">{t("Term 2")}</option>
              <option value="3">{t("Term 3")}</option>
              <option value="annual">{t("Annual")}</option>
            </select>
          </label>
        ) : null}
        <div className="actions">
          <button className="solid" type="button" disabled={!ready.length} onClick={() => setOpen(true)}>{t("Print / Save PDF")}</button>
        </div>
      </section>
      {ready.length === 0 ? <p className="roster-empty">{t(empty)}</p> : <CombinedTables ready={ready} title={title} term={term} />}
      {open ? (
        <ReportPrint title={t(title)} school={school} onClose={() => setOpen(false)} bare>
          <CombinedTables ready={ready} title={title} term={term} preview school={school} year={year} from={from} to={to} />
        </ReportPrint>
      ) : null}
    </section>
  );
}

export function Studies({ token, school, children, view = "home" }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [assessments, setAssessments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [reportTerm, setReportTerm] = useState("1");
  const [reportYear, setReportYear] = useState(String(now.getFullYear()));
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [midterm, setMidterm] = useState([]);
  const [termReport, setTermReport] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);

  async function load() {
    const sheet = await api("/marks/assessments", { token });
    setAssessments(sheet.items || []);
    const report = await api(`/marks/monthly?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`, { token });
    setClasses(report.classes || []);
  }

  useEffect(() => {
    if (view !== "home") return undefined;
    if (!/^\d{4}$/.test(year)) return undefined;
    load().catch((err) => notify(t("Not completed"), err.message, "bad"));
    return undefined;
  }, [token, year, month, view, reportFrom, reportTo]);

  useEffect(() => {
    if (view !== "home" && view !== "midterm" && view !== "term") return undefined;
    let cancelled = false;
    const jobs = [];
    const range = `&year=${encodeURIComponent(reportYear)}&from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`;
    if (view === "home" || view === "midterm") jobs.push(api(`/marks/combined?scope=midterm&term=${encodeURIComponent(reportTerm)}${range}`, { token }));
    if (view === "home" || view === "term") jobs.push(api(`/marks/combined?scope=term&term=${encodeURIComponent(reportTerm)}${range}`, { token }));
    Promise.all(jobs).then((pages) => {
      if (cancelled) return;
      let cursor = 0;
      if (view === "home" || view === "midterm") {
        setMidterm(pages[cursor].classes || []);
        cursor += 1;
      }
      if (view === "home" || view === "term") setTermReport(pages[cursor].classes || []);
    }).catch((err) => { if (!cancelled) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancelled = true; };
  }, [token, reportTerm, reportYear, reportFrom, reportTo, view]);

  const listed = assessments.filter((item) => {
    if (item.type === "exam") return false;
    const day = String(item.date || "").slice(0, 10);
    const recorded = String(item.academicYear || day.slice(0, 4));
    if (/^\d{4}$/.test(reportYear) && recorded !== reportYear) return false;
    if (reportFrom && (!day || day < reportFrom)) return false;
    if (reportTo && (!day || day > reportTo)) return false;
    return true;
  }).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title).localeCompare(String(b.title)));
  const ready = classes.filter((room) => room.subjects.length);
  const pending = ready.filter((room) => !room.notifiedAt);
  const monthName = t(MONTHS[Number(month) - 1] || "January");
  const showMidterm = view === "home" || view === "midterm";
  const showTerm = view === "home" || view === "term";
  const showMonthly = view === "home";
  const showList = view === "home";

  function sendMonth() {
    if (!pending.length) return notify(t("Monthly summary"), t("Parents were already notified for this month."), "bad");
    if (!window.confirm(t("Send one summary to each parent for this month?"))) return;
    act(async () => {
      const sent = await api("/marks/monthly-notify", { method: "POST", token, body: { year: Number(year), month: Number(month) } });
      await load();
      notify(t("Monthly summary"), sent.message || t("The monthly summary was sent."));
    }, "");
  }

  return (
    <div className="sections">
      <section className="panel form-grid no-print">
        <label className="field">{t("Year")}
          <input type="number" min="2020" value={reportYear} onChange={(event) => setReportYear(event.target.value)} />
        </label>
        <label className="field">{t("From")}
          <input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} />
        </label>
        <label className="field">{t("To")}
          <input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} />
        </label>
      </section>
      {showList ? (
        <>
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="award" /></span>
          <div>
            <p className="kicker">{t("Director of Studies")}</p>
            <h2>{t("All teachers' assessments")}</h2>
          </div>
        </header>
        <p className="muted">{t("Every assessment entered by the teachers, with the class, subject, date and term.")}</p>
        <div className="actions">
          <button className="solid" type="button" disabled={!listed.length} onClick={() => setListOpen(true)}>{t("Print / Save PDF")}</button>
        </div>
      </section>
      {listed.length === 0 ? <p className="roster-empty">{t("No assessments yet.")}</p> : (
        <div className="summary-wrap">
          <AssessmentTable listed={listed} />
        </div>
      )}
      {listOpen ? (
        <ReportPrint title={t("All teachers' assessments")} school={school} onClose={() => setListOpen(false)} bare>
          {classLists(listed).map((sheet) => (
            <section className="print-class" key={sheet.id}>
              <PrintHeading school={school} title={t("All teachers' assessments")} note={sheet.name} />
              <AssessmentTable listed={sheet.rows} preview />
            </section>
          ))}
        </ReportPrint>
      ) : null}
        </>
      ) : null}
      {showMidterm ? (
        <CombinedReport
          title="Mid Term Tests Report"
          note="Each subject shows its final mark for the assessments recorded in this term."
          term={reportTerm}
          onTerm={setReportTerm}
          classes={midterm}
          empty="No assessments in this term."
          showTerm
          school={school}
          year={reportYear}
          from={reportFrom}
          to={reportTo}
        />
      ) : null}
      {showTerm ? (
        <CombinedReport
          title="Term Assessment Report"
          note="Each subject shows its final mark for every assessment in the term."
          term={reportTerm}
          onTerm={setReportTerm}
          classes={termReport}
          empty="No assessments in this term."
          showTerm={!showMidterm}
          school={school}
          year={reportYear}
          from={reportFrom}
          to={reportTo}
        />
      ) : null}
      {showList ? children : null}
      {showMonthly ? (
      <>
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="calendar" /></span>
          <div>
            <p className="kicker">{monthName} {year}</p>
            <h2>{t("Monthly marks sheets")}</h2>
          </div>
        </header>
        <p className="muted">{t("One sheet for every class. Parents receive one summary for the month.")}</p>
        <p className="muted">{t("Mwiriwe babyeyi ba {school}. {name} ({class}) yabaye uwa {position}/{size}, agira {average}/100. Mukomeze gufatanya natwe kurera neza!")}</p>
        <div className="form-grid">
          <label className="field">{t("Month")}
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {MONTHS.map((name, index) => <option key={name} value={String(index + 1)}>{t(name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Academic year")}
            <input value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button className="solid" type="button" disabled={!ready.length} onClick={() => setMonthOpen(true)}>{t("Print / Save PDF")}</button>
          <button className="solid" type="button" onClick={sendMonth} disabled={!pending.length}><Icon name="message" />{t("Send the monthly summary")}</button>
        </div>
      </section>
      {ready.length === 0 ? <p className="roster-empty">{t("No assessments in this month.")}</p> : <MonthlySheets ready={ready} school={school} monthName={monthName} year={year} />}
      {monthOpen ? (
        <ReportPrint title={t("Monthly marks sheets")} school={school} onClose={() => setMonthOpen(false)} bare>
          <MonthlySheets ready={ready} school={school} monthName={monthName} year={year} preview />
        </ReportPrint>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
