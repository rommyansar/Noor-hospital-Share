const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('daily_income')
    .upsert({
      department_id: 'a1104e76-ea81-426c-aeec-4467776b91c1',
      date: '2026-02-01',
      amount: 0,
      present_staff_ids: []
    }, { onConflict: 'department_id,date' })
    .select()
    .single();
    
  console.log("Empty Array:", { data, error });
}
run();
