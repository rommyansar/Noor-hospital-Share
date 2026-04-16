import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from('daily_results')
    .select('*, staff(*, departments!inner(name))')
    .eq('department_id', 'de1cffdb-4e57-4f72-890e-6129a92ed15d')
    .gte('date', '2026-02-01')
    .lt('date', '2026-03-01')
    .order('date');
    
  console.log("Error:", error);
  console.log("Data length:", data?.length);
  const mufi = data?.find(d => d.staff_id === '526e4848-c2ae-4131-88f7-11b9ac49ad73');
  console.log("Mufi staff object:", mufi?.staff);
}

run();
