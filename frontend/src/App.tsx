import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BanknoteArrowDown,
  Building2,
  CheckCircle2,
  Clock,
  History,
  RefreshCcw,
  Send,
  Wallet,
  XCircle,
  Eye,
} from 'lucide-react';
import { PayoutForm } from './components/PayoutForm';
import { TransferForm } from './components/TransferForm';
import { PayoutHistoryModal } from './components/PayoutHistoryModal';
import { CreditLogsModal } from './components/CreditLogsModal';
import { payoutService } from './services/api';
import type { Merchant, MerchantBalance, Payout, Transaction } from './types';
import { cn, formatPaiseToINR } from './utils';

const AUTO_REFRESH_MS = 3000;

function App() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [balance, setBalance] = useState<MerchantBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCreditLogsModalOpen, setIsCreditLogsModalOpen] = useState(false);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === merchantId) ?? null,
    [merchants, merchantId]
  );

  const recentPayouts = useMemo(() => payouts.slice(0, 7), [payouts]);

  const loadMerchants = useCallback(async () => {
    const merchantRows = await payoutService.getMerchants();
    setMerchants(merchantRows);
    if (merchantRows.length === 0) {
      setMerchantId(null);
      return;
    }

    setMerchantId((currentMerchantId) => {
      if (currentMerchantId && merchantRows.some((row) => row.id === currentMerchantId)) {
        return currentMerchantId;
      }
      return merchantRows[0].id;
    });
  }, []);

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!merchantId) {
        return;
      }

      try {
        if (!silent) {
          setLoading(true);
        }
        const [balanceData, transactionRows, payoutRows] = await Promise.all([
          payoutService.getMerchantBalance(merchantId),
          payoutService.getMerchantTransactions(merchantId),
          payoutService.getMerchantPayouts(merchantId),
        ]);

        setBalance(balanceData);
        setTransactions(transactionRows);
        setPayouts(payoutRows);
        setError(null);
      } catch (fetchError) {
        console.error('Failed to fetch dashboard:', fetchError);
        setError('Unable to fetch merchant data. Check backend/API status.');
      } finally {
        setLoading(false);
      }
    },
    [merchantId]
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadMerchants();
      await fetchDashboard(true);
    } finally {
      setLoading(false);
    }
  }, [fetchDashboard, loadMerchants]);

  useEffect(() => {
    void loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    void fetchDashboard(true);
  }, [fetchDashboard]);

  useEffect(() => {
    if (!merchantId) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchDashboard(true);
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [merchantId, fetchDashboard]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0,#f8fafc_35%,#f8fafc_100%)] text-slate-900">
      <nav className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2 text-white shadow-lg shadow-slate-200">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Playto</p>
              <h1 className="text-xl font-black tracking-tight text-slate-900">Payout Control Center</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Building2 className="h-4 w-4 text-slate-500" />
              <select
                value={merchantId ?? ''}
                onChange={(event) => setMerchantId(Number(event.target.value))}
                className="bg-transparent text-sm font-semibold outline-none"
              >
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    #{merchant.id} - {merchant.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => void refreshAll()}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:bg-slate-100"
              title="Refresh dashboard"
            >
              <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-200/50 backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Selected merchant</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                {selectedMerchant ? selectedMerchant.name : 'No merchant selected'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Live updates every {AUTO_REFRESH_MS / 1000}s for payouts and ledger.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setIsTransferModalOpen(true)}
                disabled={!selectedMerchant || !balance}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BanknoteArrowDown className="h-4 w-4" />
                Transfer Funds
              </button>
              <button
                onClick={() => setIsPayoutModalOpen(true)}
                disabled={!selectedMerchant || !balance}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Request Payout
              </button>
            </div>
          </div>
        </section>

        {error && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </section>
        )}

        <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-100 bg-linear-to-br from-emerald-50/50 to-white p-6 shadow-sm ring-1 ring-emerald-100/50">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-800/60">Available Balance</p>
              <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-4xl font-black tracking-tighter text-emerald-900">
              {balance ? formatPaiseToINR(balance.available_balance_paise) : 'INR 0.00'}
            </p>
          </article>

          <article className="rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50/50 to-white p-6 shadow-sm ring-1 ring-amber-100/50">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-amber-800/60">Held in Payouts</p>
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <p className="text-4xl font-black tracking-tighter text-amber-900">
              {balance ? formatPaiseToINR(balance.held_balance_paise) : 'INR 0.00'}
            </p>
          </article>

          <article className="rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50/50 to-white p-6 shadow-sm ring-1 ring-sky-100/50">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-sky-800/60">Total Credits</p>
              <ArrowUpRight className="h-5 w-5 text-sky-600" />
            </div>
            <p className="text-4xl font-black tracking-tighter text-sky-900">
              {balance ? formatPaiseToINR(balance.credits_total_paise) : 'INR 0.00'}
            </p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-900">Ledger Transactions</h3>
              </div>
              
              {balance && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 border border-rose-100 ring-1 ring-rose-500/10">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Total Debit</span>
                    <span className="text-sm font-black text-rose-700">{formatPaiseToINR(balance.debits_total_paise)}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 pl-3 pr-1 py-1 border border-emerald-100 ring-1 ring-emerald-500/10">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Credit</span>
                    <span className="text-sm font-black text-emerald-700">{formatPaiseToINR(balance.credits_total_paise)}</span>
                    <button
                      onClick={() => setIsCreditLogsModalOpen(true)}
                      className="ml-1 rounded-full p-1 text-emerald-600 hover:bg-emerald-200 hover:text-emerald-800 transition shadow-sm"
                      title="View Past Credit Logs"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </header>
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Type</th>
                    <th className="px-6 py-3 font-semibold">Reference</th>
                    <th className="px-6 py-3 font-semibold">Amount</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length > 0 ? (
                    transactions.map((transaction) => (
                      <tr key={transaction.id} className="group border-t border-slate-50 transition-colors hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                              transaction.direction === 'credit' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                            )}>
                              {transaction.reference_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                            <span>{transaction.reference_id ? `${transaction.reference_id.slice(0, 8)}...` : 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'font-bold tracking-tight',
                              transaction.direction === 'credit' ? 'text-emerald-600' : 'text-slate-900'
                            )}
                          >
                            {transaction.direction === 'credit' ? '+' : '-'} {formatPaiseToINR(transaction.amount_paise)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-400">
                          {new Date(transaction.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-900">Recent Payouts</h3>
              </div>
              {payouts.length > 7 && (
                <button
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition"
                >
                  Show All
                </button>
              )}
            </header>
            <div className="space-y-3 p-5">
              {recentPayouts.length > 0 ? (
                recentPayouts.map((payout) => (
                  <div key={payout.id} className="group relative rounded-xl border border-slate-100 bg-white p-3.5 transition-all hover:border-slate-200 hover:shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "rounded-lg p-2",
                          payout.status === 'completed' && "bg-emerald-50 text-emerald-600",
                          payout.status === 'failed' && "bg-rose-50 text-rose-600",
                          (payout.status === 'pending' || payout.status === 'processing') && "bg-amber-50 text-amber-600"
                        )}>
                          {payout.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
                          {payout.status === 'failed' && <XCircle className="h-4 w-4" />}
                          {(payout.status === 'pending' || payout.status === 'processing') && <Clock className="h-4 w-4 animate-pulse" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold tracking-tight text-slate-900">{formatPaiseToINR(payout.amount_paise)}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{payout.status}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400">
                        {new Date(payout.created_at).toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No payout history yet.</p>
              )}
            </div>
          </div>
        </section>
      </main>

      {isPayoutModalOpen && selectedMerchant && balance && (
        <PayoutForm
          merchantId={selectedMerchant.id}
          availableBalancePaise={balance.available_balance_paise}
          onSuccess={() => void refreshAll()}
          onClose={() => setIsPayoutModalOpen(false)}
        />
      )}

      {isTransferModalOpen && selectedMerchant && balance && (
        <TransferForm
          sourceMerchant={selectedMerchant}
          merchants={merchants}
          availableBalancePaise={balance.available_balance_paise}
          onSuccess={() => void refreshAll()}
          onClose={() => setIsTransferModalOpen(false)}
        />
      )}

      {isHistoryModalOpen && (
        <PayoutHistoryModal payouts={payouts} onClose={() => setIsHistoryModalOpen(false)} />
      )}

      {isCreditLogsModalOpen && (
        <CreditLogsModal transactions={transactions} onClose={() => setIsCreditLogsModalOpen(false)} />
      )}
    </div>
  );
}

export default App;
