'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { MonthlyResult, Department, AggregatedStaffResult } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { exportToExcel, exportToCSV } from '@/lib/export';
import { FileBarChart, Download, FileSpreadsheet, Edit3, X, ChevronRight, Users, Layers } from 'lucide-react';

type Tab = 'staff' | 'department';
type ViewMode = 'grouped' | 'raw';

// Deterministic department colors based on name hash
const DEPT_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

function getDeptColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEPT_COLORS[Math.abs(hash) % DEPT_COLORS.length];
}

export default function ReportsPage() {
  const [results, setResults] = useState<MonthlyResult[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('staff');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [filterDept, setFilterDept] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
        .select('*, staff(name, staff_code), departments(name), share_rules(role_name, share_type, distribution_type)')
        .eq('year', year).eq('month', month).order('department_id'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setResults(resultsRes.data || []);
    setDepartments(deptsRes.data || []);
    setExpandedRows(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [year, month]);

  const filteredResults = results.filter(r => {
    if (filterDept && r.department_id !== filterDept) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const sName = (r.staff?.name || '').toLowerCase();
      const sCode = (r.staff?.staff_code || '').toLowerCase();
      if (!sName.includes(term) && !sCode.includes(term)) return false;
    }
    return true;
  });
  const totalPayout = filteredResults.reduce((s, r) => s + Number(r.manual_override ?? r.final_share), 0);

  // ── Memoized aggregation: group by staff_code ──
  const aggregatedStaff = useMemo<AggregatedStaffResult[]>(() => {
    const staffMap = new Map<string, AggregatedStaffResult>();

    filteredResults.forEach(r => {
      const groupKey = r.staff?.staff_code || r.staff_id;
      const share = Number(r.manual_override ?? r.final_share);

      if (!staffMap.has(groupKey)) {
        staffMap.set(groupKey, {
          staff_id: groupKey, // Using groupKey as the unique identifier for UI expansion state
          staff_code: r.staff?.staff_code || '',
          staff_name: r.staff?.name || 'Unknown',
          total_share: 0,
          department_count: 0,
          breakdown: [],
        });
      }

      const entry = staffMap.get(groupKey)!;
      entry.total_share += share;
      entry.breakdown.push({
        department_id: r.department_id,
        department_name: r.departments?.name || 'Unknown',
        role_name: r.share_rules?.role_name || '',
        amount: share,
        percentage: 0, // calculated below
        base_share: Number(r.base_share),
        attendance_ratio: Number(r.attendance_ratio),
        department_income: Number(r.department_income),
        rule_percentage: Number(r.rule_percentage),
        has_override: r.manual_override != null,
        result_id: r.id,
      });
    });

    // Calculate percentages & sort by total_share desc
    const result = Array.from(staffMap.values());
    result.forEach(staff => {
      staff.department_count = staff.breakdown.length;
      staff.breakdown.forEach(b => {
        b.percentage = staff.total_share > 0 ? (b.amount / staff.total_share) * 100 : 0;
      });
      // Sort breakdown by amount descending
      staff.breakdown.sort((a, b) => b.amount - a.amount);
    });

    result.sort((a, b) => b.total_share - a.total_share);
    return result;
  }, [filteredResults]);

  // Unique staff count
  const uniqueStaffCount = aggregatedStaff.length;

  // Department summary
  const deptSummary = useMemo(() => {
    const map = new Map<string, { name: string; income: number; totalShares: number; count: number }>();
    filteredResults.forEach(r => {
      const name = r.departments?.name || 'Unknown';
      const existing = map.get(name) || { name, income: 0, totalShares: 0, count: 0 };
      existing.income = Number(r.department_income);
      existing.totalShares += Number(r.manual_override ?? r.final_share);
      existing.count += 1;
      map.set(name, existing);
    });
    return map;
  }, [filteredResults]);

  const toggleExpand = (staffId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedRows(new Set(aggregatedStaff.map(s => s.staff_id)));
  };

  const collapseAll = () => {
    setExpandedRows(new Set());
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="form-label">Search Staff</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Search by code or name..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">All</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="stat-card">
          <p className="text-sm text-slate-400">Total Payout</p>
          <p className="text-2xl font-bold text-emerald-400">₹{totalPayout.toLocaleString('en-IN')}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Unique Staff</p>
          <p className="text-2xl font-bold text-white">{uniqueStaffCount}</p>
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

      {/* Tabs + View Toggle */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex gap-1">
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

        {tab === 'staff' && (
          <div className="flex items-center gap-3">
            {viewMode === 'grouped' && aggregatedStaff.length > 0 && (
              <div className="flex gap-1">
                <button className="btn-secondary btn-sm" onClick={expandAll} title="Expand all">
                  <Layers size={13} /> Expand All
                </button>
                <button className="btn-secondary btn-sm" onClick={collapseAll} title="Collapse all">
                  <Layers size={13} /> Collapse
                </button>
              </div>
            )}
            <div className="rpt-view-toggle">
              <button
                className={`rpt-view-btn ${viewMode === 'grouped' ? 'active' : ''}`}
                onClick={() => setViewMode('grouped')}
              >
                <Users size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                Grouped
              </button>
              <button
                className={`rpt-view-btn ${viewMode === 'raw' ? 'active' : ''}`}
                onClick={() => setViewMode('raw')}
              >
                Raw
              </button>
            </div>
          </div>
        )}
      </div>

      {filteredResults.length === 0 ? (
        <div className="glass-card empty-state">
          <FileBarChart size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No results for this period</p>
          <p className="text-sm text-slate-500 mt-1">Run calculations first from the Calculate page.</p>
        </div>
      ) : tab === 'staff' && viewMode === 'grouped' ? (
        /* ──────── GROUPED VIEW ──────── */
        <>
          <div className="glass-card table-container hidden lg:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Staff Name</th>
                  <th>Departments</th>
                  <th style={{ textAlign: 'right' }}>Total Share</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedStaff.map((staff, idx) => {
                  const isExpanded = expandedRows.has(staff.staff_id);
                  return (
                    <>
                      <tr
                        key={staff.staff_id}
                        className={`rpt-expand-row ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleExpand(staff.staff_id)}
                      >
                        <td>
                          <span className={`rpt-chevron ${isExpanded ? 'open' : ''}`}>
                            <ChevronRight size={14} />
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center">
                            {idx < 3 && (
                              <span className={`rpt-rank-badge rpt-rank-${idx + 1}`}>
                                {idx + 1}
                              </span>
                            )}
                            <span className="font-mono text-slate-400 text-xs mr-2">{staff.staff_code}</span>
                            <span className="font-medium text-white">{staff.staff_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="rpt-dept-count">
                            {staff.department_count} dept{staff.department_count > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="font-bold text-emerald-400 text-base">
                            ₹{staff.total_share.toLocaleString('en-IN')}
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${staff.staff_id}-breakdown`} className="rpt-breakdown-row">
                          <td colSpan={4}>
                            <div className="rpt-breakdown-wrap">
                              <div className="rpt-breakdown-inner">
                                <table className="rpt-breakdown-table">
                                  <thead>
                                    <tr>
                                      <th>Department</th>
                                      <th>Role</th>
                                      <th>Dept Income</th>
                                      <th>Rule %</th>
                                      <th>Attendance</th>
                                      <th>Amount</th>
                                      <th>Contribution</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {staff.breakdown.map(b => (
                                      <tr key={b.result_id}>
                                        <td>
                                          <div className="rpt-dept-bar">
                                            <span
                                              className="rpt-dept-dot"
                                              style={{ backgroundColor: getDeptColor(b.department_name) }}
                                            />
                                            <span className="text-white font-medium">{b.department_name}</span>
                                          </div>
                                        </td>
                                        <td>
                                          <span className="badge badge-info">{b.role_name}</span>
                                        </td>
                                        <td>₹{b.department_income.toLocaleString('en-IN')}</td>
                                        <td>{b.rule_percentage}%</td>
                                        <td>
                                          <span className={`badge ${b.attendance_ratio >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                                            {(b.attendance_ratio * 100).toFixed(1)}%
                                          </span>
                                        </td>
                                        <td className="font-semibold text-emerald-400">
                                          ₹{b.amount.toLocaleString('en-IN')}
                                          {b.has_override && (
                                            <span className="badge badge-warning ml-2" style={{ fontSize: 10 }}>Override</span>
                                          )}
                                        </td>
                                        <td>
                                          <div className="rpt-pct-bar-wrap">
                                            <div className="rpt-pct-bar-track">
                                              <div
                                                className="rpt-pct-bar-fill"
                                                style={{ width: `${Math.min(b.percentage, 100)}%` }}
                                              />
                                            </div>
                                            <span className="rpt-pct-pill">{b.percentage.toFixed(1)}%</span>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden flex flex-col gap-4">
            {aggregatedStaff.map((staff, idx) => {
              const isExpanded = expandedRows.has(staff.staff_id);
              return (
                <div key={staff.staff_id} className="glass-card p-4 flex flex-col gap-3">
                  <div 
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleExpand(staff.staff_id)}
                  >
                    <div className="flex items-center gap-2">
                      {idx < 3 && (
                        <span className={`rpt-rank-badge rpt-rank-${idx + 1}`}>{idx + 1}</span>
                      )}
                      <div>
                        <div className="font-medium text-white">{staff.staff_name}</div>
                        <div className="font-mono text-slate-400 text-xs">{staff.staff_code} &bull; {staff.department_count} dept{staff.department_count > 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-emerald-400">₹{staff.total_share.toLocaleString('en-IN')}</span>
                      <span className="text-slate-400 transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                        <ChevronRight size={18} />
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-slate-700/50">
                      {staff.breakdown.map(b => (
                        <div key={b.result_id} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm">
                          <div className="flex justify-between items-start mb-2 border-b border-slate-700/50 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="rpt-dept-dot shadow-sm" style={{ backgroundColor: getDeptColor(b.department_name) }} />
                              <span className="text-white font-medium">{b.department_name}</span>
                            </div>
                            <span className="badge badge-info">{b.role_name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <div className="text-slate-400">Rule %: <span className="text-slate-200">{b.rule_percentage}%</span></div>
                            <div className="text-slate-400 text-right">Att: <span className={`badge ${b.attendance_ratio >= 0.8 ? 'badge-success' : 'badge-warning'} scale-90 origin-right`}>{(b.attendance_ratio * 100).toFixed(1)}%</span></div>
                            <div className="text-slate-400">Amount: <span className="font-semibold text-emerald-400">₹{b.amount.toLocaleString('en-IN')}</span></div>
                            <div className="text-slate-400 text-right">Contrib: <span className="text-white">{b.percentage.toFixed(1)}%</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : tab === 'staff' && viewMode === 'raw' ? (
        /* ──────── RAW VIEW (original table) ──────── */
        <>
          <div className="glass-card table-container hidden lg:block">
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
                    <td className="font-medium text-white">
                      <span className="font-mono text-slate-400 text-xs mr-2">{r.staff?.staff_code}</span>
                      {r.staff?.name}
                    </td>
                    <td>{r.departments?.name}</td>
                    <td><span className="badge badge-info">{r.share_rules?.role_name}</span></td>
                    <td>₹{Number(r.department_income).toLocaleString('en-IN')}</td>
                    <td>{r.rule_percentage}%</td>
                    <td>₹{Number(r.base_share).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${Number(r.attendance_ratio) >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                        {(Number(r.attendance_ratio) * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="font-bold text-emerald-400">₹{Number(r.manual_override ?? r.final_share).toLocaleString('en-IN')}</td>
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
          
          <div className="lg:hidden flex flex-col gap-4">
            {filteredResults.map(r => (
              <div key={r.id} className="glass-card p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start border-b border-slate-700/50 pb-3">
                  <div>
                    <div className="font-medium text-white text-lg">{r.staff?.name}</div>
                    <div className="font-mono text-slate-400 text-xs mt-1">{r.staff?.staff_code} &bull; {r.departments?.name}</div>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => {
                    setOverrideResult(r);
                    setOverrideAmount(String(r.manual_override ?? r.final_share));
                    setOverrideReason(r.override_reason || '');
                  }} disabled={r.is_locked}>
                    <Edit3 size={14} /> Override
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm py-1">
                  <div>
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Role</span>
                    <span className="badge badge-info">{r.share_rules?.role_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Final Share</span>
                    <span className="font-bold text-emerald-400">₹{Number(r.manual_override ?? r.final_share).toLocaleString('en-IN')}</span>
                    {r.manual_override != null && <span className="badge badge-warning ml-2 scale-75 origin-left">OR</span>}
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Rule / Att %</span>
                    <span className="text-slate-300">{r.rule_percentage}% / {(Number(r.attendance_ratio) * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Base Share</span>
                    <span className="text-slate-300">₹{Number(r.base_share).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ──────── DEPARTMENT VIEW ──────── */
        <>
          <div className="glass-card table-container hidden md:block">
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
                    <td>₹{d.income.toLocaleString('en-IN')}</td>
                    <td className="font-bold text-emerald-400">₹{Math.round(d.totalShares).toLocaleString('en-IN')}</td>
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

          <div className="md:hidden flex flex-col gap-4">
            {Array.from(deptSummary.values()).map(d => (
              <div key={d.name} className="glass-card p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start border-b border-slate-700/50 pb-3">
                  <div>
                    <div className="font-medium text-white text-lg">{d.name}</div>
                    <div className="text-sm text-slate-400 mt-1">{d.count} Staff Members</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Total Shares</div>
                    <div className="font-bold text-emerald-400 text-lg">₹{Math.round(d.totalShares).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm pt-1">
                  <div>
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Dept Income</span>
                    <span className="text-slate-300">₹{d.income.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 text-xs block mb-1 font-semibold uppercase">Share %</span>
                    <span className="badge badge-info">
                      {d.income > 0 ? ((d.totalShares / d.income) * 100).toFixed(2) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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
              <p className="text-sm text-slate-400">Calculated Share: <span className="text-emerald-400 font-medium">₹{Number(overrideResult.final_share).toLocaleString('en-IN')}</span></p>
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
