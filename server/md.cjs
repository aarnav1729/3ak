"use strict";

const { Parser } = require("xml2js");
const fs = require("fs");
const path = require("path");
const express = require("express");
const ExcelJS = require("exceljs");
// === Customer classification mapping (from Customers (17).xlsx) ============

const CUSTOMER_MAPPING_PATH =
  process.env.CUSTOMER_MAPPING_PATH ||
  path.join(__dirname, "Customers (17).xlsx");

// JSON snapshot of the above, checked in / reused
const CUSTOMER_JSON_PATH =
  process.env.CUSTOMER_JSON_PATH ||
  path.join(__dirname, "customer-classification.json");

// Map: customerNumber -> {
//  customerNumber,
//  customerName,
//  postingGroup,
//  genBusPostingGroup,
//  customerType
//}
let customerClassificationMap = new Map();
let customerMapLoadAttempted = false;

/**
 * Load "Customers (17).xlsx" using ExcelJS into memory.
 * Safe to call multiple times (only first call actually loads).
 */
/**
 * Load customer classification into memory.
 *
 * Priority:
 *  1) If JSON snapshot exists, load from JSON.
 *  2) Else, read "Customers (17).xlsx", build map, and write JSON snapshot.
 *
 * Safe to call multiple times (only first call actually loads).
 */
async function ensureCustomerClassificationLoaded() {
  if (customerMapLoadAttempted) return;
  customerMapLoadAttempted = true;

  // 1) Try JSON snapshot first
  try {
    if (fs.existsSync(CUSTOMER_JSON_PATH)) {
      console.log(
        "[MD] Loading customer classification JSON from",
        CUSTOMER_JSON_PATH
      );

      const raw = fs.readFileSync(CUSTOMER_JSON_PATH, "utf8");
      const arr = JSON.parse(raw);

      if (Array.isArray(arr)) {
        const map = new Map();

        for (const row of arr) {
          if (!row) continue;
          const customerNumber = String(row.customerNumber || "").trim();
          if (!customerNumber) continue;

          map.set(customerNumber, {
            customerNumber,
            customerName: String(row.customerName || "").trim(),
            postingGroup: String(row.postingGroup || "").trim(),
            genBusPostingGroup: String(row.genBusPostingGroup || "").trim(),
            customerType: String(row.customerType || "").trim(),
          });
        }

        customerClassificationMap = map;
        console.log(
          `[MD] Loaded ${customerClassificationMap.size} customer classification rows from JSON`
        );
        return; // ✅ Done – no need to touch Excel
      }

      console.warn(
        "[MD] Customer classification JSON did not contain an array; falling back to XLSX"
      );
    }
  } catch (err) {
    console.warn(
      "[MD] Failed to load customer classification JSON, falling back to XLSX:",
      err.message || err
    );
  }

  // 2) Fallback: read from XLSX and also write JSON snapshot
  try {
    if (!fs.existsSync(CUSTOMER_MAPPING_PATH)) {
      console.warn(
        "[MD] Customer mapping XLSX not found at",
        CUSTOMER_MAPPING_PATH,
        "- sales classification will fall back to BC fields only."
      );
      customerClassificationMap = new Map();
      return;
    }

    console.log(
      "[MD] Loading customer classification from XLSX",
      CUSTOMER_MAPPING_PATH
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CUSTOMER_MAPPING_PATH);
    const sheet = wb.worksheets[0];
    if (!sheet) {
      console.warn("[MD] Customer mapping workbook has no sheets");
      customerClassificationMap = new Map();
      return;
    }

    // Build header index map
    const headerRow = sheet.getRow(1);
    const colIndexByName = {};
    headerRow.eachCell((cell, colNumber) => {
      const name = String(cell.value || "").trim();
      if (!name) return;
      colIndexByName[name.toLowerCase()] = colNumber;
    });

    function colIdx(labelVariants) {
      for (const lv of labelVariants) {
        const idx = colIndexByName[lv.toLowerCase()];
        if (idx) return idx;
      }
      return null;
    }

    const noCol = colIdx(["No.", "Customer No.", "No"]);
    const nameCol = colIdx(["Name", "Customer Name"]);
    const postingGroupCol = colIdx(["Customer Posting Group"]);
    const genBusGroupCol = colIdx(["Gen. Bus. Posting Group"]);
    const customerTypeCol = colIdx(["Column1", "Customer Type"]);

    if (!noCol) {
      console.warn(
        "[MD] Could not find 'No.' column in customer mapping; map will be empty."
      );
      customerClassificationMap = new Map();
      return;
    }

    const map = new Map();
    const jsonArray = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const numRaw = row.getCell(noCol).value;
      if (!numRaw) return;

      const customerNumber = String(numRaw).trim();
      if (!customerNumber) return;

      const customerName = nameCol
        ? String(row.getCell(nameCol).value || "").trim()
        : "";
      const postingGroup = postingGroupCol
        ? String(row.getCell(postingGroupCol).value || "").trim()
        : "";
      const genBusPostingGroup = genBusGroupCol
        ? String(row.getCell(genBusGroupCol).value || "").trim()
        : "";
      const customerType = customerTypeCol
        ? String(row.getCell(customerTypeCol).value || "").trim()
        : "";

      const obj = {
        customerNumber,
        customerName,
        postingGroup,
        genBusPostingGroup,
        customerType,
      };

      map.set(customerNumber, obj);
      jsonArray.push(obj);
    });

    customerClassificationMap = map;
    console.log(
      `[MD] Loaded ${customerClassificationMap.size} customer classification rows from XLSX`
    );

    // Write JSON snapshot so next run can skip XLSX completely
    try {
      fs.writeFileSync(
        CUSTOMER_JSON_PATH,
        JSON.stringify(jsonArray, null, 2),
        "utf8"
      );
      console.log(
        `[MD] Wrote customer classification JSON snapshot to ${CUSTOMER_JSON_PATH} (${jsonArray.length} rows)`
      );
    } catch (err) {
      console.warn(
        "[MD] Failed to write customer classification JSON snapshot:",
        err.message || err
      );
    }
  } catch (err) {
    console.error(
      "[MD] Failed to load customer classification mapping:",
      err.message || err
    );
    customerClassificationMap = new Map();
  }
}

/**
 * Compute invoice amounts excl / incl tax.
 */
function getInvoiceAmounts(inv) {
  const amountExcl = Number(inv.totalAmountExcludingTax ?? 0) || 0;
  const amountIncl =
    Number(inv.totalAmountIncludingTax ?? inv.totalAmountExcludingTax ?? 0) ||
    0;
  return { amountExcl, amountIncl };
}

// Try to robustly extract "Package Type" from a salesInvoiceLines row
function extractPackageTypeFromLine(line) {
  if (!line || typeof line !== "object") return "";

  // 1. Common camelCase / PascalCase variants
  const direct =
    line.packageType ||
    line.PackageType ||
    line.package_type ||
    line.Package_Type;
  if (direct) return String(direct).trim();

  // 2. OData-style / weird keys (spaces, x0020, etc.)
  for (const key of Object.keys(line)) {
    const lower = key.toLowerCase();

    if (
      lower === "package type" ||
      lower === "package_type" ||
      lower === "packagetype" ||
      lower === "package x0020 type" ||
      lower === "package_x0020_type"
    ) {
      const val = line[key];
      if (val != null && val !== "") {
        return String(val).trim();
      }
    }
  }

  return "";
}

/**
 * Classify a customer as Domestic/Export + Direct/Distributor/GroupCompany.
 * Uses mapping from Excel when available, otherwise falls back to BC fields.
 */
function classifyCustomerForSales(invoice) {
  const custNo = String(invoice.customerNumber || "").trim();
  const fallbackName = invoice.customerName || "Unknown Customer";

  const mapped = custNo ? customerClassificationMap.get(custNo) || null : null;

  const postingGroupRaw =
    mapped?.postingGroup || invoice.customerPostingGroup || "";
  const genBusRaw =
    mapped?.genBusPostingGroup || invoice.genBusPostingGroup || "";
  const customerTypeRaw = mapped?.customerType || "";

  const postingGroup = String(postingGroupRaw).toUpperCase().trim();
  const genBus = String(genBusRaw).toUpperCase().trim();
  const customerType = String(customerTypeRaw).toUpperCase().trim();

  // Geo / segment
  let geo = "OTHER";
  if (genBus === "DOMESTIC") geo = "DOMESTIC";
  else if (genBus === "EXPORT") geo = "EXPORT";

  // Role
  let role = "UNKNOWN";
  if (customerType.includes("DIRECT")) {
    role = "DIRECT_CLIENT";
  } else if (customerType.includes("DISTRIBUTOR")) {
    role = "DISTRIBUTOR";
  } else if (customerType.includes("GROUP")) {
    role = "GROUP_COMPANY";
  } else if (postingGroup.includes("DISTRIBUTOR")) {
    role = "DISTRIBUTOR";
  } else if (postingGroup.includes("CMP OW") || postingGroup.includes("CMP")) {
    role = "GROUP_COMPANY";
  } else if (
    postingGroup.includes("OEM") ||
    postingGroup.includes("OTHERS") ||
    postingGroup.includes("INSTUTN")
  ) {
    role = "DIRECT_CLIENT";
  }

  // Intercompany: treat group companies and *CMP* posting group as intercompany
  let isIntercompany = false;
  if (role === "GROUP_COMPANY") isIntercompany = true;
  if (postingGroup.includes("CMP OW") || postingGroup.includes("CMP")) {
    isIntercompany = true;
  }

  // Final sales category key/label
  let categoryKey = "UNCLASSIFIED";
  let categoryLabel = "Unclassified";

  if (geo === "DOMESTIC" && role === "DIRECT_CLIENT") {
    categoryKey = "DOMESTIC_DIRECT_CLIENT";
    categoryLabel = "Domestic- Direct Client";
  } else if (geo === "DOMESTIC" && role === "DISTRIBUTOR") {
    categoryKey = "DOMESTIC_DISTRIBUTOR";
    categoryLabel = "Domestic- Distributor";
  } else if (geo === "DOMESTIC" && role === "GROUP_COMPANY") {
    categoryKey = "DOMESTIC_GROUP_COMPANY";
    categoryLabel = "Domestic- Group Company";
  } else if (geo === "EXPORT" && role === "DIRECT_CLIENT") {
    categoryKey = "EXPORT_CLIENT";
    categoryLabel = "Export- Client";
  } else if (geo === "EXPORT" && role === "DISTRIBUTOR") {
    categoryKey = "EXPORT_DISTRIBUTOR";
    categoryLabel = "Export- Distributor";
  } else if (geo === "EXPORT" && role === "GROUP_COMPANY") {
    categoryKey = "EXPORT_INTERCOMPANY";
    categoryLabel = "Export- Intercompany";
  }

  return {
    customerNumber: custNo,
    customerName: mapped?.customerName || fallbackName,
    geo,
    role,
    isIntercompany,
    salesCategoryKey: categoryKey,
    salesCategoryLabel: categoryLabel,
  };
}

/**
 * Returns true if an invoice meta passes salesCategory + excludeIntercompany filters.
 */
function invoicePassesCategoryFilters(meta, filters) {
  const { allowedCategories, excludeIntercompany } = filters;

  if (excludeIntercompany && meta.isIntercompany) return false;

  if (allowedCategories && allowedCategories.size > 0) {
    if (!allowedCategories.has(meta.salesCategoryKey)) return false;
  }

  return true;
}

// === BC config ==============================================================

const tenantId = "985f0700-1d9d-4e2a-9267-27736d2c7ab5";
const clientId = "091bce49-dd2f-4707-9cb1-9df616bb36c3";
const clientSecret = "HHZ8Q~brWPmnqf1Cz~eJMKfSPpvsiyZ1gRleDa6w";
const bcEnvironment = "Production";
const companyName = "3AK Chemie Pvt. Ltd.";

const bcBaseUrl = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${bcEnvironment}/api/v2.0`;

// If Node < 18, uncomment and install node-fetch:
// const fetch = require("node-fetch");

// === Date helpers ===========================================================

function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfDay(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function startOfMonth(d) {
  const dt = new Date(d);
  dt.setDate(1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfMonth(d) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + 1, 0); // last day of month
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function startOfYear(d) {
  const dt = new Date(d);
  dt.setMonth(0, 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfFiscalYearIndia(d) {
  const dt = new Date(d);
  const month = dt.getMonth(); // 0 = Jan, 1 = Feb, 2 = Mar, 3 = Apr...
  const fyYear = month < 3 ? dt.getFullYear() - 1 : dt.getFullYear();
  const fyStart = new Date(fyYear, 3, 1); // April 1
  fyStart.setHours(0, 0, 0, 0);
  return fyStart;
}

function parseBcDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateYmd(dateStr) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function daysAgo(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - n);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// Fiscal quarters (India, FY = Apr–Mar)
function getFiscalQuarterStart(date) {
  const d = new Date(date);
  const month = d.getMonth(); // 0 Jan ... 11 Dec
  let fyYear = month < 3 ? d.getFullYear() - 1 : d.getFullYear();

  // Fiscal Q:
  // Q1: Apr–Jun (3–5)
  // Q2: Jul–Sep (6–8)
  // Q3: Oct–Dec (9–11)
  // Q4: Jan–Mar (0–2) of NEXT calendar year but same fiscal year label
  let quarterStartMonth;
  if (month >= 3 && month <= 5) {
    quarterStartMonth = 3; // Apr
  } else if (month >= 6 && month <= 8) {
    quarterStartMonth = 6; // Jul
  } else if (month >= 9 && month <= 11) {
    quarterStartMonth = 9; // Oct
  } else {
    // Jan/Feb/Mar => Q4 of previous fiscal year; Jan=0
    fyYear = d.getFullYear() - 1;
    quarterStartMonth = 0; // Jan of current calendar year
  }

  const start = new Date(fyYear, quarterStartMonth, 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getFiscalQuarterRangeContaining(date) {
  const start = getFiscalQuarterStart(date);
  const end = endOfDay(
    endOfMonth(new Date(start.getFullYear(), start.getMonth() + 2, 1))
  );
  return { start, end };
}

function getPreviousFiscalQuarterRange(date) {
  const currentStart = getFiscalQuarterStart(date);
  const prevQuarterEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
  return getFiscalQuarterRangeContaining(prevQuarterEnd);
}

// Time bucket helpers
function getMonthBucket(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const id = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = date.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
  return { id, label, year: y, month: m + 1 };
}

function getQuarterBucket(date) {
  const y = date.getFullYear();
  const month = date.getMonth();
  const q = Math.floor(month / 3) + 1;
  const id = `${y}-Q${q}`;
  const label = `Q${q} ${y}`;
  return { id, label, year: y, quarter: q };
}

function getYearBucket(date) {
  const y = date.getFullYear();
  return { id: String(y), label: String(y), year: y };
}

// === 1. Get access token =====================================================

async function getAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to get token: ${res.status} ${text}`);
  }

  const data = JSON.parse(text);
  return data.access_token;
}

// === 2. Generic BC fetch with pagination ====================================

// pathWithQuery: e.g. "salesInvoices?company=XYZ&$top=1000"
async function bcFetchAll(pathWithQuery, accessToken) {
  let url = `${bcBaseUrl}/${pathWithQuery}`;
  let all = [];

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `BC fetch failed (${pathWithQuery}): ${res.status} ${text}`
      );
    }

    const json = JSON.parse(text);
    const batch = json.value || json;
    if (Array.isArray(batch)) {
      all = all.concat(batch);
    }

    const next = json["@odata.nextLink"];
    if (next) {
      url = next; // already full URL
    } else {
      url = null;
    }
  }

  return all;
}

// Convenience wrapper to attach & encode company=
function withCompany(basePath) {
  const companyParam = encodeURIComponent(companyName);
  return `${basePath}?company=${companyParam}`;
}

// Convenience wrapper to attach & encode company= AND an optional $filter
function withCompanyAndFilter(basePath, filterExpr, extraQuery) {
  const companyParam = encodeURIComponent(companyName);
  let query = `company=${companyParam}`;

  if (filterExpr) {
    // e.g. "postingDate ge 2000-01-01 and postingDate le 2100-12-31"
    query += `&$filter=${encodeURIComponent(filterExpr)}`;
  }

  if (extraQuery) {
    // extraQuery should NOT start with "?" but can contain multiple & parts
    if (extraQuery.startsWith("&")) {
      query += extraQuery;
    } else {
      query += `&${extraQuery}`;
    }
  }

  return `${basePath}?${query}`;
}

// === 3. Core metric builders used elsewhere (kept for compatibility) ========

async function buildSalesMetrics(token) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfFiscalYearIndia(now);
  const last30Start = daysAgo(now, 29);

  const invoices = await bcFetchAll(withCompany("salesInvoices"), token);

  let todaySales = 0;
  let mtdSales = 0;
  let ytdSales = 0;
  let last30DaysSales = 0;

  const byCustomer = {};

  for (const inv of invoices) {
    const postingDate = parseBcDate(inv.postingDate || inv.invoiceDate);
    if (!postingDate) continue;

    const amount = Number(
      inv.totalAmountIncludingTax ?? inv.totalAmountExcludingTax ?? 0
    );

    if (isSameDay(postingDate, todayStart)) {
      todaySales += amount;
    }
    if (postingDate >= monthStart && postingDate <= now) {
      mtdSales += amount;
    }
    if (postingDate >= yearStart && postingDate <= now) {
      ytdSales += amount;
    }
    if (postingDate >= last30Start && postingDate <= now) {
      last30DaysSales += amount;
    }

    const custNo = inv.customerNumber || "UNKNOWN";
    const custName = inv.customerName || "Unknown Customer";

    if (!byCustomer[custNo]) {
      byCustomer[custNo] = {
        customerNumber: custNo,
        customerName: custName,
        totalSales: 0,
      };
    }
    byCustomer[custNo].totalSales += amount;
  }

  const customersArr = Object.values(byCustomer);
  customersArr.sort((a, b) => b.totalSales - a.totalSales);
  const topCustomersBySales = customersArr.slice(0, 10);

  const quotes = await bcFetchAll(withCompany("salesQuotes"), token);
  const orders = await bcFetchAll(withCompany("salesOrders"), token);

  let openQuotesCount = 0;
  let openQuotesValue = 0;
  for (const q of quotes) {
    const status = q.status || "Open";
    const isOpen = !String(status).toLowerCase().includes("closed");
    if (isOpen) {
      openQuotesCount++;
      openQuotesValue += Number(
        q.totalAmountIncludingTax ?? q.totalAmountExcludingTax ?? 0
      );
    }
  }

  let openOrdersCount = 0;
  let openOrdersValue = 0;
  for (const o of orders) {
    const status = o.status || "Open";
    const isOpen = !String(status).toLowerCase().includes("closed");
    if (isOpen) {
      openOrdersCount++;
      openOrdersValue += Number(
        o.totalAmountIncludingTax ?? o.totalAmountExcludingTax ?? 0
      );
    }
  }

  return {
    todaySales,
    mtdSales,
    ytdSales,
    last30DaysSales,
    topCustomersBySales,
    openQuotesCount,
    openQuotesValue,
    openOrdersCount,
    openOrdersValue,
  };
}

async function buildReceivablesMetrics(token) {
  const rows = await bcFetchAll(withCompany("agedAccountsReceivables"), token);

  let totalAR = 0;
  let overdueAR = 0;
  const perCustomer = [];

  for (const r of rows) {
    const customerNumber = r.customerNumber || "";
    const name = String(r.name || "");
    const isTotalRow = !customerNumber || name.trim().toLowerCase() === "total";

    const balanceDue = Number(r.balanceDue ?? 0);
    const p1 = Number(r.period1Amount ?? 0);
    const p2 = Number(r.period2Amount ?? 0);
    const p3 = Number(r.period3Amount ?? 0);
    const overdue = p1 + p2 + p3;

    if (isTotalRow) {
      continue;
    }

    totalAR += balanceDue;
    overdueAR += overdue;

    perCustomer.push({
      customerNumber,
      customerName: name,
      balanceDue,
      overdue,
      currencyCode: r.currencyCode,
    });
  }

  perCustomer.sort((a, b) => b.overdue - a.overdue);
  const topOverdueCustomers = perCustomer.slice(0, 10);
  const overdueRatioPercent = totalAR > 0 ? (overdueAR / totalAR) * 100 : 0;

  return {
    totalAR,
    overdueAR,
    overdueRatioPercent,
    topOverdueCustomers,
  };
}

async function buildPurchasesAndApMetrics(token) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const yearStart = startOfFiscalYearIndia(now);
  const last30Start = daysAgo(now, 29);

  const pinv = await bcFetchAll(withCompany("purchaseInvoices"), token);

  let mtdPurchases = 0;
  let ytdPurchases = 0;
  let last30DaysPurchases = 0;

  const byVendor = {};

  for (const inv of pinv) {
    const postingDate = parseBcDate(inv.postingDate || inv.invoiceDate);
    if (!postingDate) continue;

    const amount = Number(
      inv.totalAmountIncludingTax ?? inv.totalAmountExcludingTax ?? 0
    );

    if (postingDate >= monthStart && postingDate <= now) {
      mtdPurchases += amount;
    }
    if (postingDate >= yearStart && postingDate <= now) {
      ytdPurchases += amount;
    }
    if (postingDate >= last30Start && postingDate <= now) {
      last30DaysPurchases += amount;
    }

    const vNo = inv.vendorNumber || "UNKNOWN";
    const vName = inv.vendorName || "Unknown Vendor";

    if (!byVendor[vNo]) {
      byVendor[vNo] = {
        vendorNumber: vNo,
        vendorName: vName,
        totalPurchases: 0,
      };
    }
    byVendor[vNo].totalPurchases += amount;
  }

  const vendorsArr = Object.values(byVendor);
  vendorsArr.sort((a, b) => b.totalPurchases - a.totalPurchases);
  const topVendorsBySpend = vendorsArr.slice(0, 10);

  const apRows = await bcFetchAll(withCompany("agedAccountsPayables"), token);

  let totalAP = 0;
  let overdueAP = 0;
  const perVendor = [];

  for (const r of apRows) {
    const vendorNumber = r.vendorNumber || "";
    const name = String(r.name || "");
    const isTotalRow = !vendorNumber || name.trim().toLowerCase() === "total";

    const balanceDue = Number(r.balanceDue ?? 0);
    const p1 = Number(r.period1Amount ?? 0);
    const p2 = Number(r.period2Amount ?? 0);
    const p3 = Number(r.period3Amount ?? 0);
    const overdue = p1 + p2 + p3;

    if (isTotalRow) continue;

    totalAP += balanceDue;
    overdueAP += overdue;

    perVendor.push({
      vendorNumber,
      vendorName: name,
      balanceDue,
      overdue,
      currencyCode: r.currencyCode,
    });
  }

  perVendor.sort((a, b) => b.overdue - a.overdue);
  const topOverdueVendors = perVendor.slice(0, 10);
  const overdueAPRatioPercent = totalAP > 0 ? (overdueAP / totalAP) * 100 : 0;

  return {
    purchases: {
      mtdPurchases,
      ytdPurchases,
      last30DaysPurchases,
      topVendorsBySpend,
    },
    payables: {
      totalAP,
      overdueAP,
      overdueAPRatioPercent,
      topOverdueVendors,
    },
  };
}

async function buildInventoryMetrics(token) {
  const items = await bcFetchAll(withCompany("items"), token);
  const entries = await bcFetchAll(withCompany("itemLedgerEntries"), token);

  const now = new Date();
  const last90Start = daysAgo(now, 89);

  const byItem = {};
  let totalSkus = items.length;
  let totalInventoryQty = 0;
  let estInventoryValue = 0;

  for (const it of items) {
    const number = it.number || "UNKNOWN";
    const name = it.displayName || it.displayName2 || "Unnamed Item";
    const inventoryQty = Number(it.inventory ?? 0);
    const unitCost = Number(it.unitCost ?? 0);
    const value = inventoryQty * unitCost;

    totalInventoryQty += inventoryQty;
    estInventoryValue += value;

    byItem[number] = {
      itemNumber: number,
      itemName: name,
      inventoryQty,
      unitCost,
      inventoryValue: value,
      soldQtyLast90: 0,
    };
  }

  for (const e of entries) {
    const postingDate = parseBcDate(e.postingDate);
    if (!postingDate || postingDate < last90Start) continue;
    const entryType = String(e.entryType || "").toLowerCase();
    if (!entryType.includes("sale")) continue;

    const itemNumber = e.itemNumber || "UNKNOWN";
    const qty = Number(e.quantity ?? 0);
    const sold = Math.abs(qty);

    if (!byItem[itemNumber]) {
      byItem[itemNumber] = {
        itemNumber,
        itemName: "Unknown (ledger only)",
        inventoryQty: 0,
        unitCost: 0,
        inventoryValue: 0,
        soldQtyLast90: 0,
      };
    }
    byItem[itemNumber].soldQtyLast90 += sold;
  }

  const itemsArr = Object.values(byItem);

  const topItemsByInventoryValue = [...itemsArr]
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
    .slice(0, 10);

  const slowMovers = itemsArr
    .filter((it) => it.inventoryQty > 0 && it.inventoryValue > 0)
    .sort((a, b) => {
      if (a.soldQtyLast90 === b.soldQtyLast90) {
        return b.inventoryValue - a.inventoryValue;
      }
      return a.soldQtyLast90 - b.soldQtyLast90;
    })
    .slice(0, 10);

  return {
    totalSkus,
    totalInventoryQty,
    estInventoryValue,
    topItemsByInventoryValue,
    slowMovers,
  };
}

async function buildFinanceMetrics(token) {
  const income = await bcFetchAll(withCompany("incomeStatements"), token);
  const balance = await bcFetchAll(withCompany("balanceSheets"), token);
  const cashflow = await bcFetchAll(withCompany("cashFlowStatements"), token);

  function summarizeStatement(rows, amountFieldName) {
    return rows
      .filter((r) => (r.indentation ?? 0) <= 1)
      .map((r) => ({
        lineNumber: r.lineNumber,
        label: r.display,
        amount: Number(r[amountFieldName] ?? 0),
        lineType: r.lineType,
        indentation: r.indentation,
      }));
  }

  const incomeStatementSummary = summarizeStatement(income, "netChange");
  const balanceSheetSummary = summarizeStatement(balance, "balance");
  const cashFlowSummary = summarizeStatement(cashflow, "netChange");

  return {
    incomeStatementSummary,
    balanceSheetSummary,
    cashFlowSummary,
  };
}

// === 4. MD snapshot (kept for compatibility / exports) ======================

async function buildMdSnapshot(token) {
  const [sales, receivables, purAp, inventory, finance] = await Promise.all([
    buildSalesMetrics(token),
    buildReceivablesMetrics(token),
    buildPurchasesAndApMetrics(token),
    buildInventoryMetrics(token),
    buildFinanceMetrics(token),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    company: { name: companyName },
    sales,
    receivables,
    purchases: purAp.purchases,
    payables: purAp.payables,
    inventory,
    finance,
  };
}

// === 5. New analytics helpers ===============================================

// Classify sales channel based on dimensions / your coding convention.
// Adjust mapping to match your BC setup.
function classifySalesChannel(invoice) {
  const dim1 = String(invoice.shortcutDimension1Code || "")
    .toUpperCase()
    .trim();
  if (dim1 === "D2C" || dim1 === "DIRECT") {
    return { key: "domestic_d2c", label: "Domestic – Direct to Consumer" };
  }
  if (dim1 === "DIST" || dim1 === "DISTRIB") {
    return { key: "domestic_distributor", label: "Domestic – Distributor" };
  }
  if (dim1 === "INTERCO" || dim1 === "IC") {
    return { key: "intercompany", label: "Intercompany" };
  }
  return { key: "unclassified", label: "Unclassified" };
}

function normalizeAmount(inv) {
  return Number(
    inv.totalAmountIncludingTax ?? inv.totalAmountExcludingTax ?? 0
  );
}

function ensureRangeFromQuery(query) {
  const now = new Date();
  const todayEnd = endOfDay(now);
  const defaultFrom = startOfFiscalYearIndia(now);

  let from = parseDateYmd(query.from);
  let to = parseDateYmd(query.to);
  const preset = String(query.rangePreset || "").toUpperCase();

  if (preset === "YTD") {
    from = startOfFiscalYearIndia(now);
    to = todayEnd;
  } else if (preset === "MTD") {
    from = startOfMonth(now);
    to = todayEnd;
  } else if (preset === "QTD") {
    const { start, end } = getFiscalQuarterRangeContaining(now);
    from = start;
    to = end;
  } else if (preset === "LAST_QUARTER") {
    const { start, end } = getPreviousFiscalQuarterRange(now);
    from = start;
    to = end;
  }

  if (!from) from = defaultFrom;
  if (!to) to = todayEnd;

  // Normalize times
  from = startOfDay(from);
  to = endOfDay(to);

  return { from, to };
}

// Classify item type for production/consumption
function classifyItemForProduction(item) {
  const num = String(item.number || "");
  const cat = String(item.itemCategoryCode || "")
    .toUpperCase()
    .trim();
  const invGroup = String(item.inventoryPostingGroup || "")
    .toUpperCase()
    .trim();
  const genProd = String(item.genProdPostingGroup || "")
    .toUpperCase()
    .trim();

  if (num.startsWith("2511")) {
    return "FG_2511";
  }

  // Raw materials
  if (
    cat === "RM" ||
    cat === "RAW" ||
    invGroup.includes("RAW") ||
    genProd.includes("RM")
  ) {
    return "RM";
  }

  // Packing material
  if (
    cat === "PM" ||
    cat === "PACK" ||
    invGroup.includes("PACK") ||
    genProd.includes("PM")
  ) {
    return "PM";
  }

  // Semi finished goods
  if (cat === "SFG" || genProd.includes("SFG")) {
    return "SFG";
  }

  return "OTHER";
}

// === 6. Express router and routes ===========================================

const router = express.Router();

// ---------------------------------------------------------------------------
// OLD-style routes (kept for compatibility; not used by new dashboard)
// ---------------------------------------------------------------------------

router.get("/sales", async (req, res) => {
  try {
    const token = await getAccessToken();
    const [metrics, invoices, orders, shipments] = await Promise.all([
      buildSalesMetrics(token),
      bcFetchAll(withCompany("salesInvoices"), token),
      bcFetchAll(withCompany("salesOrders"), token),
      bcFetchAll(withCompany("salesShipments"), token),
    ]);

    res.json({
      meta: { companyName },
      metrics,
      tables: {
        salesInvoices: invoices,
        salesOrders: orders,
        salesShipments: shipments,
      },
    });
  } catch (err) {
    console.error("GET /api/md/sales error:", err);
    res.status(500).json({ error: "Failed to load sales data" });
  }
});

router.get("/sales-export", async (req, res) => {
  try {
    const token = await getAccessToken();
    const invoices = await bcFetchAll(withCompany("salesInvoices"), token);

    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfFiscalYearIndia(now);
    const last30Start = daysAgo(now, 29);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SalesInvoices");

    if (!invoices || invoices.length === 0) {
      sheet.addRow(["No invoices returned from Business Central"]);
    } else {
      const allKeys = new Set();
      for (const inv of invoices) {
        Object.keys(inv).forEach((k) => allKeys.add(k));
      }

      const baseColumns = Array.from(allKeys);
      const extraColumns = [
        "_postingDateParsed",
        "IsToday",
        "InCurrentMonth",
        "InLast30Days",
        "InFiscalYearIndia",
        "AmountUsed",
      ];

      const columns = [...baseColumns, ...extraColumns];

      sheet.columns = columns.map((key) => ({
        header: key,
        key,
        width: 20,
      }));

      for (const inv of invoices) {
        const postingDateRaw = inv.postingDate || inv.invoiceDate || null;
        const postingDate = parseBcDate(postingDateRaw);

        let isToday = false;
        let inCurrentMonth = false;
        let inLast30Days = false;
        let inFiscalYear = false;

        if (postingDate) {
          const postingStartOfDay = startOfDay(postingDate);
          isToday = isSameDay(postingStartOfDay, todayStart);
          inCurrentMonth = postingDate >= monthStart && postingDate <= now;
          inLast30Days = postingDate >= last30Start && postingDate <= now;
          inFiscalYear = postingDate >= yearStart && postingDate <= now;
        }

        const amount =
          Number(
            inv.totalAmountIncludingTax ?? inv.totalAmountExcludingTax ?? 0
          ) || 0;

        const rowValues = {};
        for (const key of baseColumns) {
          rowValues[key] = inv[key];
        }

        rowValues["_postingDateParsed"] = postingDate
          ? postingDate.toISOString()
          : null;
        rowValues["IsToday"] = isToday ? 1 : 0;
        rowValues["InCurrentMonth"] = inCurrentMonth ? 1 : 0;
        rowValues["InLast30Days"] = inLast30Days ? 1 : 0;
        rowValues["InFiscalYearIndia"] = inFiscalYear ? 1 : 0;
        rowValues["AmountUsed"] = amount;

        sheet.addRow(rowValues);
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales-invoices-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("GET /api/md/sales-export error:", err);
    res.status(500).json({ error: "Failed to export sales invoices to XLSX" });
  }
});

router.get("/receivables-aging", async (req, res) => {
  try {
    const token = await getAccessToken();
    const [metrics, raw] = await Promise.all([
      buildReceivablesMetrics(token),
      bcFetchAll(withCompany("agedAccountsReceivables"), token),
    ]);

    res.json({
      meta: { companyName },
      metrics,
      rows: raw,
    });
  } catch (err) {
    console.error("GET /api/md/receivables-aging error:", err);
    res.status(500).json({ error: "Failed to load receivables ageing data" });
  }
});

router.get("/payables-aging", async (req, res) => {
  try {
    const token = await getAccessToken();
    const [purAp, raw] = await Promise.all([
      buildPurchasesAndApMetrics(token),
      bcFetchAll(withCompany("agedAccountsPayables"), token),
    ]);

    res.json({
      meta: { companyName },
      metrics: purAp.payables,
      purchasesMetrics: purAp.purchases,
      rows: raw,
    });
  } catch (err) {
    console.error("GET /api/md/payables-aging error:", err);
    res.status(500).json({ error: "Failed to load payables ageing data" });
  }
});

router.get("/cashflow", async (req, res) => {
  try {
    const token = await getAccessToken();
    const finance = await buildFinanceMetrics(token);
    const raw = await bcFetchAll(withCompany("cashFlowStatements"), token);

    res.json({
      meta: { companyName },
      summary: finance.cashFlowSummary,
      rows: raw,
    });
  } catch (err) {
    console.error("GET /api/md/cashflow error:", err);
    res.status(500).json({ error: "Failed to load cashflow data" });
  }
});

router.get("/customer-trends", async (req, res) => {
  try {
    const token = await getAccessToken();
    const rows = await bcFetchAll(withCompany("customerSales"), token);

    const sorted = [...rows].sort(
      (a, b) =>
        Number(b.totalSalesAmount ?? 0) - Number(a.totalSalesAmount ?? 0)
    );

    res.json({
      meta: { companyName },
      rows: sorted,
    });
  } catch (err) {
    console.error("GET /api/md/customer-trends error:", err);
    res.status(500).json({ error: "Failed to load customer trends" });
  }
});

router.get("/vendor-trends", async (req, res) => {
  try {
    const token = await getAccessToken();
    const rows = await bcFetchAll(withCompany("vendorPurchases"), token);

    const sorted = [...rows].sort(
      (a, b) =>
        Number(b.totalPurchaseAmount ?? 0) - Number(a.totalPurchaseAmount ?? 0)
    );

    res.json({
      meta: { companyName },
      rows: sorted,
    });
  } catch (err) {
    console.error("GET /api/md/vendor-trends error:", err);
    res.status(500).json({ error: "Failed to load vendor trends" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const token = await getAccessToken();
    const snapshot = await buildMdSnapshot(token);
    res.json(snapshot);
  } catch (err) {
    console.error("GET /api/md/summary error:", err);
    res.status(500).json({ error: "Failed to build MD summary" });
  }
});

// ---------------------------------------------------------------------------
// NEW: Sales analytics (all from salesInvoice; lines are optional)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// NEW: Sales analytics (all from salesInvoice; lines are optional)
// - Adds incl/excl tax KPIs
// - Uses Customers (17).xlsx for Domestic / Export & client type classification
// - Supports filters: salesCategories, excludeIntercompany
// ---------------------------------------------------------------------------

router.get("/sales-analytics", async (req, res) => {
  try {
    const now = new Date();
    const { from, to } = ensureRangeFromQuery(req.query);
    const granularity =
      String(req.query.granularity || "month").toLowerCase() || "month";

    // Optional filters
    const rawSalesCategories = String(req.query.salesCategories || "").trim();
    const excludeIntercompany =
      String(req.query.excludeIntercompany || "false").toLowerCase() === "true";

    const allowedCategories =
      rawSalesCategories.length > 0
        ? new Set(
            rawSalesCategories
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean)
          )
        : null;

    const filters = { allowedCategories, excludeIntercompany };

    const token = await getAccessToken();

    // Load customer classification (once, lazy)
    await ensureCustomerClassificationLoaded();

    // 1) Fetch invoices
    const invoices = await bcFetchAll(withCompany("salesInvoices"), token);

    // Build enriched invoice meta array (for all invoices)
    const invoicesMeta = [];
    for (const inv of invoices) {
      const postingDate = parseBcDate(inv.postingDate || inv.invoiceDate);
      if (!postingDate) continue;

      const { amountExcl, amountIncl } = getInvoiceAmounts(inv);
      const custClass = classifyCustomerForSales(inv);

      invoicesMeta.push({
        raw: inv,
        id:
          inv.id ||
          inv.systemId ||
          inv.no ||
          `${inv.number || ""}-${postingDate.toISOString()}`,
        postingDate,
        amountExcl,
        amountIncl,
        customerNumber: custClass.customerNumber,
        customerName: custClass.customerName,
        geo: custClass.geo,
        role: custClass.role,
        isIntercompany: custClass.isIntercompany,
        salesCategoryKey: custClass.salesCategoryKey,
        salesCategoryLabel: custClass.salesCategoryLabel,
      });
    }

    // 2) Range-limited invoice map (for tables/charts) with filters applied
    const invoiceMap = new Map();
    for (const meta of invoicesMeta) {
      if (meta.postingDate < from || meta.postingDate > to) continue;
      if (!invoicePassesCategoryFilters(meta, filters)) continue;

      invoiceMap.set(meta.id, meta);
    }

    // 3) KPI: totals across ALL invoices (respecting category filters)
    const fyStart = startOfFiscalYearIndia(now);
    const mStart = startOfMonth(now);
    const { start: qStart, end: qEnd } = getFiscalQuarterRangeContaining(now);
    const { start: lastQStart, end: lastQEnd } =
      getPreviousFiscalQuarterRange(now);

    let totalRangeSalesExcl = 0;
    let totalRangeSalesIncl = 0;
    let ytdSalesExcl = 0;
    let ytdSalesIncl = 0;
    let mtdSalesExcl = 0;
    let mtdSalesIncl = 0;
    let qtdSalesExcl = 0;
    let qtdSalesIncl = 0;
    let lastQuarterSalesExcl = 0;
    let lastQuarterSalesIncl = 0;

    const monthlySeriesAllYears = []; // raw per-invoice basis

    for (const meta of invoicesMeta) {
      const postingDate = meta.postingDate;
      if (!invoicePassesCategoryFilters(meta, filters)) continue;

      // Range KPI
      if (postingDate >= from && postingDate <= to) {
        totalRangeSalesExcl += meta.amountExcl;
        totalRangeSalesIncl += meta.amountIncl;
      }

      // Fiscal YTD
      if (postingDate >= fyStart && postingDate <= now) {
        ytdSalesExcl += meta.amountExcl;
        ytdSalesIncl += meta.amountIncl;
      }

      // MTD
      if (postingDate >= mStart && postingDate <= now) {
        mtdSalesExcl += meta.amountExcl;
        mtdSalesIncl += meta.amountIncl;
      }

      // Current fiscal quarter (QTD)
      if (postingDate >= qStart && postingDate <= qEnd) {
        qtdSalesExcl += meta.amountExcl;
        qtdSalesIncl += meta.amountIncl;
      }

      // Previous fiscal quarter
      if (postingDate >= lastQStart && postingDate <= lastQEnd) {
        lastQuarterSalesExcl += meta.amountExcl;
        lastQuarterSalesIncl += meta.amountIncl;
      }

      // For line chart "one line per year" (calendar months)
      const mb = getMonthBucket(postingDate);
      monthlySeriesAllYears.push({
        year: mb.year,
        month: mb.month,
        label: mb.label,
        amountExcl: meta.amountExcl,
        amountIncl: meta.amountIncl,
      });
    }

    // 4) Monthly histogram for selected range (incl & excl; totalSales = incl)
    const monthlyHistogramMap = new Map();
    for (const meta of invoiceMap.values()) {
      const mb = getMonthBucket(meta.postingDate);
      const key = mb.id;
      const prev = monthlyHistogramMap.get(key) || {
        year: mb.year,
        month: mb.month,
        label: mb.label,
        totalSalesExcl: 0,
        totalSalesIncl: 0,
      };
      prev.totalSalesExcl += meta.amountExcl;
      prev.totalSalesIncl += meta.amountIncl;
      monthlyHistogramMap.set(key, prev);
    }

    const monthlyHistogram = Array.from(monthlyHistogramMap.values())
      .map((row) => ({
        ...row,
        // For backward compatibility: charts in UI still read totalSales
        totalSales: row.totalSalesIncl,
      }))
      .sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month
      );

    // 5) Yearly line chart data — aggregated by (year, month) across all data
    const perYearMonth = {};
    for (const row of monthlySeriesAllYears) {
      const key = `${row.year}-${row.month}`;
      if (!perYearMonth[key]) {
        perYearMonth[key] = {
          year: row.year,
          month: row.month,
          amountExcl: 0,
          amountIncl: 0,
        };
      }
      perYearMonth[key].amountExcl += row.amountExcl;
      perYearMonth[key].amountIncl += row.amountIncl;
    }

    const yearMonthSeries = Object.values(perYearMonth).map((r) => {
      const d = new Date(r.year, r.month - 1, 1);
      const mb = getMonthBucket(d);
      return {
        year: r.year,
        month: r.month,
        label: mb.label,
        totalSalesExcl: r.amountExcl,
        totalSalesIncl: r.amountIncl,
        // Backward compat field used by current React line builder
        totalSales: r.amountIncl,
      };
    });

    // 6) Sales by customer (range)
    const customerAgg = new Map();
    for (const meta of invoiceMap.values()) {
      const key = meta.customerNumber || "UNKNOWN";
      const prev = customerAgg.get(key) || {
        customerNumber: meta.customerNumber || "UNKNOWN",
        customerName: meta.customerName,
        geo: meta.geo,
        role: meta.role,
        isIntercompany: meta.isIntercompany,
        totalSalesExcl: 0,
        totalSalesIncl: 0,
        invoiceCount: 0,
      };
      prev.totalSalesExcl += meta.amountExcl;
      prev.totalSalesIncl += meta.amountIncl;
      prev.invoiceCount += 1;
      customerAgg.set(key, prev);
    }

    const salesByCustomer = Array.from(customerAgg.values())
      .map((row) => ({
        ...row,
        // Backward compat field
        totalSales: row.totalSalesIncl,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // 7) Sales by SKU (range; only if we actually have lines)
    // Try to fetch lines; if BC complains (400) we just skip SKU analytics
    let lines = [];
    try {
      lines = await bcFetchAll(withCompany("salesInvoiceLines"), token);
    } catch (e) {
      console.warn(
        "Warning: salesInvoiceLines fetch failed, proceeding without SKU-level metrics:",
        e.message || e
      );
      lines = [];
    }

    const skuAgg = new Map();
    if (lines && lines.length > 0) {
      for (const line of lines) {
        const invId = line.documentId;
        const meta = invId ? invoiceMap.get(invId) : null;
        if (!meta) continue; // only consider invoices in selected range + filters

        const itemNumber = line.itemNumber || "UNKNOWN";
        const desc = line.description || "No description";
        const qty = Number(line.quantity ?? 0);
        const valueExcl = Number(line.lineAmount ?? 0) || 0;
        const valueIncl =
          Number(line.amountIncludingTax ?? line.lineAmount ?? 0) || 0;

        // 🔍 NEW: try to read "Package Type" from the raw line
        const pkgType = extractPackageTypeFromLine(line);

        const key = itemNumber;
        const prev = skuAgg.get(key) || {
          itemNumber,
          description: desc,
          totalSalesExcl: 0,
          totalSalesIncl: 0,
          totalQuantity: 0,
          lineCount: 0,
          packageType: "", // store one label per SKU
        };

        prev.totalSalesExcl += valueExcl;
        prev.totalSalesIncl += valueIncl;
        prev.totalQuantity += qty;
        prev.lineCount += 1;

        // If we find a package type:
        if (pkgType) {
          if (!prev.packageType) {
            // first non-empty value → use it
            prev.packageType = pkgType;
          } else if (prev.packageType !== pkgType) {
            // different value for same SKU → mark as mixed
            prev.packageType = "Mixed";
          }
        }

        skuAgg.set(key, prev);
      }
    }

    const salesBySku = Array.from(skuAgg.values())
      .map((row) => ({
        ...row,
        totalSales: row.totalSalesIncl, // compat
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // 8) Sales by channel / category (range)
    const channelAgg = new Map();
    for (const meta of invoiceMap.values()) {
      const key = meta.salesCategoryKey || "UNCLASSIFIED";
      const label = meta.salesCategoryLabel || "Unclassified";

      const prev = channelAgg.get(key) || {
        channelKey: key,
        channelLabel: label,
        totalSalesExcl: 0,
        totalSalesIncl: 0,
        invoiceCount: 0,
      };
      prev.totalSalesExcl += meta.amountExcl;
      prev.totalSalesIncl += meta.amountIncl;
      prev.invoiceCount += 1;
      channelAgg.set(key, prev);
    }

    const salesByChannel = Array.from(channelAgg.values())
      .map((row) => ({
        ...row,
        totalSales: row.totalSalesIncl, // compat
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // 9) Invoice-level breakdown per channel (for FE drilldown table)
    const salesByChannelInvoices = Array.from(invoiceMap.values()).map(
      (meta) => {
        const raw = meta.raw || {};
        const invoiceNumber =
          raw.no || raw.number || raw.externalDocumentNumber || meta.id;

        return {
          invoiceNumber,
          postingDate: meta.postingDate.toISOString(),
          customerNumber: meta.customerNumber,
          customerName: meta.customerName,
          channelKey: meta.salesCategoryKey,
          channelLabel: meta.salesCategoryLabel,
          amount: meta.amountIncl, // use incl. tax to match charts
        };
      }
    );

    res.json({
      meta: {
        companyName,
        generatedAt: new Date().toISOString(),
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        filters: {
          salesCategories:
            allowedCategories && allowedCategories.size > 0
              ? Array.from(allowedCategories)
              : null,
          excludeIntercompany,
        },
      },
      kpis: {
        totalSalesInRange: totalRangeSalesIncl,
        ytdSales: ytdSalesIncl,
        mtdSales: mtdSalesIncl,
        qtdSales: qtdSalesIncl,
        lastQuarterSales: lastQuarterSalesIncl,
      },
      kpisDetail: {
        totalSalesInRangeExcl: totalRangeSalesExcl,
        totalSalesInRangeIncl: totalRangeSalesIncl,
        ytdSalesExcl,
        ytdSalesIncl,
        mtdSalesExcl,
        mtdSalesIncl,
        qtdSalesExcl,
        qtdSalesIncl,
        lastQuarterSalesExcl,
        lastQuarterSalesIncl,
      },
      monthlyHistogram,
      yearMonthSeries,
      salesByCustomer,
      salesBySku,
      salesByChannel,
      salesByChannelInvoices,
      granularity,
    });
  } catch (err) {
    console.error("GET /api/md/sales-analytics error:", err);
    res.status(500).json({ error: "Failed to load sales analytics" });
  }
});

// ---------------------------------------------------------------------------
// NEW: Inventory aging, availability & production/consumption analytics
// ---------------------------------------------------------------------------

router.get("/inventory-analytics", async (req, res) => {
  try {
    const { from, to } = ensureRangeFromQuery(req.query);
    const groupBy =
      String(req.query.groupBy || "month").toLowerCase() || "month";

    const token = await getAccessToken();

    const [items, ledgerEntries] = await Promise.all([
      bcFetchAll(withCompany("items"), token),
      bcFetchAll(withCompany("itemLedgerEntries"), token),
    ]);

    const itemMap = new Map();
    for (const it of items) {
      itemMap.set(it.number, it);
    }

    // Build inventory aging — based on last inbound movement date per item
    const now = new Date();
    const inboundTypes = new Set([
      "purchase",
      "positive adjmt.",
      "output",
      "transfer",
    ]);

    const lastInflowByItem = new Map();
    for (const e of ledgerEntries) {
      const postingDate = parseBcDate(e.postingDate);
      if (!postingDate) continue;

      const entryType = String(e.entryType || "").toLowerCase();
      const itemNumber = e.itemNumber || "";
      const qty = Number(e.quantity ?? 0);

      // Treat positive quantity and inbound entry types as inflow
      if (qty > 0 && [...inboundTypes].some((t) => entryType.includes(t))) {
        const prev = lastInflowByItem.get(itemNumber);
        if (!prev || postingDate > prev) {
          lastInflowByItem.set(itemNumber, postingDate);
        }
      }
    }

    const agingBuckets = {
      lt1m: { key: "lt1m", label: "< 1 month", totalQty: 0, totalValue: 0 },
      m1to3m: {
        key: "m1to3m",
        label: "1–3 months",
        totalQty: 0,
        totalValue: 0,
      },
      m3to6m: {
        key: "m3to6m",
        label: "3–6 months",
        totalQty: 0,
        totalValue: 0,
      },
      m6to12m: {
        key: "m6to12m",
        label: "6–12 months",
        totalQty: 0,
        totalValue: 0,
      },
      gt12m: {
        key: "gt12m",
        label: "> 12 months",
        totalQty: 0,
        totalValue: 0,
      },
    };

    const inventoryAgingBySku = [];

    for (const it of items) {
      const itemNumber = it.number || "";
      const itemName = it.displayName || it.displayName2 || "Unnamed Item";
      const inventoryQty = Number(it.inventory ?? 0);
      const unitCost = Number(it.unitCost ?? 0);
      const inventoryValue = inventoryQty * unitCost;

      if (inventoryQty <= 0) continue;

      const lastInflow = lastInflowByItem.get(itemNumber) || null;
      const ageDays = lastInflow
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - lastInflow.getTime()) / (24 * 60 * 60 * 1000)
            )
          )
        : null;

      let bucketKey = "gt12m";
      if (ageDays === null) {
        bucketKey = "gt12m";
      } else if (ageDays <= 30) {
        bucketKey = "lt1m";
      } else if (ageDays <= 90) {
        bucketKey = "m1to3m";
      } else if (ageDays <= 180) {
        bucketKey = "m3to6m";
      } else if (ageDays <= 365) {
        bucketKey = "m6to12m";
      } else {
        bucketKey = "gt12m";
      }

      const bucket = agingBuckets[bucketKey];
      bucket.totalQty += inventoryQty;
      bucket.totalValue += inventoryValue;

      inventoryAgingBySku.push({
        itemNumber,
        itemName,
        inventoryQty,
        inventoryValue,
        unitCost,
        lastInflowDate: lastInflow ? lastInflow.toISOString() : null,
        ageDays,
        bucketKey,
        bucketLabel: bucket.label,
      });
    }

    inventoryAgingBySku.sort((a, b) => b.inventoryValue - a.inventoryValue);

    const agingBucketSummary = Object.values(agingBuckets);

    // Inventory availability: simple "In stock / Low / Out" classification
    const availabilityRows = [];
    for (const it of items) {
      const itemNumber = it.number || "";
      const itemName = it.displayName || it.displayName2 || "Unnamed Item";
      const inventoryQty = Number(it.inventory ?? 0);
      const unitCost = Number(it.unitCost ?? 0);
      const inventoryValue = inventoryQty * unitCost;
      const blocked = !!it.blocked;

      let availabilityStatus = "Out of stock";
      if (inventoryQty > 0 && inventoryQty <= 10) {
        availabilityStatus = "Low";
      } else if (inventoryQty > 10) {
        availabilityStatus = "In stock";
      }

      availabilityRows.push({
        itemNumber,
        itemName,
        inventoryQty,
        unitCost,
        inventoryValue,
        blocked,
        availabilityStatus,
      });
    }

    availabilityRows.sort((a, b) => b.inventoryValue - a.inventoryValue);

    // Production & consumption: RM/PM consumed vs SFG/FG produced
    const prodBuckets = new Map(); // periodId -> aggregate

    function getPeriodKey(date) {
      if (groupBy === "day") {
        const d = startOfDay(date);
        return {
          id: d.toISOString().slice(0, 10),
          label: d.toISOString().slice(0, 10),
        };
      }
      if (groupBy === "year") {
        const y = date.getFullYear();
        return { id: String(y), label: String(y) };
      }
      if (groupBy === "quarter") {
        const q = getQuarterBucket(date);
        return { id: q.id, label: q.label };
      }
      // default month
      const m = getMonthBucket(date);
      return { id: m.id, label: m.label };
    }

    for (const e of ledgerEntries) {
      const postingDate = parseBcDate(e.postingDate);
      if (!postingDate) continue;
      if (postingDate < from || postingDate > to) continue;

      const itemNumber = e.itemNumber || "";
      const item = itemMap.get(itemNumber);
      if (!item) continue;

      const cls = classifyItemForProduction(item);
      const qty = Number(e.quantity ?? 0);
      const cost = Number(e.costAmountActual ?? 0);

      if (qty === 0 && cost === 0) continue;

      const { id, label } = getPeriodKey(postingDate);
      const key = id;
      const prev = prodBuckets.get(key) || {
        periodId: id,
        periodLabel: label,
        rmConsumedQty: 0,
        rmConsumedValue: 0,
        pmConsumedQty: 0,
        pmConsumedValue: 0,
        sfgProducedQty: 0,
        sfgProducedValue: 0,
        fg2511ProducedQty: 0,
        fg2511ProducedValue: 0,
      };

      if (cls === "RM") {
        if (qty < 0) {
          prev.rmConsumedQty += Math.abs(qty);
          prev.rmConsumedValue += Math.abs(cost);
        }
      } else if (cls === "PM") {
        if (qty < 0) {
          prev.pmConsumedQty += Math.abs(qty);
          prev.pmConsumedValue += Math.abs(cost);
        }
      } else if (cls === "SFG") {
        if (qty > 0) {
          prev.sfgProducedQty += qty;
          prev.sfgProducedValue += Math.abs(cost);
        }
      } else if (cls === "FG_2511") {
        if (qty > 0) {
          prev.fg2511ProducedQty += qty;
          prev.fg2511ProducedValue += Math.abs(cost);
        }
      }

      prodBuckets.set(key, prev);
    }

    const productionConsumptionSeries = Array.from(prodBuckets.values()).sort(
      (a, b) => (a.periodId < b.periodId ? -1 : a.periodId > b.periodId ? 1 : 0)
    );

    res.json({
      meta: {
        companyName,
        generatedAt: new Date().toISOString(),
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        groupBy,
      },
      inventoryAgingBySku,
      agingBucketSummary,
      availabilityBySku: availabilityRows,
      productionConsumptionSeries,
    });
  } catch (err) {
    console.error("GET /api/md/inventory-analytics error:", err);
    res.status(500).json({ error: "Failed to load inventory analytics" });
  }
});

// ---------------------------------------------------------------------------
// NEW: Vendor aging – "how much due by when" (agedAccountsPayable)
// ---------------------------------------------------------------------------

router.get("/vendor-aging", async (req, res) => {
  try {
    const token = await getAccessToken();
    const rows = await bcFetchAll(withCompany("agedAccountsPayables"), token);

    const vendors = [];
    let totalBalance = 0;
    let totalCurrent = 0;
    let totalP1 = 0;
    let totalP2 = 0;
    let totalP3 = 0;

    for (const r of rows) {
      const vendorNumber = r.vendorNumber || "";
      const name = String(r.name || "");
      const isTotalRow = !vendorNumber || name.trim().toLowerCase() === "total";

      const balanceDue = Number(r.balanceDue ?? 0);
      const currentAmount = Number(r.currentAmount ?? 0);
      const p1 = Number(r.period1Amount ?? 0);
      const p2 = Number(r.period2Amount ?? 0);
      const p3 = Number(r.period3Amount ?? 0);

      if (isTotalRow) {
        // We'll recompute totals ourselves.
        continue;
      }

      totalBalance += balanceDue;
      totalCurrent += currentAmount;
      totalP1 += p1;
      totalP2 += p2;
      totalP3 += p3;

      vendors.push({
        vendorNumber,
        vendorName: name,
        balanceDue,
        currentAmount,
        period1Description: r.agingPeriod1Description,
        period1Amount: p1,
        period2Description: r.agingPeriod2Description,
        period2Amount: p2,
        period3Description: r.agingPeriod3Description,
        period3Amount: p3,
        currencyCode: r.currencyCode,
      });
    }

    vendors.sort((a, b) => b.balanceDue - a.balanceDue);

    res.json({
      meta: {
        companyName,
        generatedAt: new Date().toISOString(),
      },
      totals: {
        totalBalance,
        totalCurrent,
        totalPeriod1: totalP1,
        totalPeriod2: totalP2,
        totalPeriod3: totalP3,
      },
      vendors,
    });
  } catch (err) {
    console.error("GET /api/md/vendor-aging error:", err);
    res.status(500).json({ error: "Failed to load vendor aging data" });
  }
});

// ---------------------------------------------------------------------------
// RAW EXPORT: All Business Central salesInvoices -> Excel (.xlsx)
// GET /api/md/sales-invoices-raw
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// RAW EXPORT: All Business Central salesInvoices -> Excel (.xlsx)
// GET /api/md/sales-invoices-raw
// ---------------------------------------------------------------------------
router.get("/sales-invoices-raw", async (req, res) => {
  try {
    const token = await getAccessToken();

    // 🔍 Force a very wide postingDate range so we don't depend on BC defaults
    // You can tighten this later or make it configurable.
    // keep the wide filter so BC doesn't default anything weird
    const filterExpr =
      "postingDate ge 2000-01-01 and postingDate le 2100-12-31";

    // ❌ NO $top here – let the server paginate and bcFetchAll will follow @odata.nextLink
    const extraQuery = "$orderby=postingDate asc";

    const path = withCompanyAndFilter("salesInvoices", filterExpr, extraQuery);

    console.log("[sales-invoices-raw] Using BC path:", path);

    const invoices = await bcFetchAll(path, token);

    // Optional debug: see how many + max date
    if (invoices && invoices.length > 0) {
      let maxDate = null;
      for (const inv of invoices) {
        const d = parseBcDate(inv.postingDate || inv.invoiceDate);
        if (!d) continue;
        if (!maxDate || d > maxDate) maxDate = d;
      }
      console.log(
        `[sales-invoices-raw] Fetched ${invoices.length} invoices. Max postingDate =`,
        maxDate ? maxDate.toISOString() : "N/A"
      );
    } else {
      console.log("[sales-invoices-raw] No invoices returned from BC");
    }

    console.log("[sales-invoices-raw] Using BC path:", path);

    // Optional: log some debug info so you can verify the max postingDate
    if (invoices && invoices.length > 0) {
      let maxDate = null;
      for (const inv of invoices) {
        const d = parseBcDate(inv.postingDate || inv.invoiceDate);
        if (!d) continue;
        if (!maxDate || d > maxDate) maxDate = d;
      }
      console.log(
        `[sales-invoices-raw] Fetched ${invoices.length} invoices. Max postingDate =`,
        maxDate ? maxDate.toISOString() : "N/A"
      );
    } else {
      console.log("[sales-invoices-raw] No invoices returned from BC");
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("salesInvoices");

    if (!invoices || invoices.length === 0) {
      sheet.addRow(["No invoices returned from Business Central"]);
    } else {
      // Collect all keys across all rows so we don't miss any column
      const allKeys = new Set();
      for (const inv of invoices) {
        Object.keys(inv).forEach((k) => allKeys.add(k));
      }

      const columns = Array.from(allKeys);
      sheet.columns = columns.map((key) => ({
        header: key,
        key,
        width: 20,
      }));

      for (const inv of invoices) {
        const rowValues = {};
        for (const key of columns) {
          rowValues[key] = inv[key];
        }
        sheet.addRow(rowValues);
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales-invoices-raw-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("GET /api/md/sales-invoices-raw error:", err);
    res.status(500).json({
      error: "Failed to export salesInvoices to XLSX",
      details: String(err),
    });
  }
});

/// === 7. CLI snapshot mode (new) =============================================
//
// When md.cjs is run directly (node md.cjs), build a snapshot JSON file
// in the EXACT shape expected by the frontend:
//
// {
//   salesAnalytics: { ...same as GET /api/md/sales-analytics },
//   inventoryAnalytics: { ...same as GET /api/md/inventory-analytics },
//   vendorAgingAnalytics: { ...same as GET /api/md/vendor-aging },
//   meta: { builtAt, source, defaultFrom, defaultTo, granularity }
// }
//
// It does this by calling the local MD API instead of duplicating logic.
//

if (require.main === module) {
  (async () => {
    try {
      // Where is the MD API server? Default is your BE:
      //   http://localhost:4000
      // You can override this with SNAPSHOT_API_BASE_URL if needed
      const baseUrl =
        process.env.SNAPSHOT_API_BASE_URL || "http://localhost:4000";

      // Use same broad default range as FE (all time → today)
      const now = new Date();
      const defaultFrom = new Date(2000, 0, 1); // 2000-01-01
      const fromStr = defaultFrom.toISOString().slice(0, 10);
      const toStr = now.toISOString().slice(0, 10);
      const granularity = "month";

      console.log(
        "[MD CLI] Building analytics snapshot via local MD API at",
        baseUrl
      );
      console.log(
        "[MD CLI] Range:",
        fromStr,
        "→",
        toStr,
        "| granularity:",
        granularity
      );

      const salesUrl = `${baseUrl}/api/md/sales-analytics?from=${fromStr}&to=${toStr}&granularity=${granularity}`;
      const invUrl = `${baseUrl}/api/md/inventory-analytics?from=${fromStr}&to=${toStr}&groupBy=${granularity}`;
      const vendorUrl = `${baseUrl}/api/md/vendor-aging`;

      const [salesRes, invRes, vendorRes] = await Promise.all([
        fetch(salesUrl),
        fetch(invUrl),
        fetch(vendorUrl),
      ]);

      if (!salesRes.ok) {
        const text = await salesRes.text();
        throw new Error(
          `sales-analytics HTTP ${salesRes.status}: ${text.slice(0, 500)}`
        );
      }
      if (!invRes.ok) {
        const text = await invRes.text();
        throw new Error(
          `inventory-analytics HTTP ${invRes.status}: ${text.slice(0, 500)}`
        );
      }
      if (!vendorRes.ok) {
        const text = await vendorRes.text();
        throw new Error(
          `vendor-aging HTTP ${vendorRes.status}: ${text.slice(0, 500)}`
        );
      }

      const [salesAnalytics, inventoryAnalytics, vendorAgingAnalytics] =
        await Promise.all([salesRes.json(), invRes.json(), vendorRes.json()]);

      const snapshot = {
        salesAnalytics,
        inventoryAnalytics,
        vendorAgingAnalytics,
        meta: {
          builtAt: new Date().toISOString(),
          source: "md.cjs CLI via /api/md/* endpoints",
          defaultFrom: fromStr,
          defaultTo: toStr,
          granularity,
        },
      };

      const outputPath = path.join(__dirname, "md-dashboard-snapshot.json");
      fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");

      console.log(`[MD CLI] Snapshot written to: ${outputPath}`);
    } catch (err) {
      console.error(
        "[MD CLI] Error building MD dashboard snapshot:",
        err.message || err
      );
      process.exitCode = 1;
    }
  })();
} else {
  module.exports = router;
}
