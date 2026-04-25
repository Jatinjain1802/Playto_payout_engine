import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRightLeft, AlertCircle, CheckCircle2, RefreshCcw, X } from 'lucide-react';
import { payoutService } from '../services/api';
import type { Merchant } from '../types';
import { cn } from '../utils';

interface TransferFormProps {
  sourceMerchant: Merchant;
  merchants: Merchant[];
  availableBalancePaise: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function TransferForm({
  sourceMerchant,
  merchants,
  availableBalancePaise,
  onSuccess,
  onClose,
}: TransferFormProps) {
  const destinationCandidates = useMemo(
    () => merchants.filter((merchant) => merchant.id !== sourceMerchant.id),
    [merchants, sourceMerchant.id]
  );
  const [destinationMerchantId, setDestinationMerchantId] = useState<number | null>(
    destinationCandidates[0]?.id ?? null
  );
  const [amountInr, setAmountInr] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setDestinationMerchantId(destinationCandidates[0]?.id ?? null);
  }, [destinationCandidates]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!destinationMerchantId) {
      setError('No destination merchant available.');
      return;
    }

    const amountPaise = Math.round(parseFloat(amountInr) * 100);
    if (Number.isNaN(amountPaise) || amountPaise <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (amountPaise > availableBalancePaise) {
      setError('Source merchant does not have enough available balance.');
      return;
    }

    try {
      setLoading(true);
      await payoutService.createTransfer(
        {
          source_merchant_id: sourceMerchant.id,
          destination_merchant_id: destinationMerchantId,
          amount_paise: amountPaise,
          note,
        },
        idempotencyKeyRef.current
      );
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (transferError: unknown) {
      if (axios.isAxiosError<{ detail?: string }>(transferError)) {
        setError(transferError.response?.data?.detail || 'Transfer failed. Try again.');
      } else {
        setError('Transfer failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-5">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-900">Transfer Between Merchants</h3>
            <p className="mt-1 text-sm text-slate-500">Move funds from one merchant ledger to another safely.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success ? (
            <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h4 className="text-xl font-bold text-emerald-900">Transfer submitted</h4>
              <p className="text-sm text-emerald-700">Both ledgers have been updated atomically.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">From</p>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    #{sourceMerchant.id} - {sourceMerchant.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Available: INR {(availableBalancePaise / 100).toFixed(2)}</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">To merchant</label>
                  <select
                    value={destinationMerchantId ?? ''}
                    onChange={(event) => {
                      setDestinationMerchantId(Number(event.target.value));
                      idempotencyKeyRef.current = crypto.randomUUID();
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    required
                  >
                    {destinationCandidates.map((merchant) => (
                      <option key={merchant.id} value={merchant.id}>
                        #{merchant.id} - {merchant.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Amount (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountInr}
                  onChange={(event) => {
                    setAmountInr(event.target.value);
                    idempotencyKeyRef.current = crypto.randomUUID();
                  }}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    idempotencyKeyRef.current = crypto.randomUUID();
                  }}
                  placeholder="Invoice split, correction, vendor payout..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-base font-bold text-white transition hover:bg-slate-800',
                  loading && 'cursor-not-allowed opacity-70'
                )}
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ArrowRightLeft className="h-5 w-5" />
                    Transfer Funds
                  </>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
