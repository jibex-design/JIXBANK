// ==========================================================
// functions/index.js - TRUSTED SERVER CODE
// Only this code (never the browser) may change balances or
// create transactions. Everything is SIMULATED: no real money.
// ==========================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { randomInt } = require("crypto");

initializeApp();
const db = getFirestore();

// ---------- limits (enforced HERE, not just in the browser) ----------
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

// The SERVER decides prices. The browser only says which plan it wants.
const DATA_PLANS = {
  d500m: { label: "500MB - 7 days",  price: 500 },
  d1g:   { label: "1.5GB - 30 days", price: 1000 },
  d3g:   { label: "3GB - 30 days",   price: 1500 },
  d6g:   { label: "6GB - 30 days",   price: 2500 },
  d12g:  { label: "12GB - 30 days",  price: 4000 }
};

// ---------- small helpers ----------
const round2 = (n) => Math.round(n * 100) / 100;
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");
const bad = (msg) => new HttpsError("invalid-argument", msg);       // user mistake
const blocked = (msg) => new HttpsError("failed-precondition", msg); // rule broken

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please log in first.");
  return request.auth.uid; // from the verified login token, never from the browser's data
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

// removes control characters and angle brackets, trims, and limits the length
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

const NAME_PATTERN = /^\p{L}[\p{L}\s'.-]*$/u;
const maskPhone = (p) => p.slice(0, 4) + "***" + p.slice(-4);

// writes a notification document (call inside a transaction, after the reads)
function notify(t, id, userId, title, message) {
  t.set(db.doc(`notifications/${id}`), {
    userId, title, message, read: false, createdAt: FieldValue.serverTimestamp()
  });
}

// checks an account snapshot is usable and returns its data
function activeAccount(snap) {
  if (!snap.exists) throw blocked("Account not found.");
  const account = snap.data();
  if (account.accountStatus !== "active") throw blocked("This account is not active.");
  return { ...account, balance: Number(account.balance) || 0 };
}

// ==========================================================
// setupAccount - creates the profile + bank account (balance 0).
// Safe to call twice: it never overwrites an existing account.
// ==========================================================
exports.setupAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  const authUser = await getAuth().getUser(uid);

  let fullName = cleanText((request.data || {}).fullName, 60);
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) {
    fullName = cleanText(authUser.displayName || "", 60);
  }
  if (fullName.length < 2 || !NAME_PATTERN.test(fullName)) fullName = "JIXBANK User";

  const userRef = db.doc(`users/${uid}`);
  const accountRef = db.doc(`accounts/${uid}`);
  const [userSnap, accountSnap] = await Promise.all([userRef.get(), accountRef.get()]);

  const profile = { fullName, email: authUser.email || "", photoURL: "", createdAt: FieldValue.serverTimestamp() };

  if (accountSnap.exists) {
    if (!userSnap.exists) await userRef.set(profile);
    return { ok: true, created: false };
  }

  // Pick a unique 10-digit account number. accountNumbers/{number} is a
  // "lock" document: two people can never get the same number.
  for (let attempt = 0; attempt < 8; attempt++) {
    const number = String(randomInt(1000000000, 9999999999));
    const lockRef = db.doc(`accountNumbers/${number}`);
    try {
      await db.runTransaction(async (t) => {
        const [acc, lock, user] = await Promise.all([t.get(accountRef), t.get(lockRef), t.get(userRef)]);
        if (acc.exists) return;
        if (lock.exists) throw new Error("TAKEN");

        t.set(lockRef, { uid });
        t.set(accountRef, {
          currency: "NGN", balance: 0, accountNumber: number,
          accountStatus: "active", createdAt: FieldValue.serverTimestamp()
        });
        if (!user.exists) t.set(userRef, profile);
        notify(t, `welcome_${uid}`, uid, "Welcome to JIXBANK 🎉", "Your demo account is ready. All money here is simulated.");
      });
      return { ok: true, created: true };
    } catch (err) {
      if (err.message !== "TAKEN") throw err;
    }
  }
  throw new HttpsError("internal", "Could not create your account. Please try again.");
});

// ==========================================================
// addMoney - SIMULATED deposit
// ==========================================================
exports.addMoney = onCall(async (request) => {
  const uid = requireAuth(request);
  const { amount, requestId } = request.data || {};
  checkAmount(amount, MIN_DEPOSIT, MAX_DEPOSIT);
  checkRequestId(requestId);

  const accountRef = db.doc(`accounts/${uid}`);
  const txRef = db.doc(`transactions/${uid}_${requestId}`);

  const result = await db.runTransaction(async (t) => {
    const [accountSnap, txSnap] = await Promise.all([t.get(accountRef), t.get(txRef)]);

    if (txSnap.exists) { // same request seen before: do not add twice
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    const account = activeAccount(accountSnap);
    const newBalance = round2(account.balance + amount);
    if (newBalance > MAX_BALANCE) throw blocked("This would exceed the demo account limit.");

    t.update(accountRef, { balance: newBalance });
    t.set(txRef, {
      userId: uid, direction: "credit", type: "deposit", amount,
      description: "Demo deposit (simulated)", status: "successful",
      simulated: true, createdAt: FieldValue.serverTimestamp()
    });
    notify(t, txRef.id, uid, "Deposit successful", `${naira(amount)} was added to your balance (simulated).`);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });

  return { ok: true, ...result };
});

// ==========================================================
// lookupAccount - "who owns this account number?" Returns the
// NAME only, never the balance.
// ==========================================================
exports.lookupAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  const number = String((request.data || {}).accountNumber || "").trim();
  if (!/^\d{10}$/.test(number)) throw bad("Account number must be exactly 10 digits.");

  const lock = await db.doc(`accountNumbers/${number}`).get();
  if (!lock.exists) throw bad("No JIXBANK account found with that number.");

  const recipientId = lock.data().uid;
  if (recipientId === uid) throw bad("You can't send money to yourself.");

  const [userSnap, accountSnap] = await Promise.all([
    db.doc(`users/${recipientId}`).get(),
    db.doc(`accounts/${recipientId}`).get()
  ]);
  if (!userSnap.exists || !accountSnap.exists || accountSnap.data().accountStatus !== "active") {
    throw blocked("That account can't receive money right now.");
  }
  return { ok: true, accountNumber: number, fullName: userSnap.data().fullName };
});

// ==========================================================
// transfer - move SIMULATED money between two JIXBANK accounts.
// One Firestore transaction: both balances + both history records
// change together, or nothing changes at all.
// ==========================================================
exports.transfer = onCall(async (request) => {
  const uid = requireAuth(request);
  const { accountNumber, amount, description, requestId } = request.data || {};

  checkRequestId(requestId);
  checkAmount(amount, MIN_TRANSFER, MAX_TRANSFER);
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) {
    throw bad("Account number must be exactly 10 digits.");
  }
  const note = cleanText(description, 100);

  const lock = await db.doc(`accountNumbers/${accountNumber}`).get();
  if (!lock.exists) throw bad("No JIXBANK account found with that number.");
  const recipientId = lock.data().uid;
  if (recipientId === uid) throw bad("You can't send money to yourself.");

  const senderAccRef = db.doc(`accounts/${uid}`);
  const recipientAccRef = db.doc(`accounts/${recipientId}`);
  const senderUserRef = db.doc(`users/${uid}`);
  const recipientUserRef = db.doc(`users/${recipientId}`);
  const outRef = db.doc(`transactions/${uid}_${requestId}`);     // sender's record
  const inRef = db.doc(`transactions/${uid}_${requestId}_in`);   // recipient's record

  const result = await db.runTransaction(async (t) => {
    // ALL reads first...
    const [sAcc, rAcc, sUser, rUser, outSnap] = await Promise.all([
      t.get(senderAccRef), t.get(recipientAccRef),
      t.get(senderUserRef), t.get(recipientUserRef), t.get(outRef)
    ]);

    if (outSnap.exists) {
      return { duplicate: true, balance: sAcc.data().balance, transactionId: outRef.id };
    }

    const sender = activeAccount(sAcc);
    if (!rAcc.exists || rAcc.data().accountStatus !== "active") {
      throw blocked("That account can't receive money right now.");
    }
    const recipientBalance = Number(rAcc.data().balance) || 0;

    if (amount > sender.balance) throw blocked("Insufficient funds.");
    const newRecipientBalance = round2(recipientBalance + amount);
    if (newRecipientBalance > MAX_BALANCE) throw blocked("The recipient's account can't receive that amount.");

    const senderName = sUser.exists ? sUser.data().fullName : "A JIXBANK user";
    const recipientName = rUser.exists ? rUser.data().fullName : "A JIXBANK user";
    const newSenderBalance = round2(sender.balance - amount);

    // ...then ALL writes
    t.update(senderAccRef, { balance: newSenderBalance });
    t.update(recipientAccRef, { balance: newRecipientBalance });

    t.set(outRef, {
      userId: uid, senderId: uid, recipientId, direction: "debit", type: "transfer",
      amount, description: note ? `Transfer to ${recipientName}: ${note}` : `Transfer to ${recipientName}`,
      counterpartyName: recipientName, status: "successful", simulated: true,
      createdAt: FieldValue.serverTimestamp()
    });
    t.set(inRef, {
      userId: recipientId, senderId: uid, recipientId, direction: "credit", type: "transfer",
      amount, description: note ? `Transfer from ${senderName}: ${note}` : `Transfer from ${senderName}`,
      counterpartyName: senderName, status: "successful", simulated: true,
      createdAt: FieldValue.serverTimestamp()
    });

    notify(t, outRef.id, uid, "Transfer sent", `You sent ${naira(amount)} to ${recipientName} (simulated).`);
    notify(t, inRef.id, recipientId, "Money received", `${senderName} sent you ${naira(amount)} (simulated).`);

    return { duplicate: false, balance: newSenderBalance, transactionId: outRef.id, recipientName };
  });

  return { ok: true, ...result };
});

// ==========================================================
// STEP 10 FUNCTIONS (savings, withdrawals, airtime, data)
// ==========================================================

// Shared helper: take money OUT of the main balance, once only.
async function spend(uid, requestId, spec) {
  const accountRef = db.doc(`accounts/${uid}`);
  const txRef = db.doc(`transactions/${uid}_${requestId}`);

  return db.runTransaction(async (t) => {
    const [accountSnap, txSnap] = await Promise.all([t.get(accountRef), t.get(txRef)]);
    if (txSnap.exists) {
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    const account = activeAccount(accountSnap);
    if (spec.amount > account.balance) throw blocked("Insufficient funds.");

    const newBalance = round2(account.balance - spec.amount);
    t.update(accountRef, { balance: newBalance });
    t.set(txRef, {
      userId: uid, direction: "debit", type: spec.type, amount: spec.amount,
      description: spec.description, status: spec.status, simulated: true,
      ...(spec.extra || {}), createdAt: FieldValue.serverTimestamp()
    });
    notify(t, txRef.id, uid, spec.title, spec.message);
    return { duplicate: false, balance: newBalance, transactionId: txRef.id };
  });
}

function checkPhone(phone) {
  if (typeof phone !== "string" || !/^0[789][01]\d{8}$/.test(phone)) {
    throw bad("Enter a valid 11-digit Nigerian phone number.");
  }
}
function checkNetwork(network) {
  if (!NETWORKS.includes(network)) throw bad("Please choose a network.");
}

// ----- withdrawal REQUEST (simulated, stays "pending") -----
exports.requestWithdrawal = onCall(async (request) => {
  const uid = requireAuth(request);
  const { amount, bankName, accountNumber, accountName, requestId } = request.data || {};

  checkRequestId(requestId);
  checkAmount(amount, MIN_WITHDRAW, MAX_WITHDRAW);
  if (!BANKS.includes(bankName)) throw bad("Please choose a bank.");
  if (typeof accountNumber !== "string" || !/^\d{10}$/.test(accountNumber)) throw bad("Account number must be exactly 10 digits.");
  const name = cleanText(accountName, 60);
  if (name.length < 2 || !NAME_PATTERN.test(name)) throw bad("Enter the account name (letters only).");

  const result = await spend(uid, requestId, {
    amount, type: "withdrawal", status: "pending",
    description: `Withdrawal to ${bankName} ****${accountNumber.slice(-4)} (simulated)`,
    extra: { counterpartyName: name },
    title: "Withdrawal requested",
    message: `Your simulated withdrawal of ${naira(amount)} is pending. No real money moves.`
  });
  return { ok: true, ...result };
});

// ----- airtime (simulated) -----
exports.buyAirtime = onCall(async (request) => {
  const uid = requireAuth(request);
  const { network, phone, amount, requestId } = request.data || {};

  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  checkAmount(amount, MIN_AIRTIME, MAX_AIRTIME);

  const result = await spend(uid, requestId, {
    amount, type: "airtime", status: "successful",
    description: `${network} airtime for ${maskPhone(phone)} (simulated)`,
    title: "Airtime purchase (simulated)",
    message: `${naira(amount)} ${network} airtime for ${maskPhone(phone)}. No real airtime was delivered.`
  });
  return { ok: true, ...result };
});

// ----- data bundle (simulated) -----
exports.buyData = onCall(async (request) => {
  const uid = requireAuth(request);
  const { network, phone, planId, requestId } = request.data || {};

  checkRequestId(requestId);
  checkNetwork(network);
  checkPhone(phone);
  const plan = Object.prototype.hasOwnProperty.call(DATA_PLANS, planId) ? DATA_PLANS[planId] : null;
  if (!plan) throw bad("Please choose a data plan.");

  const result = await spend(uid, requestId, {
    amount: plan.price, type: "data", status: "successful",
    description: `${network} ${plan.label} for ${maskPhone(phone)} (simulated)`,
    title: "Data purchase (simulated)",
    message: `${network} ${plan.label} for ${maskPhone(phone)}. No real data was delivered.`
  });
  return { ok: true, ...result };
});

// ----- savings goals (simulated, separate from the main balance) -----
exports.createSavingsGoal = onCall(async (request) => {
  const uid = requireAuth(request);
  const { goalName, targetAmount, requestId } = request.data || {};

  checkRequestId(requestId);
  const name = cleanText(goalName, 40);
  if (name.length < 2) throw bad("Give your goal a name (at least 2 characters).");
  checkAmount(targetAmount, MIN_GOAL, MAX_GOAL);

  const count = await db.collection("savings").where("userId", "==", uid).count().get();
  if (count.data().count >= MAX_GOALS) throw blocked(`You can have at most ${MAX_GOALS} savings goals.`);

  const ref = db.doc(`savings/${uid}_${requestId}`);
  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (snap.exists) return { duplicate: true, savingId: ref.id };
    t.set(ref, {
      userId: uid, goalName: name, targetAmount, savedAmount: 0,
      simulated: true, createdAt: FieldValue.serverTimestamp()
    });
    return { duplicate: false, savingId: ref.id };
  });
  return { ok: true, ...result };
});

// direction "add" = main balance -> goal.  "withdraw" = goal -> main balance.
async function moveSavings(request, direction) {
  const uid = requireAuth(request);
  const { savingId, amount, requestId } = request.data || {};

  checkRequestId(requestId);
  checkAmount(amount, MIN_SAVE, MAX_SAVE);
  if (typeof savingId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(savingId)) throw bad("Savings goal not found.");

  const savingRef = db.doc(`savings/${savingId}`);
  const accountRef = db.doc(`accounts/${uid}`);
  const txRef = db.doc(`transactions/${uid}_${requestId}`);

  const result = await db.runTransaction(async (t) => {
    const [saving, accountSnap, txSnap] = await Promise.all([t.get(savingRef), t.get(accountRef), t.get(txRef)]);

    if (txSnap.exists) {
      return { duplicate: true, balance: accountSnap.data().balance, transactionId: txRef.id };
    }
    if (!saving.exists || saving.data().userId !== uid) throw bad("Savings goal not found.");
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
      status: "successful", simulated: true, createdAt: FieldValue.serverTimestamp()
    });
    notify(t, txRef.id, uid,
      direction === "add" ? "Added to savings" : "Withdrawn from savings",
      `${naira(amount)} ${direction === "add" ? "moved into" : "moved out of"} "${goalName}" (simulated).`);

    return { duplicate: false, balance: newBalance, savedAmount: newSaved, transactionId: txRef.id };
  });
  return { ok: true, ...result };
}

exports.addToSavings = onCall((request) => moveSavings(request, "add"));
exports.withdrawFromSavings = onCall((request) => moveSavings(request, "withdraw"));
