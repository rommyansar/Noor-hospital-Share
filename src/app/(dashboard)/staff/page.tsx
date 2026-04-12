'use client';

import { useState, useEffect } from 'react';
import { Plus, Users, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, Staff, StaffForm } from '@/lib/types';

export default function StaffPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>({ name: '', department_id: '', role: '', is_active: true });

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data);
    if (data.length > 0 && !filterDept) setFilterDept(data[0].id);
  };

  const fetchStaff = async () => {
    setLoading(true);
    const url = filterDept ? `/api/staff?department_id=${filterDept}` : '/api/staff';
    const res = await fetch(url);
    const data = await res.json();
    setStaff(data);
    setLoading(false);
  };

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { if (filterDept) fetchStaff(); }, [filterDept]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', department_id: filterDept, role: '', is_active: true });
    setShowModal(true);
  };

  const openEdit = (s: Staff) => {
    setEditingId(s.id);
    setForm({ name: s.name, department_id: s.department_id, role: s.role, is_active: s.is_active });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('error', 'Name required'); return; }
    if (!form.department_id) { addToast('error', 'Department required'); return; }
    if (!form.role.trim()) { addToast('error', 'Role required'); return; }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/staff/${editingId}` : '/api/staff';

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

    addToast('success', editingId ? 'Staff updated' : 'Staff added');
    setShowModal(false);
    fetchStaff();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this staff member?')) return;
    const res = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    if (!res.ok) { addToast('error', 'Failed to delete'); return; }
    addToast('success', 'Staff deleted');
    fetchStaff();
  };

  const deptName = departments.find((d) => d.id === filterDept)?.name || '';

  // Get unique roles for quick-add suggestions
  const existingRoles = [...new Set(staff.map((s) => s.role))];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            {deptName ? `${deptName} — ` : ''}
            {staff.length} member{staff.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Staff
        </button>
      </div>

      {/* Department Filter */}
      <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <label className="form-label">Department</label>
        <select
          className="select-field"
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : staff.length === 0 ? (
        <div className="glass-card empty-state">
          <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No staff in this department</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <span className="badge badge-info">{s.role}</span>
                    </td>
                    <td>
                      <span className={s.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button className="btn-secondary btn-sm" onClick={() => openEdit(s)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(s.id)}>
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
                {editingId ? 'Edit Staff' : 'Add Staff'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Ahmed, Nurse Fatima..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Department</label>
              <select
                className="select-field"
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
              >
                <option value="">Select...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <input
                className="input-field"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Doctor, Nurse, Technician..."
                list="role-suggestions"
              />
              <datalist id="role-suggestions">
                {existingRoles.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label className="form-label">Active</label>
              <div
                className={`toggle-switch ${form.is_active ? 'active' : 'inactive'}`}
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
              >
                <div className="toggle-knob" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>
                {editingId ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
