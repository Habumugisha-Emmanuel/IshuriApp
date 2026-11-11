const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { School, SmsLedger, PlatformWallet, MessagePayment } = require("../models");
const dsc = require("./dscSms");
const { countSmsParts, toRwandaMsisdn } = require("../utils/phone");

async function buyWholesale({ credits, createdBy, note }) {
  const qty = Number(credits);
  if (!qty || qty <= 0) throw new ApiError(400, "Credits must be greater than 0");
  const wallet = await PlatformWallet.getSmsWallet();
  wallet.wholesaleCredits += qty;
  wallet.totalBought += qty;
  await wallet.save();
  const amountRwf = qty * env.sms.wholesaleRate;
  await SmsLedger.create({
    type: "wholesale_purchase",
    credits: qty,
    unitPriceRwf: env.sms.wholesaleRate,
    amountRwf,
    platformBalanceAfter: wallet.wholesaleCredits,
    note: note || "SMS credit purchase",
    createdBy,
  });
  return wallet;
}

async function topUpSchool({ schoolId, credits, createdBy, note }) {
  const qty = Number(credits);
  if (!qty || qty <= 0) throw new ApiError(400, "Credits must be greater than 0");
  const wallet = await PlatformWallet.getSmsWallet();
  if (wallet.wholesaleCredits < qty) {
    throw new ApiError(400, "Platform wholesale SMS stock is insufficient");
  }
  const school = await School.findById(schoolId);
  if (!school) throw new ApiError(404, "School not found");
  if (school.status !== "approved") throw new ApiError(400, "School must be approved before buying SMS");

  wallet.wholesaleCredits -= qty;
  wallet.totalSoldToSchools += qty;
  school.smsBalance += qty;
  await wallet.save();
  await school.save();

  const amountRwf = qty * env.sms.retailRate;
  await SmsLedger.create({
    school: school._id,
    type: "school_topup",
    credits: qty,
    unitPriceRwf: env.sms.retailRate,
    amountRwf,
    balanceAfter: school.smsBalance,
    platformBalanceAfter: wallet.wholesaleCredits,
    note: note || "School SMS credit purchase",
    createdBy,
  });
  return { school, wallet, amountRwf };
}

function attemptedCount(phones) {
  const raw = Array.isArray(phones) ? phones : String(phones || "").split(/[,;\s]+/);
  return raw.map((item) => String(item).trim()).filter(Boolean).length;
}

function recipientCount(phones) {
  const raw = Array.isArray(phones) ? phones : String(phones || "").split(/[,;\s]+/);
  return [...new Set(raw.map(toRwandaMsisdn).filter((phone) => /^250\d{9}$/.test(phone || "")))].length;
}

function walletMessage(remaining) {
  if (remaining > 0) return `Message Wallet: ${remaining} message${remaining === 1 ? "" : "s"} left.`;
  return "Your Message Wallet is empty. Top up the Message Wallet before sending more messages.";
}

function paymentInput({ schoolId, amountRwf, paidAt, messages, note }) {
  if (!schoolId) throw new ApiError(400, "Select a school.");
  const qty = Number(messages);
  const amount = Number(amountRwf);
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
    throw new ApiError(400, "Enter the total number of messages this payment allows.");
  }
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "Enter the amount paid, in Rwandan francs.");
  const when = new Date(paidAt);
  if (!paidAt || Number.isNaN(when.getTime())) throw new ApiError(400, "Enter the date the school paid.");
  return { qty, amount, when, note: note ? String(note).slice(0, 160) : undefined };
}

async function recordSchoolPayment({ schoolId, amountRwf, paidAt, messages, createdBy, note }) {
  const input = paymentInput({ schoolId, amountRwf, paidAt, messages, note });
  const school = await School.findByIdAndUpdate(
    schoolId,
    { $inc: { messagesRemaining: input.qty, messagesGranted: input.qty } },
    { new: true }
  );
  if (!school) throw new ApiError(404, "School not found");
  const payment = await MessagePayment.create({
    school: school._id,
    amountRwf: input.amount,
    paidAt: input.when,
    messages: input.qty,
    messagesRemainingAfter: school.messagesRemaining,
    note: input.note,
    createdBy,
  });
  return { school, payment };
}

async function updateSchoolPayment({ paymentId, schoolId, amountRwf, paidAt, messages, note }) {
  const payment = await MessagePayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "That payment was not found.");
  const input = paymentInput({ schoolId, amountRwf, paidAt, messages, note });
  const oldQty = payment.messages;
  const oldSchoolId = String(payment.school);
  const nextSchoolId = String(schoolId);
  const sameSchool = oldSchoolId === nextSchoolId;

  if (sameSchool) {
    const delta = input.qty - oldQty;
    const school = await School.findById(oldSchoolId);
    if (!school) throw new ApiError(404, "School not found");
    if (delta !== 0) {
      const nextRemaining = (school.messagesRemaining || 0) + delta;
      const nextGranted = (school.messagesGranted || 0) + delta;
      if (nextRemaining < 0 || nextGranted < 0) {
        throw new ApiError(400, "This correction removes more messages than the wallet has left.");
      }
      school.messagesRemaining = nextRemaining;
      school.messagesGranted = nextGranted;
      await school.save();
      payment.messagesRemainingAfter = nextRemaining;
    }
    payment.amountRwf = input.amount;
    payment.paidAt = input.when;
    payment.messages = input.qty;
    payment.note = input.note;
    await payment.save();
    return { school, payment };
  }

  const oldSchool = await School.findById(oldSchoolId);
  const nextSchool = await School.findById(nextSchoolId);
  if (!oldSchool || !nextSchool) throw new ApiError(404, "School not found");
  const releasedRemaining = (oldSchool.messagesRemaining || 0) - oldQty;
  const releasedGranted = (oldSchool.messagesGranted || 0) - oldQty;
  if (releasedRemaining < 0 || releasedGranted < 0) {
    throw new ApiError(400, "Those messages have already been used, so this payment cannot move to another school.");
  }
  oldSchool.messagesRemaining = releasedRemaining;
  oldSchool.messagesGranted = releasedGranted;
  nextSchool.messagesRemaining = (nextSchool.messagesRemaining || 0) + input.qty;
  nextSchool.messagesGranted = (nextSchool.messagesGranted || 0) + input.qty;
  await oldSchool.save();
  await nextSchool.save();
  payment.school = nextSchool._id;
  payment.amountRwf = input.amount;
  payment.paidAt = input.when;
  payment.messages = input.qty;
  payment.messagesRemainingAfter = nextSchool.messagesRemaining;
  payment.note = input.note;
  await payment.save();
  return { school: nextSchool, payment };
}

async function holdMessages(schoolId, count) {
  const school = await School.findById(schoolId).select("messagesRemaining messagesGranted");
  if (!school) throw new ApiError(404, "School not found");
  if (!school.messagesGranted) return { held: false, remaining: school.messagesRemaining || 0 };
  const left = school.messagesRemaining || 0;
  if (count > left) {
    throw new ApiError(400, left
      ? `This send needs ${count} messages. The Message Wallet has ${left} left. Top up the Message Wallet before sending.`
      : walletMessage(0));
  }
  const updated = await School.findOneAndUpdate(
    { _id: schoolId, messagesRemaining: { $gte: count } },
    { $inc: { messagesRemaining: -count } },
    { new: true }
  );
  if (!updated) throw new ApiError(400, walletMessage(0));
  return { held: true, remaining: updated.messagesRemaining };
}

async function releaseMessages(schoolId, count) {
  if (!count) return;
  await School.findByIdAndUpdate(schoolId, { $inc: { messagesRemaining: count } });
}

async function recordSend({ school, createdBy, category, billing, recipients, parts, message, gatewayMessageId, note }) {
  await SmsLedger.create({
    school: school._id,
    type: "send_debit",
    credits: 0,
    gatewayMessageId,
    category,
    billing,
    recipients,
    parts,
    messagePreview: String(message || "").slice(0, 160),
    note: note ? String(note).slice(0, 160) : undefined,
    createdBy,
  });
}

async function sendFromSchool({ school, phones, message, createdBy, category = "notice" }) {
  const kind = ["marks", "results", "discipline", "notice"].includes(category) ? category : "notice";
  const needed = recipientCount(phones);
  const hold = needed ? await holdMessages(school._id, needed) : { held: false, remaining: 0 };
  try {
    const result = await dsc.sendSms({ phones, message });
    const used = result.simulated ? 0 : result.recipients.length;
    if (hold.held && needed > used) await releaseMessages(school._id, needed - used);
    await recordSend({
      school,
      createdBy,
      category: kind,
      billing: result.simulated ? "unpaid" : "paid",
      recipients: result.recipients.length,
      parts: result.parts,
      message,
      gatewayMessageId: result.message_id,
    });
    const fresh = await School.findById(school._id).select("messagesRemaining messagesGranted");
    const walletActive = (fresh?.messagesGranted || 0) > 0;
    return {
      result,
      delivered: result.recipients.length,
      walletActive,
      messagesRemaining: fresh?.messagesRemaining || 0,
      walletMessage: walletActive ? walletMessage(fresh?.messagesRemaining || 0) : "",
    };
  } catch (err) {
    if (hold.held) await releaseMessages(school._id, needed);
    const recipients = attemptedCount(phones);
    try {
      await recordSend({
        school,
        createdBy,
        category: kind,
        billing: "unpaid",
        recipients,
        parts: recipients * countSmsParts(message),
        message,
        note: err.message,
      });
    } catch (writeErr) {
      console.log(`SMS LEDGER NOT SAVED: ${writeErr.message}`);
    }
    throw err;
  }
}

module.exports = { buyWholesale, topUpSchool, sendFromSchool, recordSchoolPayment, updateSchoolPayment, walletMessage };
