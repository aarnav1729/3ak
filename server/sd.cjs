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

const { getAccessToken, fetchJsonWithRetry } = require("./bcAuth.cjs");

// ------------------------ HARD-CODED BC CREDS (as requested) ------------------------
const tenantId = "985f0700-1d9d-4e2a-9267-27736d2c7ab5";
const clientId = "091bce49-dd2f-4707-9cb1-9df616bb36c3";
const clientSecret = "HHZ8Q~brWPmnqf1Cz~eJMKfSPpvsiyZ1gRleDa6w";
const environmentName = "Production";
const companyName = "3AK Chemie Pvt. Ltd.";

// OData V4 Company root
const odataCompanyRoot = `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environmentName}/ODataV4/Company('${encodeURIComponent(
  companyName
)}')`;

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

function getCategoryForSku(sku) {
  const key = String(sku || "").trim().toUpperCase();
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

    const descriptionKey = pickKey(sampleRow, ["Description", "Item_Description", "Item Description"]);
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
async function fetchSampleRow(serviceName, accessToken) {
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

function buildODataUrl(serviceName, qs) {
  const parts = [];
  for (const [k, v] of Object.entries(qs)) {
    if (v == null || v === "") continue;
    parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return `${odataCompanyRoot}/${serviceName}?${parts.join("&")}`;
}

async function fetchAllSalesDashboard({
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
    const url = buildODataUrl(serviceName, {
      $select: $select.join(","),
      $orderby: `${keys.entryNoKey} asc`,
      $top: batchSize,
      $filter: filterParts.join(" and "),
    });

    let json;
    try {
      json = await fetchJsonWithRetry(url, { accessToken });
    } catch (_e) {
      const fallbackUrl = buildODataUrl(serviceName, {
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
  } = options;

    function incMatch(hay, needle) {
     const h = String(hay || "").toUpperCase();
        const n = String(needle || "").toUpperCase().trim();
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

    if (excludeIntercompany) {
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
    const custName = keys.customerNameKey ? String(r[keys.customerNameKey] || "") : "";
    if (!incMatch(custName, customerContains)) {
      skippedCustomerFilter++;
      continue;
    }

    const desc = keys.descriptionKey ? String(r[keys.descriptionKey] || "") : "";
    if (!incMatch(desc, descriptionContains)) {
      skippedDescriptionFilter++;
      continue;
    }

    const sku = keys.itemNoKey ? String(r[keys.itemNoKey] || "") : "";
    const catObj = getCategoryForSku(sku);
    if (!catObj) unmappedSkuCount++;

    const categorySearchBlob = [
      sku,
      catObj?.name,
      catObj?.masterCategory,
      catObj?.category,
      catObj?.subCategory,
      catObj?.productBaseName,
      desc, // allow fallback filtering by description too
    ]
      .filter(Boolean)
      .join(" | ");

    if (!incMatch(categorySearchBlob, categoryContains)) {
      skippedCategoryFilter++;
      continue;
    }

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

        usedMini.push({
              fy,
              monthKey,
              amount: amt,
              customerName: custName || "UNKNOWN",
              description: desc || "UNKNOWN",
              sku: sku || "",
              category: (catObj?.category || "UNMAPPED") || "UNMAPPED",
              masterCategory: (catObj?.masterCategory || "UNMAPPED") || "UNMAPPED",
              subCategory: (catObj?.subCategory || "UNMAPPED") || "UNMAPPED",
              productBaseName: (catObj?.productBaseName || "UNMAPPED") || "UNMAPPED",
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
    const s = wb.addWorksheet("By Customer", { views: [{ state: "frozen", ySplit: 1 }] });
    s.columns = [
      { header: "Customer", key: "key", width: 50 },
      { header: "Amount", key: "amount", width: 18 },
      { header: "Rows", key: "count", width: 10 },
    ];
    s.getRow(1).font = { bold: true };
    for (const r of table.groups.byCustomer) {
      s.addRow({ key: r.key, amount: Number(r.amount || 0), count: Number(r.count || 0) });
    }
    s.getColumn("amount").numFmt = "#,##0.00";
  }

  // ------------------ By Category ------------------
  if (table.groups?.byCategory?.length) {
    const s = wb.addWorksheet("By Category", { views: [{ state: "frozen", ySplit: 1 }] });
    s.columns = [
      { header: "Category", key: "key", width: 40 },
      { header: "Amount", key: "amount", width: 18 },
      { header: "Rows", key: "count", width: 10 },
    ];
    s.getRow(1).font = { bold: true };
    for (const r of table.groups.byCategory) {
      s.addRow({ key: r.key, amount: Number(r.amount || 0), count: Number(r.count || 0) });
    }
    s.getColumn("amount").numFmt = "#,##0.00";
  }

  // ------------------ Excluded Intercompany Names ------------------
  if (meta?.intercompanyGroupCompanies?.length) {
    const s = wb.addWorksheet("Excluded Intercompany", { views: [{ state: "frozen", ySplit: 1 }] });
    s.columns = [{ header: "Excluded Customer Names", key: "name", width: 60 }];
    s.getRow(1).font = { bold: true };
    for (const n of meta.intercompanyGroupCompanies) s.addRow({ name: n });
  }

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
}) {
  const accessToken = await getAccessToken({
    tenantId,
    clientId,
    clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });

  const sample = await fetchSampleRow(serviceName, accessToken);
  if (!sample) {
    return {
      meta: {
        company: companyName,
        environment: environmentName,
        odataRoot: odataCompanyRoot,
        fetchedAt: new Date().toISOString(),
        serviceName,
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

  const allRows = await fetchAllSalesDashboard({
    serviceName,
    accessToken,
    keys,
    fromDateYmd: merged ? merged.from : null,
    toDateYmd: merged ? merged.to : null,
    includeEntryTypes,
    batchSize: 10000,
  });

  const table = buildFyTableFromRows(allRows, {
    fyLabels,
    keys,
    includeEntryTypes,
    excludeIntercompany,
    customerContains,
    descriptionContains,
    categoryContains,
  });

  return {
    meta: {
      company: companyName,
      environment: environmentName,
      odataRoot: odataCompanyRoot,
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

          const customerContains = String(req.query.customer || "").trim();
   const descriptionContains = String(req.query.description || "").trim();    const categoryContains = String(req.query.category || "").trim();

    const payload = await buildFyTable({
      serviceName,
      fyLabels,
      includeEntryTypes,
      excludeIntercompany,
        customerContains,
            descriptionContains,
            categoryContains,
    });

    await writeFyTableXlsx(res, payload);
  } catch (err) {
    res.status(500).json({
      error: "Failed to export FY table XLSX",
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
    console.log(`[sd.cjs] OData company root: ${odataCompanyRoot}`);
    console.log(
      `[sd.cjs] Try: http://localhost:${PORT}/api/sd/fy-table?service=SalesDashboard`
    );
  });
}
