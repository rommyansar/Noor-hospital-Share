const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === 'admin@hospital.com');

  if (user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: 'password123',
    });
    if (error) {
      console.error('Error updating user:', error.message);
    } else {
      console.log('Password reset successfully!');
      console.log('Email: admin@hospital.com');
      console.log('Password: password123');
    }
  }
}

main();
