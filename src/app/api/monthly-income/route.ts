import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

import { invalidateReportCache } from '@/lib/cache';

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of records' }, { status: 400 });
  }

  // Use Promise.all to bypass PostgREST's bulk payload type inference limitations
  // (where a null present_staff_ids in the first item causes the column to be mishandled)
  const results = await Promise.all(
    body.map((record) =>
      supabase
        .from('daily_income')
        .upsert(record, { onConflict: 'department_id,date' })
        .select()
        .single()
    )
  );

  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0].error?.message }, { status: 500 });
  }

  invalidateReportCache();
  return NextResponse.json(results.map((r) => r.data));
}
