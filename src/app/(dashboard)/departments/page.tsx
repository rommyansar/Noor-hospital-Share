'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, DepartmentForm } from '@/lib/types';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentForm>({ name: '', type: 'clinical', is_active: true });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const loadDepartments = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('departments').select('*').order('name');
    setDepartments(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDepartments(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', type: 'clinical', is_active: true });
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({ name: dept.name, type: dept.type, is_active: dept.is_active });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('error', 'Department name is required.'); return; }
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase.from('departments').update(form).eq('id', editing.id);
      if (error) { addToast('error', error.message); setSaving(false); return; }
      addToast('success', 'Department updated.');
    } else {
      const { error } = await supabase.from('departments').insert(form);
      if (error) { addToast('error', error.message); setSaving(false); return; }
      addToast('success', 'Department created.');
    }

    setShowModal(false);
    setSaving(false);
    loadDepartments();
  };

  const handleDelete = async (dept: Department) => {
    if (!confirm(`Delete "${dept.name}"? This will also delete all related rules, staff, and data.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('departments').delete().eq('id', dept.id);
    if (error) { addToast('error', error.message); return; }
    addToast('success', 'Department deleted.');
    loadDepartments();
  };

  const toggleActive = async (dept: Department) => {
    const supabase = createClient();
    await supabase.from('departments').update({ is_active: !dept.is_active }).eq('id', dept.id);
    loadDepartments();
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="text-slate-400 text-sm mt-1">Manage hospital departments</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Department
        </button>
      </div>

      {departments.length === 0 ? (
        <div className="glass-card empty-state">
          <Building2 size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No departments yet</p>
          <p className="text-sm text-slate-500 mt-1">Create your first department to get started.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="glass-card table-container hidden md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id}>
                    <td className="font-medium text-white">{dept.name}</td>
                    <td>
                      <span className={`badge ${dept.type === 'clinical' ? 'badge-info' : 'badge-warning'}`}>
                        {dept.type === 'clinical' ? 'Clinical' : 'Non-Clinical'}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => toggleActive(dept)}>
                        <div className={`toggle-switch ${dept.is_active ? 'active' : 'inactive'}`}>
                          <div className="toggle-knob" />
                        </div>
                      </button>
                    </td>
                    <td className="text-slate-400">{new Date(dept.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-2 justify-end">
                        <button className="btn-secondary btn-sm" onClick={() => openEdit(dept)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(dept)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col gap-4">
            {departments.map((dept) => (
              <div key={dept.id} className="glass-card p-4 flex flex-col gap-3 relative">
                <div className="flex justify-between items-start border-b border-slate-700/50 pb-3">
                  <div>
                    <div className="font-medium text-white text-lg">{dept.name}</div>
                    <div className="text-sm text-slate-400 mt-1">Created: {new Date(dept.created_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => toggleActive(dept)}>
                    <div className={`toggle-switch ${dept.is_active ? 'active' : 'inactive'}`}>
                      <div className="toggle-knob" />
                    </div>
                  </button>
                </div>

                <div className="py-1">
                   <span className="text-slate-500 text-xs block mb-1 uppercase tracking-wider font-semibold">Type</span>
                   <span className={`badge ${dept.type === 'clinical' ? 'badge-info' : 'badge-warning'}`}>
                     {dept.type === 'clinical' ? 'Clinical' : 'Non-Clinical'}
                   </span>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/50 mt-1">
                  <button className="btn-secondary flex-1 justify-center" onClick={() => openEdit(dept)}>
                    <Edit2 size={16} /> Edit
                  </button>
                  <button className="btn-danger flex-1 justify-center" onClick={() => handleDelete(dept)}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white mb-5">{editing ? 'Edit Department' : 'Add Department'}</h2>

            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input className="input-field" placeholder="e.g. Cardiology" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="select-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'clinical' | 'non_clinical' })}>
                <option value="clinical">Clinical</option>
                <option value="non_clinical">Non-Clinical</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <button onClick={() => setForm({ ...form, is_active: !form.is_active })}>
                <div className={`toggle-switch ${form.is_active ? 'active' : 'inactive'}`}>
                  <div className="toggle-knob" />
                </div>
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
