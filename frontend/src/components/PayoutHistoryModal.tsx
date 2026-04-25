import { X, Clock, CheckCircle2, XCircle, Search, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Payout } from '../types';
import { formatPaiseToINR, cn } from '../utils';

interface PayoutHistoryModalProps {
  payouts: Payout[];
  onClose: () => void;
}

export function PayoutHistoryModal({ payouts, onClose }: PayoutHistoryModalProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredPayouts = useMemo(() => {
    return payouts.filter((payout) => {
      const matchesSearch = payout.id.toString().includes(search) || 
                           (payout.amount_paise / 100).toString().includes(search);
      const matchesStatus = statusFilter === 'all' || payout.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [payouts, search, statusFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-8 py-6">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-900">Complete Payout History</h3>
            <p className="mt-1 text-sm text-slate-500">View and filter all payout requests for this merchant.</p>
          </div>
          <button 
            onClick={onClose} 
            className="rounded-full bg-white p-2 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-800"
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
              placeholder="Search by ID or amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-900/5 transition"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          
          <div className="text-sm font-medium text-slate-500">
            Showing {filteredPayouts.length} of {payouts.length} payouts
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-auto p-8">
          {filteredPayouts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredPayouts.map((payout) => (
                <div 
                  key={payout.id} 
                  className="group relative flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "rounded-full p-2.5",
                      payout.status === 'completed' && "bg-emerald-50 text-emerald-600",
                      payout.status === 'failed' && "bg-rose-50 text-rose-600",
                      (payout.status === 'pending' || payout.status === 'processing') && "bg-amber-50 text-amber-600"
                    )}>
                      {payout.status === 'completed' && <CheckCircle2 className="h-5 w-5" />}
                      {payout.status === 'failed' && <XCircle className="h-5 w-5" />}
                      {(payout.status === 'pending' || payout.status === 'processing') && <Clock className="h-5 w-5 animate-pulse" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{formatPaiseToINR(payout.amount_paise)}</span>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                          payout.status === 'completed' && "bg-emerald-100 text-emerald-700",
                          payout.status === 'failed' && "bg-rose-100 text-rose-700",
                          (payout.status === 'pending' || payout.status === 'processing') && "bg-amber-100 text-amber-700"
                        )}>
                          {payout.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">ID: #{payout.id} • {new Date(payout.created_at).toLocaleString()}</p>
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
              <h4 className="mt-4 text-lg font-bold text-slate-900">No payouts found</h4>
              <p className="text-sm text-slate-500">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-8 py-4">
          <p className="text-center text-xs font-medium text-slate-400 italic">
            Financial records are updated in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}
