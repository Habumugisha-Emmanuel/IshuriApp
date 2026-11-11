import { t } from "./i18n.js";
﻿import { useEffect, useState } from "react";
import { api } from "./api.js";
import { act, notify } from "./notice.js";
import { Icon } from "./icons.jsx";
import { EarningsDashboard } from "./earningsDashboard.jsx";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function money(value) {
  return `${Number(value || 0).toLocaleString("en-RW")} RWF`;
}

function when(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}


export function WalletBanner({ token, className = "" }) {
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    let alive = true;
    api("/sms/wallet", { token })
      .then((data) => {
        if (alive) setWallet(data.wallet);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  if (!wallet) return null;
  return (
    <p className={`${wallet.needsTopUp ? "wallet-alert" : "wallet-note"}${className ? ` ${className}` : ""}`}>
      <Icon name={wallet.needsTopUp ? "alert" : "wallet"} />
      {wallet.message}
    </p>
  );
}

export function MessageWallets({ token }) {
  const [schools, setSchools] = useState([]);
  const [payments, setPayments] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [messages, setMessages] = useState("");
  const [note, setNote] = useState("");
  const [left, setLeft] = useState("");
  const [editingId, setEditingId] = useState(null);

  async function load() {
    const data = await api("/admin/message-payments", { token });
    setSchools(data.schools || []);
    setPayments(data.payments || []);
    setSchoolId((current) => current || data.schools?.[0]?._id || "");
  }

  useEffect(() => {
    load().catch((err) => notify(t("Not completed"), err.message, "bad"));
  }, [token]);

  function resetPayment() {
    setEditingId(null);
    setAmount("");
    setPaidAt(today());
    setMessages("");
    setNote("");
  }

  function beginEdit(payment) {
    setEditingId(payment._id);
    setSchoolId(payment.school?._id || "");
    setAmount(String(payment.amountRwf ?? ""));
    setPaidAt(dayOf(payment.paidAt));
    setMessages(String(payment.messages ?? ""));
    setNote(payment.note || "");
    document.querySelector(".wallet-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selected = schools.find((school) => school._id === schoolId);
  useEffect(() => {
    setLeft(selected ? String(selected.messagesRemaining || 0) : "");
  }, [selected?._id, selected?.messagesRemaining]);

  return (
    <div className="sections">
      <EarningsDashboard token={token} />
      <form className="panel form-grid no-print wallet-form" onSubmit={(event) => {
        event.preventDefault();
        if (!schoolId) return notify(t("Select a school"), t("Choose the school that paid."), "bad");
        if (amount === "" || Number(amount) < 0) return notify("Amount", t("Enter the amount paid, in Rwandan francs."), "bad");
        if (!paidAt) return notify("Date", t("Enter the date the school paid."), "bad");
        if (!Number.isInteger(Number(messages)) || Number(messages) < 1) return notify("Messages", t("Enter how many messages this payment allows."), "bad");
        const body = { schoolId, amountRwf: Number(amount), paidAt, messages: Number(messages), note };
        act(async () => {
          const saved = editingId
            ? await api(`/admin/message-payments/${editingId}`, { method: "PATCH", token, body })
            : await api("/admin/message-payments", { method: "POST", token, body });
          resetPayment();
          await load();
          notify(editingId ? t("Payment corrected") : t("Payment recorded"), saved.message || t("The Message Wallet was updated."));
        });
      }}>
        <p className="kicker span"><Icon name="wallet" /> {t("Message Wallet")}</p>
        <h2 className="span">{editingId ? "Correct this payment" : "Record a school payment"}</h2>
        <p className="muted span">{t("Choose the school, the amount paid, the date, and how many messages that payment allows. When those messages are used, the school is asked to top up.")}</p>
        <label className="field">School
          <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
            {schools.map((school) => <option key={school._id} value={school._id}>{school.name}</option>)}
          </select>
        </label>
        <label className="field">Amount paid (RWF)
          <input type="number" min="0" value={amount} placeholder="50000" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="field">Date paid
          <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
        </label>
        <label className="field">Messages this payment allows
          <input type="number" min="1" step="1" value={messages} placeholder="200" onChange={(event) => setMessages(event.target.value)} />
        </label>
        <label className="field span">Note
          <input value={note} placeholder={t("Bank transfer, term 1")} onChange={(event) => setNote(event.target.value)} />
        </label>
        {selected ? (
          <p className={selected.messagesGranted && !selected.messagesRemaining ? "wallet-alert span" : "wallet-note span"}>
            <Icon name="wallet" />
            {selected.name}: {selected.messagesGranted ? `${selected.messagesRemaining} messages left of ${selected.messagesGranted} granted.` : t("No payment recorded yet. Sending stays open until you record one.")}
          </p>
        ) : null}
        <label className="field">Messages left now
          <input type="number" min="0" step="1" value={left} onChange={(event) => setLeft(event.target.value)} />
        </label>
        <div className="actions span">
          <button className="solid" type="submit"><Icon name="check" /> {editingId ? t("Save correction") : t("Record payment")}</button>
          {editingId ? <button className="ghost" type="button" onClick={resetPayment}>{t("Cancel")}</button> : null}
          <button className="ghost" type="button" onClick={() => {
            if (!schoolId) return notify(t("Select a school"), t("Choose the school wallet to update."), "bad");
            if (!Number.isInteger(Number(left)) || Number(left) < 0) return notify(t("Messages left"), t("Enter how many messages are left, using a whole number."), "bad");
            act(async () => {
              const saved = await api(`/admin/message-wallets/${schoolId}`, { method: "PATCH", token, body: { messagesRemaining: Number(left) } });
              await load();
              notify(t("Wallet updated"), saved.message || t("The messages left were saved."));
            });
          }}><Icon name="wallet" /> {t("Save messages left")}</button>
        </div>
      </form>

      <section className="panel no-print">
        <h2><Icon name="school" /> {t("Wallets")}</h2>
        <div className="card-grid">
          {schools.map((school) => (
            <article key={school._id} className="wallet-card">
              <strong><Icon name="school" /> {school.name}</strong>
              <button className="ghost no-print" type="button" onClick={() => setSchoolId(school._id)}>{t("Manage")}</button>
              <p>{school.messagesRemaining || 0} left</p>
              <span>{school.messagesGranted ? `${school.messagesGranted} granted` : "No limit yet"}</span>
              {school.messagesGranted && !school.messagesRemaining ? <em><Icon name="alert" /> {t("Needs a top up")}</em> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel no-print">
        <h2><Icon name="calendar" /> {t("Payments")}</h2>
        {payments.length ? (
          <table className="board pay-list">
            <thead>
              <tr>
                <th>{t("School")}</th>
                <th>{t("Date")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Messages")}</th>
                <th>{t("Left after")}</th>
                <th>{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment._id} className={editingId === payment._id ? "on" : ""}>
                  <td data-label="School">{payment.school?.name || "School"}</td>
                  <td data-label="Date">{when(payment.paidAt)}</td>
                  <td data-label="Amount">{money(payment.amountRwf)}</td>
                  <td data-label="Messages">{payment.messages}</td>
                  <td data-label="Left after">{payment.messagesRemainingAfter}</td>
                  <td data-label="Actions"><button className="ghost" type="button" onClick={() => beginEdit(payment)}>{t("Edit")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">{t("No payments recorded yet.")}</p>}
      </section>
    </div>
  );
}
