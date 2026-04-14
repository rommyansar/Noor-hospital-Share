const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const { count, error } = await supabase.from('staff').select('*', { count: 'exact', head: true });
  console.log('Total Staff Count:', count, 'Error:', error);
}
test();
