'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, MonthlyIncome, CalculationPreview, ValidationError } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { Calculator, Eye, Save, Lock, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CalculatePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [incomes, setIncomes] = useState<Map<string, MonthlyIncome>>(new Map());
  const [incomeEdits, setIncomeEdits] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [preview, setPreview] = useState<CalculationPreview[] | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const { addToast } = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');

  const load = async () => {
    try {
      setLoading(true);
      setPreview(null);
      setErrors([]);
      const supabase = createClient();
      const [deptsRes, incomeRes] = await Promise.all([
        supabase.from('departments').select('*').eq('is_active', true).order('name'),
        supabase.from('monthly_income').select('*').eq('year', year).eq('month', month),
      ]);

      setDepartments(deptsRes.data || []);

      const incMap = new Map<string, MonthlyIncome>();
      const editMap = new Map<string, number>();
      let locked = false;
      (incomeRes.data || []).forEach(inc => {
        incMap.set(inc.department_id, inc);
        editMap.set(inc.department_id, Number(inc.income_amount));
        if (inc.is_locked) locked = true;
      });
      (deptsRes.data || []).forEach(d => {
        if (!editMap.has(d.id)) editMap.set(d.id, 0);
      });

      setIncomes(incMap);
      setIncomeEdits(editMap);
      setIsLocked(locked);
    } catch (err) {
      console.error(err);
      addToast('error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year, month]);

  const saveIncomes = async () => {
    setSavingIncome(true);
    const supabase = createClient();
    const deptsToSave = selectedDeptId === 'all' ? departments : departments.filter(d => d.id === selectedDeptId);
    
    for (const dept of deptsToSave) {
      const amount = incomeEdits.get(dept.id) || 0;
      const existing = incomes.get(dept.id);
      if (existing) {
        await supabase.from('monthly_income').update({ income_amount: amount }).eq('id', existing.id);
      } else if (amount > 0) {
        await supabase.from('monthly_income').insert({ department_id: dept.id, year, month, income_amount: amount });
      }
    }
    addToast('success', 'Income saved.');
    setSavingIncome(false);
    load();
  };

  const handleCalculate = async (action: 'preview' | 'save') => {
    setCalculating(true);
    setPreview(null);
    setErrors([]);
    try {
      const payload: any = { year, month, action };
      if (selectedDeptId !== 'all') {
        payload.department_id = selectedDeptId;
      }
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        addToast('error', data.error);
      } else {
        setErrors(data.errors || []);
        setPreview(data.previews || []);
        if (action === 'save' && data.saved) {
          addToast('success', `Calculated shares for ${data.count} staff members.`);
        } else if (action === 'save' && !data.saved) {
          addToast('error', 'Cannot save — fix errors first.');
        }
      }
    } catch {
      addToast('error', 'Calculation failed.');
    }
    setCalculating(false);
  };

  const handleLockToggle = async () => {
    const action = isLocked ? 'unlock' : 'lock';
    if (action === 'lock' && !confirm('Lock this month? No further edits will be allowed.')) return;
    try {
      await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, action }),
      });
      addToast('success', `Month ${action}ed.`);
      load();
    } catch {
      addToast('error', 'Failed to toggle lock.');
    }
  };

  const displayedDepartments = selectedDeptId === 'all' ? departments : departments.filter(d => d.id === selectedDeptId);
  const totalIncome = displayedDepartments.reduce((s, d) => s + (incomeEdits.get(d.id) || 0), 0);
  const totalShares = preview?.reduce((s, p) => s + p.final_share, 0) || 0;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Calculate Shares</h1>
          <p className="text-slate-400 text-sm mt-1">Enter income, preview, and run calculations</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleLockToggle}>
            {isLocked ? <><Unlock size={16} /> Unlock Month</> : <><Lock size={16} /> Lock Month</>}
          </button>
        </div>
      </div>

      {isLocked && (
        <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <p className="text-amber-400 text-sm font-medium flex items-center gap-2"><Lock size={16} /> This month is locked. Unlock to make changes.</p>
        </div>
      )}

      {/* Month + Income Section */}
      <div className="glass-card p-5 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
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
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={selectedDeptId} onChange={(e) => setSelectedDeptId(e.target.value)}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full justify-center" onClick={saveIncomes} disabled={savingIncome || isLocked}>
              {savingIncome ? <><div className="spinner" /> Saving...</> : <><Save size={16} /> Save Income</>}
            </button>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Department Income</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedDepartments.map(dept => (
            <div key={dept.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(71,85,105,0.2)' }}>
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{dept.name}</p>
                <p className="text-xs text-slate-500">{dept.type === 'clinical' ? 'Clinical' : 'Non-Clinical'}</p>
              </div>
              <div style={{ width: 140 }}>
                <input type="number" className="input-field" style={{ padding: '6px 10px', textAlign: 'right' }}
                  placeholder="₹ 0" disabled={isLocked}
                  value={incomeEdits.get(dept.id) || ''} onChange={(e) => {
                    const next = new Map(incomeEdits);
                    next.set(dept.id, Number(e.target.value) || 0);
                    setIncomeEdits(next);
                  }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-right">
          <span className="text-sm text-slate-400">Total Income: </span>
          <span className="text-lg font-bold text-emerald-400">₹{totalIncome.toLocaleString()}</span>
        </div>
      </div>

      {/* Calculate Buttons */}
      <div className="flex gap-3 mb-5">
        <button className="btn-secondary flex-1 justify-center" onClick={() => handleCalculate('preview')} disabled={calculating || isLocked}>
          {calculating ? <><div className="spinner" /> Calculating...</> : <><Eye size={16} /> Preview Calculation</>}
        </button>
        <button className="btn-primary flex-1 justify-center" onClick={() => handleCalculate('save')} disabled={calculating || isLocked}>
          {calculating ? <><div className="spinner" /> Calculating...</> : <><Calculator size={16} /> Calculate & Save</>}
        </button>
      </div>

      {/* Errors / Warnings */}
      {errors.length > 0 && (
        <div className="mb-5 space-y-2">
          {errors.map((err, i) => (
            <div key={i} className="p-3 rounded-xl text-sm flex items-start gap-2" style={{
              background: err.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${err.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
              color: err.type === 'error' ? '#f87171' : '#fbbf24',
            }}>
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              {err.message}
            </div>
          ))}
        </div>
      )}

      {/* Preview Results */}
      {preview && preview.length > 0 && (
        <div className="glass-card">
          <div className="flex items-center justify-between p-5 pb-0">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-400" />
              Calculation Results
            </h3>
            <span className="text-sm text-emerald-400 font-semibold">Total: ₹{totalShares.toLocaleString()}</span>
          </div>
          <div className="table-container mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Dist. Type</th>
                  <th>Income</th>
                  <th>Rule %</th>
                  <th>Pool</th>
                  <th>Staff in Pool</th>
                  <th>Base Share</th>
                  <th>Eff. Days</th>
                  <th>Ratio</th>
                  <th>Final Share</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td className="font-medium text-white">{p.staff_name}</td>
                    <td>{p.department_name}</td>
                    <td><span className="badge badge-info">{p.role_name}</span></td>
                    <td><span className={`badge ${p.distribution_type === 'pool' ? 'badge-success' : 'badge-warning'}`}>{p.distribution_type}</span></td>
                    <td>₹{Number(p.department_income).toLocaleString()}</td>
                    <td>{p.rule_percentage}%</td>
                    <td>₹{Number(p.share_pool).toLocaleString()}</td>
                    <td>{p.staff_in_pool}</td>
                    <td>₹{Number(p.base_share).toLocaleString()}</td>
                    <td>{p.effective_worked_days}/{p.total_days}</td>
                    <td>
                      <span className={`badge ${p.attendance_ratio >= 0.8 ? 'badge-success' : p.attendance_ratio >= 0.5 ? 'badge-warning' : 'badge-danger'}`}>
                        {(p.attendance_ratio * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="font-bold text-emerald-400">₹{Number(p.final_share).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
