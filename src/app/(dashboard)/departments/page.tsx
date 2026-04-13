'use client';

import { useState, useEffect } from 'react';
import { Plus, Building2, Pencil, Trash2, X, Users } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, DepartmentForm } from '@/lib/types';

export default function DepartmentsPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DepartmentForm>({ name: '', is_active: true, is_sub_department: false, include_general_staff: true });

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data);
    setLoading(false);
  };

  useEffect(() => { fetchDepartments(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', is_active: true, is_sub_department: false, include_general_staff: true });
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setForm({
      name: dept.name,
      is_active: dept.is_active,
      is_sub_department: dept.is_sub_department || false,
      include_general_staff: dept.include_general_staff ?? true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('error', 'Name is required'); return; }
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/departments/${editingId}` : '/api/departments';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const err = await res.json();
      addToast('error', err.error || 'Failed to save');
      return;
    }

    addToast('success', editingId ? 'Department updated' : 'Department created');
    setShowModal(false);
    fetchDepartments();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this department? All related data will be lost.')) return;
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      addToast('error', 'Failed to delete');
      return;
    }
    addToast('success', 'Department deleted');
    fetchDepartments();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Manage hospital departments
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Department
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : departments.length === 0 ? (
        <div className="glass-card empty-state">
          <Building2 size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No departments yet</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>Add your first department to get started</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>General Staff</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '10px',
                          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Building2 size={16} style={{ color: '#34d399' }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-md border ${
                        d.is_sub_department 
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {d.is_sub_department ? 'Sub-Department' : 'Primary'}
                      </span>
                    </td>
                    <td>
                      {d.include_general_staff ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'rgba(168, 85, 247, 0.12)',
                          color: '#c084fc',
                        }}>
                          <Users size={12} /> Included
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'rgba(100, 116, 139, 0.12)',
                          color: '#64748b',
                        }}>
                          Excluded
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={d.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button className="btn-secondary btn-sm" onClick={() => openEdit(d)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(d.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingId ? 'Edit Department' : 'Add Department'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. OT, OPD, Lab..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <div
                className={`toggle-switch ${form.is_active ? 'active' : 'inactive'}`}
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
              >
                <div className="toggle-knob" />
              </div>
            </div>

            <div className="form-group pb-2">
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label className="form-label mb-0" style={{ marginBottom: 0 }}>Is Global Sub-Department?</label>
                  <p className="text-xs text-slate-400 mt-1">If enabled, this department receives shares cross-departmentally via manual entries.</p>
                </div>
                <div
                  className={`toggle-switch ${form.is_sub_department ? 'active' : 'inactive'}`}
                  onClick={() => setForm({ ...form, is_sub_department: !form.is_sub_department })}
                >
                  <div className="toggle-knob" />
                </div>
              </div>
            </div>

            {/* Include General Staff Toggle */}
            <div className="form-group pb-2">
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                background: form.include_general_staff
                  ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(168, 85, 247, 0.03))'
                  : 'rgba(30, 41, 59, 0.4)',
                border: form.include_general_staff
                  ? '1px solid rgba(168, 85, 247, 0.25)'
                  : '1px solid rgba(71, 85, 105, 0.2)',
                transition: 'all 0.3s ease',
              }}>
                <div>
                  <label className="form-label mb-0" style={{ marginBottom: 0, color: form.include_general_staff ? '#c084fc' : '#94a3b8' }}>
                    Include General Staff
                  </label>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                    Security, Helpers, Sweepers, etc. will receive share from this department
                  </p>
                </div>
                <div
                  className={`toggle-switch ${form.include_general_staff ? 'active' : 'inactive'}`}
                  onClick={() => setForm({ ...form, include_general_staff: !form.include_general_staff })}
                  style={form.include_general_staff ? { background: 'linear-gradient(135deg, #a855f7, #7c3aed)' } : {}}
                >
                  <div className="toggle-knob" />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
