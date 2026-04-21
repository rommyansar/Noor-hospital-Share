const rules = [{ role: 'DOCTOR' }, { role: 'NURSE' }, { role: 'OPD NURSE' }];
const staffObj = {
  role: 'NURSE',
  department_percentages: {
    'some-uuid': { role: 'OPD NURSE', percentage: '1' }
  }
};

const resolveEffRoleAndPct = (staffObj, targetDeptId, rules) => {
    let effRole = staffObj.role;
    let effPctObj = null;

    if (staffObj.department_percentages) {
      const config = staffObj.department_percentages[targetDeptId];
      if (config) {
        effPctObj = config;
        if (typeof config === 'object' && config.role) {
          effRole = config.role;
        }
      } else if (rules && rules.length > 0) {
        const validRuleNames = rules.map(r => String(r.role).toUpperCase().trim());
        for (const key of Object.keys(staffObj.department_percentages)) {
          const fallbackConfig = staffObj.department_percentages[key];
          if (typeof fallbackConfig === 'object' && fallbackConfig !== null && fallbackConfig.role) {
            const fallbackRole = String(fallbackConfig.role).trim();
            if (validRuleNames.includes(fallbackRole.toUpperCase())) {
              effRole = fallbackRole;
              effPctObj = fallbackConfig;
              break;
            }
          }
        }
      }
    }
    return { effRole, effPctObj };
};

console.log(resolveEffRoleAndPct(staffObj, 'other-uuid', rules));
