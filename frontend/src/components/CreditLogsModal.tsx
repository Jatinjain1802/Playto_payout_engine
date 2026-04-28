import { X, Search, ArrowUpRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Transaction } from '../types';
import { formatPaiseToINR } from '../utils';

interface CreditLogsModalProps {
  transactions: Transaction[];
  onClose: () => void;
}

export function CreditLogsModal({ transactions, onClose }: CreditLogsModalProps) {
  const [search, setSearch] = useState('');

  // Filter only credit transactions
  const creditTransactions = useMemo(() => {
    return transactions.filter(t => t.direction === 'credit');
  }, [transactions]);

  const filteredCredits = useMemo(() => {
    return creditTransactions.filter((tx) => {
      const searchLower = search.toLowerCase();
      return (tx.reference_id && tx.reference_id.toLowerCase().includes(searchLower)) || 
             (tx.description && tx.description.toLowerCase().includes(searchLower)) ||
             (tx.amount_paise / 100).toString().includes(search) ||
             tx.reference_type.toLowerCase().includes(searchLower);
    });
  }, [creditTransactions, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/50 px-8 py-6">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-emerald-950">Credit Logs</h3>
            <p className="mt-1 text-sm text-emerald-800/70">View all incoming credits and their sources.</p>
          </div>
          <button 
            onClick={onClose} 
            className="rounded-full bg-white p-2 text-emerald-600 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100 hover:text-emerald-800"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 bg-white px-8 py-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by reference or amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>
          
          <div className="text-sm font-medium text-slate-500">
            Showing {filteredCredits.length} of {creditTransactions.length} credits
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-auto p-8 bg-slate-50/30">
          {filteredCredits.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredCredits.map((tx) => (
                <div 
                  key={tx.id} 
                  className="group relative flex flex-col gap-2 rounded-2xl border border-emerald-100/50 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="font-bold text-lg text-slate-900">+{formatPaiseToINR(tx.amount_paise)}</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      {tx.reference_type}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-emerald-100/50 pt-3">
                    <p className="text-sm font-medium text-slate-700 leading-snug">
                      {tx.description || 'Manual Admin Credit / System Transfer'}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString()}</p>
                      {tx.reference_id && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                          Ref: {tx.reference_id.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-slate-50 p-6">
                <Search className="h-10 w-10 text-slate-300" />
              </div>
              <h4 className="mt-4 text-lg font-bold text-slate-900">No credits found</h4>
              <p className="text-sm text-slate-500">Try adjusting your search.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-white px-8 py-4">
          <p className="text-center text-xs font-medium text-slate-400 italic">
            Total historical credits for this merchant.
          </p>
        </div>
      </div>
    </div>
  );
}
