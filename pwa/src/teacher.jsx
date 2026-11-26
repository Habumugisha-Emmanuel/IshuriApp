import { useMemo, useState } from "react";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import {
  BOARD_DAYS,
  ClassCollection,
  MiniBars,
  MoneyDonut,
  RANGES,
  WeekBars,
  WaveChart,
  donutSlices,
  flowSeries,
  shiftStamp,
} from "./accountant.jsx";

function todayStamp() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dayOf(value) {
  const text = String(value || "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (match) return match[1];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function countText(value) {
  return String(Math.round(Number(value) || 0));
}

function teachFlow(assessments, stamp, span) {
  const windows = { "7d": 7, "30d": 30, "3m": 90, "1y": 366 };
  const length = windows[span] || 30;
  const start = shiftStamp(stamp, -length);
  const prevStart = shiftStamp(stamp, -length * 2);
  const inside = (day) => Boolean(day) && day > start && day <= stamp;
  const previous = (day) => Boolean(day) && day > prevStart && day <= start;
  const byDay = new Map();
  const bySubject = new Map();
  const byClass = new Map();
  const recent = [];
  let tests = 0;
  let exams = 0;
  let prevTests = 0;
  let prevExams = 0;
  (assessments || []).forEach((item) => {
    const day = dayOf(item.date);
    const exam = item.type === "exam";
    const add = (key) => {
      const row = byDay.get(day) || { income: 0, expense: 0 };
      row[key] += 1;
      byDay.set(day, row);
    };
    if (inside(day)) {
      if (exam) exams += 1;
      else tests += 1;
      if (day) add(exam ? "expense" : "income");
      const subject = item.subject?.name || t("Subjects");
      bySubject.set(subject, (bySubject.get(subject) || 0) + 1);
      const classId = String(item.classRoom?._id || item.classRoom || "");
      const className = item.classRoom?.name || "";
      if (classId) byClass.set(classId, { name: className, count: (byClass.get(classId)?.count || 0) + 1 });
      recent.push({
        id: item._id,
        title: item.title || (exam ? t("Examination") : t("Assessments")),
        detail: [className, item.subject?.name].filter(Boolean).join(" · "),
        day,
        exam,
      });
    }
    if (previous(day)) {
      if (exam) prevExams += 1;
      else prevTests += 1;
      if (day) add(exam ? "expense" : "income");
    }
  });
  recent.sort((a, b) => String(b.day).localeCompare(String(a.day)));
  return { tests, exams, prevTests, prevExams, byDay, bySubject, byClass, recent: recent.slice(0, 6) };
}

export function TeacherBoard({ userName, classes, roster, assessments }) {
  const [span, setSpan] = useState("30d");
  const stamp = todayStamp();
  const flow = useMemo(() => teachFlow(assessments, stamp, span), [assessments, stamp, span]);
  const series = flowSeries(flow, span, stamp);
  const subjects = new Set();
  (classes || []).forEach((room) => {
    (room.subjects || []).forEach((row) => {
      const id = row.subject?._id || row.subject;
      if (id) subjects.add(String(id));
    });
  });
  const testChange = flow.prevTests > 0 ? Math.round(((flow.tests - flow.prevTests) / flow.prevTests) * 100) : null;
  const examChange = flow.prevExams > 0 ? Math.round(((flow.exams - flow.prevExams) / flow.prevExams) * 100) : null;
  const work = flow.tests + flow.exams;
  const prevWork = flow.prevTests + flow.prevExams;
  const workChange = prevWork > 0 ? Math.round(((work - prevWork) / prevWork) * 100) : null;
  const subjectSlices = donutSlices([...flow.bySubject.entries()].map(([name, value]) => ({ name, value })));
  const classRows = (classes || []).map((room) => ({
    id: room._id,
    name: room.name,
    paid: flow.byClass.get(String(room._id))?.count || 0,
  })).sort((a, b) => b.paid - a.paid || String(a.name).localeCompare(String(b.name)));
  const classTotal = classRows.reduce((sum, row) => sum + row.paid, 0);
  const spark = series.slice(-12);
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = shiftStamp(stamp, index - 6);
    const before = shiftStamp(stamp, index - 13);
    const now = flow.byDay.get(day) || { income: 0, expense: 0 };
    const prev = flow.byDay.get(before) || { income: 0, expense: 0 };
    return {
      label: t(BOARD_DAYS[new Date(`${day}T12:00:00.000Z`).getUTCDay()]),
      now: now.income + now.expense,
      before: prev.income + prev.expense,
    };
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
          <h2>{t("Welcome back, {name}.", { name: userName || t("Teacher") })}</h2>
          <p>{t("Here is your class work for this period.")}</p>
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
          <span className="acct-kpi-icon"><Icon name="graduate" /></span>
          <div>
            <span>{t("Students")}</span>
            <strong>{roster.length}</strong>
          </div>
          <MiniBars rows={spark} dataKey="income" color="#2F6BFF" />
        </article>
        <article className="acct-kpi is-expense">
          <span className="acct-kpi-icon"><Icon name="pen" /></span>
          <div>
            <span>{t("Assessments")}</span>
            <strong>{flow.tests}</strong>
            {changeLine(testChange) ? <em className={testChange < 0 ? "is-down" : "is-up"}><Icon name={testChange < 0 ? "down" : "up"} /> {changeLine(testChange)}</em> : null}
          </div>
          <MiniBars rows={spark} dataKey="income" color="#22A06B" />
        </article>
        <article className="acct-kpi is-net">
          <span className="acct-kpi-icon"><Icon name="award" /></span>
          <div>
            <span>{t("Examinations")}</span>
            <strong>{flow.exams}</strong>
            {changeLine(examChange) ? <em className={examChange < 0 ? "is-down" : "is-up"}><Icon name={examChange < 0 ? "down" : "up"} /> {changeLine(examChange)}</em> : null}
          </div>
          <MiniBars rows={spark} dataKey="expense" color="#7C4DFF" />
        </article>
        <article className="acct-kpi is-due">
          <span className="acct-kpi-icon"><Icon name="book" /></span>
          <div>
            <span>{t("Subjects")}</span>
            <strong>{subjects.size}</strong>
          </div>
          <MiniBars rows={spark.map((row) => ({ ...row, work: row.income + row.expense }))} dataKey="work" color="#F5A623" />
        </article>
      </div>
      <div className="acct-split">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t("Assessments and examinations")}</h2>
            <div className="acct-card-tools">
              <p className="acct-key"><span><i className="is-income" />{t("Assessments")}</span><span><i className="is-expense" />{t("Examinations")}</span></p>
              <div className="acct-pills">
                {RANGES.map(([id, label]) => (
                  <button key={id} type="button" className={span === id ? "on" : ""} onClick={() => setSpan(id)}>{t(label)}</button>
                ))}
              </div>
            </div>
          </header>
          <WaveChart series={series} format={countText} count />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t("Work by subject")}</h2>
          </header>
          <MoneyDonut slices={subjectSlices} total={work} format={countText} unit="" empty="No assessments in this period." />
        </section>
      </div>
      <div className="acct-three">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="people" /> {t("Classes")}</h2>
          </header>
          {classRows.length ? classRows.map((row, index) => (
            <button className="acct-rank" type="button" key={row.id} onClick={() => { window.location.hash = "#/desk/marks"; }}>
              <span className={index === 0 ? "is-gold" : ""}>{index === 0 ? <Icon name="award" /> : index + 1}</span>
              <strong>{row.name}</strong>
              <em>{row.paid}</em>
            </button>
          )) : <p className="muted hint-line"><Icon name="info" /> {t("No assessments in this period.")}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pen" /> {t("Recent assessments")}</h2>
          </header>
          {flow.recent.length ? flow.recent.map((row) => (
            <button className="acct-tx" type="button" key={row.id} onClick={() => { window.location.hash = row.exam ? "#/desk/marks/examination" : "#/desk/marks"; }}>
              <span className={row.exam ? "acct-dir is-out" : "acct-dir is-in"}><Icon name={row.exam ? "award" : "pen"} /></span>
              <div>
                <strong>{row.title}</strong>
                <span>{[row.detail, row.day].filter(Boolean).join(" · ")}</span>
              </div>
            </button>
          )) : <p className="muted hint-line"><Icon name="info" /> {t("No assessments in this period.")}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="bolt" /> {t("Quick actions")}</h2>
          </header>
          <div className="acct-actions">
            <button type="button" onClick={() => { window.location.hash = "#/desk/students"; }}><span><Icon name="graduate" /></span> {t("Register students")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/marks"; }}><span><Icon name="pen" /></span> {t("Assessments")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/marks/summary"; }}><span><Icon name="award" /></span> {t("Summary report")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/marks/examination"; }}><span><Icon name="book" /></span> {t("Examination")}</button>
            <button type="button" onClick={() => { window.location.hash = "#/desk/marks/follow"; }}><span><Icon name="check" /></span> {t("Follow-up")}</button>
          </div>
        </section>
      </div>
      <div className="acct-bottom">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t("Assessments this week")}</h2>
            <p className="acct-key"><span><i className="is-income" />{t("This period")}</span><span><i className="is-before" />{t("Previous period")}</span></p>
          </header>
          <WeekBars rows={week} format={countText} count />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="graduate" /> {t("Work by class")}</h2>
          </header>
          <ClassCollection rows={classRows.filter((row) => row.paid > 0)} total={classTotal} format={countText} empty="No assessments in this period." />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t("Assessments and examinations")}</h2>
          </header>
          <MoneyDonut
            slices={donutSlices([
              { name: t("Assessments"), value: flow.tests },
              { name: t("Examinations"), value: flow.exams },
            ])}
            total={work}
            format={countText}
            unit=""
            empty="No assessments in this period."
          />
          {changeLine(workChange) ? <p className={workChange < 0 ? "acct-change is-down" : "acct-change is-up"}>{changeLine(workChange)}</p> : null}
        </section>
      </div>
    </>
  );
}
