require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('daily_results')
    .select('*, staff(*, departments!inner(name))')
    .eq('department_id', 'de1cffdb-4e57-4f72-890e-6129a92ed15d')
    .gte('date', '2026-02-01')
    .lt('date', '2026-03-01')
    .order('date');
    
  console.log("Error:", error);
  console.log("Data count:", data ? data.length : 0);
  if (data && data.length > 0) {
    const mainStaff = data.find(d => d.staff_id === '526e4848-c2ae-4131-88f7-11b9ac49ad73');
    console.log("Main staff record:", JSON.stringify(mainStaff, null, 2));
  }
}

run();
