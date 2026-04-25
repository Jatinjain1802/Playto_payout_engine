import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  History,
  LayoutDashboard,
  Plus,
  RefreshCcw,
  Send,
  User,
  XCircle,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { PayoutForm } from './components/PayoutForm';
import { TransferForm } from './components/TransferForm';
import { DashboardCharts } from './components/DashboardCharts';
import { payoutService } from './services/api';
import type { Merchant, MerchantBalance, Payout, Transaction } from './types';
import { cn, formatPaiseToINR } from './utils';

const AUTO_REFRESH_MS = 5000;

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

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.id === merchantId) ?? null,
    [merchants, merchantId]
  );

  const loadMerchants = useCallback(async () => {
    try {
      const merchantRows = await payoutService.getMerchants();
      setMerchants(merchantRows);
      if (merchantRows.length > 0 && !merchantId) {
        setMerchantId(merchantRows[0].id);
      }
    } catch (err) {
      console.error('Failed to load merchants', err);
    }
  }, [merchantId]);

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!merchantId) return;
      try {
        if (!silent) setLoading(true);
        const [balanceData, transactionRows, payoutRows] = await Promise.all([
          payoutService.getMerchantBalance(merchantId),
          payoutService.getMerchantTransactions(merchantId),
          payoutService.getMerchantPayouts(merchantId),
        ]);
        setBalance(balanceData);
        setTransactions(transactionRows);
        setPayouts(payoutRows);
        setError(null);
      } catch (err) {
        console.error('Fetch error', err);
        setError('Connection to backend lost.');
      } finally {
        setLoading(false);
      }
    },
    [merchantId]
  );

  useEffect(() => { loadMerchants(); }, [loadMerchants]);
  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    if (!merchantId) return;
    const timer = setInterval(() => fetchDashboard(true), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [merchantId, fetchDashboard]);

  return (
    <div className="flex h-screen bg-bg text-[#eef2ff] overflow-hidden selection:bg-primary-blue/30">
      
      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className="w-[280px] flex-shrink-0 bg-surface border-r border-border-dim flex flex-col">
        <div className="p-8 border-b border-border-dim">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-primary-blue shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            <h1 className="font-head text-2xl font-extrabold tracking-tighter">Playto</h1>
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.25em] mt-2">Payout Control Center</p>
        </div>

        {/* Merchant Card */}
        <div className="p-6">
          <div className="group relative bg-surface2 border border-border-bright rounded-2xl p-4 transition-all hover:border-primary-blue cursor-pointer overflow-hidden shadow-lg">
             <div className="flex items-center gap-3 relative z-10">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-blue to-primary-purple flex items-center justify-center font-head font-bold text-white shadow-lg">
                  {selectedMerchant?.name.substring(0, 2).toUpperCase() || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-white">{selectedMerchant?.name || 'Select Merchant'}</p>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">ID: MER_00{selectedMerchant?.id || '0'}</p>
                </div>
                <Building2 className="w-4 h-4 text-slate-600" />
             </div>
             <select 
               className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
               value={merchantId ?? ''}
               onChange={(e) => setMerchantId(Number(e.target.value))}
             >
               {merchants.map(m => <option key={m.id} value={m.id} className="bg-surface text-white">{m.name}</option>)}
             </select>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-2">
          <p className="px-4 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Main Menu</p>
          <NavItem icon={<LayoutDashboard size={18}/>} label="Insights Dashboard" active />
          <NavItem icon={<Send size={18}/>} label="Payout Requests" badge={payouts.filter(p => p.status === 'pending').length} />
          <NavItem icon={<History size={18}/>} label="Transaction History" />
          <NavItem icon={<Banknote size={18}/>} label="Beneficiaries" />
          
          <div className="pt-8">
            <p className="px-4 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Security & Ops</p>
            <NavItem icon={<ShieldCheck size={18}/>} label="Ledger Integrity" />
            <NavItem icon={<RefreshCcw size={18}/>} label="Audit Logs" />
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-border-dim bg-surface2/30">
           <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface2 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-surface3 flex items-center justify-center border border-border-bright group-hover:border-primary-blue transition-all">
                <User size={16} className="text-slate-400 group-hover:text-primary-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">System Admin</p>
                <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter">Production Access</p>
              </div>
           </div>
        </div>
      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        
        {/* Topbar */}
        <header className="h-[72px] border-b border-border-dim flex items-center justify-between px-10 bg-surface/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <h2 className="font-head text-xl font-black tracking-tight">Insights</h2>
            <div className="h-4 w-px bg-border-dim" />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-green/10 border border-primary-green/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-green animate-pulse-slow shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
              <span className="text-[10px] font-black text-primary-green uppercase tracking-[0.15em]">System Live</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden lg:flex items-center gap-2 mr-4 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                <Zap size={12} className="text-primary-amber" />
                <span>Idempotency Protected</span>
             </div>
             
             <button 
               onClick={() => fetchDashboard()}
               className="p-3 text-slate-400 hover:text-white hover:bg-surface2 rounded-2xl transition-all border border-transparent hover:border-border-bright"
               title="Manual Sync"
             >
               <RefreshCcw size={18} className={cn(loading && "animate-spin")} />
             </button>
             
             <div className="w-px h-8 bg-border-dim mx-2" />

             <button 
               onClick={() => setIsTransferModalOpen(true)}
               className="px-6 py-2.5 text-xs font-bold bg-surface2 border border-border-bright rounded-2xl hover:bg-surface3 transition-all hover:border-slate-500"
             >
               Internal Transfer
             </button>
             <button 
               onClick={() => setIsPayoutModalOpen(true)}
               className="px-6 py-2.5 text-xs font-bold bg-primary-blue text-white rounded-2xl shadow-[0_8px_20px_rgba(59,130,246,0.35)] hover:scale-[1.05] active:scale-[0.95] transition-all"
             >
               + Create Payout
             </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-10 space-y-10 scroll-smooth">
          
          {error && (
            <div className="p-5 bg-primary-red/10 border border-primary-red/20 rounded-[24px] text-primary-red text-sm font-bold flex items-center gap-4 animate-in slide-in-from-top-4">
              <div className="w-8 h-8 rounded-full bg-primary-red/20 flex items-center justify-center">
                <XCircle size={18} /> 
              </div>
              <div>
                <p>Gateway Connection Error</p>
                <p className="text-[10px] opacity-70 uppercase mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* STATS GRID */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              label="Total Ledger" 
              value={balance ? formatPaiseToINR(balance.available_balance_paise + balance.held_balance_paise) : 'INR 0.00'} 
              sub={balance ? `${(balance.available_balance_paise + balance.held_balance_paise).toLocaleString()} paise` : '0 paise'}
              color="blue"
              icon={<ArrowUpRight />}
            />
            <StatCard 
              label="Available" 
              value={balance ? formatPaiseToINR(balance.available_balance_paise) : 'INR 0.00'} 
              sub="▲ Clear for withdrawal"
              color="green"
              icon={<CheckCircle2 />}
            />
            <StatCard 
              label="Held (Transit)" 
              value={balance ? formatPaiseToINR(balance.held_balance_paise) : 'INR 0.00'} 
              sub={payouts.filter(p => p.status === 'processing' || p.status === 'pending').length + " active requests"}
              color="amber"
              icon={<Clock />}
            />
             <StatCard 
              label="Cumulative Processed" 
              value={balance ? formatPaiseToINR(balance.credits_total_paise) : 'INR 0.00'} 
              sub="All-time transaction volume"
              color="purple"
              icon={<ArrowDownLeft />}
            />
          </section>

          {/* CHARTS SECTION */}
          <DashboardCharts balance={balance} transactions={transactions} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            
            {/* PAYOUT TABLE */}
            <section className="lg:col-span-2 bg-surface border border-border-dim rounded-[40px] overflow-hidden flex flex-col shadow-2xl">
               <div className="p-8 border-b border-border-dim flex items-center justify-between">
                  <div>
                    <h3 className="font-head text-lg font-black text-white">Payout Journal</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Recent settlement activity</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-surface2 border border-border-dim rounded-xl text-[10px] font-mono text-slate-500">
                    <RefreshCcw size={10} className="animate-spin" />
                    <span>REFRESHING 5S</span>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-surface3/30 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                       <tr>
                         <th className="px-8 py-5">Payout Identifier</th>
                         <th className="px-8 py-5 text-right">Settlement Amount</th>
                         <th className="px-8 py-5 text-center">Status</th>
                         <th className="px-8 py-5">Timestamp</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim">
                       {payouts.length > 0 ? payouts.map(p => (
                         <tr key={p.id} className="hover:bg-white/[0.03] transition-all group">
                           <td className="px-8 py-5 font-mono text-xs text-slate-400 group-hover:text-primary-blue transition-colors">
                              <span className="opacity-30">#</span>{p.id.substring(0, 12)}
                           </td>
                           <td className="px-8 py-5 text-right font-mono font-black text-primary-red text-sm">
                             -{formatPaiseToINR(p.amount_paise)}
                           </td>
                           <td className="px-8 py-5 text-center">
                             <StatusBadge status={p.status} />
                           </td>
                           <td className="px-8 py-5 text-xs text-slate-500 font-semibold">{new Date(p.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                         </tr>
                       )) : (
                         <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">No activity in settlement journal.</td></tr>
                       )}
                    </tbody>
                 </table>
               </div>
               <div className="p-6 border-t border-border-dim bg-surface2/20 text-center">
                  <button className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                    Export Full Journal (CSV) →
                  </button>
               </div>
            </section>

            {/* LEDGER SIDEBAR */}
            <section className="bg-surface border border-border-dim rounded-[40px] p-8 shadow-2xl flex flex-col">
               <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="font-head text-lg font-black text-white">Live Ledger</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Real-time debit/credit</p>
                  </div>
                  <History size={18} className="text-slate-600" />
               </div>
               <div className="flex-1 space-y-6">
                  {transactions.slice(0, 7).map(t => (
                    <div key={t.id} className="flex items-center gap-5 group cursor-default">
                       <div className={cn(
                         "w-11 h-11 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 shadow-lg",
                         t.direction === 'credit' ? "bg-primary-green/10 text-primary-green border border-primary-green/20" : "bg-primary-red/10 text-primary-red border border-primary-red/20"
                       )}>
                         {t.direction === 'credit' ? <Plus size={18} /> : <ArrowUpRight size={18} />}
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="text-xs font-black text-white truncate group-hover:text-primary-blue transition-colors">{t.reference_type}</p>
                         <p className="text-[10px] text-slate-500 font-bold mt-0.5">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                       </div>
                       <div className="text-right">
                         <p className={cn(
                           "font-mono font-black text-sm",
                           t.direction === 'credit' ? "text-primary-green" : "text-white"
                         )}>
                           {t.direction === 'credit' ? '+' : '-'}{formatPaiseToINR(t.amount_paise)}
                         </p>
                         <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">Verified</p>
                       </div>
                    </div>
                  ))}
               </div>
               <button className="w-full mt-8 py-4 bg-surface2 hover:bg-surface3 border border-border-bright rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]">
                 Deep Audit Log →
               </button>
            </section>

          </div>

        </div>
      </main>

      {/* ═══════════════ MODALS ═══════════════ */}
      {isPayoutModalOpen && selectedMerchant && balance && (
        <PayoutForm
          merchantId={selectedMerchant.id}
          availableBalancePaise={balance.available_balance_paise}
          onSuccess={() => { fetchDashboard(true); setIsPayoutModalOpen(false); }}
          onClose={() => setIsPayoutModalOpen(false)}
        />
      )}

      {isTransferModalOpen && selectedMerchant && balance && (
        <TransferForm
          sourceMerchant={selectedMerchant}
          merchants={merchants}
          availableBalancePaise={balance.available_balance_paise}
          onSuccess={() => { fetchDashboard(true); setIsTransferModalOpen(false); }}
          onClose={() => setIsTransferModalOpen(false)}
        />
      )}
    </div>
  );
}

/* Helper Components for Leaner Code */

function NavItem({ icon, label, active = false, badge = 0 }: { icon: any, label: string, active?: boolean, badge?: number }) {
  return (
    <div className={cn(
      "flex items-center gap-4 px-5 py-3 rounded-2xl cursor-pointer transition-all border border-transparent",
      active ? "bg-primary-blue/10 text-primary-blue border-primary-blue/20" : "text-slate-400 hover:bg-surface2 hover:text-white"
    )}>
      <span className={cn("flex-shrink-0 transition-transform", active && "scale-110")}>{icon}</span>
      <span className="text-xs font-black tracking-tight flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-primary-blue text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse">
          {badge}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: { label: string, value: string, sub: string, color: string, icon: any }) {
  const colorMap: Record<string, string> = {
    blue: "from-primary-blue/20 to-transparent border-primary-blue/20",
    green: "from-primary-green/20 to-transparent border-primary-green/20",
    amber: "from-primary-amber/20 to-transparent border-primary-amber/20",
    purple: "from-primary-purple/20 to-transparent border-primary-purple/20",
  };
  
  const iconColorMap: Record<string, string> = {
    blue: "bg-primary-blue/10 text-primary-blue border-primary-blue/20",
    green: "bg-primary-green/10 text-primary-green border-primary-green/20",
    amber: "bg-primary-amber/10 text-primary-amber border-primary-amber/20",
    purple: "bg-primary-purple/10 text-primary-purple border-primary-purple/20",
  };

  return (
    <div className={cn("relative bg-surface border rounded-[32px] p-7 overflow-hidden transition-all hover:scale-[1.03] group shadow-2xl", colorMap[color])}>
      <div className={cn("absolute top-7 right-7 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-12 border shadow-lg", iconColorMap[color])}>
        {icon}
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">{label}</p>
      <p className="font-head text-3xl font-black tracking-tighter text-white">{value}</p>
      <div className="mt-4 flex items-center gap-2">
         <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
            {sub}
         </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-primary-green/10 text-primary-green border-primary-green/20",
    pending: "bg-primary-amber/10 text-primary-amber border-primary-amber/20",
    processing: "bg-primary-blue/10 text-primary-blue border-primary-blue/20",
    failed: "bg-primary-red/10 text-primary-red border-primary-red/20",
  };
  
  const dotStyles: Record<string, string> = {
    completed: "bg-primary-green shadow-[0_0_8px_rgba(34,197,94,0.5)]",
    pending: "bg-primary-amber animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]",
    processing: "bg-primary-blue animate-spin shadow-[0_0_8px_rgba(59,130,246,0.5)]",
    failed: "bg-primary-red shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  };

  return (
    <div className={cn("inline-flex items-center gap-3 px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.15em]", styles[status])}>
      <div className={cn("w-1.5 h-1.5 rounded-full", dotStyles[status])} />
      {status}
    </div>
  );
}

export default App;
