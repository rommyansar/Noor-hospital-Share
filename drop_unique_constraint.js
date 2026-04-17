// Run this script to drop the unique constraint on daily_results
// that prevents staff from having multiple calculation entries (core + addon)
// Usage: node drop_unique_constraint.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function dropConstraint() {
  console.log('=== Dropping unique constraint on daily_results ===');
  console.log('Constraint: daily_results_staff_id_date_department_id_key');
  console.log('');
  console.log('This allows staff to have MULTIPLE rows per (staff_id, date, department_id)');
  console.log('which is needed for OT core results + addon shares.');
  console.log('');
  
  // We need to run raw SQL. Since supabase-js doesn't support this directly,
  // we'll need to use the Supabase Dashboard SQL Editor.
  console.log('⚠️  Please run this SQL in your Supabase Dashboard → SQL Editor:');
  console.log('');
  console.log('ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_staff_id_date_department_id_key;');
  console.log('');
  console.log('After running, the calculation engine will work correctly for staff with multiple entries.');
}

dropConstraint();
