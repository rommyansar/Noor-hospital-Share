'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Save } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Staff, StaffLeave, LeaveType } from '@/lib/types';
import { MONTHS } from '@/lib/types';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Key: "date|staffId" => LeaveType or null
type PendingChanges = Map<string, LeaveType | null>;

export default function AttendancePage() {
  const { addToast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isReviewed, setIsReviewed] = useState(false);

  // Batch pending changes
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>(new Map());

  const totalDays = getDaysInMonth(year, month);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const loadData = useCallback(async () => {
    setLoading(true);

    // Fetch ALL active staff (global)
    const staffRes = await fetch('/api/staff');
    const staffData = await staffRes.json();
    setStaffList(staffData.filter((s: Staff) => s.is_active));

    // Fetch ALL leaves for this month (global — no department_id)
    const lvRes = await fetch(`/api/leaves?month=${monthStr}`);
    const lvData = await lvRes.json();
    setLeaves(lvData);

    // Fetch global review status for this month
    const statusRes = await fetch(`/api/monthly-status?month=${monthStr}`);
    const statusData = await statusRes.json();
    setIsReviewed(statusData.is_reviewed || false);

    setPendingChanges(new Map());
    setLoading(false);
  }, [monthStr]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleReviewed = async () => {
    const nextVal = !isReviewed;
    const res = await fetch('/api/monthly-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: monthStr,
        is_reviewed: nextVal
      }),
    });
    if (res.ok) {
      setIsReviewed(nextVal);
      addToast('success', `Attendance marked as ${nextVal ? 'Reviewed' : 'Unreviewed'}`);
    } else {
      addToast('error', 'Failed to update review status');
    }
  };

  // Group saved leaves by date
  const leavesByDate = useMemo(() => {
    const map = new Map<string, StaffLeave[]>();
    for (const lv of leaves) {
      if (!map.has(lv.date)) map.set(lv.date, []);
      map.get(lv.date)!.push(lv);
    }
    return map;
  }, [leaves]);

  // Get the effective leave value for a cell
  const getEffectiveValue = (staffId: string, dateStr: string): string => {
    const key = `${dateStr}|${staffId}`;
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key) || '';
    }
    const dateLeaves = leavesByDate.get(dateStr) || [];
    const lv = dateLeaves.find(l => l.staff_id === staffId);
    return lv?.leave_type || '';
  };

  const isCellDirty = (staffId: string, dateStr: string): boolean => {
    return pendingChanges.has(`${dateStr}|${staffId}`);
  };

  const handleLocalChange = (staffId: string, dateStr: string, nextType: string) => {
    const key = `${dateStr}|${staffId}`;
    const dateLeaves = leavesByDate.get(dateStr) || [];
    const originalLv = dateLeaves.find(l => l.staff_id === staffId);
    const originalVal = originalLv?.leave_type || '';
    
    setPendingChanges(prev => {
      const next = new Map(prev);
      if (nextType === originalVal) {
        next.delete(key);
      } else {
        next.set(key, nextType === '' ? null : nextType as LeaveType);
      }
      return next;
    });
  };

  // Save all pending changes in one bulk request (no department_id)
  const handleSaveAll = async () => {
    if (pendingChanges.size === 0) {
      addToast('info', 'No changes to save.');
      return;
    }

    setSaving(true);
    
    const payload = Array.from(pendingChanges.entries()).map(([key, leaveType]) => {
      const [dateStr, staffId] = key.split('|');
      return {
        staff_id: staffId,
        date: dateStr,
        leave_type: leaveType
      };
    });

    try {
      const res = await fetch('/api/leaves/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        addToast('success', `Saved ${payload.length} attendance change(s)`);
        await loadData();
      } else {
        addToast('error', 'Failed to save attendance changes');
      }
    } catch {
      addToast('error', 'Network error while saving');
    }

    setSaving(false);
  };

  const hasChanges = pendingChanges.size > 0;

  // Group staff by department for organized display
  const staffByDept = useMemo(() => {
    const map = new Map<string, Staff[]>();
    for (const s of staffList) {
      const deptName = s.departments?.name || 'Unknown';
      if (!map.has(deptName)) map.set(deptName, []);
      map.get(deptName)!.push(s);
    }
    return map;
  }, [staffList]);

  return (
    <div>
      <div className="page-header">
        <div className="flex flex-col md:flex-row gap-4 justify-between md:items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Attendance Log</h1>
            <p className="text-slate-400 text-sm">Global attendance — applies across all departments.</p>
          </div>
          <div className="flex gap-4 items-center">
            {hasChanges && (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
                {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                hasChanges 
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving...</>
              ) : (
                <><Save size={18} /> Save All</>
              )}
            </button>
            <button
              onClick={toggleReviewed}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isReviewed 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-amber-500 text-white shadow-lg'
              }`}
            >
              {isReviewed ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
              {isReviewed ? 'Reviewed' : 'Review Required'}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card mb-6" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Month</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Year</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-card empty-state">
          <div className="spinner" style={{ margin: '0 auto 16px', width: '24px', height: '24px' }}></div>
          <p className="text-slate-400">Loading attendance data...</p>
        </div>
      ) : staffList.length === 0 ? (
        <div className="glass-card empty-state">
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No active staff found</p>
        </div>
      ) : (
        <div className="glass-card p-0 overflow-hidden border border-slate-700/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24 border-r border-slate-700/50 align-top">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Attendance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
                
                return (
                  <tr key={dateStr} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4 border-r border-slate-700/30 align-top">
                      <span className="font-bold text-white text-lg">
                        {String(day).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {/* Group staff by department */}
                      {Array.from(staffByDept.entries()).map(([deptName, deptStaff]) => (
                        <div key={deptName} className="mb-3 last:mb-0">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">{deptName}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {deptStaff.map(staff => {
                              const currentVal = getEffectiveValue(staff.id, dateStr);
                              const dirty = isCellDirty(staff.id, dateStr);
                              
                              return (
                                <div 
                                  key={`${dateStr}-${staff.id}`} 
                                  className={`flex flex-col p-3 rounded-lg border shadow-sm transition hover:bg-slate-800/60 ${
                                    dirty 
                                      ? 'border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20' 
                                      : 'border-slate-700/50 bg-slate-800/30'
                                  }`}
                                >
                                  <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-sm text-slate-200">{staff.name}</span>
                                      {staff.is_general && (
                                        <span style={{
                                          fontSize: '9px',
                                          fontWeight: 700,
                                          padding: '1px 6px',
                                          borderRadius: '10px',
                                          background: 'rgba(168, 85, 247, 0.15)',
                                          color: '#c084fc',
                                          letterSpacing: '0.5px',
                                        }}>GEN</span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 uppercase">{staff.role}</span>
                                  </div>
                                  <select 
                                    className={`text-xs font-semibold rounded-md border px-2 py-1.5 outline-none transition-colors w-full cursor-pointer ${
                                      currentVal === 'OFF' ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' : 
                                      currentVal === 'CL' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30' : 
                                      'bg-slate-900/50 border-slate-600/50 text-slate-300 hover:border-slate-500'
                                    }`}
                                    value={currentVal}
                                    onChange={(e) => handleLocalChange(staff.id, dateStr, e.target.value)}
                                  >
                                    <option value="" className="bg-slate-800 text-slate-300">Present (Default)</option>
                                    <option value="OFF" className="bg-slate-800 text-red-400">OFF</option>
                                    <option value="CL" className="bg-slate-800 text-amber-400">CL</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating Save Bar */}
      {hasChanges && !saving && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-3 px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-bold shadow-2xl shadow-emerald-500/30 transition-all hover:scale-105"
          >
            <Save size={20} />
            Save {pendingChanges.size} Change{pendingChanges.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
