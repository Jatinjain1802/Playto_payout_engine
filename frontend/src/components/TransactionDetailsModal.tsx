import { X, ArrowDownRight, ArrowUpRight, Building2, Landmark, Info } from 'lucide-react';
import type { Transaction, Payout, BankAccount } from '../types';
import { formatPaiseToINR, cn } from '../utils';

interface TransactionDetailsModalProps {
  transaction: Transaction;
  payouts: Payout[];
  bankAccounts: BankAccount[];
  onClose: () => void;
}

export function TransactionDetailsModal({ transaction, payouts, bankAccounts, onClose }: TransactionDetailsModalProps) {
  // Find related payout if any
  const relatedPayout = transaction.reference_id 
    ? payouts.find(p => p.id === transaction.reference_id) 
    : null;

  // Find bank account if related payout exists
  const targetBankAccount = relatedPayout 
    ? bankAccounts.find(b => b.id === relatedPayout.bank_account_id)
    : null;

  const isCredit = transaction.direction === 'credit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "rounded-full p-2 ring-1",
              isCredit ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-rose-50 text-rose-600 ring-rose-100"
            )}>
              {isCredit ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-slate-900">Transaction Details</h3>
              <p className="text-xs text-slate-500">{new Date(transaction.created_at).toLocaleString()}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl ring-1 ring-slate-100">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Amount</span>
            <span className={cn(
              "text-4xl font-black tracking-tighter",
              isCredit ? "text-emerald-600" : "text-rose-600"
            )}>
              {isCredit ? '+' : '-'}{formatPaiseToINR(transaction.amount_paise)}
            </span>
            <span className={cn(
              "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
              isCredit ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            )}>
              {transaction.reference_type}
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-500">
                <Info className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</p>
                <p className="mt-1 text-sm font-medium text-slate-900 leading-snug">
                  {transaction.description || 'System / Manual Transaction'}
                </p>
                {transaction.reference_id && (
                  <p className="mt-1 text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-100">
                    Ref: {transaction.reference_id}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-500">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Source / Origin</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {isCredit ? (transaction.description.includes('Admin') ? 'Admin Topup' : 'Playto Platform / Transfer') : 'Merchant Account'}
                </p>
              </div>
            </div>

            {relatedPayout && targetBankAccount && (
              <div className="flex items-start gap-4">
                <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-500">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Transferred To Bank Account</p>
                  <div className="mt-1 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <p className="text-sm font-bold text-slate-900">A/C: {targetBankAccount.account_number}</p>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">IFSC: {targetBankAccount.ifsc}</p>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mt-2 tracking-wider">
                      Payout Status: <span className={cn(
                        relatedPayout.status === 'completed' && "text-emerald-600",
                        relatedPayout.status === 'failed' && "text-rose-600",
                        (relatedPayout.status === 'pending' || relatedPayout.status === 'processing') && "text-amber-600"
                      )}>{relatedPayout.status}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
