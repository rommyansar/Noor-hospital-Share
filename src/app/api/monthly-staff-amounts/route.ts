import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const department_id = searchParams.get('department_id');
  const month = searchParams.get('month');

  if (!department_id || !month) {
    return NextResponse.json({ error: 'Missing department_id or month' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('department_staff_amounts')
    .select('*')
    .eq('department_id', department_id)
    .eq('month', month);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { entries, department_id, month } = body;

  if (!entries || !department_id || !month) {
    return NextResponse.json({ error: 'Missing required payload data' }, { status: 400 });
  }

  // First, clear existing entries for this month/dept
  await supabase
    .from('department_staff_amounts')
    .delete()
    .eq('department_id', department_id)
    .eq('month', month);

  const payload = entries.map((en: any) => ({
    department_id,
    month,
    staff_id: en.staff_id,
    amount: parseFloat(en.amount) || 0,
    distribution_type: en.distribution_type || 'individual',
    percentage: parseFloat(en.percentage) || null,
  }));

  if (payload.length > 0) {
    const { error } = await supabase
      .from('department_staff_amounts')
      .insert(payload);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
