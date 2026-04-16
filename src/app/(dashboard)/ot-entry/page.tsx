'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Plus, Trash2, Copy, Search, Activity, Users } from 'lucide-react';
import { Staff, OTCase } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

export default function OTEntryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [cases, setCases] = useState<Partial<OTCase>[]>([]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthStr, setMonthStr] = useState(currentMonth);

  // Load Data
  useEffect(() => {
    fetchData();
  }, [monthStr]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Staff
      const staffRes = await fetch('/api/staff');
      if (!staffRes.ok) throw new Error('Failed to fetch staff');
      const staffData = await staffRes.json();
      setStaffList(staffData.filter((s: Staff) => s.is_active));

      // Fetch OT Cases
      const casesRes = await fetch(`/api/ot-cases?month=${monthStr}`);
      if (!casesRes.ok) throw new Error('Failed to fetch OT cases');
      const casesData = await casesRes.json();
      
      setCases(casesData.length > 0 ? casesData : [createEmptyCase()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createEmptyCase = (): Partial<OTCase> => ({
    id: `temp_${Date.now()}_${Math.random()}`, // Temporary ID
    date: `${monthStr}-01`,
    case_type: 'Major',
    amount: 0,
    doctor_id: null,
    doctor_pct: 0,
    assist_doctor_ids: [],
    assist_doctor_pct: 0,
    assist_doctor_mode: 'group',
    assist_nurse_ids: [],
    assist_nurse_pct: 0,
    assist_nurse_mode: 'group',
    paramedical_ids: [],
    paramedical_pct: 0,
    paramedical_mode: 'group'
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Strip out temp IDs so backend creates new uuids for them
      const payload = cases.map(c => ({
        ...c,
        id: c.id?.startsWith('temp_') ? undefined : c.id,
      }));

      const res = await fetch('/api/ot-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthStr, cases: payload })
      });

      if (!res.ok) throw new Error('Failed to save cases');
      
      // reload
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Field updates
  const updateCase = (id: string, field: keyof OTCase, value: any) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Row operations
  const addRow = () => {
    setCases(prev => [...prev, createEmptyCase()]);
  };

  const duplicateRow = (c: Partial<OTCase>) => {
    setCases(prev => [...prev, { ...c, id: `temp_${Date.now()}_${Math.random()}` }]);
  };

  const deleteRow = (id: string) => {
    setCases(prev => prev.filter(c => c.id !== id));
  };

  // Preview Calculation
  const breakdown = useMemo(() => {
    const shares: Record<string, { name: string; role: string; amount: number }> = {};
    
    const getRole = (id: string) => staffList.find(s => s.id === id)?.role || 'Unknown';
    const getName = (id: string) => staffList.find(s => s.id === id)?.name || 'Unknown';

    const addShare = (id: string, amount: number) => {
      if (!id) return;
      if (!shares[id]) shares[id] = { name: getName(id), role: getRole(id), amount: 0 };
      shares[id].amount += amount;
    };

    cases.forEach(c => {
      const amt = parseFloat(String(c.amount)) || 0;
      
      // Doctor (Main)
      if (c.doctor_id) {
        const pct = parseFloat(String(c.doctor_pct)) || 0;
        addShare(c.doctor_id, (amt * pct) / 100);
      }

      // Assist Doctor
      if (c.assist_doctor_ids && c.assist_doctor_ids.length > 0) {
        const pct = parseFloat(String(c.assist_doctor_pct)) || 0;
        const totalShare = (amt * pct) / 100;
        const perPerson = c.assist_doctor_mode === 'group' ? totalShare / c.assist_doctor_ids.length : totalShare;
        c.assist_doctor_ids.forEach(id => addShare(id, perPerson));
      }

      // Assist Nurse
      if (c.assist_nurse_ids && c.assist_nurse_ids.length > 0) {
        const pct = parseFloat(String(c.assist_nurse_pct)) || 0;
        const totalShare = (amt * pct) / 100;
        const perPerson = c.assist_nurse_mode === 'group' ? totalShare / c.assist_nurse_ids.length : totalShare;
        c.assist_nurse_ids.forEach(id => addShare(id, perPerson));
      }

      // Paramedical
      if (c.paramedical_ids && c.paramedical_ids.length > 0) {
        const pct = parseFloat(String(c.paramedical_pct)) || 0;
        const totalShare = (amt * pct) / 100;
        const perPerson = c.paramedical_mode === 'group' ? totalShare / c.paramedical_ids.length : totalShare;
        c.paramedical_ids.forEach(id => addShare(id, perPerson));
      }
    });

    return Object.values(shares).sort((a,b) => b.amount - a.amount);
  }, [cases, staffList]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading OT details...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title text-2xl font-bold flex items-center gap-2">
            <Activity className="text-emerald-500" />
            OT Entry
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Independent case-based surgery entry and calculation module.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="month"
            value={monthStr}
            onChange={(e) => setMonthStr(e.target.value)}
            className="text-input"
            style={{ width: '180px' }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary shadow-lg shadow-blue-500/20"
          >
            {saving ? 'Saving...' : <><Save size={18} className="mr-2" /> Calculate & Save</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 border border-red-500/30 bg-red-500/10 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Grid Area */}
      <div className="glass-card mb-8 overflow-hidden" style={{ padding: 0 }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" style={{ minWidth: '2200px' }}>
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                <th className="p-4 text-sm font-semibold text-slate-400 uppercase">Date</th>
                <th className="p-4 text-sm font-semibold text-slate-400 uppercase">Case Type</th>
                <th className="p-4 text-sm font-semibold text-slate-400 uppercase">Amount (₹)</th>
                
                {/* Doctor Section */}
                <th className="p-4 text-sm font-semibold text-emerald-400 uppercase border-l border-slate-700 bg-emerald-500/5">Doctor (Main)</th>
                <th className="p-4 text-sm font-semibold text-emerald-400 uppercase border-r border-slate-700 bg-emerald-500/5 text-center">%</th>
                
                {/* Assist Doctor Section */}
                <th className="p-4 text-sm font-semibold text-blue-400 uppercase border-l border-slate-700 bg-blue-500/5">Assist Doctor</th>
                <th className="p-4 text-sm font-semibold text-blue-400 uppercase bg-blue-500/5 text-center">%</th>
                <th className="p-4 text-sm font-semibold text-blue-400 uppercase border-r border-slate-700 bg-blue-500/5">Mode</th>
                
                {/* Assist Nurse Section */}
                <th className="p-4 text-sm font-semibold text-purple-400 uppercase border-l border-slate-700 bg-purple-500/5">Assist Nurse</th>
                <th className="p-4 text-sm font-semibold text-purple-400 uppercase bg-purple-500/5 text-center">%</th>
                <th className="p-4 text-sm font-semibold text-purple-400 uppercase border-r border-slate-700 bg-purple-500/5">Mode</th>

                {/* Paramedical Section */}
                <th className="p-4 text-sm font-semibold text-orange-400 uppercase border-l border-slate-700 bg-orange-500/5">Paramedical</th>
                <th className="p-4 text-sm font-semibold text-orange-400 uppercase bg-orange-500/5 text-center">%</th>
                <th className="p-4 text-sm font-semibold text-orange-400 uppercase border-r border-slate-700 bg-orange-500/5">Mode</th>
                
                <th className="p-4 text-sm font-semibold text-slate-400 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={c.id || i} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-3">
                    <input 
                      type="date" 
                      value={c.date || ''} 
                      onChange={(e) => updateCase(c.id!, 'date', e.target.value)}
                      className="text-input" 
                      style={{ padding: '8px 12px', fontSize: '14px', width: '160px' }}
                    />
                  </td>
                  <td className="p-3">
                    <select 
                      value={c.case_type || 'Major'} 
                      onChange={(e) => updateCase(c.id!, 'case_type', e.target.value)}
                      className="select-field"
                      style={{ padding: '8px 12px', fontSize: '14px', width: '120px' }}
                    >
                      <option>Major</option>
                      <option>Minor</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input 
                      type="number" 
                      value={c.amount || ''} 
                      onChange={(e) => updateCase(c.id!, 'amount', e.target.value)}
                      className="text-input font-bold text-emerald-400" 
                      style={{ padding: '8px 12px', fontSize: '15px', width: '140px' }}
                      placeholder="₹0"
                    />
                  </td>

                  {/* Doctor (Main) */}
                  <td className="p-3 border-l border-slate-700/50 bg-emerald-500/5" style={{ minWidth: '220px' }}>
                    <SingleSelect
                      options={staffList.map(s => ({ value: s.id, label: s.name }))}
                      value={c.doctor_id || null}
                      onChange={(val) => updateCase(c.id!, 'doctor_id', val)}
                      placeholder="Select Doctor..."
                    />
                  </td>
                  <td className="p-3 border-r border-slate-700/50 bg-emerald-500/5">
                    <input 
                      type="number" 
                      value={c.doctor_pct || ''} 
                      onChange={(e) => updateCase(c.id!, 'doctor_pct', e.target.value)}
                      className="text-input text-center font-bold" 
                      style={{ padding: '8px 4px', fontSize: '14px', width: '80px' }}
                      placeholder="%"
                    />
                  </td>

                  {/* Assist Doctor */}
                  <td className="p-3 border-l border-slate-700/50 bg-blue-500/5" style={{ minWidth: '220px' }}>
                    <MultiSelect 
                      options={staffList.map(s => ({ value: s.id, label: s.name }))}
                      selected={c.assist_doctor_ids || []}
                      onChange={(vals) => updateCase(c.id!, 'assist_doctor_ids', vals)}
                      placeholder="Assist Docs..."
                    />
                  </td>
                  <td className="p-3 bg-blue-500/5">
                    <input 
                      type="number" 
                      value={c.assist_doctor_pct || ''} 
                      onChange={(e) => updateCase(c.id!, 'assist_doctor_pct', e.target.value)}
                      className="text-input text-center font-bold" 
                      style={{ padding: '8px 4px', fontSize: '14px', width: '80px' }}
                      placeholder="%"
                    />
                  </td>
                  <td className="p-3 border-r border-slate-700/50 bg-blue-500/5">
                    <select 
                      value={c.assist_doctor_mode || 'group'} 
                      onChange={(e) => updateCase(c.id!, 'assist_doctor_mode', e.target.value)}
                      className="select-field"
                      style={{ padding: '8px', fontSize: '14px', width: '100px' }}
                    >
                      <option value="group">Group</option>
                      <option value="individual">Indiv</option>
                    </select>
                  </td>

                  {/* Assist Nurse */}
                  <td className="p-3 border-l border-slate-700/50 bg-purple-500/5" style={{ minWidth: '220px' }}>
                    <MultiSelect 
                      options={staffList.map(s => ({ value: s.id, label: s.name }))}
                      selected={c.assist_nurse_ids || []}
                      onChange={(vals) => updateCase(c.id!, 'assist_nurse_ids', vals)}
                      placeholder="Nurses..."
                    />
                  </td>
                  <td className="p-3 bg-purple-500/5">
                    <input 
                      type="number" 
                      value={c.assist_nurse_pct || ''} 
                      onChange={(e) => updateCase(c.id!, 'assist_nurse_pct', e.target.value)}
                      className="text-input text-center font-bold" 
                      style={{ padding: '8px 4px', fontSize: '14px', width: '80px' }}
                      placeholder="%"
                    />
                  </td>
                  <td className="p-3 border-r border-slate-700/50 bg-purple-500/5">
                    <select 
                      value={c.assist_nurse_mode || 'group'} 
                      onChange={(e) => updateCase(c.id!, 'assist_nurse_mode', e.target.value)}
                      className="select-field"
                      style={{ padding: '8px', fontSize: '14px', width: '100px' }}
                    >
                      <option value="group">Group</option>
                      <option value="individual">Indiv</option>
                    </select>
                  </td>

                  {/* Paramedical */}
                  <td className="p-3 border-l border-slate-700/50 bg-orange-500/5" style={{ minWidth: '220px' }}>
                    <MultiSelect 
                      options={staffList.map(s => ({ value: s.id, label: s.name }))}
                      selected={c.paramedical_ids || []}
                      onChange={(vals) => updateCase(c.id!, 'paramedical_ids', vals)}
                      placeholder="Params..."
                    />
                  </td>
                  <td className="p-3 bg-orange-500/5">
                    <input 
                      type="number" 
                      value={c.paramedical_pct || ''} 
                      onChange={(e) => updateCase(c.id!, 'paramedical_pct', e.target.value)}
                      className="text-input text-center font-bold" 
                      style={{ padding: '8px 4px', fontSize: '14px', width: '80px' }}
                      placeholder="%"
                    />
                  </td>
                  <td className="p-3 border-r border-slate-700/50 bg-orange-500/5">
                    <select 
                      value={c.paramedical_mode || 'group'} 
                      onChange={(e) => updateCase(c.id!, 'paramedical_mode', e.target.value)}
                      className="select-field"
                      style={{ padding: '8px', fontSize: '14px', width: '100px' }}
                    >
                      <option value="group">Group</option>
                      <option value="individual">Indiv</option>
                    </select>
                  </td>

                  {/* Actions */}
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
          <button onClick={addRow} className="btn text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700">
            <Plus size={16} className="mr-2" /> Add Case
          </button>
        </div>
      </div>

      {/* Preview Section */}
      <div className="mb-10">
        <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
          <Users size={18} className="text-blue-400" /> Output Preview (Monthly Aggregated Total)
        </h2>
        {breakdown.length === 0 ? (
          <div className="glass-card p-6 text-center text-slate-500 text-sm border border-slate-700/50">
            No calculated portions yet. Enter amounts and percentages above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {breakdown.map((row, i) => (
              <div key={i} className="glass-card p-4 flex flex-col gap-1 border border-slate-700 hover:border-slate-600 transition-colors">
                <span className="text-slate-200 font-semibold text-sm">{row.name}</span>
                <span className="text-slate-400 text-xs uppercase tracking-wider">{row.role}</span>
                <span className="text-emerald-400 font-bold text-lg mt-2">₹{row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// Mini Multi-Select Component to mimic simple multiselect behavior with search
function MultiSelect({ options, selected, onChange, placeholder }: { options: {value: string, label: string}[], selected: string[], onChange: (v: string[]) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button 
        type="button"
        className="w-full text-left truncate px-4 py-2.5 rounded-lg border border-slate-600 bg-[rgba(15,23,42,0.6)] text-[14px] text-slate-200 hover:border-slate-500 transition-colors shadow-sm"
        onClick={() => setOpen(!open)}
        title={selected.length ? `${selected.length} Selected` : placeholder}
      >
        {selected.length ? `${selected.length} Selected` : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 p-2 block">
          <input 
            type="text" 
            placeholder="Search staff..." 
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded mb-2 text-sm focus:outline-none focus:border-blue-500"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div>
          ) : filtered.map(o => (
            <label key={o.value} className="flex items-center gap-3 p-2 hover:bg-slate-700 rounded cursor-pointer text-[14px] text-slate-200 transition-colors">
              <input 
                type="checkbox" 
                checked={selected.includes(o.value)} 
                onChange={() => toggle(o.value)}
                className="rounded border-slate-500 bg-slate-900 text-blue-500 w-4 h-4 focus:ring-blue-500/50"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Searchable Single Select
function SingleSelect({ options, value, onChange, placeholder }: { options: {value: string, label: string}[], value: string | null, onChange: (v: string) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label;
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button 
        type="button"
        className="w-full text-left truncate px-4 py-2.5 rounded-lg border border-slate-600 bg-[rgba(15,23,42,0.6)] text-[14px] text-slate-200 hover:border-slate-500 transition-colors shadow-sm"
        onClick={() => setOpen(!open)}
      >
        {selectedLabel ? <span className="text-slate-200">{selectedLabel}</span> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 p-2 block">
          <input 
            type="text" 
            placeholder="Search staff..." 
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded mb-2 text-sm focus:outline-none focus:border-blue-500"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-500 p-2 text-center">No matching staff</div>
          ) : (
            <>
              <div 
                className="p-2 hover:bg-slate-700 rounded cursor-pointer text-[14px] text-slate-400 italic mb-1"
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
              >
                -- Clear Selection --
              </div>
              {filtered.map(o => (
                <div 
                  key={o.value} 
                  className={`p-2 hover:bg-slate-700 rounded cursor-pointer text-[14px] transition-colors ${o.value === value ? 'bg-blue-500/20 text-blue-400' : 'text-slate-200'}`}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                >
                  {o.label}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
