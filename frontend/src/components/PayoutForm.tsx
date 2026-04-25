import { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, RefreshCcw, Send, X, Landmark } from 'lucide-react';
import { payoutService } from '../services/api';
import { cn } from '../utils';
import type { BankAccount } from '../types';

interface PayoutFormProps {
  merchantId: number;
  availableBalancePaise: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function PayoutForm({ merchantId, availableBalancePaise, onSuccess, onClose }: PayoutFormProps) {
  const [amountInr, setAmountInr] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const loadBanks = async () => {
      try {
        const banks = await payoutService.getMerchantBankAccounts(merchantId);
        setBankAccounts(banks);
        if (banks.length > 0) {
          const primary = banks.find(b => b.is_primary) || banks[0];
          setSelectedBankId(primary.id);
        }
      } catch (err) {
        console.error('Failed to load bank accounts:', err);
      }
    };
    loadBanks();
  }, [merchantId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amountPaise = Math.round(parseFloat(amountInr) * 100);
    if (Number.isNaN(amountPaise) || amountPaise <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (amountPaise > availableBalancePaise) {
      setError('Insufficient balance.');
      return;
    }
    if (!selectedBankId) {
      setError('Please select a bank account.');
      return;
    }

    try {
      setLoading(true);
      await payoutService.createPayout(
        {
          merchant_id: merchantId,
          amount_paise: amountPaise,
          bank_account_id: Number(selectedBankId),
        },
        idempotencyKeyRef.current
      );

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (requestError: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(requestError)) {
        setError(requestError.response?.data?.detail || 'Failed to process payout. Please try again.');
      } else {
        setError('Failed to process payout. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-900">Request Payout</h3>
            <p className="mt-1 text-sm text-slate-500">Merchant #{merchantId}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {success ? (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h4 className="text-xl font-bold text-emerald-900">Payout requested</h4>
              <p className="text-sm text-emerald-700">Status will update automatically on the dashboard.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Withdrawal Amount (INR)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-slate-400">INR</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amountInr}
                    onChange={(event) => {
                      setAmountInr(event.target.value);
                      idempotencyKeyRef.current = crypto.randomUUID();
                    }}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-14 pr-4 text-lg font-semibold outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">Available: INR {(availableBalancePaise / 100).toFixed(2)}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Select Bank Account</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <select
                    value={selectedBankId}
                    onChange={(event) => {
                      setSelectedBankId(Number(event.target.value));
                      idempotencyKeyRef.current = crypto.randomUUID();
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 appearance-none"
                    required
                  >
                    <option value="" disabled>Select a bank account</option>
                    {bankAccounts.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.account_number} ({bank.ifsc}) {bank.is_primary ? '• Primary' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || bankAccounts.length === 0}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-base font-bold text-white transition hover:bg-slate-800',
                  (loading || bankAccounts.length === 0) && 'cursor-not-allowed opacity-70'
                )}
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Process Withdrawal
                  </>
                )}
              </button>
              {bankAccounts.length === 0 && (
                <p className="text-center text-xs text-rose-500 font-semibold">No bank accounts found for this merchant.</p>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
