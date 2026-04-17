// Database migration: Add department_id to ot_cases and ot_monthly_addons
// Run with: node migrate_ot_dept.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mcpbrmxasriosaxzybsq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcGJybXhhc3Jpb3NheHp5YnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MjYzNTMsImV4cCI6MjA4MjQwMjM1M30.Ihi-9RkEuUv9ERnNuuL3YXN7uTmXb6W2A88O9bgNzaI'
);

async function migrate() {
  console.log('Testing ot_cases table...');
  
  // Test if department_id column already exists by inserting a test query
  const { data, error } = await supabase
    .from('ot_cases')
    .select('department_id')
    .limit(1);

  if (error && error.message.includes('department_id')) {
    console.log('department_id column does NOT exist in ot_cases. Please add it via Supabase Dashboard:');
    console.log('');
    console.log('SQL to run in Supabase SQL Editor:');
    console.log('------');
    console.log("ALTER TABLE ot_cases ADD COLUMN IF NOT EXISTS department_id TEXT;");
    console.log("ALTER TABLE ot_monthly_addons ADD COLUMN IF NOT EXISTS department_id TEXT;");
    console.log("CREATE INDEX IF NOT EXISTS idx_ot_cases_dept_month ON ot_cases(department_id, month);");
    console.log("CREATE INDEX IF NOT EXISTS idx_ot_monthly_addons_dept_month ON ot_monthly_addons(department_id, month);");
    console.log('------');
  } else {
    console.log('department_id column exists or table is accessible. Data:', data);
  }

  // Test ot_monthly_addons
  const { data: data2, error: error2 } = await supabase
    .from('ot_monthly_addons')
    .select('department_id')
    .limit(1);

  if (error2 && error2.message.includes('department_id')) {
    console.log('department_id column does NOT exist in ot_monthly_addons.');
  } else {
    console.log('ot_monthly_addons department_id status:', data2 ? 'exists' : 'empty');
  }
}

migrate().catch(console.error);
