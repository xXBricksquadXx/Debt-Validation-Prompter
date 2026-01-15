// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function safe(v) {
  return (v || "").toString().trim();
}
function escHtml(s) {
  return (s || "").toString().replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
  );
}
function nowMMDDYYYY() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

// ---------- storage (keys in browser only) ----------
const LS = {
  get store() {
    const mode = localStorage.getItem("dvp.saveMode") || "localStorage";
    return mode === "sessionStorage" ? sessionStorage : localStorage;
  },
  setMode(mode) {
    localStorage.setItem("dvp.saveMode", mode);
  },
};

const FIELD_IDS = [
  "letterMode",
  "jurisdiction",
  "yourName",
  "yourEmail",
  "yourPhone",
  "today",
  "yourAddress",
  "collectorName",
  "collectorEmail",
  "collectorAddress",
  "balance",
  "opened",
  "accountRef",
  "origCreditor",
  "sourceSeen",
  "debtType",
  "summary",
  "vin",
  "ymm",
  "prove",
  "prefMailOnly",
  "prefNoCalls",
  "prefNoTexts",
  "prefNoWorkEmail",
  "opt1692g",
  "opt1692c",
  "opt1692d",
  "opt1692e",
  "optFCRA",
  "baseUrl",
  "model",
  "temp",
  "maxTokens",
];

function persistInputs() {
  const st = LS.store;
  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    if (el.type === "checkbox") st.setItem("dvp." + f, el.checked ? "1" : "0");
    else st.setItem("dvp." + f, el.value ?? "");
  });
}
function restoreInputs() {
  const st = LS.store;
  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    const v = st.getItem("dvp." + f);
    if (v === null) return;

    if (el.type === "checkbox") el.checked = v === "1";
    else if (v !== "") el.value = v;
  });
}

function loadKeysAndSettings() {
  const mode = localStorage.getItem("dvp.saveMode") || "localStorage";
  $("saveMode").value = mode;
  LS.setMode(mode);

  const st = LS.store;
  $("apiKey").value = st.getItem("dvp.apiKey") || "";
  updateKeyStatus();

  // safe defaults (not personal, not vendor-specific)
  $("temp").value = $("temp").value || "0.2";
  $("maxTokens").value = $("maxTokens").value || "1200";
}

function saveKeys() {
  const st = LS.store;
  st.setItem("dvp.apiKey", safe($("apiKey").value));
  updateKeyStatus();
}

function clearKeys() {
  const st = LS.store;
  st.removeItem("dvp.apiKey");
  $("apiKey").value = "";
  updateKeyStatus();
}

function updateKeyStatus() {
  const k = safe($("apiKey").value);
  $("keyStatus").textContent = k ? "API key: set" : "API key: not set";
}

function setGenStatus(msg) {
  $("genStatus").textContent = msg;
}

// ---------- core: statutes / subject / requests ----------
function statutesLine() {
  const refs = [];
  if ($("opt1692g").checked) refs.push("FDCPA 15 U.S.C. § 1692g");
  if ($("opt1692c").checked) refs.push("FDCPA 15 U.S.C. § 1692c(c)");
  if ($("opt1692d").checked) refs.push("FDCPA 15 U.S.C. § 1692d");
  if ($("opt1692e").checked) refs.push("FDCPA 15 U.S.C. § 1692e");
  if ($("optFCRA").checked) refs.push("FCRA 15 U.S.C. § 1681 et seq.");
  return refs.length ? refs.join(" • ") : "";
}

function subjectForMode(mode) {
  const parts = [];
  if (mode === "validate_cease_calls")
    parts.push("Debt Validation Request + Cease Calls/Text");
  if (mode === "validate_only") parts.push("Debt Validation Request");
  if (mode === "cease_all") parts.push("Cease Communication Notice");
  if (mode === "credit_reporting")
    parts.push("Dispute + Request for Credit Reporting Correction");
  if (mode === "itemization")
    parts.push("Dispute + Request for Itemization / Chain of Title");

  const s = statutesLine();
  if (s) parts.push(`(${s})`);

  const bal = safe($("balance").value);
  if (bal) parts.push(`— Alleged Balance ${bal}`);

  return parts.join(" ");
}

function buildRequests(mode, debtType) {
  const req = [];

  const base = [
    "Name and address of the original creditor and the original account number (as applicable).",
    "Proof you are authorized to collect on this account, including assignment/transfer documentation and chain of title.",
    "An itemization of the alleged balance (principal, interest, fees, credits) and the dates each amount was added.",
    "Date of default and charge-off (if applicable) and the payment history you are relying on.",
    "Copy of any contract/retail installment agreement bearing my signature or other competent evidence I agreed to the obligation.",
  ];
  base.forEach((x) => req.push(x));

  if (debtType === "auto") {
    req.push(
      "If this is an auto-related account, provide VIN, year/make/model, deficiency calculation, disposition details, and any insurance proceeds applied."
    );
  }

  const prove = safe($("prove").value);
  if (prove)
    req.push("Additional requested documentation (as stated below): " + prove);

  if (mode === "credit_reporting") {
    req.push(
      "If you have reported to any consumer reporting agency, identify which bureau(s), the date first reported, and the data you furnished."
    );
    req.push(
      "If you cannot validate, request deletion/correction with any bureau(s) you reported to and confirm results in writing."
    );
  }

  return req;
}

function commPrefsBlock(mode) {
  const lines = [];
  const mailOnly = $("prefMailOnly").checked;
  const noCalls = $("prefNoCalls").checked;
  const noTexts = $("prefNoTexts").checked;
  const noWork = $("prefNoWorkEmail").checked;

  if (mode === "cease_all") {
    lines.push(
      "This is a notice to cease communication with me regarding this alleged debt, except as permitted by law."
    );
  }
  if (mailOnly)
    lines.push(
      "Please communicate with me in writing only, sent to the mailing address listed above."
    );
  if (noCalls)
    lines.push(
      "I do not consent to phone calls to any number associated with me."
    );
  if (noTexts)
    lines.push(
      "I do not consent to text messages (SMS/MMS) or automated messaging."
    );
  if (noWork)
    lines.push("Do not contact me via any employer-owned email address.");

  return lines;
}

// ---------- data model ----------
function buildLetterData() {
  const mode = $("letterMode").value;

  return {
    mode,
    subject: subjectForMode(mode),
    jurisdiction: safe($("jurisdiction").value),

    consumer: {
      name: safe($("yourName").value) || "[YOUR FULL NAME]",
      address: safe($("yourAddress").value) || "[YOUR MAILING ADDRESS]",
      email: safe($("yourEmail").value),
      phone: safe($("yourPhone").value),
      date: safe($("today").value) || "[DATE]",
    },

    collector: {
      name: safe($("collectorName").value) || "[COLLECTOR NAME]",
      address: safe($("collectorAddress").value) || "[COLLECTOR ADDRESS]",
      email: safe($("collectorEmail").value),
    },

    account: {
      balance: safe($("balance").value),
      opened: safe($("opened").value),
      accountRef: safe($("accountRef").value),
      origCreditor: safe($("origCreditor").value),
      sourceSeen: safe($("sourceSeen").value),
      debtType: $("debtType").value,
      summary: safe($("summary").value),

      vin: safe($("vin").value),
      ymm: safe($("ymm").value),
      prove: safe($("prove").value),
    },

    statutes: statutesLine(),
    requests: buildRequests(mode, $("debtType").value),
    commPrefs: commPrefsBlock(mode),
  };
}

// ---------- rendering ----------
function renderLetterHtml(d) {
  const ids = [];
  if (d.account.balance)
    ids.push(`<b>Reported balance:</b> ${escHtml(d.account.balance)}`);
  if (d.account.opened)
    ids.push(`<b>Date shown opened/reported:</b> ${escHtml(d.account.opened)}`);
  if (d.account.accountRef)
    ids.push(`<b>Account/Reference #:</b> ${escHtml(d.account.accountRef)}`);
  if (d.account.origCreditor)
    ids.push(
      `<b>Original creditor (as shown):</b> ${escHtml(d.account.origCreditor)}`
    );
  if (d.account.sourceSeen)
    ids.push(`<b>Where I saw it:</b> ${escHtml(d.account.sourceSeen)}`);
  if (d.account.debtType)
    ids.push(`<b>Category:</b> ${escHtml(d.account.debtType)}`);
  if (d.account.vin) ids.push(`<b>VIN:</b> ${escHtml(d.account.vin)}`);
  if (d.account.ymm) ids.push(`<b>Vehicle:</b> ${escHtml(d.account.ymm)}`);

  const metaLines = [];
  metaLines.push(`<b>Subject:</b> ${escHtml(d.subject)}`);
  if (d.jurisdiction)
    metaLines.push(`<b>Jurisdiction:</b> ${escHtml(d.jurisdiction)}`);
  if (d.statutes) metaLines.push(`<b>References:</b> ${escHtml(d.statutes)}`);

  const contactLine = [];
  if (d.consumer.email) contactLine.push(escHtml(d.consumer.email));
  if (d.consumer.phone) contactLine.push(escHtml(d.consumer.phone));

  const collectorBlock = [
    escHtml(d.collector.name),
    d.collector.address
      ? escHtml(d.collector.address).replace(/\n/g, "<br/>")
      : "",
    d.collector.email
      ? `<div class="tiny">Email: ${escHtml(d.collector.email)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  const consumerBlock = [
    `<b>${escHtml(d.consumer.name)}</b>`,
    escHtml(d.consumer.address).replace(/\n/g, "<br/>"),
    contactLine.length
      ? `<div class="tiny">${contactLine.join(" • ")}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  const summary = d.account.summary
    ? `<div class="box"><b>Situation summary:</b><br/>${escHtml(
        d.account.summary
      ).replace(/\n/g, "<br/>")}</div>`
    : "";

  const reqList = `<ol>${d.requests
    .map((x) => `<li>${escHtml(x)}</li>`)
    .join("")}</ol>`;
  const commList = d.commPrefs.length
    ? `<ul>${d.commPrefs.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>`
    : "";

  // Legacy “tight + force paper trail” tone, modern layout
  return `
    <h3>Debt Validation / Dispute Letter</h3>
    <div class="meta">${metaLines.join("<br/>")}</div>

    <div class="box">
      <div><b>Date:</b> ${escHtml(d.consumer.date)}</div>
      <div class="hr"></div>
      <div class="row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <div class="tiny" style="margin-bottom:6px;"><b>From</b></div>
          ${consumerBlock}
        </div>
        <div>
          <div class="tiny" style="margin-bottom:6px;"><b>To</b></div>
          ${collectorBlock}
        </div>
      </div>
    </div>

    <p>
      To whom it may concern:
    </p>

    <p>
      I am writing regarding the alleged debt referenced above. I dispute the validity of this debt and request
      validation and supporting documentation. If you cannot validate, do not continue collection activity and confirm
      in writing.
    </p>

    ${
      ids.length
        ? `<div class="box"><b>Alleged account identifiers (as available):</b><br/>${ids.join(
            "<br/>"
          )}</div>`
        : ""
    }

    ${summary}

    <div class="box">
      <b>Requested validation / documentation:</b>
      ${reqList}
    </div>

    ${
      commList
        ? `<div class="box"><b>Communication preferences:</b>${commList}</div>`
        : ""
    }

    <p>
      Please provide your response in writing. If you have reported or will report information regarding this alleged
      debt to any consumer reporting agency, ensure your reporting is accurate and consistent with your validation.
    </p>

    <p>
      Sincerely,<br/>
      <b>${escHtml(d.consumer.name)}</b>
    </p>
  `.trim();
}

function renderLetterText(d) {
  const lines = [];
  lines.push("DEBT VALIDATION / DISPUTE LETTER");
  lines.push("");
  lines.push(`Date: ${d.consumer.date}`);
  lines.push(`Subject: ${d.subject}`);
  if (d.jurisdiction) lines.push(`Jurisdiction: ${d.jurisdiction}`);
  if (d.statutes) lines.push(`References: ${d.statutes}`);
  lines.push("");

  lines.push("FROM:");
  lines.push(d.consumer.name);
  lines.push(d.consumer.address);
  if (d.consumer.email) lines.push(d.consumer.email);
  if (d.consumer.phone) lines.push(d.consumer.phone);
  lines.push("");

  lines.push("TO:");
  lines.push(d.collector.name);
  lines.push(d.collector.address);
  if (d.collector.email) lines.push(`Email: ${d.collector.email}`);
  lines.push("");

  lines.push("To whom it may concern:");
  lines.push("");
  lines.push(
    "I dispute the validity of the alleged debt referenced above and request validation and supporting documentation. If you cannot validate, do not continue collection activity and confirm in writing."
  );
  lines.push("");

  const ids = [];
  if (d.account.balance) ids.push(`Reported balance: ${d.account.balance}`);
  if (d.account.opened)
    ids.push(`Date shown opened/reported: ${d.account.opened}`);
  if (d.account.accountRef)
    ids.push(`Account/Reference #: ${d.account.accountRef}`);
  if (d.account.origCreditor)
    ids.push(`Original creditor (as shown): ${d.account.origCreditor}`);
  if (d.account.sourceSeen) ids.push(`Where I saw it: ${d.account.sourceSeen}`);
  if (d.account.debtType) ids.push(`Category: ${d.account.debtType}`);
  if (d.account.vin) ids.push(`VIN: ${d.account.vin}`);
  if (d.account.ymm) ids.push(`Vehicle: ${d.account.ymm}`);

  if (ids.length) {
    lines.push("Alleged account identifiers (as available):");
    ids.forEach((x) => lines.push(`- ${x}`));
    lines.push("");
  }

  if (d.account.summary) {
    lines.push("Situation summary:");
    lines.push(d.account.summary);
    lines.push("");
  }

  lines.push("Requested validation / documentation:");
  d.requests.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  lines.push("");

  if (d.commPrefs.length) {
    lines.push("Communication preferences:");
    d.commPrefs.forEach((x) => lines.push(`- ${x}`));
    lines.push("");
  }

  lines.push(
    "Please provide your response in writing. If you have reported or will report information regarding this alleged debt to any consumer reporting agency, ensure your reporting is accurate and consistent with your validation."
  );
  lines.push("");
  lines.push("Sincerely,");
  lines.push(d.consumer.name);

  return lines.join("\n");
}

// ---------- prompt pack (better prompting; not tied to any API) ----------
function buildPromptPack(d) {
  const styleRules = [
    "Do not add facts not provided.",
    "Do not provide legal advice; keep as consumer letter formatting.",
    "Tone: calm, firm, factual, brief.",
    "Preserve all statutory references exactly as given; do not invent citations.",
    "Avoid threats; do not mention lawsuits unless user explicitly included it.",
  ];

  const userTask = [
    "Rewrite the draft letter to be clearer and more professional, while keeping the same meaning and factual content.",
    "Keep it short, organized, and easy to scan.",
    "Ensure all placeholders remain as placeholders if missing values (e.g., [YOUR FULL NAME]).",
  ];

  return {
    version: "dvp.promptPack.v1",
    inputs: d,
    instructions: {
      styleRules,
      task: userTask,
    },
    messages: [
      {
        role: "system",
        content:
          "You format consumer correspondence. You must not provide legal advice. You must not fabricate facts. You rewrite for clarity, brevity, and professionalism.",
      },
      {
        role: "user",
        content:
          "Using the structured inputs below, produce a final debt validation/dispute letter. Keep the meaning, preserve statutes if present, and keep it factual.\n\n" +
          JSON.stringify(d, null, 2),
      },
    ],
  };
}

// ---------- UI wiring ----------
function setTab(which) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === which);
  });
  $("outLetter").style.display = which === "letter" ? "" : "none";
  $("outText").style.display = which === "text" ? "" : "none";
  $("outPrompt").style.display = which === "prompt" ? "" : "none";
}

function renderAll() {
  const d = buildLetterData();
  const html = renderLetterHtml(d);
  const txt = renderLetterText(d);
  const pack = buildPromptPack(d);

  $("outLetter").innerHTML = html;
  $("outText").textContent = txt;
  $("outPrompt").textContent = JSON.stringify(pack, null, 2);
}

function fillDemoData() {
  // Fictional demo
  $("yourName").value = "Jane Q. Consumer";
  $("yourEmail").value = "jane@example.com";
  $("yourPhone").value = "(555) 555-0123";
  $("yourAddress").value = "123 Example Street\nExample City, ST 12345";

  $("collectorName").value = "Example Collections LLC";
  $("collectorEmail").value = "support@examplecollections.com";
  $("collectorAddress").value = "PO Box 1000\nExample Town, ST 12345";

  $("balance").value = "$3,250";
  $("opened").value = "10/02/2024";
  $("accountRef").value = "REF-000123";
  $("origCreditor").value = "Example Bank";
  $("sourceSeen").value = "Credit report";
  $("debtType").value = "other";
  $("summary").value =
    "I dispute this account. Please validate the debt and provide itemization. I request written-only communication.";

  // keep defaults
  $("letterMode").value = "validate_cease_calls";
  $("jurisdiction").value = "Federal";
  renderAll();
  setGenStatus("Demo filled");
}

function resetAll() {
  // Clear inputs + storage (except saveMode preference)
  const st = LS.store;
  FIELD_IDS.forEach((f) => st.removeItem("dvp." + f));
  // keys are separate
  st.removeItem("dvp.apiKey");

  // clear UI fields
  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  });

  // restore sane defaults
  $("opt1692g").checked = true;
  $("opt1692c").checked = true;
  $("prefMailOnly").checked = true;
  $("prefNoCalls").checked = true;
  $("prefNoTexts").checked = true;
  $("prefNoWorkEmail").checked = true;

  $("today").value = nowMMDDYYYY();
  $("letterMode").value = "validate_cease_calls";
  $("debtType").value = "auto";

  $("apiKey").value = "";
  updateKeyStatus();
  renderAll();
  setGenStatus("Reset");
}

function openModal() {
  $("modalBackdrop").classList.add("show");
}
function closeModal() {
  $("modalBackdrop").classList.remove("show");
}

// ---------- init ----------
(function init() {
  if (!$("today").value) $("today").value = nowMMDDYYYY();

  loadKeysAndSettings();
  restoreInputs();

  // If today field empty after restore, set it.
  if (!safe($("today").value)) $("today").value = nowMMDDYYYY();

  renderAll();

  // Events that should re-render + persist
  const reRenderOn = [
    "letterMode",
    "jurisdiction",
    "yourName",
    "yourEmail",
    "yourPhone",
    "today",
    "yourAddress",
    "collectorName",
    "collectorEmail",
    "collectorAddress",
    "balance",
    "opened",
    "accountRef",
    "origCreditor",
    "sourceSeen",
    "debtType",
    "summary",
    "vin",
    "ymm",
    "prove",
    "prefMailOnly",
    "prefNoCalls",
    "prefNoTexts",
    "prefNoWorkEmail",
    "opt1692g",
    "opt1692c",
    "opt1692d",
    "opt1692e",
    "optFCRA",
    "baseUrl",
    "model",
    "temp",
    "maxTokens",
  ];

  reRenderOn.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      persistInputs();
      renderAll();
      setGenStatus("Ready");
    });
    el.addEventListener("change", () => {
      persistInputs();
      renderAll();
      setGenStatus("Ready");
    });
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // Buttons
  $("btnLocal").addEventListener("click", () => {
    persistInputs();
    renderAll();
    setTab("letter");
    setGenStatus("Generated (Local)");
  });

  $("btnPromptPack").addEventListener("click", () => {
    persistInputs();
    renderAll();
    setTab("prompt");
    setGenStatus("Prompt pack built");
  });

  $("btnCopyText").addEventListener("click", async () => {
    try {
      await copyToClipboard($("outText").textContent);
      setTab("text");
      setGenStatus("Copied text");
    } catch {
      setGenStatus("Copy failed (browser restriction)");
    }
  });

  $("btnCopyHtml").addEventListener("click", async () => {
    try {
      await copyToClipboard($("outLetter").innerHTML);
      setTab("letter");
      setGenStatus("Copied HTML");
    } catch {
      setGenStatus("Copy failed (browser restriction)");
    }
  });

  $("btnPrint").addEventListener("click", () => window.print());

  $("btnDemo").addEventListener("click", fillDemoData);
  $("btnReset").addEventListener("click", resetAll);

  // Modal + keys
  $("btnKeys").addEventListener("click", openModal);
  $("btnCloseModal").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === $("modalBackdrop")) closeModal();
  });

  $("saveMode").addEventListener("change", () => {
    LS.setMode($("saveMode").value);
    persistInputs(); // move inputs to the selected storage
    saveKeys();
    setGenStatus("Save mode updated");
  });

  $("btnSaveKeys").addEventListener("click", () => {
    saveKeys();
    closeModal();
    setGenStatus("Keys saved (browser storage)");
  });

  $("btnClearKeys").addEventListener("click", () => {
    clearKeys();
    setGenStatus("Keys cleared");
  });

  $("apiKey").addEventListener("input", updateKeyStatus);
})();
