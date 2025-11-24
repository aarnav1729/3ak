export function formatCurrency(value: number, currencyCode: string = "INR"): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (currencyCode === "INR") {
    // Indian number system (Lakhs, Crores)
    if (absValue >= 10000000) {
      return `${sign}₹${(absValue / 10000000).toFixed(2)}Cr`;
    } else if (absValue >= 100000) {
      return `${sign}₹${(absValue / 100000).toFixed(2)}L`;
    } else if (absValue >= 1000) {
      return `${sign}₹${(absValue / 1000).toFixed(1)}K`;
    }
    return `${sign}₹${absValue.toFixed(0)}`;
  }
  
  // Default to USD-style formatting
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (absValue >= 1000000000) {
    return `${sign}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(1)}K`;
  }
  return `${sign}${absValue.toFixed(0)}`;
}
