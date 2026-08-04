export interface MilkBill {
  id: string;
  /** ISO date string (yyyy-MM-dd) — the date printed on / relevant to the bill */
  billDate: string;
  quantityLiters: number;
  ratePerLiter: number;
  totalAmount: number;
  vendorName?: string;
  notes?: string;
  /** base64 data URL of the scanned/captured bill image */
  imageDataUrl: string;
  /** ISO timestamp of when this record was logged */
  createdAt: string;
}

export type MilkBillDraft = Omit<MilkBill, 'id' | 'createdAt'>;
