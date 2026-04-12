import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const department_id = body.department_id;
  const date = body.date;
  const entries = body.entries || [];

  if (!department_id || !date) {
    return NextResponse.json({ error: 'department_id and date required' }, { status: 400 });
  }

  // 1. Delete all existing cross-departmental entries for this department and date
  const { error: deleteError } = await supabase
    .from('staff_work_entries')
    .delete()
    .eq('department_id', department_id)
    .eq('date', date)
    .eq('description', 'Cross-Department Share');

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // 2. Insert new entries
  if (entries.length > 0) {
    const { data, error: insertError } = await supabase
      .from('staff_work_entries')
      .insert(entries)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
