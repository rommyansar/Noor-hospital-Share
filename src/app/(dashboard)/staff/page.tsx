'use client';

import { useState, useEffect } from 'react';
import { Plus, Users, Pencil, Trash2, X, Building2, Search } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, Staff, StaffForm } from '@/lib/types';

export default function StaffPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>({ name: '', department_id: '', department_ids: [], department_percentages: {}, role: '', is_active: true, staff_code: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data);
  };

  const fetchStaff = async () => {
    setLoading(true);
    const res = await fetch('/api/staff?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    setStaff(data);
    setLoading(false);
  };

  useEffect(() => { 
    fetchDepartments(); 
    fetchStaff(); 
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', staff_code: '', department_id: '', department_ids: [], department_percentages: {}, role: '', is_active: true });
    setShowModal(true);
  };

  const openEdit = (s: Staff) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      staff_code: s.staff_code || '',
      department_id: s.department_id,
      department_ids: s.department_ids || [s.department_id], // migrate legacy to array
      department_percentages: s.department_percentages || {},
      role: s.role,
      is_active: s.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('error', 'Name required'); return; }
    if (!form.department_ids || form.department_ids.length === 0) { addToast('error', 'Select at least one department'); return; }
    if (!form.role.trim()) { addToast('error', 'Role required'); return; }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/staff/${editingId}` : '/api/staff';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, department_id: form.department_ids[0] }), // keep first as primary
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

  const toggleDeptId = (id: string) => {
    setForm(prev => {
      const current = prev.department_ids || [];
      if (current.includes(id)) {
        return { ...prev, department_ids: current.filter(x => x !== id) };
      }
      return { ...prev, department_ids: [...current, id] };
    });
  };

  // Get unique roles for quick-add suggestions
  const existingRoles = [...new Set(staff.map((s) => s.role))];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Directory</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            All Active & Inactive Members — {staff.length} member{staff.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Staff
        </button>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search by name, code, role, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : staff.length === 0 ? (
        <div className="glass-card empty-state">
          <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No staff found in the system</p>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name & IND</th>
                  <th>Role</th>
                  <th>Departments</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.filter(s => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  const deptNames = (s.department_ids && s.department_ids.length > 0 ? s.department_ids : [s.department_id])
                    .map(id => departments.find(d => d.id === id)?.name || '').join(' ').toLowerCase();
                  return s.name.toLowerCase().includes(q) || 
                    (s.staff_code || '').toLowerCase().includes(q) || 
                    s.role.toLowerCase().includes(q) ||
                    deptNames.includes(q);
                }).map((s) => {
                  const sDeptIds = s.department_ids && s.department_ids.length > 0 ? s.department_ids : [s.department_id];
                  
                  return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        {s.staff_code && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#334155',
                            color: '#94a3b8',
                            fontFamily: 'monospace',
                            letterSpacing: '0.5px'
                          }}>
                            IND {s.staff_code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">{s.role}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                         {sDeptIds.map(dId => {
                           const dInfo = departments.find(d => d.id === dId);
                           if (!dInfo) return null;
                           return (
                             <span key={dId} style={{
                               display: 'inline-flex',
                               alignItems: 'center',
                               gap: '4px',
                               padding: '3px 8px',
                               borderRadius: '6px',
                               fontSize: '12px',
                               fontWeight: 500,
                               background: 'rgba(59, 130, 246, 0.1)',
                               color: '#60a5fa',
                               border: '1px solid rgba(59, 130, 246, 0.2)'
                             }}>
                               <Building2 size={12} />
                               {dInfo.name}
                             </span>
                           );
                         })}
                      </div>
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
                )})}
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
              <label className="form-label">IND Number (Optional)</label>
              <input
                className="input-field"
                value={form.staff_code || ''}
                onChange={(e) => setForm({ ...form, staff_code: e.target.value })}
                placeholder="e.g. 2481 or T-102"
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ marginBottom: '8px' }}>Departments Assigned</label>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px', 
                maxHeight: '260px', 
                overflowY: 'auto',
                background: 'rgba(15, 23, 42, 0.4)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(51, 65, 85, 0.5)'
              }}>
                {departments.map((d) => {
                  const isSelected = (form.department_ids || []).includes(d.id);
                  return (
                  <div key={d.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '10px', 
                    padding: '6px',
                    borderRadius: '6px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                    transition: 'background 0.2s'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleDeptId(d.id)}
                        style={{ width: '16px', height: '16px', accentColor: '#38bdf8', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px', color: isSelected ? '#e2e8f0' : '#94a3b8', fontWeight: isSelected ? 600 : 400 }}>
                        {d.name}
                      </span>
                    </label>
                    {isSelected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                        <input
                          type="number"
                          placeholder="Rule %"
                          title="Override department rule % for this staff"
                          className="input-field"
                          style={{ width: '80px', padding: '4px 8px', fontSize: '13px' }}
                          value={form.department_percentages?.[d.id] || ''}
                          onChange={(e) => setForm({
                            ...form,
                            department_percentages: {
                              ...(form.department_percentages || {}),
                              [d.id]: e.target.value
                            }
                          })}
                        />
                      </div>
                    )}
                  </div>
                )})}
              </div>
            </div>

            <div className="form-group mt-4">
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
