const axios = require("axios");
const env = require("../config/env");
const { toRwandaMsisdn, countSmsParts } = require("../utils/phone");
const ApiError = require("../utils/ApiError");

function gateway() {
  return env.dsc;
}

function readable(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function phoneList(phones) {
  const raw = Array.isArray(phones) ? phones : String(phones || "").split(/[,;\s]+/);
  return [...new Set(raw.map(toRwandaMsisdn).filter((phone) => /^250\d{9}$/.test(phone || "")))];
}

function accepted(status) {
  return ["success", "ok", "sent", "submitted", "queued"].includes(String(status || "").toLowerCase());
}

async function sendSms({ phones, message }) {
  const recipients = phoneList(phones);
  const text = String(message || "").trim();
  if (!text) throw new ApiError(400, "Write the message first");
  if (!recipients.length) {
    throw new ApiError(400, "No valid phone numbers. Every number must begin with 250, for example 250788000000");
  }

  const parts = countSmsParts(text);
  const creditsNeeded = recipients.length * parts;
  const account = gateway();
  if (!account.enabled || !account.apiKey || !account.username || !account.password) {
    return {
      simulated: true,
      status: "success",
      sender: "",
      recipients,
      parts,
      creditsNeeded,
      message_id: `SIM-${Date.now()}`,
      delivered: recipients.length,
    };
  }

  const body = new URLSearchParams({
    api_key: account.apiKey,
    username: account.username,
    password: account.password,
    recipients: recipients.join(","),
    message: text,
  });

  let response;
  try {
    response = await axios.post(`${account.baseUrl.replace(/\/$/, "")}/sms/send`, body.toString(), {
      timeout: 20000,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      validateStatus: () => true,
    });
  } catch (err) {
    console.log(`SMS NOT SENT: network ${err.message || "unreachable"}`);
    throw new ApiError(502, "The SMS service could not be reached");
  }

  let data = response.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = { status: "error", message: readable(data) };
    }
  }
  const rows = Array.isArray(data?.response) ? data.response : [];
  const failed = rows.filter((row) => row?.status && !accepted(row.status));
  const status = String(data?.status || "").toLowerCase();
  const detail = readable(failed[0]?.message || data?.message || data?.error || "");
  const messageId = data?.message_id || data?.messageid || rows.find((row) => row?.messageid)?.messageid || "";
  const rejected =
    response.status >= 400 ||
    status === "error" ||
    status === "failed" ||
    /invalid|fail|error|denied|unauthor/i.test(detail) ||
    (rows.length > 0 && failed.length === rows.length);
  console.log(
    `SMS ${rejected ? "NOT SENT" : "SENT"} via Digital Services Center: http=${response.status} status=${status || "-"} phones=${recipients.join(",")} id=${messageId || "-"} detail=${JSON.stringify(detail)}`
  );
  if (rejected) throw new ApiError(400, detail || "The SMS service did not send this message");

  return {
    simulated: false,
    status: status || "success",
    sender: data?.sender || "",
    recipients,
    parts,
    creditsNeeded,
    message_id: messageId || `DSC-${Date.now()}`,
    delivered: Number(data?.totalmessages || data?.delivered || recipients.length),
    raw: data,
  };
}

module.exports = { sendSms, countSmsParts };
