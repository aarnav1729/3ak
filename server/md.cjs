// md.cjs (updated)
// MD dashboard data + Express router endpoints for BC analytics

"use strict";

const { Parser } = require("xml2js");
const fs = require("fs");
const path = require("path");
const express = require("express");
const ExcelJS = require("exceljs");

// === BC config (same as your script) ========================================
const tenantId = "985f0700-1d9d-4e2a-9267-27736d2c7ab5";
const clientId = "091bce49-dd2f-4707-9cb1-9df616bb36c3";
const clientSecret = "HHZ8Q~brWPmnqf1Cz~eJMKfSPpvsiyZ1gRleDa6w";
const bcEnvironment = "Production";
const companyName = "3AK Chemie Pvt. Ltd.";

const bcBaseUrl = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${bcEnvironment}/api/v2.0`;

// If Node < 18, uncomment and install node-fetch:
// const fetch = require("node-fetch");

// === Helpers: dates ==========================================================
function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfMonth(d) {
  const dt = new Date(d);
  dt.setDate(1);
  dt.setHours(0, 0, 0, 0);
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

  // Indian FY starts 1 April.
  // If we're in Jan/Feb/Mar (month 0,1,2) then FY started last calendar year.
  const fyYear = month < 3 ? dt.getFullYear() - 1 : dt.getFullYear();

  const fyStart = new Date(fyYear, 3, 1); // month=3 => April, day=1
  fyStart.setHours(0, 0, 0, 0);
  return fyStart;
}

function daysAgo(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - n);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function parseBcDate(dateStr) {
  if (!dateStr) return null;

  // If it's plain YYYY-MM-DD, add UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // Otherwise assume BC gave us a full ISO string already
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
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
      // next is full URL
      url = next;
    } else {
      url = null;
    }
  }

  return all;
}

// Convenience wrapper to attach & encode company= query
function withCompany(basePath) {
  const companyParam = encodeURIComponent(companyName);
  return `${basePath}?company=${companyParam}&$top=5000`;
}

// === 3. Metric builders ======================================================

async function buildSalesMetrics(token) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const yearStart = startOfFiscalYearIndia(now);
  const last30Start = daysAgo(now, 29);

  // Using salesInvoices as the canonical sales data
  const invoices = await bcFetchAll(withCompany("salesInvoices"), token);

  let todaySales = 0;
  let mtdSales = 0;
  let ytdSales = 0;
  let last30DaysSales = 0;

  const byCustomer = {}; // customerNumber -> { name, totalSales }

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

  // Pipeline: Quotes & Orders (simple sums)
  const quotes = await bcFetchAll(withCompany("salesQuotes"), token);
  const orders = await bcFetchAll(withCompany("salesOrders"), token);

  let openQuotesCount = 0;
  let openQuotesValue = 0;
  for (const q of quotes) {
    // status might be "Open" / "Draft" etc; we treat null as open
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
  // Note: entity set name is typically plural "agedAccountsReceivables"
  const rows = await bcFetchAll(withCompany("agedAccountsReceivables"), token);

  let totalAR = 0;
  let overdueAR = 0;

  const perCustomer = [];

  for (const r of rows) {
    const customerNumber = r.customerNumber || "";
    const name = String(r.name || "");

    // BC often gives an aggregate "Total" row with empty customerNumber.
    // We should NOT treat that as a separate customer, nor double-count it.
    const isTotalRow = !customerNumber || name.trim().toLowerCase() === "total";

    const balanceDue = Number(r.balanceDue ?? 0);
    const p1 = Number(r.period1Amount ?? 0);
    const p2 = Number(r.period2Amount ?? 0);
    const p3 = Number(r.period3Amount ?? 0);
    const overdue = p1 + p2 + p3;

    if (isTotalRow) {
      // Skip from per-customer list AND from totals to avoid double-counting.
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

  // Purchases from purchaseInvoices
  const pinv = await bcFetchAll(withCompany("purchaseInvoices"), token);

  let mtdPurchases = 0;
  let ytdPurchases = 0;
  let last30DaysPurchases = 0;

  const byVendor = {}; // vendorNumber -> { vendorNumber, vendorName, totalPurchases }

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

  // AP ageing
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

    if (isTotalRow) {
      continue;
    }

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

  let totalSkus = items.length;
  let totalInventoryQty = 0;
  let estInventoryValue = 0;

  const byItem = {}; // number -> { itemNumber, itemName, inventoryQty, cost, value, soldLast90 }

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

  // Approximate sales per item from itemLedgerEntries (entryType "Sale")
  for (const e of entries) {
    const postingDate = parseBcDate(e.postingDate);
    if (!postingDate || postingDate < last90Start || postingDate > now)
      continue;

    const entryType = String(e.entryType || "").toLowerCase();
    if (!entryType.includes("sale")) continue; // heuristic

    const itemNumber = e.itemNumber || "UNKNOWN";
    const qty = Number(e.quantity ?? 0);
    // For sales, quantity is typically negative – we want absolute
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

  // Top items by inventory value
  const topItemsByInventoryValue = [...itemsArr]
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
    .slice(0, 10);

  // Slow movers = high inventoryValue but low soldQtyLast90
  const slowMovers = itemsArr
    .filter((it) => it.inventoryQty > 0 && it.inventoryValue > 0)
    .sort((a, b) => {
      // prefer items with lower soldQty but high value
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
  // These are already pre-aggregated statements from BC
  const income = await bcFetchAll(withCompany("incomeStatements"), token);
  const balance = await bcFetchAll(withCompany("balanceSheets"), token);
  const cashflow = await bcFetchAll(withCompany("cashFlowStatements"), token);

  // For MD, we don’t need every line; pick top-level lines (indentation 0 or 1)
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

// === 4. Build full MD snapshot ==============================================
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

// === 5. Express router: endpoints per business need =========================

const router = express.Router();

/**
 * Daily/Monthly Sales
 * Uses: salesInvoice, salesInvoiceLine, salesOrder, salesShipment
 */
/**
 * Daily/Monthly Sales
 * Uses: salesInvoices, salesOrders, salesShipments
 * (Invoice *lines* are excluded for now because BC expects Invoice Id,
 * not a company-wide lines entity set.)
 */
router.get("/sales", async (req, res) => {
  try {
    const token = await getAccessToken();

    // NOTE: no salesInvoiceLines here – that endpoint needs an Id/Document Id.
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
        // salesInvoiceLines intentionally omitted – BC 400s if called without Id
      },
    });
  } catch (err) {
    console.error("GET /api/md/sales error:", err);
    res.status(500).json({ error: "Failed to load sales data" });
  }
});

/**
 * Raw Sales Invoices export to XLSX
 * GET /api/md/sales-export
 * Downloads a file containing all salesInvoices with helpful date flags.
 */
router.get("/sales-export", async (req, res) => {
  try {
    const token = await getAccessToken();
    const invoices = await bcFetchAll(withCompany("salesInvoices"), token);

    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfFiscalYearIndia(now);
    const last30Start = daysAgo(now, 29);

    // Build workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SalesInvoices");

    if (!invoices || invoices.length === 0) {
      sheet.addRow(["No invoices returned from Business Central"]);
    } else {
      // Collect all keys from all invoices (in case shape varies)
      const allKeys = new Set();
      for (const inv of invoices) {
        Object.keys(inv).forEach((k) => allKeys.add(k));
      }

      // We'll turn the Set into an array
      const baseColumns = Array.from(allKeys);

      // Add extra diagnostic columns
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

        // Copy all original keys
        for (const key of baseColumns) {
          rowValues[key] = inv[key];
        }

        // Add diagnostics
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

    // Set headers so browser downloads the file
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

/**
 * Receivables Aging
 * Uses: agedAccountsReceivable
 */
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
      rows: raw, // raw BC ageing rows if you need detailed buckets per customer
    });
  } catch (err) {
    console.error("GET /api/md/receivables-aging error:", err);
    res.status(500).json({ error: "Failed to load receivables ageing data" });
  }
});

/**
 * Payables Aging + Vendor Spend
 * Uses: agedAccountsPayable, purchaseInvoice (+lines indirectly),
 *       vendorPurchase (below endpoint dedicated for trends)
 */
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

/**
 * Cashflow
 * Uses: cashFlowStatement
 */
router.get("/cashflow", async (req, res) => {
  try {
    const token = await getAccessToken();
    const finance = await buildFinanceMetrics(token);
    // If you ever want raw cashFlowStatement rows:
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

/**
 * Customer Trends
 * Uses: customerSale
 */
router.get("/customer-trends", async (req, res) => {
  try {
    const token = await getAccessToken();
    const rows = await bcFetchAll(withCompany("customerSales"), token);

    // Sort descending by totalSalesAmount for convenience
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

/**
 * Vendor Spend Trends
 * Uses: vendorPurchase
 */
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

/**
 * Full MD Snapshot (all blocks in one shot)
 */
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

// === 6. CLI mode: keep your original snapshot generation ====================

if (require.main === module) {
  (async () => {
    try {
      console.log("Getting access token...");
      const token = await getAccessToken();
      console.log("Token acquired.");

      console.log("Building MD dashboard snapshot...");
      const snapshot = await buildMdSnapshot(token);

      // Log everything we intend to display later
      console.dir(snapshot, { depth: null });

      // Also write to disk for inspection / debugging
      const outputPath = path.join(__dirname, "md-dashboard-snapshot.json");
      fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");

      console.log(`Snapshot written to: ${outputPath}`);
    } catch (err) {
      console.error("Error building MD dashboard:", err.message);
    }
  })();
} else {
  // When imported into your main server, expose the router
  module.exports = router;
}
