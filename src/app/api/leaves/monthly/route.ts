import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  // Validate payload
  const { month, data } = body;
  if (!month || !Array.isArray(data)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const row of data) {
    const { staff_id, off_dates } = row;

    const [y, mStr] = month.split('-').map(Number);
    const startDate = `${y}-${String(mStr).padStart(2, '0')}-01`;
    const endDate = mStr === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(mStr + 1).padStart(2, '0')}-01`;

    // Delete all existing leaves for this staff for the given month
    await supabase
      .from('staff_leaves')
      .delete()
      .eq('staff_id', staff_id)
      .gte('date', startDate)
      .lt('date', endDate);

    const toInsert = [];

    // Insert OFF leaves on exactly the specified dates
    for (const day of off_dates) {
       const dateStr = `${month}-${String(day).padStart(2, '0')}`;
       toInsert.push({ staff_id, date: dateStr, leave_type: 'OFF' });
    }

    if (toInsert.length > 0) {
        await supabase.from('staff_leaves').insert(toInsert);
    }
  }

  return NextResponse.json({ success: true });
}
