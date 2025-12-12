"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const ExcelJS = require("exceljs");

// Shared BC auth + fetch wrapper (token cache + retry + pagination)
const bcAuth = require("./bcAuth.cjs");

// Create router ONCE (your pasted file had router declared twice → runtime crash)
const router = express.Router();

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

          const customerNumber = String(
            row.customerNumber ||
              row.no ||
              row["No."] ||
              row["Customer No."] ||
              ""
          ).trim();
          if (!customerNumber) continue;

          map.set(customerNumber, {
            customerNumber,
            customerName: String(row.customerName || row.name || "").trim(),
            postingGroup: String(
              row.postingGroup ||
                row.customerPostingGroup ||
                row["Customer Posting Group"] ||
                ""
            ).trim(),
            genBusPostingGroup: String(
              row.genBusPostingGroup ||
                row["Gen. Bus. Posting Group"] ||
                row["Gen Bus Posting Group"] ||
                ""
            ).trim(),
            customerType: String(
              row.customerType || row["Customer Type"] || ""
            ).trim(),
          });
        }

        customerClassificationMap = map;
        console.log(
          `[MD] Loaded ${customerClassificationMap.size} customer classification rows from JSON`
        );
        return;
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
        "- customer classification will be empty."
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

    // Use first sheet by default (or adjust if you have a specific sheet name)
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

    const custNoCol = colIdx(["Customer No.", "No.", "Customer Number"]);
    const nameCol = colIdx(["Name", "Customer Name"]);
    const postingGroupCol = colIdx([
      "Customer Posting Group",
      "Posting Group",
      "Cust Posting Group",
    ]);
    const genBusPostingGroupCol = colIdx([
      "Gen. Bus. Posting Group",
      "Gen Bus Posting Group",
      "Gen. Bus Posting Group",
    ]);
    const customerTypeCol = colIdx(["Customer Type", "Type"]);

    if (!custNoCol) {
      console.warn(
        "[MD] Could not find 'Customer No.' column in customer mapping; map will be empty."
      );
      customerClassificationMap = new Map();
      return;
    }

    const map = new Map();
    const jsonArray = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const custNoRaw = row.getCell(custNoCol).value;
      if (!custNoRaw) return;
      const customerNumber = String(custNoRaw).trim();
      if (!customerNumber) return;

      const customerName = nameCol
        ? String(row.getCell(nameCol).value || "").trim()
        : "";

      const postingGroup = postingGroupCol
        ? String(row.getCell(postingGroupCol).value || "").trim()
        : "";

      const genBusPostingGroup = genBusPostingGroupCol
        ? String(row.getCell(genBusPostingGroupCol).value || "").trim()
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

    // Write JSON snapshot for faster next run
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

// === SKU classification mapping (from 3AK Power BI - Base Tables.xlsx) =====

const SKU_MAPPING_XLSX_PATH =
  process.env.SKU_MAPPING_XLSX_PATH ||
  path.join(__dirname, "3AK Power BI - Base Tables.xlsx");

const SKU_MAPPING_JSON_PATH =
  process.env.SKU_MAPPING_JSON_PATH ||
  path.join(__dirname, "sku-classification.json");

// Default sheet that has SKU categorisation
const SKU_MAPPING_SHEET_NAME =
  process.env.SKU_MAPPING_SHEET_NAME || "Product Categories for FG";

// Map: itemNumber (SKU) -> {
//   sku,
//   name,
//   masterCategory,
//   category,
//   subCategory,
//   productBaseName,
//   packageType,
//   boxType,
//   packSize,
//   caseQty
// }
let skuClassificationMap = new Map();
let skuMapLoadAttempted = false;

/**
 * Load SKU classification from "3AK Power BI - Base Tables.xlsx".
 *
 * Priority:
 *  1) If JSON snapshot exists, load from JSON.
 *  2) Else, read "Product Categories for FG" sheet, build map, and write JSON.
 *
 * Safe to call multiple times (only first call actually loads).
 */
async function ensureSkuClassificationLoaded() {
  if (skuMapLoadAttempted) return;
  skuMapLoadAttempted = true;

  // 1) Try JSON snapshot first
  try {
    if (fs.existsSync(SKU_MAPPING_JSON_PATH)) {
      console.log(
        "[MD] Loading SKU classification JSON from",
        SKU_MAPPING_JSON_PATH
      );

      const raw = fs.readFileSync(SKU_MAPPING_JSON_PATH, "utf8");
      const arr = JSON.parse(raw);

      if (Array.isArray(arr)) {
        const map = new Map();
        for (const row of arr) {
          if (!row) continue;
          const sku = String(row.sku || row.itemNumber || "").trim();
          if (!sku) continue;

          map.set(sku, {
            sku,
            name: String(row.name || "").trim(),
            masterCategory: String(row.masterCategory || "").trim(),
            category: String(row.category || "").trim(),
            subCategory: String(row.subCategory || "").trim(),
            productBaseName: String(row.productBaseName || "").trim(),
            packageType: String(row.packageType || "").trim(),
            boxType: String(row.boxType || "").trim(),
            packSize: String(row.packSize || "").trim(),
            caseQty: row.caseQty,
          });
        }

        skuClassificationMap = map;
        console.log(
          `[MD] Loaded ${skuClassificationMap.size} SKU classification rows from JSON`
        );
        return;
      }

      console.warn(
        "[MD] SKU classification JSON did not contain an array; falling back to XLSX"
      );
    }
  } catch (err) {
    console.warn(
      "[MD] Failed to load SKU classification JSON, falling back to XLSX:",
      err.message || err
    );
  }

  // 2) Fallback: read from XLSX and also write JSON snapshot
  try {
    if (!fs.existsSync(SKU_MAPPING_XLSX_PATH)) {
      console.warn(
        "[MD] SKU mapping XLSX not found at",
        SKU_MAPPING_XLSX_PATH,
        "- SKU classification will be empty."
      );
      skuClassificationMap = new Map();
      return;
    }

    console.log(
      "[MD] Loading SKU classification from XLSX",
      SKU_MAPPING_XLSX_PATH
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SKU_MAPPING_XLSX_PATH);

    const sheet = wb.getWorksheet(SKU_MAPPING_SHEET_NAME) || wb.worksheets[0];

    if (!sheet) {
      console.warn("[MD] SKU mapping workbook has no sheets");
      skuClassificationMap = new Map();
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

    const skuCol = colIdx(["SKU", "Item No.", "Item"]);
    const nameCol = colIdx(["Name", "Description"]);
    const masterCatCol = colIdx(["Master Category"]);
    const catCol = colIdx(["Category"]);
    const subCatCol = colIdx(["Sub Category", "Subcategory"]);
    const baseNameCol = colIdx(["Product Base Name"]);
    const pkgTypeCol = colIdx(["Package Type"]);
    const boxTypeCol = colIdx(["Box Type"]);
    const packSizeCol = colIdx(["Pack Size"]);
    const caseQtyCol = colIdx(["Case Qty", "Case Quantity"]);

    if (!skuCol) {
      console.warn(
        "[MD] Could not find 'SKU' column in SKU mapping; map will be empty."
      );
      skuClassificationMap = new Map();
      return;
    }

    const map = new Map();
    const jsonArray = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const skuRaw = row.getCell(skuCol).value;
      if (!skuRaw) return;

      const sku = String(skuRaw).trim();
      if (!sku) return;

      const name = nameCol
        ? String(row.getCell(nameCol).value || "").trim()
        : "";

      const masterCategory = masterCatCol
        ? String(row.getCell(masterCatCol).value || "").trim()
        : "";

      const category = catCol
        ? String(row.getCell(catCol).value || "").trim()
        : "";

      const subCategory = subCatCol
        ? String(row.getCell(subCatCol).value || "").trim()
        : "";

      const productBaseName = baseNameCol
        ? String(row.getCell(baseNameCol).value || "").trim()
        : "";

      const packageType = pkgTypeCol
        ? String(row.getCell(pkgTypeCol).value || "").trim()
        : "";

      const boxType = boxTypeCol
        ? String(row.getCell(boxTypeCol).value || "").trim()
        : "";

      const packSize = packSizeCol
        ? String(row.getCell(packSizeCol).value || "").trim()
        : "";

      const caseQty = caseQtyCol ? row.getCell(caseQtyCol).value : null;

      const obj = {
        sku,
        name,
        masterCategory,
        category,
        subCategory,
        productBaseName,
        packageType,
        boxType,
        packSize,
        caseQty,
      };

      map.set(sku, obj);
      jsonArray.push(obj);
    });

    skuClassificationMap = map;
    console.log(
      `[MD] Loaded ${skuClassificationMap.size} SKU classification rows from XLSX`
    );

    // Write JSON snapshot for faster next run
    try {
      fs.writeFileSync(
        SKU_MAPPING_JSON_PATH,
        JSON.stringify(jsonArray, null, 2),
        "utf8"
      );
      console.log(
        `[MD] Wrote SKU classification JSON snapshot to ${SKU_MAPPING_JSON_PATH} (${jsonArray.length} rows)`
      );
    } catch (err) {
      console.warn(
        "[MD] Failed to write SKU classification JSON snapshot:",
        err.message || err
      );
    }
  } catch (err) {
    console.error(
      "[MD] Failed to load SKU classification mapping:",
      err.message || err
    );
    skuClassificationMap = new Map();
  }
}

/**
 * Helper to look up SKU classification by itemNumber.
 */
function getSkuClassification(itemNumber) {
  if (!itemNumber) return null;
  const sku = String(itemNumber).trim();
  return skuClassificationMap.get(sku) || null;
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
// NOTE: Keeping your hard-coded creds as-is (minimal change).
// Recommended later: move to .env and read from process.env.*

const tenantId = "985f0700-1d9d-4e2a-9267-27736d2c7ab5";
const clientId = "091bce49-dd2f-4707-9cb1-9df616bb36c3";
const clientSecret = "HHZ8Q~brWPmnqf1Cz~eJMKfSPpvsiyZ1gRleDa6w";
const bcEnvironment = "Production";
const companyName = "3AK Chemie Pvt. Ltd.";

const bcBaseUrl = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${bcEnvironment}/api/v2.0`;

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

// Fiscal year meta (Apr–Mar) from calendar year + month (1–12)
function getFiscalYearMetaForYearMonth(year, month) {
  const fyStartYear = month <= 3 ? year - 1 : year; // Jan–Mar belong to previous FY
  const fyEndYear = fyStartYear + 1;
  const fyId = `${fyStartYear}-${fyEndYear}`;
  const fyLabel = `FY ${fyStartYear}-${fyEndYear}`;
  return { fyId, fyLabel };
}

// === 1. Token (cached) ======================================================

async function getAccessToken() {
  return bcAuth.getAccessTokenCached({
    tenantId,
    clientId,
    clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });
}

// === 2. Generic BC fetch with pagination ====================================

// pathWithQuery: e.g. "salesInvoices?company=XYZ&$top=1000"
async function bcFetchAll(pathWithQuery, accessToken) {
  const firstUrl = `${bcBaseUrl}/${pathWithQuery}`;
  return bcAuth.fetchAllPages(firstUrl, { accessToken });
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
    query += `&$filter=${encodeURIComponent(filterExpr)}`;
  }

  if (extraQuery) {
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

  if (
    cat === "RM" ||
    cat === "RAW" ||
    invGroup.includes("RAW") ||
    genProd.includes("RM")
  ) {
    return "RM";
  }

  if (
    cat === "PM" ||
    cat === "PACK" ||
    invGroup.includes("PACK") ||
    genProd.includes("PM")
  ) {
    return "PM";
  }

  if (cat === "SFG" || genProd.includes("SFG")) {
    return "SFG";
  }

  return "OTHER";
}

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

router.get("/sales-analytics", async (req, res) => {
  try {
    const now = new Date();
    const { from, to } = ensureRangeFromQuery(req.query);
    const granularity =
      String(req.query.granularity || "month").toLowerCase() || "month";

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

    await ensureCustomerClassificationLoaded();
    await ensureSkuClassificationLoaded();

    // 1) Fetch invoices (try with expanded lines; fall back if needed)
    let invoices;
    try {
      invoices = await bcFetchAll(
        withCompanyAndFilter(
          "salesInvoices",
          null,
          "$expand=salesInvoiceLines"
        ),
        token
      );
    } catch (e) {
      console.warn(
        "[MD] salesInvoices?$expand=salesInvoiceLines failed, falling back to invoices without lines:",
        e.message || e
      );
      invoices = await bcFetchAll(withCompany("salesInvoices"), token);
    }

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

    const monthlySeriesAllYears = [];

    for (const meta of invoicesMeta) {
      const postingDate = meta.postingDate;
      if (!invoicePassesCategoryFilters(meta, filters)) continue;

      if (postingDate >= from && postingDate <= to) {
        totalRangeSalesExcl += meta.amountExcl;
        totalRangeSalesIncl += meta.amountIncl;
      }

      if (postingDate >= fyStart && postingDate <= now) {
        ytdSalesExcl += meta.amountExcl;
        ytdSalesIncl += meta.amountIncl;
      }

      if (postingDate >= mStart && postingDate <= now) {
        mtdSalesExcl += meta.amountExcl;
        mtdSalesIncl += meta.amountIncl;
      }

      if (postingDate >= qStart && postingDate <= qEnd) {
        qtdSalesExcl += meta.amountExcl;
        qtdSalesIncl += meta.amountIncl;
      }

      if (postingDate >= lastQStart && postingDate <= lastQEnd) {
        lastQuarterSalesExcl += meta.amountExcl;
        lastQuarterSalesIncl += meta.amountIncl;
      }

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
        totalSales: r.amountIncl,
      };
    });

    // Facts for FE multi-filtering (invoice-level, after filters)
    const facts = Array.from(invoiceMap.values()).map((meta) => {
      const mb = getMonthBucket(meta.postingDate);
      const fyMeta = getFiscalYearMetaForYearMonth(mb.year, mb.month);

      let geoLabel = "Domestic";
      if (meta.geo === "EXPORT") geoLabel = "Export";
      else if (meta.geo === "DOMESTIC") geoLabel = "Domestic";

      return {
        postingDate: meta.postingDate.toISOString(),
        year: mb.year,
        month: mb.month,
        monthId: mb.id,
        monthLabel: mb.label,
        fyId: fyMeta.fyId,
        fyLabel: fyMeta.fyLabel,
        customerNumber: meta.customerNumber,
        customerName: meta.customerName,
        geo: geoLabel,
        salesCategoryKey: meta.salesCategoryKey,
        salesCategoryLabel: meta.salesCategoryLabel,
        amount: meta.amountIncl,
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
        totalSales: row.totalSalesIncl,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // 7) Sales by SKU (range; use lines from $expand on salesInvoices)
    const skuAgg = new Map();
    const customerSkuAgg = new Map();

    for (const meta of invoiceMap.values()) {
      const rawInv = meta.raw || {};

      const lines = Array.isArray(rawInv.salesInvoiceLines)
        ? rawInv.salesInvoiceLines
        : [];

      if (!lines.length) continue;

      for (const line of lines) {
        const itemNumber = line.itemNumber || line.no || "UNKNOWN";
        const desc = line.description || "No description";
        const qty = Number(line.quantity ?? 0);
        const valueExcl = Number(line.lineAmount ?? 0) || 0;
        const valueIncl =
          Number(line.amountIncludingTax ?? line.lineAmount ?? 0) || 0;

        const skuClass = getSkuClassification(itemNumber);
        const pkgTypeFromLine = extractPackageTypeFromLine(line);

        const key = itemNumber;
        const prev = skuAgg.get(key) || {
          itemNumber,
          description: desc,
          totalSalesExcl: 0,
          totalSalesIncl: 0,
          totalQuantity: 0,
          lineCount: 0,
          masterCategory: "",
          category: "",
          subCategory: "",
          productBaseName: "",
          packageType: "",
        };

        prev.totalSalesExcl += valueExcl;
        prev.totalSalesIncl += valueIncl;
        prev.totalQuantity += qty;
        prev.lineCount += 1;

        if (skuClass) {
          prev.masterCategory = skuClass.masterCategory || prev.masterCategory;
          prev.category = skuClass.category || prev.category;
          prev.subCategory = skuClass.subCategory || prev.subCategory;
          prev.productBaseName =
            skuClass.productBaseName || prev.productBaseName;

          if (skuClass.packageType) {
            prev.packageType = skuClass.packageType;
          }
        }

        if (!prev.packageType && pkgTypeFromLine) {
          prev.packageType = pkgTypeFromLine;
        } else if (
          prev.packageType &&
          pkgTypeFromLine &&
          prev.packageType !== pkgTypeFromLine &&
          (!skuClass || !skuClass.packageType)
        ) {
          prev.packageType = "Mixed";
        }

        skuAgg.set(key, prev);

        const custKey = meta.customerNumber || "UNKNOWN";
        const custName = meta.customerName || "Unknown Customer";
        const comboKey = `${custKey}::${itemNumber}`;

        const prevCust = customerSkuAgg.get(comboKey) || {
          customerNumber: custKey,
          customerName: custName,
          itemNumber,
          description: desc,
          totalSalesExcl: 0,
          totalSalesIncl: 0,
          totalQuantity: 0,
          lineCount: 0,
          masterCategory: "",
          category: "",
          subCategory: "",
          productBaseName: "",
          packageType: "",
        };

        prevCust.totalSalesExcl += valueExcl;
        prevCust.totalSalesIncl += valueIncl;
        prevCust.totalQuantity += qty;
        prevCust.lineCount += 1;

        prevCust.masterCategory =
          prev.masterCategory || prevCust.masterCategory;
        prevCust.category = prev.category || prevCust.category;
        prevCust.subCategory = prev.subCategory || prevCust.subCategory;
        prevCust.productBaseName =
          prev.productBaseName || prevCust.productBaseName;
        prevCust.packageType = prev.packageType || prevCust.packageType;

        customerSkuAgg.set(comboKey, prevCust);
      }
    }

    const salesBySku = Array.from(skuAgg.values())
      .map((row) => ({
        ...row,
        totalSales: row.totalSalesIncl,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    const salesByCustomerSku = Array.from(customerSkuAgg.values())
      .map((row) => ({
        customerNumber: row.customerNumber,
        customerName: row.customerName,
        itemNumber: row.itemNumber,
        description: row.description,
        totalSales: row.totalSalesIncl,
        totalQuantity: row.totalQuantity,
        masterCategory: row.masterCategory,
        category: row.category,
        subCategory: row.subCategory,
        productBaseName: row.productBaseName,
        packageType: row.packageType,
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
        totalSales: row.totalSalesIncl,
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
          amount: meta.amountIncl,
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
      salesByCustomerSku,
      salesByChannel,
      salesByChannelInvoices,
      granularity,
      facts,
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

    const prodBuckets = new Map();

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

      if (isTotalRow) continue;

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

router.get("/sales-invoices-raw", async (req, res) => {
  try {
    const token = await getAccessToken();

    const filterExpr =
      "postingDate ge 2000-01-01 and postingDate le 2100-12-31";

    const extraQuery = "$orderby=postingDate asc";

    const bcPath = withCompanyAndFilter(
      "salesInvoices",
      filterExpr,
      extraQuery
    );

    console.log("[sales-invoices-raw] Using BC path:", bcPath);

    const invoices = await bcFetchAll(bcPath, token);

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

/// === 7. CLI snapshot mode (kept) ===========================================
//
// When md.cjs is run directly (node md.cjs), build a snapshot JSON file
// by calling the local MD API.
//

function getFetchFn() {
  if (typeof fetch === "function") return fetch;
  // eslint-disable-next-line global-require
  return require("node-fetch");
}

if (require.main === module) {
  (async () => {
    try {
      const fetchFn = getFetchFn();

      const baseUrl =
        process.env.SNAPSHOT_API_BASE_URL || "http://localhost:4000";

      const now = new Date();
      const defaultFrom = new Date(2000, 0, 1);
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
        fetchFn(salesUrl),
        fetchFn(invUrl),
        fetchFn(vendorUrl),
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
