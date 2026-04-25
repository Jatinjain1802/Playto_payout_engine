import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRightLeft, AlertCircle, CheckCircle2, RefreshCcw, X, Building2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-border-bright bg-surface shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-dim bg-surface2/50 px-8 py-6">
          <div>
            <h3 className="font-head text-xl font-bold text-white">Merchant Transfer</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Inter-merchant ledger move</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface3 text-slate-400 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-primary-red/20 bg-primary-red/10 p-4 text-xs font-semibold text-primary-red animate-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success ? (
             <div className="space-y-4 py-6 text-center animate-in zoom-in-90">
              <div className="w-16 h-16 bg-primary-green/10 rounded-full flex items-center justify-center mx-auto border border-primary-green/20">
                <CheckCircle2 className="h-8 w-8 text-primary-green" />
              </div>
              <h4 className="font-head text-lg font-bold text-white">Transfer Successful</h4>
              <p className="text-xs text-slate-400">Funds have been moved atomically between ledgers.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Source */}
                <div className="p-5 rounded-2xl bg-surface2 border border-border-dim">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">From Source</p>
                  <p className="text-sm font-bold text-white truncate">{sourceMerchant.name}</p>
                  <p className="text-[10px] font-mono text-primary-green mt-1">Avail: ₹{(availableBalancePaise / 100).toLocaleString()}</p>
                </div>

                {/* Destination Select */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">To Destination</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <select
                      value={destinationMerchantId ?? ''}
                      onChange={(event) => {
                        setDestinationMerchantId(Number(event.target.value));
                        idempotencyKeyRef.current = crypto.randomUUID();
                      }}
                      className="w-full h-full bg-surface2 border border-border-dim rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold text-white outline-none transition-all focus:border-primary-blue focus:bg-surface3 appearance-none cursor-pointer"
                      required
                    >
                      {destinationCandidates.map((merchant) => (
                        <option key={merchant.id} value={merchant.id} className="bg-surface text-white">
                          {merchant.name} (MER_00{merchant.id})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 text-xs">▼</div>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Transfer Amount</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amountInr}
                    onChange={(event) => {
                      setAmountInr(event.target.value);
                      idempotencyKeyRef.current = crypto.randomUUID();
                    }}
                    placeholder="0.00"
                    className="w-full h-14 bg-surface2 border border-border-dim rounded-2xl pl-10 pr-4 text-lg font-mono font-bold text-white outline-none transition-all focus:border-primary-blue focus:bg-surface3 placeholder:text-slate-700"
                    required
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Reference Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    idempotencyKeyRef.current = crypto.randomUUID();
                  }}
                  placeholder="Split payment, fee reversal, etc."
                  className="w-full h-12 bg-surface2 border border-border-dim rounded-2xl px-4 text-xs font-semibold text-white outline-none transition-all focus:border-primary-blue focus:bg-surface3 placeholder:text-slate-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'flex w-full h-14 items-center justify-center gap-3 rounded-2xl bg-white text-bg text-sm font-bold transition-all shadow-lg shadow-white/5 hover:scale-[1.02] active:scale-[0.98]',
                  loading && 'cursor-not-allowed opacity-50 grayscale'
                )}
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ArrowRightLeft className="h-4 w-4" />
                    Execute Transfer
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
