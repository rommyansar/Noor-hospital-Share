'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { MonthlyResult, Department } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { exportToExcel, exportToCSV } from '@/lib/export';
import { FileBarChart, Download, FileSpreadsheet, Edit3, X } from 'lucide-react';

type Tab = 'staff' | 'department' | 'history';

export default function ReportsPage() {
  const [results, setResults] = useState<MonthlyResult[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('staff');
  const [filterDept, setFilterDept] = useState('');
  const { addToast } = useToast();

  // Override modal
  const [overrideResult, setOverrideResult] = useState<MonthlyResult | null>(null);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    const [resultsRes, deptsRes] = await Promise.all([
      supabase.from('monthly_results')
        .select('*, staff(name), departments(name), share_rules(role_name, share_type, distribution_type)')
        .eq('year', year).eq('month', month).order('department_id'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setResults(resultsRes.data || []);
    setDepartments(deptsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [year, month]);

  const filteredResults = filterDept ? results.filter(r => r.department_id === filterDept) : results;
  const totalPayout = filteredResults.reduce((s, r) => s + Number(r.manual_override ?? r.final_share), 0);

  // Department summary
  const deptSummary = new Map<string, { name: string; income: number; totalShares: number; count: number }>();
  filteredResults.forEach(r => {
    const name = r.departments?.name || 'Unknown';
    const existing = deptSummary.get(name) || { name, income: 0, totalShares: 0, count: 0 };
    existing.income = Number(r.department_income);
    existing.totalShares += Number(r.manual_override ?? r.final_share);
    existing.count += 1;
    deptSummary.set(name, existing);
  });

  const handleExportExcel = (type: 'staff' | 'department') => {
    if (results.length === 0) { addToast('error', 'No data to export.'); return; }
    exportToExcel(results as never[], year, month, type);
    addToast('success', 'Excel downloaded.');
  };

  const handleExportCSV = () => {
    if (results.length === 0) { addToast('error', 'No data to export.'); return; }
    exportToCSV(results as never[], year, month);
    addToast('success', 'CSV downloaded.');
  };

  const handleOverride = async () => {
    if (!overrideResult || !overrideReason.trim()) {
      addToast('error', 'Reason is mandatory for manual override.'); return;
    }
    setOverrideSaving(true);
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result_id: overrideResult.id,
          override_amount: parseFloat(overrideAmount) || 0,
          reason: overrideReason,
        }),
      });
      const data = await res.json();
      if (data.error) { addToast('error', data.error); }
      else { addToast('success', 'Override applied.'); setOverrideResult(null); load(); }
    } catch {
      addToast('error', 'Override failed.');
    }
    setOverrideSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-slate-400 text-sm mt-1">View & export monthly share reports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary btn-sm" onClick={handleExportCSV}><Download size={14} /> CSV</button>
          <button className="btn-secondary btn-sm" onClick={() => handleExportExcel('staff')}><FileSpreadsheet size={14} /> Staff Excel</button>
          <button className="btn-secondary btn-sm" onClick={() => handleExportExcel('department')}><FileSpreadsheet size={14} /> Dept Excel</button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-5 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="form-label">Year</label>
            <select className="select-field" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <select className="select-field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">All</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="stat-card">
          <p className="text-sm text-slate-400">Total Payout</p>
          <p className="text-2xl font-bold text-emerald-400">₹{totalPayout.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Staff Count</p>
          <p className="text-2xl font-bold text-white">{filteredResults.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Departments</p>
          <p className="text-2xl font-bold text-white">{deptSummary.size}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Period</p>
          <p className="text-2xl font-bold text-white">{MONTHS[month - 1]} {year}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {(['staff', 'department'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))' : 'transparent',
              color: tab === t ? '#34d399' : '#94a3b8',
              border: tab === t ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
            }}
          >
            {t === 'staff' ? 'Staff-wise' : 'Department-wise'}
          </button>
        ))}
      </div>

      {filteredResults.length === 0 ? (
        <div className="glass-card empty-state">
          <FileBarChart size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No results for this period</p>
          <p className="text-sm text-slate-500 mt-1">Run calculations first from the Calculate page.</p>
        </div>
      ) : tab === 'staff' ? (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Department</th>
                <th>Role</th>
                <th>Income</th>
                <th>Rule %</th>
                <th>Base Share</th>
                <th>Attendance</th>
                <th>Final Share</th>
                <th>Override</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map(r => (
                <tr key={r.id}>
                  <td className="font-medium text-white">{r.staff?.name}</td>
                  <td>{r.departments?.name}</td>
                  <td><span className="badge badge-info">{r.share_rules?.role_name}</span></td>
                  <td>₹{Number(r.department_income).toLocaleString()}</td>
                  <td>{r.rule_percentage}%</td>
                  <td>₹{Number(r.base_share).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${Number(r.attendance_ratio) >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                      {(Number(r.attendance_ratio) * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="font-bold text-emerald-400">₹{Number(r.manual_override ?? r.final_share).toLocaleString()}</td>
                  <td>
                    {r.manual_override != null ? (
                      <span className="badge badge-warning" title={r.override_reason || ''}>Overridden</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button className="btn-secondary btn-sm" onClick={() => {
                        setOverrideResult(r);
                        setOverrideAmount(String(r.manual_override ?? r.final_share));
                        setOverrideReason(r.override_reason || '');
                      }} disabled={r.is_locked}>
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Monthly Income</th>
                <th>Total Shares</th>
                <th>Staff Count</th>
                <th>Share % of Income</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(deptSummary.values()).map(d => (
                <tr key={d.name}>
                  <td className="font-medium text-white">{d.name}</td>
                  <td>₹{d.income.toLocaleString()}</td>
                  <td className="font-bold text-emerald-400">₹{Math.round(d.totalShares).toLocaleString()}</td>
                  <td>{d.count}</td>
                  <td>
                    <span className="badge badge-info">
                      {d.income > 0 ? ((d.totalShares / d.income) * 100).toFixed(2) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Override Modal */}
      {overrideResult && (
        <div className="modal-overlay" onClick={() => setOverrideResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-white">Manual Override</h2>
              <button onClick={() => setOverrideResult(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-3 rounded-xl mb-4" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(71,85,105,0.2)' }}>
              <p className="text-sm text-slate-400">Staff: <span className="text-white font-medium">{overrideResult.staff?.name}</span></p>
              <p className="text-sm text-slate-400">Calculated Share: <span className="text-emerald-400 font-medium">₹{Number(overrideResult.final_share).toLocaleString()}</span></p>
            </div>

            <div className="form-group">
              <label className="form-label">Override Amount (₹)</label>
              <input type="number" className="input-field" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Reason (Required)</label>
              <textarea className="input-field" rows={3} placeholder="Mandatory: explain why this override is needed..."
                value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                style={{ resize: 'vertical' }} />
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1 justify-center" onClick={handleOverride} disabled={overrideSaving || !overrideReason.trim()}>
                {overrideSaving ? <><div className="spinner" /> Saving...</> : 'Apply Override'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setOverrideResult(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
