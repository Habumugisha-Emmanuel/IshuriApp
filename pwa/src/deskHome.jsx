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

function stampOf(value) {
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

function changeLine(value) {
  if (value == null) return null;
  const change = `${value > 0 ? "+" : ""}${value}`;
  return t("{change}% vs the previous period", { change });
}

function percentChange(now, before) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

function periodBounds(stamp, span) {
  const windows = { "7d": 7, "30d": 30, "3m": 90, "1y": 366 };
  const length = windows[span] || 30;
  return { start: shiftStamp(stamp, -length), prevStart: shiftStamp(stamp, -length * 2) };
}

function bump(byDay, day, key, amount = 1) {
  if (!day) return;
  const row = byDay.get(day) || { income: 0, expense: 0 };
  row[key] += amount;
  byDay.set(day, row);
}

function weekRows(flow, stamp, key = "") {
  const read = (row) => (key ? row[key] || 0 : (row.income || 0) + (row.expense || 0));
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftStamp(stamp, index - 6);
    const before = shiftStamp(stamp, index - 13);
    const now = flow.byDay.get(day) || { income: 0, expense: 0 };
    const prev = flow.byDay.get(before) || { income: 0, expense: 0 };
    return {
      label: t(BOARD_DAYS[new Date(`${day}T12:00:00.000Z`).getUTCDay()]),
      now: read(now),
      before: read(prev),
    };
  });
}

export function DeskLoading({ title, text }) {
  return (
    <div className="acct-load">
      <div className="acct-load-card">
        <span className="loader-ring" />
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

export function DeskSearch({ placeholder, rows, onPick }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const text = query.trim().toLowerCase();
  const matches = text ? (rows || []).filter((row) => `${row.title || ""} ${row.detail || ""}`.toLowerCase().includes(text)).slice(0, 8) : [];
  function choose(row) {
    setQuery(row.title || "");
    setOpen(false);
    onPick(row);
  }
  return (
    <div className="fee-find">
      <form className="search" onSubmit={(event) => { event.preventDefault(); if (matches[0]) choose(matches[0]); }}>
        <input aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      </form>
      {open && text && matches.length === 0 ? <p className="muted">{t("No one matches that search.")}</p> : null}
      {open && matches.length ? (
        <ul>
          {matches.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => choose(row)}>
                <strong>{row.title}</strong>
                {row.detail ? <span>{row.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function go(path) {
  window.location.hash = path;
}

function RoleFrame({ userName, roleLabel, welcome, span, setSpan, view }) {
  const spark = (view.series || []).slice(-12);
  return (
    <>
      <header className="acct-top">
        <div>
          <h2>{t("Welcome back, {name}.", { name: userName || t(roleLabel) })}</h2>
          <p>{t(welcome)}</p>
        </div>
        <label className="acct-period">
          <Icon name="calendar" />
          <select value={span} aria-label={t("Period")} onChange={(event) => setSpan(event.target.value)}>
            {RANGES.map(([id, , label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </label>
      </header>
      <div className="acct-kpis">
        {view.kpis.map((card) => (
          <article className={`acct-kpi ${card.tone}`} key={card.label}>
            <span className="acct-kpi-icon"><Icon name={card.icon} /></span>
            <div>
              <span>{t(card.label)}</span>
              <strong>{card.value}</strong>
              {changeLine(card.change) ? <em className={card.change < 0 ? "is-down" : "is-up"}><Icon name={card.change < 0 ? "down" : "up"} /> {changeLine(card.change)}</em> : null}
            </div>
            <MiniBars rows={card.bars || spark} dataKey={card.barKey || "income"} color={card.color} />
          </article>
        ))}
      </div>
      <div className="acct-split">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t(view.waveTitle)}</h2>
            <div className="acct-card-tools">
              <p className="acct-key"><span><i className="is-income" />{t(view.waveA)}</span><span><i className="is-expense" />{t(view.waveB)}</span></p>
              <div className="acct-pills">
                {RANGES.map(([id, label]) => (
                  <button key={id} type="button" className={span === id ? "on" : ""} onClick={() => setSpan(id)}>{t(label)}</button>
                ))}
              </div>
            </div>
          </header>
          <WaveChart series={view.series} format={countText} count />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t(view.donutTitle)}</h2>
          </header>
          <MoneyDonut slices={view.slices} total={view.donutTotal} format={countText} unit="" empty={view.empty} />
        </section>
      </div>
      <div className="acct-three">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name={view.rankIcon || "people"} /> {t(view.rankTitle)}</h2>
          </header>
          {view.ranks.length ? view.ranks.map((row, index) => (
            <button className="acct-rank" type="button" key={row.id} onClick={() => go(row.href)}>
              <span className={index === 0 ? "is-gold" : ""}>{index === 0 ? <Icon name="award" /> : index + 1}</span>
              <strong>{row.name}</strong>
              <em>{row.value}</em>
            </button>
          )) : <p className="muted hint-line"><Icon name="info" /> {t(view.empty)}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name={view.recentIcon || "calendar"} /> {t(view.recentTitle)}</h2>
          </header>
          {view.note ? <p className="muted hint-line">{t(view.note)}</p> : null}
          {view.recent.length ? view.recent.map((row) => (
            <button className="acct-tx" type="button" key={row.id} onClick={() => go(row.href)}>
              <span className={row.incoming ? "acct-dir is-in" : "acct-dir is-out"}><Icon name={row.icon || "right"} /></span>
              <div>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
            </button>
          )) : <p className="muted hint-line"><Icon name="info" /> {t(view.empty)}</p>}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="bolt" /> {t("Quick actions")}</h2>
          </header>
          <div className="acct-actions">
            {view.actions.map((action) => (
              <button type="button" key={action.href} onClick={() => go(action.href)}><span><Icon name={action.icon} /></span> {t(action.label)}</button>
            ))}
          </div>
        </section>
      </div>
      <div className="acct-bottom">
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="chart" /> {t(view.weekTitle)}</h2>
            <p className="acct-key"><span><i className="is-income" />{t("This period")}</span><span><i className="is-before" />{t("Previous period")}</span></p>
          </header>
          {view.week ? <WeekBars rows={view.week} format={countText} count /> : <MoneyDonut slices={view.weekSlices || []} total={view.weekTotal || 0} format={countText} unit="" empty={view.empty} />}
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="graduate" /> {t(view.collectTitle)}</h2>
          </header>
          <ClassCollection rows={view.collection} total={view.collectTotal} format={countText} empty={view.empty} />
        </section>
        <section className="chart-card">
          <header className="acct-card-head">
            <h2><Icon name="pie" /> {t(view.secondTitle)}</h2>
          </header>
          <MoneyDonut slices={view.secondSlices} total={view.secondTotal} format={countText} unit="" empty={view.empty} />
        </section>
      </div>
    </>
  );
}

const STAFF_CATEGORY = {
  teacher: "Teachers",
  dos: "Director of Studies",
  discipline: "Discipline",
  accountant: "Accountants",
  leadership: "Director",
  support: "Staff",
  admin: "Director",
};

export function DirectorBoard({ userName, students, classes, staff, events, university }) {
  const [span, setSpan] = useState("30d");
  const stamp = todayStamp();
  const view = useMemo(() => {
    const { start, prevStart } = periodBounds(stamp, span);
    const inside = (day) => Boolean(day) && day > start && day <= stamp;
    const previous = (day) => Boolean(day) && day > prevStart && day <= start;
    const byDay = new Map();
    const byClass = new Map();
    const byStaff = new Map();
    const byEvent = new Map();
    const recent = [];
    let arrived = 0;
    let prevArrived = 0;
    let eventCount = 0;
    let prevEvents = 0;
    (students || []).forEach((student) => {
      const classId = String(student.classRoom?._id || student.classRoom || "");
      const className = student.classRoom?.name || "";
      if (classId) byClass.set(classId, { name: className, count: (byClass.get(classId)?.count || 0) + 1 });
      const day = stampOf(student.createdAt);
      if (inside(day)) {
        arrived += 1;
        bump(byDay, day, "income");
      }
      if (previous(day)) {
        prevArrived += 1;
        bump(byDay, day, "income");
      }
    });
    (events || []).forEach((item) => {
      const day = stampOf(item.startsAt || item.createdAt);
      const name = String(item.category || "event").replaceAll("_", " ");
      if (inside(day)) {
        eventCount += 1;
        bump(byDay, day, "expense");
        byEvent.set(name, (byEvent.get(name) || 0) + 1);
        recent.push({ id: item._id, title: item.title || name, detail: [name, day].filter(Boolean).join(" · "), href: "#/desk/publish", icon: "calendar", incoming: true });
      }
      if (previous(day)) {
        prevEvents += 1;
        bump(byDay, day, "expense");
      }
    });
    (staff || []).forEach((person) => {
      const label = STAFF_CATEGORY[person.category] || "Staff";
      byStaff.set(label, (byStaff.get(label) || 0) + 1);
    });
    recent.sort((a, b) => String(b.detail).localeCompare(String(a.detail)));
    const classRows = (classes || []).map((room) => ({
      id: room._id,
      name: room.name,
      paid: byClass.get(String(room._id))?.count || 0,
      href: "#/desk/classes",
    })).sort((a, b) => b.paid - a.paid || String(a.name).localeCompare(String(b.name)));
    const flow = { byDay };
    const series = flowSeries(flow, span, stamp);
    return {
      kpis: [
        { tone: "is-income", icon: "graduate", label: "Students", value: (students || []).length, bars: series, barKey: "income", color: "#2F6BFF" },
        { tone: "is-expense", icon: "book", label: "Classes", value: (classes || []).length, bars: series, barKey: "income", color: "#22A06B" },
        { tone: "is-net", icon: "people", label: "Staff", value: (staff || []).length, bars: series, barKey: "expense", color: "#7C4DFF" },
        { tone: "is-due", icon: "calendar", label: "Events", value: eventCount, change: percentChange(eventCount, prevEvents), bars: series, barKey: "expense", color: "#F5A623" },
      ],
      waveTitle: "New students and events",
      waveA: "Students",
      waveB: "Events",
      series,
      donutTitle: "Staff by role",
      slices: donutSlices([...byStaff.entries()].map(([name, value]) => ({ name: t(name), value }))),
      donutTotal: (staff || []).length,
      empty: university ? "No events in this period." : "No students in this period.",
      rankTitle: "Classes",
      ranks: classRows.map((row) => ({ ...row, value: row.paid })),
      recentTitle: "Recent events",
      recent: recent.slice(0, 6),
      actions: university
        ? [
          { href: "#/desk/summary", icon: "chart", label: "Summary report" },
          { href: "#/desk/standing", icon: "award", label: "Term Assessment Report" },
          { href: "#/desk/status", icon: "people", label: "Student status" },
          { href: "#/desk/staff", icon: "people", label: "Staff accounts" },
          { href: "#/desk/publish", icon: "calendar", label: "Events" },
          { href: "#/desk/sms", icon: "message", label: "Send a message" },
          { href: "#/desk/analytics", icon: "chart", label: "Message analytics" },
        ]
        : [
          { href: "#/desk/summary", icon: "chart", label: "Summary report" },
          { href: "#/desk/standing", icon: "award", label: "Term Assessment Report" },
          { href: "#/desk/follow", icon: "check", label: "Follow-up" },
          { href: "#/desk/status", icon: "people", label: "Student status" },
          { href: "#/desk/students", icon: "graduate", label: "Students" },
          { href: "#/desk/classes", icon: "book", label: "Classes" },
          { href: "#/desk/staff", icon: "people", label: "Staff accounts" },
          { href: "#/desk/analytics", icon: "chart", label: "Message analytics" },
        ],
      weekTitle: "New students this week",
      week: weekRows(flow, stamp, "income"),
      collectTitle: "Students by class",
      collection: classRows.filter((row) => row.paid > 0),
      collectTotal: classRows.reduce((sum, row) => sum + row.paid, 0),
      secondTitle: "Events",
      secondSlices: donutSlices([...byEvent.entries()].map(([name, value]) => ({ name, value }))),
      secondTotal: eventCount,
      arrived,
      prevArrived,
    };
  }, [span, stamp, students, classes, staff, events, university]);
  return (
    <div className="acct-board">
      <RoleFrame userName={userName} roleLabel="Director" welcome="Here is your school for this period." span={span} setSpan={setSpan} view={view} />
    </div>
  );
}

export function StudiesBoard({ userName, classes, assessments }) {
  const [span, setSpan] = useState("30d");
  const stamp = todayStamp();
  const view = useMemo(() => {
    const { start, prevStart } = periodBounds(stamp, span);
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
    const subjects = new Set();
    (classes || []).forEach((room) => {
      (room.subjects || []).forEach((row) => {
        const id = row.subject?._id || row.subject;
        if (id) subjects.add(String(id));
      });
    });
    (assessments || []).forEach((item) => {
      const day = stampOf(item.date);
      const exam = item.type === "exam";
      const classId = String(item.classRoom?._id || item.classRoom || "");
      const className = item.classRoom?.name || "";
      const subject = item.subject?.name || "";
      if (inside(day)) {
        if (exam) exams += 1;
        else tests += 1;
        bump(byDay, day, exam ? "expense" : "income");
        if (subject) bySubject.set(subject, (bySubject.get(subject) || 0) + 1);
        if (classId) byClass.set(classId, { name: className, count: (byClass.get(classId)?.count || 0) + 1 });
        recent.push({
          id: item._id,
          title: item.title || (exam ? t("Examination") : t("Assessments")),
          detail: [className, subject, day].filter(Boolean).join(" · "),
          href: exam ? "#/desk/studies" : "#/desk/studies",
          icon: exam ? "award" : "pen",
          incoming: !exam,
        });
      }
      if (previous(day)) {
        if (exam) prevExams += 1;
        else prevTests += 1;
        bump(byDay, day, exam ? "expense" : "income");
      }
    });
    recent.sort((a, b) => String(b.detail).localeCompare(String(a.detail)));
    const classRows = (classes || []).map((room) => ({
      id: room._id,
      name: room.name,
      paid: byClass.get(String(room._id))?.count || 0,
      href: "#/desk/studies",
    })).sort((a, b) => b.paid - a.paid || String(a.name).localeCompare(String(b.name)));
    const flow = { byDay };
    const series = flowSeries(flow, span, stamp);
    const work = tests + exams;
    return {
      kpis: [
        { tone: "is-income", icon: "book", label: "Classes", value: (classes || []).length, bars: series, barKey: "income", color: "#2F6BFF" },
        { tone: "is-expense", icon: "pen", label: "Assessments", value: tests, change: percentChange(tests, prevTests), bars: series, barKey: "income", color: "#22A06B" },
        { tone: "is-net", icon: "award", label: "Examinations", value: exams, change: percentChange(exams, prevExams), bars: series, barKey: "expense", color: "#7C4DFF" },
        { tone: "is-due", icon: "graduate", label: "Subjects", value: subjects.size, bars: series, barKey: "expense", color: "#F5A623" },
      ],
      waveTitle: "Assessments and examinations",
      waveA: "Assessments",
      waveB: "Examinations",
      series,
      donutTitle: "Work by subject",
      slices: donutSlices([...bySubject.entries()].map(([name, value]) => ({ name, value }))),
      donutTotal: work,
      empty: "No assessments in this period.",
      rankTitle: "Classes",
      ranks: classRows.map((row) => ({ ...row, value: row.paid })),
      recentTitle: "Recent assessments",
      recent: recent.slice(0, 6),
      actions: [
        { href: "#/desk/studies", icon: "award", label: "Director of Studies" },
        { href: "#/desk/studies/summary", icon: "chart", label: "Summary report" },
        { href: "#/desk/studies/midterm", icon: "pen", label: "Mid Term Tests Report" },
        { href: "#/desk/studies/credits", icon: "book", label: "Credit report" },
        { href: "#/desk/studies/examination", icon: "graduate", label: "Examination" },
        { href: "#/desk/studies/follow", icon: "check", label: "Follow-up" },
      ],
      weekTitle: "Assessments this week",
      week: weekRows(flow, stamp),
      collectTitle: "Work by class",
      collection: classRows.filter((row) => row.paid > 0),
      collectTotal: classRows.reduce((sum, row) => sum + row.paid, 0),
      secondTitle: "Assessments and examinations",
      secondSlices: donutSlices([
        { name: t("Assessments"), value: tests },
        { name: t("Examinations"), value: exams },
      ]),
      secondTotal: work,
    };
  }, [span, stamp, classes, assessments]);
  return (
    <div className="acct-board">
      <RoleFrame userName={userName} roleLabel="Director of Studies" welcome="Here is the studies desk for this period." span={span} setSpan={setSpan} view={view} />
    </div>
  );
}

export function DisciplineBoard({ userName, students, classes, cases }) {
  const [span, setSpan] = useState("30d");
  const stamp = todayStamp();
  const view = useMemo(() => {
    const { start, prevStart } = periodBounds(stamp, span);
    const inside = (day) => Boolean(day) && day > start && day <= stamp;
    const previous = (day) => Boolean(day) && day > prevStart && day <= start;
    const byDay = new Map();
    const byClass = new Map();
    const byKind = new Map();
    const byStatus = new Map();
    const recent = [];
    let count = 0;
    let prevCount = 0;
    let lost = 0;
    let prevLost = 0;
    let resolved = 0;
    (cases || []).forEach((item) => {
      const day = stampOf(item.occurredAt || item.createdAt);
      const className = item.student?.classRoom?.name || "";
      const classId = String(item.student?.classRoom?._id || item.student?.classRoom || "");
      const kind = String(item.category || "other").replaceAll("_", " ");
      const status = String(item.status || "open");
      if (inside(day)) {
        count += 1;
        lost += Number(item.marksLost) || 0;
        bump(byDay, day, "income");
        if (status === "resolved") {
          resolved += 1;
          bump(byDay, day, "expense");
        }
        byKind.set(kind, (byKind.get(kind) || 0) + 1);
        byStatus.set(status, (byStatus.get(status) || 0) + 1);
        if (classId) byClass.set(classId, { name: className, count: (byClass.get(classId)?.count || 0) + 1 });
        recent.push({
          id: item._id,
          title: item.title || kind,
          detail: [item.student?.fullName, className, day].filter(Boolean).join(" · "),
          href: "#/desk/discipline",
          icon: "scale",
          incoming: status !== "open",
        });
      }
      if (previous(day)) {
        prevCount += 1;
        prevLost += Number(item.marksLost) || 0;
        bump(byDay, day, status === "resolved" ? "expense" : "income");
      }
    });
    recent.sort((a, b) => String(b.detail).localeCompare(String(a.detail)));
    const classRows = [...byClass.entries()].map(([id, row]) => ({
      id,
      name: row.name || t("Class"),
      paid: row.count,
      href: "#/desk/discipline",
    })).sort((a, b) => b.paid - a.paid || String(a.name).localeCompare(String(b.name)));
    const flow = { byDay };
    const series = flowSeries(flow, span, stamp);
    const open = (cases || []).filter((item) => item.status === "open").length;
    return {
      kpis: [
        { tone: "is-income", icon: "graduate", label: "Students", value: (students || []).length, bars: series, barKey: "income", color: "#2F6BFF" },
        { tone: "is-expense", icon: "scale", label: "Cases", value: count, change: percentChange(count, prevCount), bars: series, barKey: "income", color: "#22A06B" },
        { tone: "is-net", icon: "pen", label: "Marks lost", value: lost, change: percentChange(lost, prevLost), bars: series, barKey: "expense", color: "#7C4DFF" },
        { tone: "is-due", icon: "shield", label: "Open cases", value: open, bars: series, barKey: "income", color: "#F5A623" },
      ],
      waveTitle: "Cases",
      waveA: "Cases",
      waveB: "Resolved",
      series,
      donutTitle: "Cases",
      slices: donutSlices([...byKind.entries()].map(([name, value]) => ({ name, value }))),
      donutTotal: count,
      empty: "No cases in this period.",
      rankTitle: "Cases by class",
      ranks: classRows.map((row) => ({ ...row, value: row.paid })),
      recentTitle: "Recent cases",
      recent: recent.slice(0, 6),
      actions: [
        { href: "#/desk/discipline", icon: "scale", label: "Discipline cases" },
        { href: "#/desk/discipline/annual", icon: "award", label: "Annual discipline report" },
        { href: "#/desk/analytics", icon: "chart", label: "My messages" },
        { href: "#/desk/chat", icon: "chat", label: "Messages" },
        { href: "#/desk/settings", icon: "gear", label: "Settings" },
      ],
      weekTitle: "Cases this week",
      week: weekRows(flow, stamp, "income"),
      collectTitle: "Cases by class",
      collection: classRows,
      collectTotal: classRows.reduce((sum, row) => sum + row.paid, 0),
      secondTitle: "Cases",
      secondSlices: donutSlices([...byStatus.entries()].map(([name, value]) => ({ name, value }))),
      secondTotal: count,
      resolved,
    };
  }, [span, stamp, students, classes, cases]);
  return (
    <div className="acct-board">
      <RoleFrame userName={userName} roleLabel="Discipline" welcome="Here is the discipline desk for this period." span={span} setSpan={setSpan} view={view} />
    </div>
  );
}

const PLATFORM_ROLE = {
  school_admin: "Directors",
  teacher: "Teachers",
  discipline: "Discipline",
  accountant: "Accountants",
};

export function PlatformBoard({ userName, data }) {
  const [span, setSpan] = useState("1y");
  const view = useMemo(() => {
    const trend = data?.trend || [];
    const take = span === "3m" ? 3 : span === "1y" ? 12 : 1;
    const current = trend.slice(-take);
    const previous = trend.slice(-take * 2, -take);
    const series = (current.length ? current : [{ label: "", schools: data?.schools || 0, staff: data?.staff || 0 }]).map((row) => ({
      label: row.label,
      income: row.schools || 0,
      expense: row.staff || 0,
    }));
    const schoolNow = series[series.length - 1]?.income || 0;
    const staffNow = series[series.length - 1]?.expense || 0;
    const schoolThen = previous[previous.length - 1]?.schools || 0;
    const staffThen = previous[previous.length - 1]?.staff || 0;
    const slices = donutSlices(Object.entries(data?.staffByRole || {}).map(([role, value]) => ({
      name: t(PLATFORM_ROLE[role] || role),
      value,
    })));
    const schools = data?.items || [];
    const ranks = schools.map((school) => ({
      id: school.id,
      name: school.name,
      value: school.staff || 0,
      href: "#/desk/approvals",
    })).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
    const recent = schools.filter((school) => school.online).slice(0, 6).map((school) => ({
      id: school.id,
      title: school.name,
      detail: (school.people || []).map((person) => person.fullName).join(", "),
      href: "#/desk/approvals",
      icon: "bolt",
      incoming: true,
    }));
    const collection = ranks.filter((row) => row.value > 0).map((row) => ({ ...row, paid: row.value }));
    return {
      kpis: [
        { tone: "is-income", icon: "school", label: "Schools", value: data?.schools || 0, change: percentChange(schoolNow, schoolThen), bars: series, barKey: "income", color: "#2F6BFF" },
        { tone: "is-expense", icon: "people", label: "Staff", value: data?.staff || 0, change: percentChange(staffNow, staffThen), bars: series, barKey: "expense", color: "#22A06B" },
        { tone: "is-net", icon: "bolt", label: "Schools online", value: data?.onlineSchools || 0, bars: series, barKey: "income", color: "#7C4DFF" },
        { tone: "is-due", icon: "chat", label: "Staff online", value: data?.onlinePeople || 0, bars: series, barKey: "expense", color: "#F5A623" },
      ],
      waveTitle: "Schools and staff",
      waveA: "Schools",
      waveB: "Staff",
      series,
      donutTitle: "Staff by role",
      slices,
      donutTotal: data?.staff || 0,
      empty: "No schools online.",
      rankTitle: "Schools",
      ranks,
      recentTitle: "Schools online now",
      note: "A school is online while one of its staff has IshuriApp open. The count clears about 90 seconds after they leave.",
      recent,
      actions: [
        { href: "#/desk/reports", icon: "chart", label: "School analysis" },
        { href: "#/desk/approvals", icon: "school", label: "Directors and schools" },
        { href: "#/desk/wallets", icon: "wallet", label: "Message wallets" },
        { href: "#/desk/ads", icon: "megaphone", label: "In-app ads" },
      ],
      weekTitle: "Schools online now",
      week: null,
      weekSlices: donutSlices([
        { name: t("Schools online"), value: data?.onlineSchools || 0 },
        { name: t("Offline"), value: data?.offlineSchools || 0 },
      ]),
      weekTotal: data?.schools || 0,
      collectTitle: "Staff by school",
      collection,
      collectTotal: collection.reduce((sum, row) => sum + row.paid, 0),
      secondTitle: "Staff by role",
      secondSlices: slices,
      secondTotal: data?.staff || 0,
    };
  }, [span, data]);
  return (
    <div className="acct-board">
      <RoleFrame userName={userName} roleLabel="Platform" welcome="Here is IshuriApp for this period." span={span} setSpan={setSpan} view={view} />
    </div>
  );
}

export function QuietBoard({ userName, roleLabel, welcome, actions }) {
  return (
    <div className="acct-board">
      <header className="acct-top">
        <div>
          <h2>{t("Welcome back, {name}.", { name: userName || t(roleLabel) })}</h2>
          <p>{t(welcome)}</p>
        </div>
      </header>
      <div className="acct-actions">
        {actions.map((action) => (
          <button type="button" key={action.href} onClick={() => go(action.href)}><span><Icon name={action.icon} /></span> {t(action.label)}</button>
        ))}
      </div>
    </div>
  );
}
