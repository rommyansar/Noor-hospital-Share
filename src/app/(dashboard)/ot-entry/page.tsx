'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Save, Plus, Trash2, Copy, Activity, Users, Settings, FileSpreadsheet, FileText, Stethoscope, AlertTriangle } from 'lucide-react';
import { Staff, OTCase, Department, DepartmentRule, OTMonthlyAddon, StaffLeave, DailyIncome } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { useToast } from '@/components/ui/ToastProvider';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Allowed Department Names (case-insensitive match) ──
const OT_ALLOWED_DEPARTMENTS = ['delivery', 'general surgery', 'eye operation'];

// ── Reusable Searchable Multi-Select ──
function MultiSelect({ options, selected, onChange, placeholder }: { options: {value: string, label: string}[], selected: string[], onChange: (v: string[]) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (val: string) => selected.includes(val) ? onChange(selected.filter(s => s !== val)) : onChange([...selected, val]);
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="w-full text-left truncate px-4 py-3 rounded-lg border border-slate-600 bg-slate-800 text-sm text-slate-200 min-h-[44px] hover:border-slate-500 transition-colors" onClick={() => setOpen(!open)}>
        {selected.length ? <span className="text-emerald-400 font-medium">{selected.length} Selected</span> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 p-2 block">
          <input type="text" placeholder="Search staff..." className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2.5 rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div> : filtered.map(o => (
            <label key={o.value} className="flex items-center gap-3 p-2.5 hover:bg-slate-700 rounded-lg cursor-pointer text-sm text-slate-200">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="rounded border-slate-500 bg-slate-900 text-emerald-500 w-4 h-4" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reusable Searchable Single Select ──
function SingleSelect({ options, value, onChange, placeholder }: { options: {value: string, label: string}[], value: string | null, onChange: (v: string) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label;
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="w-full text-left truncate px-4 py-3 rounded-lg border border-slate-600 bg-slate-800 text-sm text-slate-200 min-h-[44px] hover:border-slate-500 transition-colors" onClick={() => setOpen(!open)}>
        {selectedLabel ? <span className="text-slate-200">{selectedLabel}</span> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 p-2 block">
          <input type="text" placeholder="Search staff..." className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2.5 rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div> : (
            <>
              <div className="p-2.5 hover:bg-slate-700 rounded-lg cursor-pointer text-sm text-slate-400 italic mb-1" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}>-- Clear --</div>
              {filtered.map(o => (
                <div key={o.value} className={`p-2.5 hover:bg-slate-700 rounded-lg cursor-pointer text-sm ${o.value === value ? 'bg-emerald-500/20 text-emerald-400 font-medium' : 'text-slate-200'}`} onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}>{o.label}</div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OTEntryPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selectors
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // OT Data
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [cases, setCases] = useState<Partial<OTCase>[]>([]);
  const [addons, setAddons] = useState<OTMonthlyAddon[]>([]);
  
  const [addonRulesMap, setAddonRulesMap] = useState<Record<string, DepartmentRule[]>>({});
  const [addonStaffMap, setAddonStaffMap] = useState<Record<string, Staff[]>>({});
  const [incomesMap, setIncomesMap] = useState<Record<string, DailyIncome[]>>({});
  const [leavesList, setLeavesList] = useState<StaffLeave[]>([]);
  const [reportHeading, setReportHeading] = useState<string>('');

  // Global Headers
  const [gDocPct, setGDocPct] = useState<number>(0);
  const [gADocPct, setGADocPct] = useState<number>(0);
  const [gADocMode, setGADocMode] = useState<'group' | 'individual'>('group');
  const [gANursePct, setGANursePct] = useState<number>(0);
  const [gANurseMode, setGANurseMode] = useState<'group' | 'individual'>('group');
  const [gParamPct, setGParamPct] = useState<number>(0);
  const [gParamMode, setGParamMode] = useState<'group' | 'individual'>('group');

  // Filter departments to only OT-allowed
  const otDepartments = useMemo(() => 
    departments.filter(d => OT_ALLOWED_DEPARTMENTS.includes(d.name.toLowerCase().trim())),
  [departments]);

  const selectedDeptName = departments.find(d => d.id === selectedDept)?.name || '';
  const isAllowedDept = selectedDept && otDepartments.some(d => d.id === selectedDept);

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await fetch('/api/departments');
        const data = await res.json();
        const active = data.filter((d: Department) => d.is_active);
        setDepartments(active);
        setAllDepartments(active);
      } catch {
        addToast('error', 'Failed to fetch departments');
      }
      setLoading(false);
    };
    fetchDepts();
  }, []);

  // Fetch data when month + department change
  const fetchData = useCallback(async () => {
    if (!selectedDept || !isAllowedDept) return;
    setLoading(true); setError(null);
    try {
      const [staffRes, casesRes, addonsRes, leavesRes, totalsRes] = await Promise.all([
        fetch('/api/staff'),
        fetch(`/api/ot-cases?month=${monthStr}&department_id=${selectedDept}`),
        fetch(`/api/ot-monthly-addons?month=${monthStr}&department_id=${selectedDept}`),
        fetch(`/api/leaves?month=${monthStr}`),
        fetch(`/api/monthly-totals?department_id=${selectedDept}&month=${monthStr}`)
      ]);
      
      const stData = await staffRes.json();
      setStaffList(stData.filter((s: Staff) => s.is_active));

      const cData = await casesRes.json();
      if (Array.isArray(cData) && cData.length > 0) {
        // Convert dates from ISO to DD-MM-YYYY for display
        const displayCases = cData.map((c: any) => ({
          ...c,
          date: c.date ? isoToDisplay(c.date) : ''
        }));
        setCases(displayCases);
        // Restore global headers from first valid row
        const r = cData[0];
        setGDocPct(r.doctor_pct || 0);
        setGADocPct(r.assist_doctor_pct || 0);
        setGADocMode(r.assist_doctor_mode || 'group');
        setGANursePct(r.assist_nurse_pct || 0);
        setGANurseMode(r.assist_nurse_mode || 'group');
        setGParamPct(r.paramedical_pct || 0);
        setGParamMode(r.paramedical_mode || 'group');
      } else {
        setCases([createEmptyCase(`01-${String(month).padStart(2, '0')}-${year}`)]);
      }

      setLeavesList(await leavesRes.json());
      
      const aData = await addonsRes.json();
      const loadedAddons = Array.isArray(aData) ? aData : [];
      setAddons(loadedAddons);

      // Load Addon contexts
      const addonDeptIds = [...new Set(loadedAddons.map((a: any) => a.addon_department_id))].filter(Boolean);
      
      const aRulesMap: Record<string, DepartmentRule[]> = {};
      const aStaffMap: Record<string, Staff[]> = {};
      const iMap: Record<string, DailyIncome[]> = {};
      
      await Promise.all(addonDeptIds.map(async (id: string) => {
        const [rRes, sRes, iRes] = await Promise.all([
          fetch(`/api/rules?department_id=${id}`),
          fetch(`/api/staff?department_id=${id}`),
          fetch(`/api/daily-income?department_id=${id}&month=${monthStr}`)
        ]);
        aRulesMap[id] = await rRes.json();
        aStaffMap[id] = await sRes.json();
        iMap[id] = await iRes.json();
      }));
      setAddonRulesMap(aRulesMap);
      setAddonStaffMap(aStaffMap);
      setIncomesMap(iMap);

      // Load report heading from monthly totals
      if (totalsRes.ok) {
        const totalsData = await totalsRes.json();
        setReportHeading(totalsData?.report_heading || '');
      } else {
        setReportHeading('');
      }

    } catch (err: any) {
      setError(err.message);
      addToast('error', `Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, monthStr, isAllowedDept]);

  useEffect(() => { if (selectedDept && isAllowedDept) fetchData(); }, [fetchData]);

  // ── Date Utilities ──
  const isoToDisplay = (isoDate: string): string => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return isoDate;
  };

  const displayToIso = (displayDate: string): string => {
    if (!displayDate) return '';
    const parts = displayDate.split(/[-/]/);
    if (parts.length !== 3) return displayDate;
    if (parts[0].length === 4) return displayDate; // Already ISO
    let yr = parseInt(parts[2]);
    if (yr < 100) yr += 2000;
    return `${yr}-${String(parseInt(parts[1])).padStart(2, '0')}-${String(parseInt(parts[0])).padStart(2, '0')}`;
  };

  const parseDisplayDate = (str: string): Date | null => {
    if (!str) return null;
    const parts = str.split(/[-/]/);
    if (parts.length !== 3) return null;
    let d: number, m: number, y: number;
    if (parts[0].length === 4) {
      y = parseInt(parts[0]); m = parseInt(parts[1]); d = parseInt(parts[2]);
    } else {
      d = parseInt(parts[0]); m = parseInt(parts[1]); y = parseInt(parts[2]);
      if (y < 100) y += 2000;
    }
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  };

  const formatDisplay = (d: Date): string => {
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  const createEmptyCase = (dateStr: string): Partial<OTCase> => ({
    id: `temp_${Date.now()}_${Math.random()}`,
    date: dateStr,
    case_type: 'Major',
    amount: 0,
    doctor_id: null,
    doctor_pct: gDocPct,
    assist_doctor_ids: [],
    assist_doctor_pct: gADocPct,
    assist_doctor_mode: gADocMode,
    assist_nurse_ids: [],
    assist_nurse_pct: gANursePct,
    assist_nurse_mode: gANurseMode,
    paramedical_ids: [],
    paramedical_pct: gParamPct,
    paramedical_mode: gParamMode
  });

  // ── Global Change Handlers ──
  // Update global header — only updates rows whose current pct matches the OLD global value
  // Rows with manual overrides (different from old global) are preserved
  const updateGlobal = (field: string, val: any) => {
    if(field === 'gDocPct') {
      const oldVal = gDocPct;
      setGDocPct(val);
      setCases(prev => prev.map(c => c.doctor_pct === oldVal ? { ...c, doctor_pct: val } : c));
    }
    if(field === 'gADocPct') {
      const oldVal = gADocPct;
      setGADocPct(val);
      setCases(prev => prev.map(c => c.assist_doctor_pct === oldVal ? { ...c, assist_doctor_pct: val } : c));
    }
    if(field === 'gADocMode') { setGADocMode(val); setCases(prev => prev.map(c => ({ ...c, assist_doctor_mode: val }))); }
    if(field === 'gANursePct') {
      const oldVal = gANursePct;
      setGANursePct(val);
      setCases(prev => prev.map(c => c.assist_nurse_pct === oldVal ? { ...c, assist_nurse_pct: val } : c));
    }
    if(field === 'gANurseMode') { setGANurseMode(val); setCases(prev => prev.map(c => ({ ...c, assist_nurse_mode: val }))); }
    if(field === 'gParamPct') {
      const oldVal = gParamPct;
      setGParamPct(val);
      setCases(prev => prev.map(c => c.paramedical_pct === oldVal ? { ...c, paramedical_pct: val } : c));
    }
    if(field === 'gParamMode') { setGParamMode(val); setCases(prev => prev.map(c => ({ ...c, paramedical_mode: val }))); }
  };

  // Helper: update row pct — if cleared/empty, fallback to current header value
  const updateRowPct = (id: string, field: 'doctor_pct' | 'assist_doctor_pct' | 'assist_nurse_pct' | 'paramedical_pct', rawVal: string) => {
    const parsed = parseFloat(rawVal);
    let fallback = 0;
    if (field === 'doctor_pct') fallback = gDocPct;
    else if (field === 'assist_doctor_pct') fallback = gADocPct;
    else if (field === 'assist_nurse_pct') fallback = gANursePct;
    else if (field === 'paramedical_pct') fallback = gParamPct;
    const val = rawVal.trim() === '' ? fallback : (isNaN(parsed) ? fallback : parsed);
    setCases(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c));
  };

  // ── Date Cascade ──
  const handleDateCascade = (id: string, newDateText: string) => {
    setCases(prev => {
      const next = [...prev];
      const index = next.findIndex(c => c.id === id);
      if (index === -1) return prev;
      next[index] = { ...next[index], date: newDateText };
      
      const parsed = parseDisplayDate(newDateText);
      if (parsed) {
        for (let i = index + 1; i < next.length; i++) {
          parsed.setDate(parsed.getDate() + 1);
          next[i] = { ...next[i], date: formatDisplay(parsed) };
        }
      }
      return next;
    });
  };

  const addRow = () => {
    let nextDate = `01-${String(month).padStart(2, '0')}-${year}`;
    if (cases.length > 0) {
      const lastDate = cases[cases.length - 1].date;
      if (lastDate) {
        const parsed = parseDisplayDate(lastDate);
        if (parsed) {
          parsed.setDate(parsed.getDate() + 1);
          nextDate = formatDisplay(parsed);
        }
      }
    }
    setCases(prev => [...prev, createEmptyCase(nextDate)]);
  };

  // ── Save Handler ──
  const handleSave = async () => {
    if (!selectedDept || !isAllowedDept) return;
    setSaving(true); setError(null);
    try {
      // Convert display dates to ISO for saving
      const payload = cases.map(c => {
        const isoDate = displayToIso(c.date || '');
        return {
          ...c,
          date: isoDate,
          id: c.id?.startsWith('temp_') ? undefined : c.id
        };
      });

      const casesRes = await fetch('/api/ot-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthStr, department_id: selectedDept, cases: payload })
      });
      
      if (!casesRes.ok) {
        const err = await casesRes.json();
        throw new Error(err.error || 'Failed to save OT cases');
      }

      const addonsRes = await fetch('/api/ot-monthly-addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthStr,
          department_id: selectedDept,
          addons: addons.filter(a => a.addon_department_id && a.percentage > 0).map(a => ({
            addon_department_id: a.addon_department_id,
            percentage: a.percentage,
            calculation_type: a.calculation_type || 'individual',
            attendance_rule: a.attendance_rule || 'none',
            applied_rules: a.applied_rules || [],
            amount_source: a.amount_source || 'TDA',
            manual_amount: a.manual_amount || '',
            exclude_main_dept_days: !!a.exclude_main_dept_days
          }))
        })
      });

      if (!addonsRes.ok) {
        const err = await addonsRes.json();
        throw new Error(err.error || 'Failed to save add-ons');
      }

      addToast('success', 'OT Entry saved successfully!');

      // Save report heading to monthly totals
      if (reportHeading !== undefined) {
        await fetch('/api/monthly-totals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: selectedDept,
            month: monthStr,
            report_heading: reportHeading || null,
          })
        });
      }

      await fetchData();
    } catch (err: any) {
      setError(err.message);
      addToast('error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Addon Dependencies ──
  const fetchAddonDeps = async (id: string) => {
    if (!addonRulesMap[id]) {
      const [rRes, sRes, iRes] = await Promise.all([
        fetch(`/api/rules?department_id=${id}`),
        fetch(`/api/staff?department_id=${id}`),
        fetch(`/api/daily-income?department_id=${id}&month=${monthStr}`)
      ]);
      const rData = rRes.ok ? await rRes.json() : [];
      const sData = sRes.ok ? await sRes.json() : [];
      const iData = iRes.ok ? await iRes.json() : [];
      setAddonRulesMap(prev => ({ ...prev, [id]: rData }));
      setAddonStaffMap(prev => ({ ...prev, [id]: sData }));
      setIncomesMap(prev => ({ ...prev, [id]: iData }));
    }
  };

  // ── Case Helpers ──
  const updateCase = (id: string, field: keyof OTCase, value: any) => setCases(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  const duplicateRow = (c: Partial<OTCase>) => setCases(prev => [...prev, { ...c, id: `temp_${Date.now()}_${Math.random()}` }]);
  const deleteRow = (id: string) => setCases(prev => prev.filter(c => c.id !== id));
  const staffOpts = staffList.map(s => ({ value: s.id, label: s.name }));

  // ── OT Calculation Preview ──
  const { otBreakdown, addonBreakdown, totalOTAmount } = useMemo(() => {
    const otShares: Record<string, { name: string; role: string; amount: number }> = {};
    const getName = (id: string) => staffList.find(s => s.id === id)?.name || 'Unknown';
    const getRole = (id: string) => staffList.find(s => s.id === id)?.role || 'Unknown';

    const addShare = (id: string, amount: number, dict: any) => {
      if (!id) return;
      if (!dict[id]) dict[id] = { name: getName(id), role: getRole(id), amount: 0 };
      dict[id].amount += amount;
    };

    let totalOtSum = 0;
    cases.forEach(c => {
      const amt = parseFloat(String(c.amount)) || 0;
      totalOtSum += amt;
      if (c.doctor_id) addShare(c.doctor_id, (amt * (parseFloat(String(c.doctor_pct)) || 0)) / 100, otShares);
      const processRole = (ids: string[], pctRaw: any, mode: string) => {
        if (!ids || ids.length === 0) return;
        const totalShare = (amt * (parseFloat(String(pctRaw)) || 0)) / 100;
        const perPerson = mode === 'group' ? totalShare / ids.length : totalShare;
        ids.forEach(id => addShare(id, perPerson, otShares));
      };
      processRole(c.assist_doctor_ids || [], c.assist_doctor_pct, c.assist_doctor_mode!);
      processRole(c.assist_nurse_ids || [], c.assist_nurse_pct, c.assist_nurse_mode!);
      processRole(c.paramedical_ids || [], c.paramedical_pct, c.paramedical_mode!);
    });

    // Build per-day OT income from cases (for daily attendance preview)
    const otIncomeByDate: Record<string, number> = {};
    cases.forEach(c => {
      const amt = parseFloat(String(c.amount)) || 0;
      const caseDate = c.date ? displayToIso(c.date) : '';
      if (caseDate && amt > 0) {
        otIncomeByDate[caseDate] = (otIncomeByDate[caseDate] || 0) + amt;
      }
    });

    const totalDays = new Date(year, month, 0).getDate();

    // Build per-staff conflict-day sets from OT cases (for preview)
    const staffConflictDates: Record<string, Set<string>> = {};
    cases.forEach(c => {
      const caseDate = c.date ? displayToIso(c.date) : '';
      if (!caseDate) return;
      const allIds: string[] = [];
      if (c.doctor_id) allIds.push(c.doctor_id);
      (c.assist_doctor_ids || []).forEach(id => allIds.push(id));
      (c.assist_nurse_ids || []).forEach(id => allIds.push(id));
      (c.paramedical_ids || []).forEach(id => allIds.push(id));
      allIds.forEach(id => {
        if (!staffConflictDates[id]) staffConflictDates[id] = new Set();
        staffConflictDates[id].add(caseDate);
      });
    });

    const addonOut: any[] = [];
    addons.filter(a => a.addon_department_id && a.percentage > 0).forEach(addon => {
      const aDept = allDepartments.find(d => d.id === addon.addon_department_id);
      const addonPct = addon.percentage;
      const isManual = addon.amount_source === 'MANUAL';
      const rawManual = parseFloat(String(addon.manual_amount)) || 0;
      const globalBase = isManual ? rawManual : totalOtSum;
      const activeRules = addon.applied_rules && addon.applied_rules.length > 0 ? addon.applied_rules : (addonRulesMap[addon.addon_department_id] || []).map(r => r.id);
      const aStaff = addonStaffMap[addon.addon_department_id] || [];
      const attRule = addon.attendance_rule || 'none';
      const excludeMainDays = !!addon.exclude_main_dept_days;

      // Count staff per role for group distribution
      const roleCounts: Record<string, number> = {};
      aStaff.forEach(s => {
        const rk = s.role.toUpperCase().trim();
        roleCounts[rk] = (roleCounts[rk] || 0) + 1;
      });

      aStaff.forEach(s => {
        const rule = (addonRulesMap[addon.addon_department_id] || []).find(r => activeRules.includes(r.id) && r.role.toUpperCase() === s.role.toUpperCase());
        if (!rule) return;

        const distType = rule.distribution_type || 'individual';
        const presentCount = distType === 'group' ? (roleCounts[s.role.toUpperCase().trim()] || 1) : 1;

        // ── PER-STAFF adjusted base ──
        const conflictDates = excludeMainDays ? (staffConflictDates[s.id] || new Set<string>()) : new Set<string>();
        const absentDateSet = new Set(leavesList.filter(l => l.staff_id === s.id).map(l => l.date));
        const mStr = `${year}-${String(month).padStart(2, '0')}`;

        // Build excluded dates = conflict + absent
        const excludedDates = new Set<string>();
        for (let d = 1; d <= totalDays; d++) {
          const dateStr = `${mStr}-${String(d).padStart(2, '0')}`;
          if (conflictDates.has(dateStr)) excludedDates.add(dateStr);
          if (attRule !== 'none' && absentDateSet.has(dateStr)) excludedDates.add(dateStr);
        }
        const validDays = totalDays - excludedDates.size;

        let adjustedBase = globalBase;

        if (excludeMainDays || attRule !== 'none') {
          // Both TDA and Manual use the same income-weighted approach
          let validIncome = 0;
          for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${mStr}-${String(d).padStart(2, '0')}`;
            if (!excludedDates.has(dateStr)) {
              validIncome += (otIncomeByDate[dateStr] || 0);
            }
          }
          if (isManual) {
            // Manual: prorate by income-weight ratio
            adjustedBase = totalOtSum > 0 ? Math.round(globalBase * (validIncome / totalOtSum) * 100) / 100 : 0;
          } else {
            // TDA: use valid income directly
            adjustedBase = validIncome;
          }
        }

        const staffPool = Math.round(adjustedBase * (addonPct / 100) * 100) / 100;

        const finalShare = distType === 'group'
          ? Math.round((staffPool / presentCount) * 100) / 100
          : staffPool;

        if (finalShare > 0) {
          addonOut.push({ deptName: aDept?.name, staffName: s.name, role: s.role, amount: finalShare });
        }
      });
    });

    return {
      otBreakdown: Object.values(otShares).sort((a, b) => b.amount - a.amount),
      addonBreakdown: addonOut.sort((a, b) => b.amount - a.amount),
      totalOTAmount: totalOtSum,
    };
  }, [cases, addons, staffList, addonRulesMap, addonStaffMap, incomesMap, leavesList, monthStr, allDepartments]);

  // ── Initial Loading ──
  if (loading && departments.length === 0) {
    return <div className="p-8 text-center text-slate-400">Loading OT System...</div>;
  }

  return (
    <div className="pb-20">
      {/* ── Page Header ── */}
      <div className="page-header flex justify-between items-end mb-6">
        <div>
          <h1 className="page-title text-2xl font-bold flex items-center gap-2"><Stethoscope className="text-emerald-500" /> OT Entry</h1>
          <p className="text-sm text-slate-400 mt-1">Surgery case tracking — Delivery, General Surgery &amp; Eye Operation</p>
        </div>
        {selectedDept && isAllowedDept && (
          <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-2 px-5 py-2.5 text-sm">
            <Save size={16} /> {saving ? 'Saving...' : 'Save All'}
          </button>
        )}
      </div>

      {/* ── Month + Department Selector ── */}
      <div className="glass-card mb-6" style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label className="form-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Department</label>
            <select
              className="select-field w-full"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              style={{ minHeight: '44px', fontSize: '14px' }}
            >
              <option value="">Select Department...</option>
              {otDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Year</label>
            <select className="select-field w-full" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ minHeight: '44px', fontSize: '14px' }}>
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Month</label>
            <select className="select-field w-full" value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ minHeight: '44px', fontSize: '14px' }}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Report Heading Input */}
        {selectedDept && isAllowedDept && (
          <div style={{ marginTop: '16px' }}>
            <label className="form-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Report Heading (optional)</label>
            <input
              type="text"
              className="input-field w-full"
              value={reportHeading}
              onChange={(e) => setReportHeading(e.target.value)}
              placeholder="e.g. Special Note for March OT Report"
              style={{ fontSize: '14px', padding: '10px 16px' }}
            />
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>This text will appear as a heading in the PDF/Excel report.</p>
          </div>
        )}
      </div>

      {/* ── Error: Not Allowed ── */}
      {selectedDept && !isAllowedDept && (
        <div className="glass-card mb-6 p-6 border-2 border-red-500/30" style={{ background: 'rgba(239, 68, 68, 0.08)' }}>
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={24} />
            <div>
              <p className="font-bold text-lg">This department is not allowed in OT Entry</p>
              <p className="text-sm text-red-400/70 mt-1">OT Entry is only available for Delivery, General Surgery, and Eye Operation departments.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── No Department Selected ── */}
      {!selectedDept && (
        <div className="glass-card p-12 text-center">
          <Stethoscope size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-semibold text-slate-400">Select Month &amp; Department</p>
          <p className="text-sm text-slate-500 mt-2">Choose a month and department to start entering OT cases.</p>
        </div>
      )}

      {error && <div className="mb-4 p-4 border border-red-500/30 bg-red-500/10 rounded-lg text-red-400 text-sm">{error}</div>}

      {/* ── Only show content when department is valid ── */}
      {selectedDept && isAllowedDept && !loading && (
        <>
          {/* ── Summary Bar ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="glass-card p-4 border border-slate-700">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total OT Amount</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">₹{totalOTAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="glass-card p-4 border border-slate-700">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cases</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">{cases.length}</p>
            </div>
            <div className="glass-card p-4 border border-slate-700">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Department</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{selectedDeptName}</p>
            </div>
          </div>

          {/* ── OT Cases Table ── */}
          <div className="glass-card mb-8 overflow-hidden p-0">
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-left border-collapse" style={{ minWidth: '1800px' }}>
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider" style={{ minWidth: '140px' }}>Date</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider" style={{ minWidth: '120px' }}>Case Type</th>
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider" style={{ minWidth: '150px' }}>Amount (₹)</th>
                    
                    {/* Doctor */}
                    <th className="p-4 text-xs font-bold text-emerald-400 uppercase tracking-wider border-l-2 border-emerald-500/30 bg-emerald-500/5" style={{ minWidth: '220px' }}>
                      Doctor (Main)
                    </th>
                    <th className="p-4 text-xs font-bold text-emerald-400 uppercase tracking-wider border-r-2 border-emerald-500/30 bg-emerald-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Global %</div>
                      <input type="number" value={gDocPct} onChange={e => updateGlobal('gDocPct', parseFloat(e.target.value) || 0)} className="w-16 bg-slate-900 border border-slate-600 rounded-lg text-center px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none" />
                    </th>
                    
                    {/* Assist Doctor */}
                    <th className="p-4 text-xs font-bold text-blue-400 uppercase tracking-wider border-l-2 border-blue-500/30 bg-blue-500/5" style={{ minWidth: '220px' }}>
                      Assist Doctor
                    </th>
                    <th className="p-4 text-xs font-bold text-blue-400 uppercase tracking-wider bg-blue-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Global %</div>
                      <input type="number" value={gADocPct} onChange={e => updateGlobal('gADocPct', parseFloat(e.target.value) || 0)} className="w-16 bg-slate-900 border border-slate-600 rounded-lg text-center px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/40 focus:outline-none" />
                    </th>
                    <th className="p-4 text-xs font-bold text-blue-400 uppercase tracking-wider border-r-2 border-blue-500/30 bg-blue-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Mode</div>
                      <select value={gADocMode} onChange={e => updateGlobal('gADocMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/40 focus:outline-none">
                        <option value="group">Group</option><option value="individual">Individual</option>
                      </select>
                    </th>
                    
                    {/* Assist Nurse */}
                    <th className="p-4 text-xs font-bold text-purple-400 uppercase tracking-wider border-l-2 border-purple-500/30 bg-purple-500/5" style={{ minWidth: '220px' }}>
                      Assist Nurse
                    </th>
                    <th className="p-4 text-xs font-bold text-purple-400 uppercase tracking-wider bg-purple-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Global %</div>
                      <input type="number" value={gANursePct} onChange={e => updateGlobal('gANursePct', parseFloat(e.target.value) || 0)} className="w-16 bg-slate-900 border border-slate-600 rounded-lg text-center px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500/40 focus:outline-none" />
                    </th>
                    <th className="p-4 text-xs font-bold text-purple-400 uppercase tracking-wider border-r-2 border-purple-500/30 bg-purple-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Mode</div>
                      <select value={gANurseMode} onChange={e => updateGlobal('gANurseMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500/40 focus:outline-none">
                        <option value="group">Group</option><option value="individual">Individual</option>
                      </select>
                    </th>

                    {/* Paramedical */}
                    <th className="p-4 text-xs font-bold text-orange-400 uppercase tracking-wider border-l-2 border-orange-500/30 bg-orange-500/5" style={{ minWidth: '220px' }}>
                      Paramedical
                    </th>
                    <th className="p-4 text-xs font-bold text-orange-400 uppercase tracking-wider bg-orange-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Global %</div>
                      <input type="number" value={gParamPct} onChange={e => updateGlobal('gParamPct', parseFloat(e.target.value) || 0)} className="w-16 bg-slate-900 border border-slate-600 rounded-lg text-center px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-orange-500/40 focus:outline-none" />
                    </th>
                    <th className="p-4 text-xs font-bold text-orange-400 uppercase tracking-wider border-r-2 border-orange-500/30 bg-orange-500/5 text-center" style={{ minWidth: '100px' }}>
                      <div className="text-[10px] mb-1">Mode</div>
                      <select value={gParamMode} onChange={e => updateGlobal('gParamMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-orange-500/40 focus:outline-none">
                        <option value="group">Group</option><option value="individual">Individual</option>
                      </select>
                    </th>
                    
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center" style={{ minWidth: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c, i) => (
                    <tr key={c.id || i} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="DD-MM-YYYY"
                          value={c.date || ''}
                          onChange={(e) => handleDateCascade(c.id!, e.target.value)}
                          className="text-input w-full text-center font-mono"
                          style={{ minHeight: '44px', fontSize: '14px', minWidth: '130px' }}
                        />
                      </td>
                      <td className="p-3">
                        <select
                          value={c.case_type || 'Major'}
                          onChange={(e) => updateCase(c.id!, 'case_type', e.target.value)}
                          className="select-field w-full"
                          style={{ minHeight: '44px', fontSize: '14px' }}
                        >
                          <option>Major</option><option>Minor</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={c.amount || ''}
                          onChange={(e) => updateCase(c.id!, 'amount', parseFloat(e.target.value))}
                          className="text-input font-bold text-emerald-400 w-full"
                          placeholder="₹0"
                          style={{ minHeight: '44px', fontSize: '15px', minWidth: '130px' }}
                        />
                      </td>

                      <td className="p-3 border-l-2 border-emerald-500/20 bg-emerald-500/[0.02]" style={{ minWidth: '220px' }}>
                        <SingleSelect options={staffOpts} value={c.doctor_id || null} onChange={v => updateCase(c.id!, 'doctor_id', v)} placeholder="Select Doctor..." />
                      </td>
                      <td className="p-3 border-r-2 border-emerald-500/20 bg-emerald-500/[0.02] text-center">
                        <input type="number" value={c.doctor_pct ?? ''} onChange={e => updateRowPct(c.id!, 'doctor_pct', e.target.value)} className="w-16 bg-slate-900/50 border border-slate-700 rounded-lg text-center px-1 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none" title="Row override (clear to use header default)" />
                      </td>

                      <td className="p-3 border-l-2 border-blue-500/20 bg-blue-500/[0.02]" style={{ minWidth: '220px' }}>
                        <MultiSelect options={staffOpts} selected={c.assist_doctor_ids || []} onChange={v => updateCase(c.id!, 'assist_doctor_ids', v)} placeholder="Select Doctors..." />
                      </td>
                      <td className="p-3 bg-blue-500/[0.02] text-center">
                        <input type="number" value={c.assist_doctor_pct ?? ''} onChange={e => updateRowPct(c.id!, 'assist_doctor_pct', e.target.value)} className="w-16 bg-slate-900/50 border border-slate-700 rounded-lg text-center px-1 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500/40 focus:outline-none" title="Row override (clear to use header default)" />
                      </td>
                      <td className="p-3 border-r-2 border-blue-500/20 bg-blue-500/[0.02] text-slate-400 text-center text-xs font-medium uppercase">{c.assist_doctor_mode}</td>

                      <td className="p-3 border-l-2 border-purple-500/20 bg-purple-500/[0.02]" style={{ minWidth: '220px' }}>
                        <MultiSelect options={staffOpts} selected={c.assist_nurse_ids || []} onChange={v => updateCase(c.id!, 'assist_nurse_ids', v)} placeholder="Select Nurses..." />
                      </td>
                      <td className="p-3 bg-purple-500/[0.02] text-center">
                        <input type="number" value={c.assist_nurse_pct ?? ''} onChange={e => updateRowPct(c.id!, 'assist_nurse_pct', e.target.value)} className="w-16 bg-slate-900/50 border border-slate-700 rounded-lg text-center px-1 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500/40 focus:outline-none" title="Row override (clear to use header default)" />
                      </td>
                      <td className="p-3 border-r-2 border-purple-500/20 bg-purple-500/[0.02] text-slate-400 text-center text-xs font-medium uppercase">{c.assist_nurse_mode}</td>

                      <td className="p-3 border-l-2 border-orange-500/20 bg-orange-500/[0.02]" style={{ minWidth: '220px' }}>
                        <MultiSelect options={staffOpts} selected={c.paramedical_ids || []} onChange={v => updateCase(c.id!, 'paramedical_ids', v)} placeholder="Select Paramedical..." />
                      </td>
                      <td className="p-3 bg-orange-500/[0.02] text-center">
                        <input type="number" value={c.paramedical_pct ?? ''} onChange={e => updateRowPct(c.id!, 'paramedical_pct', e.target.value)} className="w-16 bg-slate-900/50 border border-slate-700 rounded-lg text-center px-1 py-1 text-sm text-slate-200 focus:ring-2 focus:ring-orange-500/40 focus:outline-none" title="Row override (clear to use header default)" />
                      </td>
                      <td className="p-3 border-r-2 border-orange-500/20 bg-orange-500/[0.02] text-slate-400 text-center text-xs font-medium uppercase">{c.paramedical_mode}</td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => duplicateRow(c)} className="p-2.5 text-slate-400 hover:text-blue-400 bg-slate-800 rounded-lg hover:bg-slate-700 transition" title="Duplicate">
                            <Copy size={16} />
                          </button>
                          <button onClick={() => deleteRow(c.id!)} className="p-2.5 text-slate-400 hover:text-red-400 bg-slate-800 rounded-lg hover:bg-slate-700 transition" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-700 bg-slate-800/30 flex items-center gap-4">
              <button onClick={addRow} className="btn text-sm px-5 py-2.5 bg-slate-800 hover:bg-slate-700 flex items-center gap-2">
                <Plus size={16} /> Add Case
              </button>
              <span className="text-xs text-slate-500">Total: ₹{totalOTAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* ── Addon Section ── */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2"><Settings className="text-indigo-400" /> Add-On Departments</h2>
              <button onClick={() => setAddons([...addons, { id: `new_${Date.now()}`, month: monthStr, addon_department_id: '', percentage: 0, calculation_type: 'individual', attendance_rule: 'none', applied_rules: [], amount_source: 'TDA', manual_amount: '', exclude_main_dept_days: false } as any])} className="btn text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2">
                <Plus size={14} /> Add Dept Add-On
              </button>
            </div>

            {addons.length === 0 ? (
              <div className="glass-card p-6 text-center text-slate-500 text-sm border-dashed">No Add-Ons configured. Add-on departments receive a share of total OT income.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {addons.map((addon, aIdx) => {
                  const aRules = addonRulesMap[addon.addon_department_id] || [];
                  const activeRuleIds = addon.applied_rules && addon.applied_rules.length > 0 ? addon.applied_rules : aRules.map(r => r.id);
                  return (
                    <div key={aIdx} className="glass-card p-5 border border-slate-700 relative">
                      <button onClick={() => setAddons(addons.filter((_, i) => i !== aIdx))} className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={16} /></button>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="field-label">Target Department</label>
                          <select value={addon.addon_department_id} onChange={e => {
                            const next = [...addons];
                            next[aIdx] = { ...next[aIdx], addon_department_id: e.target.value };
                            setAddons(next);
                            if (e.target.value) fetchAddonDeps(e.target.value);
                          }} className="select-field" style={{ minHeight: '44px' }}>
                            <option value="">Select Department...</option>
                            {allDepartments.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Share Percentage (%)</label>
                          <input type="number" value={addon.percentage} onChange={e => {
                            const next = [...addons];
                            next[aIdx] = { ...next[aIdx], percentage: parseFloat(e.target.value) || 0 };
                            setAddons(next);
                          }} className="text-input" placeholder="e.g. 10" style={{ minHeight: '44px' }} />
                        </div>
                        <div>
                          <label className="field-label">Attendance Rule</label>
                          <select value={addon.attendance_rule} onChange={e => {
                            const next = [...addons];
                            next[aIdx] = { ...next[aIdx], attendance_rule: e.target.value as any };
                            setAddons(next);
                          }} className="select-field" style={{ minHeight: '44px' }}>
                            <option value="none">No Attendance Impact</option>
                            <option value="monthly">Monthly Attendance</option>
                            <option value="daily">Daily Attendance</option>
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Mode</label>
                          <select value={addon.calculation_type || 'individual'} onChange={e => {
                            const next = [...addons];
                            next[aIdx] = { ...next[aIdx], calculation_type: e.target.value as any };
                            setAddons(next);
                          }} className="select-field" style={{ minHeight: '44px' }}>
                            <option value="individual">Individual</option>
                            <option value="group">Group</option>
                          </select>
                        </div>
                      </div>

                      {/* Row: Amount Source Override */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 border border-slate-700 bg-slate-900/30 rounded-lg">
                        <div>
                          <label className="field-label mb-2 block">Amount Source</label>
                          <div className="flex gap-2">
                            <button
                              className="flex-1 py-2 px-3 rounded text-xs font-semibold transition-all border"
                              style={{
                                background: (addon.amount_source || 'TDA') === 'TDA' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                                color: (addon.amount_source || 'TDA') === 'TDA' ? '#60a5fa' : '#64748b',
                                borderColor: (addon.amount_source || 'TDA') === 'TDA' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(71, 85, 105, 0.3)'
                              }}
                              onClick={() => {
                                const next = [...addons];
                                next[aIdx] = { ...next[aIdx], amount_source: 'TDA' };
                                setAddons(next);
                              }}
                            >
                              Follow Main Dept TDA
                            </button>
                            <button
                              className="flex-1 py-2 px-3 rounded text-xs font-semibold transition-all border"
                              style={{
                                background: addon.amount_source === 'MANUAL' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                                color: addon.amount_source === 'MANUAL' ? '#10b981' : '#64748b',
                                borderColor: addon.amount_source === 'MANUAL' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(71, 85, 105, 0.3)'
                              }}
                              onClick={() => {
                                const next = [...addons];
                                next[aIdx] = { ...next[aIdx], amount_source: 'MANUAL' };
                                setAddons(next);
                              }}
                            >
                              Fixed Manual Amount
                            </button>
                          </div>
                        </div>
                        {addon.amount_source === 'MANUAL' && (
                          <div>
                            <label className="field-label mb-2 block">Manual Amount Value</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                              <input
                                type="number"
                                className="text-input pl-8"
                                style={{ minHeight: '38px', width: '100%' }}
                                value={addon.manual_amount !== undefined && addon.manual_amount !== null ? addon.manual_amount : ''}
                                onChange={(e) => {
                                  const next = [...addons];
                                  next[aIdx] = { ...next[aIdx], manual_amount: e.target.value };
                                  setAddons(next);
                                }}
                                placeholder="Enter specific pool base amount"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Exclude Main Dept Working Days Toggle */}
                      <div className="col-span-full mt-3 p-3 rounded-lg border" style={{
                        background: addon.exclude_main_dept_days ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.3)',
                        borderColor: addon.exclude_main_dept_days ? 'rgba(245, 158, 11, 0.3)' : 'rgba(71, 85, 105, 0.3)',
                        transition: 'all 0.2s ease'
                      }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: 700, color: addon.exclude_main_dept_days ? '#fbbf24' : '#94a3b8' }}>
                              🚫 Exclude Main Dept Working Days
                            </p>
                            <p style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                              If ON → Exclude income on days where this staff also worked in {selectedDeptName || 'main dept'}. Per-staff basis.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const next = [...addons];
                              next[aIdx] = { ...next[aIdx], exclude_main_dept_days: !next[aIdx].exclude_main_dept_days };
                              setAddons(next);
                            }}
                            style={{
                              width: '48px', height: '26px', borderRadius: '13px',
                              background: addon.exclude_main_dept_days ? '#f59e0b' : 'rgba(71, 85, 105, 0.5)',
                              border: 'none', cursor: 'pointer', position: 'relative',
                              transition: 'background 0.2s ease'
                            }}
                          >
                            <span style={{
                              position: 'absolute', top: '3px',
                              left: addon.exclude_main_dept_days ? '25px' : '3px',
                              width: '20px', height: '20px', borderRadius: '50%',
                              background: '#fff', transition: 'left 0.2s ease',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }} />
                          </button>
                        </div>
                      </div>
                      {addon.addon_department_id && (
                        <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                          <p className="text-xs font-semibold text-slate-400 mb-2">APPLIED ROLES</p>
                          <div className="flex flex-wrap gap-2">
                            {aRules.map(rule => {
                              const isApplied = activeRuleIds.includes(rule.id);
                              return (
                                <button key={rule.id} onClick={() => {
                                  const next = [...addons];
                                  next[aIdx] = { ...next[aIdx], applied_rules: isApplied ? activeRuleIds.filter(id => id !== rule.id) : [...activeRuleIds, rule.id] };
                                  setAddons(next);
                                }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isApplied ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                                  {rule.role}
                                </button>
                              );
                            })}
                            {aRules.length === 0 && <span className="text-xs text-slate-500 italic">No rules defined in dept.</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Preview Section ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Core OT Preview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {otBreakdown.map((row, i) => (
                  <div key={i} className="glass-card p-4 flex flex-col gap-1 border border-slate-700">
                    <span className="text-slate-200 font-semibold text-sm">{row.name}</span>
                    <span className="text-slate-400 text-xs uppercase tracking-wider">{row.role}</span>
                    <span className="text-emerald-400 font-bold text-lg mt-1">₹{row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
                {otBreakdown.length === 0 && <span className="text-slate-500 text-sm">No portions calculated.</span>}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Settings size={18} className="text-indigo-400" /> Add-On Preview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {addonBreakdown.map((row, i) => (
                  <div key={i} className="glass-card p-4 flex flex-col gap-1 border border-slate-700">
                    <span className="text-slate-200 font-semibold text-sm">{row.staffName} <span className="text-xs text-indigo-400 ml-1">({row.deptName})</span></span>
                    <span className="text-slate-400 text-xs uppercase tracking-wider">{row.role}</span>
                    <span className="text-indigo-400 font-bold text-lg mt-1">₹{row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
                {addonBreakdown.length === 0 && <span className="text-slate-500 text-sm">No Add-on portions calculated.</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
