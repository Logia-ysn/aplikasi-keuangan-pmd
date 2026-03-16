import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { 
  Clock, 
  Printer,
  TrendingUp,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';

interface AgingProps {
  type: 'Customer' | 'Supplier';
}

const AgingAnalysis: React.FC<AgingProps> = ({ type }) => {
  const title = type === 'Customer' ? 'Aging Piutang' : 'Aging Hutang';
  const subtitle = type === 'Customer' ? 'Analisis saldo tak tertagih per pelanggan.' : 'Analisis kewajiban pembayaran per vendor.';
  const accentBg = type === 'Customer' ? 'bg-blue-600' : 'bg-rose-600';

  const { data: agingData, isLoading } = useQuery({
    queryKey: ['aging-report', type],
    queryFn: async () => {
      const response = await api.get('/reports/aging', {
        params: { type }
      });
      return response.data;
    }
  });

  const totals = (Array.isArray(agingData) ? agingData : [])?.reduce((acc: any, curr: any) => ({
    current: acc.current + curr.current,
    1: acc[1] + curr[1],
    31: acc[31] + curr[31],
    61: acc[61] + curr[61],
    91: acc[91] + curr[91],
    total: acc.total + curr.total,
  }), { current: 0, 1: 0, 31: 0, 61: 0, 91: 0, total: 0 });

  return (
    <div className="space-y-10 pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
           <div className={cn("p-5 rounded-[2rem] text-white shadow-2xl", accentBg)}>
              <Clock size={40} />
           </div>
           <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tightest">{title}</h1>
              <p className="text-slate-500 mt-2 font-medium">{subtitle}</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-bold shadow-sm hover:scale-105 transition-all active:scale-95" onClick={() => window.print()}>
            <Printer size={20} />
            <span>Cetak PDF</span>
          </button>
          <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm font-bold text-sm text-slate-600">
             <Calendar size={18} className="text-slate-400" />
             {format(new Date(), 'dd MMM yyyy')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Outstanding', value: totals?.total || 0, icon: TrendingUp, color: 'text-slate-900', sub: 'Semua saldo terhutang' },
          { label: 'Belum Jatuh Tempo', value: totals?.current || 0, icon: TrendingUp, color: 'text-emerald-500', sub: 'Tagihan aktif normal' },
          { label: 'Menunggak 31-90 Hari', value: (totals?.[31] || 0) + (totals?.[61] || 0), icon: AlertTriangle, color: 'text-amber-500', sub: 'Perlu follow-up segera' },
          { label: 'Kritis (>90 Hari)', value: totals?.[91] || 0, icon: AlertTriangle, color: 'text-rose-600', sub: 'Risiko gagal bayar tinggi' }
        ].map((metric, i) => (
          <div key={i} className="glass rounded-3xl p-6 border border-white/20 shadow-xl relative overflow-hidden group">
            <div className={cn("absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl opacity-10", metric.color.replace('text-', 'bg-'))} />
            <div className="flex items-center gap-3 mb-4">
              <metric.icon size={16} className={metric.color} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{metric.label}</p>
            </div>
            <h3 className={cn("text-2xl font-black tabular-nums", metric.color)}>{formatRupiah(metric.value)}</h3>
            <p className="text-[10px] text-slate-400 mt-2 font-bold">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-left py-6 px-8 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">Nama Mitra</th>
                <th className="text-right py-6 px-6 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">Belum JT</th>
                <th className="text-right py-6 px-6 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">1-30 Hari</th>
                <th className="text-right py-6 px-6 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">31-60 Hari</th>
                <th className="text-right py-6 px-6 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">61-90 Hari</th>
                <th className="text-right py-6 px-6 text-[11px] font-black uppercase tracking-[0.2em] opacity-80">{'>'}90 Hari</th>
                <th className="text-right py-6 px-8 text-[11px] font-black uppercase tracking-[0.2em] bg-white/10">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/30 backdrop-blur-md">
              {isLoading ? (
                <tr>
                   <td colSpan={7} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-4">
                         <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                         <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Menganalisis Umur {type === 'Customer' ? 'Piutang' : 'Hutang'}...</p>
                      </div>
                   </td>
                </tr>
              ) : agingData?.length === 0 ? (
                <tr>
                   <td colSpan={7} className="py-24 text-center text-slate-400 font-bold uppercase tracking-widest text-sm italic">
                      Tidak ada saldo outstanding saat ini.
                   </td>
                </tr>
              ) : (
                agingData?.map((row: any) => (
                  <tr key={row.name} className="hover:bg-white/50 transition-all group">
                    <td className="py-5 px-8">
                       <div className="flex items-center gap-3">
                          <div className={cn("w-1.5 h-6 rounded-full group-hover:h-8 transition-all", row[91] > 0 ? "bg-rose-500" : (row[31] > 0 || row[61] > 0) ? "bg-amber-400" : "bg-emerald-400")}></div>
                          <span className="font-black text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors uppercase">{row.name}</span>
                       </div>
                    </td>
                    <td className="py-5 px-6 text-right tabular-nums text-sm font-bold text-slate-600">{formatRupiah(row.current)}</td>
                    <td className="py-5 px-6 text-right tabular-nums text-sm font-bold text-slate-600">{formatRupiah(row[1])}</td>
                    <td className="py-5 px-6 text-right tabular-nums text-sm font-black text-amber-600 ring-inset group-hover:bg-amber-50 transition-colors">{formatRupiah(row[31])}</td>
                    <td className="py-5 px-6 text-right tabular-nums text-sm font-black text-orange-600 group-hover:bg-orange-50 transition-colors">{formatRupiah(row[61])}</td>
                    <td className="py-5 px-6 text-right tabular-nums text-sm font-black text-rose-600 bg-rose-50/20 group-hover:bg-rose-50 transition-all">{formatRupiah(row[91])}</td>
                    <td className="py-5 px-8 text-right tabular-nums text-md font-black text-slate-900 bg-slate-100/30 group-hover:bg-slate-100/50 transition-colors">{formatRupiah(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-50/80 border-t-4 border-slate-900 shadow-inner backdrop-blur-xl">
              <tr className="text-slate-900">
                <td className="py-6 px-8 font-black uppercase tracking-widest">Total Kolektibilitas</td>
                <td className="py-6 px-6 text-right font-black tabular-nums">{formatRupiah(totals?.current || 0)}</td>
                <td className="py-6 px-6 text-right font-black tabular-nums">{formatRupiah(totals?.[1] || 0)}</td>
                <td className="py-6 px-6 text-right font-black tabular-nums text-amber-700">{formatRupiah(totals?.[31] || 0)}</td>
                <td className="py-6 px-6 text-right font-black tabular-nums text-orange-700">{formatRupiah(totals?.[61] || 0)}</td>
                <td className="py-6 px-6 text-right font-black tabular-nums text-rose-700">{formatRupiah(totals?.[91] || 0)}</td>
                <td className="py-6 px-8 text-right font-black tabular-nums text-2xl tracking-tighter bg-slate-900 text-white rounded-br-[2rem]">{formatRupiah(totals?.total || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 glass p-8 rounded-[2rem] border border-white/20 shadow-xl flex items-center gap-8 relative overflow-hidden group">
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-blue-500/5 to-transparent"></div>
          <div className="p-6 bg-blue-600 text-white rounded-3xl shadow-lg group-hover:scale-110 transition-transform"><TrendingUp size={32} /></div>
          <div>
            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Ringkasan Kolektibilitas</h4>
            <div className="mt-2 flex items-center gap-4">
               <div className="text-4xl font-black text-blue-600 tabular-nums">
                  {Math.round((totals?.current / (totals?.total || 1)) * 100 || 0)}%
               </div>
               <div className="flex-1 max-w-[200px] h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(totals?.current / (totals?.total || 1)) * 100 || 0}%` }}></div>
               </div>
               <p className="text-xs font-bold text-slate-500 max-w-[200px]">
                  Saldo masih berada dalam batas waktu pembayaran normal (Belum Jatuh Tempo).
               </p>
            </div>
          </div>
        </div>

        {totals?.[91] > 0 && (
          <div className="flex-1 glass p-8 rounded-[2rem] border border-rose-200 bg-rose-50/30 shadow-xl flex items-center gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="p-6 bg-rose-600 text-white rounded-3xl shadow-lg animate-pulse"><AlertTriangle size={32} /></div>
             <div>
                <h4 className="text-lg font-black text-rose-900 uppercase tracking-tighter">Peringatan Risiko Tinggi</h4>
                <p className="text-sm font-bold text-rose-700 mt-2 leading-relaxed">
                   Terdapat tagihan kritis yang menunggak lebih dari 90 hari. Mohon lakukan tindakan restrukturisasi atau penagihan intensif.
                </p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgingAnalysis;
