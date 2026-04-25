export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Merchant {
  id: number;
  name: string;
  email: string;
  cached_balance_paise: number;
}

export interface MerchantBalance {
  merchant_id: number;
  available_balance_paise: number;
  held_balance_paise: number;
  credits_total_paise: number;
  debits_total_paise: number;
}

export interface Payout {
  id: string;
  merchant_id: number;
  amount_paise: number;
  bank_account_id: string;
  status: PayoutStatus;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  failure_reason?: string;
}

export interface Transaction {
  id: number;
  merchant_id: number;
  amount_paise: number;
  direction: 'credit' | 'debit';
  reference_type: 'payment' | 'payout' | 'refund' | 'seed' | 'adjustment';
  reference_id: string;
  description: string;
  created_at: string;
}

export interface PayoutCreateRequest {
  merchant_id: number;
  amount_paise: number;
  bank_account_id: string;
}

export interface TransferCreateRequest {
  source_merchant_id: number;
  destination_merchant_id: number;
  amount_paise: number;
  note?: string;
}

export interface TransferResponse {
  reference_id: string;
  source_merchant_id: number;
  destination_merchant_id: number;
  amount_paise: number;
  source_available_balance_paise: number;
  destination_available_balance_paise: number;
  note: string;
  created_at: string;
}
