// src/hooks/useMdApi.ts
import { useQuery } from "@tanstack/react-query";
import { MdSnapshot, FinanceLine } from "@/types/dashboard";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// ---- Types for endpoint responses -----------------------------------------

export interface MdSalesResponse {
  meta: { companyName: string };
  metrics: MdSnapshot["sales"];
  tables: {
    salesInvoices: any[];
    salesInvoiceLines: any[];
    salesOrders: any[];
    salesShipments: any[];
  };
}

export interface MdReceivablesAgingResponse {
  meta: { companyName: string };
  metrics: MdSnapshot["receivables"];
  rows: any[]; // agedAccountsReceivables rows
}

export interface MdPayablesAgingResponse {
  meta: { companyName: string };
  metrics: MdSnapshot["payables"];
  purchasesMetrics: MdSnapshot["purchases"];
  rows: any[]; // agedAccountsPayables rows
}

export interface MdCashflowResponse {
  meta: { companyName: string };
  summary: FinanceLine[];
  rows: any[]; // raw cashFlowStatements rows
}

export interface MdCustomerTrendsResponse {
  meta: { companyName: string };
  rows: any[]; // customerSales rows
}

export interface MdVendorTrendsResponse {
  meta: { companyName: string };
  rows: any[]; // vendorPurchases rows
}

// ---- Generic fetcher -------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }

  return (await res.json()) as T;
}

// ---- Hooks -----------------------------------------------------------------

export const useMdSummary = () =>
  useQuery<MdSnapshot, Error>({
    queryKey: ["md-summary"],
    queryFn: () => fetchJson<MdSnapshot>("/api/md/summary"),
  });

export const useMdSales = () =>
  useQuery<MdSalesResponse, Error>({
    queryKey: ["md-sales"],
    queryFn: () => fetchJson<MdSalesResponse>("/api/md/sales"),
  });

export const useMdReceivablesAging = () =>
  useQuery<MdReceivablesAgingResponse, Error>({
    queryKey: ["md-receivables-aging"],
    queryFn: () =>
      fetchJson<MdReceivablesAgingResponse>("/api/md/receivables-aging"),
  });

export const useMdPayablesAging = () =>
  useQuery<MdPayablesAgingResponse, Error>({
    queryKey: ["md-payables-aging"],
    queryFn: () => fetchJson<MdPayablesAgingResponse>("/api/md/payables-aging"),
  });

export const useMdCashflow = () =>
  useQuery<MdCashflowResponse, Error>({
    queryKey: ["md-cashflow"],
    queryFn: () => fetchJson<MdCashflowResponse>("/api/md/cashflow"),
  });

export const useMdCustomerTrends = () =>
  useQuery<MdCustomerTrendsResponse, Error>({
    queryKey: ["md-customer-trends"],
    queryFn: () =>
      fetchJson<MdCustomerTrendsResponse>("/api/md/customer-trends"),
  });

export const useMdVendorTrends = () =>
  useQuery<MdVendorTrendsResponse, Error>({
    queryKey: ["md-vendor-trends"],
    queryFn: () => fetchJson<MdVendorTrendsResponse>("/api/md/vendor-trends"),
  });
