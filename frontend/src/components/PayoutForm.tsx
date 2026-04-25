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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-border-bright bg-surface shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-dim bg-surface2/50 px-8 py-6">
          <div>
            <h3 className="font-head text-xl font-bold text-white">New Payout</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Merchant ID: MER_00{merchantId}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface3 text-slate-400 hover:text-white transition-all">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {success ? (
            <div className="space-y-4 py-6 text-center animate-in zoom-in-90">
              <div className="w-16 h-16 bg-primary-green/10 rounded-full flex items-center justify-center mx-auto border border-primary-green/20">
                <CheckCircle2 className="h-8 w-8 text-primary-green" />
              </div>
              <h4 className="font-head text-lg font-bold text-white">Payout Initiated</h4>
              <p className="text-xs text-slate-400">Your funds are being processed and will update in the ledger shortly.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-primary-red/20 bg-primary-red/10 p-4 text-xs font-semibold text-primary-red animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Withdrawal Amount</label>
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
                <div className="flex justify-between px-1">
                  <p className="text-[10px] text-slate-500">Paise: {Math.round(parseFloat(amountInr || '0') * 100)}</p>
                  <p className="text-[10px] font-bold text-primary-green uppercase tracking-wider">Available: ₹{(availableBalancePaise / 100).toLocaleString()}</p>
                </div>
              </div>

              {/* Bank Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Destination Bank</label>
                <div className="relative">
                  <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <select
                    value={selectedBankId}
                    onChange={(event) => {
                      setSelectedBankId(Number(event.target.value));
                      idempotencyKeyRef.current = crypto.randomUUID();
                    }}
                    className="w-full h-14 bg-surface2 border border-border-dim rounded-2xl pl-11 pr-4 text-sm font-semibold text-white outline-none transition-all focus:border-primary-blue focus:bg-surface3 appearance-none cursor-pointer"
                    required
                  >
                    <option value="" disabled>Select a bank account</option>
                    {bankAccounts.map((bank) => (
                      <option key={bank.id} value={bank.id} className="bg-surface text-white">
                        {bank.account_number.slice(-4).padStart(8, '•')} — {bank.ifsc}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 text-xs">▼</div>
                </div>
              </div>

              <div className="p-4 bg-surface2 rounded-2xl border border-border-dim space-y-2">
                 <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-widest">
                    <span>Idempotency Key</span>
                    <RefreshCcw size={10} className="text-slate-700" />
                 </div>
                 <p className="font-mono text-[10px] text-slate-400 truncate">{idempotencyKeyRef.current}</p>
              </div>

              <button
                type="submit"
                disabled={loading || bankAccounts.length === 0}
                className={cn(
                  'flex w-full h-14 items-center justify-center gap-3 rounded-2xl bg-primary-blue text-sm font-bold text-white transition-all shadow-lg shadow-primary-blue/20 hover:scale-[1.02] active:scale-[0.98]',
                  (loading || bankAccounts.length === 0) && 'cursor-not-allowed opacity-50 grayscale'
                )}
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Confirm Payout Request
                  </>
                )}
              </button>
              {bankAccounts.length === 0 && (
                <p className="text-center text-[10px] text-primary-red font-bold uppercase tracking-wider">No bank accounts linked.</p>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
