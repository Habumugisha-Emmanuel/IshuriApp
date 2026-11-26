import { t } from "./i18n.js";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";
import { ReportPrint } from "./officialReport.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const PERIODS = [
  { id: "all", label: "All dates" },
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

const DELIVERY = [
  { id: "all", label: "All messages" },
  { id: "sent", label: "Sent" },
  { id: "unsent", label: "Unsent" },
];

const CATEGORIES = [
  { id: "marks", label: "Marks", icon: "pen" },
  { id: "results", label: "Term results", icon: "award" },
  { id: "discipline", label: "Discipline", icon: "scale" },
  { id: "notice", label: "School notice", icon: "megaphone" },
];

const ACCOUNTANT_KINDS = [
  { id: "status", label: "Student status", icon: "people" },
  { id: "reminder", label: "Reminder", icon: "alert" },
  { id: "special", label: "Special message", icon: "message" },
];

function kigaliNow() {
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = stamp.split("-").map(Number);
  return { year, month, day, on: stamp };
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function roleIcon(role) {
  if (role === "teacher") return "graduate";
  if (role === "discipline") return "scale";
  if (role === "school_admin") return "school";
  if (role === "accountant") return "wallet";
  return "people";
}

function rwf(value) {
  return `${new Intl.NumberFormat("en-RW").format(Number(value) || 0)} RWF`;
}

function sentOn(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function fitsClass(account, classId) {
  const ids = (account.classIds || []).map(String);
  return !ids.length || ids.includes(String(classId));
}

function portalFigures(ledger, classes, roster) {
  const accounts = ledger?.accounts || [];
  const items = ledger?.items || [];
  const side = (group) => {
    const list = accounts.filter((account) => account.group === group);
    return (classes || []).reduce((total, room) => {
      const students = (roster || []).filter((student) => String(student.classRoom?._id || student.classRoom || "") === String(room._id));
      list.filter((account) => fitsClass(account, room._id)).forEach((account) => {
        const expected = (Number(account.amount) || 0) * students.length;
        const charges = items.filter((row) => String(row.accountId) === String(account.id) && students.some((student) => String(student._id) === String(row.studentId)));
        const paid = charges.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
        total.due += expected;
        total.paid += paid;
        total.unpaid += Math.max(0, expected - paid);
      });
      return total;
    }, { due: 0, paid: 0, unpaid: 0 });
  };
  const entries = ledger?.entries || [];
  return {
    fees: side("fee"),
    materials: side("material"),
    other: entries.filter((entry) => entry.kind === "other_income").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    expenses: entries.filter((entry) => entry.kind === "expense").reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
  };
}

function pair(bag, id) {
  const row = bag?.[id] || {};
  return { sent: Number(row.sent) || 0, unsent: Number(row.unsent) || 0 };
}

function SentChart({ series }) {
  const max = Math.max(1, ...series.map((point) => point.sent + point.unsent));
  if (!series.length) return <p className="muted hint-line"><Icon name="info" /> {t("No messages in this filter.")}</p>;
  return (
    <div className="sent-chart" role="img" aria-label={t("Messages over time")}>
      {series.map((point) => (
        <div className="sent-col" key={point.bucket} title={`${point.label}: ${point.sent} ${t("Sent")}, ${point.unsent} ${t("Unsent")}`}>
          <span className="sent-col-plot">
            {point.unsent ? <i className="is-unsent" style={{ height: `${(point.unsent / max) * 100}%` }} /> : null}
            {point.sent ? <i className="is-sent" style={{ height: `${(point.sent / max) * 100}%` }} /> : null}
          </span>
          <em>{point.label}</em>
        </div>
      ))}
    </div>
  );
}

export function MessagesGraphic() {
  return (
    <svg className="msg-crest" viewBox="0 0 260 150" role="img" aria-label={t("A message reaching a parent phone")}>
      <rect x="8" y="14" width="244" height="122" rx="24" fill="#e3f2fd" />
      <rect x="28" y="32" width="118" height="86" rx="16" fill="#ffffff" />
      <path d="M44 56h78M44 74h62M44 92h48" fill="none" stroke="#90caf9" strokeWidth="6" strokeLinecap="round" />
      <g className="assess-pen">
        <rect x="162" y="36" width="70" height="92" rx="16" fill="#0D47A1" />
        <rect x="170" y="48" width="54" height="58" rx="8" fill="#ffffff" />
        <text x="197" y="74" textAnchor="middle" fill="#0D47A1" fontSize="13" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
        <text x="197" y="92" textAnchor="middle" fill="#1565C0" fontSize="11" fontFamily="Instrument Sans, sans-serif">{t("Parent")}</text>
        <circle cx="197" cy="116" r="4" fill="#4FC3F7" />
      </g>
    </svg>
  );
}

export function MessageAnalytics({ token, role, school }) {
  const today = useMemo(kigaliNow, []);
  const [period, setPeriod] = useState("month");
  const [on, setOn] = useState(today.on);
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [delivery, setDelivery] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [books, setBooks] = useState(null);
  const [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const years = useMemo(() => Array.from({ length: today.year - 2023 }, (_, index) => 2024 + index), [today.year]);
  const accountant = role === "accountant";
  const typeOptions = accountant ? ACCOUNTANT_KINDS : CATEGORIES;

  useEffect(() => {
    let alive = true;
    setError("");
    const params = new URLSearchParams({
      period,
      delivery,
      type,
      year: String(year),
      month: String(month),
      on,
      from,
      to,
      term: period === "year" ? term : "",
      q: query.trim(),
    });
    api(`/sms/analytics?${params.toString()}`, { token })
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message || t("Could not load message analytics"));
      });
    return () => {
      alive = false;
    };
  }, [token, period, delivery, type, year, month, on, from, to, term, query]);

  useEffect(() => {
    if (role !== "accountant") return undefined;
    let alive = true;
    Promise.all([
      api("/accounts/ledger", { token }),
      api("/academics/classes", { token }),
      api("/students", { token }),
    ]).then(([ledger, rooms, students]) => {
      if (alive) setBooks(portalFigures(ledger, rooms.items || [], students.items || []));
    }).catch(() => {
      if (alive) setBooks(null);
    });
    return () => {
      alive = false;
    };
  }, [token, role]);

  const totals = data?.totals || { messages: 0, sent: 0, unsent: 0, shown: 0 };
  const series = data?.series || [];
  const people = data?.people || [];
  const recent = data?.recent || [];
  const mix = typeOptions.map((item) => ({ ...item, ...pair(accountant ? data?.kinds : data?.categories, item.id) }));
  const mixSent = mix.reduce((sum, item) => sum + item.sent, 0);
  const mixUnsent = mix.reduce((sum, item) => sum + item.unsent, 0);
  const rate = percent(totals.sent, totals.sent + totals.unsent);
  const heading = role === "school_admin" ? t("School messages") : t("Your messages");

  return (
    <div className="msg-dash msg-studio">
      <section className="panel msg-studio-head">
        <p className="kicker"><Icon name="chart" /> {t("Message analytics")}</p>
        <h2>{heading}</h2>
        <p className="muted">{t("Sent left the school. Unsent stayed here because the gateway refused the message. Times follow Africa/Kigali.")}</p>
        <div className="actions">
          <button className="solid" type="button" disabled={!data} onClick={() => setPrintOpen(true)}>{t("Print / Save PDF")}</button>
        </div>
      </section>

      <section className="panel msg-studio-filters">
        <div className="chips span">
          {PERIODS.map((item) => (
            <button key={item.id} type="button" className={period === item.id ? "on" : ""} onClick={() => setPeriod(item.id)}>
              <Icon name="calendar" /> {t(item.label)}
            </button>
          ))}
        </div>
        <label className="field">{t("Year")}
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">{t("From")}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">{t("To")}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        {period === "day" || period === "week" ? (
          <label className="field">{t("Date")}
            <input type="date" value={on} onChange={(event) => setOn(event.target.value)} />
          </label>
        ) : null}
        {period === "month" ? (
          <label className="field">{t("Month")}
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((item, index) => <option key={item} value={index + 1}>{t(item)}</option>)}
            </select>
          </label>
        ) : null}
        {period === "year" ? (
          <label className="field">{t("Term")}
            <select value={term} onChange={(event) => setTerm(event.target.value)}>
              <option value="">{t("Annual")}</option>
              <option value="1">{t("Term 1")}</option>
              <option value="2">{t("Term 2")}</option>
              <option value="3">{t("Term 3")}</option>
            </select>
          </label>
        ) : null}
        <div className="chips span">
          {DELIVERY.map((item) => (
            <button key={item.id} type="button" className={delivery === item.id ? "on" : ""} onClick={() => setDelivery(item.id)}>
              <Icon name={item.id === "unsent" ? "alert" : item.id === "sent" ? "check" : "message"} /> {t(item.label)}
            </button>
          ))}
        </div>
        <label className="field">{t("Message type")}
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">{t("All messages")}</option>
            {typeOptions.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
          </select>
        </label>
        <label className="field span">{t("Find a message")}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Find a message")} />
        </label>
        {period === "year" && term ? <p className="muted span">{t("Term 1 is January to April. Term 2 is May to August. Term 3 is September to December.")}</p> : null}
      </section>

      {error ? <p className="warn hint-line"><Icon name="alert" /> {error}</p> : null}

      {!data && !error ? (
        <div className="msg-studio-kpis" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => <article key={item} className="kpi skel-card"><i className="skel" /></article>)}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="msg-studio-kpis">
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="message" /></span>
              <div>
                <h2>{totals.shown}</h2>
                <p>{t("In this filter")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="check" /></span>
              <div>
                <h2>{totals.sent}</h2>
                <p>{t("Sent")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="alert" /></span>
              <div>
                <h2>{totals.unsent}</h2>
                <p>{t("Unsent")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="chart" /></span>
              <div>
                <h2>{rate}%</h2>
                <p>{t("Sent rate")}</p>
              </div>
            </article>
          </div>
          <div className="sent-rate">
            <span>{t("Sent rate")}</span>
            <div><i style={{ width: `${rate}%` }} /></div>
            <strong>{totals.sent} / {totals.sent + totals.unsent}</strong>
          </div>

          <section className="chart-card">
            <h2 className="card-title"><Icon name="chart" /> {t("Messages over time")}</h2>
            <SentChart series={series} />
            <p className="msg-legend"><span><i className="is-sent" /> {t("Sent")}</span><span><i className="is-unsent" /> {t("Unsent")}</span></p>
          </section>

          <section className="chart-card">
            <table className="doc-table fee-paper">
              <caption>{t("Message type")}</caption>
              <thead>
                <tr>
                  <th>{t("Message type")}</th>
                  <th className="num">{t("Sent")}</th>
                  <th className="num">{t("Unsent")}</th>
                  <th className="num">{t("Total")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className={type === "all" ? "is-on" : ""}>
                  <td><button className="ghost" type="button" onClick={() => setType("all")}>{t("All messages")}</button></td>
                  <td className="num">{mixSent}</td>
                  <td className="num">{mixUnsent}</td>
                  <td className="num">{mixSent + mixUnsent}</td>
                </tr>
                {mix.map((item) => (
                  <tr key={item.id} className={type === item.id ? "is-on" : ""}>
                    <td><button className="ghost" type="button" onClick={() => setType(item.id)}><Icon name={item.icon} /> {t(item.label)}</button></td>
                    <td className="num">{item.sent}</td>
                    <td className="num">{item.unsent}</td>
                    <td className="num">{item.sent + item.unsent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {role === "school_admin" ? (
            <section className="chart-card">
              <table className="doc-table fee-paper">
                <caption>{t("Who sent them")}</caption>
                <thead>
                  <tr>
                    <th>{t("Staff")}</th>
                    <th className="num">{t("Sent")}</th>
                    <th className="num">{t("Unsent")}</th>
                    <th className="num">{t("Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id || person.name}>
                      <td><Icon name={roleIcon(person.role)} /> {person.name === "Earlier sends" ? t("Earlier sends") : person.name}</td>
                      <td className="num">{person.sent || 0}</td>
                      <td className="num">{person.unsent || 0}</td>
                      <td className="num">{person.messages || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {people.length ? null : <p className="muted hint-line"><Icon name="people" /> {t("No staff messages in this filter.")}</p>}
            </section>
          ) : null}

          {accountant && books ? (
            <section className="chart-card">
              <table className="doc-table fee-paper">
                <caption>{t("Accountant portal")}</caption>
                <thead>
                  <tr>
                    <th>{t("Account")}</th>
                    <th className="num">{t("Amount to be paid")}</th>
                    <th className="num">{t("Amount paid")}</th>
                    <th className="num">{t("Unpaid")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t("School fees")}</td>
                    <td className="num">{rwf(books.fees.due)}</td>
                    <td className="num">{rwf(books.fees.paid)}</td>
                    <td className="num">{rwf(books.fees.unpaid)}</td>
                  </tr>
                  <tr>
                    <td>{t("Other items")}</td>
                    <td className="num">{rwf(books.materials.due)}</td>
                    <td className="num">{rwf(books.materials.paid)}</td>
                    <td className="num">{rwf(books.materials.unpaid)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t("School")}</td>
                    <td className="num">{rwf(books.fees.due + books.materials.due)}</td>
                    <td className="num">{rwf(books.fees.paid + books.materials.paid)}</td>
                    <td className="num">{rwf(books.fees.unpaid + books.materials.unpaid)}</td>
                  </tr>
                </tfoot>
              </table>
              <table className="doc-table fee-paper">
                <caption>{t("Another income")}</caption>
                <thead>
                  <tr>
                    <th>{t("Account")}</th>
                    <th className="num">{t("Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t("Another income")}</td>
                    <td className="num">{rwf(books.other)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="doc-table fee-paper">
                <caption>{t("Expenses")}</caption>
                <thead>
                  <tr>
                    <th>{t("Account")}</th>
                    <th className="num">{t("Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t("Expenses")}</td>
                    <td className="num">{rwf(books.expenses)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="chart-card">
            <table className="doc-table fee-paper">
              <caption>{t("My messages")}</caption>
              <thead>
                <tr>
                  <th>{t("Date")}</th>
                  <th>{t("The message")}</th>
                  <th className="num">{t("Parents")}</th>
                  <th>{t("Sent or unsent")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id}>
                    <td>{sentOn(item.createdAt)}</td>
                    <td>{item.message}</td>
                    <td className="num">{item.recipients}</td>
                    <td><span className={item.state === "unsent" ? "msg-state is-unsent" : "msg-state is-sent"}>{t(item.state === "unsent" ? "Unsent" : "Sent")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recent.length ? null : <p className="muted hint-line"><Icon name="info" /> {t("No messages in this filter.")}</p>}
          </section>
        </>
      ) : null}
      {printOpen && data ? (
        <ReportPrint school={school} title={heading} note={t("Sent left the school. Unsent stayed here because the gateway refused the message. Times follow Africa/Kigali.")} onClose={() => setPrintOpen(false)}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t("Message type")}</th>
                <th>{t("Sent")}</th>
                <th>{t("Unsent")}</th>
                <th>{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {mix.map((item) => (
                <tr key={item.id}>
                  <td>{t(item.label)}</td>
                  <td className="num">{item.sent}</td>
                  <td className="num">{item.unsent}</td>
                  <td className="num">{item.sent + item.unsent}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t("Date")}</th>
                <th>{t("The message")}</th>
                <th>{t("Parents")}</th>
                <th>{t("Sent or unsent")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id}>
                  <td>{sentOn(item.createdAt)}</td>
                  <td>{item.message}</td>
                  <td className="num">{item.recipients}</td>
                  <td>{t(item.state === "unsent" ? "Unsent" : "Sent")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportPrint>
      ) : null}
    </div>
  );
}
