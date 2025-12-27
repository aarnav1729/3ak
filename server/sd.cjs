// server/sd.cjs
"use strict";

/**
 * sd.cjs
 * SalesDashboard -> FY table + Excel export
 * NOW EXPORTS: express.Router() mounted at /api/sd by server.cjs
 *
 * Standalone still supported (optional): node sd.cjs
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const ExcelJS = require("exceljs");
require("isomorphic-fetch");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const xmlrpc = require("xmlrpc");

const { getAccessToken, fetchJsonWithRetry } = require("./bcAuth.cjs");

// ------------------------ HARD-CODED BC CREDS (as requested) ------------------------
const tenantId = "985f0700-1d9d-4e2a-9267-27736d2c7ab5";
const clientId = "091bce49-dd2f-4707-9cb1-9df616bb36c3";
const clientSecret = "HHZ8Q~brWPmnqf1Cz~eJMKfSPpvsiyZ1gRleDa6w";
const environmentName = "Production";
const companyName = "3AK Chemie Pvt. Ltd.";

/* ============================== ODOO (Foreign Sales) ============================== */
/**
 * Uses Odoo JSON-RPC session auth and fetches posted customer invoices (account.move)
 * for the FY date range, then maps them into the SAME shape as BC rows so the existing
 * buildFyTableFromRows() logic can bucket them with minimal changes.
 *
 * Production: set these via env; fallbacks kept for your current setup.
 */
// ✅ HARD-CODED ODOO CREDS (local-only)
// NOTE: For Odoo Online / Odoo.sh, "login" is often your EMAIL, not "admin".
// NOTE: If 2FA is enabled, password may NOT work; use an API key as "password".
const ODOO_URL = "https://keyurtus-3ak.odoo.com";
const ODOO_BASE_PATH = ""; // try root first; we will also try /odoo automatically
const ODOO_DB = "keyurtus-3ak-main-20803787";
const ODOO_USERNAME = "admin"; // <-- change to your Odoo login email if needed
const ODOO_PASSWORD = "3AK@0017"; // <-- if 2FA, replace with API key
// ------------------------ ODOO JSON-RPC (stateless) ------------------------
async function jsonRpcCall(endpointUrl, body) {
  const r = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const txt = await r.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Error(
      `JSON-RPC: non-JSON response (${r.status}): ${txt.slice(0, 200)}`
    );
  }

  if (!r.ok) {
    throw new Error(`JSON-RPC HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  if (json.error) {
    const msg =
      json.error?.data?.message ||
      json.error?.message ||
      JSON.stringify(json.error);
    throw new Error(`JSON-RPC error: ${msg}`);
  }
  return json.result;
}

function makeJsonRpcUrl(base) {
  return `${base.replace(/\/+$/, "")}/jsonrpc`;
}

async function odooAuthenticateJsonRpc(base) {
  const endpoint = makeJsonRpcUrl(base);
  const result = await jsonRpcCall(endpoint, {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
    },
    id: Date.now(),
  });

  return result; // uid or false
}

async function odooExecuteKwJsonRpc(
  base,
  { uid, model, method, args = [], kwargs = {} }
) {
  const endpoint = makeJsonRpcUrl(base);
  const result = await jsonRpcCall(endpoint, {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
    },
    id: Date.now(),
  });
  return result;
}

// ------------------------ ODOO XML-RPC ------------------------
function makeXmlRpcClient(endpointUrl) {
  const u = new URL(endpointUrl);
  const isHttps = u.protocol === "https:";

  const opts = {
    host: u.hostname,
    port: u.port ? Number(u.port) : isHttps ? 443 : 80,
    path: u.pathname || "/",
    // Odoo Online is HTTPS; leave rejectUnauthorized default true.
    // If you ever have self-signed certs (not recommended), you'd set:
    // rejectUnauthorized: false
  };

  return isHttps ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts);
}

function xmlrpcCall(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, value) => {
      if (err) return reject(err);
      resolve(value);
    });
  });
}

let ODOO_XMLRPC_BASE_SELECTED = null;

function buildOdooBaseCandidates() {
  const base = ODOO_URL.replace(/\/+$/, "");
  const pRaw = String(ODOO_BASE_PATH || "").trim();

  const withP = pRaw
    ? `${base}${pRaw.startsWith("/") ? pRaw : `/${pRaw}`}`.replace(/\/+$/, "")
    : base;

  const candidates = [];

  // 1) try env-configured base first
  if (withP) candidates.push(withP);

  // 2) try no base-path (most common for Odoo Online / many Odoo.sh)
  if (base && !candidates.includes(base)) candidates.push(base);

  // 3) try explicit /odoo fallback
  const withOdoo = `${base}/odoo`.replace(/\/+$/, "");
  if (withOdoo && !candidates.includes(withOdoo)) candidates.push(withOdoo);

  return candidates;
}

function getOdooXmlRpcBase() {
  // prefer the one that already worked
  if (ODOO_XMLRPC_BASE_SELECTED) return ODOO_XMLRPC_BASE_SELECTED;
  return buildOdooBaseCandidates()[0] || ODOO_URL.replace(/\/+$/, "");
}

async function odooAuthenticateXmlRpc() {
  const bases = buildOdooBaseCandidates();
  let lastErr = null;

  // ✅ 1) Try JSON-RPC first (more reliable on hosted Odoo)
  for (const base of bases) {
    try {
      const uid = await odooAuthenticateJsonRpc(base);
      if (uid) {
        ODOO_XMLRPC_BASE_SELECTED = base;
        console.log(`[sd.cjs] Odoo JSON-RPC base selected: ${base}`);
        return uid;
      }
      lastErr = new Error(
        `JSON-RPC authenticate() returned no uid for base="${base}". Check ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD.`
      );
    } catch (e) {
      lastErr = e;
    }
  }

  // ✅ 2) Fallback to XML-RPC
  for (const base of bases) {
    const commonUrl = `${base}/xmlrpc/2/common`;
    const common = makeXmlRpcClient(commonUrl);

    try {
      const uid = await xmlrpcCall(common, "authenticate", [
        ODOO_DB,
        ODOO_USERNAME,
        ODOO_PASSWORD,
        {},
      ]);

      if (uid) {
        ODOO_XMLRPC_BASE_SELECTED = base;
        console.log(`[sd.cjs] Odoo XML-RPC base selected: ${base}`);
        return uid;
      }

      lastErr = new Error(
        `XML-RPC authenticate() returned no uid for base="${base}". Check ODOO_DB/ODOO_USERNAME/ODOO_PASSWORD.`
      );
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    `Odoo auth failed. Tried bases: ${bases.join(", ")}. Last error: ${String(
      lastErr?.message || lastErr
    )}`
  );
}

async function odooExecuteKwXmlRpc({
  uid,
  model,
  method,
  args = [],
  kwargs = {},
}) {
  const base = getOdooXmlRpcBase();

  // ✅ Prefer JSON-RPC execute_kw (works even if XML-RPC is weird on hosted)
  try {
    return await odooExecuteKwJsonRpc(base, {
      uid,
      model,
      method,
      args,
      kwargs,
    });
  } catch (e) {
    // Fallback to XML-RPC execute_kw
    const objectUrl = `${base}/xmlrpc/2/object`;
    const object = makeXmlRpcClient(objectUrl);

    try {
      return await xmlrpcCall(object, "execute_kw", [
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        model,
        method,
        args,
        kwargs,
      ]);
    } catch (e2) {
      throw new Error(
        `Odoo execute_kw failed (JSON-RPC then XML-RPC): ${model}.${method} -> ${String(
          e2?.message || e2
        )}`
      );
    }
  }
}

/**
 * Fetch posted customer invoices/refunds for date range.
 * Uses amount_untaxed_signed if present (closer to net sales); falls back to amount_total_signed.
 */
async function fetchOdooSalesInvoices({ fromYmd, toYmd }) {
  const uid = await odooAuthenticateXmlRpc();

  // 1) Fetch invoices (header)
  const invDomain = [
    ["state", "=", "posted"],
    ["move_type", "in", ["out_invoice", "out_refund"]],
    ["invoice_date", ">=", fromYmd],
    ["invoice_date", "<=", toYmd],
  ];

  const invFields = [
    "id",
    "invoice_date",
    "move_type",
    "partner_id",
    "name",
    "company_id",
    "currency_id", // ✅ document currency
    "company_currency_id", // ✅ company currency (often INR)
    "invoice_line_ids",
  ];

  const batchSize = 1000;
  let offset = 0;
  const invoices = [];

  while (true) {
    const rows = await odooExecuteKwXmlRpc({
      uid,
      model: "account.move",
      method: "search_read",
      args: [invDomain],
      kwargs: {
        fields: invFields,
        limit: batchSize,
        offset,
        order: "invoice_date asc, id asc",
      },
    });

    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) break;

    invoices.push(...arr);
    offset += arr.length;
    if (arr.length < batchSize) break;
  }

  // 2) Fetch all invoice lines in batches
  const lineIds = invoices
    .flatMap((inv) =>
      Array.isArray(inv.invoice_line_ids) ? inv.invoice_line_ids : []
    )
    .filter((x) => Number.isFinite(Number(x)));

  const lineFields = [
    "id",
    "move_id",
    "product_id",
    "name",
    "price_subtotal", // doc currency (tax excl)
    "amount_currency", // doc currency signed (sometimes)
    "balance", // ✅ company currency (signed accounting)
  ];
  const lines = [];
  const lineIdChunks = [];
  for (let i = 0; i < lineIds.length; i += 1000)
    lineIdChunks.push(lineIds.slice(i, i + 1000));

  for (const chunk of lineIdChunks) {
    const got = await odooExecuteKwXmlRpc({
      uid,
      model: "account.move.line",
      method: "search_read",
      args: [[["id", "in", chunk]]],
      kwargs: { fields: lineFields, limit: 1000 },
    });
    if (Array.isArray(got)) lines.push(...got);
  }

  // 3) Fetch product default_code (SKU) for category mapping
  const productIds = Array.from(
    new Set(
      lines
        .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null))
        .filter((x) => Number.isFinite(Number(x)))
    )
  );

  const productMap = new Map(); // productId -> { default_code, name }
  const prodChunks = [];
  for (let i = 0; i < productIds.length; i += 1000)
    prodChunks.push(productIds.slice(i, i + 1000));

  for (const chunk of prodChunks) {
    const prods = await odooExecuteKwXmlRpc({
      uid,
      model: "product.product",
      method: "search_read",
      args: [[["id", "in", chunk]]],
      kwargs: { fields: ["id", "default_code", "name"], limit: 1000 },
    });

    for (const p of Array.isArray(prods) ? prods : []) {
      productMap.set(Number(p.id), {
        default_code: String(p.default_code || "").trim(),
        name: String(p.name || "").trim(),
      });
    }
  }

  // 4) Index lines by invoice id
  const linesByMoveId = new Map(); // moveId -> []
  for (const l of lines) {
    const moveId = Array.isArray(l.move_id) ? Number(l.move_id[0]) : null;
    if (!Number.isFinite(moveId)) continue;
    const arr = linesByMoveId.get(moveId) || [];
    arr.push(l);
    linesByMoveId.set(moveId, arr);
  }

  // Return a “flattened” list: invoice header + line + sku
  const out = [];
  for (const inv of invoices) {
    const invId = Number(inv.id);
    const invLines = linesByMoveId.get(invId) || [];
    const company = Array.isArray(inv.company_id) ? inv.company_id[1] : "";
    const partner = Array.isArray(inv.partner_id) ? inv.partner_id[1] : "";

    const moveType = String(inv.move_type || "").trim(); // out_invoice / out_refund
    const sign = moveType === "out_refund" ? -1 : 1;

    for (const l of invLines) {
      const pid = Array.isArray(l.product_id) ? Number(l.product_id[0]) : null;
      const p = Number.isFinite(pid) ? productMap.get(pid) : null;

      let amt = Number(l.price_subtotal || 0);
      if (amt > 0 && sign < 0) amt = -amt;
      if (amt < 0 && sign > 0) amt = -amt;

      const docCurrency = Array.isArray(inv.currency_id)
        ? inv.currency_id[1]
        : "";
      const companyCurrency = Array.isArray(inv.company_currency_id)
        ? inv.company_currency_id[1]
        : "";

      // Doc currency amount (what you were already exporting)
      let amountDoc = Number(l.price_subtotal || 0);
      if (amountDoc > 0 && sign < 0) amountDoc = -amountDoc;
      if (amountDoc < 0 && sign > 0) amountDoc = -amountDoc;

      // Company currency amount (best for INR-normalized reporting if company currency is INR)
      // In accounting entries, revenue lines are often CREDIT => balance negative.
      // So sales amount in company currency becomes (-balance).
      let amountCompany = Number(l.balance || 0);
      if (!isFinite(amountCompany)) amountCompany = 0;
      amountCompany = -amountCompany;

      // Keep refund sign consistent with doc side (safety)
      if (amountCompany > 0 && sign < 0) amountCompany = -amountCompany;
      if (amountCompany < 0 && sign > 0) amountCompany = -amountCompany;
      // ✅ Amount (INR) should come from the field that is actually INR
      // ✅ Amount (INR)
      // Priority:
      // 1) If company currency is INR -> company amount is already INR
      // 2) Else if doc currency is INR -> doc amount is already INR
      // 3) Else convert using historical FX by invoice_date (prefer company amount if available, else doc amount)
      let amountInr = null;

      if (isInrCode(companyCurrency)) {
        amountInr = amountCompany;
      } else if (isInrCode(docCurrency)) {
        amountInr = amountDoc;
      } else {
        // keep null for now; we'll fill in a single batch after we finish collecting all rows
        amountInr = null;
      }

      out.push({
        invoice_id: invId,
        line_id: Number(l.id),

        invoice_date: inv.invoice_date,
        company,
        partner,
        invoice_name: inv.name,
        line_name: l.name,
        sku: p?.default_code || "",

        doc_currency: docCurrency,
        amount_doc: amountDoc,

        company_currency: companyCurrency,
        amount_company: amountCompany,

        amount_inr: amountInr,
      });
    }
  }
  // ------------------------ Fill missing INR using historical FX ------------------------
  // Build unique (date,currency) pairs to avoid repeated API calls
  const needPairs = [];
  const seen = new Set();

  for (const r of out) {
    if (r.amount_inr != null && r.amount_inr !== "") continue;

    const dateYmd = String(r.invoice_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;

    // Prefer company currency conversion if company_currency exists and amount_company is usable.
    const compCur = String(r.company_currency || "").trim();
    const docCur = String(r.doc_currency || "").trim();

    const compAmt = Number(r.amount_company);
    const docAmt = Number(r.amount_doc);

    let base = null;

    if (
      compCur &&
      !isInrCode(compCur) &&
      Number.isFinite(compAmt) &&
      compAmt !== 0
    ) {
      base = compCur;
    } else if (
      docCur &&
      !isInrCode(docCur) &&
      Number.isFinite(docAmt) &&
      docAmt !== 0
    ) {
      base = docCur;
    } else {
      continue;
    }

    const k = `${dateYmd}|${String(base).toUpperCase()}|INR`;
    if (!seen.has(k)) {
      seen.add(k);
      needPairs.push({
        dateYmd,
        base: String(base).toUpperCase(),
        symbol: "INR",
      });
    }
  }

  // Fetch FX with a small concurrency limit (tune if needed)
  const fxResults = await mapLimit(needPairs, 8, async (p) => {
    try {
      const rate = await getFxRateForDate(p);
      return { ...p, rate };
    } catch (e) {
      return { ...p, rate: null, error: String(e?.message || e) };
    }
  });

  const fxMap = new Map();
  for (const x of fxResults) {
    fxMap.set(`${x.dateYmd}|${x.base}|INR`, x.rate);
  }

  for (const r of out) {
    if (r.amount_inr != null && r.amount_inr !== "") continue;

    const dateYmd = String(r.invoice_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;

    const compCur = String(r.company_currency || "")
      .trim()
      .toUpperCase();
    const docCur = String(r.doc_currency || "")
      .trim()
      .toUpperCase();
    const compAmt = Number(r.amount_company);
    const docAmt = Number(r.amount_doc);

    let base = null;
    let amt = null;

    if (
      compCur &&
      !isInrCode(compCur) &&
      Number.isFinite(compAmt) &&
      compAmt !== 0
    ) {
      base = compCur;
      amt = compAmt;
    } else if (
      docCur &&
      !isInrCode(docCur) &&
      Number.isFinite(docAmt) &&
      docAmt !== 0
    ) {
      base = docCur;
      amt = docAmt;
    } else {
      continue;
    }

    const rate = fxMap.get(`${dateYmd}|${base}|INR`);
    if (Number.isFinite(rate) && Number.isFinite(amt)) {
      r.amount_inr = amt * rate;
    }
  }

  return out;
}

// OData V4 base root (NOT company-specific)
const odataBaseRoot = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environmentName}/ODataV4`;

function makeOdataCompanyRoot(companyDisplayName) {
  return `${odataBaseRoot}/Company('${encodeURIComponent(
    companyDisplayName
  )}')`;
}

async function fetchBcCompanyNames(accessToken) {
  // Try lowercase first, fallback to uppercase, because BC metadata varies.
  const candidates = [
    `${odataBaseRoot}/companies?$select=Name`,
    `${odataBaseRoot}/Companies?$select=Name`,
  ];

  for (const url of candidates) {
    try {
      const json = await fetchJsonWithRetry(url, { accessToken });
      const rows = Array.isArray(json.value) ? json.value : [];
      const names = rows
        .map((r) => String(r.Name || "").trim())
        .filter(Boolean);
      if (names.length) return names;
    } catch {
      // try next candidate
    }
  }

  // Fallback to the single configured company
  return [companyName];
}

// Standalone server (optional)
const PORT = Number(process.env.SD_PORT || process.env.PORT || 3399);
const HOST = process.env.HOST || "0.0.0.0";

// ------------------------ Group companies (exclude intercompany) ------------------------
const GROUP_COMPANIES = [
  "3AK CHEMIE (THAILAND) CO., LTD.",
  "3AK CHEMIE AUSTRALIA PTY LTD",
  "3AK CHEMIE HONG KONG LIMITED",
  "3AK CHEMIE JAPAN KK",
  "3AK CHEMIE MALAYSIA SDN. BHD.",
  "3AK CHEMIE NIGERIA LIMITED",
  "3AK CHEMIE PHILIPPINES PTE. LTD., INC.",
  "3AK CHEMIE SINGAPORE PTE. LTD.",
  "3AK CHEMIE SOUTH AFRICA PTY LTD",
  "3AK CHEMIE TUNISIA",
  "3AK CHEMIE USA LLC",
  "3AK CHEMIE VIETNAM COMPANY LIMITED",
  "PACIFIC DISTRIBUTION (THAILAND) CO., LTD",
  "PACIFIC DISTRIBUTION FZE",
  "PT. PACIFIC DISTRIBUTION INDONESIA)",
];

// ------------------------ SKU -> Category mapping (hardcoded) ------------------------
// Paste your full TSV exactly (header + rows). Keep tabs between columns.
// Columns:
// SKU  Name  Master Category  Category  Sub Category  Product Base Name
const CATEGORY_TSV = String.raw`SKU	Name	Master Category	Category	Sub Category	Product Base Name
2511-0001	MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant	MR672F
2511-0002	MR231, Dry Magnetic Powder - Grey (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders	MR231
`;

function buildCategoryMapFromTsv(tsv) {
  const map = new Map();
  const lines = String(tsv || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return map;

  // drop header row if present
  const startIdx = lines[0].toUpperCase().startsWith("SKU\t") ? 1 : 0;
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split("\t");
    const sku = (parts[0] || "").trim();
    if (!sku) continue;
    const obj = {
      sku,
      name: (parts[1] || "").trim(),
      masterCategory: (parts[2] || "").trim(),
      category: (parts[3] || "").trim(),
      subCategory: (parts[4] || "").trim(),
      productBaseName: (parts[5] || "").trim(),
    };
    // last write wins (lets you override duplicates)
    map.set(sku.toUpperCase(), obj);
  }
  return map;
}

const CATEGORY_MAP = buildCategoryMapFromTsv(CATEGORY_TSV);

// ------------------------ BC Description -> Category mapping (hardcoded) ------------------------
// Paste your matrix as TSV (TAB-separated), 5 columns:
// Name    Master Category   Category   Sub Category   Product Base Name
//
// Example row (TAB-separated):
// MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (400ml)    Non Destructive Testing   Dye Penetrant Testing   Penetrant   MR672F
const BC_CATEGORY_MATRIX_TSV = String.raw`Name    Master Category Category        Sub Category
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (400ml)      Non Destructive Testing Dye Penetrant Testing      Penetrant
MR231, Dry Magnetic Powder - Grey (1Kg) Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR62, Penetrant - Red; Solvent Removable (400 ml)       Non Destructive Testing Dye Penetrant Testing   Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (400ml)  Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable (400 ml)        Non Destructive Testing Dye Penetrant Testing      Penetrant
MR70, Developer - White, Non Aqueous (400 ml)   Non Destructive Testing Dye Penetrant Testing   Developer
MR70I, Developer - White, Non Aqueous (400 ml)  Non Destructive Testing Dye Penetrant Testing   Developer
MR79, Special Remover (400 ml)  Non Destructive Testing Dye Penetrant Testing   Cleaner
MR85, Remover (400 ml)  Non Destructive Testing Dye Penetrant Testing   Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable (400 ml)  Non Destructive Testing Dye Penetrant Testing      Penetrant
MR70I (HD), Developer - White, Non Aqueous (400 ml)     Non Destructive Testing Dye Penetrant Testing   Developer
MR76S, Magnetic Powder Suspension - Black (400 ml)      Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR76F, Magnetic Powder Suspension - Fluorescent (400 ml)        Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR761F, ECOLINE Magnetic Powder Suspension - Fluorescent (400 ml)       Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR72 OR, White Contrast Paint (400 ml)  Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR71, Paint Remover (400 ml)    Non Destructive Testing Magnetic Particle Testing       Cleaner
MR72 EZ, White Contrast Paint (400 ml)  Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR72 HD, White Contrast Paint (400 ml)  Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR72 AU, White Contrast Paint (400 ml)  Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR72 IN, White Contrast Paint (400 ml)  Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR233, Dry Magnetic Powder - Yellow (1Kg)       Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR234, Dry Magnetic Powder - Blue (1Kg) Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR683F, Penetrant - Flourescent Level 3; Solvent Removable (400 ml)     Non Destructive Testing Dye Penetrant Testing      Penetrant
MR110, ECOLINE Magnetic Powder - Fluorescent (1/2Kg)    Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent (1/2Kg)  Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR112, ECOLINE Magnetic Powder - Fluorescent (1/2Kg)    Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR222, ECOLINE Magnetic Powder - Red & Fluorescent (1Kg)        Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR81T-R, Dry Developer Powder (1Kg)     Non Destructive Testing Dye Penetrant Testing   Developer
MR210, ECOLINE Magnetic Powder - Black (1Kg)    Non Destructive Testing Magnetic Particle Testing       Detection Media (Visible)
MR214, Magnetic Powder Concentrate - Black (1Kg)        Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR114HB, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)      Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR110, ECOLINE Magnetic Powder - Fluorescent (1Kg)      Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent (1Kg)    Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR230, Dry Magnetic Powder - Red (1Kg)  Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR112, ECOLINE Magnetic Powder - Fluorescent (1Kg)      Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR232, Dry Magnetic Powder - Green (1Kg)        Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR115, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)        Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR118, Magnetic Powder Composition - Fluorescent (1Kg)  Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR304, Water Conditioner (1Kg)  Non Destructive Testing Magnetic Particle Testing       Additives
MR913-Y, Leak Detector concentrate, oil based (fluorescent - yellow) (1L)       Non Destructive Testing Leak Detection Systems     Leak Detection Dye
MR62, Penetrant - Red; Solvent Removable (1L)   Non Destructive Testing Dye Penetrant Testing   Penetrant
MR67, ECOLINE Penetrant - Red; Solvent & Water Removable (1L)   Non Destructive Testing Dye Penetrant Testing      Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (1L)     Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable (1L)    Non Destructive Testing Dye Penetrant Testing      Penetrant
MR70, Developer - White, Non Aqueous (1L)       Non Destructive Testing Dye Penetrant Testing   Developer
MR70I, Developer - White, Non Aqueous (1L)      Non Destructive Testing Dye Penetrant Testing   Developer
MR79, Special Remover (1L)      Non Destructive Testing Dye Penetrant Testing   Cleaner
MR85, Remover (1L)      Non Destructive Testing Dye Penetrant Testing   Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable (1L)      Non Destructive Testing Dye Penetrant Testing      Penetrant
MR221, ECOLINE Magnetic Powder Concentrate - Black (1L) Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR222LC, ECOLINE Magnetic Powder Concentrate - Red & Fluorescent (1L)   Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR153, ECOLINE Magnetic Powder Concentrate - Fluorescent (1L)   Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR158-R, ECOLINE Magnetic Powder Concentrate - Fluorescent (1L) Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR302, Corrosion Inhibitor Concentrate (1L)     Non Destructive Testing Magnetic Particle Testing       Additives
MR71, Paint Remover (1L)        Non Destructive Testing Magnetic Particle Testing       Cleaner
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable (205L)     Non Destructive Testing Dye Penetrant Testing      Penetrant
MR691F, Penetrant - Flourescent Level 1; Solvent & Water Removable (205L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (200L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR682F, Penetrant - Flourescent Level 2; Solvent & Water Removable (205L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR683F, Penetrant - Flourescent Level 3; Solvent Removable (205L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR82, Flux Oil (AMS) (205L)     Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR82-R, ECOLINE Flux Oil (205L) Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR82, Flux Oil (AMS) (25L)      Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable (5L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR691F, Penetrant - Flourescent Level 1; Solvent & Water Removable (5L) Non Destructive Testing Dye Penetrant Testing      Penetrant
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (5L) Non Destructive Testing Dye Penetrant Testing      Penetrant
MR682F, Penetrant - Flourescent Level 2; Solvent & Water Removable (5L) Non Destructive Testing Dye Penetrant Testing      Penetrant
MR683F, Penetrant - Flourescent Level 3; Solvent Removable (5L) Non Destructive Testing Dye Penetrant Testing      Penetrant
MR62, Penetrant - Red; Solvent Removable (5L)   Non Destructive Testing Dye Penetrant Testing   Penetrant
MR67, ECOLINE Penetrant - Red; Solvent & Water Removable (5L)   Non Destructive Testing Dye Penetrant Testing      Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (5L)     Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable (5L)    Non Destructive Testing Dye Penetrant Testing      Penetrant
MR70, Developer - White, Non Aqueous (5L)       Non Destructive Testing Dye Penetrant Testing   Developer
MR70I, Developer - White, Non Aqueous (5L)      Non Destructive Testing Dye Penetrant Testing   Developer
MR79, Special Remover (5L)      Non Destructive Testing Dye Penetrant Testing   Cleaner
MR85, Remover (5L)      Non Destructive Testing Dye Penetrant Testing   Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable (5L)      Non Destructive Testing Dye Penetrant Testing      Penetrant
MR153, ECOLINE Magnetic Powder Concentrate - Fluorescent (5L)   Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR158-R, ECOLINE Magnetic Powder Concentrate - Fluorescent (5L) Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR82-R, ECOLINE Flux Oil (25L)  Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR302, Corrosion Inhibitor Concentrate (5L)     Non Destructive Testing Magnetic Particle Testing       Additives
MR71, Paint Remover (5L)        Non Destructive Testing Magnetic Particle Testing       Cleaner
MR - SmartChoice, SC20 - Solvent Cleaner (280ml)        Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (280ml)      Non Destructive Testing SmartChoiceDye Penetrant Testing
MR115, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)        Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR913-B, Leak Detector concentrate, oil based (fluorescent - blue) (1L) Non Destructive Testing Leak Detection Systems     Leak Detection Dye
MR913-G, Leak Detector concentrate, oil based (fluorescent - green) (1L)        Non Destructive Testing Leak Detection Systems     Leak Detection Dye
MR - SmartChoice, SD30 - Non-Aqueous Developer (5L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (5L)   Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (5L) Non Destructive Testing SmartChoice     Dye Penetrant Testing
Klyde Rubber Insulation Coating - Blue (500ml)  MRO Consumables Coatings        NA
EF-6Y AC Magnetic Yoke 230V 50-60 Hz, 1 Phase   Non Destructive Testing Equipment & Accessories Yokes
Klyde Rubber Insulation Coating - Yellow (500ml)        MRO Consumables Coatings        NA
Klyde Flaky Zinc Spray 'Bright Grade' (500ml)   MRO Consumables Corrosion Protection and Rust Prevention  NA
MR311-R, Penetrant - Red; Solvent & Water Removable (25L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
MR114, Magnetic Powder Composition - Fluorescent (1Kg)  Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR111, ECOLINE Magnetic Powder - Fluorescent (1/2Kg)    Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR111, ECOLINE Magnetic Powder - Fluorescent (1Kg)      Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
MR117, Magnetic Powder Composition - Fluorescent (1Kg)  Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
Klyde Aquakleen Concentrate (20L)       MRO Consumables Cleaning and Degreasing Concentrates
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (500ml)      MRO Consumables Lubricants and Penetrating Oils    NA
MR312, Penetrant - Red & Fluorescent; Solvent & Water Removable (Low temperature upto -30°C) (400ml)    Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR76SH, Magnetic Powder Suspension - Black (High Temperature) (400 ml)  Non Destructive Testing Magnetic Particle Testing  Detection Media (Visible)
Klyde Flaky Zinc Spray 'Bright Grade' (400ml)   MRO Consumables Corrosion Protection and Rust Prevention  NA
ASTM Test Block Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable (400ml)      Non Destructive Testing Dye Penetrant Testing      Penetrant
MR652F, Penetrant - Flourescent Level 2; Solvent & Water Removable (400ml)      Non Destructive Testing Dye Penetrant Testing      Penetrant
Klyde - Smoke Detector Spray (280 ml)   MRO Consumables Special Sprays & Liquids        NA
MR232, Dry Magnetic Powder - Green (30 Kg)      Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (Piccolo-Pen)        Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR765RF, Magnetic Powder suspension - Red & Fluorescent (400 ml)        Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR72 IN - White Contrast Paint (5L)     Non Destructive Testing Magnetic Particle Testing       Contrast Paint
Klyde Rubber Insulation Coating - Black (500ml) MRO Consumables Coatings        NA
Klyde Aquakleen Concentrate (5L)        MRO Consumables Cleaning and Degreasing Concentrates
Klyde Cement Remover Concentrate (1L)   MRO Consumables Cleaning and Degreasing Concentrates
Bird Repellent Gel (Bio-Degradable) (5kg)       MRO Consumables Animal Control  Bird
Klyde Flaky Zinc Spray 'Chrome Finish' (400ml)  MRO Consumables Corrosion Protection and Rust Prevention  NA
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (280ml)  Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (400ml)  Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (1L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (5L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, WCP40 White Contrast Paint (400 ml)   Non Destructive Testing SmartChoice     Magnetic Particle Testing
MR76S (TS), Magnetic Powder Suspension - Black (400 ml) Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR - SmartChoice, MIK80 Magnetic Ink Black (400 ml)     Non Destructive Testing SmartChoice     Magnetic Particle Testing
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (400ml)      Non Destructive Testing SmartChoiceDye Penetrant Testing
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (5L) Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR79, Special Remover (20L)     Non Destructive Testing Dye Penetrant Testing   Cleaner
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (1L) Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR82, Flux Oil (AMS) (210L)     Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR85, Remover (20L)     Non Destructive Testing Dye Penetrant Testing   Cleaner
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (280ml)      Non Destructive Testing SmartChoiceDye Penetrant Testing
Klyde Rubber Insulation Coating - Red (500ml)   MRO Consumables Coatings        NA
Klyde Cement Remover Concentrate (5L)   MRO Consumables Cleaning and Degreasing Concentrates
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (400ml)      Non Destructive Testing SmartChoiceDye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (400ml)        Non Destructive Testing SmartChoice     Dye Penetrant Testing
Klyde Water Soluble Degreaser for Degreasing of Both Ferrous And Non-Ferrous Alloy Components (30L)     MRO Consumables    Cleaning and Degreasing NA
MR85, Remover (25L)     Non Destructive Testing Dye Penetrant Testing   Cleaner
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (1L) Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (1L)   Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (400ml)  Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (1L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (5L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
D-Shield Rodent Stopper (400ml) MRO Consumables Animal Control  NA
LUMOX YELLOW 101-1 (20 kg)      Speciality Chemicals    Pigments        NA
LUMOX YELLOW 101-2 (20 kg)      Speciality Chemicals    Pigments        NA
Klyde Aquakleen Concentrate (1L)        MRO Consumables Cleaning and Degreasing Concentrates
MR - SmartChoice, SD30 - Non-Aqueous Developer (400ml)  Non Destructive Testing SmartChoice     Dye Penetrant Testing
MR - SmartChoice, SD30 - Non-Aqueous Developer (1L)     Non Destructive Testing SmartChoice     Dye Penetrant Testing
Klyde Cement Remover Concentrate (20L)  MRO Consumables Cleaning and Degreasing Concentrates
MR68H, High Temperature Penetrant (400ml)       Non Destructive Testing Dye Penetrant Testing   High Temperature Testing
MR70H, High Temperature Developer (400ml)       Non Destructive Testing Dye Penetrant Testing   High Temperature Testing
MR91H, High Temperature Cleaner (400ml) Non Destructive Testing Dye Penetrant Testing   High Temperature Testing
MR131, Magnetic Powder Concentrate (1L) Non Destructive Testing Magnetic Particle Testing       Detection Media (Fluorescent)
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (1L) Non Destructive Testing Dye Penetrant Testing      Penetrant
SP10, Solvent Removable Penetrant - Red (5L)    Non Destructive Testing Dye Penetrant Testing   Penetrant
SC20, Solvent Cleaner (5L)      Non Destructive Testing Dye Penetrant Testing   Cleaner
SD30, Non Aqueous Developer (5L)        Non Destructive Testing Dye Penetrant Testing   Developer
D-Shield, 24hr Disinfectant Coating Spray (400ml)       MRO Consumables Special Sprays & Liquids        NA
ATTBLIME AB6 (400ml)    3D Scanning     3D Scanning Sprays      Sublimating
ATTBLIME AB24 (400ml)   3D Scanning     3D Scanning Sprays      Sublimating
ATTBLIME AB2 (400ml)    3D Scanning     3D Scanning Sprays      Sublimating
MR561, Hand Yoke        Non Destructive Testing Equipment & Accessories Yokes
MR673F, Penetrant - Fluorescent Level 3; Water Removable (5L)   Non Destructive Testing Dye Penetrant Testing      Penetrant
Ni-Cr 1 Test Panel Twin Crack Depth 30 Micron   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
ASME Aluminum Test Panel        Non Destructive Testing Equipment & Accessories Guages & Test Blocks
G57-3L ASME Aluminum Comparator Block   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR99 - Leak Detector (1L)       Non Destructive Testing Leak Detection Systems  Leak Detection Dye
MR975 UV LED Lamp       Non Destructive Testing UV Technology   Hand held Lamps
MR72 OR - White Contrast Paint (5L)     Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR72 OR - White Contrast Paint (1L)     Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR974AN UV LED Lamp     Non Destructive Testing UV Technology   Hand held Lamps
G19A MTU No. 3 Reference block type 1 acc. EN ISO 9934-2        Non Destructive Testing Equipment & Accessories    Guages & Test Blocks
G47-6L Reference Test Block JIS Z2343 30um - 2 panels   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
TRACER 100 Leak Detector Liquid - Fluorescent (25L)     Non Destructive Testing Leak Detection Systems  Leak Detection Dye
MR81 - Food Safe Dry Developer (1 kg)   Non Destructive Testing Dye Penetrant Testing   Developer
MR955 - Food Safe Penetrant (1L)        Non Destructive Testing Dye Penetrant Testing   Penetrant
MR Chemie Sample Box    Non Destructive Testing Promotion       Samples
MR673F, Penetrant - Fluorescent Level 3; Water Removable (1L)   Non Destructive Testing Dye Penetrant Testing      Penetrant
MR673F, Penetrant - Fluorescent Level 3; Water Removable (400ml)        Non Destructive Testing Dye Penetrant Testing      Penetrant
MR76S AU, Magnetic Powder Suspension - Black (400 ml)   Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
Deca 90 Sublimating Agent       Speciality Chemicals    NA      NA
MR56 Hand Yoke 230V w/ straight poles, mounted cable con, field strength pole dist. 160mm: 60 A/cm      Non Destructive Testing    Equipment & Accessories Yokes
Bird Repellent Gel (Bio-Degradable) (1kg)       MRO Consumables Animal Control  Bird
Cellulose Powder        Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
Cleaner B       MRO Consumables Cleaning and Degreasing NA
Black Die       MRO Consumables Special Sprays & Liquids        NA
MR - SmartChoice, SD30 - Non-Aqueous Developer (280ml)  Non Destructive Testing SmartChoice     Dye Penetrant Testing
Defender 11- A, Anti - Corrosion Coating        MRO Consumables Corrosion Protection and Rust Prevention  NA
CLEAN -11, Remover For Defender 11-A    MRO Consumables Cleaning and Degreasing NA
Klyde DE-Humidifier (400ml)     MRO Consumables Special Sprays & Liquids        NA
Piccolo-Pen MR70 Developer White Valve Pen      Non Destructive Testing Dye Penetrant Testing   Developer
Piccolo-Pen MR85 Remover Valve Pen      Non Destructive Testing Dye Penetrant Testing   Cleaner
Verpackungskosten Gefahrgut Luftfracht, UN-Karton fur Gebindeware, 290x210x320  Miscellaneous   NA      NA
Student Kit - NDT (pack of 6)   Non Destructive Testing Promotion       Samples
MR50 Hand Yoke 230 Volt Non Destructive Testing Equipment & Accessories Yokes
MR111HB, ECOLINE Magnetic Powder - Fluorescent (1Kg - Individual Pack)  Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent (1/2Kg Individual Pack)  Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
Aquakleen - Multipurpose Cleaner (1 Kg) MRO Consumables Cleaning and Degreasing RTU
ATTBLIME ABP (400ml)    3D Scanning     3D Scanning Sprays      Non Sublimating
Calibration of Yoke     Non Destructive Testing Equipment & Accessories Yokes
MR230, Dry Magnetic Powder - Red (30 Kg)        Non Destructive Testing Magnetic Particle Testing       Dry Powders
Aquakleen - Multipurpose Cleaner (20 Kg)        MRO Consumables Cleaning and Degreasing RTU
MR82, Flux Oil (AMS) (20L)      Non Destructive Testing Magnetic Particle Testing       Carrier Media
MR70I (EZ), Developer - White, Non Aqueous (400 ml)     Non Destructive Testing Dye Penetrant Testing   Developer
Technical Services - AM-3D Product R&D  Management Services     R&D Services    NA
Liquid Zinc Galvanize Paint (1L)        MRO Consumables Corrosion Protection and Rust Prevention        NA
CX-230 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.002"    Non Destructive Testing    Equipment & Accessories Guages & Test Blocks
Magnetic Flux Indicator Strips "G Type" Burma Castrol Strips    Non Destructive Testing Equipment & Accessories    Guages & Test Blocks
CX-230 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.002"    Non Destructive Testing    Equipment & Accessories Guages & Test Blocks
Klyde Rust Remover (1L) MRO Consumables Cleaning and Degreasing Rust Remover
Klyde Rust Remover (5L) MRO Consumables Cleaning and Degreasing Rust Remover
Klyde Zinc Metal Spray (400ml)  MRO Consumables Corrosion Protection and Rust Prevention        NA
Sprühkopf 3905  Miscellaneous   NA      NA
RILUMINATI 815 Indicator film fluorescent 500 ml aerosol can    Non Destructive Testing Riluminati      NA
RILUMINATI 816 overlay black 500 ml aerosol can Non Destructive Testing Riluminati      NA
Liquid Zinc Galvanize Paint (5L)        MRO Consumables Corrosion Protection and Rust Prevention        NA
MR72 IN(R), White Contrast Paint (425 ml)       Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR72 IN(R), White Contrast Paint (400 ml)       Non Destructive Testing Magnetic Particle Testing       Contrast Paint
Resinwork DENTSIN Aqua 1 (White) - 1 kg 3D Printing     Resin   Dental
Resinwork DENTSIN Aqua 1 (Transparent) - 1 kg   3D Printing     Resin   Dental
Resinwork Colour CR1 - 50 ml    3D Printing     Colour  NA
Resinwork Colour CY1 - 50 ml    3D Printing     Colour  NA
Resinwork Colour CB1 - 50 ml    3D Printing     Colour  NA
Ni-Cr 1 Test Panel Twin Crack Depth 10 Micron   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Ni-Cr 1 Test Panel Twin Crack Depth 20 Micron   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Ni-Cr 1 Test Panel Twin Crack Depth 50 Micron   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (100ml)      MRO Consumables Lubricants and Penetrating Oils    NA
Reference Test Block 2  Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR955 - Food Safe Penetrant (10L)       Non Destructive Testing Dye Penetrant Testing   Penetrant
Magnetic Flux Indicator Strips “A Type” Burma Castrol Strips    Non Destructive Testing Equipment & Accessories    Guages & Test Blocks
Reference Test Block Type 1 - MTU Block Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Attblime photopolymer Beige     3D Printing     Resin   NA
Attblime photopolymer White     3D Printing     Resin   NA
Attblime photopolymer Grey      3D Printing     Resin   NA
25 Messpunkte Promoboxen        3D Scanning     Dots    NA
4 Hinterrader Kinderwagen       Sample  Sample  NA
Klyde Silencer Coating Silver - High Temperature (280ml)        MRO Consumables Automotive Care NA
Klyde Silencer Coating Black High Temperature - 280ml   MRO Consumables Automotive Care NA
MR233, Dry Magnetic Powder - Yellow (30 Kg)     Non Destructive Testing Magnetic Particle Testing       Dry Powders
MR131, Magnetic Powder Concentrate (500ml)      Non Destructive Testing Magnetic Particle Testing       Detection Media (Fluorescent)
Aquakleen - Multipurpose Cleaner (5 Kgs)        MRO Consumables Cleaning and Degreasing RTU
Aquakleen - Multipurpose Cleaner (210 Kgs)      MRO Consumables Cleaning and Degreasing RTU
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (400ml) (Piccolo-Pen)    Non Destructive Testing    Dye Penetrant Testing   Penetrant
Consolidated Old Balance FG     Non Revenue     Dummy   NA
AC/DC Yoke      Non Destructive Testing Equipment & Accessories Yokes
20-0-20 Gauss Meter     Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Centrifugal Tube with Stand     Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Calcium Carbonate       Generic Chemical        NA      NA
UVA LED Flashlight      Non Destructive Testing UV Technology   Hand held Lamps
Resinwork DENTSIN Pro Aqua 2 (Birch Beige) - 1 kg       3D Printing     Resin   Dental
Magnetic Field Indicator Acc to ASTM E -709(Pie Guage)  Non Destructive Testing Equipment & Accessories Guages & Test Blocks
NA      NA      NA      NA
Penetrant Testing Flawed Specimen       Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR114HB, Magnetic Powder Composition - Fluorescent 'high brilliance' (50 Kg)    Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
Cellulose Powder (10 kg)        Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
MR757, One Pack UT Coupling Powder (55g)        Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
MR757, One Pack UT Coupling Powder (225g)       Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
Tam Panel Polished      Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Tam Panel Grit  Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Five Star Block (Type-2)        Non Destructive Testing Equipment & Accessories Guages & Test Blocks
EF-2Y-230V AC Yoke      Non Destructive Testing Equipment & Accessories Yokes
UV LED Torch without battery    Non Destructive Testing UV Technology   Hand held Lamps
PY -1 Permanent Magnetic Yoke   Non Destructive Testing Equipment & Accessories Yokes
PY - 2 Permanent Magnetic Yoke  Non Destructive Testing Equipment & Accessories Yokes
Magnetic Field Strength Meter MFM 200   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Articulation piece for articulated poles, for hand yoke MR® 56, MR® 56V42 MR® 56V110, 1 set = 2 piec    Non Destructive Testing    Equipment & Accessories Yokes
Contact pole for hand yoke MR® 56, MR® 56V42, MR® 56V110 1 set = 2 pieces       Non Destructive Testing Equipment & Accessories    Yokes
MR56 -1 Non Destructive Testing Equipment & Accessories Yokes
Klyde K226 - Multi-Purpose Electrical Lubricant (500ml) MRO Consumables Lubricants and Penetrating Oils NA
MR672F, Penetrant - Fluorescent Level 2; Solvent & Water Removable (25L)        Non Destructive Testing Dye Penetrant Testing      Penetrant
MR311-R (LD), Penetrant - Red; Solvent & Water Removable (5L)   Non Destructive Testing Dye Penetrant Testing      Penetrant
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable (Piccolo-Pen)      Non Destructive Testing    Dye Penetrant Testing   Penetrant
MR72 US, White Contrast Background (400 ml)     Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR76F US, Magnetic Powder Suspension - Fluorescent (400 ml)     Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR79 US, Special Remover (400 ml)       Non Destructive Testing Dye Penetrant Testing   Cleaner
MR - SmartChoice, WCP40 White Contrast Background (500 ml)      Non Destructive Testing SmartChoice     Magnetic Particle Testing
MR72 JP, White Contrast Background (400 ml)     Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MR76S JP, Magnetic Powder Suspension - Black (400 ml)   Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR76F JP, Magnetic Powder Suspension - Fluorescent (400 ml)     Non Destructive Testing Magnetic Particle Testing  Detection Media (Fluorescent)
MR - SmartChoice, MIK80 Magnetic Ink Black (500 ml)     Non Destructive Testing SmartChoice     Magnetic Particle Testing
MR79 JP, Special Remover (400 ml)       Non Destructive Testing Dye Penetrant Testing   Cleaner
MR76S US, Magnetic Powder Suspension - Black (400 ml)   Non Destructive Testing Magnetic Particle Testing Detection Media (Visible)
MR88; Remover (Acetone free) (Piccolo-Pen)      Non Destructive Testing Dye Penetrant Testing   Cleaner
MR757 1kg OLD - DO NOT USE      Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
MR757, One Pack UT Coupling Powder (1 kg)       Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
MR757 Y, One Pack UT Coupling Powder (yellow) (30 kg)   Non Destructive Testing Ultrasonic Testing Gels Coupling Powder
Klyde Rust Wipe (25L)   Non Destructive Testing Cleaning and Degreasing NA
MR88, Remover (Acetone free) (400 ml)   Non Destructive Testing Dye Penetrant Testing   Cleaner
Graconol Plus   MRO Consumables CNC Coolant     NA
Attblime Dental Scanning spray 200ml    3D Scanning     3D Scanning Sprays      NA
Attblime Dental Scanning spray 200ml    3D Scanning     3D Scanning Sprays      NA
Attblime Dental Scanning spray 200ml    3D Scanning     3D Scanning Sprays      NA
Reference Block Type 2  Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR® 67 Penetrant red and fluorescent(Jumbo- Pen)        Non Destructive Testing Dye Penetrant Testing   Penetrant
MR 703 W Developer white(Jumbo-Pen)     Non Destructive Testing Dye Penetrant Testing   Developer
MR68 C Penetrant red and fluorescent(Piccolo- Pen)      Non Destructive Testing Dye Penetrant Testing   Penetrant
Exhibition Material     Non Revenue     Events kit      NA
MRG, MR68 NF Penetrant red and fluorescent (500ml)      Non Destructive Testing Dye Penetrant Testing   Penetrant
MRG, MR68 NF Penetrant red and fluorescent (5L) Non Destructive Testing Dye Penetrant Testing   Penetrant
MRG, MR70 AMS Developer white (500ml)   Non Destructive Testing Dye Penetrant Testing   Developer
MRG: MR71 Paint Remover (500ml) Non Destructive Testing Magnetic Particle Testing       Cleaner
MRG, MR72 White Contrast Paint (500 ML) Non Destructive Testing Magnetic Particle Testing       Contrast Paint
MRG, MR76S Version S Magnetic powder suspension black (500ML)   Non Destructive Testing Magnetic Particle Testing  Detection Media (Visible)
MRG, MR88 AMS Remover (500ml)   Non Destructive Testing Dye Penetrant Testing   Cleaner
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable (1 L)        Non Destructive Testing Dye Penetrant Testing      Penetrant
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable (5 L)        Non Destructive Testing Dye Penetrant Testing      Penetrant
Klyde Weld Kleen Anti Spatter Fluid (500ml)     MRO Consumables Special Sprays & Liquids        Anti Spatter
TEST BODY ACC. PROF.BERTHOLD    Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MR652F, Penetrant - Flourescent Level 2; Solvent & Water Removable (1 L)        Non Destructive Testing Dye Penetrant Testing      Penetrant
CX-430 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.004"    Non Destructive Testing    Equipment & Accessories Guages & Test Blocks
Puffer Bulb     Non Destructive Testing Equipment & Accessories Guages & Test Blocks
75Kva Power Source Unit (60 V Output)   Radiography Accessories & HT    RT/HT Accessories       NA
Ceramic Heater 60 Voil Cp10     Radiography Accessories & HT    RT/HT Accessories       NA
4 Way Splitter Cable - 16 Mm Square ( 1Mtr. Long|) Hofr ( Black)        Radiography Accessories & HT    RT/HT Accessories  NA
Triple Cable Set - 2 Core * 25Mm Sq. 25 Mtr. Long Hofr  Radiography Accessories & HT    RT/HT Accessories NA
Nickel Chrome Ni/Ch 80/20 *19 Strands Mtr       Radiography Accessories & HT    RT/HT Accessories       NA
4 Way Splitter Cable - 16Mm Square (1 Mtr. Long Hofr (Orange)   Radiography Accessories & HT    RT/HT Accessories  NA
Ceramic Heater Cp12 60V Radiography Accessories & HT    RT/HT Accessories       NA
Nickel 212 Wire 19 Strand (100 Mtr/Roll)        Radiography Accessories & HT    RT/HT Accessories       NA
300 Female Panel Mounted Connector      Radiography Accessories & HT    RT/HT Accessories       NA
300 Ampcamlock (Female) Radiography Accessories & HT    RT/HT Accessories       NA
300 Amo Female High Temperature Sleeve  Radiography Accessories & HT    RT/HT Accessories       NA
300Amp Fiber Pin        Radiography Accessories & HT    RT/HT Accessories       NA
300 Amp Camlock (Male)  Radiography Accessories & HT    RT/HT Accessories       NA
300 Amp Male High Temperature Sleeve    Radiography Accessories & HT    RT/HT Accessories       NA
300 Amp Fiber Pin       Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Camlock (Female) Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Female High Temperature Sleeves  Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Fiber Pin        Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Camlock (Male)   Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Male High Temperature Sleeves    Radiography Accessories & HT    RT/HT Accessories       NA
Thermocouple Plug Type K In Yellow (Male)       Radiography Accessories & HT    RT/HT Accessories       NA
Thermocouple Socket Type K In Yellow (Female)   Radiography Accessories & HT    RT/HT Accessories       NA
Compensating Cable 14/36 (100 Mtrs)     Radiography Accessories & HT    RT/HT Accessories       NA
Thermocouple Wire K Type 0.71Mm (100Mtr Long) 800       Radiography Accessories & HT    RT/HT Accessories NA
Strip Chart Paper       Radiography Accessories & HT    RT/HT Accessories       NA
Attachment Unit With Magnet& Plier ( With Battery) [230V]       Radiography Accessories & HT    RT/HT Accessories  NA
PVC4 Cassettes Size : 10*20Cm (Inner& Outer ) (33 Micron)       Radiography Accessories & HT    RT/HT Accessories  NA
PVC Cassettes Size : 10*40Cm (Inner& Outer ) (33 Micron)        Radiography Accessories & HT    RT/HT Accessories  NA
Lead Marker Tape - 10 Cm Spacing, 10 Mtr. Long  Radiography Accessories & HT    RT/HT Accessories       NA
Lead Letter A To Z Size: 7Mm*Thk.2Mm (Punching Type)    Radiography Accessories & HT    RT/HT Accessories NA
Lead Letter A To Z Size: 7Mm*Thk.2Mm (Casting Type)     Radiography Accessories & HT    RT/HT Accessories NA
Lead Number 0 To 9 Size: 7Mm*Thk.2Mm (Punching Type)    Radiography Accessories & HT    RT/HT Accessories NA
Lead Number 0 To 9 Size: 7Mm*Thk.2Mm (Casting Type)     Radiography Accessories & HT    RT/HT Accessories NA
Wire Type Pene. 6Feen (50Mm)    Radiography Accessories & HT    RT/HT Accessories       NA
Wire Type Pene. 10Feen (50Mm)   Radiography Accessories & HT    RT/HT Accessories       NA
Wire Type Pene. 13Feen (50Mm)   Radiography Accessories & HT    RT/HT Accessories       NA
Lead Marker Box (Plastic) Red   Radiography Accessories & HT    RT/HT Accessories       NA
SS Holling Channel Type Hanger - 10*40 (3In1)   Radiography Accessories & HT    RT/HT Accessories       NA
SS Holling Channel Type Hanger - 10*20 (3In1)   Radiography Accessories & HT    RT/HT Accessories       NA
Corner Cutter   Radiography Accessories & HT    RT/HT Accessories       NA
Lead Intensifying Screen(0.125Mm) Size: 10*40Cm (Packing In 25 Pack)    Radiography Accessories & HT    RT/HT Accessories  NA
Lead Intensifying Screen(0.125Mm) Size: 10*20Cm (Packing In 25 Pack)    Radiography Accessories & HT    RT/HT Accessories  NA
SVK-RT Machine Spares   Radiography Accessories & HT    RT/HT Accessories       NA
MR751 Special Ultrasonic Coupling Agent Strippable Water Soluble (250 ml)       Non Destructive Testing Ultrasonic Testing Gels    Gel
BHEL Test Plate Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Business management services    Management Services     General Services        NA
MR62 US, Penetrant - Red; Solvent Removable (400 ml)    Non Destructive Testing Dye Penetrant Testing   Penetrant
MR70I US, Developer - White, Non Aqueous (400 ml)       Non Destructive Testing Dye Penetrant Testing   Developer
MR311-R US, Penetrant - Red; Solvent & Water Removable (400 ml) Non Destructive Testing Dye Penetrant Testing      Penetrant
EF-9Y, LIGHT WEIGHT SELECTABLE AC/HWDC MAGNETIZING MODES 230 V. Non Destructive Testing Equipment & Accessories    Yokes
MR72 KR, White Contrast Background (400 ml)     Non Destructive Testing Magnetic Particle Testing       NA
MR76S KR, Magnetic Powder Suspension - Black (400 ml)   Non Destructive Testing Magnetic Particle Testing NA
MR79 KR, Special Remover (400 ml)       Non Destructive Testing Dye Penetrant Testing   Cleaner
MR76F KR, Magnetic Powder Suspension - Fluorescent      (400 ml)        Non Destructive Testing Magnetic Particle Testing
MR62 KR, Penetrant - Red; Solvent Removable (400 ml)    Non Destructive Testing Dye Penetrant Testing   Penetrant
MR311-R JP AMS, Penetrant - Red; Solvent & Water Removable (400 ml)     Non Destructive Testing Dye Penetrant Testing      Penetrant
MR70I KR, Developer - White, Non Aqueous (400 ml)       Non Destructive Testing Dye Penetrant Testing   Developer
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (330ml)      MRO Consumables Lubricants and Penetrating Oils    NA
Klyde Weld Kleen Anti Spatter Fluid (5L)        MRO Consumables Special Sprays & Liquids        Anti Spatter
Resinwork Model 3 Aquaforge (grey) - IPA & Water washable 3D photopolymer resin (1 kg)  3D Printing     Resin      Dental
MR752 Special Ultrasonic Coupling Agent Non Destructive Testing Ultrasonic Testing Gels Gel
Magnetis II     NA      NA      NA
Anti Spatter Fluid (white label) (5L)   MRO Consumables Special Sprays & Liquids        Anti Spatter
MR673F, Penetrant - Flourescent Level 2; Solvent & Water Removable (Piccolo-Pen)        Non Destructive Testing    Dye Penetrant Testing   Penetrant
MRG, MR822 Coupling Oil (500 ML)        Non Destructive Testing NA      NA
MR5-6Y AC Magnetic Yoke 230V 50-60 Hz, 1 Phase  Non Destructive Testing Equipment & Accessories Yokes
Resinwork Model 3 Aquaforge (grey) - IPA & Water washable 3D photopolymer resin (1 kg)  3D Printing     Resin      Dental
Resinwork Model 3 Aquaforge (white) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)     3D PrintingResin   Dental
Klyde Weld Kleen Anti Spatter Fluid (1L)        MRO Consumables NA      NA
UV-Contrast Control Spectacles  Non Destructive Testing Equipment & Accessories Accessories
MR454 UVA/Lux Check measuring instrument        Non Destructive Testing Equipment & Accessories Guages & Test Blocks
MAGNETIC FIELD METER MP-1000    Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Spray handle for Aerosols       Non Destructive Testing Equipment & Accessories Accessories
Pressure Pump Sprayer 1.5 L     Non Destructive Testing Equipment & Accessories Accessories
Safety Transformer 42-V Radiography Accessories & HT    RT/HT Accessories       NA
Switch for Hand Yoke MR 56      Non Destructive Testing Equipment & Accessories Yokes
MR 56V42 hand yoke 42 volt      Non Destructive Testing Equipment & Accessories Yokes
ASTM Wire Type Pene. 1B - 11 (50mm/25mm) - Top  NA      NA      NA
ASTM Wire Type Pene. 1C - 16 (50mm/25mm) - Top / T /B   NA      NA      NA
Wire Type Pene. 1Feen / DIN (50mm/25mm) Radiography Accessories & HT    RT/HT Accessories
Resinwork Model 3 Aquaforge (Almond) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)    3D PrintingResin   Dental
UV light attachment for MR5-6Y  Non Destructive Testing UV Technology   Accessories
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (210L)       Non Destructive Testing Dye Penetrant Testing      Penetrant
Resinwork Model 3 Aquaforge (almond) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)    3D PrintingResin   Dental
Resinwork Model 3 Aquaforge (almond) - IPA & Water washable 3D photopolymer resin (1 kg)        3D PrintingResin   Dental
Resinwork Model 3 Aquaforge (snowcream) - IPA & Water washable 3D photopolymer resin (4 X 1 kg) 3D PrintingResin   Dental
Resinwork Model 3 Aquaforge (snowcream) - IPA & Water washable 3D photopolymer resin (1 kg)     3D PrintingResin   Dental
Resinwork Model 1 (grey) - water washable 3D photopolymer resin (1 kg)  3D Printing     Resin   Dental
Resinwork Model 1 (beige) - water washable 3D photopolymer resin (1 kg) 3D Printing     Resin   Dental
Resinwork Model 3 Aquaforge (beige) - IPA & Water washable 3D photopolymer resin (1 kg) 3D Printing     Resin      Dental
Resinwork Model 3 Aquaforge (beige) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)     3D PrintingResin   Dental
MR111HB, ECOLINE Magnetic Powder - Fluorescent (30Kg)   Non Destructive Testing Magnetic Particle Testing Detection Media (Fluorescent)
Tangential Probe P -T2  Radiography Accessories & HT    RT/HT Accessories       NA
JIS Type 3 Test Panel   Non Destructive Testing Equipment & Accessories Guages & Test Blocks
Resinwork Model 3 Aquaforge (almond orange) - IPA & Water washable 3D photopolymer resin (6 X 1 kg)     3D Printing        Resin   Dental
Resinwork Model 3 Aquaforge (almond orange) - IPA & Water washable 3D photopolymer resin (1 kg) 3D PrintingResin   Dental
ASTM Wire Type Pene. 1A -06     (50mm)- Top     Radiography Accessories & HT    RT/HT Accessories
ASTM 4A 06(CU) 50mm (Top)       Radiography Accessories & HT    RT/HT Accessories       NA
60 Amp Fiber pin, 60 Amp Male(Pin)      Radiography Accessories & HT    RT/HT Accessories       NA
Lead Number 0-9 (10 mm) Radiography Accessories & HT    RT/HT Accessories       NA
Lead Alphabets A-Z (10 mm)      Radiography Accessories & HT    RT/HT Accessories       NA
PVC Cassettes Size: 35 X 43 cm (inner & outer)  Radiography Accessories & HT    RT/HT Accessories       NA
PVC Cassettes Size: 18 X 43 cm (inner & outer)  Radiography Accessories & HT    RT/HT Accessories       NA
Chart paper (Sample)    Radiography Accessories & HT    RT/HT Accessories       NA
Cp 6 (Sample)   Radiography Accessories & HT    RT/HT Accessories       NA
Cp 8 (Sample)   Radiography Accessories & HT    RT/HT Accessories       NA
Lead marker tape, 5 cm spacing 1metres  Radiography Accessories & HT    RT/HT Accessories       NA
Chart Paper (Sample)    Radiography Accessories & HT    RT/HT Accessories       NA
MR90 UV-YokeR (Mountable on MR® 50 hand yoke)   Non Destructive Testing UV Technology   Accessories
Thermoluminescent dosimeter card        Radiography Accessories & HT    RT/HT Accessories       NA
MR511 Shot peening controller 500 ml aerosol can        Non Destructive Testing Equipment & Accessories Accessories
MR - SmartChoice, WCP40 CB White Contrast Background (400 ml)   Non Destructive Testing SmartChoice     Magnetic Particle Testing
`; // <-- replace with your full matrix list

function deriveBaseFromName(name) {
  // Example: "MR672F, Penetrant - ..." -> "MR672F"
  // Also works for: "MR - SmartChoice, SC20 - ..." -> "MR" (not ideal but safe)
  const s = String(name || "").trim();
  if (!s) return "";
  const beforeComma = s.split(",")[0].trim();
  // take first token (up to space) to avoid "MR - SmartChoice" becoming long
  const firstToken = beforeComma.split(/\s+/)[0].trim();
  return firstToken;
}

function splitMatrixLine(line) {
  const s = String(line || "").trimEnd();
  if (!s) return [];
  // Prefer tabs if present
  if (s.includes("\t")) return s.split("\t").map((x) => x.trim());
  // Otherwise split by 2+ spaces (your current matrix format)
  return s.split(/ {2,}/g).map((x) => x.trim());
}

function buildBcCategoryMatrixFromTsv(tsv) {
  const byName = new Map(); // norm(Name) -> obj
  const byBase = new Map(); // norm(Product Base Name) -> obj

  const lines = String(tsv || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (!lines.length) return { byName, byBase };

  // header detection should work for both "Name\t" and "Name    "
  const headerNorm = normName(lines[0] || "");
  const startIdx = headerNorm.startsWith("NAME") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitMatrixLine(lines[i]);

    const name = String(parts[0] || "").trim();
    if (!name) continue;

    const masterCategory = String(parts[1] || "").trim();
    const category = String(parts[2] || "").trim();
    const subCategory = String(parts[3] || "").trim();

    // optional 5th column (Product Base Name)
    let productBaseName = String(parts[4] || "").trim();

    if (!productBaseName || productBaseName.toUpperCase() === "NA") {
      productBaseName = deriveBaseFromName(name);
    }

    const obj = {
      name,
      masterCategory,
      category,
      subCategory,
      productBaseName,
    };

    byName.set(normName(name), obj);

    const base = String(obj.productBaseName || "").trim();
    if (base && base.toUpperCase() !== "NA") {
      byBase.set(normName(base), obj);
    }
  }

  return { byName, byBase };
}

const BC_CATEGORY_MATRIX = buildBcCategoryMatrixFromTsv(BC_CATEGORY_MATRIX_TSV);

// For fast "contains base code" matching (MR672F, MR70, etc.)
const BC_BASE_KEYS_DESC = Array.from(BC_CATEGORY_MATRIX.byBase.keys()).sort(
  (a, b) => b.length - a.length
);

function getBcCategoryForDescription(desc) {
  const raw = String(desc || "").trim();
  if (!raw) return null;

  // 1) exact name match after normalization
  const exact = BC_CATEGORY_MATRIX.byName.get(normName(raw));
  if (exact) return exact;

  // 2) base-name match: if Description contains product base code (MR672F etc.)
  const nDesc = normName(raw);
  for (const baseKey of BC_BASE_KEYS_DESC) {
    if (baseKey && nDesc.includes(baseKey)) {
      return BC_CATEGORY_MATRIX.byBase.get(baseKey) || null;
    }
  }

  return null;
}

function getCategoryForSku(sku) {
  const key = String(sku || "")
    .trim()
    .toUpperCase();
  if (!key) return null;
  return CATEGORY_MAP.get(key) || null;
}

function normName(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
const GROUP_COMPANY_SET = new Set(GROUP_COMPANIES.map(normName));

function looksIntercompanyPostingGroup(pg) {
  const s = String(pg || "").toUpperCase();
  if (!s) return false;
  if (s.includes("CMP")) return true;
  if (s.includes("GROUP")) return true;
  if (s.includes("INTERCO")) return true;
  return false;
}

// ------------------------ FY helpers (India FY Apr–Mar) ------------------------
const MONTHS_FY = [
  { key: "Apr", m: 4, fq: "FQ1" },
  { key: "May", m: 5, fq: "FQ1" },
  { key: "Jun", m: 6, fq: "FQ1" },
  { key: "Jul", m: 7, fq: "FQ2" },
  { key: "Aug", m: 8, fq: "FQ2" },
  { key: "Sep", m: 9, fq: "FQ2" },
  { key: "Oct", m: 10, fq: "FQ3" },
  { key: "Nov", m: 11, fq: "FQ3" },
  { key: "Dec", m: 12, fq: "FQ3" },
  { key: "Jan", m: 1, fq: "FQ4" },
  { key: "Feb", m: 2, fq: "FQ4" },
  { key: "Mar", m: 3, fq: "FQ4" },
];

function parseYmd(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const s = String(d).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function getIndiaFyLabel(date) {
  const d = new Date(date);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const fyEndYear = month <= 3 ? year : year + 1;
  const yy = String(fyEndYear).slice(-2);
  return `FY${yy}`;
}

function getMonthKey(date) {
  const m = new Date(date).getUTCMonth() + 1;
  for (const mm of MONTHS_FY) {
    if (mm.m === m) return mm.key;
  }
  return null;
}
function isInrCode(x) {
  const s = String(x || "")
    .trim()
    .toUpperCase();
  if (!s) return false;

  // Common Odoo displays
  // - "INR"
  // - "Indian Rupee"
  // - sometimes includes symbol or extra words
  if (s === "INR") return true;
  if (s.includes("INR")) return true;
  if (s.includes("INDIAN") && s.includes("RUPEE")) return true;
  if (s.includes("RUPEE")) return true;
  if (s.includes("₹")) return true;

  return false;
}
// ------------------------ FX (Historical) via Frankfurter (no key) ------------------------
// Docs: https://www.frankfurter.app/docs/  (public API: https://api.frankfurter.dev/v1)
const FX_API_BASE = "https://api.frankfurter.dev/v1";
const FX_CACHE = new Map(); // key: `${date}|${base}|${sym}` -> rate number

function normalizeFxCurrency(cur) {
  const s = String(cur || "")
    .trim()
    .toUpperCase();
  if (!s) return "";

  // Odoo sometimes gives names instead of ISO codes
  if (s === "KSH" || s.includes("KENYAN")) return "KES";
  if (s.includes("SHILLING") && s.includes("KENYA")) return "KES";

  // Common currency names that might appear
  if (s.includes("US DOLLAR") || s === "USD") return "USD";
  if (s.includes("EURO") || s === "EUR") return "EUR";

  // If already code-like, keep it
  return s;
}

async function getFxRateForDate({ dateYmd, base, symbol }) {
  const b = normalizeFxCurrency(base);
  const s = normalizeFxCurrency(symbol);
  const d = String(dateYmd || "").trim();

  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!b || !s) return null;
  if (b === s) return 1;

  // ✅ HARD-CODE: Kenya -> INR
  // 1 Kenyan currency unit = 0.70 rupees
  if (b === "KES" && s === "INR") return 0.7;

  const key = `${d}|${b}|${s}`;
  if (FX_CACHE.has(key)) return FX_CACHE.get(key);

  const url = `${FX_API_BASE}/${encodeURIComponent(
    d
  )}?base=${encodeURIComponent(b)}&symbols=${encodeURIComponent(s)}`;

  const resp = await fetch(url);
  const txt = await resp.text();
  if (!resp.ok) {
    FX_CACHE.set(key, null);
    throw new Error(`FX ${resp.status}: ${txt.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    FX_CACHE.set(key, null);
    throw new Error(`FX non-JSON response: ${txt.slice(0, 200)}`);
  }

  const rate = Number(json?.rates?.[s]);
  const out = Number.isFinite(rate) ? rate : null;
  FX_CACHE.set(key, out);
  return out;
}

// small concurrency helper to avoid 20k parallel requests
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await fn(items[cur], cur);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return out;
}

function money(n) {
  const x = Number(n || 0);
  if (!isFinite(x)) return 0;
  return x;
}

function fyToRange(fyLabel) {
  const m = String(fyLabel || "")
    .toUpperCase()
    .match(/^FY(\d{2})$/);
  if (!m) return null;
  const endYY = Number(m[1]);
  const endYear = 2000 + endYY;
  const startYear = endYear - 1;
  return { from: `${startYear}-04-01`, to: `${endYear}-03-31` };
}

function mergeRanges(ranges) {
  if (!ranges.length) return null;
  const fromMin = ranges.map((r) => r.from).sort()[0];
  const toMax = ranges
    .map((r) => r.to)
    .sort()
    .slice(-1)[0];
  return { from: fromMin, to: toMax };
}

// ------------------------ key inference helpers ------------------------
function pickKey(obj, candidates) {
  if (!obj || typeof obj !== "object") return null;
  const keys = Object.keys(obj);
  const lowerMap = new Map(keys.map((k) => [k.toLowerCase(), k]));

  for (const c of candidates) {
    const hit = lowerMap.get(String(c).toLowerCase());
    if (hit) return hit;
  }

  function norm(s) {
    return String(s).toLowerCase().replace(/[\s_]/g, "");
  }
  const normMap = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = normMap.get(norm(c));
    if (hit) return hit;
  }

  return null;
}

function inferSalesDashboardKeys(sampleRow) {
  const entryNoKey = pickKey(sampleRow, ["Entry_No", "EntryNo", "Entry No"]);
  const postingDateKey = pickKey(sampleRow, [
    "Posting_Date",
    "PostingDate",
    "Posting Date",
  ]);
  const entryTypeKey = pickKey(sampleRow, [
    "Entry_Type",
    "EntryType",
    "Entry Type",
  ]);
  const salesAmountActualKey = pickKey(sampleRow, [
    "Sales_Amount_Actual",
    "SalesAmountActual",
    "Sales Amount Actual",
  ]);
  const customerNameKey = pickKey(sampleRow, ["CustomerName", "Customer Name"]);
  const customerPostingGroupKey = pickKey(sampleRow, [
    "Customer_Posting_Group",
    "CustomerPostingGroup",
    "Customer Posting Group",
  ]);

  const descriptionKey = pickKey(sampleRow, [
    "Description",
    "Item_Description",
    "Item Description",
  ]);
  const itemNoKey = pickKey(sampleRow, [
    "Item_No",
    "ItemNo",
    "Item No",
    "No",
    "No_",
    "ItemNumber",
    "Item Number",
  ]);

  return {
    entryNoKey,
    postingDateKey,
    entryTypeKey,
    salesAmountActualKey,
    customerNameKey,
    customerPostingGroupKey,
    descriptionKey,
    itemNoKey,
  };
}

// ------------------------ SalesDashboard fetch (ALL rows via keyset paging) ------------------------
async function fetchSampleRow(odataCompanyRoot, serviceName, accessToken) {
  const url = `${odataCompanyRoot}/${serviceName}?$top=1`;
  const json = await fetchJsonWithRetry(url, { accessToken });
  const rows = Array.isArray(json.value) ? json.value : [];
  return rows[0] || null;
}

function buildSelectParam(keys) {
  const list = [
    keys.entryNoKey,
    keys.postingDateKey,
    keys.entryTypeKey,
    keys.salesAmountActualKey,
    keys.customerNameKey,
    keys.customerPostingGroupKey,
    keys.descriptionKey,
    keys.itemNoKey,
  ].filter(Boolean);

  return Array.from(new Set(list));
}

function buildODataUrl(odataCompanyRoot, serviceName, qs) {
  const parts = [];
  for (const [k, v] of Object.entries(qs)) {
    if (v == null || v === "") continue;
    parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return `${odataCompanyRoot}/${serviceName}?${parts.join("&")}`;
}

async function fetchAllSalesDashboard({
  odataCompanyRoot, // ✅ ADD THIS
  serviceName,
  accessToken,
  keys,
  fromDateYmd,
  toDateYmd,
  includeEntryTypes,
  batchSize = 10000,
  hardMaxBatches = 200000,
}) {
  if (!keys.entryNoKey) {
    throw new Error("Could not infer Entry_No key from SalesDashboard.");
  }

  const canDateFilter = !!keys.postingDateKey;
  // IMPORTANT: do NOT filter Entry_Type server-side.
  // BC / OData string/enum comparisons can be case/format sensitive and can drop rows.
  // We'll filter Entry_Type in JS (buildFyTableFromRows) to guarantee inclusion.
  const canEntryTypeFilter = false;

  let lastEntryNo = 0;
  let all = [];
  let batches = 0;

  while (true) {
    batches++;
    if (batches > hardMaxBatches) {
      throw new Error(`Safety stop: too many batches (${hardMaxBatches}).`);
    }

    const filterParts = [];
    filterParts.push(`${keys.entryNoKey} gt ${lastEntryNo}`);

    if (canDateFilter && fromDateYmd && toDateYmd) {
      filterParts.push(
        `${keys.postingDateKey} ge ${fromDateYmd} and ${keys.postingDateKey} le ${toDateYmd}`
      );
    }

    const $select = buildSelectParam(keys);
    const url = buildODataUrl(odataCompanyRoot, serviceName, {
      $select: $select.join(","),
      $orderby: `${keys.entryNoKey} asc`,
      $top: batchSize,
      $filter: filterParts.join(" and "),
    });

    let json;
    try {
      json = await fetchJsonWithRetry(url, { accessToken });
    } catch (_e) {
      const fallbackUrl = buildODataUrl(odataCompanyRoot, serviceName, {
        $select: $select.join(","),
        $orderby: `${keys.entryNoKey} asc`,
        $top: batchSize,
        $filter: `${keys.entryNoKey} gt ${lastEntryNo}`,
      });
      json = await fetchJsonWithRetry(fallbackUrl, { accessToken });
    }

    const rows = Array.isArray(json.value) ? json.value : [];
    if (rows.length === 0) break;

    all = all.concat(rows);

    const last = rows[rows.length - 1];
    const nextNo = Number(last[keys.entryNoKey] || 0);
    if (!isFinite(nextNo) || nextNo <= lastEntryNo) break;
    lastEntryNo = nextNo;

    if (rows.length < batchSize) break;
  }

  return all;
}

// ------------------------ Build FY table ------------------------
function buildFyTableFromRows(rows, options) {
  const {
    fyLabels,
    keys,
    includeEntryTypes,
    excludeIntercompany = true,
    customerContains,
    descriptionContains,
    categoryContains,

    // ✅ ADD THESE
    masterCategoryContains,
    subCategoryContains,
    categoryFilterContains,
  } = options;

  function incMatch(hay, needle) {
    const h = String(hay || "").toUpperCase();
    const n = String(needle || "")
      .toUpperCase()
      .trim();
    if (!n) return true;
    return h.includes(n);
  }

  const buckets = {};
  for (const fy of fyLabels) {
    buckets[fy] = Object.fromEntries(MONTHS_FY.map((m) => [m.key, 0]));
  }

  let used = 0;
  let skippedWrongType = 0;
  let skippedBadDate = 0;
  let skippedIntercompany = 0;
  let skippedNotInFy = 0;

  let skippedCustomerFilter = 0;
  let skippedDescriptionFilter = 0;
  let skippedCategoryFilter = 0;
  let unmappedSkuCount = 0;

  // Keep minimal used rows for grouping
  const usedMini = [];

  for (const r of rows) {
    if (keys.entryTypeKey && includeEntryTypes && includeEntryTypes.size > 0) {
      const et = String(r[keys.entryTypeKey] || "")
        .toUpperCase()
        .trim();
      if (!includeEntryTypes.has(et)) {
        skippedWrongType++;
        continue;
      }
    }

    const dt = keys.postingDateKey ? parseYmd(r[keys.postingDateKey]) : null;
    if (!dt) {
      skippedBadDate++;
      continue;
    }

    const fy = getIndiaFyLabel(dt);
    if (!fyLabels.includes(fy)) {
      skippedNotInFy++;
      continue;
    }

    if (excludeIntercompany && String(r.__source || "bc") !== "odoo") {
      const custName = keys.customerNameKey
        ? String(r[keys.customerNameKey] || "")
        : "";
      const pg = keys.customerPostingGroupKey
        ? String(r[keys.customerPostingGroupKey] || "")
        : "";

      const isGroupByName = GROUP_COMPANY_SET.has(normName(custName));
      const isGroupByPg = looksIntercompanyPostingGroup(pg);

      if (isGroupByName || isGroupByPg) {
        skippedIntercompany++;
        continue;
      }
    }

    // Filters
    const custName = keys.customerNameKey
      ? String(r[keys.customerNameKey] || "")
      : "";
    if (!incMatch(custName, customerContains)) {
      skippedCustomerFilter++;
      continue;
    }

    const desc = keys.descriptionKey
      ? String(r[keys.descriptionKey] || "")
      : "";
    if (!incMatch(desc, descriptionContains)) {
      skippedDescriptionFilter++;
      continue;
    }

    const srcRow = String(r.__source || "bc").toLowerCase();

    // ---- CATEGORY FOR FILTERING + GROUPING ----
    // ✅ BC ONLY: treat Description as "Category"
    // Odoo / other: keep SKU-based mapping as before
    const sku = keys.itemNoKey ? String(r[keys.itemNoKey] || "") : "";

    let catObj = null;
    let categoryLabel = "";

    if (srcRow === "bc") {
      // ✅ NEW: classify BC using your matrix (Description -> Category)
      catObj = getBcCategoryForDescription(desc);

      // If nothing matches, keep a safe fallback label
      categoryLabel = catObj?.category || "UNMAPPED";
    } else {
      // Odoo uses SKU mapping as before
      catObj = getCategoryForSku(sku);
      if (!catObj) unmappedSkuCount++;
      categoryLabel = catObj?.category || "UNMAPPED";
    }

    // (A) broad search filter (your old "category contains…" box)
    // ---- CATEGORY FILTERING ----
    const masterLabel = catObj?.masterCategory || "UNMAPPED";
    const categoryOnlyLabel = catObj?.category || "UNMAPPED";
    const subLabel = catObj?.subCategory || "UNMAPPED";
    const baseLabel = catObj?.productBaseName || "UNMAPPED";

    // (A) broad search filter (your old "category contains…" box)
    const categorySearchBlob =
      srcRow === "bc"
        ? [
            desc,
            catObj?.name,
            masterLabel,
            categoryOnlyLabel,
            subLabel,
            baseLabel,
          ]
            .filter(Boolean)
            .join(" | ")
        : [
            sku,
            catObj?.name,
            masterLabel,
            categoryOnlyLabel,
            subLabel,
            baseLabel,
            desc,
          ]
            .filter(Boolean)
            .join(" | ");

    if (!incMatch(categorySearchBlob, categoryContains)) {
      skippedCategoryFilter++;
      continue;
    }

    // (B) Master Category filter
    if (!incMatch(masterLabel, masterCategoryContains)) {
      skippedCategoryFilter++;
      continue;
    }

    // (C) Category-only filter
    if (!incMatch(categoryOnlyLabel, categoryFilterContains)) {
      skippedCategoryFilter++;
      continue;
    }

    // (D) Sub Category filter
    if (!incMatch(subLabel, subCategoryContains)) {
      skippedCategoryFilter++;
      continue;
    }

    // ✅ Month key must be defined BEFORE using it
    const monthKey = getMonthKey(dt);
    if (!monthKey) {
      skippedBadDate++;
      continue;
    }

    const amt = keys.salesAmountActualKey
      ? money(r[keys.salesAmountActualKey])
      : 0;

    buckets[fy][monthKey] += amt;
    used++;

    const src = String(r.__source || "bc");
    const comp = String(r.__company || companyName || "UNKNOWN");

    usedMini.push({
      source: src,
      company: comp,

      fy,
      monthKey,
      amount: amt,
      customerName: custName || "UNKNOWN",
      description: desc || "UNKNOWN",
      sku: sku || "",

      // ✅ BC only: "category" should be Description
      category:
        srcRow === "bc"
          ? catObj?.category || "UNMAPPED"
          : catObj?.category || "UNMAPPED",
      masterCategory:
        srcRow === "bc"
          ? catObj?.masterCategory || "UNMAPPED"
          : catObj?.masterCategory || "UNMAPPED",
      subCategory:
        srcRow === "bc"
          ? catObj?.subCategory || "UNMAPPED"
          : catObj?.subCategory || "UNMAPPED",
      productBaseName:
        srcRow === "bc"
          ? catObj?.productBaseName || "UNMAPPED"
          : catObj?.productBaseName || "UNMAPPED",
    });
  }

  function groupTotals(arr, keyName) {
    const m = new Map();
    for (const x of arr) {
      const k = String(x[keyName] || "UNKNOWN");
      const prev = m.get(k) || { key: k, amount: 0, count: 0 };
      prev.amount += Number(x.amount || 0);
      prev.count += 1;
      m.set(k, prev);
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
  }

  const outRows = [];
  for (const fq of ["FQ1", "FQ2", "FQ3", "FQ4"]) {
    const months = MONTHS_FY.filter((m) => m.fq === fq);
    for (const m of months) {
      const row = { fq, month: m.key };
      for (const fy of fyLabels) row[fy] = buckets[fy][m.key] || 0;
      outRows.push(row);
    }
  }

  const totals = {};
  for (const fy of fyLabels) {
    totals[fy] = MONTHS_FY.reduce(
      (sum, m) => sum + (buckets[fy][m.key] || 0),
      0
    );
  }

  return {
    columns: fyLabels,
    rows: outRows,
    totals,
    groups: {
      byCompany: groupTotals(usedMini, "company"),

      byCustomer: groupTotals(usedMini, "customerName"),
      byDescription: groupTotals(usedMini, "description"),
      byCategory: groupTotals(usedMini, "category"),
      byMasterCategory: groupTotals(usedMini, "masterCategory"),
      bySubCategory: groupTotals(usedMini, "subCategory"),
      byProductBaseName: groupTotals(usedMini, "productBaseName"),
    },
    debug: {
      rowCount: rows.length,
      usedRowCount: used,
      skippedWrongType,
      skippedBadDate,
      skippedIntercompany,
      skippedNotInFy,
      skippedCustomerFilter,
      skippedDescriptionFilter,
      skippedCategoryFilter,
      unmappedSkuCount,
      detectedKeys: keys,
    },
  };
}

// ------------------------ Excel writer ------------------------
async function writeFyTableXlsx(res, payload) {
  const { meta, table } = payload;

  const wb = new ExcelJS.Workbook();
  wb.creator = "sd.cjs";
  wb.created = new Date();

  const sheet = wb.addWorksheet("FY Table", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  const fyCols = table.columns || ["FY24", "FY25", "FY26"];

  sheet.columns = [
    { header: "", key: "fq", width: 10 },
    { header: "", key: "month", width: 10 },
    ...fyCols.map((fy) => ({ header: fy, key: fy, width: 18 })),
  ];

  sheet.mergeCells(1, 1, 1, 2 + fyCols.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Sales FY Table (excl. intercompany) — ${meta.company}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 22;

  const hdr = sheet.getRow(2);
  hdr.getCell(1).value = "FQ";
  hdr.getCell(2).value = "Month";
  for (let i = 0; i < fyCols.length; i++) hdr.getCell(3 + i).value = fyCols[i];
  hdr.font = { bold: true };
  hdr.alignment = { vertical: "middle", horizontal: "center" };

  let rowIdx = 3;

  for (const fq of ["FQ1", "FQ2", "FQ3", "FQ4"]) {
    const groupRows = table.rows.filter((r) => r.fq === fq);
    const startRow = rowIdx;

    for (const r of groupRows) {
      const rr = sheet.getRow(rowIdx);
      rr.getCell(1).value = fq;
      rr.getCell(2).value = r.month;

      for (let i = 0; i < fyCols.length; i++) {
        const fy = fyCols[i];
        const cell = rr.getCell(3 + i);
        cell.value = Number(r[fy] || 0);
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }

      rr.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      rowIdx++;
    }

    const endRow = rowIdx - 1;
    sheet.mergeCells(startRow, 1, endRow, 1);
    const fqCell = sheet.getCell(startRow, 1);
    fqCell.font = { bold: true };
    fqCell.alignment = { vertical: "middle", horizontal: "center" };

    for (let c = 1; c <= 2 + fyCols.length; c++) {
      const cell = sheet.getCell(endRow, c);
      cell.border = { ...(cell.border || {}), bottom: { style: "thick" } };
    }
  }

  const totalRow = sheet.getRow(rowIdx);
  totalRow.getCell(1).value = "Total";
  sheet.mergeCells(rowIdx, 1, rowIdx, 2);
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

  for (let i = 0; i < fyCols.length; i++) {
    const fy = fyCols[i];
    const cell = totalRow.getCell(3 + i);
    cell.value = Number(table.totals?.[fy] || 0);
    cell.numFmt = "#,##0.00";
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "right" };
  }

  const maxRow = rowIdx;
  const maxCol = 2 + fyCols.length;
  for (let r = 2; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = sheet.getCell(r, c);
      const existing = cell.border || {};
      cell.border = {
        top: existing.top || { style: "thin" },
        left: existing.left || { style: "thin" },
        bottom: existing.bottom || { style: "thin" },
        right: existing.right || { style: "thin" },
      };
    }
  }

  for (let r = 2; r <= maxRow; r++) {
    sheet.getCell(r, 3).border = {
      ...(sheet.getCell(r, 3).border || {}),
      left: { style: "thick" },
    };
    sheet.getCell(r, maxCol).border = {
      ...(sheet.getCell(r, maxCol).border || {}),
      right: { style: "thick" },
    };
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="fy-table-excl-interco-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx"`
  );

  // ------------------ By Customer ------------------
  if (table.groups?.byCustomer?.length) {
    const s = wb.addWorksheet("By Customer", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    s.columns = [
      { header: "Customer", key: "key", width: 50 },
      { header: "Amount", key: "amount", width: 18 },
      { header: "Rows", key: "count", width: 10 },
    ];
    s.getRow(1).font = { bold: true };
    for (const r of table.groups.byCustomer) {
      s.addRow({
        key: r.key,
        amount: Number(r.amount || 0),
        count: Number(r.count || 0),
      });
    }
    s.getColumn("amount").numFmt = "#,##0.00";
  }

  // ------------------ By Category ------------------
  if (table.groups?.byCategory?.length) {
    const s = wb.addWorksheet("By Category", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    s.columns = [
      { header: "Category", key: "key", width: 40 },
      { header: "Amount", key: "amount", width: 18 },
      { header: "Rows", key: "count", width: 10 },
    ];
    s.getRow(1).font = { bold: true };
    for (const r of table.groups.byCategory) {
      s.addRow({
        key: r.key,
        amount: Number(r.amount || 0),
        count: Number(r.count || 0),
      });
    }
    s.getColumn("amount").numFmt = "#,##0.00";
  }

  // ------------------ Excluded Intercompany Names ------------------
  if (meta?.intercompanyGroupCompanies?.length) {
    const s = wb.addWorksheet("Excluded Intercompany", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    s.columns = [{ header: "Excluded Customer Names", key: "name", width: 60 }];
    s.getRow(1).font = { bold: true };
    for (const n of meta.intercompanyGroupCompanies) s.addRow({ name: n });
  }

  await wb.xlsx.write(res);
  res.end();
}

async function writeOdooRowsXlsx(res, { rows, meta }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "sd.cjs";
  wb.created = new Date();

  const info = wb.addWorksheet("Info");
  info.columns = [
    { header: "Key", key: "k", width: 28 },
    { header: "Value", key: "v", width: 80 },
  ];
  info.getRow(1).font = { bold: true };
  Object.entries(meta || {}).forEach(([k, v]) => {
    info.addRow({ k, v: typeof v === "string" ? v : JSON.stringify(v) });
  });

  const s = wb.addWorksheet("Odoo Rows", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  s.columns = [
    { header: "Invoice Date", key: "invoice_date", width: 14 },
    { header: "Company", key: "company", width: 30 },
    { header: "Customer", key: "partner", width: 40 },
    { header: "Invoice", key: "invoice_name", width: 26 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Line", key: "line_name", width: 60 },

    { header: "Doc Currency", key: "doc_currency", width: 12 },
    { header: "Amount (Doc)", key: "amount_doc", width: 18 },

    { header: "Company Currency", key: "company_currency", width: 16 },
    { header: "Amount (Company)", key: "amount_company", width: 20 },

    { header: "Amount (INR)", key: "amount_inr", width: 18 },

    { header: "Invoice ID", key: "invoice_id", width: 12 },
    { header: "Line ID", key: "line_id", width: 12 },
  ];

  s.getRow(1).font = { bold: true };

  for (const r of Array.isArray(rows) ? rows : []) {
    s.addRow(r);
  }

  // number formats
  for (const col of ["amount_doc", "amount_company", "amount_inr"]) {
    s.getColumn(col).numFmt = "#,##0.00";
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="odoo-rows-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx"`
  );

  await wb.xlsx.write(res);
  res.end();
}

function resolveFromToYmdFromQuery(req) {
  const from = String(req.query.from || "").trim(); // YYYY-MM-DD
  const to = String(req.query.to || "").trim(); // YYYY-MM-DD

  // If caller provided explicit from/to, use that.
  if (from && to) return { fromYmd: from, toYmd: to };

  // Else derive range from FY labels (same logic style as fy-table)
  const fyLabels = parseFyLabels(req.query.fy); // uses default FY24,FY25,FY26 if missing
  const ranges = fyLabels.map(fyToRange).filter(Boolean);
  const merged = mergeRanges(ranges);

  if (!merged?.from || !merged?.to) {
    // ultimate fallback (keep predictable)
    return { fromYmd: "2023-04-01", toYmd: "2026-03-31" };
  }

  return { fromYmd: merged.from, toYmd: merged.to };
}

async function writeOdooRowsXlsx(res, opts) {
  const { meta, rows } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "sd.cjs";
  wb.created = new Date();

  // ---- Meta sheet ----
  const metaSheet = wb.addWorksheet("Meta");
  metaSheet.columns = [
    { header: "Key", key: "k", width: 28 },
    { header: "Value", key: "v", width: 80 },
  ];
  metaSheet.getRow(1).font = { bold: true };

  const metaPairs = [
    ["from", meta.fromYmd],
    ["to", meta.toYmd],
    ["odooBase", meta.odooBase],
    ["odooDb", meta.odooDb],
    ["rowCount", String(meta.rowCount)],
    ["generatedAt", meta.generatedAt],
  ];
  for (const [k, v] of metaPairs) metaSheet.addRow({ k, v });

  // ---- Data sheet ----
  const sheet = wb.addWorksheet("Odoo Rows", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Invoice Date", key: "invoice_date", width: 14 },
    { header: "Company", key: "company", width: 28 },
    { header: "Customer", key: "partner", width: 38 },
    { header: "Invoice", key: "invoice_name", width: 22 },
    { header: "Line", key: "line_name", width: 50 },
    { header: "SKU", key: "sku", width: 14 },

    { header: "Doc Currency", key: "doc_currency", width: 12 },
    { header: "Amount (Doc)", key: "amount_doc", width: 16 },

    { header: "Company Currency", key: "company_currency", width: 16 },
    { header: "Amount (Company)", key: "amount_company", width: 18 },

    { header: "Amount (INR)", key: "amount_inr", width: 16 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    const sku = String(r.sku || "").trim();
    const cat = getCategoryForSku(sku);

    sheet.addRow({
      invoice_date: r.invoice_date || "",
      company: r.company || "",
      partner: r.partner || "",
      invoice_name: r.invoice_name || "",
      line_name: r.line_name || "",
      sku: String(r.sku || "").trim(),

      doc_currency: r.doc_currency || "",
      amount_doc:
        r.amount_doc == null || r.amount_doc === "" ? "" : Number(r.amount_doc),
      amount_company:
        r.amount_company == null || r.amount_company === ""
          ? ""
          : Number(r.amount_company),

      company_currency: r.company_currency || "",

      amount_inr: r.amount_inr == null ? "" : Number(r.amount_inr || 0),
    });
  }

  // number formatting
  for (const col of ["amount_doc", "amount_company", "amount_inr"]) {
    const c = sheet.getColumn(col);
    if (c) c.numFmt = "#,##0.00";
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  const safeFrom = String(meta.fromYmd || "").replace(/[^0-9-]/g, "");
  const safeTo = String(meta.toYmd || "").replace(/[^0-9-]/g, "");

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="odoo-rows-${safeFrom}-to-${safeTo}.xlsx"`
  );

  await wb.xlsx.write(res);
  res.end();
}

// ------------------------ Core builder ------------------------
function parseFyLabels(raw) {
  const cleaned = String(raw || "FY24,FY25,FY26")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return cleaned.filter((x) => /^FY\d{2}$/.test(x));
}

function parseEntryTypes(raw) {
  const cleaned = String(raw || "Sale")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return new Set(cleaned);
}

async function buildFyTable({
  serviceName,
  fyLabels,
  includeEntryTypes,
  excludeIntercompany,
  customerContains,
  descriptionContains,
  categoryContains,

  // ✅ ADD THESE
  masterCategoryContains,
  subCategoryContains,
  categoryFilterContains,

  includeOdoo,
  source,
}) {
  const accessToken = await getAccessToken({
    tenantId,
    clientId,
    clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });

  const bcCompanyNames = await fetchBcCompanyNames(accessToken);

  // Always infer keys from the first company that returns a sample row
  let sample = null;
  let inferredCompanyRoot = null;

  for (const nm of bcCompanyNames) {
    const root = makeOdataCompanyRoot(nm);
    const s = await fetchSampleRow(root, serviceName, accessToken);
    if (s) {
      sample = s;
      inferredCompanyRoot = root;
      break;
    }
  }

  if (!sample) {
    // If user asked Odoo-only, we can still proceed (keys will be inferred from a dummy-ish object later),
    // but normally BC should exist.
    return {
      meta: {
        company: companyName,
        environment: environmentName,
        odataRoot: makeOdataCompanyRoot(companyName),
        fetchedAt: new Date().toISOString(),
        serviceName,
        bcCompanyCount: bcCompanyNames.length,
        bcCompanies: bcCompanyNames,
        source: source || "all",
      },
      table: {
        columns: fyLabels,
        rows: [],
        totals: Object.fromEntries(fyLabels.map((fy) => [fy, 0])),
        debug: { rowCount: 0, usedRowCount: 0 },
      },
    };
  }

  const keys = inferSalesDashboardKeys(sample);

  if (!keys.postingDateKey)
    throw new Error("SalesDashboard: could not infer Posting_Date column.");
  if (!keys.salesAmountActualKey)
    throw new Error(
      "SalesDashboard: could not infer Sales_Amount_Actual column."
    );
  if (!keys.entryNoKey)
    throw new Error(
      "SalesDashboard: could not infer Entry_No column (required to page all rows)."
    );

  const ranges = fyLabels.map(fyToRange).filter(Boolean);
  const merged = mergeRanges(ranges);

  const src = String(source || "all").toLowerCase();
  const wantBc = src !== "odoo";
  const wantOdoo = src !== "bc" && !!includeOdoo;

  let allRows = [];

  // ✅ BC: pull SalesDashboard from ALL companies
  if (wantBc) {
    for (const nm of bcCompanyNames) {
      const odataCompanyRoot = makeOdataCompanyRoot(nm);

      const bcRows = await fetchAllSalesDashboard({
        odataCompanyRoot,
        serviceName,
        accessToken,
        keys,
        fromDateYmd: merged ? merged.from : null,
        toDateYmd: merged ? merged.to : null,
        includeEntryTypes,
        batchSize: 10000,
      });

      // annotate
      for (const r of bcRows) {
        r.__source = "bc";
        r.__company = nm;
      }

      allRows.push(...bcRows);
    }
  }

  // ------------------------ OPTIONAL: Merge Odoo foreign sales ------------------------
  let odooMeta = { enabled: !!wantOdoo, ok: true, rowCount: 0 };
  if (wantOdoo && merged?.from && merged?.to) {
    try {
      const odooLines = await fetchOdooSalesInvoices({
        fromYmd: merged.from,
        toYmd: merged.to,
      });

      const mapped = odooLines.map((x) => {
        const row = {};
        if (keys.entryTypeKey) row[keys.entryTypeKey] = "SALE";
        if (keys.postingDateKey) row[keys.postingDateKey] = x.invoice_date;
        if (keys.salesAmountActualKey) {
          // Prefer INR if present, else company currency, else document currency
          let amt = 0;

          const inr = Number(x.amount_inr);
          const comp = Number(x.amount_company);
          const doc = Number(x.amount_doc);

          // ✅ Use INR whenever it's a valid number (even if 0)
          if (Number.isFinite(inr)) amt = inr;
          else if (Number.isFinite(comp)) amt = comp;
          else if (Number.isFinite(doc)) amt = doc;

          row[keys.salesAmountActualKey] = amt;
        }

        if (keys.customerNameKey)
          row[keys.customerNameKey] = x.partner || "UNKNOWN";
        if (keys.customerPostingGroupKey)
          row[keys.customerPostingGroupKey] = "";
        if (keys.descriptionKey)
          row[keys.descriptionKey] =
            x.line_name || x.invoice_name || "ODOO LINE";
        if (keys.itemNoKey) row[keys.itemNoKey] = x.sku || "";

        row.__source = "odoo";
        row.__company = x.company || "ODOO";

        return row;
      });

      allRows.push(...mapped);
      odooMeta.rowCount = mapped.length;
    } catch (e) {
      odooMeta.ok = false;
      odooMeta.error = String(e?.message || e || "Odoo fetch failed");
      console.error("[sd.cjs] Odoo merge failed:", odooMeta.error);
    }
  }

  const table = buildFyTableFromRows(allRows, {
    fyLabels,
    keys,
    includeEntryTypes,
    excludeIntercompany,
    customerContains,
    descriptionContains,
    categoryContains,

    masterCategoryContains,
    categoryFilterContains, // ✅ add
    subCategoryContains,
  });

  return {
    meta: {
      company: companyName,
      environment: environmentName,
      odataRoot: odataBaseRoot,

      fetchedAt: new Date().toISOString(),
      serviceName,
      fyLabels,
      includeEntryTypes: Array.from(includeEntryTypes || []),
      excludeIntercompany,
      intercompanyGroupCompanyCount: GROUP_COMPANIES.length,
      intercompanyGroupCompanies: GROUP_COMPANIES,
      appliedFilters: {
        customerContains: String(customerContains || ""),
        descriptionContains: String(descriptionContains || ""),
        categoryContains: String(categoryContains || ""),
      },
      odoo: odooMeta,
      bcCompanyCount: bcCompanyNames.length,
      bcCompanies: bcCompanyNames,

      source: String(source || "all"),
    },
    table,
  };
}

// ------------------------ Router (export) ------------------------
const router = express.Router();

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/fy-table", async (req, res) => {
  try {
    const serviceName = String(req.query.service || "SalesDashboard").trim();
    const fyLabels = parseFyLabels(req.query.fy);
    const includeEntryTypes = parseEntryTypes(req.query.includeEntryTypes);
    const excludeIntercompany =
      String(req.query.excludeIntercompany || "true").toLowerCase() === "true";
    const includeOdoo =
      String(req.query.includeOdoo || "false").toLowerCase() === "true";
    const source = String(req.query.source || "all").trim(); // all | odoo | bc

    const customerContains = String(req.query.customer || "").trim();
    const descriptionContains = String(req.query.description || "").trim();
    const categoryContains = String(req.query.category || "").trim();
    const masterCategoryContains = String(
      req.query.masterCategory || ""
    ).trim();
    const categoryFilterContains = String(
      req.query.categoryFilter || ""
    ).trim();
    const subCategoryContains = String(req.query.subCategory || "").trim();

    const payload = await buildFyTable({
      serviceName,
      fyLabels,
      includeEntryTypes,
      excludeIntercompany,
      customerContains,
      descriptionContains,
      categoryContains,

      masterCategoryContains,
      categoryFilterContains,
      subCategoryContains,

      includeOdoo, // ✅ IMPORTANT
      source,
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error: "Failed to build FY table",
      details: String(err && err.message ? err.message : err),
    });
  }
});

router.get("/fy-table.xlsx", async (req, res) => {
  try {
    const serviceName = String(req.query.service || "SalesDashboard").trim();
    const fyLabels = parseFyLabels(req.query.fy);
    const includeEntryTypes = parseEntryTypes(req.query.includeEntryTypes);
    const excludeIntercompany =
      String(req.query.excludeIntercompany || "true").toLowerCase() === "true";
    const includeOdoo =
      String(req.query.includeOdoo || "false").toLowerCase() === "true";
    const source = String(req.query.source || "all").trim(); // all | odoo | bc

    const customerContains = String(req.query.customer || "").trim();
    const descriptionContains = String(req.query.description || "").trim();
    const categoryContains = String(req.query.category || "").trim();

    const payload = await buildFyTable({
      serviceName,
      fyLabels,
      includeEntryTypes,
      excludeIntercompany,
      customerContains,
      descriptionContains,
      categoryContains,
      includeOdoo,
      source,
    });

    await writeFyTableXlsx(res, payload);
  } catch (err) {
    res.status(500).json({
      error: "Failed to export FY table XLSX",
      details: String(err && err.message ? err.message : err),
    });
  }
});
router.get("/odoo-rows.xlsx", async (req, res) => {
  try {
    const { fromYmd, toYmd } = resolveFromToYmdFromQuery(req);

    // Pull ALL flattened Odoo rows for the range
    const rows = await fetchOdooSalesInvoices({ fromYmd, toYmd });

    const meta = {
      fromYmd,
      toYmd,
      odooBase: getOdooXmlRpcBase(),
      odooDb: ODOO_DB,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      generatedAt: new Date().toISOString(),
    };

    await writeOdooRowsXlsx(res, { meta, rows });
  } catch (err) {
    res.status(500).json({
      error: "Failed to export Odoo rows XLSX",
      details: String(err && err.message ? err.message : err),
    });
  }
});
// ------------------------ Sales Analytics (time-series) ------------------------
function ymd(s) {
  const x = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "";
}

function monthKeyUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function yearKeyUTC(dt) {
  return String(dt.getUTCFullYear());
}

function quarterKeyUTC(dt) {
  const y = dt.getUTCFullYear();
  const q = Math.floor(dt.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function buildTimeSeries(rows, { keys, granularity, excludeIntercompany }) {
  const buckets = new Map(); // period -> amount
  let used = 0,
    skippedBadDate = 0,
    skippedIntercompany = 0;

  for (const r of rows) {
    const dt = keys.postingDateKey ? parseYmd(r[keys.postingDateKey]) : null;
    if (!dt) {
      skippedBadDate++;
      continue;
    }

    // Intercompany filter (BC only, same behavior as FY table)
    if (excludeIntercompany && String(r.__source || "bc") !== "odoo") {
      const custName = keys.customerNameKey
        ? String(r[keys.customerNameKey] || "")
        : "";
      const pg = keys.customerPostingGroupKey
        ? String(r[keys.customerPostingGroupKey] || "")
        : "";

      const isGroupByName = GROUP_COMPANY_SET.has(normName(custName));
      const isGroupByPg = looksIntercompanyPostingGroup(pg);

      if (isGroupByName || isGroupByPg) {
        skippedIntercompany++;
        continue;
      }
    }

    const amt = keys.salesAmountActualKey
      ? money(r[keys.salesAmountActualKey])
      : 0;

    let period = "";
    const g = String(granularity || "month").toLowerCase();
    if (g === "year") period = yearKeyUTC(dt);
    else if (g === "quarter") period = quarterKeyUTC(dt);
    else period = monthKeyUTC(dt); // default month

    buckets.set(period, (buckets.get(period) || 0) + amt);
    used++;
  }

  // Sort periods naturally
  const points = Array.from(buckets.entries())
    .map(([period, amount]) => ({ period, amount }))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));

  return {
    points,
    debug: { rowCount: rows.length, usedRowCount: used, skippedBadDate, skippedIntercompany },
  };
}

router.get("/sales-analytics", async (req, res) => {
  try {
    const serviceName = String(req.query.service || "SalesDashboard").trim();

    const fromYmd = ymd(req.query.from) || "2000-01-01";
    const toYmd = ymd(req.query.to) || "2100-12-31";

    const granularity = String(req.query.granularity || "month").trim(); // month|quarter|year

    const excludeIntercompany =
      String(req.query.excludeIntercompany ?? "true").toLowerCase() === "true";

    const includeOdoo =
      String(req.query.includeOdoo || "false").toLowerCase() === "true";

    const source = String(req.query.source || "all").trim(); // all | odoo | bc

    // Reuse key inference logic (same as FY table)
    const accessToken = await getAccessToken({
      tenantId,
      clientId,
      clientSecret,
      scope: "https://api.businesscentral.dynamics.com/.default",
    });

    const bcCompanyNames = await fetchBcCompanyNames(accessToken);

    let sample = null;
    for (const nm of bcCompanyNames) {
      const root = makeOdataCompanyRoot(nm);
      const s = await fetchSampleRow(root, serviceName, accessToken);
      if (s) {
        sample = s;
        break;
      }
    }

    if (!sample) {
      return res.json({
        meta: {
          serviceName,
          from: fromYmd,
          to: toYmd,
          granularity,
          source,
          excludeIntercompany,
          bcCompanyCount: bcCompanyNames.length,
          bcCompanies: bcCompanyNames,
        },
        points: [],
        debug: { rowCount: 0, usedRowCount: 0 },
      });
    }

    const keys = inferSalesDashboardKeys(sample);

    if (!keys.postingDateKey)
      throw new Error("SalesDashboard: could not infer Posting_Date column.");
    if (!keys.salesAmountActualKey)
      throw new Error("SalesDashboard: could not infer Sales_Amount_Actual column.");
    if (!keys.entryNoKey)
      throw new Error("SalesDashboard: could not infer Entry_No column.");

    const src = String(source || "all").toLowerCase();
    const wantBc = src !== "odoo";
    const wantOdoo = src !== "bc" && !!includeOdoo;

    let allRows = [];

    // BC (all companies)
    if (wantBc) {
      for (const nm of bcCompanyNames) {
        const odataCompanyRoot = makeOdataCompanyRoot(nm);

        const bcRows = await fetchAllSalesDashboard({
          odataCompanyRoot,
          serviceName,
          accessToken,
          keys,
          fromDateYmd: fromYmd,
          toDateYmd: toYmd,
          includeEntryTypes: null, // keep all; filter later if you want
          batchSize: 10000,
        });

        for (const r of bcRows) {
          r.__source = "bc";
          r.__company = nm;
        }
        allRows.push(...bcRows);
      }
    }

    // Odoo (optional)
    let odooMeta = { enabled: !!wantOdoo, ok: true, rowCount: 0 };
    if (wantOdoo) {
      try {
        const odooLines = await fetchOdooSalesInvoices({ fromYmd, toYmd });

        const mapped = odooLines.map((x) => {
          const row = {};
          if (keys.postingDateKey) row[keys.postingDateKey] = x.invoice_date;

          if (keys.salesAmountActualKey) {
            const inr = Number(x.amount_inr);
            const comp = Number(x.amount_company);
            const doc = Number(x.amount_doc);
            let amt = 0;
            if (Number.isFinite(inr)) amt = inr;
            else if (Number.isFinite(comp)) amt = comp;
            else if (Number.isFinite(doc)) amt = doc;
            row[keys.salesAmountActualKey] = amt;
          }

          if (keys.customerNameKey) row[keys.customerNameKey] = x.partner || "UNKNOWN";
          if (keys.customerPostingGroupKey) row[keys.customerPostingGroupKey] = "";
          if (keys.descriptionKey) row[keys.descriptionKey] = x.line_name || x.invoice_name || "ODOO LINE";
          if (keys.itemNoKey) row[keys.itemNoKey] = x.sku || "";

          row.__source = "odoo";
          row.__company = x.company || "ODOO";
          return row;
        });

        allRows.push(...mapped);
        odooMeta.rowCount = mapped.length;
      } catch (e) {
        odooMeta.ok = false;
        odooMeta.error = String(e?.message || e || "Odoo fetch failed");
        console.error("[sd.cjs] Odoo merge failed:", odooMeta.error);
      }
    }

    const series = buildTimeSeries(allRows, {
      keys,
      granularity,
      excludeIntercompany,
    });

    res.json({
      meta: {
        serviceName,
        from: fromYmd,
        to: toYmd,
        granularity,
        source,
        excludeIntercompany,
        bcCompanyCount: bcCompanyNames.length,
        bcCompanies: bcCompanyNames,
        odoo: odooMeta,
      },
      points: series.points,
      debug: { ...series.debug, detectedKeys: keys },
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to build sales analytics",
      details: String(err && err.message ? err.message : err),
    });
  }
});

module.exports = router;

// ------------------------ Standalone mode (optional) ------------------------
if (require.main === module) {
  const app = express();
  app.use(cors());
  app.use(helmet());
  app.use(compression());
  app.use(morgan("combined"));

  app.use("/api/sd", router);

  app.listen(PORT, HOST, () => {
    console.log(`[sd.cjs] Listening on http://${HOST}:${PORT}`);
    console.log(`[sd.cjs] OData base root: ${odataBaseRoot}`);
    console.log(
      `[sd.cjs] Try: http://localhost:${PORT}/api/sd/fy-table?service=SalesDashboard`
    );
  });
}
