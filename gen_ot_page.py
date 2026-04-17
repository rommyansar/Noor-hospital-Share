import re

content = """'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Plus, Trash2, Copy, Activity, Users, Settings, FileSpreadsheet, FileText } from 'lucide-react';
import { Staff, OTCase, Department, DepartmentRule, OTMonthlyAddon, StaffLeave, DailyIncome } from '@/lib/types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Reusing same utility components
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
      <button type="button" className="w-full text-left truncate px-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-[13px] text-slate-200" onClick={() => setOpen(!open)}>
        {selected.length ? `${selected.length} Selected` : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 p-2 block">
          <input type="text" placeholder="Search staff..." className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded mb-2 text-sm focus:outline-none" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div> : filtered.map(o => (
            <label key={o.value} className="flex items-center gap-3 p-2 hover:bg-slate-700 rounded cursor-pointer text-[13px] text-slate-200">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="rounded border-slate-500 bg-slate-900 text-blue-500 w-4 h-4" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
      <button type="button" className="w-full text-left truncate px-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-[13px] text-slate-200" onClick={() => setOpen(!open)}>
        {selectedLabel ? <span className="text-slate-200">{selectedLabel}</span> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 p-2 block">
          <input type="text" placeholder="Search staff..." className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded mb-2 text-sm focus:outline-none" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div> : (
            <>
              <div className="p-2 hover:bg-slate-700 rounded cursor-pointer text-[13px] text-slate-400 italic mb-1" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}>-- Clear Selection --</div>
              {filtered.map(o => (
                <div key={o.value} className={`p-2 hover:bg-slate-700 rounded cursor-pointer text-[13px] ${o.value === value ? 'bg-blue-500/20 text-blue-400' : 'text-slate-200'}`} onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}>{o.label}</div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OTEntryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cases, setCases] = useState<Partial<OTCase>[]>([]);
  const [addons, setAddons] = useState<OTMonthlyAddon[]>([]);
  
  const [addonRulesMap, setAddonRulesMap] = useState<Record<string, DepartmentRule[]>>({});
  const [addonStaffMap, setAddonStaffMap] = useState<Record<string, Staff[]>>({});
  const [incomesMap, setIncomesMap] = useState<Record<string, DailyIncome[]>>({});
  const [leavesList, setLeavesList] = useState<StaffLeave[]>([]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthStr, setMonthStr] = useState(currentMonth);

  // Global Headers
  const [gDocPct, setGDocPct] = useState<number>(0);
  const [gADocPct, setGADocPct] = useState<number>(0);
  const [gADocMode, setGADocMode] = useState<'group' | 'individual'>('group');
  const [gANursePct, setGANursePct] = useState<number>(0);
  const [gANurseMode, setGANurseMode] = useState<'group' | 'individual'>('group');
  const [gParamPct, setGParamPct] = useState<number>(0);
  const [gParamMode, setGParamMode] = useState<'group' | 'individual'>('group');

  useEffect(() => {
    fetchData();
  }, [monthStr]);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [staffRes, casesRes, deptsRes, addonsRes, leavesRes] = await Promise.all([
        fetch('/api/staff'),
        fetch(`/api/ot-cases?month=${monthStr}`),
        fetch('/api/departments'),
        fetch(`/api/ot-monthly-addons?month=${monthStr}`),
        fetch(`/api/leaves?month=${monthStr}`)
      ]);
      
      const stData = await staffRes.json();
      setStaffList(stData.filter((s: Staff) => s.is_active));
      
      const dData = await deptsRes.json();
      setDepartments(dData);

      const cData = await casesRes.json();
      if(cData.length > 0) {
        setCases(cData);
        // Reverse look up global headers from first valid row to ease user UX.
        const r = cData[0];
        setGDocPct(r.doctor_pct || 0);
        setGADocPct(r.assist_doctor_pct || 0);
        setGADocMode(r.assist_doctor_mode || 'group');
        setGANursePct(r.assist_nurse_pct || 0);
        setGANurseMode(r.assist_nurse_mode || 'group');
        setGParamPct(r.paramedical_pct || 0);
        setGParamMode(r.paramedical_mode || 'group');
      } else {
        setCases([createEmptyCase(`${monthStr}-01`)]);
      }

      setLeavesList(await leavesRes.json());
      
      const aData = await addonsRes.json();
      const loadedAddons = Array.isArray(aData) ? aData : [];
      setAddons(loadedAddons);

      // Load Addon contexts
      const addonDeptIds = [...new Set(loadedAddons.map((a:any) => a.addon_department_id))].filter(Boolean);
      
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

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  // Global Change handlers
  const updateGlobal = (field: string, val: any) => {
    if(field === 'gDocPct') { setGDocPct(val); updateAllCases('doctor_pct', val); }
    if(field === 'gADocPct') { setGADocPct(val); updateAllCases('assist_doctor_pct', val); }
    if(field === 'gADocMode') { setGADocMode(val); updateAllCases('assist_doctor_mode', val); }
    if(field === 'gANursePct') { setGANursePct(val); updateAllCases('assist_nurse_pct', val); }
    if(field === 'gANurseMode') { setGANurseMode(val); updateAllCases('assist_nurse_mode', val); }
    if(field === 'gParamPct') { setGParamPct(val); updateAllCases('paramedical_pct', val); }
    if(field === 'gParamMode') { setGParamMode(val); updateAllCases('paramedical_mode', val); }
  };

  const updateAllCases = (field: keyof OTCase, value: any) => {
    setCases(prev => prev.map(c => ({ ...c, [field]: value })));
  };

  const addRow = () => {
    let nextDate = `${monthStr}-01`;
    if (cases.length > 0) {
      const lastDate = cases[cases.length - 1].date;
      if (lastDate) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        nextDate = d.toISOString().split('T')[0];
      }
    }
    setCases(prev => [...prev, createEmptyCase(nextDate)]);
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const payload = cases.map(c => ({ ...c, id: c.id?.startsWith('temp_') ? undefined : c.id }));
      await fetch('/api/ot-cases', { method: 'POST', body: JSON.stringify({ month: monthStr, cases: payload }) });
      await fetch('/api/ot-monthly-addons', { method: 'POST', body: JSON.stringify({ month: monthStr, addons }) });
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Addon Helpers
  const fetchAddonDeps = async (id: string) => {
    if(!addonRulesMap[id]) {
      const [rRes, sRes, iRes] = await Promise.all([
        fetch(`/api/rules?department_id=${id}`),
        fetch(`/api/staff?department_id=${id}`),
        fetch(`/api/daily-income?department_id=${id}&month=${monthStr}`)
      ]);
      setAddonRulesMap(prev => ({...prev, [id]: rRes.ok ? await rRes.json() : []}));
      setAddonStaffMap(prev => ({...prev, [id]: sRes.ok ? await sRes.json() : []}));
      setIncomesMap(prev => ({...prev, [id]: iRes.ok ? await iRes.json() : []}));
    }
  };

  // CALCULATION LOGIC
  const { otBreakdown, addonBreakdown } = useMemo(() => {
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
      processRole(c.assist_doctor_ids, c.assist_doctor_pct, c.assist_doctor_mode!);
      processRole(c.assist_nurse_ids, c.assist_nurse_pct, c.assist_nurse_mode!);
      processRole(c.paramedical_ids, c.paramedical_ids, c.paramedical_mode!);
    });

    const addonOut: any[] = [];
    addons.filter(a => a.addon_department_id && a.percentage > 0).forEach(addon => {
      const aDept = departments.find(d => d.id === addon.addon_department_id);
      const pool = Math.round(totalOtSum * (addon.percentage / 100) * 100) / 100;
      const activeRules = addon.applied_rules && addon.applied_rules.length > 0 ? addon.applied_rules : (addonRulesMap[addon.addon_department_id] || []).map(r=>r.id);
      const aStaff = addonStaffMap[addon.addon_department_id] || [];
      const incomes = incomesMap[addon.addon_department_id] || [];
      const attRule = addon.attendance_rule || 'none';

      const rows: any[] = [];
      aStaff.forEach(s => {
        const rule = (addonRulesMap[addon.addon_department_id] || []).find(r => activeRules.includes(r.id) && r.role.toUpperCase() === s.role.toUpperCase());
        if(!rule) return;
        const pct = s.department_percentages?.[addon.addon_department_id] ? parseFloat(s.department_percentages[addon.addon_department_id]) : parseFloat(rule.percentage) || 0;
        let absentDays = 0, workingDays = incomes.length;
        if(attRule === 'daily') {
          workingDays = incomes.filter(inc => inc.present_staff_ids?.includes(s.id)).length;
          absentDays = incomes.length - workingDays;
        } else if(attRule === 'monthly') {
          absentDays = leavesList.filter(l => l.staff_id === s.id && l.leave_type === 'OFF').length;
          workingDays = Math.max(0, new Date(parseInt(monthStr.split('-')[0]), parseInt(monthStr.split('-')[1]), 0).getDate() - absentDays);
        }
        rows.push({ staff: s, pct, distType: rule.distribution_type, poolTotal: pool, absentDays, workingDays });
      });

      rows.forEach(r => {
        const groupStaff = rows.filter(x => x.distType === 'group' && x.staff.role === r.staff.role);
        const groupPctSum = groupStaff.reduce((ss, x) => ss + x.pct, 0) || 1;
        const baseShare = r.distType === 'individual' ? (pool * (r.pct / 100)) : (pool * (r.pct / 100)) * (r.pct / groupPctSum);
        let finalShare = baseShare;
        if(attRule === 'daily') finalShare = incomes.length ? (baseShare / incomes.length) * r.workingDays : 0;
        if(attRule === 'monthly') finalShare = (baseShare / (r.workingDays + r.absentDays || 30)) * r.workingDays;
        
        addonOut.push({ deptName: aDept?.name, staffName: r.staff.name, role: r.staff.role, amount: finalShare });
      });
    });

    return { otBreakdown: Object.values(otShares).sort((a,b) => b.amount - a.amount), addonBreakdown: addonOut.sort((a,b) => b.amount - a.amount) };
  }, [cases, addons, staffList, addonRulesMap, addonStaffMap, incomesMap, leavesList, monthStr, departments]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsOT = XLSX.utils.json_to_sheet(otBreakdown);
    const wsAddon = XLSX.utils.json_to_sheet(addonBreakdown);
    XLSX.utils.book_append_sheet(wb, wsOT, 'OT Shares');
    if(addonBreakdown.length) XLSX.utils.book_append_sheet(wb, wsAddon, 'Addon Shares');
    XLSX.writeFile(wb, `OT_Report_${monthStr}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`OT Report - ${monthStr}`, 14, 15);
    autoTable(doc, { head: [['Staff Name', 'Role', 'Amount (Rs)']], body: otBreakdown.map(r => [r.name, r.role, r.amount.toFixed(2)]), startY: 20 });
    if(addonBreakdown.length) {
      doc.addPage();
      doc.text(`Addon Distributions - ${monthStr}`, 14, 15);
      autoTable(doc, { head: [['Department', 'Staff', 'Role', 'Amount (Rs)']], body: addonBreakdown.map(r => [r.deptName, r.staffName, r.role, r.amount.toFixed(2)]), startY: 20 });
    }
    doc.save(`OT_Report_${monthStr}.pdf`);
  };

  const updateCase = (id: string, field: keyof OTCase, value: any) => setCases(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  const duplicateRow = (c: Partial<OTCase>) => setCases(prev => [...prev, { ...c, id: `temp_${Date.now()}_${Math.random()}` }]);
  const deleteRow = (id: string) => setCases(prev => prev.filter(c => c.id !== id));
  const staffOpts = staffList.map(s => ({ value: s.id, label: s.name }));

  if (loading) return <div className="p-8 text-center text-slate-400">Loading OT Ecosystem...</div>;

  return (
    <div className="pb-20">
      <div className="page-header flex justify-between items-end mb-6">
        <div>
          <h1 className="page-title text-2xl font-bold flex items-center gap-2"><Activity className="text-emerald-500" /> OT Entry & Add-ons</h1>
          <p className="text-sm text-slate-400 mt-1">Independent OT surgery case tracking & Global-bound add-on configurations.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} className="text-input w-40" />
          <button onClick={exportExcel} className="btn bg-green-600 hover:bg-green-700"><FileSpreadsheet size={16} className="mr-2"/> Excel</button>
          <button onClick={exportPDF} className="btn bg-red-600 hover:bg-red-700"><FileText size={16} className="mr-2"/> PDF</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} className="mr-2" /> {saving ? 'Saving...' : 'Save All'}</button>
        </div>
      </div>
      {error && <div className="mb-4 p-4 border border-red-500/30 bg-red-500/10 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="glass-card mb-8 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" style={{ minWidth: '2200px' }}>
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase">Date</th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase">Case Type</th>
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase">Amount (₹)</th>
                
                <th className="p-3 text-xs font-semibold text-emerald-400 uppercase border-l border-slate-700 bg-emerald-500/10">Doctor (Main)</th>
                <th className="p-3 text-xs font-semibold text-emerald-400 uppercase border-r border-slate-700 bg-emerald-500/10 text-center">
                  Global %
                  <input type="number" value={gDocPct} onChange={e => updateGlobal('gDocPct', parseFloat(e.target.value)||0)} className="w-12 ml-2 bg-slate-900 border border-slate-600 rounded text-center px-1 text-slate-200"/>
                </th>
                
                <th className="p-3 text-xs font-semibold text-blue-400 uppercase border-l border-slate-700 bg-blue-500/10">Assist Doctor</th>
                <th className="p-3 text-xs font-semibold text-blue-400 uppercase bg-blue-500/10 text-center">
                  Global %
                  <input type="number" value={gADocPct} onChange={e => updateGlobal('gADocPct', parseFloat(e.target.value)||0)} className="w-12 ml-2 bg-slate-900 border border-slate-600 rounded text-center px-1 text-slate-200"/>
                </th>
                <th className="p-3 text-xs font-semibold text-blue-400 uppercase border-r border-slate-700 bg-blue-500/10">
                  <select value={gADocMode} onChange={e => updateGlobal('gADocMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded px-1 ml-1 text-slate-200"><option value="group">Group</option><option value="individual">Ind</option></select>
                </th>
                
                <th className="p-3 text-xs font-semibold text-purple-400 uppercase border-l border-slate-700 bg-purple-500/10">Assist Nurse</th>
                <th className="p-3 text-xs font-semibold text-purple-400 uppercase bg-purple-500/10 text-center">
                  Global %
                  <input type="number" value={gANursePct} onChange={e => updateGlobal('gANursePct', parseFloat(e.target.value)||0)} className="w-12 ml-2 bg-slate-900 border border-slate-600 rounded text-center px-1 text-slate-200"/>
                </th>
                <th className="p-3 text-xs font-semibold text-purple-400 uppercase border-r border-slate-700 bg-purple-500/10">
                  <select value={gANurseMode} onChange={e => updateGlobal('gANurseMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded px-1 ml-1 text-slate-200"><option value="group">Group</option><option value="individual">Ind</option></select>
                </th>

                <th className="p-3 text-xs font-semibold text-orange-400 uppercase border-l border-slate-700 bg-orange-500/10">Paramedical</th>
                <th className="p-3 text-xs font-semibold text-orange-400 uppercase bg-orange-500/10 text-center">
                  Global %
                  <input type="number" value={gParamPct} onChange={e => updateGlobal('gParamPct', parseFloat(e.target.value)||0)} className="w-12 ml-2 bg-slate-900 border border-slate-600 rounded text-center px-1 text-slate-200"/>
                </th>
                <th className="p-3 text-xs font-semibold text-orange-400 uppercase border-r border-slate-700 bg-orange-500/10">
                  <select value={gParamMode} onChange={e => updateGlobal('gParamMode', e.target.value)} className="bg-slate-900 border border-slate-600 rounded px-1 ml-1 text-slate-200"><option value="group">Group</option><option value="individual">Ind</option></select>
                </th>
                
                <th className="p-3 text-xs font-semibold text-slate-400 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={c.id || i} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-3"><input type="date" value={c.date || ''} onChange={(e) => updateCase(c.id!, 'date', e.target.value)} className="text-input p-2 w-36 text-sm" /></td>
                  <td className="p-3"><select value={c.case_type || 'Major'} onChange={(e) => updateCase(c.id!, 'case_type', e.target.value)} className="select-field p-2 w-28 text-sm"><option>Major</option><option>Minor</option></select></td>
                  <td className="p-3"><input type="number" value={c.amount || ''} onChange={(e) => updateCase(c.id!, 'amount', parseFloat(e.target.value))} className="text-input font-bold text-emerald-400 p-2 w-32 text-sm" placeholder="₹0" /></td>

                  <td className="p-3 border-l border-slate-700/50 bg-emerald-500/5 min-w-[200px]"><SingleSelect options={staffOpts} value={c.doctor_id || null} onChange={v => updateCase(c.id!, 'doctor_id', v)} placeholder="Doctor..."/></td>
                  <td className="p-3 border-r border-slate-700/50 bg-emerald-500/5 text-center text-slate-400">{c.doctor_pct}%</td>

                  <td className="p-3 border-l border-slate-700/50 bg-blue-500/5 min-w-[200px]"><MultiSelect options={staffOpts} selected={c.assist_doctor_ids || []} onChange={v => updateCase(c.id!, 'assist_doctor_ids', v)} placeholder="Docs..."/></td>
                  <td className="p-3 bg-blue-500/5 text-center text-slate-400">{c.assist_doctor_pct}%</td>
                  <td className="p-3 border-r border-slate-700/50 bg-blue-500/5 text-slate-400 text-center">{c.assist_doctor_mode}</td>

                  <td className="p-3 border-l border-slate-700/50 bg-purple-500/5 min-w-[200px]"><MultiSelect options={staffOpts} selected={c.assist_nurse_ids || []} onChange={v => updateCase(c.id!, 'assist_nurse_ids', v)} placeholder="Nurses..."/></td>
                  <td className="p-3 bg-purple-500/5 text-center text-slate-400">{c.assist_nurse_pct}%</td>
                  <td className="p-3 border-r border-slate-700/50 bg-purple-500/5 text-slate-400 text-center">{c.assist_nurse_mode}</td>

                  <td className="p-3 border-l border-slate-700/50 bg-orange-500/5 min-w-[200px]"><MultiSelect options={staffOpts} selected={c.paramedical_ids || []} onChange={v => updateCase(c.id!, 'paramedical_ids', v)} placeholder="Params..."/></td>
                  <td className="p-3 bg-orange-500/5 text-center text-slate-400">{c.paramedical_pct}%</td>
                  <td className="p-3 border-r border-slate-700/50 bg-orange-500/5 text-slate-400 text-center">{c.paramedical_mode}</td>

                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => duplicateRow(c)} className="p-2 text-slate-400 hover:text-blue-400 bg-slate-800 rounded hover:bg-slate-700 transition" title="Duplicate"><Copy size={16}/></button>
                      <button onClick={() => deleteRow(c.id!)} className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 rounded hover:bg-slate-700 transition" title="Delete"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-700 bg-slate-800/30">
          <button onClick={addRow} className="btn text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700"><Plus size={16} className="mr-2" /> Add Case</button>
        </div>
      </div>

      {/* Addon Section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2"><Settings className="text-indigo-400"/> Add-On Departments</h2>
          <button onClick={() => setAddons([...addons, { id: `new_${Date.now()}`, month: monthStr, addon_department_id: '', percentage: 0, calculation_type: 'individual', attendance_rule: 'none', applied_rules: [] }])} className="btn text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300">
            <Plus size={14} className="mr-2"/> Add Dept Add-On
          </button>
        </div>

        {addons.length === 0 ? (
          <div className="glass-card p-6 text-center text-slate-500 text-sm border-dashed">No Add-Ons configured for OT Sums.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {addons.map((addon, aIdx) => {
              const aRules = addonRulesMap[addon.addon_department_id] || [];
              const activeRuleIds = addon.applied_rules && addon.applied_rules.length > 0 ? addon.applied_rules : aRules.map(r=>r.id);
              return (
                <div key={aIdx} className="glass-card p-5 border border-slate-700 relative">
                  <button onClick={() => setAddons(addons.filter((_, i) => i !== aIdx))} className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={16}/></button>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="field-label">Target Department</label>
                      <select value={addon.addon_department_id} onChange={e => {
                        const next = [...addons];
                        next[aIdx].addon_department_id = e.target.value;
                        setAddons(next);
                        if(e.target.value) fetchAddonDeps(e.target.value);
                      }} className="select-field">
                        <option value="">Select Department...</option>
                        {departments.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Share Percentage (%)</label>
                      <input type="number" value={addon.percentage} onChange={e => {
                        const next = [...addons];
                        next[aIdx].percentage = parseFloat(e.target.value)||0;
                        setAddons(next);
                      }} className="text-input" placeholder="e.g. 10" />
                    </div>
                    <div>
                      <label className="field-label">Global Attendance Rule</label>
                      <select value={addon.attendance_rule} onChange={e => {
                        const next = [...addons];
                        next[aIdx].attendance_rule = e.target.value as any;
                        setAddons(next);
                      }} className="select-field">
                        <option value="none">No Attendance Impact</option>
                        <option value="monthly">Monthly Global Attendance</option>
                        <option value="daily">Daily Exact Matches</option>
                      </select>
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
                              next[aIdx].applied_rules = isApplied ? activeRuleIds.filter(id => id !== rule.id) : [...activeRuleIds, rule.id];
                              setAddons(next);
                            }} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${isApplied ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
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

    </div>
  );
}
"""

with open('src/app/(dashboard)/ot-entry/page.tsx', 'w') as f:
    f.write(content)
