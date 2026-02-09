
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { ArrowUpRight, AlertTriangle, TrendingUp, Package, Clock, Activity, Calendar, TrendingDown, Minus } from 'lucide-react';
import { Medicine, Sale, AdminBooking } from '../types';

interface OverviewProps {
  inventory: Medicine[];
  sales: Sale[];
  bookings: AdminBooking[];
  onNavigate: (view: any) => void;
}

const Overview: React.FC<OverviewProps> = ({ inventory, sales, bookings, onNavigate }) => {
  // Helper to ensure strict YYYY-MM-DD string matching
  const getStandardDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  // 1. Calculate Real Chart Data (Last 7 Days)
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = getStandardDate(d);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        
        // Sum sales for this specific date string (which matches what AdminDashboard produces)
        const dayTotal = sales
            .filter(s => s.date === dateStr)
            .reduce((sum, s) => sum + s.total, 0);

        data.push({
            name: dayName,
            fullDate: dateStr,
            sales: dayTotal
        });
    }
    return data;
  }, [sales]);

  // 2. Calculate Real Statistics
  const today = new Date();
  const todayDateStr = getStandardDate(today);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDateStr = getStandardDate(yesterday);

  const todaySalesTotal = sales
    .filter(s => s.date === todayDateStr)
    .reduce((sum, s) => sum + s.total, 0);
  
  const yesterdaySalesTotal = sales
    .filter(s => s.date === yesterdayDateStr)
    .reduce((sum, s) => sum + s.total, 0);

  // Trend Calculation
  let trendText = "No data available";
  let trendIcon = Minus;
  let trendColor = "slate";

  if (yesterdaySalesTotal > 0) {
      const growth = ((todaySalesTotal - yesterdaySalesTotal) / yesterdaySalesTotal) * 100;
      trendText = `${growth > 0 ? '+' : ''}${growth.toFixed(1)}% from yesterday`;
      trendIcon = growth >= 0 ? TrendingUp : TrendingDown;
      trendColor = growth >= 0 ? "emerald" : "red";
  } else if (todaySalesTotal > 0) {
      trendText = "First sales today!";
      trendIcon = TrendingUp;
      trendColor = "emerald";
  } else {
      trendText = "No sales yesterday";
      trendIcon = Minus;
      trendColor = "slate";
  }

  const inventoryValue = inventory.reduce((sum, item) => sum + ((item.stock || 0) * (item.sellingPrice || 0)), 0);
  const lowStockCount = inventory.filter(item => (item.stock || 0) < 10).length;
  const pendingOrders = bookings.filter(b => b.status === 'Pending').length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Overview</h2>
          <p className="text-slate-500 mt-2 font-medium">Welcome back! Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 bg-white px-3 py-2 rounded-lg border border-slate-200 flex items-center shadow-sm">
                <Calendar className="w-3.5 h-3.5 mr-2 text-slate-500" />
                {today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <button 
                onClick={() => onNavigate('billing')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center"
            >
                <TrendingUp className="w-4 h-4 mr-2" /> New Sale
            </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
            title="Today's Sales" 
            value={`₹${todaySalesTotal.toLocaleString()}`} 
            icon={TrendingUp} 
            color="emerald" 
            trend={trendText}
            TrendIcon={trendIcon}
            trendColor={trendColor}
        />
        <StatCard 
            title="Pending Orders" 
            value={pendingOrders.toString()} 
            icon={Clock} 
            color="blue" 
            subtext="Requires attention"
            isWarning={pendingOrders > 0}
        />
        <StatCard 
            title="Inventory Value" 
            value={`₹${(inventoryValue / 1000).toFixed(1)}k`} 
            icon={Package} 
            color="indigo" 
        />
        <StatCard 
            title="Low Stock Items" 
            value={lowStockCount.toString()} 
            icon={AlertTriangle} 
            color="amber" 
            isWarning={lowStockCount > 0} 
            subtext="Reorder soon"
        />
      </div>

      {/* Charts & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_20px_-12px_rgba(0,0,0,0.08)]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-lg text-slate-800">Revenue Analytics</h3>
            <select className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg px-3 py-2 outline-none">
                <option>Last 7 Days</option>
            </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                    dy={10} 
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                    tickFormatter={(value) => `₹${value}`}
                />
                <Tooltip 
                  cursor={{ stroke: '#059669', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                      padding: '12px 16px',
                      backgroundColor: '#1e293b'
                  }}
                  itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}
                  labelStyle={{ display: 'none' }}
                  formatter={(value: number) => [`₹${value}`, 'Sales']}
                />
                <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#059669" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorSales)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_20px_-12px_rgba(0,0,0,0.08)] flex flex-col">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Recent Sales</h3>
          <div className="space-y-4 flex-1 overflow-auto pr-2 custom-scrollbar">
            {sales.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No sales recorded yet.</p>
                </div>
            ) : (
                sales.slice(0, 5).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer group border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm group-hover:bg-white group-hover:shadow-md transition-all">
                        {sale.customerName ? sale.customerName.charAt(0).toUpperCase() : 'C'}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{sale.customerName || 'Walk-in'}</p>
                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{sale.paymentMethod}</p>
                    </div>
                    </div>
                    <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">₹{sale.total}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                        {sale.date === todayDateStr ? 'Today' : sale.date}
                    </p>
                    </div>
                </div>
                ))
            )}
          </div>
          <button onClick={() => onNavigate('billing')} className="w-full mt-6 py-3 text-sm text-emerald-700 bg-emerald-50 font-bold rounded-xl hover:bg-emerald-100 transition flex items-center justify-center">
            View All Sales <ArrowUpRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ElementType;
    color: string;
    trend?: string;
    TrendIcon?: React.ElementType;
    trendColor?: string;
    subtext?: string;
    isWarning?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, trend, TrendIcon, trendColor, subtext, isWarning }) => {
  const colorStyles: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  
  const iconStyle = colorStyles[color] || colorStyles.emerald;

  const trendColors: Record<string, string> = {
      emerald: 'text-emerald-600 bg-emerald-50',
      red: 'text-red-600 bg-red-50',
      slate: 'text-slate-500 bg-slate-100'
  };

  const trendStyle = trendColor ? trendColors[trendColor] : trendColors.slate;

  return (
    <div className={`bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_15px_-8px_rgba(0,0,0,0.08)] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group ${isWarning ? 'ring-2 ring-amber-100 ring-offset-2' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${iconStyle}`}>
            <Icon className="w-6 h-6" />
        </div>
        {isWarning && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</h3>
        
        {(trend || subtext) && (
            <div className="mt-3 flex items-center">
                {trend && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded mr-2 flex items-center ${trendStyle}`}>
                        {TrendIcon && <TrendIcon className="w-3 h-3 mr-1" />} {trend}
                    </span>
                )}
                {subtext && <span className="text-xs text-slate-400 font-medium">{subtext}</span>}
            </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
