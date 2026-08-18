export interface MilkBill {
  id: string;
  /** ISO date string (yyyy-MM-dd) — the date printed on / relevant to the bill */
  billDate: string;
  /** Whether this deposit was made in the morning or evening session */
  shift: 'Morning' | 'Evening';
  quantityLiters: number;
  ratePerLiter: number;
  totalAmount: number;
  /** Master record ID of the selected milk recipient */
  recipientId?: string;
  /** Fat % reading from a dairy collection-center slip */
  fatPercent?: number;
  /** SNF (solids-not-fat) % reading from a dairy collection-center slip */
  snfPercent?: number;
  notes?: string;
  /** hosted URL of the scanned/captured bill image (Supabase Storage) */
  imageUrl?: string;
  /** ISO timestamp of when this record was logged */
  createdAt: string;
}

/** `imageUrl` is excluded — the server derives it after uploading the selected file. */
export type MilkBillDraft = Omit<MilkBill, 'id' | 'createdAt' | 'imageUrl'>;
