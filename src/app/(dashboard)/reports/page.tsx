'use client';

import { useState, useEffect, useRef } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { exportExcel, exportPDF, type ReportExportData, type ReportType } from '@/lib/reportExport';

interface WorkEntryDetail {
  date: string;
  description: string;
  work_amount: number;
  percentage: string;
  calculated_share: number;
}

interface RuleEntryDetail {
  date: string;
  income_amount: number;
  percentage: string;
  distribution_type: string;
  present_count: number;
  calculated_share: number;
}

interface StaffReport {
  staff_id: string;
  staff_name: string;
  role: string;
  total_share: number;
  days_present: number;
  origin_department: string;
  daily_details: { date: string; share: number; type: string; note?: string }[];
  work_entries: WorkEntryDetail[];
  rule_entries: RuleEntryDetail[];
  // OT case-type breakdown
  major_cases?: number;
  minor_cases?: number;
  major_base?: number;
  minor_base?: number;
  combined_working_amount?: number;
  ot_mode?: string;
  ot_group_count?: number;
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

const OT_DEPT_NAMES = ['delivery', 'general surgery', 'eye operation'];

export default function ReportsPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    const active = data.filter((d: Department) => d.is_active);
    setDepartments(active);
    if (active.length > 0 && !selectedDept) setSelectedDept(active[0].id);
  };

  useEffect(() => { fetchDepartments(); }, []);

  const fetchReport = async () => {
    if (!selectedDept) return;
    setLoading(true);
    const cb = new Date().getTime();
    const res = await fetch(`/api/reports?department_id=${selectedDept}&year=${year}&month=${month}&_cb=${cb}`, {
      cache: 'no-store'
    });
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

  // Check if selected dept is an OT department (Delivery / General Surgery)
  const selectedDeptObj = departments.find(d => d.id === selectedDept);
  const isOTDept = selectedDeptObj ? OT_DEPT_NAMES.includes(selectedDeptObj.name.toLowerCase().trim()) : false;
  const deptName = selectedDeptObj?.name || '';

  // Build export data
  const getExportData = (): ReportExportData | null => {
    if (!report || report.staff.length === 0) return null;
    return {
      department_name: deptName,
      year: report.year,
      month: report.month,
      total_income: report.total_income,
      total_distributed: report.total_distributed,
      staff: report.staff,
    };
  };

  const handleExport = (format: 'excel' | 'pdf', type: ReportType) => {
    const data = getExportData();
    if (!data) {
      addToast('error', 'No report data to export');
      return;
    }

    setExportLoading(true);
    try {
      if (format === 'excel') {
        exportExcel(data, type);
      } else {
        exportPDF(data, type);
      }
      addToast('success', `${type === 'normal' ? 'Normal' : 'Detailed'} report exported as ${format.toUpperCase()}`);
    } catch (err) {
      addToast('error', 'Failed to export report');
      console.error('Export error:', err);
    }
    setExportLoading(false);
    setShowExportModal(false);
  };

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowExportModal(false);
      }
    };
    if (showExportModal) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportModal]);

  const [calculating, setCalculating] = useState(false);

  const runCalculation = async (type: 'department' | 'overall') => {
    setCalculating(true);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    try {
      if (isOTDept && type === 'department') {
        // Use OT calculation for Delivery / General Surgery
        const res = await fetch('/api/calculate/ot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: monthStr, department_id: selectedDept })
        });
        const data = await res.json();
        if (res.ok) {
          addToast('success', `${deptName} OT calculation complete!`);
          fetchReport();
        } else {
          addToast('error', data.error || 'Failed to calculate');
        }
      } else {
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
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {selectedDept && (
            <button className="btn-primary" onClick={() => runCalculation('department')} disabled={calculating} style={{ padding: '8px 16px' }}>
              {calculating ? 'Calculating...' : `Calculate ${deptName}`}
            </button>
          )}
          <button className="btn-primary" onClick={() => runCalculation('overall')} disabled={calculating} style={{ padding: '8px 16px', background: '#3b82f6', borderColor: '#3b82f6' }}>
            {calculating ? 'Calculating...' : 'Calculate Overall'}
          </button>
          {report && report.staff.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setShowExportModal(true)}
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15))',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                color: '#34d399',
              }}
            >
              <Download size={16} /> Export Report
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
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>{s.staff_name}</span>
                              {s.origin_department !== deptName && (
                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                  from {s.origin_department}
                                </span>
                              )}
                            </div>
                            <span><span className="badge badge-info">{s.role}</span></span>
                            <span style={{ textAlign: 'center', color: '#94a3b8' }}>{s.days_present < 0 ? '-' : s.days_present}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '16px' }}>
                              ₹{s.total_share.toLocaleString()}
                            </span>
                            <span style={{ textAlign: 'center', color: '#64748b' }}>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          </div>

                          {/* OT Case-Type Breakdown (for OT departments) */}
                          {isOTDept && ((s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0) && (
                            <div style={{ padding: '6px 16px 6px 32px', background: 'rgba(16, 185, 129, 0.04)', borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                                {(s.major_cases || 0) > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Major</span>
                                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{s.major_cases} cases</span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>₹{(s.major_base || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                                {(s.minor_cases || 0) > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Minor</span>
                                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{s.minor_cases} cases</span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>₹{(s.minor_base || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Working</span>
                                  <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>₹{(s.combined_working_amount || 0).toLocaleString('en-IN')}</span>
                                </div>
                                {s.ot_mode && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Mode</span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.ot_mode}{(s.ot_group_count || 0) > 1 ? ` (÷${s.ot_group_count})` : ''}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

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
                                      {d.note && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.1 }}>
                                          {d.note}
                                        </div>
                                      )}
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

      {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="modal-overlay">
          <div ref={modalRef} className="modal-content" style={{ maxWidth: '520px' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e2e8f0' }}>Export Report</h2>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {deptName} — {MONTHS[month - 1]} {year}
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  background: 'rgba(71, 85, 105, 0.3)',
                  border: '1px solid rgba(71, 85, 105, 0.4)',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  transition: 'all 0.2s ease',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Report Type Info */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Choose Report Type & Format
              </p>
            </div>

            {/* Normal Report Section */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.03))',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '14px',
              padding: '20px',
              marginBottom: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileText size={20} color="#34d399" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>Normal Report</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                    Clean summary for staff viewing. Multiple work entries per staff are combined into a single row.
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className="export-btn"
                  disabled={exportLoading}
                  onClick={() => handleExport('pdf', 'normal')}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08))',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.15))';
                    (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08))';
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <FileText size={15} /> PDF
                </button>
                <button
                  className="export-btn"
                  disabled={exportLoading}
                  onClick={() => handleExport('excel', 'normal')}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.08))',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '10px',
                    color: '#34d399',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(16, 185, 129, 0.15))';
                    (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.08))';
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <FileSpreadsheet size={15} /> Excel
                </button>
              </div>
            </div>

            {/* Detailed Report Section */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03))',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '14px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileBarChart size={20} color="#60a5fa" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>Detailed Report</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                    Full audit view with complete calculation breakdown. Each work entry shown separately with work type, amount, and percentage.
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className="export-btn"
                  disabled={exportLoading}
                  onClick={() => handleExport('pdf', 'detailed')}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08))',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.15))';
                    (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08))';
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <FileText size={15} /> PDF
                </button>
                <button
                  className="export-btn"
                  disabled={exportLoading}
                  onClick={() => handleExport('excel', 'detailed')}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.08))',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '10px',
                    color: '#60a5fa',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(59, 130, 246, 0.15))';
                    (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.08))';
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <FileSpreadsheet size={15} /> Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
