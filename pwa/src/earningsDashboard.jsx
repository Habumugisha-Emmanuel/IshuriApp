import { t } from "./i18n.js";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api.js";
import { act, notify } from "./notice.js";
import "./earnings.css";

const PERIODS = [
  ["day", "Daily"],
  ["week", "Weekly"],
  ["month", "Monthly"],
  ["quarter", "Quarterly"],
  ["year", "Yearly"],
];

const SLICES = ["#0D47A1", "#1565C0", "#1E88E5", "#0288D1", "#4FC3F7", "#0277BD", "#90CAF9"];

function rwf(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "−" : "";
  return `${sign}RWF ${Math.abs(amount).toLocaleString("en-RW")}`;
}

function axisRwf(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(amount);
}

function todayInput() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tw:rounded-xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:px-3 tw:py-2 tw:shadow-lg">
      <p className="tw:text-xs tw:font-bold tw:text-[#5b7390]">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="tw:text-sm tw:font-bold" style={{ color: item.color || "#0D47A1" }}>
          {item.name}: {String(item.dataKey).toLowerCase().includes("message") ? item.value : rwf(item.value)}
        </p>
      ))}
    </div>
  );
}

function Spark({ data, dataKey, color }) {
  const points = data.length > 1 ? data : data.length ? [data[0], data[0]] : [];
  if (!points.length) return <div className="tw:h-10" />;
  return (
    <div className="tw:h-10 tw:w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points}>
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} dot={false} isAnimationActive animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Delta({ current, previous, format = rwf }) {
  const diff = (current || 0) - (previous || 0);
  const pct = previous ? Math.round((diff / Math.abs(previous)) * 100) : null;
  const up = diff >= 0;
  return (
    <p className={`tw:text-xs tw:font-bold ${up ? "tw:text-[#1565C0]" : "tw:text-[#8a5a00]"}`}>
      {up ? t("Up") : t("Down")} {format(Math.abs(diff))}{pct == null ? "" : ` · ${Math.abs(pct)}%`} {t("vs previous")}
    </p>
  );
}

function Kpi({ label, value, hint, data, dataKey, color }) {
  return (
    <article className="tw:rounded-2xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)]">
      <p className="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wide tw:text-[#5b7390]">{t(label)}</p>
      <p className="tw:mt-1 tw:text-xl tw:font-bold tw:tracking-tight tw:text-[#0a2540]">{value}</p>
      <Spark data={data} dataKey={dataKey} color={color} />
      {hint}
    </article>
  );
}

export function EarningsDashboard({ token }) {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [custom, setCustom] = useState(false);
  const [report, setReport] = useState(null);
  const [cost, setCost] = useState({ kind: "gateway", amountRwf: "", spentAt: todayInput(), note: "" });

  function query() {
    return custom && from && to ? `period=${period}&from=${from}&to=${to}` : `period=${period}`;
  }

  function load() {
    return api(`/admin/earnings?${query()}`, { token }).then((data) => {
      setReport(data);
      return data;
    });
  }

  useEffect(() => {
    let alive = true;
    api(`/admin/earnings?${query()}`, { token })
      .then((data) => { if (alive) setReport(data); })
      .catch((err) => notify(t("Not completed"), err.message, "bad"));
    return () => { alive = false; };
  }, [token, period, custom, from, to]);

  const series = report?.series || [];
  const daily = report?.daily || [];
  const bars = report?.grain === "hour" ? series : daily;
  const totals = report?.totals || {};
  const distribution = report?.distribution?.length ? report.distribution : [{ id: "none", name: "No delivered messages", revenueRwf: 1, messages: 0, empty: true }];

  function choosePeriod(id) {
    setPeriod(id);
    setCustom(false);
  }

  return (
    <section className="earn-dash tw:grid tw:min-w-0 tw:max-w-full tw:gap-4">
      <header className="tw:rounded-3xl tw:bg-gradient-to-br tw:from-[#0D47A1] tw:to-[#1565C0] tw:p-5 tw:text-white tw:shadow-[0_16px_40px_rgba(13,71,161,0.25)]">
        <p className="tw:text-xs tw:font-bold tw:uppercase tw:tracking-[0.16em] tw:text-[#4FC3F7]">{t("IshuriApp finance")}</p>
        <h2 className="tw:mt-1 tw:text-2xl tw:font-bold tw:tracking-tight">{t("Messaging earnings")}</h2>
        <p className="tw:mt-2 tw:max-w-3xl tw:text-sm tw:leading-6 tw:text-white/85">{t(report?.rule)}</p>
        <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-end tw:gap-3 tw:print:hidden">
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            {PERIODS.map(([id, label]) => (
              <button key={id} type="button" className={`tw:rounded-full tw:px-3 tw:py-2 tw:text-sm tw:font-bold ${period === id && !custom ? "tw:bg-white tw:text-[#0D47A1]" : "tw:bg-white/15 tw:text-white"}`} onClick={() => choosePeriod(id)}>{t(label)}</button>
            ))}
          </div>
          <label className="tw:grid tw:gap-1 tw:text-xs tw:font-bold">{t("From")}
            <input className="tw:min-h-11 tw:rounded-xl tw:border-0 tw:bg-white tw:px-3 tw:text-base tw:text-[#0a2540]" type="date" value={custom ? from : report?.fromDate || ""} onChange={(event) => { setFrom(event.target.value); setTo((current) => current || report?.toDate || event.target.value); setCustom(true); }} />
          </label>
          <label className="tw:grid tw:gap-1 tw:text-xs tw:font-bold">{t("To")}
            <input className="tw:min-h-11 tw:rounded-xl tw:border-0 tw:bg-white tw:px-3 tw:text-base tw:text-[#0a2540]" type="date" value={custom ? to : report?.toDate || ""} onChange={(event) => { setTo(event.target.value); setFrom((current) => current || report?.fromDate || event.target.value); setCustom(true); }} />
          </label>
          <button className="tw:min-h-11 tw:rounded-xl tw:bg-white tw:px-4 tw:text-sm tw:font-bold tw:text-[#0D47A1]" type="button" onClick={() => window.print()}>{t("Print PDF")}</button>
        </div>
      </header>

      <div className="tw:grid tw:grid-cols-2 tw:gap-3 tw:md:grid-cols-3 tw:xl:grid-cols-6">
        <Kpi label="Total revenue" value={rwf(totals.revenueRwf)} data={series} dataKey="cumulativeRevenueRwf" color="#1565C0" hint={<Delta current={totals.revenueRwf} previous={totals.previousRevenueRwf} />} />
        <Kpi label="Successful messages" value={totals.messages || 0} data={series} dataKey="messages" color="#0D47A1" hint={<Delta current={totals.messages} previous={totals.previousMessages} format={(value) => String(value)} />} />
        <Kpi label="Today's earnings" value={rwf(totals.todayEarningsRwf)} data={daily} dataKey="revenueRwf" color="#4FC3F7" hint={<p className="tw:text-xs tw:font-bold tw:text-[#5b7390]">{t("{count} delivered today", { count: totals.todayMessages || 0 })}</p>} />
        <Kpi label="Average daily earnings" value={rwf(totals.averageDailyEarningsRwf)} data={daily} dataKey="revenueRwf" color="#0288D1" hint={<p className="tw:text-xs tw:font-bold tw:text-[#5b7390]">{t("Across this period")}</p>} />
        <Kpi label="Total expenses" value={rwf(totals.expensesRwf)} data={daily} dataKey="expensesRwf" color="#0277BD" hint={<p className="tw:text-xs tw:font-bold tw:text-[#5b7390]">{t("Gateway")} {rwf(totals.gatewayRwf)} · {t("Operating")} {rwf(totals.operatingRwf)}</p>} />
        <Kpi label="Net profit" value={rwf(totals.netProfitRwf)} data={daily} dataKey="netProfitRwf" color="#0D47A1" hint={<Delta current={totals.netProfitRwf} previous={totals.previousNetProfitRwf} />} />
      </div>

        <article className="tw:overflow-hidden tw:rounded-3xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)]">
          <h3 className="tw:text-lg tw:font-bold">{t("Cumulative earnings trend")}</h3>
        <p className="tw:text-sm tw:text-[#5b7390]">{t("Delivered messages × 5 RWF, added up through the period.")}</p>
        <div className="tw:mt-3 tw:h-80 tw:w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4FC3F7" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#1565C0" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e3f2fd" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#5b7390", fontSize: 11 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisRwf} tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<MoneyTip />} />
              <Area type="monotone" name="Cumulative earnings" dataKey="cumulativeRevenueRwf" stroke="#0D47A1" strokeWidth={3} fill="url(#earnFill)" isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      <div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:xl:grid-cols-2">
        <article className="tw:rounded-3xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)]">
          <h3 className="tw:text-lg tw:font-bold">{report?.grain === "hour" ? "Earnings by hour" : "Daily earnings"}</h3>
          <div className="tw:mt-3 tw:h-64 tw:w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars}>
                <CartesianGrid stroke="#e3f2fd" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5b7390", fontSize: 11 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={axisRwf} tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<MoneyTip />} />
                <Bar name="Earnings" dataKey="revenueRwf" fill="#1565C0" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="tw:rounded-3xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)]">
          <h3 className="tw:text-lg tw:font-bold">{t("Successful messages")}</h3>
          <div className="tw:mt-3 tw:h-64 tw:w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="#e3f2fd" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5b7390", fontSize: 11 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#5b7390", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<MoneyTip />} />
                <Line type="monotone" name="Messages" dataKey="messages" stroke="#4FC3F7" strokeWidth={3} dot={{ r: 3, fill: "#0D47A1" }} isAnimationActive animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:xl:grid-cols-2">
        <article className="tw:rounded-3xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)]">
          <h3 className="tw:text-lg tw:font-bold">{t("Revenue distribution")}</h3>
          <p className="tw:text-sm tw:text-[#5b7390]">{t("Share of delivered-message revenue by school.")}</p>
          <div className="tw:mt-2 tw:h-64 tw:w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="revenueRwf" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} isAnimationActive animationDuration={800}>
                  {distribution.map((row, index) => <Cell key={row.id} fill={row.empty ? "#e3f2fd" : SLICES[index % SLICES.length]} />)}
                </Pie>
                <Tooltip content={<MoneyTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="tw:grid tw:gap-2">
            {distribution.filter((row) => !row.empty).map((row, index) => (
              <li key={row.id} className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:text-sm tw:font-bold">
                <span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2"><i className="tw:h-2.5 tw:w-2.5 tw:rounded-full" style={{ background: SLICES[index % SLICES.length] }} /> <span className="tw:truncate">{row.name}</span></span>
                <span>{rwf(row.revenueRwf)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="tw:rounded-3xl tw:border tw:border-[#d6e6f5] tw:bg-white tw:p-4 tw:shadow-[0_8px_24px_rgba(13,71,161,0.06)] tw:print:hidden">
          <h3 className="tw:text-lg tw:font-bold">{t("Gateway and operating costs")}</h3>
          <p className="tw:text-sm tw:text-[#5b7390]">{t("Net profit uses these recorded costs. SMS credit purchases already in the ledger are included as gateway cost.")}</p>
          <form className="tw:mt-3 tw:grid tw:gap-3 tw:sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            if (cost.amountRwf === "" || Number(cost.amountRwf) < 0) return notify("Cost", t("Enter the cost in Rwandan francs."), "bad");
            if (!cost.spentAt) return notify("Date", t("Enter the date of this cost."), "bad");
            act(async () => {
              await api("/admin/operating-costs", { method: "POST", token, body: { ...cost, amountRwf: Number(cost.amountRwf) } });
              setCost({ kind: cost.kind, amountRwf: "", spentAt: cost.spentAt, note: "" });
              await load();
            }, t("Cost recorded"), t("Net profit now includes it."));
          }}>
            <label className="tw:grid tw:gap-1 tw:text-sm tw:font-bold">Kind
              <select className="tw:min-h-11 tw:rounded-xl tw:border tw:border-[#d6e6f5] tw:px-3 tw:text-base" value={cost.kind} onChange={(event) => setCost({ ...cost, kind: event.target.value })}>
                <option value="gateway">{t("SMS gateway")}</option>
                <option value="operating">{t("Operating")}</option>
              </select>
            </label>
            <label className="tw:grid tw:gap-1 tw:text-sm tw:font-bold">Amount (RWF)
              <input className="tw:min-h-11 tw:rounded-xl tw:border tw:border-[#d6e6f5] tw:px-3 tw:text-base" type="number" min="0" value={cost.amountRwf} onChange={(event) => setCost({ ...cost, amountRwf: event.target.value })} />
            </label>
            <label className="tw:grid tw:gap-1 tw:text-sm tw:font-bold">Date
              <input className="tw:min-h-11 tw:rounded-xl tw:border tw:border-[#d6e6f5] tw:px-3 tw:text-base" type="date" value={cost.spentAt} onChange={(event) => setCost({ ...cost, spentAt: event.target.value })} />
            </label>
            <label className="tw:grid tw:gap-1 tw:text-sm tw:font-bold">Note
              <input className="tw:min-h-11 tw:rounded-xl tw:border tw:border-[#d6e6f5] tw:px-3 tw:text-base" value={cost.note} placeholder={t("Airtime purchase, airtime bundle")} onChange={(event) => setCost({ ...cost, note: event.target.value })} />
            </label>
            <button className="tw:min-h-11 tw:rounded-xl tw:bg-[#0D47A1] tw:px-4 tw:font-bold tw:text-white tw:sm:col-span-2" type="submit">{t("Record cost")}</button>
          </form>
          <ul className="tw:mt-4 tw:grid tw:gap-2">
            {(report?.costs || []).map((item) => (
              <li key={item._id} className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-xl tw:bg-[#f4f8fc] tw:px-3 tw:py-2 tw:text-sm">
                <span className="tw:min-w-0"><strong className="tw:capitalize">{item.kind}</strong> · {rwf(item.amountRwf)}{item.note ? ` · ${item.note}` : ""}</span>
                <button className="tw:font-bold tw:text-[#8a5a00]" type="button" onClick={() => act(async () => { await api(`/admin/operating-costs/${item._id}`, { method: "DELETE", token }); await load(); }, "Cost removed", "It is no longer in this period.")}>{t("Remove")}</button>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
