'use client';

import { useState, useEffect, useRef } from 'react';
import { FileBarChart, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { exportExcel, exportPDF, exportCombinedPDF, type ReportExportData, type ReportType } from '@/lib/reportExport';

interface StaffReport {
  staff_id: string;
  staff_name: string;
  role: string;
  total_share: number;
  days_present: number;
  origin_department: string;
  daily_details: { date: string; share: number; type: string; note?: string }[];
  work_entries: any[];
  rule_entries: any[];
  // Universal breakdown fields (built by API for ALL departments)
  breakdown_lines?: string[];
  working_amount?: number;
  working_amount_lines?: string[];
  display_percentage?: string;
  division_info?: string;
  // OT case-type breakdown (still available for exports)
  major_cases?: number;
  minor_cases?: number;
  major_base?: number;
  minor_base?: number;
  combined_working_amount?: number;
  ot_mode?: string;
  ot_group_count?: number;
  raw_cases?: any[];
  // Addon tracking
  addon_contributions?: { department: string; share: number; pct: string; attendance: string; note: string }[];
}

interface ReportData {
  department_id: string;
  year: number;
  month: number;
  is_ot?: boolean;
  total_income: number;
  total_distributed: number;
  staff_count: number;
  report_heading?: string | null;
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportAllLoading, setExportAllLoading] = useState(false);
  const [selectedMultiDepts, setSelectedMultiDepts] = useState<Set<string>>(new Set());
  const [recalculateBeforeExport, setRecalculateBeforeExport] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    const active = data.filter((d: Department) => d.is_active);
    setDepartments(active);
    if (active.length > 0 && !selectedDept) setSelectedDept(active[0].id);
  };

  useEffect(() => { 
    fetchDepartments(); 
  }, []);

  useEffect(() => {
    setSelectedMultiDepts(new Set(departments.map(d => d.id)));
  }, [departments]);

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

  // Use calculation_method flag from department data (not name matching)
  const selectedDeptObj = departments.find(d => d.id === selectedDept);
  const isOTDept = selectedDeptObj?.calculation_method === 'ot';
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
      report_heading: report.report_heading || undefined,
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

  const handleExportAllPDF = async () => {
    setExportAllLoading(true);
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      
      if (recalculateBeforeExport) {
        addToast('info', 'Running calculations for selected departments...');
        // Run sequentially to prevent overwhelming the server/DB
        for (const deptId of selectedMultiDepts) {
          const deptObj = departments.find(d => d.id === deptId);
          if (!deptObj) continue;
          
          if (deptObj.calculation_method === 'ot') {
            await fetch('/api/calculate/ot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ month: monthStr, department_id: deptId })
            });
          } else {
            await fetch('/api/calculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ month: monthStr, department_id: deptId })
            });
          }
        }
        // Force refresh the report screen if the currently viewed department was updated
        if (selectedMultiDepts.has(selectedDept)) {
          fetchReport();
        }
      }

      const dataList: ReportExportData[] = [];
      const cb = new Date().getTime();
      
      const fetchPromises = departments
        .filter(dept => selectedMultiDepts.has(dept.id))
        .map(async (dept) => {
        const res = await fetch(`/api/reports?department_id=${dept.id}&year=${year}&month=${month}&_cb=${cb}`, {
          cache: 'no-store'
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data.staff || data.staff.length === 0) return null;
        
        return {
          department_name: dept.name,
          year: data.year,
          month: data.month,
          total_income: data.total_income,
          total_distributed: data.total_distributed,
          staff: data.staff,
          report_heading: data.report_heading || undefined,
        } as ReportExportData;
      });

      const results = await Promise.all(fetchPromises);
      for (const res of results) {
        if (res) dataList.push(res);
      }

      if (dataList.length === 0) {
        addToast('error', 'No data found across all departments for this month.');
      } else {
        exportCombinedPDF(dataList);
        addToast('success', 'Combined report exported as PDF');
      }
    } catch (err) {
      addToast('error', 'Failed to generate combined report');
      console.error(err);
    }
    setExportAllLoading(false);
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
        // Use OT calculation for OT departments (detected via calculation_method flag)
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

          {/* ── Universal Staff Table ── */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '180px' }}>Staff</th>
                    <th style={{ textAlign: 'left', width: '160px' }}>Working Amt</th>
                    <th style={{ textAlign: 'center', width: '100px' }}>%</th>
                    <th style={{ textAlign: 'center', width: '110px' }}>Division</th>
                    <th style={{ width: '260px' }}>Breakdown</th>
                    <th style={{ textAlign: 'right', width: '110px' }}>Final Share</th>
                    <th style={{ width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {report.staff.map((s) => {
                    const isExpanded = expandedStaff.has(s.staff_id);
                    return (
                      <tr key={s.staff_id} style={{ cursor: 'pointer' }}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          {/* Main row */}
                          <div
                            onClick={() => toggleExpand(s.staff_id)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '180px 120px 100px 110px 1fr 110px 30px',
                              alignItems: 'start',
                              padding: '12px 16px',
                              borderBottom: isExpanded ? '1px solid rgba(71, 85, 105, 0.15)' : 'none',
                            }}
                          >
                            {/* Staff Name + Role */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{s.staff_name}</span>
                              <span className="badge badge-info" style={{ fontSize: '10px', marginTop: '3px', width: 'fit-content' }}>{s.role}</span>
                              {s.origin_department !== deptName && (
                                <span style={{ fontSize: '10px', color: '#818cf8', marginTop: '2px' }}>
                                  from {s.origin_department}
                                </span>
                              )}
                            </div>

                            {/* Working Amount — per-percentage lines */}
                            <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500, lineHeight: '1.6' }}>
                              {(s as any).working_amount_lines && (s as any).working_amount_lines.length > 0 ? (
                                (s as any).working_amount_lines.map((line: string, i: number) => (
                                  <div key={i} style={{ fontSize: '11px' }}>{line}</div>
                                ))
                              ) : (
                                <span>₹{(s.working_amount || 0).toLocaleString('en-IN')}</span>
                              )}
                            </div>

                            {/* Percentage */}
                            <div style={{ textAlign: 'center', color: '#f59e0b', fontSize: '12px', fontWeight: 600, lineHeight: '1.6' }}>
                              {(s as any).display_percentage_lines && (s as any).display_percentage_lines.length > 0 ? (
                                (s as any).display_percentage_lines.map((pct: string, i: number) => (
                                  <div key={i}>{pct}</div>
                                ))
                              ) : (
                                <span>{s.display_percentage || '-'}</span>
                              )}
                            </div>

                            {/* Division Info */}
                            <span style={{
                              textAlign: 'center',
                              color: s.division_info?.startsWith('÷') ? '#38bdf8' : '#64748b',
                              fontSize: '12px',
                              fontWeight: s.division_info?.startsWith('÷') ? 600 : 400,
                            }}>
                              {s.division_info || '-'}
                            </span>

                            {/* Breakdown */}
                            <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.6' }}>
                              {(s.breakdown_lines || []).map((line, i) => {
                                const isTotal = line.startsWith('= Total');
                                const isDivision = line.startsWith('÷');
                                const isAddon = line.startsWith('[Add-on:');
                                return (
                                  <div key={i} style={{
                                    color: isTotal ? '#34d399' : isDivision ? '#38bdf8' : isAddon ? '#818cf8' : '#94a3b8',
                                    fontWeight: isTotal ? 700 : isDivision ? 600 : 400,
                                    fontSize: isTotal ? '12px' : '11px',
                                  }}>
                                    {line}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Final Share */}
                            <span style={{ textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '15px' }}>
                              ₹{s.total_share.toLocaleString()}
                            </span>

                            {/* Expand icon */}
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
                    Clean summary with breakdown for each staff member.
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
                    Full audit view with complete calculation breakdown.
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
                >
                  <FileSpreadsheet size={15} /> Excel
                </button>
              </div>
            </div>

            {/* Multiple Dept Report Section */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.08), rgba(234, 179, 8, 0.03))',
              border: '1px solid rgba(234, 179, 8, 0.2)',
              borderRadius: '14px',
              padding: '20px',
              marginTop: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileBarChart size={20} color="#eab308" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>Monthly Multiple Dept Report</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                    Combine all selected departments into one sequential PDF file without layout changes.
                  </p>
                </div>
              </div>
              
              <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Select Departments to Include
                  </p>
                  <button 
                    onClick={() => {
                      if (selectedMultiDepts.size === departments.length) {
                        setSelectedMultiDepts(new Set());
                      } else {
                        setSelectedMultiDepts(new Set(departments.map(d => d.id)));
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: '#eab308', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {selectedMultiDepts.size === departments.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px', padding: '10px' }}>
                  {departments.map((d) => (
                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedMultiDepts.has(d.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedMultiDepts);
                          if (e.target.checked) newSet.add(d.id);
                          else newSet.delete(d.id);
                          setSelectedMultiDepts(newSet);
                        }}
                        style={{ accentColor: '#eab308', width: '14px', height: '14px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={recalculateBeforeExport}
                    onChange={(e) => setRecalculateBeforeExport(e.target.checked)}
                    style={{ accentColor: '#3b82f6', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa', display: 'block' }}>Recalculate latest data before exporting</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ensures all recent changes are reflected (may take a few seconds)</span>
                  </div>
                </label>

                <button
                  className="export-btn"
                  disabled={exportAllLoading}
                  onClick={handleExportAllPDF}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.08))',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: '10px',
                    color: '#eab308',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <FileText size={15} /> {exportAllLoading ? 'Generating...' : 'Export Combined PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
