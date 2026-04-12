import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('daily_income')
    .upsert([{
      department_id: "efda81f8-0624-4f01-bec5-a1c22bc7d853", // Replace with a valid dept ID later if needed
      date: "2026-02-01",
      amount: 100,
      present_staff_ids: null
    }], { onConflict: 'department_id,date' })
    .select()

  console.log(error || data)
}
test()
