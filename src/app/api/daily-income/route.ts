import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const date = searchParams.get('date');
  const month = searchParams.get('month'); // YYYY-MM

  if (!deptId || (!date && !month)) {
    return NextResponse.json({ error: 'department_id and either date or month required' }, { status: 400 });
  }

  let query = supabase.from('daily_income').select('*').eq('department_id', deptId);
  
  if (date) {
    query = query.eq('date', date);
    const { data, error } = await query.maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } else {
    // get all for month
    // get all for month safely without timezone shifting
    const [yearStr, monthStr] = month!.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const nextMonth = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    query = query.gte('date', `${month}-01`).lt('date', nextMonth).order('date', { ascending: true });
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('daily_income')
    .upsert(
      {
        department_id: body.department_id,
        date: body.date,
        amount: body.amount || 0,
      },
      { onConflict: 'department_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
