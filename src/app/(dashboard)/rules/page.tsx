'use client';

import { useState, useEffect } from 'react';
import { Plus, Settings2, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import { formatPercentage } from '@/lib/calculate';
import type { Department, DepartmentRule, DepartmentRuleForm } from '@/lib/types';

export default function RulesPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rules, setRules] = useState<DepartmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DepartmentRuleForm>({
    department_id: '', role: '', percentage: '', distribution_type: 'individual', is_active: true,
  });

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data);
    if (data.length > 0 && !filterDept) setFilterDept(data[0].id);
  };

  const fetchRules = async () => {
    setLoading(true);
    const url = filterDept ? `/api/rules?department_id=${filterDept}` : '/api/rules';
    const res = await fetch(url);
    const data = await res.json();
    setRules(data);
    setLoading(false);
  };

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { if (filterDept) fetchRules(); }, [filterDept]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ department_id: filterDept, role: '', percentage: '', distribution_type: 'individual', is_active: true });
    setShowModal(true);
  };

  const openEdit = (r: DepartmentRule) => {
    setEditingId(r.id);
    setForm({
      department_id: r.department_id, role: r.role, percentage: r.percentage,
      distribution_type: r.distribution_type, is_active: r.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.role.trim()) { addToast('error', 'Role required'); return; }
    if (!form.percentage.trim()) { addToast('error', 'Percentage required'); return; }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/rules/${editingId}` : '/api/rules';

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

    addToast('success', editingId ? 'Rule updated' : 'Rule created');
    setShowModal(false);
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;
    const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
    if (!res.ok) { addToast('error', 'Failed to delete'); return; }
    addToast('success', 'Rule deleted');
    fetchRules();
  };

  const deptName = departments.find((d) => d.id === filterDept)?.name || '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Department Rules</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            {deptName ? `Configure share rules for ${deptName}` : 'Select a department'}
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Rule
        </button>
      </div>

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
      ) : rules.length === 0 ? (
        <div className="glass-card empty-state">
          <Settings2 size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>No rules configured</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>Add rules to define how shares are calculated</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {rules.map((r) => (
            <div key={r.id} className="glass-card glass-card-hover" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span className="badge badge-info" style={{ fontSize: '13px', padding: '4px 14px' }}>{r.role}</span>
                    <span className={`badge ${r.distribution_type === 'group' ? 'badge-warning' : 'badge-success'}`}>
                      {r.distribution_type === 'group' ? '👥 Group' : '👤 Individual'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                      {formatPercentage(r.percentage)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>
                      of daily income
                    </span>
                  </div>
                  {r.distribution_type === 'group' && (
                    <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                      Pool divided equally among present staff with this role
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-secondary btn-sm" onClick={() => openEdit(r)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(r.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingId ? 'Edit Rule' : 'Add Rule'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <input
                className="input-field"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Doctor, Nurse, Technician..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Percentage</label>
              <input
                className="input-field"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                placeholder="10, 5, 2.5..."
              />
              {form.percentage && (
                <p style={{ fontSize: '12px', color: '#34d399', marginTop: '6px' }}>
                  Preview: {formatPercentage(form.percentage)}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Distribution Type</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['individual', 'group'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setForm({ ...form, distribution_type: type })}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '12px',
                      cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                      transition: 'all 0.2s',
                      background: form.distribution_type === type
                        ? type === 'individual' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))'
                          : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15))'
                        : 'rgba(51, 65, 85, 0.4)',
                      color: form.distribution_type === type
                        ? type === 'individual' ? '#34d399' : '#fbbf24'
                        : '#94a3b8',
                      border: form.distribution_type === type
                        ? `2px solid ${type === 'individual' ? '#10b981' : '#f59e0b'}`
                        : '2px solid transparent',
                    }}
                  >
                    {type === 'individual' ? '👤 Individual' : '👥 Group'}
                    <br />
                    <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8 }}>
                      {type === 'individual' ? 'Each gets their share' : 'Pool ÷ present staff'}
                    </span>
                  </button>
                ))}
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
