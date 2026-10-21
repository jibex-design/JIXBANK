// ==========================================================
// bank-local.js - ONLINE MODE (no emulator, no Cloud Functions)
//
// Does the same jobs as functions/index.js, but from the browser,
// using Firestore transactions on your real Firebase project.
// Every action is checked AGAIN by firestore.rules, which is what
// stops people from changing other people's money.
// All money is SIMULATED.
// ==========================================================

import { auth, db } from "./firebase-config.js";
import {
  doc, collection, query, where, getDoc, getDocs, setDoc,
  runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---------- limits (rules enforce these too) ----------
const MAX_BALANCE = 50000000;
const MIN_DEPOSIT = 100,     MAX_DEPOSIT = 1000000;
const MIN_TRANSFER = 100,    MAX_TRANSFER = 500000;
const MIN_WITHDRAW = 500,    MAX_WITHDRAW = 500000;
const MIN_AIRTIME = 50,      MAX_AIRTIME = 50000;
const MIN_SAVE = 100,        MAX_SAVE = 10000000;
const MIN_GOAL = 1000,       MAX_GOAL = 100000000;
const MAX_GOALS = 10;

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"];
const BANKS = ["Access Bank", "GTBank", "First Bank", "UBA", "Zenith Bank", "Opay", "Kuda", "Moniepoint"];

const DATA_PLANS = {
  d500m: { label: "500MB - 7 days",  price: 500 },
  d1g:   { label: "1.5GB - 30 days", price: 1000 },
  d3g:   { label: "3GB - 30 days",   price: 1500 },
  d6g:   { label: "6GB - 30 days",   price: 2500 },
  d12g:  { label: "12GB - 30 days",  price: 4000 }
};

// ---------- errors (same codes the pages already understand) ----------
class BankError extends Error {
  constructor(code, message) {
    super(message);
    this.code = "functions/" + code;
  }
}
const bad = (msg) => new BankError("invalid-argument", msg);
const blocked = (msg) => new BankError("failed-precondition", msg);

// ---------- helpers ----------
const round2 = (n) => Math.round(n * 100) / 100;
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");
const NAME_PATTERN = /^\p{L}[\p{L}\s'.-]*$/u;
const maskPhone = (p) => p.slice(0, 4) + "***" + p.slice(-4);

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new BankError("unauthenticated", "Please log in first.");
  return user;
}

function checkAmount(amount, min, max) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) throw bad("Enter a valid amount.");
  if (round2(amount) !== amount) throw bad("Amount can have at most 2 decimal places.");
  if (amount < min) throw bad(`Minimum amount is ${naira(min)}.`);
  if (amount > max) throw bad(`Maximum amount is ${naira(max)}.`);
}

function checkRequestId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{10,64}$/.test(id)) {
    throw bad("Invalid request. Please try again.");
  }
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function checkPhone(phone) {
  if (typeof phone !== "string" || !/^0[789][01]\d{8}$/.test(phone)) {
    throw bad("Enter a valid 11-digit Nigerian phone number.");
  }
}
function checkNetwork(network) {
  if (!NETWORKS.includes(network)) throw bad("Please choose a network.");
}

function activeAccount(snap) {
  if (!snap.exists()) throw blocked("Account not found.");
  const account = snap.data();
  if (account.accountStatus !== "active") throw blocked("This account is not active.");
  return { ...account, balance: Number(account.balance) || 0 };
}

// writes a notification inside a transaction (id = the transaction's id)
function notify(t, id, userId, title, message) {
  t.set(doc(db, "notifications", id), {
    userId, title, message, read: false, createdAt: serverTimestamp()
  });
}

function txRecord(fields) {
  return { ...fields, simulated: true, createdAt: serverTimestamp() };
}

function randomAccountNumber() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000000000 + (a[0] % 9000000000));
}

// ==========================================================
// setupAccount - creates the profile + bank account (balance 0)
// Safe to call twice. Also repairs older accounts.
// ==========================================================
async function setupAccount(data) {
  const user = requireUser();
  const uid = user.uid;

  let fullName = cleanText(data.fullName, 60);
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) fullName = cleanText(user.displayName || "", 60);
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) fullName = "JIXBANK User";

  const userRef = doc(db, "users", uid);
  const accountRef = doc(db, "accounts", uid);
  const [userSnap, accountSnap] = await Promise.all([getDoc(userRef), getDoc(accountRef)]);

  const profile = { fullName, email: user.email || "", photoURL: "", createdAt: serverTimestamp() };

  // ----- already has an account: just make sure everything around it exists -----
  if (accountSnap.exists()) {
    if (!userSnap.exists()) await setDoc(userRef, profile);

    const number = accountSnap.data().accountNumber;
    if (typeof number === "string" && /^\d{10}$/.test(number)) {
      const lockRef = doc(db, "accountNumbers", number);
      const lockSnap = await getDoc(lockRef);
      if (!lockSnap.exists()) {
        const name = userSnap.exists() ? userSnap.data().fullName : fullName;
        await setDoc(lockRef, { uid, fullName: name });
      }
    }
    return { ok: true, created: false };
  }

  // ----- new account: find a free 10-digit number -----
  for (let attempt = 0; attempt < 8; attempt++) {
    const number = randomAccountNumber();
    const lockRef = doc(db, "accountNumbers", number);
    try {
      await runTransaction(db, async (t) => {
        const acc = await t.get(accountRef);
        const lock = await t.get(lockRef);
        const usr = await t.get(userRef);
        if (acc.exists()) return;
        if (lock.exists()) throw new Error("TAKEN");

        t.set(lockRef, { uid, fullName });
        t.set(accountRef, {
          currency: "NGN", balance: 0, accountNumber: number,
          accountStatus: "active", createdAt: serverTimestamp()
        });
        if (!usr.exists()) t.set(userRef, profile);
        notify(t, "welcome_" + uid, uid, "Welcome to JIXBANK 🎉",
          "Your demo account is ready. All money here is simulated.");
      });
      return { ok: true, created: true };
    } catch (err) {
      if (err.message !== "TAKEN") throw err;
    }
  }
  throw new BankError("internal", "Could not create your account. Please try again.");
}

// ==========================================================
// addMoney - SIMULATED deposit
// ==========================================================
async function addMoney(data) {
  const user = requireUser();
  const uid = user.uid;
  const { amount, requestId } = data;
  checkAmount(amount, MIN_DEPOSIT, MAX_DEPOSIT);
  checkRequestId(requestId);

  const accountRef = doc(db, "accounts", uid);
  const txRef = doc(db, "transactions", `${uid}_${requestId}`);

  const result = await runTransaction(db, async (t) => {
    const accountSnap = await t.get(accountRef);
    const txSnap = await t.get(txRef);

    if (txSnap.exists()) {
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    const account = activeAccount(accountSnap);
    const newBalance = round2(account.balance + amount);
    if (newBalance > MAX_BALANCE) throw blocked("This would exceed the demo account limit.");

    t.update(accountRef, { balance: newBalance, lastTxId: txRef.id });
    t.set(txRef, txRecord({
      userId: uid, direction: "credit", type: "deposit", amount,
      description: "Demo deposit (simulated)", status: "successful"
    }));
    notify(t, txRef.id, uid, "Deposit successful", `${naira(amount)} was added to your balance (simulated).`);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });

  return { ok: true, ...result };
}

// ==========================================================
// lookupAccount - who owns this account number? (name only)
// ==========================================================
async function lookupAccount(data) {
  const user = requireUser();
  const number = String(data.accountNumber || "").trim();
  if (!/^\d{10}$/.test(number)) throw bad("Account number must be exactly 10 digits.");

  const lockSnap = await getDoc(doc(db, "accountNumbers", number));
  if (!lockSnap.exists()) throw bad("No JIXBANK account found with that number.");

  const { uid: recipientId, fullName } = lockSnap.data();
  if (recipientId === user.uid) throw bad("You can't send money to yourself.");

  return { ok: true, accountNumber: number, fullName };
}

// ==========================================================
// transfer - sender's balance goes down, recipient's goes up,
// both history records and both notifications are saved together.
// ==========================================================
async function transfer(data) {
  const user = requireUser();
  const uid = user.uid;
  const { accountNumber, amount, description, requestId } = data;

  checkRequestId(requestId);
  checkAmount(amount, MIN_TRANSFER, MAX_TRANSFER);
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) {
    throw bad("Account number must be exactly 10 digits.");
  }
  const note = cleanText(description, 100);

  const lockSnap = await getDoc(doc(db, "accountNumbers", accountNumber));
  if (!lockSnap.exists()) throw bad("No JIXBANK account found with that number.");
  const recipientId = lockSnap.data().uid;
  const recipientName = lockSnap.data().fullName || "A JIXBANK user";
  if (recipientId === uid) throw bad("You can't send money to yourself.");

  const senderAccRef = doc(db, "accounts", uid);
  const recipientAccRef = doc(db, "accounts", recipientId);
  const senderUserRef = doc(db, "users", uid);
  const outRef = doc(db, "transactions", `${uid}_${requestId}`);
  const inRef = doc(db, "transactions", `${uid}_${requestId}_in`);

  const result = await runTransaction(db, async (t) => {
    const sAcc = await t.get(senderAccRef);
    const sUser = await t.get(senderUserRef);
    const outSnap = await t.get(outRef);

    if (outSnap.exists()) {
      return { duplicate: true, balance: sAcc.data().balance, transactionId: outRef.id, recipientName };
    }

    const sender = activeAccount(sAcc);
    if (amount > sender.balance) throw blocked("Insufficient funds.");

    const senderName = sUser.exists() ? sUser.data().fullName : (user.displayName || "A JIXBANK user");
    const newSenderBalance = round2(sender.balance - amount);

    // sender pays
    t.update(senderAccRef, { balance: newSenderBalance, lastTxId: outRef.id });
    // recipient receives (increment = "add this much", no need to read their balance)
    t.update(recipientAccRef, { balance: increment(amount), lastCreditTxId: inRef.id });

    t.set(outRef, txRecord({
      userId: uid, senderId: uid, recipientId, direction: "debit", type: "transfer", amount,
      description: note ? `Transfer to ${recipientName}: ${note}` : `Transfer to ${recipientName}`,
      counterpartyName: recipientName, status: "successful"
    }));
    t.set(inRef, txRecord({
      userId: recipientId, senderId: uid, recipientId, direction: "credit", type: "transfer", amount,
      description: note ? `Transfer from ${senderName}: ${note}` : `Transfer from ${senderName}`,
      counterpartyName: senderName, status: "successful", pairTxId: outRef.id
    }));

    notify(t, outRef.id, uid, "Transfer sent", `You sent ${naira(amount)} to ${recipientName} (simulated).`);
    notify(t, inRef.id, recipientId, "Money received", `${senderName} sent you ${naira(amount)} (simulated).`);

    return { duplicate: false, balance: newSenderBalance, transactionId: outRef.id, recipientName };
  });

  return { ok: true, ...result };
}

// ==========================================================
// spend - take money OUT of the main balance, once only
// ==========================================================
async function spend(user, requestId, spec) {
  const uid = user.uid;
  const accountRef = doc(db, "accounts", uid);
  const txRef = doc(db, "transactions", `${uid}_${requestId}`);

  return runTransaction(db, async (t) => {
    const accountSnap = await t.get(accountRef);
    const txSnap = await t.get(txRef);
    if (txSnap.exists()) {
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    const account = activeAccount(accountSnap);
    if (spec.amount > account.balance) throw blocked("Insufficient funds.");

    const newBalance = round2(account.balance - spec.amount);
    t.update(accountRef, { balance: newBalance, lastTxId: txRef.id });
    t.set(txRef, txRecord({
      userId: uid, direction: "debit", type: spec.type, amount: spec.amount,
      description: spec.description, status: spec.status, ...(spec.extra || {})
    }));
    notify(t, txRef.id, uid, spec.title, spec.message);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });
}

async function requestWithdrawal(data) {
  const user = requireUser();
  const { amount, bankName, accountNumber, accountName, requestId } = data;

  checkRequestId(requestId);
  checkAmount(amount, MIN_WITHDRAW, MAX_WITHDRAW);
  if (!BANKS.includes(bankName)) throw bad("Please choose a bank.");
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) throw bad("Account number must be exactly 10 digits.");
  const name = cleanText(accountName, 60);
  if (name.length < 2 || !NAME_PATTERN.test(name)) throw bad("Enter the account name (letters only).");

  const result = await spend(user, requestId, {
    amount, type: "withdrawal", status: "pending",
    description: `Withdrawal to ${bankName} ****${accountNumber.slice(-4)} (simulated)`,
    extra: { counterpartyName: name },
    title: "Withdrawal requested",
    message: `Your simulated withdrawal of ${naira(amount)} is pending. No real money moves.`
  });
  return { ok: true, ...result };
}

async function buyAirtime(data) {
  const user = requireUser();
  const { network, phone, amount, requestId } = data;

  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  checkAmount(amount, MIN_AIRTIME, MAX_AIRTIME);

  const result = await spend(user, requestId, {
    amount, type: "airtime", status: "successful",
    description: `${network} airtime for ${maskPhone(phone)} (simulated)`,
    title: "Airtime purchase (simulated)",
    message: `${naira(amount)} ${network} airtime for ${maskPhone(phone)}. No real airtime was delivered.`
  });
  return { ok: true, ...result };
}

async function buyData(data) {
  const user = requireUser();
  const { network, phone, planId, requestId } = data;

  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  const plan = Object.prototype.hasOwnProperty.call(DATA_PLANS, planId) ? DATA_PLANS[planId] : null;
  if (!plan) throw bad("Please choose a data plan.");

  const result = await spend(user, requestId, {
    amount: plan.price, type: "data", status: "successful",
    description: `${network} ${plan.label} for ${maskPhone(phone)} (simulated)`,
    title: "Data purchase (simulated)",
    message: `${network} ${plan.label} for ${maskPhone(phone)}. No real data was delivered.`
  });
  return { ok: true, ...result };
}

// ==========================================================
// savings (separate from the main balance)
// ==========================================================
async function createSavingsGoal(data) {
  const user = requireUser();
  const uid = user.uid;
  const { goalName, targetAmount, requestId } = data;

  checkRequestId(requestId);
  const name = cleanText(goalName, 40);
  if (name.length < 2) throw bad("Give your goal a name (at least 2 characters).");
  checkAmount(targetAmount, MIN_GOAL, MAX_GOAL);

  const existing = await getDocs(query(collection(db, "savings"), where("userId", "==", uid)));
  if (existing.size >= MAX_GOALS) throw blocked(`You can have at most ${MAX_GOALS} savings goals.`);

  const ref = doc(db, "savings", `${uid}_${requestId}`);
  const result = await runTransaction(db, async (t) => {
    const snap = await t.get(ref);
    if (snap.exists()) return { duplicate: true, savingId: ref.id };
    t.set(ref, {
      userId: uid, goalName: name, targetAmount, savedAmount: 0,
      simulated: true, createdAt: serverTimestamp()
    });
    return { duplicate: false, savingId: ref.id };
  });
  return { ok: true, ...result };
}

// direction "add" = main balance -> goal.  "withdraw" = goal -> main balance.
async function moveSavings(data, direction) {
  const user = requireUser();
  const uid = user.uid;
  const { savingId, amount, requestId } = data;

  checkRequestId(requestId);
  checkAmount(amount, MIN_SAVE, MAX_SAVE);
  if (typeof savingId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(savingId)) throw bad("Savings goal not found.");

  const savingRef = doc(db, "savings", savingId);
  const accountRef = doc(db, "accounts", uid);
  const txRef = doc(db, "transactions", `${uid}_${requestId}`);

  const result = await runTransaction(db, async (t) => {
    const saving = await t.get(savingRef);
    const accountSnap = await t.get(accountRef);
    const txSnap = await t.get(txRef);

    if (txSnap.exists()) {
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    if (!saving.exists() || saving.data().userId !== uid) throw bad("Savings goal not found.");
    const account = activeAccount(accountSnap);

    const saved = Number(saving.data().savedAmount) || 0;
    const goalName = saving.data().goalName;
    let newBalance, newSaved;

    if (direction === "add") {
      if (amount > account.balance) throw blocked("Insufficient funds in your main balance.");
      newBalance = round2(account.balance - amount);
      newSaved = round2(saved + amount);
    } else {
      if (amount > saved) throw blocked("That's more than you have saved in this goal.");
      newBalance = round2(account.balance + amount);
      newSaved = round2(saved - amount);
      if (newBalance > MAX_BALANCE) throw blocked("This would exceed the demo account limit.");
    }

    t.update(savingRef, { savedAmount: newSaved });
    t.update(accountRef, { balance: newBalance, lastTxId: txRef.id });
    t.set(txRef, txRecord({
      userId: uid, direction: direction === "add" ? "debit" : "credit", type: "savings", amount,
      description: direction === "add" ? `Saved to "${goalName}" (simulated)` : `Withdrawn from "${goalName}" (simulated)`,
      status: "successful", savingId
    }));
    notify(t, txRef.id, uid,
      direction === "add" ? "Added to savings" : "Withdrawn from savings",
      `${naira(amount)} ${direction === "add" ? "moved into" : "moved out of"} "${goalName}" (simulated).`);

    return { duplicate: false, balance: newBalance, savedAmount: newSaved, transactionId: txRef.id };
  });
  return { ok: true, ...result };
}

const addToSavings = (data) => moveSavings(data, "add");
const withdrawFromSavings = (data) => moveSavings(data, "withdraw");

// ---------- the "switchboard" server.js calls ----------
const ACTIONS = {
  setupAccount, addMoney, lookupAccount, transfer, requestWithdrawal,
  buyAirtime, buyData, createSavingsGoal, addToSavings, withdrawFromSavings
};

export async function runLocal(name, data) {
  const action = ACTIONS[name];
  if (!action) throw new BankError("not-found", "Unknown action.");
  return action(data || {});
}
