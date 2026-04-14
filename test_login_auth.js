const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testLogin() {
  console.log('Testing login for admin@hospital.com...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@hospital.com',
    password: 'password123',
  });

  if (error) {
    console.error('Login failed:', error.message);
    if (error.message.includes('Invalid login credentials')) {
      console.log('Suggestion: The password in the DB might not be password123.');
    }
  } else {
    console.log('Login successful!');
    console.log('User ID:', data.user.id);
  }
}

testLogin();
