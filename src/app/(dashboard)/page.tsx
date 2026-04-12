'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, CalendarOff, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    departments: 0,
    staff: 0,
    activeLeaves: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const supabase = createClient();
      
      const { count: dpCount } = await supabase.from('departments').select('*', { count: 'exact', head: true });
      const { count: stCount } = await supabase.from('staff').select('*', { count: 'exact', head: true }).eq('is_active', true);
      
      const today = new Date().toISOString().split('T')[0];
      const { count: lvCount } = await supabase.from('staff_leaves').select('*', { count: 'exact', head: true }).eq('date', today);

      setStats({
        departments: dpCount || 0,
        staff: stCount || 0,
        activeLeaves: lvCount || 0,
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="text-slate-400 text-sm mt-1">High-level summary of the hospital share engine</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Total Departments', value: stats.departments, icon: Building2, color: '#3b82f6' },
          { label: 'Active Staff', value: stats.staff, icon: Users, color: '#10b981' },
          { label: `Staff Off Today`, value: stats.activeLeaves, icon: CalendarOff, color: '#f59e0b' },
        ].map((stat, idx) => {
          const IconWrapper = stat.icon;
          return (
            <div key={idx} className="glass-card flex items-center p-6 gap-4">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `rgba(${hexToRgb(stat.color)}, 0.15)`, color: stat.color }}
              >
                <IconWrapper size={24} />
              </div>
              <div>
                <div className="text-slate-400 text-sm font-medium mb-1">{stat.label}</div>
                {loading ? (
                  <div className="h-6 w-16 bg-slate-800 animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div 
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))' }}
        >
          <Activity size={40} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Hospital Share Engine Online</h2>
        <p className="text-slate-400 max-w-md">
          Welcome to the new management dashboard. Use the sidebar to track attendance, enter monthly incomes, and generate completely automated distribution reports.
        </p>
      </div>
    </div>
  );
}

function hexToRgb(hex: string) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
}
