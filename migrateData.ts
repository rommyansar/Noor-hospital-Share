import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching staff without codes...');
  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, department_id, role, staff_code');
    
  if (error) {
    console.error('Error fetching staff:', error);
    return;
  }

  let codeCounters: Record<string, number> = {
    'DOC': 1000,
    'NUR': 1000,
    'REC': 1000,
    'SEC': 1000,
    'HLP': 1000,
    'PHA': 1000,
    'TEC': 1000,
    'OTH': 1000
  };

  const getPrefix = (role: string) => {
    const d = role.toLowerCase();
    if (d.includes('doctor')) return 'DOC';
    if (d.includes('nurse')) return 'NUR';
    if (d.includes('reception')) return 'REC';
    if (d.includes('security')) return 'SEC';
    if (d.includes('class') || d.includes('helper') || d.includes('sweeper')) return 'HLP';
    if (d.includes('pharmacist')) return 'PHA';
    if (d.includes('technician')) return 'TEC';
    return 'OTH';
  };

  // Find max existing codes to avoid collisions
  for (const s of staff!) {
    if (s.staff_code) {
      const parts = s.staff_code.split('-');
      if (parts.length === 2) {
        const prefix = parts[0];
        const num = parseInt(parts[1], 10);
        if (codeCounters[prefix] !== undefined && num >= codeCounters[prefix]) {
          codeCounters[prefix] = num + 1;
        }
      }
    }
  }

  // Update existing
  for (const s of staff!) {
    if (!s.staff_code) {
      const prefix = getPrefix(s.role);
      const newCode = `${prefix}-${codeCounters[prefix]++}`;
      await supabase.from('staff').update({ staff_code: newCode }).eq('id', s.id);
      console.log(`Updated ${s.name} (${s.role}) to ${newCode}`);
    }
  }

  console.log('Looking for missing staff...');
  const { data: pharmacyDept } = await supabase.from('departments').select('id').eq('name', 'Pharmacy').single();
  let pharmDeptId = pharmacyDept?.id;
  if (!pharmDeptId) {
    const { data: d } = await supabase.from('departments').insert({ name: 'Pharmacy', is_active: true }).select('id').single();
    pharmDeptId = d!.id;
  }

  const missingStaff = [
    { name: 'A.Mohsin', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Taufiq Ahmad', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Mahmud Muzammil', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Shujauddin', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'A.Rehman', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Syed Mahmood', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'T.Saba', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Khadeeja', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Hamda', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Sumeda', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Rofiza', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Fauzia', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Neha Parveen', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Niyamatun Yasmin', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Sameena Munawwar', role: 'Pharmacist', department_id: pharmDeptId },
    { name: 'Dy.Administrator', role: 'Administrator', department_id: pharmDeptId },
    { name: 'Accountant', role: 'Accountant', department_id: pharmDeptId },
    { name: 'Imp.Clerk', role: 'Clerk', department_id: pharmDeptId },
  ];

  const { data: genDept } = await supabase.from('departments').select('id').eq('name', 'General').maybeSingle();
  let generalDeptId = genDept?.id;
  if (!generalDeptId) {
    const { data: d } = await supabase.from('departments').insert({ name: 'General', is_active: true }).select('id').single();
    generalDeptId = d!.id;
  }

  const extendedStaff = [
    ...missingStaff,
    { name: 'Aziz', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Haqiqat', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Lateef', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Mukhtar', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Tahir', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Mubarak', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Jahangir', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Imran Arif', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Irfan Ahmad', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Wahid', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Tahir Mumtaz', role: 'Security Guard', department_id: generalDeptId },
    { name: 'Nizamuddin', role: 'Class IV', department_id: generalDeptId },
    { name: 'Daroodan', role: 'Class IV', department_id: generalDeptId },
    { name: 'Quresha', role: 'Class IV', department_id: generalDeptId },
    { name: 'Seema', role: 'Class IV', department_id: generalDeptId },
    { name: 'Rekha', role: 'Class IV', department_id: generalDeptId },
    { name: 'Pammi', role: 'Class IV', department_id: generalDeptId },
    { name: 'Sunny', role: 'Class IV', department_id: generalDeptId },
    { name: 'Rishi', role: 'Class IV', department_id: generalDeptId },
    { name: 'Sajan', role: 'Class IV', department_id: generalDeptId },
    { name: 'Rajan', role: 'Class IV', department_id: generalDeptId },
    { name: 'Aneesa', role: 'Class IV', department_id: generalDeptId },
    { name: 'Rakesh', role: 'Class IV', department_id: generalDeptId },
    { name: 'Shashi', role: 'Class IV', department_id: generalDeptId },
    { name: 'Sajid Ali', role: 'Class IV', department_id: generalDeptId },
    { name: 'Akram', role: 'Class IV', department_id: generalDeptId },
    { name: 'Gurmeet', role: 'Class IV', department_id: generalDeptId },
    { name: 'Mansoor', role: 'Driver', department_id: generalDeptId },
  ];

  for (const s of extendedStaff) {
    const { data: existing } = await supabase.from('staff').select('id').eq('name', s.name).eq('department_id', s.department_id).maybeSingle();
    if (!existing) {
      const prefix = getPrefix(s.role);
      const newCode = `${prefix}-${codeCounters[prefix]++}`;
      await supabase.from('staff').insert({
        name: s.name,
        role: s.role,
        department_id: s.department_id,
        is_active: true,
        staff_code: newCode
      });
      console.log(`Inserted ${s.name} (${s.role}) as ${newCode}`);
    }
  }

  console.log('Migration complete!');
}

main().catch(console.error);
