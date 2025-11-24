export interface MdSnapshot {
  generatedAt: string;
  company: {
    name: string;
  };
  sales: {
    todaySales: number;
    mtdSales: number;
    ytdSales: number;
    last30DaysSales: number;
    topCustomersBySales: TopCustomer[];
    openQuotesCount: number;
    openQuotesValue: number;
    openOrdersCount: number;
    openOrdersValue: number;
  };
  receivables: {
    totalAR: number;
    overdueAR: number;
    overdueRatioPercent: number;
    topOverdueCustomers: OverdueCustomer[];
  };
  purchases: {
    mtdPurchases: number;
    ytdPurchases: number;
    last30DaysPurchases: number;
    topVendorsBySpend: TopVendor[];
  };
  payables: {
    totalAP: number;
    overdueAP: number;
    overdueAPRatioPercent: number;
    topOverdueVendors: OverdueVendor[];
  };
  inventory: {
    totalSkus: number;
    totalInventoryQty: number;
    estInventoryValue: number;
    topItemsByInventoryValue: InventoryItem[];
    slowMovers: InventoryItem[];
  };
  finance: {
    incomeStatementSummary: FinanceLine[];
    balanceSheetSummary: FinanceLine[];
    cashFlowSummary: FinanceLine[];
  };
}

export interface TopCustomer {
  customerNumber: string;
  customerName: string;
  totalSales: number;
}

export interface OverdueCustomer {
  customerNumber: string;
  customerName: string;
  balanceDue: number;
  overdue: number;
  currencyCode: string;
}

export interface TopVendor {
  vendorNumber: string;
  vendorName: string;
  totalPurchases: number;
}

export interface OverdueVendor {
  vendorNumber: string;
  vendorName: string;
  balanceDue: number;
  overdue: number;
  currencyCode: string;
}

export interface InventoryItem {
  itemNumber: string;
  itemName: string;
  inventoryQty: number;
  unitCost: number;
  inventoryValue: number;
  soldQtyLast90: number;
}

export interface FinanceLine {
  lineNumber: number;
  label: string;
  amount: number;
  lineType: 'header' | 'detail' | 'total' | 'spacer';
  indentation: number;
}
