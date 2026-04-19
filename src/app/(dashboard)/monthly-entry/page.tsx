'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { CalendarPlus, Save, Users, X, CheckSquare, Square, BookOpen, Lock, Unlock } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, DailyIncome, StaffLeave, Staff, DepartmentRule } from '@/lib/types';
import { MONTHS } from '@/lib/types';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface IncomeState {
  amount: number;
  present_staff_ids: string[] | null;
}

// ── Multi-Entry model: same staff can appear N times with different role/% ──
interface StaffEntry {
  entry_id: string;
  staff_id: string;
  role: string;
  percentage: number;
  dist_type: 'individual' | 'group';
  amount?: number; // manual entries only
}

export default function MonthlyEntryPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [incomes, setIncomes] = useState<Record<string, IncomeState>>({});
  const [leavesByDate, setLeavesByDate] = useState<Record<string, Set<string>>>({});
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [autoEntries, setAutoEntries] = useState<StaffEntry[]>([]);
  const [manualEntries, setManualEntries] = useState<StaffEntry[]>([]);
  const [globalStaffList, setGlobalStaffList] = useState<Staff[]>([]);
  const [staffAmounts, setStaffAmounts] = useState<Record<string, string>>({});
  const [deptTotalAmount, setDeptTotalAmount] = useState<string>('');

  // Rules State
  const [deptRules, setDeptRules] = useState<DepartmentRule[]>([]);
  const [appliedMainRules, setAppliedMainRules] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [reportHeading, setReportHeading] = useState<string>('');

  // Addon State
  const [addons, setAddons] = useState<any[]>([]);
  const [addonStaffMap, setAddonStaffMap] = useState<Record<string, Staff[]>>({});
  const [addonRulesMap, setAddonRulesMap] = useState<Record<string, DepartmentRule[]>>({});

  // Modal State
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState<Set<string>>(new Set());
  const [modalSaving, setModalSaving] = useState(false);
  const [allDaysSaving, setAllDaysSaving] = useState(false);

  const totalDays = getDaysInMonth(year, month);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments', { cache: 'no-store' });
    const data = await res.json();
    setDepartments(data.filter((d: Department) => d.is_active));
  };

  const loadData = useCallback(async () => {
    if (!selectedDept) {
      setIncomes({});
      setLeavesByDate({});
      setStaffList([]);
      return;
    }
    setLoading(true);

    try {
      // ── BATCH 1: Fetch ALL independent data in parallel (was 7+ sequential calls → 1 batch) ──
      const [dtRes, staffRes, saRes, addonRes, rulesRes, inRes, lvRes] = await Promise.all([
        fetch(`/api/monthly-totals?department_id=${selectedDept}&month=${monthStr}`),
        fetch(`/api/staff`),
        fetch(`/api/monthly-staff-amounts?department_id=${selectedDept}&month=${monthStr}`),
        fetch(`/api/monthly-addons?department_id=${selectedDept}&month=${monthStr}`),
        fetch(`/api/rules?department_id=${selectedDept}`),
        fetch(`/api/daily-income?department_id=${selectedDept}&month=${monthStr}`),
        fetch(`/api/leaves?month=${monthStr}`),
      ]);

      let rawAutoEntries: any[] = [];
      let rawManualEntries: any[] = [];

      // Process Dept Total Amount
      if (dtRes.ok) {
        const dtData = await dtRes.json();
        setDeptTotalAmount(dtData?.total_amount ? dtData.total_amount.toString() : '');
        setAppliedMainRules(dtData?.applied_rules || []);
        setIsLocked(!!dtData?.is_locked);
        setReportHeading(dtData?.report_heading || '');
        rawAutoEntries = dtData?.auto_staff_ids || [];
        rawManualEntries = dtData?.manual_staff_ids || [];
      } else {
        setDeptTotalAmount('');
        setAppliedMainRules([]);
        setIsLocked(false);
        setReportHeading('');
      }

      // Process Staff
      const staffData = await staffRes.json();
      const allActiveStaff = Array.isArray(staffData) ? staffData.filter(s => s.is_active) : [];
      setGlobalStaffList(allActiveStaff);

      // Process Staff Amounts
      const saData = await saRes.json();
      const newStaffAmounts: Record<string, string> = {};
      const savedStaffIds = new Set<string>();
      if (Array.isArray(saData)) {
        saData.forEach((sa: any) => {
          newStaffAmounts[sa.staff_id] = sa.amount.toString();
          savedStaffIds.add(sa.staff_id);
        });
      }
      setStaffAmounts(newStaffAmounts);

      // Process Addons
      let loadedAddons: any[] = [];
      if (addonRes.ok) {
        const addonData = await addonRes.json();
        loadedAddons = Array.isArray(addonData) ? addonData : [];
        setAddons(loadedAddons);
      }

      // Process Rules
      let loadedActiveRules: DepartmentRule[] = [];
      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        loadedActiveRules = Array.isArray(rulesData) ? rulesData.filter((r: DepartmentRule) => r.is_active) : [];
        setDeptRules(loadedActiveRules);
        setAppliedMainRules(prev => prev.length === 0 ? loadedActiveRules.map(r => r.id) : prev);
      } else {
        setDeptRules([]);
      }

      // ── BATCH 2: Fetch addon department staff & rules in parallel (was sequential loop) ──
      const addonDeptIds = loadedAddons.filter(a => a.addon_department_id).map(a => a.addon_department_id);
      const addonPromises = addonDeptIds.map(addonDeptId =>
        Promise.all([
          fetch(`/api/staff?department_id=${addonDeptId}`),
          fetch(`/api/rules?department_id=${addonDeptId}`),
        ]).then(async ([sRes, rRes]) => {
          const sData = sRes.ok ? await sRes.json() : [];
          const rData = rRes.ok ? await rRes.json() : [];
          return {
            deptId: addonDeptId,
            staff: Array.isArray(sData) ? sData.filter((s: Staff) => s.is_active) : [],
            rules: Array.isArray(rData) ? rData.filter((r: DepartmentRule) => r.is_active) : [],
          };
        })
      );
      const addonResults = await Promise.all(addonPromises);

      const newAddonStaffMap: Record<string, Staff[]> = {};
      const newAddonRulesMap: Record<string, DepartmentRule[]> = {};
      for (const result of addonResults) {
        newAddonStaffMap[result.deptId] = result.staff;
        newAddonRulesMap[result.deptId] = result.rules;
      }
      setAddonStaffMap(newAddonStaffMap);
      setAddonRulesMap(newAddonRulesMap);

      // Build filtered staff list
      const baseStaff = allActiveStaff.filter(s => {
        const ids = s.department_ids || [s.department_id];
        return ids.includes(selectedDept) || savedStaffIds.has(s.id);
      });
      const addonIdSet = new Set(addonDeptIds);
      const filteredStaff = baseStaff.filter((s: Staff) => {
        const ids = s.department_ids || [s.department_id];
        return !ids.some(id => addonIdSet.has(id));
      });
      setStaffList(filteredStaff);

      // Parse auto/manual entries with backward compat for old string[] format
      const migrateEntry = (raw: any, isManual: boolean): StaffEntry | null => {
        if (typeof raw === 'object' && raw !== null && raw.staff_id) {
          // New format — use directly
          return raw as StaffEntry;
        }
        if (typeof raw === 'string') {
          // Old format — migrate from staff_id string
          const staffObj = allActiveStaff.find(s => s.id === raw);
          if (!staffObj) return null;
          const matchedRule = loadedActiveRules.find((r: DepartmentRule) => r.role.toUpperCase().trim() === staffObj.role.toUpperCase().trim());
          const entry: StaffEntry = {
            entry_id: crypto.randomUUID(),
            staff_id: raw,
            role: staffObj.role,
            percentage: matchedRule ? Number(matchedRule.percentage) : 0,
            dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
          };
          if (isManual) {
            entry.amount = Number(newStaffAmounts[raw]) || 0;
          }
          return entry;
        }
        return null;
      };
      const parsedAuto = rawAutoEntries.map((r: any) => migrateEntry(r, false)).filter(Boolean) as StaffEntry[];
      const parsedManual = rawManualEntries.map((r: any) => migrateEntry(r, true)).filter(Boolean) as StaffEntry[];
      setAutoEntries(parsedAuto);
      setManualEntries(parsedManual);

      // Process Incomes
      const inData = await inRes.json();
      const newIncomes: Record<string, IncomeState> = {};
      if (Array.isArray(inData)) {
        inData.forEach((d: DailyIncome) => {
          if (d.amount > 0 || d.present_staff_ids !== null) {
            newIncomes[d.date] = {
              amount: d.amount,
              present_staff_ids: d.present_staff_ids ?? null
            };
          }
        });
      }
      setIncomes(newIncomes);

      // Process Leaves
      const lvData = await lvRes.json();
      const newLeaves: Record<string, Set<string>> = {};
      if (Array.isArray(lvData)) {
        lvData.forEach((lv: StaffLeave) => {
          if (!newLeaves[lv.date]) newLeaves[lv.date] = new Set();
          newLeaves[lv.date].add(lv.staff_id);
        });
      }
      setLeavesByDate(newLeaves);
    } catch (err: any) {
      console.error('loadData error:', err);
      addToast('error', `Failed to load data: ${err.message}`);
    }

    setLoading(false);
  }, [selectedDept, monthStr, addToast, departments]);

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { loadData(); }, [loadData]);


  const handleIncomeChange = (day: number, val: string) => {
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const amount = val === '' ? 0 : parseFloat(val);
    setIncomes(prev => ({
      ...prev,
      [dateStr]: {
        amount: isNaN(amount) ? 0 : amount,
        present_staff_ids: prev[dateStr]?.present_staff_ids || null
      }
    }));
  };

  const handleSaveAll = async () => {
    if (!selectedDept) return;
    setSaving(true);

    const isStaffBased = departments.find(d => d.id === selectedDept)?.calculation_method === 'staff_based';
    const isAutoManual = departments.find(d => d.id === selectedDept)?.calculation_method === 'auto_manual';

    try {
      // Save staff amounts only for staff_based mode (NOT auto_manual - amounts embedded in entries)
      if (isStaffBased) {
        const entriesToSave = staffList.map(staff => {
          const amt = parseFloat(staffAmounts[staff.id]) || 0;
          return {
            staff_id: staff.id,
            amount: amt,
            distribution_type: undefined,
            percentage: null
          };
        });

        const res = await fetch('/api/monthly-staff-amounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: selectedDept,
            month: monthStr,
            entries: entriesToSave
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to save staff amounts');
        }
      }
      
      if (!isStaffBased || isAutoManual) {
        // Save daily income records
        const recordsToSave = [];
        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const state = incomes[dateStr] || { amount: 0, present_staff_ids: null };
          recordsToSave.push({
            department_id: selectedDept,
            date: dateStr,
            amount: state.amount,
            present_staff_ids: state.present_staff_ids
          });
        }

        const res = await fetch('/api/monthly-income', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordsToSave),
        });

        if (!res.ok) {
          throw new Error('Failed to save');
        }
      }

      // Save Addon Config (with applied_rules and without calculation_type)
      await fetch('/api/monthly-addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: selectedDept,
          month: monthStr,
          addons: addons.filter(a => a.addon_department_id && a.percentage > 0).map(a => ({
            addon_department_id: a.addon_department_id,
            percentage: a.percentage,
            attendance_rule: a.attendance_rule || 'none',
            applied_rules: a.applied_rules || [],
            amount_source: a.amount_source || 'TDA',
            manual_amount: a.amount_source === 'MANUAL' ? parseFloat(a.manual_amount) || null : null
          }))
        })
      });

      // Save Dept Total Amount, Applied Rules, and Structured Entries
      const totalsRes = await fetch('/api/monthly-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: selectedDept,
          month: monthStr,
          total_amount: parseFloat(deptTotalAmount) || 0,
          applied_rules: appliedMainRules,
          is_locked: isLocked,
          report_heading: reportHeading || null,
          // For auto_manual: save full structured entry objects
          auto_staff_ids: isAutoManual ? autoEntries : [],
          manual_staff_ids: isAutoManual ? manualEntries : []
        })
      });
      if (!totalsRes.ok) {
        const errBody = await totalsRes.json().catch(() => ({}));
        console.error('monthly-totals save failed:', errBody);
        throw new Error(errBody.error || 'Failed to save monthly totals');
      }

      addToast('success', 'Monthly entry saved successfully');
      // Re-fetch ALL data AFTER all saves complete to avoid race conditions
      await loadData();

    } catch (err) {
      addToast('error', 'An error occurred while saving.');
    }

    setSaving(false);
  };

  const handleStaffAmountChange = (staffId: string, val: string) => {
    setStaffAmounts(prev => ({
      ...prev,
      [staffId]: val
    }));
  };

  const changeAttendanceRule = async (rule: 'daily' | 'monthly' | 'none', deptIdOverride?: string) => {
    const targetId = deptIdOverride || selectedDept;
    if (!targetId) return;
    try {
      const res = await fetch(`/api/departments/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_rule: rule })
      });
      if (res.ok) {
        addToast('success', 'Attendance rule updated');
        fetchDepartments();
      } else {
        addToast('error', 'Failed to update');
      }
    } catch {
      addToast('error', 'Failed to update');
    }
  };

  const changeIncomeType = async (method: 'income' | 'staff_based' | 'auto_manual') => {
    if (!selectedDept) return;
    try {
      const res = await fetch(`/api/departments/${selectedDept}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calculation_method: method })
      });
      if (res.ok) {
        addToast('success', 'Income type updated');
        fetchDepartments();
      } else {
        addToast('error', 'Failed to update');
      }
    } catch {
      addToast('error', 'Failed to update');
    }
  };

  const selectedDepartmentData = departments.find(d => d.id === selectedDept);
  const deptName = selectedDepartmentData?.name || '';
  const attendanceRule = selectedDepartmentData?.attendance_rule || 'daily';
  const isStaffBased = selectedDepartmentData?.calculation_method === 'staff_based';
  const isAutoManual = selectedDepartmentData?.calculation_method === 'auto_manual';
  const isMonthlyBased = attendanceRule === 'monthly';


  const totalIncome = Object.values(incomes).reduce((sum, val) => sum + (val?.amount || 0), 0);
  const totalStaffAmount = Object.values(staffAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  // Derive unique staff objects from autoEntries for attendance modal
  const uniqueAutoStaff: Staff[] = (() => {
    const seen = new Set<string>();
    const result: Staff[] = [];
    for (const entry of autoEntries) {
      if (!seen.has(entry.staff_id)) {
        seen.add(entry.staff_id);
        const staffObj = globalStaffList.find(s => s.id === entry.staff_id);
        if (staffObj) result.push(staffObj);
      }
    }
    return result;
  })();

  // Modal Handlers
  const openModal = (dateStr: string) => {
    const existingExplicit = incomes[dateStr]?.present_staff_ids;
    if (existingExplicit) {
      setTempSelection(new Set(existingExplicit));
    } else {
      // Default: All staff minus those on leave
      const leaves = leavesByDate[dateStr] || new Set();
      const targetList = isAutoManual ? uniqueAutoStaff : staffList;
      const defaultPresent = targetList.filter(s => !leaves.has(s.id)).map(s => s.id);
      setTempSelection(new Set(defaultPresent));
    }

    setEditingDate(dateStr);
  };

  const toggleStaff = (id: string) => {
    const next = new Set(tempSelection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTempSelection(next);
  };

  const toggleAll = (select: boolean) => {
    if (!editingDate) return;
    const targetList = isAutoManual ? uniqueAutoStaff : staffList;
    if (select) {
      setTempSelection(new Set(targetList.map(s => s.id)));
    } else {
      setTempSelection(new Set());
    }
  };

  const toggleRole = (role: string, select: boolean) => {
    if (!editingDate) return;
    const next = new Set(tempSelection);
    const targetList = isAutoManual ? uniqueAutoStaff : staffList;
    targetList.filter(s => s.role === role).forEach(s => {
      if (select) next.add(s.id);
      else next.delete(s.id);
    });
    setTempSelection(next);
  };

  const saveModalSelection = async () => {
    if (!editingDate) return;
    setModalSaving(true);

    // Save presence locally only (department-scoped via present_staff_ids).
    // This does NOT touch global attendance (staff_leaves).
    // Data will persist to daily_income when user clicks "Save Month".
    setIncomes(prev => ({
      ...prev,
      [editingDate]: {
        amount: prev[editingDate]?.amount || 0,
        present_staff_ids: Array.from(tempSelection)
      }
    }));

    setModalSaving(false);
    setEditingDate(null);
    addToast('success', 'Staff selection saved for ' + editingDate.split('-')[2]);
  };

  const handleApplyToAllDays = async () => {
    if (!editingDate || !selectedDept) return;
    if (!confirm('This will apply this exact staff selection to EVERY day of this month. Existing daily staff selections for this department will be overwritten. Continue?')) return;
    
    setAllDaysSaving(true);
    
    try {
      const newIncomes = { ...incomes };
      const selectionArr = Array.from(tempSelection);

      // Only update local present_staff_ids — no global attendance sync.
      // Data will persist to daily_income when user clicks "Save Month".
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
        
        // If "Apply to All" is clicked, we apply exactly what's selected, 
        // overriding typical 'auto' expected.
        newIncomes[dateStr] = {
          amount: newIncomes[dateStr]?.amount || 0,
          present_staff_ids: selectionArr
        };
      }

      setIncomes(newIncomes);
      addToast('success', `Applied selection to all ${totalDays} days of the month.`);
      setEditingDate(null);
    } catch (err) {
      addToast('error', 'An error occurred during bulk apply.');
    } finally {
      setAllDaysSaving(false);
    }
  };

  // Group staff by role for the modal
  const getStaffByRole = () => {
    const targetList = isAutoManual ? uniqueAutoStaff : staffList;
    return targetList.reduce((acc, staff) => {
      if (!acc[staff.role]) acc[staff.role] = [];
      acc[staff.role].push(staff);
      return acc;
    }, {} as Record<string, Staff[]>);
  };
  const staffByRole = getStaffByRole();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Entry</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Quickly enter daily income and explicit present staff
          </p>
        </div>
        {selectedDept && (
          <button
            className="btn btn-primary"
            onClick={handleSaveAll}
            disabled={saving || loading}
          >
            {saving ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 8 }} /> : <Save size={18} style={{ marginRight: 8 }} />}
            Save Month
          </button>
        )}
      </div>

      <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              <option value="">Select Department...</option>
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

      {selectedDept && (
        <div className="glass-card mb-6" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span style={{ color: '#10b981' }}>💰</span> Total Department Income
            </h3>
            <button
              onClick={async () => {
                const newLocked = !isLocked;
                setIsLocked(newLocked);
                try {
                  await fetch('/api/monthly-totals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      department_id: selectedDept,
                      month: monthStr,
                      total_amount: parseFloat(deptTotalAmount) || 0,
                      applied_rules: appliedMainRules,
                      is_locked: newLocked
                    })
                  });
                  addToast('success', newLocked ? `🔒 ${deptName} locked — batch calculations will skip this department.` : `🔓 ${deptName} unlocked.`);
                } catch {
                  setIsLocked(!newLocked);
                  addToast('error', 'Failed to update lock status');
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                border: isLocked ? '2px solid #f59e0b' : '1px solid rgba(71, 85, 105, 0.3)',
                background: isLocked ? 'rgba(245, 158, 11, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                color: isLocked ? '#fbbf24' : '#94a3b8',
                cursor: 'pointer', transition: 'all 0.2s ease',
                textTransform: 'uppercase', letterSpacing: '0.5px'
              }}
            >
              {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
              {isLocked ? 'Locked' : 'Unlocked'}
            </button>
          </div>
          {isLocked && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
              background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)'
            }}>
              <p style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600, margin: 0 }}>
                🔒 This department is locked. Its calculations will be preserved when running batch "Calculate All" operations.
              </p>
            </div>
          )}
          <p className="text-xs text-slate-400 mb-4">Enter the total department income for the month. All percentage rules will be applied on this amount. Add-on departments will also receive their share from this total.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label text-xs">Total Department Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                value={deptTotalAmount}
                onChange={(e) => setDeptTotalAmount(e.target.value)}
                placeholder="e.g. 50000"
                style={{ fontSize: '18px', fontWeight: 700, padding: '12px 16px' }}
              />
            </div>
            <div>
              <label className="form-label text-xs">Report Heading (optional)</label>
              <input
                type="text"
                className="input-field"
                value={reportHeading}
                onChange={(e) => setReportHeading(e.target.value)}
                placeholder="e.g. Special Note for March Report"
                style={{ fontSize: '14px', padding: '12px 16px' }}
              />
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>This text will appear as a heading in the PDF/Excel report.</p>
            </div>
          </div>
        </div>
      )}

      {/* Department Rules Summary */}
      {selectedDept && deptRules.length > 0 && (
        <div className="glass-card mb-6" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} style={{ color: '#60a5fa' }} /> Apply Department Rules for {deptName}
          </h3>
          <p className="text-xs text-slate-400 mb-4">Select which rules you want to actively apply to the main department calculation for this month.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {deptRules.map(rule => {
              const matchingStaff = staffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim());
              const isApplied = appliedMainRules.includes(rule.id);
              return (
                <div
                  key={rule.id}
                  onClick={() => {
                    setAppliedMainRules(prev =>
                      prev.includes(rule.id) ? prev.filter(id => id !== rule.id) : [...prev, rule.id]
                    );
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: isApplied ? '2px solid #10b981' : '1px solid rgba(71, 85, 105, 0.3)',
                    background: isApplied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isApplied ? 1 : 0.6
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isApplied ? <CheckSquare size={16} style={{ color: '#10b981' }} /> : <Square size={16} style={{ color: '#64748b' }} />}
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                        background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px'
                      }}>{rule.role}</span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                      background: rule.distribution_type === 'group' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                      color: rule.distribution_type === 'group' ? '#fbbf24' : '#60a5fa'
                    }}>
                      {rule.distribution_type === 'group' ? '👥 Group' : '👤 Individual'}
                    </span>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    {rule.percentage}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    {matchingStaff.length > 0 ? (
                      <span>{matchingStaff.length} local staff: {matchingStaff.map(s => s.name).join(', ')}</span>
                    ) : globalStaffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id))).length > 0 ? (
                      <span style={{ color: '#60a5fa' }} title="These staff members receive their share automatically via the External Add-On system.">
                        {globalStaffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id))).length} staff handled via Add-On System
                      </span>
                    ) : (
                      <span style={{ color: '#ef4444' }}>⚠ No staff assigned globally</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {staffList.filter(s => !deptRules.find(r => r.role.toUpperCase().trim() === s.role.toUpperCase().trim())).length > 0 && (
            <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <p style={{ fontSize: '12px', color: '#f87171', fontWeight: 600, margin: 0 }}>
                ⚠ Unmatched Staff (no rule for their role):
              </p>
              <p style={{ fontSize: '12px', color: '#fca5a5', margin: '4px 0 0' }}>
                {staffList.filter(s => !deptRules.find(r => r.role.toUpperCase().trim() === s.role.toUpperCase().trim())).map(s => `${s.name} (${s.role})`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Staff-wise Share Breakdown Preview */}
      {selectedDept && deptRules.length > 0 && (staffList.length > 0 || autoEntries.length > 0 || manualEntries.length > 0) && (() => {
        if (isAutoManual) {
          return (
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.4)' }}>
              <div style={{ fontSize: '18px', marginBottom: '8px' }}>🚀</div>
              <h3 style={{ fontSize: '15px', color: '#60a5fa', margin: '0 0 4px 0' }}>Complex Hybrid Calculation</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, maxWidth: '600px', display: 'inline-block' }}>
                Preview is currently disabled for Manual Staff Entry mode. Save the month and generate the report to view the final shares!
              </p>
            </div>
          );
        }
        const tda = parseFloat(deptTotalAmount) || 0;
        const colCount = isMonthlyBased ? 7 : 6;

        const effectiveStaffList = staffList;

        // Build role counts for group distribution (only from selected/effective staff)
        const roleCounts: Record<string, number> = {};
        effectiveStaffList.forEach(s => {
          const rKey = s.role.toUpperCase().trim();
          roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
        });

        // Count off/CL days per staff from leavesByDate
        // Use department-level present_staff_ids from incomes (not global leaves)
        const getAbsentDays = (staffId: string): number => {
          let absent = 0;
          for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
            const dayData = incomes[dateStr];
            if (dayData && dayData.present_staff_ids && dayData.present_staff_ids.length > 0) {
              // Explicit staff list exists — absent if not in it
              if (!dayData.present_staff_ids.includes(staffId)) absent++;
            } else {
              // No explicit list — fall back to global leaves
              if (leavesByDate[dateStr]?.has(staffId)) absent++;
            }
          }
          return absent;
        };

        type RowData = {
          staff: Staff;
          rule: DepartmentRule | null;
          pct: number;
          distType: string;
          estimatedAmount: number;
          poolTotal: number;
          absentDays: number;
          workingDays: number;
          section: string;
          adjustedBase: number;
          workAmount: number;
        };

        // === Primary Department Staff ===
        const primaryRows: RowData[] = effectiveStaffList.map(s => {
          const rKey = s.role.toUpperCase().trim();
          const rule = deptRules.find(r => r.role.toUpperCase().trim() === rKey);
          const absentDays = getAbsentDays(s.id);
          const workingDays = totalDays - absentDays;

          if (!rule) return { staff: s, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'primary', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

          const pct = parseFloat(rule.percentage) || 0;
          const overridePct = s.department_percentages?.[selectedDept];
          const effectivePct = (overridePct && String(overridePct).trim() !== '') ? parseFloat(String(overridePct)) : pct;

          let amount = 0;
          let poolTotal = 0;
          let adjustedBase = 0;

          const isNone = attendanceRule === 'none';

          if (tda > 0 || Object.keys(incomes).length > 0) {
            // DAILY LOOP SIMULATION
            for (let d = 1; d <= totalDays; d++) {
              const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
              const dayData = incomes[dateStr];
              const dailyIncomeAmount = tda > 0 ? (tda / totalDays) : (dayData?.amount || 0);
              if (dailyIncomeAmount <= 0) continue;

              // staff presence
              const isLeave = (!isNone) && leavesByDate[dateStr]?.has(s.id);

              let isPresent = false;
              let presentRoleCount = 0;

              if (dayData && dayData.present_staff_ids && dayData.present_staff_ids.length > 0) {
                isPresent = dayData.present_staff_ids.includes(s.id) && !isLeave;
                // count how many in this role are present today
                effectiveStaffList.forEach(st => {
                  if (dayData.present_staff_ids!.includes(st.id) && st.role.toUpperCase().trim() === rKey && (!(!isNone && leavesByDate[dateStr]?.has(st.id)))) {
                    presentRoleCount++;
                  }
                });
              } else {
                isPresent = !isLeave;
                // count all staff in this role not on leave
                effectiveStaffList.forEach(st => {
                  if (st.role.toUpperCase().trim() === rKey && (!(!isNone && leavesByDate[dateStr]?.has(st.id)))) {
                    presentRoleCount++;
                  }
                });
              }

              if (!isPresent) continue;
              adjustedBase += dailyIncomeAmount;
              if (presentRoleCount === 0) presentRoleCount = 1;

              if (rule.distribution_type === 'group') {
                amount += (dailyIncomeAmount * (effectivePct / 100)) / presentRoleCount;
                poolTotal += (dailyIncomeAmount * (effectivePct / 100));
              } else {
                amount += dailyIncomeAmount * (effectivePct / 100);
              }
            }
          }

          amount = Math.round(amount * 100) / 100;
          poolTotal = Math.round(poolTotal * 100) / 100;
          adjustedBase = Math.round(adjustedBase * 100) / 100;

          const workAmount = parseFloat(staffAmounts[s.id]) || 0;
          return { staff: s, rule, pct: effectivePct, distType: rule.distribution_type, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'primary', adjustedBase, workAmount };
        });

        // === Add-On Department Staff ===
        const addonSections: { deptId: string; deptName: string; deduction: number; pct: number; calcType: string; attRule: string; rows: RowData[] }[] = [];
        for (const addon of addons.filter(a => a.addon_department_id && a.percentage > 0)) {
          const addonDept = departments.find(d => d.id === addon.addon_department_id);
          const aStaff = addonStaffMap[addon.addon_department_id] || [];
          const aRules = addonRulesMap[addon.addon_department_id] || [];
          const activeRuleIds = addon.applied_rules && addon.applied_rules.length > 0
            ? addon.applied_rules
            : aRules.map(r => r.id);
          const activeRules = aRules.filter(r => activeRuleIds.includes(r.id));

          // Pool from MAIN department income
          const pool = tda > 0 ? Math.round(tda * (addon.percentage / 100) * 100) / 100 : 0;
          const addonAttRule = addon.attendance_rule || 'none';

          const aRoleCounts: Record<string, number> = {};
          aStaff.forEach(s => {
            const rk = s.role.toUpperCase().trim();
            aRoleCounts[rk] = (aRoleCounts[rk] || 0) + 1;
          });

          // Overall Calculation Type for UI display
          const hasGroup = activeRules.some(r => r.distribution_type === 'group');
          const hasIndividual = activeRules.some(r => r.distribution_type === 'individual' || !r.distribution_type);
          const overallCalcType = hasGroup && hasIndividual ? 'mixed' : hasGroup ? 'group' : 'individual';

          const aRows: RowData[] = aStaff.map(s => {
            const rKey = s.role.toUpperCase().trim();
            // Use addon department's own rules
            const rule = aRules.find(r => r.role.toUpperCase().trim() === rKey && activeRuleIds.includes(r.id));
            const absentDays = getAbsentDays(s.id);
            const workingDays = totalDays - absentDays;

            if (!rule) return { staff: s, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'addon', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

            const pct = parseFloat(rule.percentage) || 0;
            const overridePct = s.department_percentages?.[addon.addon_department_id];
            const effectivePct = (overridePct && String(overridePct).trim() !== '') ? parseFloat(String(overridePct)) : pct;

            let amount = 0;
            let poolTotal = 0;
            let adjustedBase = pool;
            const distType = rule.distribution_type || 'individual';

            if (pool > 0) {
              // Apply attendance FIRST
              if (addonAttRule === 'monthly' || addonAttRule === 'daily') {
                const ratio = totalDays > 0 ? (workingDays / totalDays) : 1;
                adjustedBase = Math.round(pool * ratio * 100) / 100;
              }

              // Calculate final share
              if (distType === 'group') {
                poolTotal = adjustedBase;
                const count = aRoleCounts[rKey] || 1;
                amount = Math.round((poolTotal / count) * 100) / 100;
              } else {
                amount = adjustedBase;
              }
            }
            const workAmount = parseFloat(staffAmounts[s.id]) || 0;
            return { staff: s, rule, pct: effectivePct, distType, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'addon', adjustedBase, workAmount };
          });

          addonSections.push({
            deptId: addon.addon_department_id,
            deptName: addonDept?.name || 'Unknown',
            deduction: pool,
            pct: addon.percentage,
            calcType: overallCalcType,
            attRule: addonAttRule,
            rows: aRows
          });
        }

        const totalAddon = addonSections.reduce((s, sec) => s + sec.rows.reduce((ss, r) => ss + r.estimatedAmount, 0), 0);
        const grandTotal = totalAddon;

        const renderRow = (row: RowData, idx: number) => (
          <tr key={row.staff.id + '-' + row.section} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)', background: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.15)' }}>
            <td style={{ padding: '10px 20px' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>{row.staff.name}</span>
              {row.staff.staff_code && (
                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px', fontFamily: 'monospace' }}>{row.staff.staff_code}</span>
              )}
            </td>
            <td style={{ padding: '10px 16px' }}>
              {row.rule ? (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', textTransform: 'uppercase'
                }}>{row.staff.role}</span>
              ) : (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', textTransform: 'uppercase'
                }}>{row.staff.role} ⚠</span>
              )}
            </td>
            <td style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 700, color: row.rule ? '#10b981' : '#ef4444' }}>
              {row.rule ? `${row.pct}%` : 'No Rule'}
            </td>
            <td style={{ padding: '10px 16px' }}>
              {row.rule ? (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                  background: row.distType === 'group' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                  color: row.distType === 'group' ? '#fbbf24' : '#60a5fa'
                }}>
                  {row.distType === 'group' ? '👥 Pool' : '👤 Individual'}
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#64748b' }}>—</span>
              )}
            </td>
            {isMonthlyBased && (
              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: row.absentDays > 0 ? '#fbbf24' : '#34d399' }}>
                  {row.workingDays}/{totalDays}
                </span>
                {row.absentDays > 0 && (
                  <span style={{ fontSize: '10px', color: '#f87171', marginLeft: '4px' }}>({row.absentDays} off)</span>
                )}
              </td>
            )}
            <td style={{ padding: '10px 16px', textAlign: 'right' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: row.workAmount > 0 || row.adjustedBase > 0 ? '#3b82f6' : '#64748b' }}>
                {row.workAmount > 0
                  ? `₹${row.workAmount.toLocaleString()}`
                  : (row.adjustedBase > 0 ? `₹${row.adjustedBase.toLocaleString()}` : '—')}
              </span>
            </td>
            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
              {tda > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: row.estimatedAmount > 0 ? '#10b981' : '#ef4444' }}>
                    ₹{row.estimatedAmount.toLocaleString()}
                  </span>
                  {isMonthlyBased && (
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                      (on ₹{row.adjustedBase.toLocaleString()} - {row.workingDays}/{totalDays} d)
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ color: '#475569' }}>—</span>
              )}
            </td>
          </tr>
        );

        return (
          <div className="glass-card mb-6" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(71, 85, 105, 0.2)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Users size={16} style={{ color: '#c084fc' }} /> Staff-wise Share Breakdown
              </h3>
              {tda > 0 ? (
                <p className="text-xs text-slate-400" style={{ marginTop: '4px' }}>
                  Total Dept Income ₹{tda.toLocaleString()}
                  {isMonthlyBased ? ' • Monthly attendance proration applied' : ''}
                </p>
              ) : (
                <p className="text-xs text-amber-400" style={{ marginTop: '4px' }}>
                  ⚠ Enter a Total Department Amount above to see calculated shares
                </p>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                    <th style={{ padding: '10px 20px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staff Member</th>
                    <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role</th>
                    <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rule %</th>
                    <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Distribution</th>
                    {isMonthlyBased && (
                      <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Attendance</th>
                    )}
                    <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Work Amount</th>
                    <th style={{ padding: '10px 20px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Estimated Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Add-On Department Sections */}
                  {addonSections.map(sec => (
                    <Fragment key={`hdr-${sec.deptId}`}>
                      <tr style={{ background: 'rgba(245, 158, 11, 0.08)', borderTop: '2px solid rgba(245, 158, 11, 0.2)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <td colSpan={colCount} style={{ padding: '8px 20px', fontSize: '12px', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ textTransform: 'uppercase' }}>⚡ {sec.deptName} (Add-On {sec.pct}%)</span>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: sec.calcType === 'group' ? 'rgba(245,158,11,0.2)' : sec.calcType === 'mixed' ? 'rgba(168,85,247,0.2)' : 'rgba(96,165,250,0.2)', color: sec.calcType === 'group' ? '#fbbf24' : sec.calcType === 'mixed' ? '#c084fc' : '#60a5fa' }}>
                              {sec.calcType === 'group' ? '👥 Group' : sec.calcType === 'mixed' ? '🔄 Mixed' : '👤 Individual'}
                            </span>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: sec.attRule === 'daily' ? 'rgba(16,185,129,0.2)' : sec.attRule === 'monthly' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: sec.attRule === 'daily' ? '#34d399' : sec.attRule === 'monthly' ? '#fbbf24' : '#f87171' }}>
                              {sec.attRule === 'daily' ? '📅 Daily' : sec.attRule === 'monthly' ? '📊 Monthly' : '🚫 None'}
                            </span>
                            {sec.deduction > 0 && <span style={{ fontSize: '10px', color: '#94a3b8' }}>Pool: ₹{sec.deduction.toLocaleString()}</span>}
                          </div>
                        </td>
                      </tr>
                      {sec.rows.length > 0 ? (
                        sec.rows.map((row, idx) => renderRow(row, idx))
                      ) : (
                        <tr>
                          <td colSpan={colCount} style={{ padding: '10px 20px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>No staff assigned to this department</td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                {tda > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(71, 85, 105, 0.3)', background: 'rgba(16, 185, 129, 0.05)' }}>
                      <td colSpan={colCount - 1} style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        Add-On Grand Total
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '18px', fontWeight: 800, color: '#10b981' }}>
                        ₹{grandTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })()}


      {selectedDept && (
        <div className="glass-card mb-6" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#c084fc' }}>⚡</span> External Add-On Department Shares
            </h3>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              onClick={() => setAddons([...addons, { addon_department_id: '', percentage: 0, calculation_type: 'individual', attendance_rule: 'none', amount_source: 'TDA', manual_amount: '' }])}
            >
              + Add Add-On
            </button>
          </div>

          {addons.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No add-on departments configured for this month.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {addons.map((addon, index) => {
                const targetDept = departments.find(d => d.id === addon.addon_department_id);
                return (
                  <div key={index} className="p-4 rounded-xl border border-slate-700/50 bg-slate-900/30">
                    {/* Row 1: Target Department + Percentage + Delete */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="form-label text-xs">Target Department</label>
                        <select
                          className="select-field"
                          value={addon.addon_department_id}
                          onChange={(e) => {
                            const next = [...addons];
                            next[index].addon_department_id = e.target.value;
                            // Initialize with all active rules for this department by default
                            next[index].applied_rules = (addonRulesMap[e.target.value] || []).map(r => r.id);
                            setAddons(next);
                          }}
                        >
                          <option value="">Select Dept...</option>
                          {departments.filter(d => d.id !== selectedDept).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <div style={{ flex: 1 }}>
                          <label className="form-label text-xs">Percentage (%)</label>
                          <input
                            type="number" min="0" max="100" step="0.1"
                            className="input-field"
                            value={addon.percentage}
                            onChange={(e) => {
                              const next = [...addons];
                              next[index].percentage = parseFloat(e.target.value) || 0;
                              setAddons(next);
                            }}
                          />
                          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>1 = 1%, 0.5 = 0.5%</p>
                        </div>
                        <div className="flex items-end" style={{ paddingBottom: '18px' }}>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '10px' }}
                            onClick={() => {
                              setAddons(addons.filter((_, i) => i !== index));
                            }}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Selected Targeted Rules */}
                    <div className="mb-3">
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'block' }}>
                        Apply To Rules
                      </label>
                      {!addon.addon_department_id ? (
                        <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Please select a Target Department first.</p>
                      ) : (addonRulesMap[addon.addon_department_id] || []).length === 0 ? (
                        <p style={{ fontSize: '11px', color: '#ef4444', fontStyle: 'italic' }}>⚠ No active rules found in target department.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                          {(addonRulesMap[addon.addon_department_id] || []).map(rule => {
                            const isApplied = (addon.applied_rules || []).includes(rule.id);
                            return (
                              <div
                                key={rule.id}
                                onClick={() => {
                                  const next = [...addons];
                                  const currentApplied = next[index].applied_rules || [];
                                  if (currentApplied.includes(rule.id)) {
                                    next[index].applied_rules = currentApplied.filter((id: string) => id !== rule.id);
                                  } else {
                                    next[index].applied_rules = [...currentApplied, rule.id];
                                  }
                                  setAddons(next);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: isApplied ? '1px solid #10b981' : '1px solid rgba(71, 85, 105, 0.3)',
                                  background: isApplied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.3)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  opacity: isApplied ? 1 : 0.5
                                }}
                              >
                                {isApplied ? <CheckSquare size={14} style={{ color: '#10b981' }} /> : <Square size={14} style={{ color: '#64748b' }} />}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: isApplied ? '#34d399' : '#94a3b8' }}>
                                    {rule.role}
                                  </span>
                                  <span style={{ fontSize: '9px', color: '#64748b' }}>
                                    {rule.percentage}% ({rule.distribution_type === 'group' ? 'Group' : 'Indiv'})
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Amount Source & Attendance Config */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-700/30">
                      
                      {/* Amount Source Control */}
                      <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                        <label className="form-label text-xs mb-2">Amount Source</label>
                        <div className="flex gap-2 mb-3">
                          <button
                            className="flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all"
                            style={{
                              background: (addon.amount_source || 'TDA') === 'TDA' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                              color: (addon.amount_source || 'TDA') === 'TDA' ? '#60a5fa' : '#64748b',
                              border: (addon.amount_source || 'TDA') === 'TDA' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(71, 85, 105, 0.3)',
                            }}
                            onClick={() => {
                              const next = [...addons];
                              next[index].amount_source = 'TDA';
                              setAddons(next);
                            }}
                          >
                            TDA
                          </button>
                          <button
                            className="flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all"
                            style={{
                              background: addon.amount_source === 'MANUAL' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                              color: addon.amount_source === 'MANUAL' ? '#10b981' : '#64748b',
                              border: addon.amount_source === 'MANUAL' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(71, 85, 105, 0.3)',
                            }}
                            onClick={() => {
                              const next = [...addons];
                              next[index].amount_source = 'MANUAL';
                              setAddons(next);
                            }}
                          >
                            Manual Amount
                          </button>
                        </div>
                        
                        {addon.amount_source === 'MANUAL' && (
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '12px' }}>₹</span>
                            <input
                              type="number"
                              className="text-input"
                              style={{ paddingLeft: '22px', height: '32px', fontSize: '13px' }}
                              value={addon.manual_amount !== undefined && addon.manual_amount !== null ? addon.manual_amount : ''}
                              onChange={(e) => {
                                const next = [...addons];
                                next[index].manual_amount = e.target.value;
                                setAddons(next);
                              }}
                              placeholder="Enter manual amount"
                              min="0"
                              step="0.01"
                            />
                            <p style={{ fontSize: '10px', color: '#10b981', marginTop: '4px' }}>Ignores main {targetDept?.name || 'dept'} TDA completely.</p>
                          </div>
                        )}
                        {(addon.amount_source || 'TDA') === 'TDA' && (
                          <p style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Base pool scales dynamically with {targetDept?.name || 'dept'} TDA.</p>
                        )}
                      </div>

                      {/* Addon Attendance Rule */}
                      <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
                        <label className="form-label text-xs mb-2">Staff Attendance Sync</label>
                        <select
                          className="select-field text-xs py-1.5 h-auto text-slate-300"
                          value={addon.attendance_rule || 'none'}
                          onChange={(e) => {
                            const next = [...addons];
                            next[index].attendance_rule = e.target.value;
                            setAddons(next);
                          }}
                        >
                          <option value="none" style={{ backgroundColor: '#1e293b' }}>Global None (Full Amount)</option>
                          <option value="monthly" style={{ backgroundColor: '#1e293b' }}>Global Monthly (Ratio Based)</option>
                          <option value="daily" style={{ backgroundColor: '#1e293b' }}>Global Daily (Day Selection)</option>
                        </select>
                        <p style={{ fontSize: '10px', color: '#64748b', marginTop: '6px' }}>Enforces deduction logic independently for internal Add-on Staff.</p>
                      </div>

                    </div>

                    {/* Selected Rule Summary */}
                    {addon.addon_department_id && targetDept && (
                      <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(71,85,105,0.2)' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Selected:</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc' }}>{targetDept.name}</span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 700 }}>{addon.percentage}%</span>
                          {(() => {
                            const aRules = addonRulesMap[addon.addon_department_id] || [];
                            const activeRuleIds = addon.applied_rules && addon.applied_rules.length > 0 ? addon.applied_rules : aRules.map(r => r.id);
                            const activeRules = aRules.filter(r => activeRuleIds.includes(r.id));
                            const hasGroup = activeRules.some(r => r.distribution_type === 'group');
                            const hasInd = activeRules.some(r => r.distribution_type === 'individual' || !r.distribution_type);
                            const label = hasGroup && hasInd ? 'Mixed' : hasGroup ? 'Group' : 'Individual';
                            const color = label === 'Group' ? '#fbbf24' : label === 'Mixed' ? '#c084fc' : '#60a5fa';
                            const bg = label === 'Group' ? 'rgba(245,158,11,0.15)' : label === 'Mixed' ? 'rgba(168,85,247,0.15)' : 'rgba(96,165,250,0.15)';
                            return (
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: bg, color: color, fontWeight: 700 }}>
                                {label}
                              </span>
                            );
                          })()}
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: (addon.attendance_rule || 'none') === 'daily' ? 'rgba(16,185,129,0.15)' : (addon.attendance_rule || 'none') === 'monthly' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: (addon.attendance_rule || 'none') === 'daily' ? '#34d399' : (addon.attendance_rule || 'none') === 'monthly' ? '#fbbf24' : '#f87171', fontWeight: 700 }}>
                            {(addon.attendance_rule || 'none') === 'daily' ? 'Daily Att.' : (addon.attendance_rule || 'none') === 'monthly' ? 'Monthly Att.' : 'No Att.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!selectedDept ? (
        <div className="glass-card empty-state">
          <CalendarPlus size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>Select a department to begin entry</p>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '20px',
            borderBottom: '1px solid rgba(71, 85, 105, 0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                {deptName} — {MONTHS[month - 1]} {year}
              </h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Dept Amount</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: (parseFloat(deptTotalAmount) || 0) > 0 ? '#10b981' : '#475569' }}>
                  {(parseFloat(deptTotalAmount) || 0) > 0 ? `₹${parseFloat(deptTotalAmount).toLocaleString()}` : '— Not Set'}
                </div>
              </div>
            </div>

            {/* Row 1: Income Source */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>
                Income Source
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { key: 'income', label: '🏥 Day / Department Income', desc: 'Enter daily income for the department' },
                  { key: 'staff_based', label: '👤 Staff Income-wise', desc: 'Enter income per staff member directly' },
                  { key: 'auto_manual', label: '📝 Manual Staff Entry', desc: 'Add staff with custom roles, percentages and fixed amounts' }
                ].map(opt => {
                  const isActive = opt.key === selectedDepartmentData?.calculation_method || 
                                  (!selectedDepartmentData?.calculation_method && opt.key === 'income');
                  return (
                    <button
                      key={opt.key}
                      onClick={() => changeIncomeType(opt.key as any)}
                      title={opt.desc}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: 700,
                        borderRadius: '10px',
                        border: isActive ? '2px solid #3b82f6' : '2px solid rgba(71, 85, 105, 0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.15))'
                          : 'rgba(15, 23, 42, 0.4)',
                        color: isActive ? '#60a5fa' : '#64748b',
                        boxShadow: isActive ? '0 0 12px rgba(59, 130, 246, 0.15)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Attendance Rule */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>
                Attendance Rule
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { key: 'daily', label: '📅 Daily-Based', desc: 'Staff absent on a day won\'t receive that day\'s income', color: '#10b981', border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
                  { key: 'monthly', label: '📊 Monthly-Based', desc: 'Off/CL days deducted from total month — prorated share', color: '#f59e0b', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
                  { key: 'none', label: '🚫 No Attendance', desc: 'Attendance is not counted — direct income only', color: '#ef4444', border: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' }
                ].map(opt => {
                  const isActive = attendanceRule === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => changeAttendanceRule(opt.key as any)}
                      title={opt.desc}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '10px',
                        border: isActive ? `2px solid ${opt.border}` : '2px solid rgba(71, 85, 105, 0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                        background: isActive ? opt.bg : 'rgba(15, 23, 42, 0.4)',
                        color: isActive ? opt.color : '#64748b',
                        boxShadow: isActive ? `0 0 12px ${opt.bg}` : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontStyle: 'italic' }}>
                {attendanceRule === 'daily' && '→ Staff absent on a day won\'t receive that day\'s income share.'}
                {attendanceRule === 'monthly' && '→ Off/CL days deducted from total month — prorated share calculation.'}
                {attendanceRule === 'none' && '→ Attendance is not counted — direct income entries only.'}
              </p>

            </div>
          </div>

          {/* Calculate Auto Working Amount Button */}
          {isStaffBased && isMonthlyBased && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', marginBottom: '16px', borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1))',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', margin: 0 }}>
                  🧮 Auto-Calculate Working Amounts
                </p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Formula: Working Amount = TDA (₹{parseFloat(deptTotalAmount || '0').toLocaleString()}) × (Present Days ÷ {totalDays} Total Days)
                </p>
              </div>
              <button
                onClick={() => {
                  const tda = parseFloat(deptTotalAmount) || 0;
                  if (tda <= 0) {
                    addToast('error', 'Please enter a Total Department Amount first.');
                    return;
                  }
                  if (staffList.length === 0) {
                    addToast('error', 'No staff found for this department.');
                    return;
                  }

                  const newAmounts: Record<string, string> = {};
                  const details: string[] = [];

                  staffList.forEach(staff => {
                    let absent = 0;
                    for (let d = 1; d <= totalDays; d++) {
                      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
                      if (leavesByDate[dateStr]?.has(staff.id)) absent++;
                    }
                    const presentDays = totalDays - absent;
                    const ratio = totalDays > 0 ? (presentDays / totalDays) : 1;
                    const workingAmount = Math.round(tda * ratio * 100) / 100;
                    newAmounts[staff.id] = workingAmount.toString();
                    details.push(`${staff.name}: ${presentDays}/${totalDays} days → ₹${workingAmount.toLocaleString()}`);
                  });

                  setStaffAmounts(newAmounts);
                  addToast('success', `✅ Working amounts calculated for ${staffList.length} staff members.`);
                }}
                style={{
                  padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.2s ease', textTransform: 'uppercase', letterSpacing: '0.5px',
                  whiteSpace: 'nowrap'
                }}
              >
                🧮 Calculate Auto Working Amount
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            {isAutoManual ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ padding: '12px 20px', background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>📝 Staff Entries</h4>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Fixed Amounts • {manualEntries.length} entries</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                        <th style={{ padding: '10px 16px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Staff</th>
                        <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '140px' }}>Role</th>
                        <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '80px' }}>%</th>
                        <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '100px' }}>Dist</th>
                        <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '140px', textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualEntries.length === 0 ? (
                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No manual entries. Add staff below.</td></tr>
                      ) : manualEntries.map((entry, idx) => {
                        const staffObj = globalStaffList.find(s => s.id === entry.staff_id);
                        return (
                          <tr key={entry.entry_id} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                            <td style={{ padding: '8px 16px', fontWeight: 500, color: '#f8fafc', fontSize: '13px' }}>
                              <div style={{ fontWeight: 600 }}>{staffObj?.name || 'Unknown'}</div>
                              <div style={{ color: '#64748b', fontSize: '10px' }}>{staffObj?.staff_code || ''} • {staffObj?.role || ''}</div>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <input type="text" className="text-input" style={{ height: '32px', fontSize: '12px', width: '100%' }}
                                value={entry.role}
                                onChange={(e) => { const next = [...manualEntries]; next[idx] = { ...next[idx], role: e.target.value }; setManualEntries(next); }}
                              />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <input type="number" className="text-input" style={{ height: '32px', fontSize: '12px', width: '100%' }} min="0" max="100" step="0.01"
                                value={entry.percentage}
                                onChange={(e) => { const next = [...manualEntries]; next[idx] = { ...next[idx], percentage: parseFloat(e.target.value) || 0 }; setManualEntries(next); }}
                              />
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <select className="select-field" style={{ height: '32px', fontSize: '11px' }}
                                value={entry.dist_type}
                                onChange={(e) => { const next = [...manualEntries]; next[idx] = { ...next[idx], dist_type: e.target.value as 'individual' | 'group' }; setManualEntries(next); }}
                              >
                                <option value="individual">Individual</option>
                                <option value="group">Group</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <div style={{ position: 'relative', width: '120px', marginLeft: 'auto' }}>
                                <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '12px' }}>₹</span>
                                <input type="number" className="text-input"
                                  style={{ paddingLeft: '20px', height: '32px', fontSize: '12px', width: '100%' }}
                                  value={entry.amount || ''}
                                  onChange={(e) => { const next = [...manualEntries]; next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 }; setManualEntries(next); }}
                                  placeholder="0" min="0" step="0.01"
                                />
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <button onClick={() => setManualEntries(prev => prev.filter((_, i) => i !== idx))}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px' }}>×</button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan={6} style={{ padding: '10px 16px', borderTop: '1px solid rgba(71, 85, 105, 0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>+ Add Manual Entry:</span>
                            <select className="select-field" style={{ maxWidth: '280px', height: '32px', fontSize: '12px' }} value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const staffObj = globalStaffList.find(s => s.id === e.target.value);
                                if (!staffObj) return;
                                const matchedRule = deptRules.find(r => r.role.toUpperCase().trim() === staffObj.role.toUpperCase().trim());
                                setManualEntries(prev => [...prev, {
                                  entry_id: crypto.randomUUID(),
                                  staff_id: staffObj.id,
                                  role: staffObj.role,
                                  percentage: matchedRule ? Number(matchedRule.percentage) : 0,
                                  dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
                                  amount: 0,
                                }]);
                              }}
                            >
                              <option value="">-- Select Staff --</option>
                              {globalStaffList.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>


              </div>
            ) : isStaffBased ? (

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Staff Member</th>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '200px' }}>Applicable Rule</th>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px', textAlign: 'right' }}>
                      Working Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No staff found for this department.</td>
                    </tr>
                  ) : staffList.map((staff) => {
                    const rule = deptRules.find(r => r.role.toUpperCase().trim() === staff.role.toUpperCase().trim());

                    return (
                      <tr key={staff.id} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                        <td style={{ padding: '10px 20px', fontWeight: 500, color: '#f8fafc', fontSize: '14px' }}>
                          <div style={{ fontWeight: 600 }}>{staff.name}</div>
                          <div style={{ color: '#64748b', fontSize: '11px' }}>{staff.staff_code || 'No Code'} • {staff.role}</div>
                        </td>
                        <td style={{ padding: '10px 20px' }}>
                          {rule ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{rule.role}</span>
                              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                {rule.percentage}% • {rule.distribution_type === 'group' ? 'Group' : 'Individual'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>⚠ No Matching Rule</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <div style={{ position: 'relative', width: '160px' }}>
                              <span style={{
                                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                                color: '#64748b', fontSize: '13px', fontWeight: 600
                              }}>₹</span>
                              <input
                                type="number"
                                className="text-input"
                                style={{ paddingLeft: '24px', height: '36px', fontSize: '14px', width: '100%' }}
                                value={staffAmounts[staff.id] || ''}
                                onChange={(e) => {
                                  setStaffAmounts(prev => ({ ...prev, [staff.id]: e.target.value }));
                                }}
                                placeholder="0"
                                min="0"
                                step="0.01"
                              />
                            </div>
                            <button
                              onClick={() => setStaffList(prev => prev.filter(s => s.id !== staff.id))}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '4px',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '16px',
                                transition: 'all 0.2s'
                              }}
                              title="Remove Staff from this Entry"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Add Extra Staff Option */}
                  <tr style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                    <td colSpan={isMonthlyBased ? 5 : 3} style={{ padding: '12px 20px', borderTop: '1px solid rgba(71, 85, 105, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Add Extra Staff:</span>
                        <select
                          className="select-field"
                          style={{ maxWidth: '300px', height: '36px', fontSize: '13px' }}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const newStaffId = e.target.value;
                            const staffObj = globalStaffList.find(s => s.id === newStaffId);
                            if (staffObj && !staffList.find(s => s.id === newStaffId)) {
                              setStaffList(prev => [...prev, staffObj]);
                            }
                          }}
                        >
                          <option value="">-- Select Staff to Add --</option>
                          {globalStaffList
                            .filter(s => !staffList.find(x => x.id === s.id))
                            .map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                            ))
                          }
                        </select>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '80px' }}>Date</th>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px' }}>Dept Income</th>
                    <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Present Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
                    const state = incomes[dateStr];
                    const amount = state?.amount || '';
                    const explicitPresent = state?.present_staff_ids;

                    const leavesCount = leavesByDate[dateStr]?.size || 0;

                    let presentText = '';
                    if (explicitPresent) {
                      presentText = `${explicitPresent.length}/${staffList.length} Selected (Manual)`;
                    } else {
                      presentText = `${staffList.length - leavesCount}/${staffList.length} Expected (Auto)`;
                    }

                    return (
                      <tr key={day} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                        <td style={{ padding: '10px 20px', fontWeight: 600, color: '#cbd5e1', fontSize: '14px' }}>
                          {day}
                        </td>
                        <td style={{ padding: '10px 20px' }}>
                          <div style={{ position: 'relative', maxWidth: '200px' }}>
                            <span style={{
                              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                              color: '#64748b', fontSize: '13px', fontWeight: 600
                            }}>₹</span>
                            <input
                              type="number"
                              className="text-input"
                              style={{ paddingLeft: '24px', height: '36px', fontSize: '14px' }}
                              value={amount}
                              onChange={(e) => handleIncomeChange(day, e.target.value)}
                              placeholder="0"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </td>
                        <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                            <button 
                              className={`btn ${explicitPresent ? 'btn-primary' : 'btn-secondary'}`} 
                              onClick={() => openModal(dateStr)}
                              style={{ padding: '6px 12px', fontSize: '13px' }}
                            >
                              <Users size={14} style={{ marginRight: '6px' }} />
                              {presentText}
                            </button>
                          </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Present Staff Modal */}
      {editingDate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Present Staff for {editingDate.split('-').reverse().join('-')}</h2>
              <button className="icon-btn" onClick={() => setEditingDate(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button className="btn btn-secondary" onClick={() => toggleAll(true)} style={{ flex: 1 }}>
                  <CheckSquare size={16} style={{ marginRight: 6 }} /> Select All
                </button>
                <button className="btn btn-secondary" onClick={() => toggleAll(false)} style={{ flex: 1 }}>
                  <Square size={16} style={{ marginRight: 6 }} /> Clear All
                </button>
              </div>

              {Object.entries(staffByRole).map(([role, list]) => {
                const availableStaff = list;
                const allSelected = availableStaff.length > 0 && availableStaff.every(s => tempSelection.has(s.id));
                return (
                  <div key={role} style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'rgba(30, 41, 59, 0.5)', padding: '8px 12px', borderRadius: '6px', marginBottom: '10px'
                    }}>
                      <span className="badge badge-info">{role}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleRole(role, e.target.checked)}
                        /> Select All {role}
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {list.map(staff => {
                        const isLeave = leavesByDate[editingDate]?.has(staff.id);
                        const isChecked = tempSelection.has(staff.id);
                        return (
                          <label key={staff.id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 12px', borderRadius: '6px',
                            cursor: 'pointer',
                            border: `1px solid ${isChecked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(51, 65, 85, 0.5)'}`,
                            background: isChecked ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                            transition: 'all 0.15s ease'
                          }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStaff(staff.id)}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.name}</span>
                              <span style={{ fontSize: '11px', color: isLeave ? '#fbbf24' : '#64748b' }}>
                                {staff.staff_code || 'No Code'} {isLeave ? '(On Leave Today)' : ''}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid rgba(71, 85, 105, 0.2)', padding: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditingDate(null)}>Cancel</button>
              
              <button
                className="btn btn-secondary"
                style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.3)' }}
                onClick={handleApplyToAllDays}
                disabled={allDaysSaving || modalSaving}
              >
                {allDaysSaving ? (
                  <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} /> Applying...</>
                ) : (
                  <>Apply Selection to All Days</>
                )}
              </button>

              <button
                className="btn btn-primary"
                onClick={saveModalSelection}
                disabled={modalSaving || allDaysSaving}
              >
                {modalSaving ? (
                  <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} /> Saving...</>
                ) : (
                  <>Save for {editingDate.split('-')[2]}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-effects of Daily Model: calculations are derived from daily presence logic */}
    </div>
  );
}
