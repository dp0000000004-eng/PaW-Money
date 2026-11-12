const ACCOUNT_KEY = "paw-money-accounts";
const SESSION_KEY = "paw-money-session";
const DATA_PREFIX = "paw-money-data-";
const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", JPY: "¥" };
const CATEGORY_OPTIONS = {
  income: ["Salary", "Freelance", "Gift", "Refund", "Savings", "Other"],
  expense: ["Food & dining", "Transport", "Shopping", "Bills & utilities", "Health", "Entertainment", "Home", "Other"],
};
const CATEGORY_ICONS = {
  Salary: "↗", Freelance: "✳", Gift: "♡", Refund: "↶", Savings: "◉", "Food & dining": "◒",
  Transport: "↗", Shopping: "◇", "Bills & utilities": "⌁", Health: "✚", Entertainment: "♫", Home: "⌂", Other: "·",
};

const authScreen = document.querySelector("#authScreen");
const appShell = document.querySelector("#appShell");
const authForm = document.querySelector("#authForm");
const authName = document.querySelector("#authName");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const nameField = document.querySelector("#nameField");
const currencyField = document.querySelector("#currencyField");
const transactionDialog = document.querySelector("#transactionDialog");
const transactionForm = document.querySelector("#transactionForm");
const toast = document.querySelector("#toast");

let currentUser = null;
let transactions = [];
let transactionType = "income";
let installPrompt = null;
let toastTimer;

function getAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    throw new Error("Your saved account information could not be read. Please clear this app's local data and try again.");
  }
}

function getTransactions(email) {
  try {
    const stored = JSON.parse(localStorage.getItem(DATA_PREFIX + email) || "[]");
    if (!Array.isArray(stored)) throw new Error("Invalid transaction history.");
    return stored.filter((entry) => (
      entry && typeof entry.id === "string" &&
      (entry.type === "income" || entry.type === "expense") &&
      Number.isFinite(entry.amount) && entry.amount > 0 &&
      typeof entry.description === "string" &&
      typeof entry.category === "string" &&
      typeof entry.date === "string"
    ));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Your saved transaction history could not be read. Please clear this app's local data and try again.");
    }
    throw error;
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(DATA_PREFIX + currentUser.email, JSON.stringify(transactions));
  } catch {
    showToast("Couldn't save this transaction. Check your device's available storage and try again.", true);
    return false;
  }
  return true;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatAmount(amount, withSign = false) {
  const currency = currentUser?.currency || "INR";
  const value = new Intl.NumberFormat("en", {
    minimumFractionDigits: currency === "JPY" ? 0 : 0,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? "−" : withSign && amount > 0 ? "+" : "";
  return `${sign}${CURRENCY_SYMBOLS[currency] || ""}${value}`;
}

function localDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function monthKey(date) {
  return date.slice(0, 7);
}

function previousMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  return localDate(new Date(year, month - 2, 1)).slice(0, 7);
}

function monthLabel(key, options = { month: "long", year: "numeric" }) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, 1));
}

function dateLabel(date, includeYear = false) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(year, month - 1, day));
}

function sortedTransactions(list = transactions) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function transactionsForMonth(key) {
  return transactions.filter((entry) => monthKey(entry.date) === key);
}

function totalsFor(list) {
  const income = list.reduce((sum, entry) => sum + (entry.type === "income" ? entry.amount : 0), 0);
  const expense = list.reduce((sum, entry) => sum + (entry.type === "expense" ? entry.amount : 0), 0);
  return { income, expense, net: income - expense };
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  nameField.hidden = !isSignup;
  currencyField.hidden = !isSignup;
  authName.required = isSignup;
  authPassword.autocomplete = isSignup ? "new-password" : "current-password";
  document.querySelector("#authTitle").innerHTML = isSignup
    ? 'Your money, <span>in balance.</span>'
    : 'A good place to <span>begin again.</span>';
  document.querySelector("#authDescription").textContent = isSignup
    ? "Create your account to start keeping track."
    : "Welcome back. Your money history is right where you left it.";
  document.querySelector("#authSubmit").innerHTML = isSignup
    ? 'Create my account <span aria-hidden="true">→</span>'
    : 'Log in to Credora <span aria-hidden="true">→</span>';
  authForm.dataset.mode = mode;
}

async function passwordHash(password, salt) {
  if (!crypto.subtle) throw new Error("Secure sign-in needs a secure connection (HTTPS or localhost).");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: Uint8Array.from(atob(salt), (character) => character.charCodeAt(0)), iterations: 120000, hash: "SHA-256",
  }, key, 256);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function showApp(user) {
  currentUser = user;
  try {
    transactions = getTransactions(user.email);
  } catch (error) {
    showToast(error.message, true);
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    return;
  }
  authScreen.hidden = true;
  appShell.hidden = false;
  document.querySelector("#userName").textContent = user.name;
  document.querySelector("#userEmail").textContent = user.email;
  document.querySelector("#userAvatar").textContent = [...user.name.trim()][0]?.toUpperCase() || "P";
  document.querySelector("#greetingName").textContent = user.name.split(/\s+/)[0];
  document.querySelector("#currencySelect").value = CURRENCY_SYMBOLS[user.currency] ? user.currency : "INR";
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  }).format(new Date());
  renderApp();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = authForm.dataset.mode;
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;
  const submitButton = document.querySelector("#authSubmit");
  submitButton.disabled = true;

  try {
    const accounts = getAccounts();
    if (mode === "signup") {
      if (accounts.some((account) => account.email === email)) {
        showToast("An account with that email already exists on this device. Try logging in.", true);
        return;
      }
      const salt = createSalt();
      const account = {
        name: authName.value.trim(),
        email,
        salt,
        passwordHash: await passwordHash(password, salt),
        currency: document.querySelector("#signupCurrency").value,
      };
      accounts.push(account);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
      localStorage.setItem(SESSION_KEY, email);
      showApp(account);
      showToast(`Welcome to Credora, ${account.name.split(/\s+/)[0]}!`);
    } else {
      const account = accounts.find((item) => item.email === email);
      if (!account || await passwordHash(password, account.salt) !== account.passwordHash) {
        showToast("That email and password don't match an account on this device.", true);
        return;
      }
      localStorage.setItem(SESSION_KEY, email);
      showApp(account);
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Something went wrong. Please try again.", true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

function amountClass(amount) {
  return amount > 0 ? "positive" : amount < 0 ? "negative" : "";
}

function renderTransaction(entry) {
  const isIncome = entry.type === "income";
  const amount = isIncome ? entry.amount : -entry.amount;
  const title = escapeHTML(entry.description);
  const icon = CATEGORY_ICONS[entry.category] || "·";
  const category = escapeHTML(entry.category);
  const date = dateLabel(entry.date, true);
  return `<article class="transaction-row">
    <span class="transaction-icon ${isIncome ? "income" : "expense"}" aria-hidden="true">${icon}</span>
    <span class="transaction-copy"><strong>${title}</strong><small>${category} · ${date}</small></span>
    <span class="transaction-trailing"><span class="transaction-amount ${isIncome ? "" : "expense"}">${isIncome ? "+" : "−"}${formatAmount(entry.amount)}</span>
    <button class="delete-transaction" type="button" data-delete-transaction="${escapeHTML(entry.id)}" aria-label="Delete ${title} transaction">×</button></span>
  </article>`;
}

function renderList(container, list, message) {
  container.innerHTML = list.length
    ? list.map(renderTransaction).join("")
    : `<div class="empty-state">${message}</div>`;
}

function renderOverview() {
  const nowKey = localDate().slice(0, 7);
  const previousKey = previousMonthKey(nowKey);
  const balance = totalsFor(transactions).net;
  const currentTotals = totalsFor(transactionsForMonth(nowKey));
  const priorTotals = totalsFor(transactionsForMonth(previousKey));
  document.querySelector("#overviewMonthLabel").textContent = `YOUR MONEY, ${monthLabel(nowKey).toUpperCase()}`;
  const balanceAmount = document.querySelector("#balanceAmount");
  balanceAmount.textContent = formatAmount(balance, true);
  balanceAmount.title = formatAmount(balance, true);
  const monthNet = document.querySelector("#monthNet");
  monthNet.textContent = formatAmount(currentTotals.net, true);
  monthNet.className = `stat-amount ${amountClass(currentTotals.net)}`;
  document.querySelector("#monthNetCaption").textContent = currentTotals.net < 0
    ? `${formatAmount(Math.abs(currentTotals.net))} more went out than came in`
    : "Income minus expenses";
  document.querySelector("#monthIncome").textContent = formatAmount(currentTotals.income);
  document.querySelector("#monthExpense").textContent = formatAmount(currentTotals.expense);
  const previousNet = document.querySelector("#previousNet");
  previousNet.textContent = formatAmount(priorTotals.net, true);
  previousNet.className = `stat-amount ${amountClass(priorTotals.net)}`;
  document.querySelector("#previousMonthName").textContent = monthLabel(previousKey);

  const entries = sortedTransactions();
  renderList(document.querySelector("#recentTransactions"), entries.slice(0, 5),
    "Nothing to see here just yet. Add your first transaction and it will appear here.");

  const insightTitle = document.querySelector("#insightTitle");
  const insightText = document.querySelector("#insightText");
  const insightFootnote = document.querySelector("#insightFootnote");
  if (!entries.length) {
    insightTitle.textContent = "A fresh start.";
    insightText.textContent = "Add your first bit of income or expense and your picture will start to take shape.";
    insightFootnote.textContent = "Your money, your pace.";
  } else if (balance < 0) {
    insightTitle.textContent = "A little in the red.";
    insightText.textContent = `${formatAmount(Math.abs(balance))} more has gone out than has come in. Your full history is here whenever you need it.`;
    insightFootnote.textContent = "You're not alone. One step at a time.";
  } else if (currentTotals.net < 0) {
    insightTitle.textContent = "More went out this month.";
    insightText.textContent = `${formatAmount(Math.abs(currentTotals.net))} more went out than came in this month. Your all-time balance is ${formatAmount(balance)}.`;
    insightFootnote.textContent = "Just a check-in, never a judgment.";
  } else {
    insightTitle.textContent = "You're finding your flow.";
    insightText.textContent = currentTotals.net > 0
      ? `${formatAmount(currentTotals.net)} more came in than went out this month. Nice work keeping track.`
      : "Your numbers are up to date. Keep adding transactions whenever you're ready.";
    insightFootnote.textContent = "A clearer picture, one day at a time.";
  }
}

function getMonthKeys() {
  const months = new Set([localDate().slice(0, 7)]);
  transactions.forEach((entry) => months.add(monthKey(entry.date)));
  return [...months].sort((a, b) => b.localeCompare(a));
}

function renderMonthSelect(select, selectedValue) {
  const options = getMonthKeys();
  select.innerHTML = options.map((key) => `<option value="${key}">${escapeHTML(monthLabel(key))}</option>`).join("");
  select.value = options.includes(selectedValue) ? selectedValue : options[0];
  return select.value;
}

function renderHistory() {
  const select = document.querySelector("#historyMonthSelect");
  const key = renderMonthSelect(select, select.value || localDate().slice(0, 7));
  const entries = sortedTransactions(transactionsForMonth(key));
  document.querySelector("#historyCount").textContent = `${entries.length} ${entries.length === 1 ? "transaction" : "transactions"} in ${monthLabel(key)}`;
  renderList(document.querySelector("#allTransactions"), entries,
    `No transactions in ${escapeHTML(monthLabel(key))} yet. Add one whenever you like.`);
}

function renderReport() {
  const select = document.querySelector("#reportMonthSelect");
  const key = renderMonthSelect(select, select.value || localDate().slice(0, 7));
  const entries = transactionsForMonth(key);
  const totals = totalsFor(entries);
  const balance = totalsFor(transactions).net;
  const net = document.querySelector("#reportNet");
  net.textContent = formatAmount(totals.net, true);
  net.className = `report-net ${amountClass(totals.net)}`;
  document.querySelector("#reportIncome").textContent = formatAmount(totals.income);
  document.querySelector("#reportExpense").textContent = formatAmount(totals.expense);
  document.querySelector("#reportBalance").textContent = formatAmount(balance, true);
  const incomeCount = entries.filter((entry) => entry.type === "income").length;
  const expenseCount = entries.filter((entry) => entry.type === "expense").length;
  document.querySelector("#reportIncomeCount").textContent = `${incomeCount} ${incomeCount === 1 ? "deposit" : "deposits"}`;
  document.querySelector("#reportExpenseCount").textContent = `${expenseCount} ${expenseCount === 1 ? "expense" : "expenses"}`;
  document.querySelector("#flowIncome").textContent = formatAmount(totals.income);
  document.querySelector("#flowExpense").textContent = formatAmount(totals.expense);
  const maxFlow = Math.max(totals.income, totals.expense, 1);
  document.querySelector("#incomeBar").style.width = `${Math.max(1, totals.income / maxFlow * 100)}%`;
  document.querySelector("#expenseBar").style.width = `${Math.max(1, totals.expense / maxFlow * 100)}%`;
  document.querySelector("#comparisonNote").textContent = !entries.length
    ? `No transactions in ${monthLabel(key)} yet. Add them as you go, and your report will be waiting here.`
    : totals.net < 0
      ? `${formatAmount(Math.abs(totals.net))} more went out than came in during ${monthLabel(key)}.`
      : `${formatAmount(totals.net)} more came in than went out during ${monthLabel(key)}.`;

  const categoryTotals = new Map();
  entries.filter((entry) => entry.type === "expense").forEach((entry) => {
    categoryTotals.set(entry.category, (categoryTotals.get(entry.category) || 0) + entry.amount);
  });
  const categories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const largestCategory = categories[0]?.[1] || 1;
  const breakdown = document.querySelector("#categoryBreakdown");
  breakdown.innerHTML = categories.length
    ? categories.map(([category, amount]) => `<div class="category-row">
        <span class="category-name">${escapeHTML(category)}</span>
        <span class="category-track"><span class="category-fill" style="width:${amount / largestCategory * 100}%"></span></span>
        <span class="category-amount">${formatAmount(amount)}</span>
      </div>`).join("")
    : `<div class="empty-state">Your spending by category will appear here once you add an expense.</div>`;
}

function renderApp() {
  renderOverview();
  renderHistory();
  renderReport();
}

function openTransaction(type) {
  setTransactionType(type);
  document.querySelector("#transactionAmount").value = "";
  document.querySelector("#transactionDescription").value = "";
  document.querySelector("#transactionDate").value = localDate();
  if (typeof transactionDialog.showModal === "function") transactionDialog.showModal();
  else transactionDialog.setAttribute("open", "");
  document.querySelector("#transactionAmount").focus();
}

function setTransactionType(type) {
  transactionType = type;
  const isIncome = type === "income";
  document.querySelectorAll("[data-modal-type]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.modalType === type);
  });
  document.querySelector("#transactionTitle").textContent = isIncome ? "Add money in" : "Add money out";
  document.querySelector("#descriptionLabel").textContent = isIncome
    ? "Where did the money come from?"
    : "Where did the money go?";
  document.querySelector("#transactionDescription").placeholder = isIncome
    ? "e.g. Salary, a gift, or a refund"
    : "e.g. Groceries, a bill, or lunch";
  document.querySelector("#categoryLabel").textContent = isIncome ? "Income type" : "Expense category";
  document.querySelector("#transactionCategory").innerHTML = CATEGORY_OPTIONS[type]
    .map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
  document.querySelector("#saveTransactionButton").textContent = isIncome ? "Add income" : "Add expense";
}

document.querySelectorAll("[data-open-transaction]").forEach((button) => {
  button.addEventListener("click", () => openTransaction(button.dataset.openTransaction));
});

document.querySelectorAll("[data-modal-type]").forEach((button) => {
  button.addEventListener("click", () => setTransactionType(button.dataset.modalType));
});

document.querySelector("#closeDialogButton").addEventListener("click", () => transactionDialog.close());
transactionDialog.addEventListener("click", (event) => {
  if (event.target === transactionDialog) transactionDialog.close();
});

transactionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(document.querySelector("#transactionAmount").value);
  const date = document.querySelector("#transactionDate").value;
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Enter an amount greater than zero.", true);
    return;
  }
  if (!date || date > localDate()) {
    showToast("Choose a valid date today or earlier.", true);
    return;
  }
  const entry = {
    id: crypto.randomUUID(),
    type: transactionType,
    amount: Math.round(amount * 100) / 100,
    description: document.querySelector("#transactionDescription").value.trim(),
    category: document.querySelector("#transactionCategory").value,
    date,
    createdAt: new Date().toISOString(),
  };
  transactions.push(entry);
  if (!saveTransactions()) {
    transactions.pop();
    return;
  }
  transactionDialog.close();
  renderApp();
  showToast(transactionType === "income"
    ? `${formatAmount(entry.amount)} from ${entry.description} added to your history.`
    : `${formatAmount(entry.amount)} spent at ${entry.description} added to your history.`);
});

document.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-transaction]");
  if (deleteButton) {
    const entry = transactions.find((item) => item.id === deleteButton.dataset.deleteTransaction);
    if (!entry || !window.confirm(`Remove "${entry.description}" from your transaction history?`)) return;
    const original = transactions;
    transactions = transactions.filter((item) => item.id !== entry.id);
    if (!saveTransactions()) transactions = original;
    else {
      renderApp();
      showToast("Transaction removed from your history.");
    }
    return;
  }

  const viewLink = event.target.closest("[data-go-view]");
  if (viewLink) {
    event.preventDefault();
    navigate(viewLink.dataset.goView);
  }
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.view));
});

function navigate(view) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  if (view === "history") renderHistory();
  if (view === "reports") renderReport();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelector("#historyMonthSelect").addEventListener("change", renderHistory);
document.querySelector("#reportMonthSelect").addEventListener("change", renderReport);

document.querySelector("#currencySelect").addEventListener("change", (event) => {
  const accounts = getAccounts();
  const account = accounts.find((item) => item.email === currentUser.email);
  if (!account) {
    showToast("Couldn't find your saved account. Please log in again.", true);
    return;
  }
  const oldCurrency = currentUser.currency;
  currentUser.currency = event.target.value;
  account.currency = event.target.value;
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    renderApp();
  } catch {
    currentUser.currency = oldCurrency;
    account.currency = oldCurrency;
    event.target.value = oldCurrency;
    showToast("Couldn't save your currency preference. Try again.", true);
  }
});

document.querySelector("#profileButton").addEventListener("click", () => {
  if (!window.confirm("Log out of Credora on this device? Your saved account and transactions will stay here.")) return;
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  transactions = [];
  authForm.reset();
  authScreen.hidden = false;
  appShell.hidden = true;
  setAuthMode("login");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const key = document.querySelector("#reportMonthSelect").value;
  const entries = sortedTransactions(transactionsForMonth(key)).reverse();
  if (!entries.length) {
    showToast(`There are no transactions in ${monthLabel(key)} to download.`, true);
    return;
  }
  const csvEscape = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "Type", "Description / source / destination", "Category", `Amount (${currentUser.currency})`],
    ...entries.map((entry) => [entry.date, entry.type, entry.description, entry.category, entry.amount.toFixed(2)]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `credora-${key}.csv`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
  showToast(`${monthLabel(key)} report downloaded.`);
});

document.querySelector("#installButton").addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") showToast("Credora is ready on your device.");
    installPrompt = null;
    return;
  }
  showToast("To install, use your browser's menu and choose “Install app” or “Add to Home Screen”.");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  showToast("Credora is installed. Welcome aboard!");
});

async function startApp() {
  setTransactionType("income");
  try {
    const sessionEmail = localStorage.getItem(SESSION_KEY);
    if (sessionEmail) {
      const user = getAccounts().find((account) => account.email === sessionEmail);
      if (user) {
        showApp(user);
        return;
      }
      localStorage.removeItem(SESSION_KEY);
    }
    const accounts = getAccounts();
    setAuthMode(accounts.length ? "login" : "signup");
  } catch (error) {
    setAuthMode("signup");
    showToast(error instanceof Error ? error.message : "Couldn't load your saved account.", true);
  }
}

startApp();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("Credora could not enable offline support:", error);
    showToast("Offline support couldn't start. The app will still work while you're online.", true);
  });
}
