import { t } from "./i18n.js";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Icon } from "./icons.jsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const PERIODS = [
  { id: "day", label: "Today", icon: "clock" },
  { id: "week", label: "This week", icon: "calendar" },
  { id: "month", label: "Month", icon: "calendar" },
  { id: "year", label: "Year", icon: "chart" },
];

const BILLING = [
  { id: "all", label: "All messages", icon: "message" },
  { id: "paid", label: "Paid", icon: "check" },
  { id: "unpaid", label: "Unpaid", icon: "alert" },
];

const CATEGORIES = [
  { id: "marks", label: "Marks", color: "#1565C0", icon: "pen" },
  { id: "results", label: "Term results", color: "#2E7D32", icon: "award" },
  { id: "discipline", label: "Discipline", color: "#E65100", icon: "scale" },
  { id: "notice", label: "School notice", color: "#6A1B9A", icon: "megaphone" },
];

function kigaliNow() {
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit" }).format(new Date());
  const [year, month] = stamp.split("-").map(Number);
  return { year, month };
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function PieChart({ slices, hole, label }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let cursor = 0;
  const parts = slices.filter((slice) => slice.value > 0);
  const gradient = parts.length
    ? `conic-gradient(${parts.map((slice) => {
        const start = cursor;
        cursor += (slice.value / total) * 360;
        return `${slice.color} ${start}deg ${cursor}deg`;
      }).join(", ")})`
    : "conic-gradient(#e6ebf1 0deg 360deg)";
  return (
    <div className={hole ? "pie pie-donut" : "pie"} style={{ background: gradient }} role="img" aria-label={label}>
      {hole ? (
        <div className="pie-hole">
          <strong>{total}</strong>
          <span>{t("total")}</span>
        </div>
      ) : null}
    </div>
  );
}

function chartPoints(series, width, height) {
  const pad = { l: 8, r: 36, t: 18, b: 28 };
  const values = series.map((point) => point.messages);
  const max = Math.max(1, ...values);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const coords = values.map((value, index) => [
    pad.l + (values.length === 1 ? innerW / 2 : index * step),
    pad.t + innerH - (value / max) * innerH,
  ]);
  return { pad, max, innerH, coords, width, height };
}

function PlotGuides({ width, height, pad }) {
  const innerH = height - pad.t - pad.b;
  return [0.5, 1].map((mark) => {
    const y = pad.t + innerH * (1 - mark);
    return <line key={mark} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="#d6e6f5" strokeWidth="1" />;
  });
}

function AreaGraph({ series, tone = "strong" }) {
  const width = 420;
  const height = 188;
  const drawn = series.length ? series : [{ label: "", messages: 0 }];
  const { pad, max, coords } = chartPoints(drawn, width, height);
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  const base = height - pad.b;
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${base} L${coords[0][0].toFixed(1)},${base} Z`;
  const stroke = "#0D47A1";
  const fill = tone === "soft" ? "rgba(79,195,247,0.55)" : "rgba(21,101,192,0.28)";
  return (
    <svg className="studio-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Messages over time")}>
      <PlotGuides width={width} height={height} pad={pad} />
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {drawn.length <= 16 ? coords.map((point, index) => (
        drawn[index].messages ? <circle key={drawn[index].bucket || index} cx={point[0]} cy={point[1]} r="4" fill="#ffffff" stroke="#0D47A1" strokeWidth="2.4" /> : null
      )) : null}
      <text x={width - 6} y="14" textAnchor="end" className="studio-axis">{max}</text>
      <text x={pad.l} y={height - 8} className="studio-axis">{drawn[0]?.label || ""}</text>
      <text x={width - pad.r} y={height - 8} textAnchor="end" className="studio-axis">{drawn[drawn.length - 1]?.label || ""}</text>
    </svg>
  );
}

function LineGraph({ series }) {
  const width = 360;
  const height = 188;
  const drawn = series.length ? series : [{ label: "", messages: 0 }];
  const { pad, max, coords } = chartPoints(drawn, width, height);
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  return (
    <svg className="studio-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Message line")}>
      <PlotGuides width={width} height={height} pad={pad} />
      <path d={line} fill="none" stroke="#1565C0" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {drawn.length <= 16 ? coords.map((point, index) => (
        <circle key={drawn[index].bucket || index} cx={point[0]} cy={point[1]} r={drawn[index].messages ? 4.5 : 2.5} fill={drawn[index].messages ? "#1565C0" : "#d6e6f5"} stroke="#ffffff" strokeWidth="1.5" />
      )) : null}
      <text x={width - 6} y="14" textAnchor="end" className="studio-axis">{max}</text>
      <text x={pad.l} y={height - 8} className="studio-axis">{drawn[0]?.label || ""}</text>
      <text x={width - pad.r} y={height - 8} textAnchor="end" className="studio-axis">{drawn[drawn.length - 1]?.label || ""}</text>
    </svg>
  );
}

function Gauge({ value }) {
  const percentValue = Math.max(0, Math.min(100, value));
  const cx = 120;
  const cy = 112;
  const radius = 84;
  const point = (share) => {
    const angle = Math.PI - Math.min(share, 99.7) / 100 * Math.PI;
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
  };
  const [trackX, trackY] = point(100);
  const [endX, endY] = point(percentValue);
  const arc = percentValue
    ? `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`
    : "";
  return (
    <div className="studio-gauge-wrap">
      <svg className="studio-gauge" viewBox="0 0 240 132" role="img" aria-label={`Paid ${percentValue} percent`}>
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${trackX.toFixed(2)} ${trackY.toFixed(2)}`} fill="none" stroke="#d6e6f5" strokeWidth="22" strokeLinecap="round" />
        {arc ? <path d={arc} fill="none" stroke="#1565C0" strokeWidth="22" strokeLinecap="round" /> : null}
      </svg>
      <strong>{percentValue}%</strong>
      <span>{t("Paid")}</span>
    </div>
  );
}

function BarGraph({ series }) {
  const rows = series.length ? series : [{ bucket: "0", label: "", messages: 0 }];
  const max = Math.max(1, ...rows.map((point) => point.messages));
  return (
    <div className="studio-bars-row" aria-label={t("Messages by period")}>
      {rows.map((point) => {
        const height = point.messages ? Math.max(8, Math.round((point.messages / max) * 112)) : 0;
        return (
          <div className="studio-bar" key={point.bucket} title={`${point.label}: ${point.messages} messages`}>
            <span>{point.messages || ""}</span>
            <i style={{ height }} />
            <em>{point.label}</em>
          </div>
        );
      })}
    </div>
  );
}

function cumulativeSeries(series) {
  let running = 0;
  return series.map((point) => {
    running += point.messages;
    return { ...point, messages: running };
  });
}

function Columns({ series }) {
  const max = Math.max(1, ...series.map((point) => point.messages));
  return (
    <div className="columns scroll-columns" aria-label={t("Messages over the selected period")}>
      {series.map((point) => {
        const height = point.messages ? Math.max(8, Math.round((point.messages / max) * 150)) : 0;
        return (
          <div className="column" key={point.bucket} title={`${point.label}: ${point.messages} messages`}>
            <span className="column-value">{point.messages || ""}</span>
            <span className="column-plot">
              <span className="column-fill" style={{ height: `${height}px` }} />
            </span>
            <span className="column-label">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShareRows({ rows }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <p className="muted hint-line"><Icon name="info" /> {t("No share to chart in this filter.")}</p>;
  return (
    <div className="share-list">
      {rows.map((row) => (
        <div className="share" key={row.id}>
          <span className="share-name" style={{ color: row.color }}><Icon name={row.icon} /> {row.label}</span>
          <span className="share-track"><i style={{ width: `${percent(row.value, total)}%`, background: row.color }} /></span>
          <strong>{percent(row.value, total)}%</strong>
          <em>{row.value}</em>
        </div>
      ))}
    </div>
  );
}

function roleIcon(role) {
  if (role === "teacher") return "graduate";
  if (role === "discipline") return "scale";
  if (role === "school_admin") return "school";
  return "people";
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

export function MessageAnalytics({ token, role }) {
  const today = useMemo(kigaliNow, []);
  const [period, setPeriod] = useState("month");
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [billing, setBilling] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const years = useMemo(() => Array.from({ length: today.year - 2023 }, (_, index) => 2024 + index), [today.year]);

  useEffect(() => {
    let alive = true;
    setError("");
    api(`/sms/analytics?period=${period}&billing=${billing}&year=${year}&month=${month}`, { token })
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message || t("Could not load message analytics"));
      });
    return () => {
      alive = false;
    };
  }, [token, period, billing, year, month]);

  const mine = role !== "school_admin";
  const totals = data?.totals || { messages: 0, paid: 0, unpaid: 0, shown: 0 };
  const series = data?.series || [];
  const categories = data?.categories || {};
  const people = data?.people || [];
  const categoryRows = CATEGORIES.map((item) => ({ ...item, value: categories[item.id] || 0 }));
  const billingRows = [
    { id: "paid", label: "Paid", value: totals.paid, color: "#1565C0", icon: "check" },
    { id: "unpaid", label: "Unpaid", value: totals.unpaid, color: "#C47B17", icon: "alert" },
  ];
  const peak = series.reduce((best, point) => (point.messages > (best?.messages || 0) ? point : best), null);
  const periodName = PERIODS.find((item) => item.id === period)?.label || "Month";
  const heading = period === "year" ? String(year) : period === "month" ? `${t(MONTHS[month - 1])} ${year}` : t(periodName);

  return (
    <div className="msg-dash">
      <section className="panel dash-intro msg-intro">
        <header className="assess-head">
          <span className="assess-mark"><Icon name="message" /></span>
          <div>
            <p className="kicker"><Icon name="chart" /> {t("Message analytics")}</p>
            <h2>{mine ? t("Your messages") : t("School messages")}</h2>
          </div>
          <MessagesGraphic />
        </header>
        <p className="muted">
            {mine
              ? "These are the messages you sent. A director sees the whole school."
              : "Every teacher, discipline officer and notice from this school."}
            {" "}Paid means the gateway accepted the message. Unpaid means it was refused and was not billed. Times follow Africa/Kigali.
        </p>
        <div className="msg-filters">
          <label>
            <span><Icon name="calendar" /> {t("Year")}</span>
            <select
              value={year}
              onChange={(event) => {
                setYear(Number(event.target.value));
                if (period === "day" || period === "week") setPeriod("year");
              }}
            >
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span><Icon name="calendar" /> {t("Month")}</span>
            <select
              value={month}
              onChange={(event) => {
                setMonth(Number(event.target.value));
                setPeriod("month");
              }}
            >
              {MONTHS.map((item, index) => <option key={item} value={index + 1}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="chips">
          {PERIODS.map((item) => (
            <button key={item.id} className={period === item.id ? "on" : ""} onClick={() => {
              setPeriod(item.id);
              if (item.id === "day" || item.id === "week") {
                setYear(today.year);
                setMonth(today.month);
              }
            }}>
              <Icon name={item.icon} /> {t(item.label)}
            </button>
          ))}
        </div>
        <div className="chips">
          {BILLING.map((item) => (
            <button key={item.id} className={billing === item.id ? "on" : ""} onClick={() => setBilling(item.id)}>
              <Icon name={item.icon} /> {t(item.label)}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="warn hint-line"><Icon name="alert" /> {error}</p> : null}
      {!data && !error ? (
        <div aria-hidden="true">
          <div className="kpi-grid">
            {[0, 1, 2, 3].map((item) => (
              <article key={item} className="kpi skel-card">
                <i className="skel skel-avatar" />
                <span className="skel-copy"><i className="skel short" /><i className="skel" /></span>
              </article>
            ))}
          </div>
          <div className="studio-graphs">
            {[0, 1, 2, 3].map((item) => <section key={item} className="studio-card"><div className="skel skel-stage" /></section>)}
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="kpi-grid">
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="filter" /></span>
              <div>
                <h2>{totals.shown}</h2>
                <p>{t("In this filter")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="message" /></span>
              <div>
                <h2>{totals.messages}</h2>
                <p>{t("All messages")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="wallet" /></span>
              <div>
                <h2>{totals.paid}</h2>
                <p>{t("Paid")}</p>
              </div>
            </article>
            <article className="kpi msg-kpi">
              <span className="assess-mark"><Icon name="alert" /></span>
              <div>
                <h2>{totals.unpaid}</h2>
                <p>{t("Unpaid")}</p>
              </div>
            </article>
          </div>

          <div className="studio-graphs">
            <section className="studio-card">
              <h3><Icon name="chart" /> {t("Messages graph")}</h3>
              <AreaGraph series={series} />
            </section>
            <section className="studio-card">
              <h3><Icon name="pie" /> {t("Paid gauge")}</h3>
              <Gauge value={percent(totals.paid, totals.paid + totals.unpaid)} />
            </section>
            <section className="studio-card">
              <h3><Icon name="chart" /> {t("Running total")}</h3>
              <AreaGraph series={cumulativeSeries(series)} tone="soft" />
            </section>
            <section className="studio-card">
              <h3><Icon name="chart" /> {t("Messages line")}</h3>
              <LineGraph series={series} />
            </section>
            <section className="studio-card studio-bars">
              <h3><Icon name="chart" /> Messages by {period === "day" ? "hour" : period === "year" ? "month" : "day"}</h3>
              <BarGraph series={series} />
              <p className="studio-legend"><i /> {t("Messages")}</p>
            </section>
          </div>

          <div className="analytics">
            <section className="chart-card">
              <h2 className="card-title"><Icon name="chart" /> {heading}</h2>
              <p className="muted">Column chart for {heading}. Each column is one {period === "day" ? "hour" : period === "year" ? "month" : "day"}.</p>
              {series.some((point) => point.messages) ? <Columns series={series} /> : <p className="muted hint-line"><Icon name="info" /> {t("No messages in this filter.")}</p>}
              {peak?.messages ? (
                <div className="insight-row">
                  <span><Icon name="bolt" /> Peak {peak.label}</span>
                  <strong>{peak.messages}</strong>
                  <span><Icon name="target" /> Average {series.length ? Math.round(totals.shown / series.length) : 0} per column</span>
                </div>
              ) : null}
            </section>
            <section className="chart-card">
              <h2 className="card-title"><Icon name="pie" /> {t("Paid and unpaid")}</h2>
              <div className="pie-wrap pie-stack">
                <PieChart slices={billingRows} hole label="Paid and unpaid pie" />
                <ShareRows rows={billingRows} />
              </div>
            </section>
          </div>

          <div className="analytics">
            <section className="chart-card">
              <h2 className="card-title"><Icon name="pie" /> {t("Categories")}</h2>
              <div className="pie-wrap pie-stack">
                <PieChart slices={categoryRows} label="Category pie" />
                <div className="legend">
                  {categoryRows.map((item) => (
                    <span key={item.id} style={{ color: item.color }}><i style={{ background: item.color }} /> <Icon name={item.icon} /> {t(item.label)} · {item.value}</span>
                  ))}
                </div>
              </div>
            </section>
            <section className="chart-card">
              <h2 className="card-title"><Icon name="target" /> {t("Share of messages")}</h2>
              <ShareRows rows={categoryRows} />
            </section>
          </div>

          {!mine ? (
            <section className="chart-card">
              <h2 className="card-title"><Icon name="people" /> {t("Who sent them")}</h2>
              {people.length ? people.map((person) => (
                <div className="school-bar" key={person.id || person.name}>
                  <div className="school-bar-head">
                    <strong><Icon name={roleIcon(person.role)} /> {person.name}</strong>
                    <span>{person.messages}</span>
                  </div>
                  <div className="stack" aria-label={`${person.name}: ${person.paid} paid, ${person.unpaid} unpaid`}>
                    <i style={{ flexGrow: person.paid || 0, background: "#1565C0", display: person.paid ? "block" : "none" }} />
                    <i style={{ flexGrow: person.unpaid || 0, background: "#C47B17", display: person.unpaid ? "block" : "none" }} />
                  </div>
                </div>
              )) : <p className="muted hint-line"><Icon name="people" /> {t("No staff messages in this filter.")}</p>}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
