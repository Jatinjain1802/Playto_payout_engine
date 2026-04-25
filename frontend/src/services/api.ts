import axios from 'axios';
import type {
  Merchant,
  MerchantBalance,
  Payout,
  PayoutCreateRequest,
  Transaction,
  TransferCreateRequest,
  TransferResponse,
  BankAccount,
} from '../types';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const payoutService = {
  getMerchants: async () => {
    const response = await api.get<Merchant[]>('/merchants');
    return response.data;
  },

  getMerchantBalance: async (merchantId: number) => {
    const response = await api.get<MerchantBalance>(`/merchants/${merchantId}/balance`);
    return response.data;
  },

  getMerchantTransactions: async (merchantId: number) => {
    const response = await api.get<Transaction[]>(`/merchants/${merchantId}/transactions`);
    return response.data;
  },

  getMerchantPayouts: async (merchantId: number) => {
    const response = await api.get<Payout[]>(`/merchants/${merchantId}/payouts`);
    return response.data;
  },
  
  getMerchantBankAccounts: async (merchantId: number) => {
    const response = await api.get<BankAccount[]>(`/merchants/${merchantId}/bank-accounts`);
    return response.data;
  },

  createPayout: async (data: PayoutCreateRequest, idempotencyKey: string) => {
    const response = await api.post<Payout>('/payouts', data, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data;
  },

  createTransfer: async (data: TransferCreateRequest, idempotencyKey: string) => {
    const response = await api.post<TransferResponse>('/transfers', data, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data;
  },
};
