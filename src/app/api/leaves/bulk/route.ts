import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of leaves' }, { status: 400 });
  }

  // Strip department_id from any payloads (global attendance)
  const cleaned = body.map(({ department_id, ...rest }) => rest);

  // Separate the null records from the OFF/CL records
  const toUpsert = cleaned.filter(l => l.leave_type !== null);
  const toDelete = cleaned.filter(l => l.leave_type === null);

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('staff_leaves')
      .upsert(toUpsert, { onConflict: 'staff_id,date' });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (toDelete.length > 0) {
    for (const rec of toDelete) {
      await supabase
        .from('staff_leaves')
        .delete()
        .eq('staff_id', rec.staff_id)
        .eq('date', rec.date);
    }
  }

  return NextResponse.json({ success: true });
}
