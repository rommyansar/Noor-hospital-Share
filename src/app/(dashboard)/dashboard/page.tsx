'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, Users, Calculator, FileBarChart, TrendingUp, Activity } from 'lucide-react';
import { MONTHS } from '@/lib/types';

interface Stats {
  departments: number;
  staff: number;
  rulesCount: number;
  lastCalcMonth: string | null;
  totalDistributed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ departments: 0, staff: 0, rulesCount: 0, lastCalcMonth: null, totalDistributed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [depts, staffData, rules, results] = await Promise.all([
        supabase.from('departments').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('staff').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('share_rules').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('monthly_results').select('year, month, final_share, manual_override').order('year', { ascending: false }).order('month', { ascending: false }),
      ]);

      let lastMonth: string | null = null;
      let totalDist = 0;
      if (results.data && results.data.length > 0) {
        lastMonth = `${MONTHS[(results.data[0].month as number) - 1]} ${results.data[0].year}`;
        totalDist = results.data.reduce((s, r) => s + Number(r.manual_override ?? r.final_share), 0);
      }

      setStats({
        departments: depts.count || 0,
        staff: staffData.count || 0,
        rulesCount: rules.count || 0,
        lastCalcMonth: lastMonth,
        totalDistributed: totalDist,
      });
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { label: 'Active Departments', value: stats.departments, icon: Building2, color: '#10b981' },
    { label: 'Active Staff', value: stats.staff, icon: Users, color: '#3b82f6' },
    { label: 'Share Rules', value: stats.rulesCount, icon: Calculator, color: '#f59e0b' },
    { label: 'Total Distributed', value: `₹${stats.totalDistributed.toLocaleString()}`, icon: TrendingUp, color: '#8b5cf6' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Hospital Share Management Overview</p>
        </div>
        {stats.lastCalcMonth && (
          <div className="badge badge-info">
            <FileBarChart size={14} className="mr-1" /> Last: {stats.lastCalcMonth}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 42, height: 42, background: `${card.color}20` }}
                >
                  <Icon size={20} style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              <p className="text-sm text-slate-400 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick start guide */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={20} className="text-emerald-400" /> Quick Setup Guide
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { step: '1', title: 'Create Departments', desc: 'Add hospital departments (clinical / non-clinical)', href: '/departments' },
            { step: '2', title: 'Define Share Rules', desc: 'Set percentage, role, pool/per-person distribution', href: '/rules' },
            { step: '3', title: 'Add Staff', desc: 'Register staff and assign to departments & roles', href: '/staff' },
            { step: '4', title: 'Enter Attendance', desc: 'Record worked days, leaves, and half-days', href: '/attendance' },
            { step: '5', title: 'Enter Income & Calculate', desc: 'Input monthly income and run calculations', href: '/calculate' },
            { step: '6', title: 'View Reports', desc: 'Export staff-wise and department-wise reports', href: '/reports' },
          ].map((item) => (
            <a
              key={item.step}
              href={item.href}
              className="flex gap-4 p-4 rounded-xl transition-all hover:bg-white/5"
              style={{ border: '1px solid rgba(71,85,105,0.2)' }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-lg text-sm font-bold"
                style={{
                  width: 32, height: 32,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                }}
              >
                {item.step}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
