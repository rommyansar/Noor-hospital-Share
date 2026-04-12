const fs = require('fs');
let content = fs.readFileSync('/Users/ashrarehmat/hospital share/hospital-share/src/app/(dashboard)/attendance/page.tsx', 'utf8');

// Replace standard imports
content = content.replace(
  "import { CalendarOff, Check, X } from 'lucide-react';",
  "import { CalendarOff, Check, X, ShieldCheck, ShieldAlert, Users as UsersIcon } from 'lucide-react';"
);

// Add state variables
content = content.replace(
  "const [saving, setSaving] = useState<string | null>(null); // tracks which cell is saving",
  "const [saving, setSaving] = useState<string | null>(null);\n  const [isReviewed, setIsReviewed] = useState(false);\n  const [bulkRole, setBulkRole] = useState('');\n  const [bulkDay, setBulkDay] = useState('');\n  const [bulkType, setBulkType] = useState<LeaveType>('OFF');\n  const [bulkSaving, setBulkSaving] = useState(false);"
);

// Add to loadData
content = content.replace(
  "    const lvData = await lvRes.json();\n    setLeaves(lvData);",
  "    const lvData = await lvRes.json();\n    setLeaves(lvData);\n\n    const statusRes = await fetch(`/api/monthly-status?department_id=${selectedDept}&month=${monthStr}`);\n    const statusData = await statusRes.json();\n    setIsReviewed(statusData.is_reviewed || false);"
);

// Insert bulk & reviewed functions before getStaffLeaveCount
content = content.replace(
  "  // Count leaves for a staff member",
  `
  const toggleReviewed = async () => {
    const nextVal = !isReviewed;
    const res = await fetch('/api/monthly-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: selectedDept,
        month: monthStr,
        is_reviewed: nextVal
      }),
    });
    if (res.ok) {
      setIsReviewed(nextVal);
      addToast('success', \`Attendance marked as \${nextVal ? 'Reviewed' : 'Unreviewed'}\`);
    } else {
      addToast('error', 'Failed to update review status');
    }
  };

  const handleBulkAction = async () => {
    if (!bulkRole || !bulkDay || !bulkType) return;
    setBulkSaving(true);

    const day = parseInt(bulkDay);
    const dateStr = \`\${year}-\${String(month).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
    
    // Find all staff matching role
    const matchingStaff = staffList.filter(s => s.role === bulkRole);
    
    const records = matchingStaff.map(s => ({
      staff_id: s.id,
      department_id: selectedDept,
      date: dateStr,
      leave_type: bulkType === 'PRESENT' ? null : bulkType
    }));

    const res = await fetch('/api/leaves/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records)
    });

    if (res.ok) {
      addToast('success', 'Bulk action applied');
      loadData();
    } else {
      addToast('error', 'Failed to apply bulk action');
    }
    setBulkSaving(false);
  };

  // Count leaves for a staff member`
);

// Add Bulk UI before loading check
content = content.replace(
  "      {loading ? (",
  `      {selectedDept && (
        <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
            
            {/* Bulk Action Panel */}
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UsersIcon size={16} /> Bulk Action
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Role</label>
                  <select className="select-field" style={{ padding: '8px', height: 'auto', minWidth: '120px' }} value={bulkRole} onChange={e => setBulkRole(e.target.value)}>
                    <option value="">Select Role...</option>
                    {Array.from(new Set(staffList.map(s => s.role))).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Day</label>
                  <select className="select-field" style={{ padding: '8px', height: 'auto', minWidth: '80px' }} value={bulkDay} onChange={e => setBulkDay(e.target.value)}>
                    <option value="">Day...</option>
                    {Array.from({length: totalDays}).map((_, i) => (
                      <option key={i+1} value={i+1}>{i+1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Action</label>
                  <select className="select-field" style={{ padding: '8px', height: 'auto', minWidth: '100px' }} value={bulkType} onChange={e => setBulkType(e.target.value as LeaveType)}>
                    <option value="OFF">Mark OFF</option>
                    <option value="CL">Mark CL</option>
                    <option value="PRESENT">Mark Present</option>
                  </select>
                </div>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '8px 16px', height: 'auto' }}
                  onClick={handleBulkAction}
                  disabled={bulkSaving || !bulkRole || !bulkDay || !bulkType}
                >
                  {bulkSaving ? 'Saving...' : 'Apply Bulk'}
                </button>
              </div>
            </div>

            {/* Reviewed Toggle */}
            <div style={{ background: isReviewed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '16px', borderRadius: '12px', border: \`1px solid \${isReviewed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}\`, minWidth: '250px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                {isReviewed ? <ShieldCheck size={24} color="#34d399" /> : <ShieldAlert size={24} color="#fbbf24" />}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: isReviewed ? '#34d399' : '#fbbf24' }}>
                    {isReviewed ? 'Attendance Reviewed' : 'Review Required'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Unreviewed attendance may block calculations.
                  </div>
                </div>
              </div>
              <button
                onClick={toggleReviewed}
                style={{
                  width: '100%', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: isReviewed ? 'transparent' : '#10b981',
                  color: isReviewed ? '#f8fafc' : '#fff',
                  border: isReviewed ? '1px solid rgba(248, 250, 252, 0.2)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {isReviewed ? 'Unmark Review' : 'Mark as Reviewed'}
              </button>
            </div>

          </div>
        </div>
      )}

      {loading ? (`
);

fs.writeFileSync('/Users/ashrarehmat/hospital share/hospital-share/src/app/(dashboard)/attendance/page.tsx', content);
