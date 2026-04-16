const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: results, error } = await supabase
    .from('daily_results')
    .select('*, staff!inner(*, departments!inner(name))')
    .eq('department_id', 'de1cffdb-4e57-4f72-890e-6129a92ed15d')
    .gte('date', '2026-02-01')
    .lt('date', '2026-03-01')
    .order('date');

  console.log("Error:", error);
  console.log("Results length:", results?.length);
  
  if (results) {
    results.forEach(r => {
      console.log(`Staff: ${r.staff.name}, Origin: ${r.staff.departments?.name}, Share: ${r.final_share}, Rule: ${r.rule_percentage}`);
    });
  }
}

run();
