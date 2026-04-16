'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Save, Filter, Calendar, X, Lock, Unlock } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, Staff, StaffLeave } from '@/lib/types';

function getCurrentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type PendingChanges = Map<string, string>;

export default function AttendancePage() {
  const { addToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isReviewed, setIsReviewed] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [addonDeptIds, setAddonDeptIds] = useState<Set<string>>(new Set());

  // Pending changes stores exactly what the user typed in the text box e.g. "2, 14"
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>(new Map());

  // Fetch departments once
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/departments');
      const data: Department[] = await res.json();
      const active = data.filter(d => d.is_active);
      setDepartments(active);
      if (active.length > 0 && !selectedDeptId) {
        setSelectedDeptId(active[0].id);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDept = useMemo(() => departments.find(d => d.id === selectedDeptId), [departments, selectedDeptId]);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Fetch all data in parallel (was 3 sequential calls → 1 batch)
    const [staffRes, lvRes, statusRes] = await Promise.all([
      fetch('/api/staff?t=' + Date.now(), { cache: 'no-store' }),
      fetch(`/api/leaves?month=${selectedMonth}`),
      fetch(`/api/monthly-status?month=${selectedMonth}`),
    ]);

    const [staffData, lvData, statusData] = await Promise.all([
      staffRes.json(),
      lvRes.json(),
      statusRes.json(),
    ]);

    setStaffList(staffData.filter((s: Staff) => s.is_active));
    setLeaves(lvData);
    setIsReviewed(statusData.is_reviewed || false);
    setIsLocked(statusData.is_locked || false);

    setPendingChanges(new Map());
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch addons specifically for the selected department and month to hide addon staff
  useEffect(() => {
    async function loadAddons() {
      if (!selectedDeptId || selectedDeptId === 'all') {
        setAddonDeptIds(new Set());
        return;
      }
      try {
        const addonRes = await fetch(`/api/monthly-addons?department_id=${selectedDeptId}`);
        if (addonRes.ok) {
          const addonData = await addonRes.json();
          const ids = new Set<string>((addonData || [])
            .filter((a: any) => a.addon_department_id)
            .map((a: any) => a.addon_department_id));
          setAddonDeptIds(ids);
        } else {
          setAddonDeptIds(new Set());
        }
      } catch (e) {
        setAddonDeptIds(new Set());
      }
    }
    loadAddons();
  }, [selectedDeptId, selectedMonth]);

  const toggleReviewed = async () => {
    const nextVal = !isReviewed;
    const res = await fetch('/api/monthly-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth, is_reviewed: nextVal }),
    });
    if (res.ok) {
      setIsReviewed(nextVal);
      addToast('success', `Attendance marked as ${nextVal ? 'Reviewed' : 'Unreviewed'}`);
    } else {
      addToast('error', 'Failed to update review status');
    }
  };

  const toggleLocked = async () => {
    const nextVal = !isLocked;
    const res = await fetch('/api/monthly-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth, is_locked: nextVal }),
    });
    if (res.ok) {
      setIsLocked(nextVal);
      addToast('success', nextVal ? '🔒 Attendance locked — no changes allowed.' : '🔓 Attendance unlocked — editing enabled.');
    } else {
      addToast('error', 'Failed to update lock status');
    }
  };

  const filteredStaff = useMemo(() => {
    if (selectedDeptId === 'all') {
      return staffList;
    }
    if (!selectedDeptId) return [];
    
    // Include staff assigned to this department
    const baseStaff = staffList.filter(s => s.department_ids?.includes(selectedDeptId));
    
    // Exclude those who belong to an addon department (e.g., sweepers in ENT)
    return baseStaff.filter(s => {
      const ids = s.department_ids || [s.department_id];
      return !ids.some(id => addonDeptIds.has(id));
    });
  }, [staffList, selectedDeptId, addonDeptIds]);

  // Pre-calculate original string values (comma separated days) for each staff
  const originalStrings = useMemo(() => {
    const map: Record<string, string> = {};
    leaves.forEach(lv => {
      // both OFF and CL treated identically now, we just pull the date day
      const dayStr = lv.date.split('-')[2];
      const dayNum = parseInt(dayStr, 10);
      if (!isNaN(dayNum)) {
        if (!map[lv.staff_id]) map[lv.staff_id] = '';
        if (map[lv.staff_id].length > 0) map[lv.staff_id] += ', ';
        map[lv.staff_id] += dayNum;
      }
    });
    // Sort the numbers for neatness
    Object.keys(map).forEach(k => {
      map[k] = map[k].split(', ').map(Number).sort((a,b) => a-b).join(', ');
    });
    return map;
  }, [leaves]);

  const parseDays = (str: string) => {
    return Array.from(new Set(
      str.split(/[\s,]+/)
         .map(s => parseInt(s, 10))
         .filter(n => !isNaN(n) && n >= 1 && n <= 31)
    )).sort((a, b) => a - b);
  };

  const getEffectiveValue = (staffId: string) => {
    if (pendingChanges.has(staffId)) {
      return pendingChanges.get(staffId)!;
    }
    return originalStrings[staffId] || '';
  };

  const handleLocalChange = (staffId: string, val: string) => {
    const original = originalStrings[staffId] || '';
    
    setPendingChanges(prev => {
      const nextMap = new Map(prev);
      
      const valParsed = parseDays(val).join(', ');
      const origParsed = parseDays(original).join(', ');

      if (valParsed === origParsed) {
        nextMap.delete(staffId);
      } else {
        nextMap.set(staffId, val);
      }
      return nextMap;
    });
  };

  const handleDeptChange = (newDeptId: string) => {
    if (pendingChanges.size > 0) {
      const confirmed = window.confirm('You have unsaved changes. Switching departments will discard them. Continue?');
      if (!confirmed) return;
      setPendingChanges(new Map());
    }
    setSelectedDeptId(newDeptId);
  };

  const handleMonthChange = (newMonth: string) => {
    if (pendingChanges.size > 0) {
      const confirmed = window.confirm('You have unsaved changes. Changing months will discard them. Continue?');
      if (!confirmed) return;
      setPendingChanges(new Map());
    }
    setSelectedMonth(newMonth);
  };

  const handleSaveAll = async () => {
    if (pendingChanges.size === 0) return;
    if (isLocked) {
      addToast('error', 'Attendance is locked. Unlock it first to save changes.');
      return;
    }
    setSaving(true);
    
    const payload = Array.from(pendingChanges.entries()).map(([staffId, rawString]) => ({
      staff_id: staffId,
      off_dates: parseDays(rawString)
    }));

    try {
      const res = await fetch('/api/leaves/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, data: payload })
      });

      if (res.ok) {
        addToast('success', `Saved attendance for ${selectedMonth}`);
        await loadData();
      } else if (res.status === 403) {
        addToast('error', 'Attendance is locked for this month.');
        setIsLocked(true);
      } else {
        addToast('error', 'Failed to save attendance');
      }
    } catch {
      addToast('error', 'Network error while saving');
    }
    setSaving(false);
  };

  const hasChanges = pendingChanges.size > 0;
  const monthName = MONTHS[parseInt(selectedMonth.split('-')[1]) - 1];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="page-header">
        <div className="flex flex-col md:flex-row gap-4 justify-between md:items-end mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Attendance Log</h1>
            <p className="text-slate-400 text-sm">
              Enter the exact dates (e.g. "3, 14, 25") each staff member took an OFF.
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {hasChanges && (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full ring-1 ring-amber-500/20">
                Unsaved changes
              </span>
            )}
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-1 rounded-md border border-slate-700 uppercase tracking-tighter">
              Global Attendance
            </span>
            <button
              onClick={toggleLocked}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                isLocked
                  ? 'bg-amber-500/15 text-amber-400 border-2 border-amber-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:border-amber-500/30 hover:text-amber-400'
              }`}
            >
              {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
              {isLocked ? 'Locked' : 'Unlocked'}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving || isLocked}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                hasChanges && !isLocked ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {saving ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Save size={18} />}
              Save All
            </button>
            <button
              onClick={toggleReviewed}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isReviewed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500 text-white shadow-lg'
              }`}
            >
              {isReviewed ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
              {isReviewed ? 'Reviewed' : 'Review Required'}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card mb-6" style={{ padding: '20px' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Calendar size={12} className="inline mr-1 -mt-0.5" /> Month
            </label>
            <input 
              type="month"
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Filter size={12} className="inline mr-1 -mt-0.5" /> Department Filter
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              value={selectedDeptId}
              onChange={(e) => handleDeptChange(e.target.value)}
            >
              <option value="" disabled>Select Department</option>
              <option value="all">🏢 ALL STAFF (Global)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="glass-card mb-6" style={{ padding: '16px 20px', background: 'rgba(245, 158, 11, 0.08)', border: '2px solid rgba(245, 158, 11, 0.25)' }}>
          <div className="flex items-center gap-3">
            <Lock size={20} className="text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-400 mb-0.5">🔒 Attendance Locked</p>
              <p className="text-xs text-amber-300/70">This month's attendance is locked. All fields are read-only. Click the "Locked" button above to unlock and enable editing.</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-card empty-state">
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p className="text-slate-400">Loading attendance data...</p>
        </div>
      ) : !selectedDeptId ? (
        <div className="glass-card empty-state">
          <p className="text-lg font-medium">Select a department to view staff</p>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="glass-card empty-state">
          <p className="text-lg font-medium">No staff found in this department</p>
        </div>
      ) : (
        <div className="glass-card p-0 overflow-hidden border border-slate-700/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700/50 text-slate-300">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider">Staff Member</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider w-1/2">Absence Dates ({monthName})</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center w-32">Total OFFs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredStaff.map(staff => {
                const currentStr = getEffectiveValue(staff.id);
                const dirty = pendingChanges.has(staff.id);
                const offCount = parseDays(currentStr).length;

                return (
                  <tr key={staff.id} className={`transition-colors group ${dirty ? 'bg-amber-500/5' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{staff.name}</span>
                          {staff.staff_code && (
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono border border-slate-700">
                              {staff.staff_code}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 uppercase mt-1">{staff.role}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="relative flex items-center gap-2">
                          <input 
                            type="text"
                            className={`flex-1 bg-slate-900 border text-white rounded-lg px-4 py-2.5 focus:outline-none transition-colors ${
                              isLocked
                                ? 'border-slate-700/50 opacity-60 cursor-not-allowed'
                                : dirty 
                                  ? 'border-amber-500' 
                                  : 'border-slate-700 focus:border-emerald-500'
                            }`}
                            value={currentStr}
                            placeholder="e.g. 2, 5, 14, 25"
                            onChange={(e) => handleLocalChange(staff.id, e.target.value)}
                            disabled={isLocked}
                          />
                          {currentStr && !isLocked && (
                            <button
                              onClick={() => handleLocalChange(staff.id, '')}
                              className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                              title="Clear all dates"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-bold ${offCount > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                        {offCount}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
