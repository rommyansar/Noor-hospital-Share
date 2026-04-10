'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { ShareRule, ShareRuleForm, Department } from '@/lib/types';
import { Plus, Edit2, Trash2, Settings2 } from 'lucide-react';

const defaultForm: ShareRuleForm = {
  department_id: '', role_name: '', share_percentage: 0,
  share_type: 'group', distribution_type: 'pool', absent_handling: 'exclude',
  effective_from: '', effective_to: '', is_active: true,
};

export default function RulesPage() {
  const [rules, setRules] = useState<ShareRule[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ShareRule | null>(null);
  const [form, setForm] = useState<ShareRuleForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [filterDept, setFilterDept] = useState('');
  const { addToast } = useToast();

  const load = async () => {
    const supabase = createClient();
    const [rulesRes, deptsRes] = await Promise.all([
      supabase.from('share_rules').select('*, departments(name)').order('department_id').order('role_name'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
    ]);
    setRules(rulesRes.data || []);
    setDepartments(deptsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...defaultForm, department_id: filterDept || (departments[0]?.id || '') });
    setShowModal(true);
  };

  const openEdit = (r: ShareRule) => {
    setEditing(r);
    setForm({
      department_id: r.department_id, role_name: r.role_name,
      share_percentage: r.share_percentage, share_type: r.share_type,
      distribution_type: r.distribution_type, absent_handling: r.absent_handling,
      effective_from: r.effective_from || '', effective_to: r.effective_to || '',
      is_active: r.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.department_id || !form.role_name.trim() || form.share_percentage <= 0) {
      addToast('error', 'Fill in all required fields.'); return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      ...form,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
    };

    if (editing) {
      const { error } = await supabase.from('share_rules').update(payload).eq('id', editing.id);
      if (error) { addToast('error', error.message); setSaving(false); return; }
      addToast('success', 'Rule updated.');
    } else {
      const { error } = await supabase.from('share_rules').insert(payload);
      if (error) { addToast('error', error.message); setSaving(false); return; }
      addToast('success', 'Rule created.');
    }
    setShowModal(false); setSaving(false); load();
  };

  const handleDelete = async (r: ShareRule) => {
    if (!confirm(`Delete rule "${r.role_name}"? Staff assigned to this role will also be affected.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('share_rules').delete().eq('id', r.id);
    if (error) { addToast('error', error.message); return; }
    addToast('success', 'Rule deleted.'); load();
  };

  const filtered = filterDept ? rules.filter(r => r.department_id === filterDept) : rules;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Share Rules</h1>
          <p className="text-slate-400 text-sm mt-1">Configure incentive distribution rules per department</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Add Rule</button>
      </div>

      {/* Filter */}
      <div className="mb-5" style={{ maxWidth: 300 }}>
        <select className="select-field" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card empty-state">
          <Settings2 size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No share rules yet</p>
          <p className="text-sm text-slate-500 mt-1">Define how income is shared among staff roles.</p>
        </div>
      ) : (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Role</th>
                <th>Percentage</th>
                <th>Distribution</th>
                <th>Absent Handling</th>
                <th>Effective</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-white">{r.departments?.name}</td>
                  <td>{r.role_name}</td>
                  <td>
                    <span className="text-emerald-400 font-semibold">{r.share_percentage}%</span>
                  </td>
                  <td>
                    <span className={`badge ${r.distribution_type === 'pool' ? 'badge-info' : 'badge-warning'}`}>
                      {r.distribution_type === 'pool' ? 'Pool' : 'Per Person'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.absent_handling === 'exclude' ? 'badge-success' : 'badge-warning'}`}>
                      {r.absent_handling === 'exclude' ? 'Exclude' : 'Include'}
                    </span>
                  </td>
                  <td className="text-slate-400 text-xs">
                    {r.effective_from ? new Date(r.effective_from).toLocaleDateString() : '—'}
                    {' → '}
                    {r.effective_to ? new Date(r.effective_to).toLocaleDateString() : 'Ongoing'}
                  </td>
                  <td><span className={`badge ${r.is_active ? 'badge-success' : 'badge-danger'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                      <button className="btn-danger btn-sm" onClick={() => handleDelete(r)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white mb-5">{editing ? 'Edit Rule' : 'Add Rule'}</h2>

            <div className="form-group">
              <label className="form-label">Department</label>
              <select className="select-field" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Select department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Role Name</label>
              <input className="input-field" placeholder="e.g. Doctor, Nurse, Technician" value={form.role_name} onChange={(e) => setForm({ ...form, role_name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Share Percentage (%)</label>
                <input type="number" className="input-field" min="0" max="100" step="0.01" value={form.share_percentage} onChange={(e) => setForm({ ...form, share_percentage: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Share Type</label>
                <select className="select-field" value={form.share_type} onChange={(e) => setForm({ ...form, share_type: e.target.value as 'fixed' | 'group' })}>
                  <option value="group">Group</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Distribution Type</label>
                <select className="select-field" value={form.distribution_type} onChange={(e) => setForm({ ...form, distribution_type: e.target.value as 'per_person' | 'pool' })}>
                  <option value="pool">Pool (Recommended)</option>
                  <option value="per_person">Per Person</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Absent Staff</label>
                <select className="select-field" value={form.absent_handling} onChange={(e) => setForm({ ...form, absent_handling: e.target.value as 'exclude' | 'include' })}>
                  <option value="exclude">Exclude (Recommended)</option>
                  <option value="include">Include</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Effective From (optional)</label>
                <input type="date" className="input-field" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Effective To (optional)</label>
                <input type="date" className="input-field" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <button onClick={() => setForm({ ...form, is_active: !form.is_active })}>
                <div className={`toggle-switch ${form.is_active ? 'active' : 'inactive'}`}><div className="toggle-knob" /></div>
              </button>
              <span className="text-sm text-slate-400 ml-3">{form.is_active ? 'Active' : 'Inactive'}</span>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1 justify-center" onClick={handleSave} disabled={saving}>
                {saving ? <><div className="spinner" /> Saving...</> : 'Save Rule'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
