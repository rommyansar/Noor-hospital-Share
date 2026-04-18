const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const req = await fetch('http://localhost:3000/api/calculate/ot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-03', department_id: 'd4e125db-01d4-40dc-ae9e-0c80fc366dc6' })
  });
  const res = await req.json();
  console.log(res);
}
run();
