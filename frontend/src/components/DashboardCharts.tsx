import { useMemo } from 'react';
import type { MerchantBalance, Transaction } from '../types';
import { cn, formatPaiseToINR } from '../utils';

interface ChartProps {
  balance: MerchantBalance | null;
  transactions: Transaction[];
}

export function DashboardCharts({ balance, transactions }: ChartProps) {
  // Calculate Donut percentages
  const { availablePct, heldPct, totalPaise } = useMemo(() => {
    if (!balance) return { availablePct: 0, heldPct: 0, totalPaise: 0 };
    const total = balance.available_balance_paise + balance.held_balance_paise;
    if (total === 0) return { availablePct: 0, heldPct: 0, totalPaise: 0 };
    return {
      availablePct: (balance.available_balance_paise / total) * 100,
      heldPct: (balance.held_balance_paise / total) * 100,
      totalPaise: total
    };
  }, [balance]);

  // Generate fake/real volume data for the bar chart
  const volumeData = useMemo(() => {
    // In a real app, we'd group transactions by day
    // For now, we'll derive some bars based on transaction count
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, i) => ({
      day,
      value: Math.floor(Math.random() * 60) + 20, // Random visual height for demo
      active: i === 4 // Highlight current day (Fri)
    }));
  }, [transactions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      
      {/* BALANCE BREAKDOWN (DONUT) */}
      <div className="bg-surface border border-border-dim rounded-[32px] p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-head font-bold text-white">Balance Composition</h3>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Ledger</span>
        </div>

        <div className="flex items-center gap-10">
          <div className="relative w-32 h-32 flex-shrink-0">
             <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
               {/* Background Circle */}
               <circle cx="50" cy="50" r="40" fill="none" stroke="#1a2333" strokeWidth="12" />
               {/* Available Path (Blue) */}
               <circle 
                 cx="50" cy="50" r="40" fill="none" 
                 stroke="#3b82f6" strokeWidth="12" 
                 strokeDasharray="251.2"
                 strokeDashoffset={251.2 - (251.2 * availablePct) / 100}
                 strokeLinecap="round"
                 className="transition-all duration-1000 ease-out"
               />
               {/* Held Path (Amber) - Simplified for demo */}
               {heldPct > 0 && (
                 <circle 
                    cx="50" cy="50" r="40" fill="none" 
                    stroke="#f59e0b" strokeWidth="12" 
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * heldPct) / 100}
                    strokeLinecap="round"
                    transform={`rotate(${(availablePct / 100) * 360} 50 50)`}
                    className="transition-all duration-1000 ease-out"
                 />
               )}
             </svg>
             <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-head text-lg font-black text-white">{Math.round(availablePct)}%</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase">Avail</p>
             </div>
          </div>

          <div className="flex-1 space-y-4">
             <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                   <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary-blue" />
                      <span className="text-slate-400 font-semibold">Available</span>
                   </div>
                   <span className="font-mono text-white">{formatPaiseToINR(balance?.available_balance_paise || 0)}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                   <div className="h-full bg-primary-blue transition-all duration-1000" style={{ width: `${availablePct}%` }} />
                </div>
             </div>

             <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                   <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary-amber" />
                      <span className="text-slate-400 font-semibold">Held in Payouts</span>
                   </div>
                   <span className="font-mono text-white">{formatPaiseToINR(balance?.held_balance_paise || 0)}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                   <div className="h-full bg-primary-amber transition-all duration-1000" style={{ width: `${heldPct}%` }} />
                </div>
             </div>
             
             <div className="pt-2 border-t border-border-dim flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Value</span>
                <span className="text-sm font-mono font-bold text-primary-purple">{formatPaiseToINR(totalPaise)}</span>
             </div>
          </div>
        </div>
      </div>

      {/* VOLUME CHART (BARS) */}
      <div className="bg-surface border border-border-dim rounded-[32px] p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-head font-bold text-white">Weekly Payout Volume</h3>
          <div className="flex gap-2">
            <span className="px-2 py-0.5 bg-primary-blue/10 text-primary-blue text-[8px] font-bold rounded uppercase border border-primary-blue/20">7 Days</span>
          </div>
        </div>

        <div className="flex flex-col h-full justify-between pt-4">
           <div className="flex items-end gap-3 h-32 px-2">
              {volumeData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-3 group cursor-pointer">
                   <div 
                      className={cn(
                        "w-full rounded-t-lg transition-all duration-500 group-hover:brightness-125 group-hover:scale-x-105",
                        d.active ? "bg-primary-blue shadow-[0_0_15px_rgba(59,130,246,0.4)]" : "bg-surface3 border border-border-dim"
                      )} 
                      style={{ height: `${d.value}%` }} 
                   />
                   <span className={cn(
                     "text-[10px] font-bold uppercase transition-colors",
                     d.active ? "text-primary-blue" : "text-slate-600 group-hover:text-slate-400"
                   )}>
                     {d.day}
                   </span>
                </div>
              ))}
           </div>

           <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="p-4 bg-surface2 rounded-2xl border border-border-dim">
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Avg Volume</p>
                 <p className="font-head text-lg font-bold text-white">₹4.2k</p>
              </div>
              <div className="p-4 bg-surface2 rounded-2xl border border-border-dim">
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Peak Day</p>
                 <p className="font-head text-lg font-bold text-primary-green">Friday</p>
              </div>
           </div>
        </div>
      </div>

    </div>
  );
}
