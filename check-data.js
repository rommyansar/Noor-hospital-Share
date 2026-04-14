const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function run() {
  const deptId = 'f1c0b215-fda5-4572-9914-b00aa22cab34'; // ENT
  const startDate = '2026-02-01';
  const endDate = '2026-03-01';
  
  const { data: results } = await db
    .from('daily_results')
    .select('*, staff(*, departments(name))')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate);
    
  if (!results) return console.log('No results found');
  
  console.log("Analyzing staff categorization:");
  results.forEach(r => {
    const breakdown = r.breakdown || {};
    const staffDept = r.staff?.departments?.name;
    const isMain = staffDept === 'Ent';
    console.log(`Staff: ${r.staff?.name.padEnd(20)} | Role: ${r.staff?.role.padEnd(10)} | StaffDept: ${staffDept.padEnd(10)} | BreakdownType: ${breakdown.type || 'N/A'}`);
  });
}
run();
