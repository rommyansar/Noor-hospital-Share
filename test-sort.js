const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function run() {
  const deptId = 'f1c0b215-fda5-4572-9914-b00aa22cab34'; // ENT
  const startDate = '2026-02-01';
  const endDate = '2026-03-01';
  
  const { data: results, error } = await db
    .from('daily_results')
    .select('*, staff(*, departments!inner(name))')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');
    
  if (!results) return console.log('no results');
  
  const staffTotals = {};
  for (const r of results) {
    if (!staffTotals[r.staff_id]) {
      const breakdownObj = r.breakdown;
      staffTotals[r.staff_id] = {
        staff_name: r.staff?.name || 'Unknown',
        role: r.staff?.role || 'Unknown',
        origin_department: breakdownObj?.type === 'addon_share' 
            ? (breakdownObj?.addon_department || 'Add-On')
            : (r.staff?.departments?.name || 'Unknown'),
        total_share: 0,
      };
    }
    staffTotals[r.staff_id].total_share += r.final_share;
  }
  
  const { data: deptData } = await db.from('departments').select('name').eq('id', deptId).single();
  const mainDeptName = deptData?.name || 'Unknown';
  console.log("MAIN DEPT:", mainDeptName);

  const aggregated = Object.values(staffTotals).sort((a, b) => {
    const aIsMain = a.origin_department === mainDeptName;
    const bIsMain = b.origin_department === mainDeptName;

    if (aIsMain && !bIsMain) return -1;
    if (!aIsMain && bIsMain) return 1;

    if (aIsMain && bIsMain) {
      const aIsDoctor = a.role.toLowerCase().includes('doctor');
      const bIsDoctor = b.role.toLowerCase().includes('doctor');
      if (aIsDoctor && !bIsDoctor) return -1;
      if (!aIsDoctor && bIsDoctor) return 1;
      return b.total_share - a.total_share;
    }

    if (a.origin_department !== b.origin_department) {
      return a.origin_department.localeCompare(b.origin_department);
    }
    return b.total_share - a.total_share;
  });
  
  console.log(aggregated.map(a => `${a.origin_department.padEnd(10)} | ${a.role.padEnd(10)} | ${(a.total_share).toFixed(2).padStart(8)} | ${a.staff_name}`));
}
run();
