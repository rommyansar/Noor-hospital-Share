'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarPlus, Save, Users, X, CheckSquare, Square } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import type { Department, DailyIncome, StaffLeave, Staff } from '@/lib/types';
import { MONTHS } from '@/lib/types';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface IncomeState {
  amount: number;
  present_staff_ids: string[] | null;
}

export default function MonthlyEntryPage() {
  const { addToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [incomes, setIncomes] = useState<Record<string, IncomeState>>({});
  const [leavesByDate, setLeavesByDate] = useState<Record<string, Set<string>>>({});
  const [staffList, setStaffList] = useState<Staff[]>([]);

  const [subDepartments, setSubDepartments] = useState<Department[]>([]);
  const [subDeptStaff, setSubDeptStaff] = useState<Staff[]>([]);
  const [workEntries, setWorkEntries] = useState<Record<string, Record<string, number>>>({});

  // Modal State
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [tempSelection, setTempSelection] = useState<Set<string>>(new Set());
  const [tempWorkEntries, setTempWorkEntries] = useState<Record<string, string>>({});
  const [modalSaving, setModalSaving] = useState(false);

  const totalDays = getDaysInMonth(year, month);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchDepartments = async () => {
    const res = await fetch('/api/departments');
    const data = await res.json();
    setDepartments(data.filter((d: Department) => d.is_active && !d.is_sub_department));
  };

  const loadData = useCallback(async () => {
    if (!selectedDept) {
      setIncomes({});
      setLeavesByDate({});
      setStaffList([]);
      setWorkEntries({});
      return;
    }
    setLoading(true);
    
    try {
      // 1. Load Primary Staff
      const staffRes = await fetch(`/api/staff?department_id=${selectedDept}`);
      const staffData = await staffRes.json();
      const activeStaff = Array.isArray(staffData) ? staffData.filter(s => s.is_active) : [];
      setStaffList(activeStaff);

      // 1a. Load Sub-Departments and their Staff
      const allDeptsRes = await fetch(`/api/departments`);
      const allDepts = await allDeptsRes.json();
      const subDepts = allDepts.filter((d: Department) => d.is_sub_department && d.is_active);
      setSubDepartments(subDepts);
      
      const allStaffRes = await fetch(`/api/staff`);
      const allStaffData = await allStaffRes.json();
      const crossStaff = allStaffData.filter((s: Staff) => 
        s.is_active && subDepts.some((sd: Department) => sd.id === s.department_id)
      );
      setSubDeptStaff(crossStaff);

      // 1b. Load Work Entries (Manual Entries) for this department and month
      const weRes = await fetch(`/api/work-entries?department_id=${selectedDept}&month=${monthStr}`);
      const weData = await weRes.json();
      const loadedEntries: Record<string, Record<string, number>> = {};
      
      if (Array.isArray(weData)) {
        weData.forEach((w: any) => {
          if (!loadedEntries[w.date]) loadedEntries[w.date] = {};
          loadedEntries[w.date][w.staff_id] = w.amount;
        });
      }
      setWorkEntries(loadedEntries);

      // 2. Load Incomes config for the month
      const inRes = await fetch(`/api/daily-income?department_id=${selectedDept}&month=${monthStr}`);
      const inData = await inRes.json();
      
      const newIncomes: Record<string, IncomeState> = {};
      if (Array.isArray(inData)) {
        inData.forEach((d: DailyIncome) => {
          if (d.amount > 0 || d.present_staff_ids !== null) {
            newIncomes[d.date] = {
              amount: d.amount,
              present_staff_ids: d.present_staff_ids ?? null
            };
          }
        });
      }
      setIncomes(newIncomes);

      // 3. Load Leaves
      const lvRes = await fetch(`/api/leaves?department_id=${selectedDept}&month=${monthStr}`);
      const lvData = await lvRes.json();
      
      const newLeaves: Record<string, Set<string>> = {};
      if (Array.isArray(lvData)) {
        lvData.forEach((lv: StaffLeave) => {
          if (!newLeaves[lv.date]) newLeaves[lv.date] = new Set();
          newLeaves[lv.date].add(lv.staff_id);
        });
      }
      setLeavesByDate(newLeaves);
    } catch (err) {
      addToast('error', 'Failed to load data');
    }
    
    setLoading(false);
  }, [selectedDept, monthStr, addToast]);

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const handleIncomeChange = (day: number, val: string) => {
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const amount = val === '' ? 0 : parseFloat(val);
    setIncomes(prev => ({
      ...prev,
      [dateStr]: {
        amount: isNaN(amount) ? 0 : amount,
        present_staff_ids: prev[dateStr]?.present_staff_ids || null
      }
    }));
  };

  const handleSaveAll = async () => {
    if (!selectedDept) return;
    setSaving(true);
    
    try {
      const recordsToSave = [];
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const state = incomes[dateStr] || { amount: 0, present_staff_ids: null };
        recordsToSave.push({
          department_id: selectedDept,
          date: dateStr,
          amount: state.amount,
          present_staff_ids: state.present_staff_ids
        });
      }

      const res = await fetch('/api/monthly-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordsToSave),
      });

      if (res.ok) {
        addToast('success', 'Monthly entry saved successfully');
        loadData();
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      addToast('error', 'An error occurred while saving.');
    }
    
    setSaving(false);
  };

  const deptName = departments.find(d => d.id === selectedDept)?.name || '';
  const totalIncome = Object.values(incomes).reduce((sum, val) => sum + (val?.amount || 0), 0);

  // Modal Handlers
  const openModal = (dateStr: string) => {
    const existingExplicit = incomes[dateStr]?.present_staff_ids;
    if (existingExplicit) {
      setTempSelection(new Set(existingExplicit));
    } else {
      // Default: All staff minus those on leave
      const leaves = leavesByDate[dateStr] || new Set();
      const defaultPresent = staffList.filter(s => !leaves.has(s.id)).map(s => s.id);
      setTempSelection(new Set(defaultPresent));
    }

    // Populate existing manual entries for sub-dept staff on this date
    const dayEntries = workEntries[dateStr] || {};
    const tempWe: Record<string, string> = {};
    Object.keys(dayEntries).forEach(staffId => {
      tempWe[staffId] = dayEntries[staffId].toString();
    });
    setTempWorkEntries(tempWe);

    setEditingDate(dateStr);
  };

  const handleWorkEntryChange = (staffId: string, val: string) => {
    setTempWorkEntries(prev => ({ ...prev, [staffId]: val }));
  };

  const toggleStaff = (id: string) => {
    const next = new Set(tempSelection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTempSelection(next);
  };

  const toggleAll = (select: boolean) => {
    if (!editingDate) return;
    if (select) {
      setTempSelection(new Set(staffList.map(s => s.id)));
    } else {
      setTempSelection(new Set());
    }
  };

  const toggleRole = (role: string, select: boolean) => {
    if (!editingDate) return;
    const next = new Set(tempSelection);
    staffList.filter(s => s.role === role).forEach(s => {
      if (select) next.add(s.id);
      else next.delete(s.id);
    });
    setTempSelection(next);
  };

  const saveModalSelection = async () => {
    if (!editingDate) return;
    setModalSaving(true);
    
    // 1. Save presence locally (no network call yet — will save with "Save Month")
    setIncomes(prev => ({
      ...prev,
      [editingDate]: {
        amount: prev[editingDate]?.amount || 0,
        present_staff_ids: Array.from(tempSelection)
      }
    }));

    // 2. Save work entries (cross-department) — these are separate and must persist immediately
    const entriesToSave = [];
    for (const staffId of Object.keys(tempWorkEntries)) {
      const val = parseFloat(tempWorkEntries[staffId]);
      if (!isNaN(val) && val > 0) {
        entriesToSave.push({
          staff_id: staffId,
          department_id: selectedDept,
          date: editingDate,
          description: 'Cross-Department Share',
          amount: val,
          percentage: '0'
        });
      }
    }

    if (entriesToSave.length > 0) {
      try {
        const res = await fetch('/api/work-entries/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: selectedDept,
            date: editingDate,
            entries: entriesToSave
          }),
        });

        if (res.ok) {
          const newDayRecord: Record<string, number> = {};
          entriesToSave.forEach(e => { newDayRecord[e.staff_id] = e.amount; });
          setWorkEntries(prev => ({ ...prev, [editingDate]: newDayRecord }));
        } else {
          addToast('error', 'Failed to save manual work entries.');
        }
      } catch (e) {
        addToast('error', 'Failed to save manual work entries.');
      }
    }

    // 3. Sync Attendance (Leave) based on selection
    const leavesPayload = staffList.map(staff => ({
      staff_id: staff.id,
      department_id: selectedDept,
      date: editingDate,
      leave_type: tempSelection.has(staff.id) ? null : 'OFF'
    }));

    try {
      const leaveRes = await fetch('/api/leaves/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leavesPayload)
      });
      if (leaveRes.ok) {
        const updatedLeaves = new Set<string>();
        leavesPayload.forEach(p => {
          if (p.leave_type === 'OFF') updatedLeaves.add(p.staff_id);
        });
        setLeavesByDate(prev => ({ ...prev, [editingDate!]: updatedLeaves }));
      } else {
        addToast('error', 'Failed to sync attendance.');
      }
    } catch (e) {
      addToast('error', 'Failed to sync attendance.');
    }

    setModalSaving(false);
    setEditingDate(null);
    addToast('success', 'Staff selection saved for ' + editingDate.split('-')[2]);
  };

  // Group staff by role for the modal
  const staffByRole = staffList.reduce((acc, staff) => {
    if (!acc[staff.role]) acc[staff.role] = [];
    acc[staff.role].push(staff);
    return acc;
  }, {} as Record<string, Staff[]>);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Entry</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            Quickly enter daily income and explicit present staff
          </p>
        </div>
        {selectedDept && (
          <button 
            className="btn btn-primary" 
            onClick={handleSaveAll}
            disabled={saving || loading}
          >
            {saving ? <div className="spinner" style={{width: 16, height: 16, borderWidth: 2, marginRight: 8}} /> : <Save size={18} style={{ marginRight: 8 }} />}
            Save Month
          </button>
        )}
      </div>

      <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label className="form-label">Department</label>
            <select className="select-field" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              <option value="">Select Department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Year</label>
            <select className="select-field" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <select className="select-field" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!selectedDept ? (
        <div className="glass-card empty-state">
          <CalendarPlus size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '16px', fontWeight: 500 }}>Select a department to begin entry</p>
        </div>
      ) : loading ? (
        <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ 
            padding: '16px 20px', 
            borderBottom: '1px solid rgba(71, 85, 105, 0.2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                {deptName} Data
              </h3>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                {MONTHS[month - 1]} {year}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>
                {totalIncome.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                  <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '80px' }}>Date</th>
                  <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px' }}>Dept Income</th>
                  <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Present Staff Selector</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
                  const state = incomes[dateStr];
                  const amount = state?.amount || '';
                  const explicitPresent = state?.present_staff_ids;
                  
                  const leavesCount = leavesByDate[dateStr]?.size || 0;
                  
                  let presentText = '';
                  if (explicitPresent) {
                    presentText = `${explicitPresent.length}/${staffList.length} Selected (Manual)`;
                  } else {
                    presentText = `${staffList.length - leavesCount}/${staffList.length} Expected (Auto)`;
                  }

                  return (
                    <tr key={day} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                      <td style={{ padding: '10px 20px', fontWeight: 600, color: '#cbd5e1', fontSize: '14px' }}>
                        {day}
                      </td>
                      <td style={{ padding: '10px 20px' }}>
                        <div style={{ position: 'relative', maxWidth: '200px' }}>
                          <span style={{ 
                            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', 
                            color: '#64748b', fontSize: '13px', fontWeight: 600 
                          }}>₹</span>
                          <input
                            type="number"
                            className="text-input"
                            style={{ paddingLeft: '24px', height: '36px', fontSize: '14px' }}
                            value={amount}
                            onChange={(e) => handleIncomeChange(day, e.target.value)}
                            placeholder="0"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </td>
                      <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                        <button 
                          className={`btn ${explicitPresent ? 'btn-primary' : 'btn-secondary'}`} 
                          onClick={() => openModal(dateStr)}
                          style={{ padding: '6px 12px', fontSize: '13px' }}
                        >
                          <Users size={14} style={{ marginRight: '6px' }} />
                          {presentText}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Present Staff Modal */}
      {editingDate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Present Staff for {editingDate.split('-').reverse().join('-')}</h2>
              <button className="icon-btn" onClick={() => setEditingDate(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button className="btn btn-secondary" onClick={() => toggleAll(true)} style={{ flex: 1 }}>
                  <CheckSquare size={16} style={{ marginRight: 6 }} /> Select All
                </button>
                <button className="btn btn-secondary" onClick={() => toggleAll(false)} style={{ flex: 1 }}>
                  <Square size={16} style={{ marginRight: 6 }} /> Clear All
                </button>
              </div>

              {Object.entries(staffByRole).map(([role, list]) => {
                const availableStaff = list;
                const allSelected = availableStaff.length > 0 && availableStaff.every(s => tempSelection.has(s.id));
                return (
                  <div key={role} style={{ marginBottom: '20px' }}>
                    <div style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      background: 'rgba(30, 41, 59, 0.5)', padding: '8px 12px', borderRadius: '6px', marginBottom: '10px' 
                    }}>
                      <span className="badge badge-info">{role}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={allSelected} 
                          onChange={(e) => toggleRole(role, e.target.checked)} 
                        /> Select All {role}
                      </label>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {list.map(staff => {
                        const isLeave = leavesByDate[editingDate]?.has(staff.id);
                        const isChecked = tempSelection.has(staff.id);
                        return (
                          <label key={staff.id} style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', 
                            padding: '8px 12px', borderRadius: '6px',
                            cursor: 'pointer', 
                            border: `1px solid ${isChecked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(51, 65, 85, 0.5)'}`,
                            background: isChecked ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                            transition: 'all 0.15s ease'
                          }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => toggleStaff(staff.id)} 
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.name}</span>
                              <span style={{ fontSize: '11px', color: isLeave ? '#fbbf24' : '#64748b' }}>
                                {staff.staff_code || 'No Code'} {isLeave ? '(On Leave Today)' : ''}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Cross Department Entries */}
              {subDepartments.length > 0 && (
                <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '2px dashed rgba(51, 65, 85, 0.5)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '16px' }}>
                    Cross-Department Entries (Manual Amount)
                  </h3>
                  
                  {subDepartments.map(sd => {
                    const sdStaff = subDeptStaff.filter(s => s.department_id === sd.id);
                    if (sdStaff.length === 0) return null;

                    return (
                      <div key={sd.id} style={{ marginBottom: '20px' }}>
                        <div style={{ 
                          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)',
                          padding: '8px 12px', borderRadius: '6px', marginBottom: '10px' 
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24' }}>
                            {sd.name}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          {sdStaff.map(staff => (
                            <div key={staff.id} style={{ 
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px',
                              border: '1px solid rgba(51, 65, 85, 0.8)'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.name}</span>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{staff.role}</span>
                              </div>
                              <div style={{ position: 'relative', width: '120px' }}>
                                <span style={{ 
                                  position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', 
                                  color: '#64748b', fontSize: '13px', fontWeight: 600 
                                }}>₹</span>
                                <input
                                  type="number"
                                  className="text-input"
                                  style={{ paddingLeft: '22px', height: '34px', fontSize: '13px' }}
                                  value={tempWorkEntries[staff.id] || ''}
                                  onChange={(e) => handleWorkEntryChange(staff.id, e.target.value)}
                                  placeholder="0.00"
                                  min="0"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="modal-footer" style={{ borderTop: '1px solid rgba(71, 85, 105, 0.2)', padding: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setEditingDate(null)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={saveModalSelection}
                disabled={modalSaving}
              >
                {modalSaving ? (
                  <><div className="spinner" style={{width: 14, height: 14, borderWidth: 2, marginRight: 6}} /> Saving...</>
                ) : (
                  <>Save Details for {editingDate.split('-')[2]}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
