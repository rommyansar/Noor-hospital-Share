'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { Staff, StaffForm, Department, ShareRule } from '@/lib/types';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rules, setRules] = useState<ShareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffForm>({ staff_code: '', name: '', department_id: '', share_rule_id: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [filterDept, setFilterDept] = useState('');
  const { addToast } = useToast();

  const load = async () => {
    const supabase = createClient();
    const [staffRes, deptsRes, rulesRes] = await Promise.all([
      supabase.from('staff').select('*, departments(name), share_rules(role_name)').order('name'),
      supabase.from('departments').select('*').eq('is_active', true).order('name'),
      supabase.from('share_rules').select('*').eq('is_active', true).order('role_name'),
    ]);
    setStaffList(staffRes.data || []);
    setDepartments(deptsRes.data || []);
    setRules(rulesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredRules = form.department_id ? rules.filter(r => r.department_id === form.department_id) : [];
  const filteredStaff = filterDept ? staffList.filter(s => s.department_id === filterDept) : staffList;

  const openAdd = () => {
    setEditing(null);
    setForm({ staff_code: '', name: '', department_id: filterDept || '', share_rule_id: '', is_active: true });
    setShowModal(true);
  };

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({ staff_code: s.staff_code, name: s.name, department_id: s.department_id, share_rule_id: s.share_rule_id, is_active: s.is_active });
    setShowModal(true);
  };

  const handleGenerateCode = async () => {
    if (!form.share_rule_id) {
       addToast('error', 'Please select a Role first to determine the code prefix.');
       return;
    }
    const rule = rules.find(r => r.id === form.share_rule_id);
    if (!rule) return;
    
    setGeneratingCode(true);
    try {
      const res = await fetch(`/api/staff/generate-code?role=${encodeURIComponent(rule.role_name)}`);
      const data = await res.json();
      if (data.error) addToast('error', data.error);
      else setForm({ ...form, staff_code: data.code });
    } catch {
      addToast('error', 'Failed to generate code.');
    }
    setGeneratingCode(false);
  };

  const handleSave = async () => {
    if (!form.staff_code.trim() || !form.name.trim() || !form.department_id || !form.share_rule_id) {
      addToast('error', 'Fill all required fields including Staff Code.'); return;
    }
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase.from('staff').update(form).eq('id', editing.id);
      if (error) { 
        if (error.code === '23505') addToast('error', 'Code is already in use. Try generating a new one.');
        else addToast('error', error.message); 
        setSaving(false); return; 
      }
      addToast('success', 'Staff updated.');
    } else {
      const { error } = await supabase.from('staff').insert(form);
      if (error) { 
        if (error.code === '23505') addToast('error', 'Simultaneous creation detected! Code is already in use. Please regenerate and retry.');
        else addToast('error', error.message); 
        setSaving(false); return; 
      }
      addToast('success', 'Staff added.');
    }
    setShowModal(false); setSaving(false); load();
  };

  const handleDelete = async (s: Staff) => {
    if (!confirm(`Remove "${s.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('staff').delete().eq('id', s.id);
    if (error) { addToast('error', error.message); return; }
    addToast('success', 'Staff removed.'); load();
  };

  const toggleActive = async (s: Staff) => {
    const supabase = createClient();
    await supabase.from('staff').update({ is_active: !s.is_active }).eq('id', s.id);
    load();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage hospital staff and role assignments</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Add Staff</button>
      </div>

      <div className="mb-5" style={{ maxWidth: 300 }}>
        <select className="select-field" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {filteredStaff.length === 0 ? (
        <div className="glass-card empty-state">
          <Users size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No staff members yet</p>
          <p className="text-sm text-slate-500 mt-1">Add staff and assign them to departments & roles.</p>
        </div>
      ) : (
        <div className="glass-card table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Department</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-slate-300">{s.staff_code}</td>
                  <td className="font-medium text-white">{s.name}</td>
                  <td>{s.departments?.name}</td>
                  <td><span className="badge badge-info">{s.share_rules?.role_name}</span></td>
                  <td>
                    <button onClick={() => toggleActive(s)}>
                      <div className={`toggle-switch ${s.is_active ? 'active' : 'inactive'}`}><div className="toggle-knob" /></div>
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(s)}><Edit2 size={14} /></button>
                      <button className="btn-danger btn-sm" onClick={() => handleDelete(s)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white mb-5">{editing ? 'Edit Staff' : 'Add Staff'}</h2>

            <div className="form-group">
              <label className="form-label">Department</label>
              <select className="select-field" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, share_rule_id: '' })}>
                <option value="">Select department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Role (Share Rule)</label>
              <select className="select-field" value={form.share_rule_id} onChange={(e) => setForm({ ...form, share_rule_id: e.target.value })}>
                <option value="">Select role</option>
                {filteredRules.map(r => <option key={r.id} value={r.id}>{r.role_name} ({r.share_percentage}% — {r.distribution_type})</option>)}
              </select>
              {form.department_id && filteredRules.length === 0 && (
                <p className="text-xs text-amber-400 mt-1">No rules defined for this department. Create rules first.</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Staff Code</label>
              <div className="flex gap-2">
                <input className="input-field font-mono" placeholder="e.g. DOC-001" value={form.staff_code} onChange={(e) => setForm({ ...form, staff_code: e.target.value.toUpperCase() })} />
                <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={handleGenerateCode} disabled={generatingCode || !form.share_rule_id}>
                  {generatingCode ? '...' : 'Generate Code'}
                </button>
              </div>
              {!form.share_rule_id && <p className="text-xs text-slate-500 mt-1">Select a Role first to automatically generate code.</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="input-field" placeholder="Staff name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                {saving ? <><div className="spinner" /> Saving...</> : 'Save'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
