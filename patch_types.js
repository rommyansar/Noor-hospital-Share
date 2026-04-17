const fs = require('fs');
const file = 'src/lib/types.ts';
let code = fs.readFileSync(file, 'utf8');
if (!code.includes('OTMonthlyAddon')) {
  code = code.replace(
    'export interface OTCase {',
    `export interface OTMonthlyAddon {\n  id: string;\n  month: string;\n  addon_department_id: string;\n  percentage: number;\n  calculation_type: 'individual' | 'group';\n  attendance_rule: 'daily' | 'monthly' | 'none';\n  applied_rules?: string[];\n  created_at: string;\n}\n\nexport interface OTCase {`
  );
  fs.writeFileSync(file, code);
  console.log('Patched types.ts');
} else {
  console.log('Already patched');
}
