'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { Staff, Department, Attendance } from '@/lib/types';
import { MONTHS } from '@/lib/types';
import { Save, CalendarCheck, Users, ChevronDown } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────
interface EditRow {
  worked_days: string;
  paid_leaves: string;
  unpaid_leaves: string;
}

const num = (v: string) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : Math.max(0, n);
};

const displayVal = (v: string) => (v === '0' || v === '' ? '' : v);

// ── Component ────────────────────────────────────────────────
export default function AttendancePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [records, setRecords] = useState<Map<string, Attendance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterDept, setFilterDept] = useState('');
  const [totalDays, setTotalDays] = useState('26');
  const { addToast } = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [edits, setEdits] = useState<Map<string, EditRow>>(new Map());

  // ── Data loading ───────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [deptsRes, staffRes, attRes] = await Promise.all([
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
      supabase.from('staff').select('*, departments(name), share_rules(role_name)').eq('is_active', true).order('name'),
      supabase.from('attendance').select('*').eq('year', year).eq('month', month),
    ]);

    setDepartments(deptsRes.data || []);
    setStaffList(staffRes.data || []);

    const recordMap = new Map<string, Attendance>();
    const editMap = new Map<string, EditRow>();

    (attRes.data || []).forEach(a => {
      recordMap.set(a.staff_id, a);
      editMap.set(a.staff_id, {
        worked_days: String(a.worked_days || ''),
        paid_leaves: String(a.paid_leaves || ''),
        unpaid_leaves: String(a.unpaid_leaves || ''),
      });
      if (a.total_days) setTotalDays(String(a.total_days));
    });

    (staffRes.data || []).forEach(s => {
      if (!editMap.has(s.id)) {
        editMap.set(s.id, { worked_days: '', paid_leaves: '', unpaid_leaves: '' });
      }
    });

    setRecords(recordMap);
    setEdits(editMap);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // ── Edit handler ───────────────────────────────────────────
  const updateEdit = (staffId: string, field: keyof EditRow, value: string) => {
    // Only allow digits
    const clean = value.replace(/[^0-9]/g, '');
    setEdits(prev => {
      const next = new Map(prev);
      const current = next.get(staffId) || { worked_days: '', paid_leaves: '', unpaid_leaves: '' };
      next.set(staffId, { ...current, [field]: clean });
      return next;
    });
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSaveAll = async () => {
    const td = num(totalDays);
    if (td <= 0) { addToast('error', 'Total days must be greater than 0.'); return; }
    setSaving(true);
    const supabase = createClient();
    const filtered = filterDept ? staffList.filter(s => s.department_id === filterDept) : staffList;

    for (const s of filtered) {
      const edit = edits.get(s.id);
      if (!edit) continue;

      const wd = num(edit.worked_days);
      const cl = num(edit.paid_leaves);
      const off = num(edit.unpaid_leaves);
      const total = wd + cl + off;

      if (total > td) {
        addToast('error', `${s.name}: total (${total}) exceeds ${td} days.`);
        setSaving(false);
        return;
      }

      const payload = {
        staff_id: s.id,
        year,
        month,
        total_days: td,
        worked_days: wd,
        paid_leaves: cl,
        unpaid_leaves: off,
        half_days: 0,
      };

      const existing = records.get(s.id);
      if (existing) {
        await supabase.from('attendance').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('attendance').insert(payload);
      }
    }

    addToast('success', 'Attendance saved.');
    setSaving(false);
    load();
  };

  const filteredStaff = filterDept ? staffList.filter(s => s.department_id === filterDept) : staffList;
  const totalDaysNum = num(totalDays);

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="att-page">
      {/* Header */}
      <div className="att-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="att-subtitle">Record monthly attendance for all staff</p>
        </div>
        <button className="btn-primary" onClick={handleSaveAll} disabled={saving}>
          {saving ? <><div className="spinner" /> Saving...</> : <><Save size={16} /> Save All</>}
        </button>
      </div>

      {/* Filters */}
      <div className="att-filters">
        <div className="att-filter-grid">
          <div className="att-filter-item">
            <label className="att-label">Year</label>
            <div className="att-select-wrap">
              <select className="att-select" value={year} onChange={e => setYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="att-select-icon" />
            </div>
          </div>
          <div className="att-filter-item">
            <label className="att-label">Month</label>
            <div className="att-select-wrap">
              <select className="att-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="att-select-icon" />
            </div>
          </div>
          <div className="att-filter-item">
            <label className="att-label">Working Days</label>
            <input
              type="text"
              inputMode="numeric"
              className="att-input"
              placeholder="26"
              value={displayVal(totalDays)}
              onFocus={e => e.target.select()}
              onChange={e => setTotalDays(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div className="att-filter-item">
            <label className="att-label">Department</label>
            <div className="att-select-wrap">
              <select className="att-select" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="">All</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <ChevronDown size={14} className="att-select-icon" />
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filteredStaff.length === 0 ? (
        <div className="att-empty">
          <Users size={48} />
          <p>No active staff found</p>
        </div>
      ) : (
        <>
          {/* ── Desktop Table ──────────────────────────────── */}
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Dept</th>
                  <th>Role</th>
                  <th className="att-th-num">Working</th>
                  <th className="att-th-num">CL</th>
                  <th className="att-th-num">OFF</th>
                  <th className="att-th-num">Effective</th>
                  <th className="att-th-num">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(s => {
                  const edit = edits.get(s.id) || { worked_days: '', paid_leaves: '', unpaid_leaves: '' };
                  const wd = num(edit.worked_days);
                  const cl = num(edit.paid_leaves);
                  const effective = wd + cl;
                  const ratio = totalDaysNum > 0 ? Math.min(effective / totalDaysNum, 1) : 0;

                  return (
                    <tr key={s.id}>
                      <td className="att-td-name">{s.name}</td>
                      <td className="att-td-dept">{s.departments?.name}</td>
                      <td><span className="att-role-badge">{s.share_rules?.role_name}</span></td>
                      <td className="att-td-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="att-num-input"
                          placeholder="0"
                          value={displayVal(edit.worked_days)}
                          onFocus={e => e.target.select()}
                          onChange={e => updateEdit(s.id, 'worked_days', e.target.value)}
                        />
                      </td>
                      <td className="att-td-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="att-num-input"
                          placeholder="0"
                          value={displayVal(edit.paid_leaves)}
                          onFocus={e => e.target.select()}
                          onChange={e => updateEdit(s.id, 'paid_leaves', e.target.value)}
                        />
                      </td>
                      <td className="att-td-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="att-num-input"
                          placeholder="0"
                          value={displayVal(edit.unpaid_leaves)}
                          onFocus={e => e.target.select()}
                          onChange={e => updateEdit(s.id, 'unpaid_leaves', e.target.value)}
                        />
                      </td>
                      <td className="att-td-effective">{effective}</td>
                      <td>
                        <span className={`att-ratio-pill ${ratio >= 0.8 ? 'green' : ratio >= 0.5 ? 'amber' : 'red'}`}>
                          {(ratio * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards ───────────────────────────────── */}
          <div className="att-cards">
            {filteredStaff.map(s => {
              const edit = edits.get(s.id) || { worked_days: '', paid_leaves: '', unpaid_leaves: '' };
              const wd = num(edit.worked_days);
              const cl = num(edit.paid_leaves);
              const effective = wd + cl;
              const ratio = totalDaysNum > 0 ? Math.min(effective / totalDaysNum, 1) : 0;

              return (
                <div key={s.id} className="att-card">
                  {/* Card header */}
                  <div className="att-card-head">
                    <div>
                      <div className="att-card-name">{s.name}</div>
                      <div className="att-card-meta">
                        {s.departments?.name} · <span className="att-card-role">{s.share_rules?.role_name}</span>
                      </div>
                    </div>
                    <span className={`att-ratio-pill ${ratio >= 0.8 ? 'green' : ratio >= 0.5 ? 'amber' : 'red'}`}>
                      {(ratio * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Inputs row */}
                  <div className="att-card-inputs">
                    <div className="att-card-field">
                      <label>Working</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="att-num-input"
                        placeholder="0"
                        value={displayVal(edit.worked_days)}
                        onFocus={e => e.target.select()}
                        onChange={e => updateEdit(s.id, 'worked_days', e.target.value)}
                      />
                    </div>
                    <div className="att-card-field">
                      <label>CL</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="att-num-input"
                        placeholder="0"
                        value={displayVal(edit.paid_leaves)}
                        onFocus={e => e.target.select()}
                        onChange={e => updateEdit(s.id, 'paid_leaves', e.target.value)}
                      />
                    </div>
                    <div className="att-card-field">
                      <label>OFF</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="att-num-input"
                        placeholder="0"
                        value={displayVal(edit.unpaid_leaves)}
                        onFocus={e => e.target.select()}
                        onChange={e => updateEdit(s.id, 'unpaid_leaves', e.target.value)}
                      />
                    </div>
                    <div className="att-card-field att-card-effective">
                      <label>Effective</label>
                      <div className="att-eff-value">{effective}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Mobile FAB save button */}
      <button className="att-fab" onClick={handleSaveAll} disabled={saving} aria-label="Save attendance">
        {saving ? <div className="spinner" /> : <Save size={22} />}
      </button>
    </div>
  );
}
