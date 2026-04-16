require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, department_id, department_ids, departments!inner(name)')
    .eq('id', '526e4848-c2ae-4131-88f7-11b9ac49ad73');
    
  console.log("Mufi staff:", JSON.stringify(data, null, 2));
}

run();
