const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const month = '2026-03';
  const department_id = 'd4e125db-01d4-40dc-ae9e-0c80fc366dc6';
  
  const { data: otCases } = await supabase.from('ot_cases').select('*').eq('month', month).eq('department_id', department_id);
  console.log("Found cases:", otCases.length);
  
  // just check if they are fetched correctly
}
run();
