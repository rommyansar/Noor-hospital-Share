const { createClient } = require('@supabase/supabase-js');

// Load environment manually to avoid needing dotenv module if not installed
const env = require('fs').readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [key, ...vals] = line.split('=');
  if (key) acc[key] = vals.join('=');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });
  console.log('Result:', {data, error});
}

test();
