import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import { act, notify } from "./notice.js";
import { APP_LOGO } from "./officialReport.jsx";
import { BooksMore } from "./booksMore.jsx";
import { localPhone, takePhone } from "./phone.js";

const RISKS = [
  { id: "", label: "All" },
  { id: "normal", label: "Normal" },
  { id: "medium", label: "Medium" },
  { id: "at_risk", label: "At risk" },
];
const STATUSES = [
  { id: "", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "partial", label: "Part paid" },
  { id: "unpaid", label: "Unpaid" },
];
const GROUPS = [
  ["Overview", [["home", "Dashboard", "home"]]],
  ["Sales", [
    ["invoices", "Invoices", "receipt"],
    ["estimates", "Estimates", "pen"],
    ["customers", "Customers", "people"],
    ["products", "Products and services", "book"],
  ]],
  ["Purchases", [
    ["expenses", "Expenses", "coins"],
    ["bills", "Bills", "landmark"],
    ["orders", "Purchase orders", "briefcase"],
    ["inventory", "Inventory", "building"],
  ]],
  ["Accounting", [
    ["banking", "Banking", "wallet"],
    ["payroll", "Staff pay", "people"],
    ["budgets", "Budgets", "target"],
    ["accounts", "Chart of accounts", "book"],
    ["reports", "Reports", "chart"],
  ]],
];
const VIEWS = GROUPS.flatMap(([, items]) => items);
export const BOOK_LINKS = VIEWS.filter(([id]) => id !== "home");
const SPANS = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function rwf(value) {
  return `${new Intl.NumberFormat("en-RW").format(Number(value) || 0)} RWF`;
}

function download(filename, mime, text) {
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

function BooksPreview({ school, rows, periodLabel, totals, onClose }) {
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
    <div className="doc-preview is-landscape" role="dialog" aria-modal="true" aria-label={t("School fee report")}>
      <div className="doc-toolbar no-print">
        <strong>{t("School fee report")}</strong>
        <button className="solid" type="button" onClick={() => window.print()}>{t("Print / Save PDF")}</button>
        <button className="ghost" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="doc-sheet">
        <article className="doc-student">
          <header className="doc-head">
            <div className="logo-slot">
              <img src={APP_LOGO} alt={t("IshuriApp")} />
              <span>{t("IshuriApp")}</span>
            </div>
            <div className="doc-identity">
              <p className="doc-kicker">{t("Accountant portal")}</p>
              <h1>{t("School fee report")}</h1>
              <p className="doc-school">{school?.name}</p>
              <p className="doc-place">{periodLabel}</p>
            </div>
            <div className="logo-slot"><span>{school?.name || t("School")}</span></div>
          </header>
          <section className="doc-cards">
            <article><span>{t("Billed")}</span><strong>{rwf(totals.billed)}</strong></article>
            <article><span>{t("Collected")}</span><strong>{rwf(totals.collected)}</strong></article>
            <article><span>{t("Still unpaid")}</span><strong>{rwf(totals.unpaid)}</strong></article>
            <article><span>{t("Net")}</span><strong>{rwf(totals.net)}</strong></article>
          </section>
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t("Student")}</th>
                <th>{t("Class")}</th>
                <th>{t("Risk")}</th>
                <th className="num">{t("Amount due")}</th>
                <th className="num">{t("Amount paid")}</th>
                <th className="num">{t("Still unpaid")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => (
                <tr key={student.id}>
                  <td>{student.name}</td>
                  <td>{student.className}</td>
                  <td>{t(student.risk === "at_risk" ? "At risk" : student.risk === "medium" ? "Medium" : "Normal")}</td>
                  <td className="num">{rwf(student.billed)}</td>
                  <td className="num">{rwf(student.paid)}</td>
                  <td className="num">{rwf(student.unpaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </div>,
    document.body
  );
}

export function Books({ token, school, viewId = "home" }) {
  const today = todayKey();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(true);
  const [book, setBook] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classStudents, setClassStudents] = useState([]);
  const [wallet, setWallet] = useState("");
  const [period, setPeriod] = useState("month");
  const [on, setOn] = useState(today);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [classRoom, setClassRoom] = useState("");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [below, setBelow] = useState("");
  const [materials, setMaterials] = useState([]);
  const [charge, setCharge] = useState({ classRoom: "", studentId: "", accountId: "", amountDue: "", dueOn: today, span: "month" });
  const [cash, setCash] = useState({ kind: "expense", title: "", accountName: "", amount: "", occurredOn: today });
  const [accountName, setAccountName] = useState("");
  const [accountGroup, setAccountGroup] = useState("material");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [payAmounts, setPayAmounts] = useState({});
  const [tick, setTick] = useState(0);
  const [view, setView] = useState(viewId || "home");
  useEffect(() => { setView(viewId || "home"); }, [viewId]);
  const [desk, setDesk] = useState(null);
  const [vendor, setVendor] = useState({ name: "", phone: "" });
  const [vendorSubmitted, setVendorSubmitted] = useState(false);
  const [bill, setBill] = useState({ vendorId: "", accountId: "", amount: "", tax: "", dueOn: today });
  const [billPay, setBillPay] = useState({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (period === "day" || period === "week") params.set("on", on);
    if (period === "month" || period === "year") params.set("year", String(year));
    if (period === "month") params.set("month", String(month));
    if (classRoom) params.set("classRoom", classRoom);
    if (status) params.set("status", status);
    if (risk) params.set("risk", risk);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (below) params.set("below", below);
    if (materials.length) params.set("items", materials.join(","));
    return params.toString();
  }, [period, on, year, month, classRoom, status, risk, min, max, below, materials]);

  const dashQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (period === "day" || period === "week") params.set("on", on);
    if (period === "month" || period === "year") params.set("year", String(year));
    if (period === "month") params.set("month", String(month));
    return params.toString();
  }, [period, on, year, month]);

  function loadClasses() {
    api("/academics/classes", { token }).then((data) => setClasses(data.items || [])).catch(() => setClasses([]));
    api("/sms/wallet", { token }).then((data) => setWallet(data.wallet?.message || "")).catch(() => setWallet(""));
  }

  useEffect(() => { loadClasses(); }, [token]);

  useEffect(() => {
    let cancel = false;
    setPending(true);
    api(`/accounts/summary?${query}`, { token })
      .then((data) => { if (!cancel) setBook(data); })
      .catch((err) => { if (!cancel) notify(t("Not completed"), err.message, "bad"); })
      .finally(() => { if (!cancel) { setPending(false); setReady(true); } });
    return () => { cancel = true; };
  }, [token, query, tick]);

  useEffect(() => {
    let cancel = false;
    api(`/accounts/dashboard?${dashQuery}`, { token })
      .then((data) => { if (!cancel) setDesk(data); })
      .catch((err) => { if (!cancel) notify(t("Not completed"), err.message, "bad"); });
    return () => { cancel = true; };
  }, [token, dashQuery, tick]);

  useEffect(() => {
    if (!charge.classRoom) { setClassStudents([]); return undefined; }
    let cancel = false;
    api(`/students?classRoom=${charge.classRoom}`, { token })
      .then((data) => { if (!cancel) setClassStudents(data.items || []); })
      .catch(() => { if (!cancel) setClassStudents([]); });
    return () => { cancel = true; };
  }, [token, charge.classRoom]);

  const students = book?.students || [];
  const totals = book?.totals || { billed: 0, collected: 0, unpaid: 0, expenses: 0, otherIncome: 0, net: 0 };
  const profit = desk?.profit || { income: 0, otherIncome: 0, expenses: 0, net: 0, incomeLines: [], otherLines: [], expenseLines: [] };
  const balance = desk?.balance || { cash: 0, receivable: 0, payable: 0, equity: 0, assets: 0, liabilitiesEquity: 0 };
  const aging = desk?.aging || { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const agingMax = Math.max(1, aging.current, aging.d30, aging.d60, aging.d90, aging.over90);
  const payAging = desk?.payableAging || { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  const payMax = Math.max(1, payAging.current, payAging.d30, payAging.d60, payAging.d90, payAging.over90);
  const periodLabel = `${t(period === "day" ? "Day" : period === "week" ? "Week" : period === "year" ? "Year" : "Month")} · ${book?.from ? new Date(book.from).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kigali" }) : ""}`;

  function remindBody() {
    return {
      message,
      period,
      year,
      month,
      on,
      classRoom,
      status,
      risk,
      min,
      max,
      below,
      items: materials,
    };
  }

  function exportRows() {
    const header = [t("Student"), t("Class"), t("Risk"), t("Amount due"), t("Amount paid"), t("Still unpaid")];
    const lines = students.map((student) => [
      student.name,
      student.className,
      t(student.risk === "at_risk" ? "At risk" : student.risk === "medium" ? "Medium" : "Normal"),
      student.billed,
      student.paid,
      student.unpaid,
    ]);
    return { header, lines };
  }

  function saveExcel() {
    const { header, lines } = exportRows();
    const csv = [`\uFEFF${header.map(csvCell).join(",")}`, ...lines.map((line) => line.map(csvCell).join(","))].join("\n");
    download(`ishuriapp-fees-${today}.csv`, "text/csv;charset=utf-8", csv);
  }

  function saveWord() {
    const { header, lines } = exportRows();
    const table = `<table border="1" cellspacing="0" cellpadding="6"><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr>${lines.map((line) => `<tr>${line.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${t("School fee report")}</title></head><body><h1>${school?.name || "IshuriApp"}</h1><p>${periodLabel}</p><p>${t("Billed")} ${rwf(totals.billed)} · ${t("Collected")} ${rwf(totals.collected)} · ${t("Still unpaid")} ${rwf(totals.unpaid)}</p>${table}</body></html>`;
    download(`ishuriapp-fees-${today}.doc`, "application/msword", html);
  }

  async function saveCharge(event) {
    event.preventDefault();
    const ok = await act(() => api("/accounts/charges", { method: "POST", token, body: charge }), t("Save charge"), t("The amount due is on the books."));
    if (ok) {
      setCharge((current) => ({ ...current, amountDue: "" }));
      setTick((value) => value + 1);
    }
  }

  async function saveCash(event) {
    event.preventDefault();
    const ok = await act(() => api("/accounts/cash", { method: "POST", token, body: cash }), t("Save entry"), t("The books now include this amount."));
    if (ok) {
      setCash((current) => ({ ...current, title: "", amount: "" }));
      setTick((value) => value + 1);
    }
  }

  async function pay(chargeId) {
    const amount = payAmounts[chargeId];
    const ok = await act(() => api(`/accounts/charges/${chargeId}/pay`, { method: "POST", token, body: { amount, paidOn: today } }), t("Save payment"), t("The paid amount is recorded."));
    if (ok) {
      setPayAmounts((current) => ({ ...current, [chargeId]: "" }));
      setTick((value) => value + 1);
    }
  }

  async function sendReminder(event) {
    event.preventDefault();
    if (!message.trim()) return notify(t("Not completed"), t("Write the message first."), "bad");
    if (message.trim().length > 160) return notify(t("Not completed"), t("Keep the message under 160 characters."), "bad");
    const sent = await act(() => api("/accounts/remind", { method: "POST", token, body: remindBody() }));
    if (!sent) return;
    notify(t("Reminder sent"), sent.message);
    if (sent.skipped?.length) notify(t("Left out"), sent.skipped.map((item) => item.name).join(", "));
    if (sent.walletMessage) setWallet(sent.walletMessage);
  }

  const active = VIEWS.find(([id]) => id === view) || VIEWS[0];

  if (!ready) {
    return (
      <section className="books" aria-hidden="true">
        <div className="books-main">
          <div className="books-kpis">{[0, 1, 2, 3, 4, 5].map((item) => <i key={item} className="skel books-skel" />)}</div>
          <i className="skel books-skel chart" />
          <i className="skel books-skel row" />
        </div>
      </section>
    );
  }

  return (
    <section className={`books${pending ? " is-pending" : ""}`}>
      <div className="books-main">
      <header className="books-top">
        <div>
          <h2><Icon name={active[2]} />{t(active[1])}</h2>
          <p>{t("Record school fees, materials, income and expenses. See who has paid, who still owes, and send one reminder to the parents who match the filter.")}</p>
        </div>
        <div className="books-period">
          <div className="chips">
            {SPANS.map((item) => <button type="button" key={item.id} className={period === item.id ? "on" : ""} onClick={() => setPeriod(item.id)}>{t(item.label)}</button>)}
          </div>
          {period === "day" || period === "week" ? <label className="field">{t("Date")}<input type="date" value={on} onChange={(event) => setOn(event.target.value)} /></label> : null}
          {period === "month" || period === "year" ? <label className="field">{t("Year")}<input type="number" min="2020" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label> : null}
          {period === "month" ? <label className="field">{t("Month")}<input type="number" min="1" max="12" value={month} onChange={(event) => setMonth(Number(event.target.value))} /></label> : null}
        </div>
      </header>
      {wallet ? <p className="books-alert"><Icon name="wallet" />{t(wallet)}</p> : null}

      {view === "home" || view === "reports" ? (
        <>
          <div className="books-kpis">
            {[
              ["Income", profit.income + profit.otherIncome, "receipt"],
              ["Expenses", profit.expenses, "coins"],
              ["Net profit", profit.net, "chart"],
              ["Cash", balance.cash, "wallet"],
              ["Accounts receivable", balance.receivable, "people"],
              ["Accounts payable", balance.payable, "landmark"],
            ].map(([label, value, icon]) => (
              <article key={label} className="books-kpi">
                <span className="books-kpi-mark"><Icon name={icon} /></span>
                <span>{t(label)}</span>
                <strong>{rwf(value)}</strong>
              </article>
            ))}
          </div>
          <div className="books-board">
            <article className="chart-card books-chart">
              <h2><Icon name="chart" />{t("Cash flow")}</h2>
              <div className="books-plot">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={desk?.series || []}>
                    <CartesianGrid stroke="#e3ebf3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#5c738a", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#5c738a", fontSize: 12 }} />
                    <Tooltip formatter={(value) => rwf(value)} />
                    <Area type="monotone" dataKey="income" name={t("Income")} stroke="#0D47A1" fill="#90CAF9" fillOpacity={0.45} isAnimationActive animationDuration={700} />
                    <Area type="monotone" dataKey="expenses" name={t("Expenses")} stroke="#1565C0" fill="#e3f2fd" fillOpacity={0.9} isAnimationActive animationDuration={700} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="panel books-statement">
              <h2><Icon name="receipt" />{t("Profit and loss")}</h2>
              {[...profit.incomeLines, ...profit.otherLines].map((line) => (
                <p key={`in-${line.name}`}><span>{t(line.name)}</span><strong>{rwf(line.amount)}</strong></p>
              ))}
              {profit.expenseLines.map((line) => (
                <p key={`ex-${line.name}`}><span>{t(line.name)}</span><strong>- {rwf(line.amount)}</strong></p>
              ))}
              <p className="books-total"><span>{t("Net profit")}</span><strong>{rwf(profit.net)}</strong></p>
            </article>
          </div>
          <div className="books-board">
            <article className="panel">
              <h2><Icon name="clock" />{t("Accounts receivable")}</h2>
              {[
                ["Current", aging.current],
                ["1–30 days", aging.d30],
                ["31–60 days", aging.d60],
                ["61–90 days", aging.d90],
                ["Over 90 days", aging.over90],
              ].map(([label, value]) => (
                <div className="books-age" key={label}>
                  <span>{t(label)}</span>
                  <i><b style={{ width: `${Math.round((value / agingMax) * 100)}%` }} /></i>
                  <strong>{rwf(value)}</strong>
                </div>
              ))}
              <h2><Icon name="landmark" />{t("Accounts payable")}</h2>
              {[
                ["Current", payAging.current],
                ["1–30 days", payAging.d30],
                ["31–60 days", payAging.d60],
                ["61–90 days", payAging.d90],
                ["Over 90 days", payAging.over90],
              ].map(([label, value]) => (
                <div className="books-age" key={`ap-${label}`}>
                  <span>{t(label)}</span>
                  <i><b style={{ width: `${Math.round((value / (payMax || 1)) * 100)}%` }} /></i>
                  <strong>{rwf(value)}</strong>
                </div>
              ))}
            </article>
            <article className="panel">
              <h2><Icon name="scale" />{t("Balance sheet")}</h2>
              <p><span>{t("Cash")}</span><strong>{rwf(balance.cash)}</strong></p>
              <p><span>{t("Accounts receivable")}</span><strong>{rwf(balance.receivable)}</strong></p>
              <p className="books-total"><span>{t("Assets")}</span><strong>{rwf(balance.assets)}</strong></p>
              <p><span>{t("Accounts payable")}</span><strong>{rwf(balance.payable)}</strong></p>
              <p><span>{t("Retained earnings")}</span><strong>{rwf(balance.equity)}</strong></p>
              <p className="books-total"><span>{t("Liabilities and equity")}</span><strong>{rwf(balance.liabilitiesEquity)}</strong></p>
            </article>
          </div>
          {view === "home" ? (
            <div className="books-board">
              <article className="panel">
                <h2><Icon name="alert" />{t("Who owes the school")}</h2>
                {(desk?.debtors || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.debtors || []).map((student) => (
                  <p key={student.id}><span>{student.name}{student.className ? ` · ${student.className}` : ""}</span><strong>{rwf(student.unpaid)}</strong></p>
                ))}
              </article>
              <article className="panel">
                <h2><Icon name="calendar" />{t("Recent activity")}</h2>
                {(desk?.activity || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.activity || []).map((item) => (
                  <p key={item.id}><span>{t(item.kind === "invoice" ? "Invoice" : item.kind === "bill" ? "Bill" : item.kind === "other_income" ? "Other income" : "Expenses")} · {t(item.title)}</span><strong>{rwf(item.amount)}</strong></p>
                ))}
              </article>
            </div>
          ) : null}
          {(desk?.budgets || []).length ? (
            <article className="panel">
              <h2><Icon name="target" />{t("Budgets")}</h2>
              {(desk.budgets || []).map((item) => (
                <p key={item.id}><span>{t(item.accountName)} · {t("Actual")} {rwf(item.actual)}</span><strong>{rwf(item.amount)}</strong></p>
              ))}
            </article>
          ) : null}
          {view === "reports" ? (
            <article className="panel">
              <h2><Icon name="receipt" />{t("Sales tax")}</h2>
              <p><span>{t("Tax included in bills this period")}</span><strong>{rwf(desk?.tax || 0)}</strong></p>
            </article>
          ) : null}
        </>
      ) : null}

      {view === "customers" ? (
      <form className="panel books-filters" onSubmit={(event) => event.preventDefault()}>
        <label className="field">{t("Class")}
          <select value={classRoom} onChange={(event) => setClassRoom(event.target.value)}>
            <option value="">{t("All classes")}</option>
            {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
          </select>
        </label>
        <label className="field">{t("Status")}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((item) => <option key={item.id || "all"} value={item.id}>{t(item.label)}</option>)}
          </select>
        </label>
        <label className="field">{t("Risk")}
          <select value={risk} onChange={(event) => setRisk(event.target.value)}>
            {RISKS.map((item) => <option key={item.id || "all"} value={item.id}>{t(item.label)}</option>)}
          </select>
        </label>
        <label className="field">{t("Unpaid from (RWF)")}<input inputMode="numeric" value={min} onChange={(event) => setMin(event.target.value)} /></label>
        <label className="field">{t("Unpaid to (RWF)")}<input inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} /></label>
        <label className="field">{t("School fees paid below (RWF)")}<input inputMode="numeric" value={below} placeholder="70000" onChange={(event) => setBelow(event.target.value)} /></label>
        <p className="books-alert span"><Icon name="info" />{t("Parents who have already paid this amount or more do not receive the reminder.")}</p>
        <div className="span">
          <p className="kicker">{t("Still unpaid on")}</p>
          <div className="chips">
            {(book?.accounts || []).filter((item) => item.group === "material").map((item) => (
              <button type="button" key={item.id} className={materials.includes(item.id) ? "on" : ""} onClick={() => setMaterials((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
                {t(item.name)}
              </button>
            ))}
          </div>
        </div>
      </form>
      ) : null}

      {view === "invoices" || view === "expenses" ? (
      <div className="books-split">
        {view === "invoices" ? (
        <form className="panel form-grid" onSubmit={saveCharge}>
          <h2><Icon name="receipt" />{t("Record what is owed")}</h2>
          <label className="field">{t("Class")}
            <select value={charge.classRoom} onChange={(event) => setCharge({ ...charge, classRoom: event.target.value, studentId: "" })}>
              <option value="">{t("Choose a class")}</option>
              {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
            </select>
          </label>
          <label className="field">{t("Student")}
            <select value={charge.studentId} onChange={(event) => setCharge({ ...charge, studentId: event.target.value })}>
              <option value="">{t("All students in this class")}</option>
              {classStudents.map((student) => <option key={student._id} value={student._id}>{student.fullName}</option>)}
            </select>
          </label>
          <label className="field">{t("Fee line")}
            <select value={charge.accountId} onChange={(event) => setCharge({ ...charge, accountId: event.target.value })}>
              <option value="">{t("Choose a fee or material")}</option>
              {(book?.accounts || []).filter((item) => item.group === "fee" || item.group === "material").map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Amount due (RWF)")}<input inputMode="numeric" value={charge.amountDue} onChange={(event) => setCharge({ ...charge, amountDue: event.target.value })} /></label>
          <label className="field">{t("Due date")}<input type="date" value={charge.dueOn} onChange={(event) => setCharge({ ...charge, dueOn: event.target.value })} /></label>
          <label className="field">{t("Billing cycle")}
            <select value={charge.span} onChange={(event) => setCharge({ ...charge, span: event.target.value })}>
              {SPANS.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
            </select>
          </label>
          <div className="actions"><button className="solid" type="submit">{t("Save charge")}</button></div>
        </form>
        ) : (
        <form className="panel form-grid" onSubmit={saveCash}>
          <h2><Icon name="coins" />{t("Record school money")}</h2>
          <div className="chips span">
            <button type="button" className={cash.kind === "expense" ? "on" : ""} onClick={() => setCash({ ...cash, kind: "expense" })}>{t("Expenses")}</button>
            <button type="button" className={cash.kind === "other_income" ? "on" : ""} onClick={() => setCash({ ...cash, kind: "other_income" })}>{t("Other income")}</button>
          </div>
          {cash.kind === "expense" ? (
            <label className="field">{t("Expenses")}
              <select value={cash.accountName || ""} onChange={(event) => setCash({ ...cash, accountName: event.target.value, title: event.target.value || cash.title })}>
                <option value="">{t("Choose an expense account")}</option>
                {(desk?.accounts || []).filter((item) => item.kind === "expense").map((item) => <option key={item.id} value={item.name}>{t(item.name)}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field">{t("Entry title")}<input value={cash.title} onChange={(event) => setCash({ ...cash, title: event.target.value })} /></label>
          <label className="field">{t("Amount")}<input inputMode="numeric" value={cash.amount} onChange={(event) => setCash({ ...cash, amount: event.target.value })} /></label>
          <label className="field">{t("Date")}<input type="date" value={cash.occurredOn} onChange={(event) => setCash({ ...cash, occurredOn: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save entry")}</button></div>
          <ul className="books-entries span">
            {(book?.entries || []).map((entry) => (
              <li key={entry.id}>
                <span>{entry.kind === "expense" ? t("Expenses") : t("Other income")}</span>
                <strong>{entry.title}</strong>
                <em>{rwf(entry.amount)}</em>
                <button type="button" className="ghost" onClick={() => act(() => api(`/accounts/cash/${entry.id}`, { method: "DELETE", token }).then(() => setTick((value) => value + 1)), t("Remove"), t("The entry is off the books."))}>{t("Remove")}</button>
              </li>
            ))}
          </ul>
        </form>
        )}
      </div>
      ) : null}

      {view === "bills" ? (
        <div className="books-split">
          <form className="panel form-grid" onSubmit={(event) => {
            event.preventDefault();
            setVendorSubmitted(true);
            const phone = vendor.phone.trim() ? localPhone(vendor.phone) : "";
            if (vendor.phone.trim() && !phone) return notify(t("Not completed"), t("The phone number must be 10 digits and start with 07."), "bad");
            act(() => api("/accounts/vendors", { method: "POST", token, body: { ...vendor, phone } }).then(() => { setVendor({ name: "", phone: "" }); setTick((value) => value + 1); }), t("Supplier"), t("The supplier is on the books."));
          }}>
            <h2><Icon name="building" />{t("Supplier")}</h2>
            <label className="field">{t("Supplier name")}<input value={vendor.name} onChange={(event) => setVendor({ ...vendor, name: event.target.value })} /></label>
            <label className={`field${vendorSubmitted && vendor.phone && !localPhone(vendor.phone) ? " invalid" : ""}`}>{t("Phone")}<input aria-invalid={vendorSubmitted && vendor.phone && !localPhone(vendor.phone) ? true : undefined} value={vendor.phone} onChange={(event) => setVendor({ ...vendor, phone: takePhone(event.target.value) })} placeholder="0788000000" />{vendorSubmitted && vendor.phone && !localPhone(vendor.phone) ? <span className="field-error" role="alert"><Icon name="alert" />{t("The phone number must be 10 digits and start with 07.")}</span> : null}</label>
            <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
          </form>
          <form className="panel form-grid" onSubmit={(event) => {
            event.preventDefault();
            act(() => api("/accounts/bills", { method: "POST", token, body: bill }).then(() => { setBill((current) => ({ ...current, amount: "" })); setTick((value) => value + 1); }), t("Bill"), t("The bill is on the books."));
          }}>
            <h2><Icon name="landmark" />{t("Bill")}</h2>
            <label className="field">{t("Supplier")}
              <select value={bill.vendorId} onChange={(event) => setBill({ ...bill, vendorId: event.target.value })}>
                <option value="">{t("Choose a supplier")}</option>
                {(desk?.vendors || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field">{t("Expenses")}
              <select value={bill.accountId} onChange={(event) => setBill({ ...bill, accountId: event.target.value })}>
                <option value="">{t("Choose an expense account")}</option>
                {(desk?.accounts || []).filter((item) => item.kind === "expense").map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
              </select>
            </label>
            <label className="field">{t("Amount")}<input inputMode="numeric" value={bill.amount} onChange={(event) => setBill({ ...bill, amount: event.target.value })} /></label>
            <label className="field">{t("Sales tax")}<input inputMode="numeric" value={bill.tax} onChange={(event) => setBill({ ...bill, tax: event.target.value })} /></label>
            <label className="field">{t("Due date")}<input type="date" value={bill.dueOn} onChange={(event) => setBill({ ...bill, dueOn: event.target.value })} /></label>
            <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
          </form>
          <div className="panel span">
            <h2>{t("Accounts payable")}</h2>
            {(desk?.bills || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.bills || []).map((item) => (
              <div className="books-lines" key={item.id}>
                <div>
                  <span>{item.vendorName} · {t(item.accountName)} · {rwf(item.unpaid)}</span>
                  {item.unpaid > 0 ? (
                    <span className="books-pay">
                      <input inputMode="numeric" aria-label={t("Amount received (RWF)")} value={billPay[item.id] || ""} onChange={(event) => setBillPay((current) => ({ ...current, [item.id]: event.target.value }))} />
                      <button type="button" className="solid" onClick={() => act(() => api(`/accounts/bills/${item.id}/pay`, { method: "POST", token, body: { amount: billPay[item.id], paidOn: today } }).then(() => setTick((value) => value + 1)), t("Pay bill"), t("The paid amount is recorded."))}>{t("Pay bill")}</button>
                    </span>
                  ) : <span className="books-pill">{t("Paid")}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === "accounts" ? (
      <form className="panel books-account" onSubmit={(event) => {
        event.preventDefault();
        const kind = accountGroup === "fee" || accountGroup === "material" ? "income" : accountGroup;
        const group = kind === "income" ? (accountGroup === "fee" ? "fee" : "material") : "ledger";
        act(() => api("/accounts/accounts", { method: "POST", token, body: { name: accountName, group, kind } }).then(() => { setAccountName(""); setTick((value) => value + 1); }), t("Add an account"), t("The account is ready for new charges."));
      }}>
        <h2>{t("Chart of accounts")}</h2>
        <label className="field">{t("Account name")}<input value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label>
        <div className="chips">
          {["fee", "material", "expense", "asset", "liability"].map((item) => (
            <button type="button" key={item} className={accountGroup === item ? "on" : ""} onClick={() => setAccountGroup(item)}>{t(item === "fee" ? "Fee line" : item === "material" ? "Material" : item === "expense" ? "Expenses" : item === "asset" ? "Asset" : "Liability")}</button>
          ))}
        </div>
        <button className="ghost" type="submit">{t("Save")}</button>
        <div className="books-chart-list span">
          {["asset", "liability", "equity", "income", "expense"].map((kind) => (
            <section key={kind}>
              <p className="kicker">{t(kind === "asset" ? "Asset" : kind === "liability" ? "Liability" : kind === "equity" ? "Equity" : kind === "income" ? "Income" : "Expenses")}</p>
              {(desk?.accounts || []).filter((item) => item.kind === kind).map((item) => (
                <p key={item.id}><span>{item.code} · {t(item.name)}</span></p>
              ))}
            </section>
          ))}
        </div>
      </form>
      ) : null}

      {view === "customers" ? (
      <>
      <section className="panel">
        <div className="books-table-head">
          <h2><Icon name="people" />{t("Student balances")}</h2>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setPreview(true)}>{t("Print / Save PDF")}</button>
            <button type="button" className="ghost" onClick={saveExcel}>{t("Excel")}</button>
            <button type="button" className="ghost" onClick={saveWord}>{t("Word")}</button>
          </div>
        </div>
        <p className="muted">{t("Normal")} {book?.risks?.normal || 0} · {t("Medium")} {book?.risks?.medium || 0} · {t("At risk")} {book?.risks?.atRisk || 0}</p>
        {pending ? <i className="skel books-skel row" /> : students.length === 0 ? <p className="books-alert"><Icon name="info" />{t("No balances in this period.")}</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Student")}</th>
                  <th>{t("Class")}</th>
                  <th>{t("Risk")}</th>
                  <th>{t("Amount due")}</th>
                  <th>{t("Amount paid")}</th>
                  <th>{t("Still unpaid")}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <strong>{student.name}</strong>
                      <div className="books-lines">
                        {student.items.map((item) => (
                          <div key={item.chargeId}>
                            <span>{t(item.name)} · {rwf(item.unpaid)}</span>
                            {item.unpaid > 0 ? (
                              <span className="books-pay">
                                <input inputMode="numeric" aria-label={t("Amount received (RWF)")} value={payAmounts[item.chargeId] || ""} onChange={(event) => setPayAmounts((current) => ({ ...current, [item.chargeId]: event.target.value }))} />
                                <button type="button" className="solid" onClick={() => pay(item.chargeId)}>{t("Save payment")}</button>
                                <button type="button" className="ghost" onClick={() => act(() => api(`/accounts/charges/${item.chargeId}/credit`, { method: "POST", token, body: { amount: payAmounts[item.chargeId] } }).then(() => setTick((value) => value + 1)), t("Credit note"), t("The credit is on the books."))}>{t("Credit note")}</button>
                              </span>
                            ) : null}
                            {item.paid <= 0 ? <button type="button" className="ghost" onClick={() => act(() => api(`/accounts/charges/${item.chargeId}`, { method: "DELETE", token }).then(() => setTick((value) => value + 1)), t("Remove"), t("The charge is off the books."))}>{t("Remove")}</button> : null}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>{student.className}</td>
                    <td><span className={`books-pill ${student.risk}`}>{t(student.risk === "at_risk" ? "At risk" : student.risk === "medium" ? "Medium" : "Normal")}</span></td>
                    <td>{rwf(student.billed)}</td>
                    <td>{rwf(student.paid)}</td>
                    <td>{rwf(student.unpaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form className="panel books-remind" onSubmit={sendReminder}>
        <h2><Icon name="message" />{t("Send reminder")}</h2>
        <p>{t("Write one message. It goes to every parent who matches the filters.")}</p>
        <label className="field">
          {t("Send a message")}
          <textarea rows={4} maxLength={160} value={message} onChange={(event) => setMessage(event.target.value.slice(0, 160))} />
        </label>
        <p className="muted">{message.length}/160 · {t("A message stays within 160 characters.")}</p>
        <p className="muted">{students.length} {t("Student")}</p>
        <button className="solid" type="submit">{t("Send reminder")}</button>
      </form>
      </>
      ) : null}
      <BooksMore view={view} token={token} desk={desk} book={book} classes={classes} today={today} onReload={() => setTick((value) => value + 1)} />
      {preview ? <BooksPreview school={school} rows={students} periodLabel={periodLabel} totals={totals} onClose={() => setPreview(false)} /> : null}
      </div>
    </section>
  );
}
