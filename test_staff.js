const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const ids = ['a6279ee4-e6b5-469c-b4b0-e6de114645ac', '3ac41d2c-fba9-4eb6-9459-de20b06e197c'];
  const { data } = await supabase.from('staff').select('id, name, is_active').in('id', ids);
  console.log(data);
}
run();
