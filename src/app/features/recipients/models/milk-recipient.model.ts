export interface MilkRecipient {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
  createdAt?: string;
}

export type MilkRecipientDraft = Omit<MilkRecipient, 'id' | 'createdAt'>;
