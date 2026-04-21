const fs = require('fs');

let content = fs.readFileSync('src/app/(dashboard)/monthly-entry/page.tsx', 'utf8');

// 1. migrateEntry fallback
content = content.replace(
  `        if (typeof raw === 'string') {
          // Old format — migrate from staff_id string
          const staffObj = allActiveStaff.find(s => s.id === raw);
          if (!staffObj) return null;
          const matchedRule = loadedActiveRules.find((r: DepartmentRule) => r.role.toUpperCase().trim() === staffObj.role.toUpperCase().trim());
          const entry: StaffEntry = {
            entry_id: crypto.randomUUID(),
            staff_id: raw,
            role: staffObj.role,
            percentage: matchedRule ? Number(matchedRule.percentage) : 0,
            dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
          };`,
  `        if (typeof raw === 'string') {
          // Old format — migrate from staff_id string
          const staffObj = allActiveStaff.find(s => s.id === raw);
          if (!staffObj) return null;
          
          const deptPctObj = staffObj.department_percentages?.[selectedDept];
          const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : staffObj.role;

          const matchedRule = loadedActiveRules.find((r: DepartmentRule) => r.role.toUpperCase().trim() === effRole.toUpperCase().trim());
          
          let effPct = matchedRule ? Number(matchedRule.percentage) : 0;
          if (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.percentage && String(deptPctObj.percentage).trim() !== '') {
            effPct = Number(deptPctObj.percentage);
          } else if (deptPctObj && typeof deptPctObj !== 'object' && String(deptPctObj).trim() !== '') {
            effPct = Number(deptPctObj);
          }

          const entry: StaffEntry = {
            entry_id: crypto.randomUUID(),
            staff_id: raw,
            role: effRole,
            percentage: effPct,
            dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
          };`
);

// 2. Department Rules Summary - mapping
content = content.replace(
  `            {deptRules.map(rule => {
              const matchingStaff = staffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim());`,
  `            {deptRules.map(rule => {
              const matchingStaff = staffList.filter(s => {
                const deptPctObj = s.department_percentages?.[selectedDept];
                const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
                return effRole.toUpperCase().trim() === rule.role.toUpperCase().trim();
              });`
);

// 3. Department Rules Summary - global fallback
content = content.replace(
  `                    ) : globalStaffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id))).length > 0 ? (
                      <span style={{ color: '#60a5fa' }} title="These staff members receive their share automatically via the External Add-On system.">
                        {globalStaffList.filter(s => s.role.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id))).length} staff handled via Add-On System
                      </span>`,
  `                    ) : globalStaffList.filter(s => {
                      const deptPctObj = s.department_percentages?.[selectedDept];
                      const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
                      return effRole.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id));
                    }).length > 0 ? (
                      <span style={{ color: '#60a5fa' }} title="These staff members receive their share automatically via the External Add-On system.">
                        {globalStaffList.filter(s => {
                          const deptPctObj = s.department_percentages?.[selectedDept];
                          const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
                          return effRole.toUpperCase().trim() === rule.role.toUpperCase().trim() && s.department_ids?.some(id => addons.map(a => a.addon_department_id).includes(id));
                        }).length} staff handled via Add-On System
                      </span>`
);

// 4. Department Rules Summary - Unmatched staff
content = content.replace(
  `          {staffList.filter(s => !deptRules.find(r => r.role.toUpperCase().trim() === s.role.toUpperCase().trim())).length > 0 && (
            <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <p style={{ fontSize: '12px', color: '#f87171', fontWeight: 600, margin: 0 }}>
                ⚠ Unmatched Staff (no rule for their role):
              </p>
              <p style={{ fontSize: '12px', color: '#fca5a5', margin: '4px 0 0' }}>
                {staffList.filter(s => !deptRules.find(r => r.role.toUpperCase().trim() === s.role.toUpperCase().trim())).map(s => \`\${s.name} (\${s.role})\`).join(', ')}
              </p>
            </div>
          )}`,
  `          {staffList.filter(s => {
            const deptPctObj = s.department_percentages?.[selectedDept];
            const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
            return !deptRules.find(r => r.role.toUpperCase().trim() === effRole.toUpperCase().trim());
          }).length > 0 && (
            <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <p style={{ fontSize: '12px', color: '#f87171', fontWeight: 600, margin: 0 }}>
                ⚠ Unmatched Staff (no rule for their role):
              </p>
              <p style={{ fontSize: '12px', color: '#fca5a5', margin: '4px 0 0' }}>
                {staffList.filter(s => {
                  const deptPctObj = s.department_percentages?.[selectedDept];
                  const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
                  return !deptRules.find(r => r.role.toUpperCase().trim() === effRole.toUpperCase().trim());
                }).map(s => {
                  const deptPctObj = s.department_percentages?.[selectedDept];
                  const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
                  return \`\${s.name} (\${effRole})\`;
                }).join(', ')}
              </p>
            </div>
          )}`
);

// 5. Build role counts
content = content.replace(
  `        // Build role counts for group distribution (only from selected/effective staff)
        const roleCounts: Record<string, number> = {};
        effectiveStaffList.forEach(s => {
          const rKey = s.role.toUpperCase().trim();
          roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
        });`,
  `        // Build role counts for group distribution (only from selected/effective staff)
        const roleCounts: Record<string, number> = {};
        effectiveStaffList.forEach(s => {
          const deptPctObj = s.department_percentages?.[selectedDept];
          const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
          const rKey = effRole.toUpperCase().trim();
          roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
        });`
);

// 6. RowData type
content = content.replace(
  `        type RowData = {
          staff: Staff;
          rule: DepartmentRule | null;`,
  `        type RowData = {
          staff: Staff;
          effRole: string;
          rule: DepartmentRule | null;`
);

// 7. Primary Department Staff
content = content.replace(
  `        // === Primary Department Staff ===
        const primaryRows: RowData[] = effectiveStaffList.map(s => {
          const rKey = s.role.toUpperCase().trim();
          const rule = deptRules.find(r => r.role.toUpperCase().trim() === rKey);
          const absentDays = getAbsentDays(s.id);
          const workingDays = totalDays - absentDays;

          if (!rule) return { staff: s, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'primary', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

          const pct = parseFloat(rule.percentage) || 0;
          const overridePct = s.department_percentages?.[selectedDept];
          const effectivePct = (overridePct && String(overridePct).trim() !== '') ? parseFloat(String(overridePct)) : pct;`,
  `        // === Primary Department Staff ===
        const primaryRows: RowData[] = effectiveStaffList.map(s => {
          const deptPctObj = s.department_percentages?.[selectedDept];
          const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
          const rKey = effRole.toUpperCase().trim();
          const rule = deptRules.find(r => r.role.toUpperCase().trim() === rKey);
          const absentDays = getAbsentDays(s.id);
          const workingDays = totalDays - absentDays;

          if (!rule) return { staff: s, effRole, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'primary', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

          const pct = parseFloat(rule.percentage) || 0;
          let effectivePct = pct;
          if (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.percentage && String(deptPctObj.percentage).trim() !== '') {
            effectivePct = parseFloat(String(deptPctObj.percentage));
          } else if (deptPctObj && typeof deptPctObj !== 'object' && String(deptPctObj).trim() !== '') {
            effectivePct = parseFloat(String(deptPctObj));
          }`
);

// We must also fix the return in the primary mapping map: 
content = content.replace(
  `, section: 'primary', adjustedBase, workAmount };
        });`,
  `, section: 'primary', adjustedBase, workAmount };
        });`
);
// specifically, the return at the end:
content = content.replace(
  `          return { staff: s, rule, pct: effectivePct, distType: rule.distribution_type, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'primary', adjustedBase, workAmount };
        });`,
  `          return { staff: s, effRole, rule, pct: effectivePct, distType: rule.distribution_type, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'primary', adjustedBase, workAmount };
        });`
);

// 8. Addon Department role counts
content = content.replace(
  `          const aRoleCounts: Record<string, number> = {};
          aStaff.forEach(s => {
            const rk = s.role.toUpperCase().trim();
            aRoleCounts[rk] = (aRoleCounts[rk] || 0) + 1;
          });`,
  `          const aRoleCounts: Record<string, number> = {};
          aStaff.forEach(s => {
            const deptPctObj = s.department_percentages?.[addon.addon_department_id];
            const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
            const rk = effRole.toUpperCase().trim();
            aRoleCounts[rk] = (aRoleCounts[rk] || 0) + 1;
          });`
);

// 9. Addon Department Staff map
content = content.replace(
  `          const aRows: RowData[] = aStaff.map(s => {
            const rKey = s.role.toUpperCase().trim();
            // Use addon department's own rules
            const rule = aRules.find(r => r.role.toUpperCase().trim() === rKey && activeRuleIds.includes(r.id));
            const absentDays = getAbsentDays(s.id);
            const workingDays = totalDays - absentDays;

            if (!rule) return { staff: s, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'addon', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

            const pct = parseFloat(rule.percentage) || 0;
            const overridePct = s.department_percentages?.[addon.addon_department_id];
            const effectivePct = (overridePct && String(overridePct).trim() !== '') ? parseFloat(String(overridePct)) : pct;`,
  `          const aRows: RowData[] = aStaff.map(s => {
            const deptPctObj = s.department_percentages?.[addon.addon_department_id];
            const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : s.role;
            const rKey = effRole.toUpperCase().trim();
            // Use addon department's own rules
            const rule = aRules.find(r => r.role.toUpperCase().trim() === rKey && activeRuleIds.includes(r.id));
            const absentDays = getAbsentDays(s.id);
            const workingDays = totalDays - absentDays;

            if (!rule) return { staff: s, effRole, rule: null, pct: 0, distType: '-', estimatedAmount: 0, poolTotal: 0, absentDays, workingDays, section: 'addon', adjustedBase: 0, workAmount: parseFloat(staffAmounts[s.id]) || 0 };

            const pct = parseFloat(rule.percentage) || 0;
            let effectivePct = pct;
            if (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.percentage && String(deptPctObj.percentage).trim() !== '') {
              effectivePct = parseFloat(String(deptPctObj.percentage));
            } else if (deptPctObj && typeof deptPctObj !== 'object' && String(deptPctObj).trim() !== '') {
              effectivePct = parseFloat(String(deptPctObj));
            }`
);
content = content.replace(
  `            return { staff: s, rule, pct: effectivePct, distType, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'addon', adjustedBase, workAmount };
          });`,
  `            return { staff: s, effRole, rule, pct: effectivePct, distType, estimatedAmount: amount, poolTotal, absentDays, workingDays, section: 'addon', adjustedBase, workAmount };
          });`
);

// 10. renderRow
content = content.replace(
  `            <td style={{ padding: '10px 16px' }}>
              {row.rule ? (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', textTransform: 'uppercase'
                }}>{row.staff.role}</span>
              ) : (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', textTransform: 'uppercase'
                }}>{row.staff.role} ⚠</span>
              )}
            </td>`,
  `            <td style={{ padding: '10px 16px' }}>
              {row.rule ? (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', textTransform: 'uppercase'
                }}>{row.effRole}</span>
              ) : (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', textTransform: 'uppercase'
                }}>{row.effRole || row.staff.role} ⚠</span>
              )}
            </td>`
);

// 11. Add Manual Entry select (line 1618 context)
// Because this is deep in the file, we'll replace the block.
content = content.replace(
  `                              onChange={(e) => {
                                if (!e.target.value) return;
                                const staffObj = globalStaffList.find(s => s.id === e.target.value);
                                if (!staffObj) return;
                                const matchedRule = deptRules.find(r => r.role.toUpperCase().trim() === staffObj.role.toUpperCase().trim());
                                setManualEntries(prev => [...prev, {
                                  entry_id: crypto.randomUUID(),
                                  staff_id: staffObj.id,
                                  role: staffObj.role,
                                  percentage: matchedRule ? Number(matchedRule.percentage) : 0,
                                  dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
                                  amount: 0,
                                }]);
                              }}`,
  `                              onChange={(e) => {
                                if (!e.target.value) return;
                                const staffObj = globalStaffList.find(s => s.id === e.target.value);
                                if (!staffObj) return;
                                const deptPctObj = staffObj.department_percentages?.[selectedDept];
                                const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : staffObj.role;
                                const matchedRule = deptRules.find(r => r.role.toUpperCase().trim() === effRole.toUpperCase().trim());
                                
                                let effPct = matchedRule ? Number(matchedRule.percentage) : 0;
                                if (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.percentage && String(deptPctObj.percentage).trim() !== '') {
                                  effPct = Number(deptPctObj.percentage);
                                } else if (deptPctObj && typeof deptPctObj !== 'object' && String(deptPctObj).trim() !== '') {
                                  effPct = Number(deptPctObj);
                                }
                                
                                setManualEntries(prev => [...prev, {
                                  entry_id: crypto.randomUUID(),
                                  staff_id: staffObj.id,
                                  role: effRole,
                                  percentage: effPct,
                                  dist_type: (matchedRule?.distribution_type as 'individual' | 'group') || 'individual',
                                  amount: 0,
                                }]);
                              }}`
);

// 12. staff_based rows rendering - finding the rule
content = content.replace(
  `                  ) : staffList.map((staff) => {
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
                          ) : (`,
  `                  ) : staffList.map((staff) => {
                    const deptPctObj = staff.department_percentages?.[selectedDept];
                    const effRole = (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.role) ? deptPctObj.role : staff.role;
                    const rule = deptRules.find(r => r.role.toUpperCase().trim() === effRole.toUpperCase().trim());
                    
                    let effPctStr = rule ? rule.percentage : '0';
                    if (deptPctObj && typeof deptPctObj === 'object' && deptPctObj.percentage && String(deptPctObj.percentage).trim() !== '') {
                      effPctStr = String(deptPctObj.percentage);
                    } else if (deptPctObj && typeof deptPctObj !== 'object' && String(deptPctObj).trim() !== '') {
                      effPctStr = String(deptPctObj);
                    }

                    return (
                      <tr key={staff.id} style={{ borderBottom: '1px solid rgba(71, 85, 105, 0.1)' }}>
                        <td style={{ padding: '10px 20px', fontWeight: 500, color: '#f8fafc', fontSize: '14px' }}>
                          <div style={{ fontWeight: 600 }}>{staff.name}</div>
                          <div style={{ color: '#64748b', fontSize: '11px' }}>{staff.staff_code || 'No Code'} • {effRole}</div>
                        </td>
                        <td style={{ padding: '10px 20px' }}>
                          {rule ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{rule.role}</span>
                              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                                {effPctStr}% • {rule.distribution_type === 'group' ? 'Group' : 'Individual'}
                              </span>
                            </div>
                          ) : (`
);

// Write changes
fs.writeFileSync('src/app/(dashboard)/monthly-entry/page.tsx', content);

console.log("Done patching monthly-entry/page.tsx");
