export interface ParsedBillFields {
  billDate: string | null; // ISO yyyy-MM-dd
  quantityLiters: number | null;
  ratePerLiter: number | null;
  totalAmount: number | null;
  vendorName: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Best-effort extraction of milk-bill fields from raw OCR text.
 * Printed bills vary a lot in layout, so this is heuristic — always
 * treat results as a starting point for the user to confirm, not ground
 * truth.
 */
export function parseBillText(rawText: string): ParsedBillFields {
  const text = rawText.replace(/\r/g, '');
  const flat = text.replace(/\s+/g, ' ').trim();

  return {
    billDate: parseDate(flat),
    quantityLiters: parseQuantity(flat),
    ratePerLiter: parseRate(flat),
    totalAmount: parseTotal(flat),
    vendorName: parseVendorName(text),
  };
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(text: string): string | null {
  // yyyy-mm-dd or yyyy/mm/dd (already ISO-ish)
  let m = text.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (m) {
    const iso = toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) return iso;
  }

  // dd Month yyyy  (e.g. "12 Jan 2026")
  m = text.match(/\b(\d{1,2})\s*[- ]?\s*([A-Za-z]{3,})[- ]?\s*(\d{2,4})\b/);
  if (m) {
    const monthKey = m[2].toLowerCase().slice(0, 3);
    const month = MONTHS[monthKey];
    if (month) {
      const iso = toIsoDate(Number(m[1]), month, Number(m[3]));
      if (iso) return iso;
    }
  }

  // dd/mm/yyyy or dd-mm-yy (common on Indian printed bills)
  m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    const iso = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) return iso;
  }

  return null;
}

function parseQuantity(text: string): number | null {
  // "Qty: 1.5" / "Quantity 1.5"
  let m = text.match(/qty\.?\s*[:\-]?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/quantity\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]);

  // "1.5 L" / "1.5Ltr" / "1.5 litre(s)"
  m = text.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)s?\b/i);
  if (m) return Number(m[1]);

  return null;
}

function parseRate(text: string): number | null {
  // "Rate: 62" / "Price @62" / "62/L" / "Rs 62 per litre"
  let m = text.match(/rate\s*[:\-]?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/price\s*[:\-]?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/@\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]);

  m = text.match(/(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*\/\s*l(?:tr|iter|itre)?\b/i);
  if (m) return Number(m[1]);

  return null;
}

function parseTotal(text: string): number | null {
  const m = text.match(/(?:grand\s*total|net\s*amt|net\s*amount|total\s*amount|total|amount)\s*[:\-]?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
  if (m) return Number(m[1]);
  return null;
}

function parseVendorName(text: string): string | null {
  // Heuristic: first non-empty line that looks like a name (letters, spaces,
  // no digits) is often the dairy/vendor name on a printed slip.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nameLine = lines.find((line) => /^[A-Za-z][A-Za-z .&'-]{2,40}$/.test(line));
  return nameLine ?? null;
}
