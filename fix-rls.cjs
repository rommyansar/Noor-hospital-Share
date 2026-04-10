// Fix RLS policies - add WITH CHECK for INSERT operations
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mcpbrmxasriosaxzybsq.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

// Use service role key to bypass RLS and fix policies
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fixRLS() {
  console.log('=== Fixing RLS Policies ===\n');
  
  const tables = ['departments', 'share_rules', 'staff', 'monthly_income', 'attendance', 'monthly_results', 'audit_log'];
  
  for (const table of tables) {
    console.log(`Fixing ${table}...`);
    
    // Drop old policy
    const { error: dropErr } = await supabase.rpc('exec_sql', {
      sql: `DROP POLICY IF EXISTS "auth_${table}" ON ${table};`
    });
    
    if (dropErr) {
      console.log(`  Drop via RPC failed: ${dropErr.message}`);
    }
    
    // Create new policy with WITH CHECK
    const { error: createErr } = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "auth_${table}" ON ${table} FOR ALL USING (true) WITH CHECK (true);`
    });
    
    if (createErr) {
      console.log(`  Create via RPC failed: ${createErr.message}`);
    } else {
      console.log(`  ✅ Fixed`);
    }
  }
}

async function testInsert() {
  console.log('\n=== Testing Department Insert ===');
  
  // First sign in as admin to get an authenticated session
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'admin@hospital.com',
    password: 'Admin@123456',
  });
  
  if (loginErr) {
    console.log('Login failed:', loginErr.message);
    return;
  }
  
  console.log('Logged in as:', loginData.user.email);
  
  // Now try with a client using the anon key (like the browser would)
  const anonClient = createClient(SUPABASE_URL, 'YOUR_SUPABASE_ANON_KEY', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${loginData.session.access_token}` } }
  });
  
  // Test insert
  const { data, error } = await anonClient.from('departments').insert({
    name: 'Test Department',
    type: 'clinical',
    is_active: true,
  }).select();
  
  if (error) {
    console.log('❌ Insert failed:', error.message);
    console.log('   Details:', JSON.stringify(error));
  } else {
    console.log('✅ Insert succeeded:', data[0]?.name);
    
    // Clean up test data
    await anonClient.from('departments').delete().eq('id', data[0].id);
    console.log('   Cleaned up test record');
  }
}

async function testWithServiceRole() {
  console.log('\n=== Testing with Service Role (bypasses RLS) ===');
  
  const { data, error } = await supabase.from('departments').insert({
    name: 'Test Service Role',
    type: 'clinical',
    is_active: true,
  }).select();
  
  if (error) {
    console.log('❌ Service role insert failed:', error.message);
  } else {
    console.log('✅ Service role insert succeeded:', data[0]?.name);
    await supabase.from('departments').delete().eq('id', data[0].id);
    console.log('   Cleaned up');
  }
}

async function main() {
  // First test with service role to confirm table works at all
  await testWithServiceRole();
  
  // Try to fix RLS
  await fixRLS();
  
  // Test insert with authenticated user
  await testInsert();
  
  console.log('\n=== Done ===');
}

main().catch(console.error);
