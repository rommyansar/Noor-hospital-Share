const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('departments').update({ calculation_method: 'ot' }).eq('id', 'dcb9ea95-e428-41e4-b1e4-7797de3ab9ff');
  if (error) console.error(error);
  else console.log('Successfully updated DELIVERY to calculation_method = ot');
}
run();
