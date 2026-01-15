// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const safe = (v) => (v || "").toString().trim();

const escHtml = (s) =>
  (s || "").toString().replace(/[&<>"']/g, (c) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[c] || c;
  });

const nowMMDDYYYY = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const copyToClipboard = async (text) => {
  await navigator.clipboard.writeText(text);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- minimal HTML sanitizer (model output) ----------
// Goal: prevent obvious script injection if an LLM returns unsafe HTML.
// This is not a full sanitizer, but it strips the highest-risk items.
const sanitizeHtml = (html) => {
  let s = (html || "").toString();

  // remove code fences if model returns ```html ... ```
  s = s.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "");

  // strip scripts/styles/iframes/objects
  s = s.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  s = s.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  s = s.replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "");
  s = s.replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, "");
  s = s.replace(/<\s*embed[^>]*>/gi, "");

  // strip inline event handlers like onclick=
  s = s.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");

  // strip javascript: URLs
  s = s.replace(/href\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, 'href="#"');
  s = s.replace(/src\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "");

  return s.trim();
};

// ---------- fail-safe storage wrapper ----------
const MEM = new Map();

const makeSafeStore = (storageLike) => ({
  getItem(key) {
    try {
      const v = storageLike?.getItem?.(key);
      return v === undefined ? null : v;
    } catch {
      return MEM.has(key) ? MEM.get(key) : null;
    }
  },
  setItem(key, val) {
    try {
      storageLike?.setItem?.(key, String(val));
    } catch {
      MEM.set(key, String(val));
    }
  },
  removeItem(key) {
    try {
      storageLike?.removeItem?.(key);
    } catch {
      MEM.delete(key);
    }
  },
});

const safeLocal = makeSafeStore(window.localStorage);
const safeSession = makeSafeStore(window.sessionStorage);

const STORE_MODE_KEY = "dvp.saveMode";

// ---------- storage (keys in browser only) ----------
const LS = {
  get mode() {
    return safeLocal.getItem(STORE_MODE_KEY) || "localStorage";
  },
  get store() {
    return this.mode === "sessionStorage" ? safeSession : safeLocal;
  },
  get otherStore() {
    return this.mode === "sessionStorage" ? safeLocal : safeSession;
  },
  setMode(mode) {
    safeLocal.setItem(STORE_MODE_KEY, mode);
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

const persistInputs = () => {
  const st = LS.store;
  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    if (el.type === "checkbox") st.setItem("dvp." + f, el.checked ? "1" : "0");
    else st.setItem("dvp." + f, el.value ?? "");
  });
};

const restoreInputs = () => {
  const st = LS.store;
  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    const v = st.getItem("dvp." + f);
    if (v === null) return;

    if (el.type === "checkbox") el.checked = v === "1";
    else if (v !== "") el.value = v;
  });
};

const looksLikeKey = (k) => {
  const s = safe(k);
  if (!s) return false;
  if (/\s/.test(s)) return false;
  return s.length >= 16; // loose; avoids false negatives
};

const maskKey = (k) => {
  const s = safe(k);
  if (!s) return "";
  const tail = s.slice(-4);
  return `••••${tail}`;
};

const updateKeyStatus = () => {
  const k = safe($("apiKey")?.value);
  $("keyStatus").textContent = k
    ? `LLM key: set (${maskKey(k)})`
    : "LLM key: not set";
};

const setGenStatus = (msg) => {
  $("genStatus").textContent = msg;
};

// Load key from selected store; if missing, try the other store (fail-safe).
const loadKeyIntoField = () => {
  const st = LS.store;
  let k = st.getItem("dvp.apiKey") || "";
  if (!k) {
    const ok = LS.otherStore.getItem("dvp.apiKey") || "";
    if (ok) {
      k = ok;
      setGenStatus("Key found in other storage; Save to migrate");
    }
  }
  $("apiKey").value = k;
  updateKeyStatus();
};

const loadKeysAndSettings = () => {
  const mode = LS.mode;
  $("saveMode").value = mode;

  // safe defaults
  $("temp").value = $("temp").value || "0.2";
  $("maxTokens").value = $("maxTokens").value || "1200";

  loadKeyIntoField();
};

const saveKeys = () => {
  const st = LS.store;
  const k = safe($("apiKey").value);

  if (k && !looksLikeKey(k)) {
    setGenStatus("Key looks malformed (not saved)");
    return;
  }

  st.setItem("dvp.apiKey", k);
  updateKeyStatus();
  setGenStatus("Keys saved (browser storage)");
};

const clearKeys = () => {
  const st = LS.store;
  st.removeItem("dvp.apiKey");
  $("apiKey").value = "";
  updateKeyStatus();
};

// ---------- core: statutes / subject / requests ----------
const statutesLine = () => {
  const refs = [];
  if ($("opt1692g").checked) refs.push("FDCPA 15 U.S.C. § 1692g");
  if ($("opt1692c").checked) refs.push("FDCPA 15 U.S.C. § 1692c(c)");
  if ($("opt1692d").checked) refs.push("FDCPA 15 U.S.C. § 1692d");
  if ($("opt1692e").checked) refs.push("FDCPA 15 U.S.C. § 1692e");
  if ($("optFCRA").checked) refs.push("FCRA 15 U.S.C. § 1681 et seq.");
  return refs.length ? refs.join(" • ") : "";
};

const subjectForMode = (mode) => {
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
};

const buildRequests = (mode, debtType) => {
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
};

const commPrefsBlock = (mode) => {
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
};

// ---------- data model ----------
const buildLetterData = () => {
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
};

// ---------- rendering ----------
const renderLetterHtml = (d) => {
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

  const reqList = `<ol>${d.requests.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ol>`;
  const commList = d.commPrefs.length
    ? `<ul>${d.commPrefs.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>`
    : "";

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

    <p>To whom it may concern:</p>

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
};

const renderLetterText = (d) => {
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
};

// ---------- prompt pack (not tied to any API) ----------
const buildPromptPack = (d) => {
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
    instructions: { styleRules, task: userTask },
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
};

// ---------- AI (optional) ----------
const isGroqUrl = (u) => /api\.groq\.com/i.test(u || "");

const normalizeBaseUrl = (raw) => {
  const b0 = safe(raw);
  if (!b0) return "https://api.openai.com/v1";

  const b = b0.replace(/\/+$/, "");

  // Groq OpenAI-compatible base URL is https://api.groq.com/openai/v1
  if (isGroqUrl(b)) {
    if (/\/openai\/v1$/i.test(b)) return b;
    if (/\/openai$/i.test(b)) return b + "/v1";
    if (/\/v1$/i.test(b)) return b;
    return b + "/openai/v1";
  }

  if (/\/v1$/i.test(b)) return b;
  return b + "/v1";
};

const inferDefaultModel = (baseUrl) => {
  const u = safe(baseUrl);
  if (isGroqUrl(u)) return "llama-3.3-70b-versatile";
  return "gpt-4o-mini";
};

const getLLMConfig = () => {
  const apiKey = safe($("apiKey").value);
  const baseUrl = normalizeBaseUrl($("baseUrl").value);

  const rawModel = safe($("model").value);
  const model = rawModel || inferDefaultModel(baseUrl);

  const temperature = clamp(parseFloat($("temp").value || "0.2"), 0, 1.5);
  const max_tokens = clamp(
    parseInt($("maxTokens").value || "1200", 10),
    256,
    4096
  );

  return { apiKey, baseUrl, model, temperature, max_tokens };
};

const buildFdcpReportMessages = (d) => {
  const system = [
    "You are a consumer correspondence drafting assistant.",
    "You must NOT provide legal advice. You must NOT claim to be an attorney or advisor.",
    "You must NOT fabricate facts. If a field is missing, say 'Not provided'.",
    "You may only reference statutes explicitly supplied in the input (do not invent citations).",
    "Write in a calm, professional tone. Keep it skimmable.",
  ].join(" ");

  const user = [
    "Using the structured inputs below, generate a 'FDCPA Documentation & Drafting Report' for the consumer.",
    "",
    "Output format (use these headings):",
    "1) Snapshot (facts only)",
    "2) Timeline / touchpoints (if any dates are present; otherwise say Not provided)",
    "3) Potential pressure points (phrased as non-conclusive questions/checks, not legal conclusions)",
    "4) Evidence checklist (what to gather/keep; no advice, just documentation)",
    "5) Draft-ready narrative (facts only; 1–2 short paragraphs)",
    "6) Statutory references (repeat exactly as given; if none selected, say None selected)",
    "",
    "Important:",
    "- Do not add threats or lawsuit language.",
    "- Do not add new statutes or citations.",
    "- Do not provide step-by-step legal instructions; stay at documentation and drafting level.",
    "",
    JSON.stringify(d, null, 2),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
};

const buildPolishLetterMessages = (d) => {
  const system = [
    "You format consumer correspondence as a drafting assistant.",
    "You must NOT provide legal advice. You must NOT fabricate facts.",
    "You may only reference statutes explicitly supplied in the input (do not invent citations).",
    "Tone: calm, firm, factual, brief.",
    "Output must be HTML ONLY (no markdown, no code fences).",
    "Use simple HTML: h3, div, p, ul/ol, br, b. Do not include scripts/styles.",
  ].join(" ");

  const user = [
    "Rewrite the debt validation/dispute letter into a clearer, more professional final letter.",
    "Fold in a tight 'Snapshot' inside the letter (facts only) so the letter is more complete and skimmable.",
    "Do not add threats. Do not mention lawsuits unless the user included it (they did not).",
    "Keep placeholders like [YOUR FULL NAME] if missing.",
    "Return an HTML fragment similar to the app's current letter layout: title, meta, from/to, snapshot box, requested documentation list, communication preferences, closing.",
    "",
    "INPUTS:",
    JSON.stringify(d, null, 2),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
};

const parseApiError = async (res) => {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const j = await res.json();
      const msg =
        j?.error?.message ||
        j?.message ||
        j?.error ||
        JSON.stringify(j).slice(0, 600);
      return msg;
    } catch {
      return "";
    }
  }
  try {
    return (await res.text()).slice(0, 800);
  } catch {
    return "";
  }
};

const fetchWithRetry = async (url, init, { tries = 2 } = {}) => {
  let lastErr = null;

  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt < tries) {
          const wait = 350 * Math.pow(2, attempt);
          await sleep(wait);
          continue;
        }
      }

      return res;
    } catch (e) {
      lastErr = e;
      const isAbort =
        e?.name === "AbortError" || String(e?.message || "").includes("abort");
      if (isAbort) throw e;

      if (attempt < tries) {
        const wait = 350 * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("Network error");
};

const callChatCompletions = async (
  { baseUrl, apiKey, model, temperature, max_tokens },
  messages
) => {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timeoutMs = 45_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
        }),
      },
      { tries: 2 }
    );

    if (!res.ok) {
      const detail = await parseApiError(res);
      throw new Error(
        `AI request failed (${res.status}): ${detail || res.statusText}`
      );
    }

    const json = await res.json();
    const content =
      json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";

    return safe(content) || "(No content returned.)";
  } finally {
    clearTimeout(t);
  }
};

const ensureAiButtons = () => {
  const actions = document.querySelector(".actions");
  if (!actions) return;

  // Button 1: Draft report (plain text)
  if (!$("btnAiDraft")) {
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.id = "btnAiDraft";
    btn.type = "button";
    btn.textContent = "Generate (AI Draft Report)";

    const localBtn = $("btnLocal");
    if (localBtn && localBtn.parentElement === actions) {
      actions.insertBefore(btn, localBtn.nextSibling);
    } else {
      actions.appendChild(btn);
    }

    btn.addEventListener("click", async () => {
      persistInputs();
      renderAll();

      const cfg = getLLMConfig();

      if (!cfg.apiKey) {
        setGenStatus("AI Draft: missing key");
        openModal();
        return;
      }
      if (!looksLikeKey(cfg.apiKey)) {
        setGenStatus("AI Draft: key looks malformed");
        openModal();
        return;
      }

      setGenStatus(
        `AI Draft: generating… (${isGroqUrl(cfg.baseUrl) ? "Groq" : "OpenAI-compatible"})`
      );

      await sleep(50);

      try {
        const d = buildLetterData();
        const messages = buildFdcpReportMessages(d);
        const out = await callChatCompletions(cfg, messages);

        $("outText").textContent = out;
        setTab("text");
        setGenStatus("AI Draft: ready");
      } catch (e) {
        setGenStatus("AI Draft: failed");
        $("outText").textContent =
          "AI Draft failed.\n\n" +
          String(e?.message || e) +
          "\n\nNotes:\n" +
          `- Resolved baseUrl: ${cfg.baseUrl}\n` +
          `- Endpoint: ${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions\n` +
          "- Confirm baseUrl is OpenAI-compatible\n" +
          "- Confirm model name is valid for your provider\n" +
          "- Confirm key is valid and has access\n";
        setTab("text");
      }
    });
  }

  // Button 2: Polish letter (HTML -> Letter tab)
  if (!$("btnAiPolish")) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "btnAiPolish";
    btn.type = "button";
    btn.textContent = "Polish Letter (AI)";

    const promptBtn = $("btnPromptPack");
    if (promptBtn && promptBtn.parentElement === actions) {
      actions.insertBefore(btn, promptBtn);
    } else {
      actions.appendChild(btn);
    }

    btn.addEventListener("click", async () => {
      persistInputs();
      renderAll();

      const cfg = getLLMConfig();

      if (!cfg.apiKey) {
        setGenStatus("AI Polish: missing key");
        openModal();
        return;
      }
      if (!looksLikeKey(cfg.apiKey)) {
        setGenStatus("AI Polish: key looks malformed");
        openModal();
        return;
      }

      setGenStatus(
        `AI Polish: generating… (${isGroqUrl(cfg.baseUrl) ? "Groq" : "OpenAI-compatible"})`
      );

      await sleep(50);

      try {
        const d = buildLetterData();
        const messages = buildPolishLetterMessages(d);
        const out = await callChatCompletions(cfg, messages);

        const cleaned = sanitizeHtml(out);
        if (!cleaned) throw new Error("Empty HTML returned.");

        $("outLetter").innerHTML = cleaned;
        setTab("letter");
        setGenStatus("AI Polish: ready");
      } catch (e) {
        setGenStatus("AI Polish: failed");
        $("outText").textContent =
          "AI Polish failed.\n\n" +
          String(e?.message || e) +
          "\n\nNotes:\n" +
          `- Resolved baseUrl: ${cfg.baseUrl}\n` +
          `- Endpoint: ${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions\n` +
          "- Confirm baseUrl is OpenAI-compatible\n" +
          "- Confirm model name is valid for your provider\n" +
          "- Confirm key is valid and has access\n";
        setTab("text");
      }
    });
  }
};

// ---------- UI wiring ----------
const setTab = (which) => {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === which);
  });
  $("outLetter").style.display = which === "letter" ? "" : "none";
  $("outText").style.display = which === "text" ? "" : "none";
  $("outPrompt").style.display = which === "prompt" ? "" : "none";
};

const renderAll = () => {
  const d = buildLetterData();
  const html = renderLetterHtml(d);
  const txt = renderLetterText(d);
  const pack = buildPromptPack(d);

  $("outLetter").innerHTML = html;
  $("outText").textContent = txt;
  $("outPrompt").textContent = JSON.stringify(pack, null, 2);
};

const fillDemoData = () => {
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

  $("letterMode").value = "validate_cease_calls";
  $("jurisdiction").value = "Federal";
  renderAll();
  setGenStatus("Demo filled");
};

const resetAll = () => {
  const st = LS.store;
  FIELD_IDS.forEach((f) => st.removeItem("dvp." + f));
  st.removeItem("dvp.apiKey");

  FIELD_IDS.forEach((f) => {
    const el = $(f);
    if (!el) return;
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  });

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
};

const openModal = () => {
  $("modalBackdrop").classList.add("show");
};

const closeModal = () => {
  $("modalBackdrop").classList.remove("show");
};

// ---------- init ----------
(() => {
  if (!$("today").value) $("today").value = nowMMDDYYYY();

  loadKeysAndSettings();
  restoreInputs();

  if (!safe($("today").value)) $("today").value = nowMMDDYYYY();

  renderAll();
  ensureAiButtons();

  const show = $("showApiKey");
  if (show) {
    show.addEventListener("change", () => {
      $("apiKey").type = show.checked ? "text" : "password";
    });
  }

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

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

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

  $("btnKeys").addEventListener("click", openModal);
  $("btnCloseModal").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === $("modalBackdrop")) closeModal();
  });

  $("saveMode").addEventListener("change", () => {
    LS.setMode($("saveMode").value);
    persistInputs();
    loadKeyIntoField();
    setGenStatus("Save mode updated");
  });

  $("btnSaveKeys").addEventListener("click", () => {
    saveKeys();
    closeModal();
  });

  $("btnClearKeys").addEventListener("click", () => {
    clearKeys();
    setGenStatus("Keys cleared");
  });

  $("apiKey").addEventListener("input", updateKeyStatus);
})();
