'use client';

import { useState, useEffect } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department } from '@/lib/types';
import { MONTHS } from '@/lib/types';

interface StaffReport {
  staff_id: string;
  staff_name: string;
  role: string;
  total_share: number;
  days_present: number;
  daily_details: { date: string; share: number; type: string }[];
}

interface ReportData {
  department_id: string;
  year: number;
  month: number;
  total_income: number;
  total_distributed: number;
  staff_count: number;
  staff: StaffReport[];
}

export default function ReportsPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data.filter((d: Department) => d.is_active));
    if (data.length > 0 && !selectedDept) setSelectedDept(data[0].id);
  };

  useEffect(() => { fetchDepartments(); }, []);

  const fetchReport = async () => {
    if (!selectedDept) return;
    setLoading(true);
    const res = await fetch(`/api/reports?department_id=${selectedDept}&year=${year}&month=${month}`);
    const data = await res.json();
    if (res.ok) {
      setReport(data);
    } else {
      addToast('error', data.error || 'Failed to load report');
    }
    setLoading(false);
  };

  useEffect(() => { if (selectedDept) fetchReport(); }, [selectedDept, year, month]);

  const toggleExpand = (id: string) => {
    setExpandedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deptName = departments.find((d) => d.id === selectedDept)?.name || '';

  // Export as CSV
  const exportCSV = () => {
    if (!report || report.staff.length === 0) return;
    const headers = ['Staff Name', 'Role', 'Days Present', 'Total Share'];
    const rows = report.staff.map((s) => [s.staff_name, s.role, s.days_present, s.total_share]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deptName}-${MONTHS[month - 1]}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Report exported');
  };

  const [calculating, setCalculating] = useState(false);

  const runCalculation = async (type: 'department' | 'overall') => {
    setCalculating(true);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    try {
      const payload = {
        month: monthStr,
        department_id: type === 'department' ? selectedDept : 'all'
      };

      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        addToast('success', `${type === 'department' ? deptName : 'Overall'} calculation complete!`);
        fetchReport();
      } else {
        addToast('error', data.error || 'Failed to calculate');
      }
    } catch (err) {
      addToast('error', 'An error occurred during calculation');
    }
    setCalculating(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Reports</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Aggregated daily shares by month
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedDept && (
            <button className="btn-primary" onClick={() => runCalculation('department')} disabled={calculating} style={{ padding: '8px 16px' }}>
              {calculating ? 'Calculating...' : `Calculate ${deptName}`}
            </button>
          )}
          <button className="btn-primary" onClick={() => runCalculation('overall')} disabled={calculating} style={{ padding: '8px 16px', background: '#3b82f6', borderColor: '#3b82f6' }}>
            {calculating ? 'Calculating...' : 'Calculate Overall'}
          </button>
          {report && report.staff.length > 0 && (
            <button className="btn-secondary" onClick={exportCSV}>
              <Download size={16} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Year</label>
            <select className="select-field" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <select className="select-field" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : !report || report.staff.length === 0 ? (
        <div className="glass-card empty-state">
          <FileBarChart size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No data for this period</p>
          <p style={{ fontSize: '14px', marginTop: '8px', color: '#64748b', marginBottom: '16px' }}>
            Run monthly calculations to view reports
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="stat-card">
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Income</p>
              <p style={{ fontSize: '24px', fontWeight: 800, color: '#e2e8f0', marginTop: '6px' }}>₹{report.total_income.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Distributed</p>
              <p style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>₹{report.total_distributed.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff</p>
              <p style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa', marginTop: '6px' }}>{report.staff_count}</p>
            </div>
          </div>

          {/* Staff Table */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'center' }}>Days</th>
                    <th style={{ textAlign: 'right' }}>Total Share</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {report.staff.map((s) => {
                    const isExpanded = expandedStaff.has(s.staff_id);
                    return (
                      <tr key={s.staff_id} style={{ cursor: 'pointer' }}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          {/* Main row */}
                          <div
                            onClick={() => toggleExpand(s.staff_id)}
                            style={{
                              display: 'grid', gridTemplateColumns: '2fr 1fr 80px 1fr 40px',
                              alignItems: 'center', padding: '12px 16px',
                              borderBottom: isExpanded ? '1px solid rgba(71, 85, 105, 0.15)' : 'none',
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{s.staff_name}</span>
                            <span><span className="badge badge-info">{s.role}</span></span>
                            <span style={{ textAlign: 'center', color: '#94a3b8' }}>{s.days_present}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '16px' }}>
                              ₹{s.total_share.toLocaleString()}
                            </span>
                            <span style={{ textAlign: 'center', color: '#64748b' }}>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>

                          {/* Expanded daily detail */}
                          {isExpanded && (
                            <div style={{ padding: '8px 16px 12px 32px', background: 'rgba(15, 23, 42, 0.3)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Date</span>
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>Type</span>
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Share</span>
                                {s.daily_details.map((d, i) => (
                                  <div key={i} style={{ display: 'contents' }}>
                                    <span style={{ fontSize: '13px', color: '#cbd5e1', padding: '4px 0' }}>
                                      {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '4px 0' }}>
                                      <span className={`badge ${d.type === 'work_entry' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                                        {d.type === 'work_entry' ? 'Work' : 'Rule'}
                                      </span>
                                    </span>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', textAlign: 'right', padding: '4px 0' }}>
                                      ₹{d.share.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
