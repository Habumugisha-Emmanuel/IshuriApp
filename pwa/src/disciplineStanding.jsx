import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { notify } from "./notice.js";
import { Icon } from "./icons.jsx";
import { PrintHeading, ReportPrint } from "./officialReport.jsx";

const TERM_KEYS = ["1", "2", "3"];

function showMark(cell) {
  if (!cell || cell.score == null) return t("Not recorded");
  return `${cell.score}/${cell.max || 40}`;
}

function showAverage(value) {
  if (value == null) return "—";
  const rounded = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}/40` : `${rounded.toFixed(1)}/40`;
}

function resultLabel(reached) {
  if (reached == null) return t("Not recorded");
  return reached ? t("50% or above") : t("Below 50%");
}

function termTitle(key) {
  if (key === "2") return t("Term 2");
  if (key === "3") return t("Term 3");
  return t("Term 1");
}

function groupsOf(rows) {
  const groups = [];
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.classId || row.className || "school");
    let group = map.get(key);
    if (!group) {
      group = { key, name: row.className || t("Class"), rows: [] };
      map.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  });
  return groups;
}

function StandingTable({ rows, mode, termKey, preview }) {
  return (
    <table className={preview ? "doc-table" : "board roster-table report-table premium-table"}>
      <thead>
        <tr>
          <th>{t("No.")}</th>
          <th>{t("Student")}</th>
          {mode === "annual" ? TERM_KEYS.map((key) => <th key={key}>{termTitle(key)} /40</th>) : <th>{termTitle(termKey)} /40</th>}
          {mode === "annual" ? <th>{t("Average /40")}</th> : null}
          <th>{t("50% or above")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const cell = row.terms?.[termKey];
          const reached = mode === "annual" ? row.reached : (cell?.score == null ? null : (cell.score / (cell.max || 40)) * 100 >= 50);
          return (
            <tr key={row.id} className={reached === false ? "follow-miss" : undefined}>
              <td data-label={t("No.")}><span className="roster-no">{String(index + 1).padStart(2, "0")}</span></td>
              <td data-label={t("Student")} className="roster-name">{row.name}</td>
              {mode === "annual"
                ? TERM_KEYS.map((key) => <td key={key} data-label={`${termTitle(key)} /40`} className="num">{showMark(row.terms?.[key])}</td>)
                : <td data-label={`${termTitle(termKey)} /40`} className="num">{showMark(cell)}</td>}
              {mode === "annual" ? <td data-label={t("Average /40")} className="num">{showAverage(row.average)}</td> : null}
              <td data-label={t("50% or above")}>{resultLabel(reached)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StandingSheets({ rows, mode, termKey, school, year, preview }) {
  const title = mode === "annual" ? t("Annual discipline report") : t("Discipline cases");
  const noteFor = (name) => [name, year, mode === "annual" ? t("Average /40") : `${termTitle(termKey)} /40`].filter(Boolean).join(" · ");
  return groupsOf(rows).map((group) => (
    <section className="sections print-class" key={group.key}>
      {preview ? <PrintHeading school={school} title={title} note={noteFor(group.name)} /> : (
        <header className="roster-head">
          <div>
            <p className="kicker">{t("Discipline")}</p>
            <h2>{group.name}</h2>
            <p className="muted">{noteFor(group.name)}</p>
          </div>
          <span className="roster-count">{group.rows.length}</span>
        </header>
      )}
      <StandingTable rows={group.rows} mode={mode} termKey={termKey} preview={preview} />
    </section>
  ));
}

export function DisciplineStanding({ token, school }) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [classId, setClassId] = useState("");
  const [mode, setMode] = useState("annual");
  const [termKey, setTermKey] = useState("1");
  const [result, setResult] = useState("");
  const [classes, setClasses] = useState([]);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api("/academics/classes", { token })
      .then((page) => setClasses(page.items || []))
      .catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [token]);

  useEffect(() => {
    if (!/^\d{4}$/.test(year)) return undefined;
    const query = new URLSearchParams({ academicYear: year });
    if (classId) query.set("classRoom", classId);
    let cancelled = false;
    api(`/discipline/standing?${query.toString()}`, { token })
      .then((page) => { if (!cancelled) setRows(page.rows || []); })
      .catch((err) => { if (!cancelled) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancelled = true; };
  }, [token, year, classId]);

  const visible = useMemo(() => rows.filter((row) => {
    const cell = row.terms?.[termKey];
    const reached = mode === "annual" ? row.reached : (cell?.score == null ? null : (cell.score / (cell.max || 40)) * 100 >= 50);
    if (result === "yes") return reached === true;
    if (result === "no") return reached === false;
    return true;
  }), [rows, mode, termKey, result]);

  const above = rows.filter((row) => (mode === "annual" ? row.reached : (row.terms?.[termKey]?.score != null && (row.terms[termKey].score / (row.terms[termKey].max || 40)) * 100 >= 50)) === true).length;
  const below = rows.filter((row) => {
    const cell = row.terms?.[termKey];
    const reached = mode === "annual" ? row.reached : (cell?.score == null ? null : (cell.score / (cell.max || 40)) * 100 >= 50);
    return reached === false;
  }).length;

  return (
    <div className="sections">
      <section className="panel sections no-print">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="scale" /></span>
          <div>
            <p className="kicker">{t("Discipline")}</p>
            <h2>{mode === "annual" ? t("Annual discipline report") : t("Discipline cases")}</h2>
          </div>
        </header>
        <p className="muted">{t("Each term is marked over 40. The average of the three terms shows who reached 50% and who did not.")}</p>
        <div className="form-grid">
          <label className="field">{t("Academic year")}
            <input type="number" min="2020" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label className="field">{t("Class")}
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">{t("Whole school")}</option>
              {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="chips">
          <button type="button" className={mode === "term" ? "on" : ""} onClick={() => setMode("term")}>{t("Discipline cases")}</button>
          <button type="button" className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>{t("Annual discipline report")}</button>
        </div>
        {mode === "term" ? (
          <div className="chips">
            {TERM_KEYS.map((key) => <button type="button" key={key} className={termKey === key ? "on" : ""} onClick={() => setTermKey(key)}>{termTitle(key)} /40</button>)}
          </div>
        ) : null}
        <div className="chips">
          <button type="button" className={result === "" ? "on" : ""} onClick={() => setResult("")}>{t("All")} · {rows.length}</button>
          <button type="button" className={result === "yes" ? "on" : ""} onClick={() => setResult("yes")}>{t("50% or above")} · {above}</button>
          <button type="button" className={result === "no" ? "on" : ""} onClick={() => setResult("no")}>{t("Below 50%")} · {below}</button>
        </div>
        <div className="actions">
          <button className="solid" type="button" disabled={!visible.length} onClick={() => setOpen(true)}>{t("Print / Save PDF")}</button>
        </div>
      </section>
      {visible.length === 0 ? <p className="roster-empty">{t("No students in this list.")}</p> : <StandingSheets rows={visible} mode={mode} termKey={termKey} school={school} year={year} />}
      {open ? (
        <ReportPrint title={mode === "annual" ? t("Annual discipline report") : t("Discipline cases")} school={school} onClose={() => setOpen(false)} bare>
          <StandingSheets rows={visible} mode={mode} termKey={termKey} school={school} year={year} preview />
        </ReportPrint>
      ) : null}
    </div>
  );
}
