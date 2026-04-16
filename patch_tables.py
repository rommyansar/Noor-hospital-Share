import re

file_path = "src/app/(dashboard)/monthly-entry/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# I need to insert the `isAutoManual` structure.
# Instead of a regex, I will find `          <div style={{ overflowX: 'auto' }}>
#             {isStaffBased ? (`

split_idx = content.find("          <div style={{ overflowX: 'auto' }}>\n            {isStaffBased ? (")

if split_idx == -1:
    print("Could not find anchor!")
    exit(1)

pre_table = content[:split_idx]
post_table = content[split_idx:]

# The start of the table rendering block:
#           <div style={{ overflowX: 'auto' }}>
#             {isAutoManual ? ( .... ) : isStaffBased ? (

replacement_start = """          <div style={{ overflowX: 'auto' }}>
            {isAutoManual ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <div style={{ padding: '12px 20px', background: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#60a5fa' }}>Auto-Distributed Staff</h4>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Calculated via TDA & Attendance</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Staff Member</th>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px' }}>Applicable Rule</th>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '60px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoStaffList.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No auto staff found.</td></tr>
                      ) : autoStaffList.map(staff => {
                        const rule = deptRules.find(r => r.role.toUpperCase().trim() === staff.role.toUpperCase().trim());
                        return (
                          <tr key={staff.id} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                            <td style={{ padding: '10px 20px', fontWeight: 500, color: '#f8fafc', fontSize: '14px' }}>
                              <div style={{ fontWeight: 600 }}>{staff.name}</div>
                              <div style={{ color: '#64748b', fontSize: '11px' }}>{staff.staff_code || 'No Code'} • {staff.role}</div>
                            </td>
                            <td style={{ padding: '10px 20px' }}>
                              {rule ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{rule.role}</span>
                                  <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                    {rule.percentage}% • {rule.distribution_type === 'group' ? 'Group' : 'Individual'}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>⚠ No Matching Rule</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                              <button
                                onClick={() => setAutoStaffList(prev => prev.filter(s => s.id !== staff.id))}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px' }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan={3} style={{ padding: '12px 20px', borderTop: '1px solid rgba(71, 85, 105, 0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Add Auto Staff:</span>
                            <select
                              className="select-field"
                              style={{ maxWidth: '300px', height: '36px', fontSize: '13px' }}
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const id = e.target.value;
                                if (manualStaffList.find(s => s.id === id)) {
                                  addToast('error', 'Staff is already in Manual pool.');
                                  return;
                                }
                                const staffObj = globalStaffList.find(s => s.id === id);
                                if (staffObj && !autoStaffList.find(s => s.id === id)) setAutoStaffList(prev => [...prev, staffObj]);
                              }}
                            >
                              <option value="">-- Select Staff to Add --</option>
                              {globalStaffList.filter(s => !autoStaffList.find(x => x.id === s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ padding: '12px 20px', background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>Manual-Distributed Staff</h4>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Fixed Working Amounts</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Staff Member</th>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '200px' }}>Applicable Rule</th>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px', textAlign: 'right' }}>Working Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualStaffList.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No manual staff found.</td></tr>
                      ) : manualStaffList.map(staff => {
                        const rule = deptRules.find(r => r.role.toUpperCase().trim() === staff.role.toUpperCase().trim());
                        return (
                          <tr key={staff.id} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                            <td style={{ padding: '10px 20px', fontWeight: 500, color: '#f8fafc', fontSize: '14px' }}>
                              <div style={{ fontWeight: 600 }}>{staff.name}</div>
                              <div style={{ color: '#64748b', fontSize: '11px' }}>{staff.staff_code || 'No Code'} • {staff.role}</div>
                            </td>
                            <td style={{ padding: '10px 20px' }}>
                              {rule ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{rule.role}</span>
                                  <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                    {rule.percentage}% • {rule.distribution_type === 'group' ? 'Group' : 'Individual'}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>⚠ No Matching Rule</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                <div style={{ position: 'relative', width: '160px' }}>
                                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>₹</span>
                                  <input
                                    type="number"
                                    className="text-input"
                                    style={{ paddingLeft: '24px', height: '36px', fontSize: '14px', width: '100%' }}
                                    value={staffAmounts[staff.id] || ''}
                                    onChange={(e) => setStaffAmounts(prev => ({ ...prev, [staff.id]: e.target.value }))}
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                  />
                                </div>
                                <button
                                  onClick={() => setManualStaffList(prev => prev.filter(s => s.id !== staff.id))}
                                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px' }}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan={3} style={{ padding: '12px 20px', borderTop: '1px solid rgba(71, 85, 105, 0.2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Add Manual Staff:</span>
                            <select
                              className="select-field"
                              style={{ maxWidth: '300px', height: '36px', fontSize: '13px' }}
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const id = e.target.value;
                                if (autoStaffList.find(s => s.id === id)) {
                                  addToast('error', 'Staff is already in Auto pool.');
                                  return;
                                }
                                const staffObj = globalStaffList.find(s => s.id === id);
                                if (staffObj && !manualStaffList.find(s => s.id === id)) setManualStaffList(prev => [...prev, staffObj]);
                              }}
                            >
                              <option value="">-- Select Staff to Add --</option>
                              {globalStaffList.filter(s => !manualStaffList.find(x => x.id === s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ padding: '12px 20px', background: 'rgba(16, 185, 129, 0.1)', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#10b981' }}>Daily Income & Attendance Overrides</h4>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>For Auto Staff Pool</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.2)', background: 'rgba(15, 23, 42, 0.3)' }}>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '80px' }}>Date</th>
                        <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', width: '250px' }}>Dept Income</th>
                        {attendanceRule !== 'none' && (
                          <th style={{ padding: '12px 20px', color: '#94a3b8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Present Staff (Auto)</th>
                        )}
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
                          presentText = `${explicitPresent.length}/${autoStaffList.length} Selected (Manual)`;
                        } else {
                          presentText = `${autoStaffList.length - leavesCount}/${autoStaffList.length} Expected (Auto)`;
                        }
                        return (
                          <tr key={day} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                            <td style={{ padding: '10px 20px', fontWeight: 600, color: '#cbd5e1', fontSize: '14px' }}>{day}</td>
                            <td style={{ padding: '10px 20px' }}>
                              <div style={{ position: 'relative', maxWidth: '200px' }}>
                                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>₹</span>
                                <input type="number" className="text-input" style={{ paddingLeft: '24px', height: '36px', fontSize: '14px' }} value={amount} onChange={(e) => handleIncomeChange(day, e.target.value)} placeholder="0" min="0" step="0.01" />
                              </div>
                            </td>
                            {attendanceRule !== 'none' && (
                              <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                                <button className={`btn ${explicitPresent ? 'btn-primary' : 'btn-secondary'}`} onClick={() => openModal(dateStr)} style={{ padding: '6px 12px', fontSize: '13px' }}>
                                  <Users size={14} style={{ marginRight: '6px' }} />
                                  {presentText}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            ) : isStaffBased ? (
"""

post_table_fixed = post_table.replace("          <div style={{ overflowX: 'auto' }}>\n            {isStaffBased ? (", replacement_start)

# Write out the file
with open(file_path, "w") as f:
    f.write(pre_table + post_table_fixed)
print("Applied successfully.")
