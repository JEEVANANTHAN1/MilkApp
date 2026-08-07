export interface MilkBill {
  id: string;
  /** ISO date string (yyyy-MM-dd) — the date printed on / relevant to the bill */
  billDate: string;
  /** Whether this deposit was made in the morning or evening session */
  shift: 'Morning' | 'Evening';
  quantityLiters: number;
  ratePerLiter: number;
  totalAmount: number;
  /** Name of the dairy/collection center printed on the slip (e.g. "RADHA MILK DAIRY") */
  vendorName?: string;
  /** Fat % reading from a dairy collection-center slip */
  fatPercent?: number;
  /** SNF (solids-not-fat) % reading from a dairy collection-center slip */
  snfPercent?: number;
  /** Member/farmer code printed on the slip (e.g. "031 CM") */
  memberCode?: string;
  /** Member/farmer name printed on the slip */
  memberName?: string;
  notes?: string;
  /** hosted URL of the scanned/captured bill image (Supabase Storage) */
  imageUrl?: string;
  /** ISO timestamp of when this record was logged */
  createdAt: string;
}

/** `imageUrl` is excluded — the server derives it after uploading the selected file. */
export type MilkBillDraft = Omit<MilkBill, 'id' | 'createdAt' | 'imageUrl'>;
