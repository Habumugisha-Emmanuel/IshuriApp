import { useEffect, useState } from "react";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { Icon } from "./icons.jsx";
import { act, notify } from "./notice.js";

function rwf(value) {
  return `${new Intl.NumberFormat("en-RW").format(Number(value) || 0)} RWF`;
}

export function BooksMore({ view, token, desk, book, classes, onReload, today }) {
  const [estimate, setEstimate] = useState({ classRoom: "", studentId: "", accountId: "", amount: "", dueOn: today });
  const [pupils, setPupils] = useState([]);
  const [order, setOrder] = useState({ vendorId: "", accountId: "", amount: "", tax: "", expectedOn: today });
  const [budget, setBudget] = useState({ accountName: "", amount: "" });
  const [rule, setRule] = useState({ classRoom: "", accountId: "", amount: "", span: "month", dueOn: today });
  const [pay, setPay] = useState({ fullName: "", amount: "", paidOn: today });
  const [stock, setStock] = useState({ name: "", quantity: "", unitCost: "" });
  const [items, setItems] = useState([]);
  const [move, setMove] = useState({ itemId: "", type: "in", quantity: "" });
  const [lines, setLines] = useState([]);
  const [statement, setStatement] = useState("");

  useEffect(() => {
    if (!estimate.classRoom) { setPupils([]); return undefined; }
    let cancel = false;
    api(`/students?classRoom=${estimate.classRoom}`, { token })
      .then((data) => { if (!cancel) setPupils(data.items || []); })
      .catch(() => { if (!cancel) setPupils([]); });
    return () => { cancel = true; };
  }, [estimate.classRoom, token]);

  useEffect(() => {
    if (view !== "inventory") return undefined;
    let cancel = false;
    api("/stock/items", { token })
      .then((data) => { if (!cancel) setItems(data.items || []); })
      .catch((error) => { if (!cancel) notify(t("Not completed"), error.message, "bad"); });
    return () => { cancel = true; };
  }, [view, token, desk]);

  useEffect(() => {
    if (view !== "banking") return undefined;
    let cancel = false;
    api("/accounts/banking", { token })
      .then((data) => { if (!cancel) setLines(data.lines || []); })
      .catch((error) => { if (!cancel) notify(t("Not completed"), error.message, "bad"); });
    return () => { cancel = true; };
  }, [view, token, desk]);

  const incomeAccounts = (desk?.accounts || []).filter((item) => item.kind === "income");
  const expenseAccounts = (desk?.accounts || []).filter((item) => item.kind === "expense");
  const products = (desk?.accounts || []).filter((item) => item.group === "fee" || item.group === "material");
  const clearedNet = lines.reduce((sum, line) => sum + (line.cleared ? (line.direction === "in" ? line.amount : -line.amount) : 0), 0);
  const typed = Number(statement);
  const difference = Number.isFinite(typed) && statement !== "" ? typed - clearedNet : null;

  if (view === "invoices") {
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/accounts/recurring", { method: "POST", token, body: rule }).then(() => { setRule((current) => ({ ...current, amount: "" })); onReload(); }), t("Recurring invoices"), t("The recurring invoice is on the books."));
        }}>
          <h2><Icon name="calendar" />{t("Recurring invoices")}</h2>
          <label className="field">{t("Class")}
            <select value={rule.classRoom} onChange={(event) => setRule({ ...rule, classRoom: event.target.value })}>
              <option value="">{t("Choose a class")}</option>
              {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
            </select>
          </label>
          <label className="field">{t("Fee line")}
            <select value={rule.accountId} onChange={(event) => setRule({ ...rule, accountId: event.target.value })}>
              <option value="">{t("Choose the fee or material.")}</option>
              {incomeAccounts.map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Amount due (RWF)")}<input inputMode="numeric" value={rule.amount} onChange={(event) => setRule({ ...rule, amount: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <div className="panel">
          <h2>{t("Run for this date")}</h2>
          <label className="field">{t("Due date")}<input type="date" value={rule.dueOn} onChange={(event) => setRule({ ...rule, dueOn: event.target.value })} /></label>
          {(desk?.recurring || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.recurring || []).map((item) => (
            <div className="books-lines" key={item.id}>
              <div>
                <span>{item.className} · {t(item.accountName)} · {rwf(item.amount)}</span>
                <button type="button" className="solid" onClick={() => act(() => api(`/accounts/recurring/${item.id}/run`, { method: "POST", token, body: { dueOn: rule.dueOn } }).then((sent) => { onReload(); return sent; }), t("Recurring invoices"), t("The invoices are on the books."))}>{t("Run for this date")}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "estimates") {
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/accounts/estimates", { method: "POST", token, body: estimate }).then(() => { setEstimate((current) => ({ ...current, amount: "" })); onReload(); }), t("Estimates"), t("The estimate is on the books."));
        }}>
          <h2><Icon name="pen" />{t("Estimates")}</h2>
          <p className="span">{t("A quote stays off the profit until you turn it into an invoice.")}</p>
          <label className="field">{t("Class")}
            <select value={estimate.classRoom} onChange={(event) => setEstimate({ ...estimate, classRoom: event.target.value, studentId: "" })}>
              <option value="">{t("Choose a class")}</option>
              {classes.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}
            </select>
          </label>
          <label className="field">{t("Student")}
            <select value={estimate.studentId} onChange={(event) => setEstimate({ ...estimate, studentId: event.target.value })}>
              <option value="">{t("Choose a class, or one student.")}</option>
              {pupils.map((pupil) => <option key={pupil._id} value={pupil._id}>{pupil.fullName}</option>)}
            </select>
          </label>
          <label className="field">{t("Fee line")}
            <select value={estimate.accountId} onChange={(event) => setEstimate({ ...estimate, accountId: event.target.value })}>
              <option value="">{t("Choose the fee or material.")}</option>
              {incomeAccounts.map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Amount")}<input inputMode="numeric" value={estimate.amount} onChange={(event) => setEstimate({ ...estimate, amount: event.target.value })} /></label>
          <label className="field">{t("Due date")}<input type="date" value={estimate.dueOn} onChange={(event) => setEstimate({ ...estimate, dueOn: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <div className="panel">
          <h2>{t("Estimates")}</h2>
          {(desk?.estimates || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.estimates || []).map((item) => (
            <div className="books-lines" key={item.id}>
              <div>
                <span>{item.studentName} · {t(item.accountName)} · {rwf(item.amount)}</span>
                {item.status === "draft" ? (
                  <button type="button" className="solid" onClick={() => act(() => api(`/accounts/estimates/${item.id}/invoice`, { method: "POST", token }).then(() => onReload()), t("Convert to invoice"), t("The invoice is on the books."))}>{t("Convert to invoice")}</button>
                ) : <span className="books-pill">{t("Invoiced")}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "orders") {
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/accounts/orders", { method: "POST", token, body: order }).then(() => { setOrder((current) => ({ ...current, amount: "", tax: "" })); onReload(); }), t("Purchase orders"), t("The purchase order is on the books."));
        }}>
          <h2><Icon name="briefcase" />{t("Purchase orders")}</h2>
          <p className="span">{t("An order becomes a bill when the goods arrive. Until then it stays out of the expenses.")}</p>
          <label className="field">{t("Supplier")}
            <select value={order.vendorId} onChange={(event) => setOrder({ ...order, vendorId: event.target.value })}>
              <option value="">{t("Choose a supplier")}</option>
              {(desk?.vendors || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">{t("Expenses")}
            <select value={order.accountId} onChange={(event) => setOrder({ ...order, accountId: event.target.value })}>
              <option value="">{t("Choose an expense account")}</option>
              {expenseAccounts.map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Amount")}<input inputMode="numeric" value={order.amount} onChange={(event) => setOrder({ ...order, amount: event.target.value })} /></label>
          <label className="field">{t("Sales tax")}<input inputMode="numeric" value={order.tax} onChange={(event) => setOrder({ ...order, tax: event.target.value })} /></label>
          <label className="field">{t("Due date")}<input type="date" value={order.expectedOn} onChange={(event) => setOrder({ ...order, expectedOn: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <div className="panel">
          <h2>{t("Purchase orders")}</h2>
          {(desk?.orders || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.orders || []).map((item) => (
            <div className="books-lines" key={item.id}>
              <div>
                <span>{item.vendorName} · {t(item.accountName)} · {rwf(item.amount)}</span>
                {item.status === "open" ? (
                  <button type="button" className="solid" onClick={() => act(() => api(`/accounts/orders/${item.id}/bill`, { method: "POST", token }).then(() => onReload()), t("Convert to bill"), t("The bill is on the books."))}>{t("Convert to bill")}</button>
                ) : <span className="books-pill">{t("Billed")}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "products") {
    return (
      <article className="panel">
        <h2><Icon name="book" />{t("Products and services")}</h2>
        <p>{t("Fees and materials the school sells. Add a new line from the chart of accounts.")}</p>
        {products.map((item) => (
          <p key={item.id}><span>{item.code} · {t(item.name)}</span><strong>{t(item.group === "fee" ? "Fee line" : "Material")}</strong></p>
        ))}
      </article>
    );
  }

  if (view === "inventory") {
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/stock/items", { method: "POST", token, body: { name: stock.name, quantity: Number(stock.quantity) || 0, unitCost: Number(stock.unitCost) || 0, unit: "pcs", category: "stationery" } }).then(() => { setStock({ name: "", quantity: "", unitCost: "" }); onReload(); }), t("Inventory"), t("The item is in stock."));
        }}>
          <h2><Icon name="building" />{t("Inventory")}</h2>
          <label className="field">{t("Item")}<input value={stock.name} onChange={(event) => setStock({ ...stock, name: event.target.value })} /></label>
          <label className="field">{t("Quantity")}<input inputMode="numeric" value={stock.quantity} onChange={(event) => setStock({ ...stock, quantity: event.target.value })} /></label>
          <label className="field">{t("Unit cost")}<input inputMode="numeric" value={stock.unitCost} onChange={(event) => setStock({ ...stock, unitCost: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/stock/movements", { method: "POST", token, body: { itemId: move.itemId, type: move.type, quantity: move.quantity, reason: move.type === "in" ? "Received" : "Issued" } }).then(() => { setMove((current) => ({ ...current, quantity: "" })); onReload(); }), t("Inventory"), t("The stock count is updated."));
        }}>
          <h2>{t("Stock movement")}</h2>
          <label className="field">{t("Item")}
            <select value={move.itemId} onChange={(event) => setMove({ ...move, itemId: event.target.value })}>
              <option value="">{t("Choose an item")}</option>
              {items.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </label>
          <div className="chips">
            <button type="button" className={move.type === "in" ? "on" : ""} onClick={() => setMove({ ...move, type: "in" })}>{t("Receive")}</button>
            <button type="button" className={move.type === "out" ? "on" : ""} onClick={() => setMove({ ...move, type: "out" })}>{t("Issue")}</button>
          </div>
          <label className="field">{t("Quantity")}<input inputMode="numeric" value={move.quantity} onChange={(event) => setMove({ ...move, quantity: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
          <ul className="books-entries span">
            {items.map((item) => (
              <li key={item._id}>
                <span>{item.unit || "pcs"}</span>
                <strong>{item.name}</strong>
                <em>{item.quantity}</em>
                <span>{item.quantity <= (item.reorderLevel || 0) ? t("Reorder") : t("In stock")}</span>
              </li>
            ))}
          </ul>
        </form>
      </div>
    );
  }

  if (view === "banking") {
    return (
      <div className="books-split">
        <article className="panel">
          <h2><Icon name="wallet" />{t("Banking")}</h2>
          <p>{t("Tick each payment that appears on the bank statement, then type the statement balance. The difference should reach zero.")}</p>
          <p>{t("This book does not connect to a bank or a card network. You record the payments here.")}</p>
          <label className="field">{t("Statement balance")}<input inputMode="numeric" value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
          <p><span>{t("Cleared")}</span><strong>{rwf(clearedNet)}</strong></p>
          {difference != null ? <p className="books-total"><span>{t("Difference")}</span><strong>{rwf(difference)}</strong></p> : null}
        </article>
        <div className="panel">
          <h2>{t("Register")}</h2>
          {lines.length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : lines.map((line) => (
            <label className="books-lines" key={line.refKey}>
              <div>
                <input type="checkbox" checked={line.cleared} onChange={(event) => {
                  const cleared = event.target.checked;
                  act(() => api("/accounts/banking/clear", { method: "POST", token, body: { refKey: line.refKey, cleared } }).then(() => {
                    setLines((current) => current.map((item) => item.refKey === line.refKey ? { ...item, cleared } : item));
                  }), t("Cleared"), t("The line is marked."));
                }} />
                <span>{line.direction === "in" ? t("In") : t("Out")} · {t(line.title)}</span>
                <strong>{rwf(line.amount)}</strong>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (view === "payroll") {
    const rows = (book?.entries || []).filter((entry) => entry.accountName === "Staff pay" || String(entry.title || "").startsWith("Staff pay"));
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/accounts/payroll", { method: "POST", token, body: pay }).then(() => { setPay((current) => ({ ...current, fullName: "", amount: "" })); onReload(); }), t("Staff pay"), t("The staff pay is on the books."));
        }}>
          <h2><Icon name="people" />{t("Staff pay")}</h2>
          <p className="span">{t("Record staff pay as a school expense. This does not file payroll tax or send wages to a bank.")}</p>
          <label className="field">{t("Staff name")}<input value={pay.fullName} onChange={(event) => setPay({ ...pay, fullName: event.target.value })} /></label>
          <label className="field">{t("Amount")}<input inputMode="numeric" value={pay.amount} onChange={(event) => setPay({ ...pay, amount: event.target.value })} /></label>
          <label className="field">{t("Date")}<input type="date" value={pay.paidOn} onChange={(event) => setPay({ ...pay, paidOn: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <div className="panel">
          <h2>{t("Staff pay")}</h2>
          {rows.length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : rows.map((entry) => (
            <p key={entry.id}><span>{entry.title}</span><strong>{rwf(entry.amount)}</strong></p>
          ))}
        </div>
      </div>
    );
  }

  if (view === "budgets") {
    return (
      <div className="books-split">
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          act(() => api("/accounts/budgets", { method: "POST", token, body: { ...budget, year: desk?.year } }).then(() => { setBudget({ accountName: "", amount: "" }); onReload(); }), t("Budgets"), t("The budget is on the books."));
        }}>
          <h2><Icon name="target" />{t("Budgets")}</h2>
          <p className="span">{t("The budget is for the selected year. Actual is what the books recorded in that year.")}</p>
          <label className="field">{t("Account")}
            <select value={budget.accountName} onChange={(event) => setBudget({ ...budget, accountName: event.target.value })}>
              <option value="">{t("Choose an account.")}</option>
              {(desk?.accounts || []).filter((item) => item.kind === "income" || item.kind === "expense").map((item) => <option key={item.id} value={item.name}>{t(item.name)}</option>)}
            </select>
          </label>
          <label className="field">{t("Amount")}<input inputMode="numeric" value={budget.amount} onChange={(event) => setBudget({ ...budget, amount: event.target.value })} /></label>
          <div className="actions"><button className="solid" type="submit">{t("Save")}</button></div>
        </form>
        <div className="panel">
          <h2>{desk?.year}</h2>
          {(desk?.budgets || []).length === 0 ? <p className="muted">{t("No balances in this period.")}</p> : (desk.budgets || []).map((item) => (
            <p key={item.id}><span>{t(item.accountName)} · {t("Actual")} {rwf(item.actual)}</span><strong>{rwf(item.amount)}</strong></p>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
