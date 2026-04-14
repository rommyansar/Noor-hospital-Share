const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function run() {
  const { data: results } = await db
    .from('daily_results')
    .select('*')
    .eq('staff_id', 'feb79abe-e224-481f-87ee-31d882a3923a') // Gurmeet
    .eq('department_id', 'f1c0b215-fda5-4572-9914-b00aa22cab34') // ENT
    .limit(1);
    
  if (results && results[0]) {
    console.log(JSON.stringify(results[0].breakdown, null, 2));
  } else {
    console.log("No data");
  }
}
run();
