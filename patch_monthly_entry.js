const fs = require('fs');
const file = 'src/app/(dashboard)/monthly-entry/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add states
content = content.replace(
  'const [staffList, setStaffList] = useState<Staff[]>([]);',
  `const [staffList, setStaffList] = useState<Staff[]>([]);
  const [autoStaffList, setAutoStaffList] = useState<Staff[]>([]);
  const [manualStaffList, setManualStaffList] = useState<Staff[]>([]);`
);

// 2. loadData: read dtData
content = content.replace(
  /if \(dtRes\.ok\) \{\s*const dtData = await dtRes\.json\(\);\s*setDeptTotalAmount\(dtData\?\.total_amount \? dtData\.total_amount\.toString\(\) : ''\);\s*setAppliedMainRules\(dtData\?\.applied_rules \|\| \[\]\);\s*setIsLocked\(\!\!dtData\?\.is_locked\);\s*\} else \{\s*setDeptTotalAmount\(''\);\s*setAppliedMainRules\(\[\]\);\s*setIsLocked\(false\);\s*\}/,
  `      let initialAutoStaffIds: string[] = [];
      let initialManualStaffIds: string[] = [];
      if (dtRes.ok) {
        const dtData = await dtRes.json();
        setDeptTotalAmount(dtData?.total_amount ? dtData.total_amount.toString() : '');
        setAppliedMainRules(dtData?.applied_rules || []);
        setIsLocked(!!dtData?.is_locked);
        initialAutoStaffIds = dtData?.auto_staff_ids || [];
        initialManualStaffIds = dtData?.manual_staff_ids || [];
      } else {
        setDeptTotalAmount('');
        setAppliedMainRules([]);
        setIsLocked(false);
      }`
);

// 3. loadData: populate autoStaffList and manualStaffList
content = content.replace(
  `setStaffList(filteredStaff);`,
  `setStaffList(filteredStaff);

      const autoStaff = allActiveStaff.filter((s: Staff) => initialAutoStaffIds.includes(s.id));
      const manualStaff = allActiveStaff.filter((s: Staff) => initialManualStaffIds.includes(s.id));
      setAutoStaffList(autoStaff);
      setManualStaffList(manualStaff);`
);

// 4. handleSaveAll
content = content.replace(
  `    const isStaffBased = departments.find(d => d.id === selectedDept)?.calculation_method === 'staff_based';

    try {
      if (isStaffBased) {
        const entriesToSave = staffList.map(staff => {`,
  `    const isStaffBased = departments.find(d => d.id === selectedDept)?.calculation_method === 'staff_based';
    const isAutoManual = departments.find(d => d.id === selectedDept)?.calculation_method === 'auto_manual';

    try {
      if (isStaffBased || isAutoManual) {
        const targetList = isAutoManual ? manualStaffList : staffList;
        const entriesToSave = targetList.map(staff => {`
);

content = content.replace(
  /if \(\!res\.ok\) \{\s*throw new Error\('Failed to save staff amounts'\);\s*\}\s*\} else \{\s*\/\/ Save daily income records\s*const recordsToSave = \[\];/s,
  `        if (!res.ok) {
          throw new Error('Failed to save staff amounts');
        }
      }
      
      if (!isStaffBased || isAutoManual) {
        // Save daily income records
        const recordsToSave = [];`
);

content = content.replace(
  /applied_rules: appliedMainRules,\s*is_locked: isLocked/s,
  `applied_rules: appliedMainRules,
          is_locked: isLocked,
          auto_staff_ids: isAutoManual ? autoStaffList.map(s => s.id) : [],
          manual_staff_ids: isAutoManual ? manualStaffList.map(s => s.id) : []`
);

// 5. changeIncomeType & isAutoManual in component scope
content = content.replace(
  `const isMonthlyBased = attendanceRule === 'monthly';`,
  `const isMonthlyBased = attendanceRule === 'monthly';
  const isAutoManual = selectedDepartmentData?.calculation_method === 'auto_manual';`
);

content = content.replace(
  `const changeIncomeType = async (method: 'income' | 'staff_based') => {`,
  `const changeIncomeType = async (method: 'income' | 'staff_based' | 'auto_manual') => {`
);

content = content.replace(
  /\{\[\s*\{ key: 'income', label: '🏥 Day \/ Department Income', desc: 'Enter daily income for the department' \},\s*\{ key: 'staff_based', label: '👤 Staff Income-wise', desc: 'Enter income per staff member directly' \}\s*\].map\(opt => \{\s*const isActive = isStaffBased \? opt.key === 'staff_based' : opt.key === 'income';/s,
  `                {[
                  { key: 'income', label: '🏥 Day / Department Income', desc: 'Enter daily income for the department' },
                  { key: 'staff_based', label: '👤 Staff Income-wise', desc: 'Enter income per staff member directly' },
                  { key: 'auto_manual', label: '🎛️ Auto + Manual Staff Mode', desc: 'Manage Auto vs Manual calculated staff pools' }
                ].map(opt => {
                  const isActive = selectedDepartmentData?.calculation_method === opt.key || 
                                   (!selectedDepartmentData?.calculation_method && opt.key === 'income');`
);

// We'll write the replacement back to check. 
fs.writeFileSync('test_monthly.js', '');
fs.writeFileSync(file, content, 'utf8');

console.log("Patched 1st set.");
