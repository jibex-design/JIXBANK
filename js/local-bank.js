// ==========================================================
// local-bank.js - the bank's money logic running in the BROWSER,
// talking straight to your real Firebase project (free Spark plan,
// no Cloud Functions, no emulator, no Java).
//
// Every money change happens inside a Firestore TRANSACTION:
// all the changes happen together, or none of them do.
// Everything is SIMULATED: no real money.
//
// SECURITY NOTE: because this code runs in the browser, a clever
// user could edit it with DevTools. That is fine for a learning
// project, but a real bank must do this on a server (see functions/).
// ==========================================================
import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, getDocs, collection, query, where, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---------- limits ----------
const MAX_BALANCE = 50000000;
const MIN_DEPOSIT = 100,   MAX_DEPOSIT = 1000000;
const MIN_TRANSFER = 100,  MAX_TRANSFER = 500000;
const MIN_WITHDRAW = 500,  MAX_WITHDRAW = 500000;
const MIN_AIRTIME = 50,    MAX_AIRTIME = 50000;
const MIN_SAVE = 100,      MAX_SAVE = 10000000;
const MIN_GOAL = 1000,     MAX_GOAL = 100000000;
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

// ---------- errors (same codes the server version uses) ----------
class BankError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const bad = (msg) => new BankError("functions/invalid-argument", msg);       // user mistake
const blocked = (msg) => new BankError("functions/failed-precondition", msg); // rule broken

// ---------- helpers ----------
const round2 = (n) => Math.round(n * 100) / 100;
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");
const NAME_PATTERN = /^\p{L}[\p{L}\s'.-]*$/u;
const maskPhone = (p) => p.slice(0, 4) + "***" + p.slice(-4);

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new BankError("functions/unauthenticated", "Please log in first.");
  return user;
}

function checkAmount(amount, min, max) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) throw bad("Enter a valid amount.");
  if (round2(amount) !== amount) throw bad("Amount can have at most 2 decimal places.");
  if (amount < min) throw bad(`Minimum amount is ${naira(min)}.`);
  if (amount > max) throw bad(`Maximum amount is ${naira(max)}.`);
}

function checkRequestId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{10,64}$/.test(id)) throw bad("Invalid request. Please try again.");
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function checkPhone(phone) {
  if (typeof phone !== "string" || !/^0[789][01]\d{8}$/.test(phone)) throw bad("Enter a valid 11-digit Nigerian phone number.");
}
function checkNetwork(network) {
  if (!NETWORKS.includes(network)) throw bad("Please choose a network.");
}

// random 10-digit account number (first digit is never 0)
function randomAccountNumber() {
  const digits = new Uint32Array(10);
  crypto.getRandomValues(digits);
  let number = String(1 + (digits[0] % 9));
  for (let i = 1; i < 10; i++) number += String(digits[i] % 10);
  return number;
}

// writes a notification document (call inside a transaction, AFTER the reads)
function notify(t, id, userId, title, message) {
  t.set(doc(db, "notifications", id), {
    userId, title, message, read: false, createdAt: serverTimestamp()
  });
}

function activeAccount(snap) {
  if (!snap.exists()) throw blocked("Account not found.");
  const account = snap.data();
  if (account.accountStatus !== "active") throw blocked("This account is not active.");
  return { ...account, balance: Number(account.balance) || 0 };
}

// ==========================================================
// setupAccount - creates the profile + bank account (balance 0).
// Safe to call twice: it never overwrites an existing account.
// ==========================================================
async function setupAccount(data) {
  const user = requireUser();
  const uid = user.uid;

  // choose a name: the form, else the login's name, else the email, else a default
  let fullName = cleanText(data.fullName, 60);
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) fullName = cleanText(user.displayName || "", 60);
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) {
    const prefix = (user.email || "").split("@")[0].replace(/[^\p{L}]+/gu, " ").trim();
    fullName = prefix.length >= 2 ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "";
  }
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) fullName = "JIXBANK User";

  const userRef = doc(db, "users", uid);
  const accountRef = doc(db, "accounts", uid);
  const profile = () => ({ fullName, email: user.email || "", photoURL: "", createdAt: serverTimestamp() });

  for (let attempt = 0; attempt < 8; attempt++) {
    const number = randomAccountNumber();
    const lockRef = doc(db, "accountNumbers", number); // "lock": no two people share a number
    try {
      const outcome = await runTransaction(db, async (t) => {
        const acc = await t.get(accountRef);
        const usr = await t.get(userRef);

        if (acc.exists()) {                       // already set up
          if (!usr.exists()) t.set(userRef, profile());
          return "exists";
        }
        const lock = await t.get(lockRef);
        if (lock.exists()) throw new BankError("TAKEN", "number in use");

        t.set(lockRef, { uid });
        t.set(accountRef, {
          currency: "NGN", balance: 0, accountNumber: number,
          accountStatus: "active", createdAt: serverTimestamp()
        });
        if (!usr.exists()) t.set(userRef, profile());
        notify(t, `welcome_${uid}`, uid, "Welcome to JIXBANK 🎉", "Your demo account is ready. All money here is simulated.");
        return "created";
      });
      return { created: outcome === "created" };
    } catch (err) {
      if (err.code !== "TAKEN") throw err; // number taken? try another one
    }
  }
  throw blocked("Could not create your account. Please try again.");
}

// ==========================================================
// addMoney - SIMULATED deposit
// ==========================================================
async function addMoney({ amount, requestId }) {
  const user = requireUser();
  const uid = user.uid;
  checkAmount(amount, MIN_DEPOSIT, MAX_DEPOSIT);
  checkRequestId(requestId);

  const accountRef = doc(db, "accounts", uid);
  const txRef = doc(db, "transactions", `${uid}_${requestId}`);

  return runTransaction(db, async (t) => {
    const accountSnap = await t.get(accountRef);
    const txSnap = await t.get(txRef);

    if (txSnap.exists()) { // same request seen before: do not add twice
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    const account = activeAccount(accountSnap);
    const newBalance = round2(account.balance + amount);
    if (newBalance > MAX_BALANCE) throw blocked("This would exceed the demo account limit.");

    t.update(accountRef, { balance: newBalance });
    t.set(txRef, {
      userId: uid, direction: "credit", type: "deposit", amount,
      description: "Demo deposit (simulated)", status: "successful",
      simulated: true, createdAt: serverTimestamp()
    });
    notify(t, txRef.id, uid, "Deposit successful", `${naira(amount)} was added to your balance (simulated).`);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });
}

// ==========================================================
// lookupAccount - "who owns this account number?" (confirmation screen)
// ==========================================================
async function lookupAccount({ accountNumber }) {
  const user = requireUser();
  const number = String(accountNumber || "").trim();
  if (!/^\d{10}$/.test(number)) throw bad("Account number must be exactly 10 digits.");

  const lock = await getDoc(doc(db, "accountNumbers", number));
  if (!lock.exists()) throw bad("No JIXBANK account found with that number.");

  const recipientId = lock.data().uid;
  if (recipientId === user.uid) throw bad("You can't send money to yourself.");

  const userSnap = await getDoc(doc(db, "users", recipientId));
  const accountSnap = await getDoc(doc(db, "accounts", recipientId));
  if (!userSnap.exists() || !accountSnap.exists() || accountSnap.data().accountStatus !== "active") {
    throw blocked("That account can't receive money right now.");
  }
  return { accountNumber: number, fullName: userSnap.data().fullName };
}

// ==========================================================
// transfer - both balances, both history records and both
// notifications change together, or nothing changes at all.
// ==========================================================
async function transfer({ accountNumber, amount, description, requestId }) {
  const user = requireUser();
  const uid = user.uid;

  checkRequestId(requestId);
  checkAmount(amount, MIN_TRANSFER, MAX_TRANSFER);
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) throw bad("Account number must be exactly 10 digits.");
  const note = cleanText(description, 100);

  const lock = await getDoc(doc(db, "accountNumbers", accountNumber));
  if (!lock.exists()) throw bad("No JIXBANK account found with that number.");
  const recipientId = lock.data().uid;
  if (recipientId === uid) throw bad("You can't send money to yourself.");

  const senderAccRef = doc(db, "accounts", uid);
  const recipientAccRef = doc(db, "accounts", recipientId);
  const senderUserRef = doc(db, "users", uid);
  const recipientUserRef = doc(db, "users", recipientId);
  const outRef = doc(db, "transactions", `${uid}_${requestId}`);      // sender's record
  const inRef = doc(db, "transactions", `${uid}_${requestId}_in`);    // recipient's record

  return runTransaction(db, async (t) => {
    // ALL reads first...
    const sAcc = await t.get(senderAccRef);
    const rAcc = await t.get(recipientAccRef);
    const sUser = await t.get(senderUserRef);
    const rUser = await t.get(recipientUserRef);
    const outSnap = await t.get(outRef);

    if (outSnap.exists()) {
      return { duplicate: true, balance: sAcc.data().balance, transactionId: outRef.id };
    }

    const sender = activeAccount(sAcc);
    if (!rAcc.exists() || rAcc.data().accountStatus !== "active") throw blocked("That account can't receive money right now.");
    const recipientBalance = Number(rAcc.data().balance) || 0;

    if (amount > sender.balance) throw blocked("Insufficient funds.");
    const newRecipientBalance = round2(recipientBalance + amount);
    if (newRecipientBalance > MAX_BALANCE) throw blocked("The recipient's account can't receive that amount.");

    const senderName = sUser.exists() ? sUser.data().fullName : "A JIXBANK user";
    const recipientName = rUser.exists() ? rUser.data().fullName : "A JIXBANK user";
    const newSenderBalance = round2(sender.balance - amount);

    // ...then ALL writes
    t.update(senderAccRef, { balance: newSenderBalance });
    t.update(recipientAccRef, { balance: newRecipientBalance });

    t.set(outRef, {
      userId: uid, senderId: uid, recipientId, direction: "debit", type: "transfer", amount,
      description: note ? `Transfer to ${recipientName}: ${note}` : `Transfer to ${recipientName}`,
      counterpartyName: recipientName, status: "successful", simulated: true,
      createdAt: serverTimestamp()
    });
    t.set(inRef, {
      userId: recipientId, senderId: uid, recipientId, direction: "credit", type: "transfer", amount,
      description: note ? `Transfer from ${senderName}: ${note}` : `Transfer from ${senderName}`,
      counterpartyName: senderName, status: "successful", simulated: true,
      createdAt: serverTimestamp()
    });

    notify(t, outRef.id, uid, "Transfer sent", `You sent ${naira(amount)} to ${recipientName} (simulated).`);
    notify(t, inRef.id, recipientId, "Money received", `${senderName} sent you ${naira(amount)} (simulated).`);

    return { duplicate: false, balance: newSenderBalance, transactionId: outRef.id, recipientName };
  });
}

// ==========================================================
// spend - take money OUT of the main balance, once only.
// Used by withdrawals, airtime and data.
// ==========================================================
async function spend(uid, requestId, spec) {
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
    t.update(accountRef, { balance: newBalance });
    t.set(txRef, {
      userId: uid, direction: "debit", type: spec.type, amount: spec.amount,
      description: spec.description, status: spec.status, simulated: true,
      ...(spec.extra || {}), createdAt: serverTimestamp()
    });
    notify(t, txRef.id, uid, spec.title, spec.message);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });
}

async function requestWithdrawal({ amount, bankName, accountNumber, accountName, requestId }) {
  const user = requireUser();
  checkRequestId(requestId);
  checkAmount(amount, MIN_WITHDRAW, MAX_WITHDRAW);
  if (!BANKS.includes(bankName)) throw bad("Please choose a bank.");
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) throw bad("Account number must be exactly 10 digits.");
  const name = cleanText(accountName, 60);
  if (name.length < 2 || !NAME_PATTERN.test(name)) throw bad("Enter the account name (letters only).");

  return spend(user.uid, requestId, {
    amount, type: "withdrawal", status: "pending",
    description: `Withdrawal to ${bankName} ****${accountNumber.slice(-4)} (simulated)`,
    extra: { counterpartyName: name },
    title: "Withdrawal requested",
    message: `Your simulated withdrawal of ${naira(amount)} is pending. No real money moves.`
  });
}

async function buyAirtime({ network, phone, amount, requestId }) {
  const user = requireUser();
  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  checkAmount(amount, MIN_AIRTIME, MAX_AIRTIME);

  return spend(user.uid, requestId, {
    amount, type: "airtime", status: "successful",
    description: `${network} airtime for ${maskPhone(phone)} (simulated)`,
    title: "Airtime purchase (simulated)",
    message: `${naira(amount)} ${network} airtime for ${maskPhone(phone)}. No real airtime was delivered.`
  });
}

async function buyData({ network, phone, planId, requestId }) {
  const user = requireUser();
  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  const plan = Object.prototype.hasOwnProperty.call(DATA_PLANS, planId) ? DATA_PLANS[planId] : null;
  if (!plan) throw bad("Please choose a data plan.");

  return spend(user.uid, requestId, {
    amount: plan.price, type: "data", status: "successful",
    description: `${network} ${plan.label} for ${maskPhone(phone)} (simulated)`,
    title: "Data purchase (simulated)",
    message: `${network} ${plan.label} for ${maskPhone(phone)}. No real data was delivered.`
  });
}

// ==========================================================
// savings goals (separate from the main balance)
// ==========================================================
async function createSavingsGoal({ goalName, targetAmount, requestId }) {
  const user = requireUser();
  const uid = user.uid;

  checkRequestId(requestId);
  const name = cleanText(goalName, 40);
  if (name.length < 2) throw bad("Give your goal a name (at least 2 characters).");
  checkAmount(targetAmount, MIN_GOAL, MAX_GOAL);

  const existing = await getDocs(query(collection(db, "savings"), where("userId", "==", uid)));
  if (existing.size >= MAX_GOALS) throw blocked(`You can have at most ${MAX_GOALS} savings goals.`);

  const ref = doc(db, "savings", `${uid}_${requestId}`);
  return runTransaction(db, async (t) => {
    const snap = await t.get(ref);
    if (snap.exists()) return { duplicate: true, savingId: ref.id };
    t.set(ref, {
      userId: uid, goalName: name, targetAmount, savedAmount: 0,
      simulated: true, createdAt: serverTimestamp()
    });
    return { duplicate: false, savingId: ref.id };
  });
}

// direction "add" = main balance -> goal.  "withdraw" = goal -> main balance.
async function moveSavings({ savingId, amount, requestId }, direction) {
  const user = requireUser();
  const uid = user.uid;

  checkRequestId(requestId);
  checkAmount(amount, MIN_SAVE, MAX_SAVE);
  if (typeof savingId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(savingId)) throw bad("Savings goal not found.");

  const savingRef = doc(db, "savings", savingId);
  const accountRef = doc(db, "accounts", uid);
  const txRef = doc(db, "transactions", `${uid}_${requestId}`);

  return runTransaction(db, async (t) => {
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
    t.update(accountRef, { balance: newBalance });
    t.set(txRef, {
      userId: uid, direction: direction === "add" ? "debit" : "credit", type: "savings", amount,
      description: direction === "add" ? `Saved to "${goalName}" (simulated)` : `Withdrawn from "${goalName}" (simulated)`,
      status: "successful", simulated: true, createdAt: serverTimestamp()
    });
    notify(t, txRef.id, uid,
      direction === "add" ? "Added to savings" : "Withdrawn from savings",
      `${naira(amount)} ${direction === "add" ? "moved into" : "moved out of"} "${goalName}" (simulated).`);

    return { duplicate: false, balance: newBalance, savedAmount: newSaved, transactionId: txRef.id };
  });
}

// the list the rest of the app uses (same names as the server functions)
export const localBank = {
  setupAccount,
  addMoney,
  lookupAccount,
  transfer,
  requestWithdrawal,
  buyAirtime,
  buyData,
  createSavingsGoal,
  addToSavings: (data) => moveSavings(data, "add"),
  withdrawFromSavings: (data) => moveSavings(data, "withdraw")
};
