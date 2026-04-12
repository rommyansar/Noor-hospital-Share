import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const month = searchParams.get('month'); // YYYY-MM

  if (!deptId || !month) {
    return NextResponse.json({ error: 'department_id and month required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('monthly_attendance_status')
    .select('*')
    .eq('department_id', deptId)
    .eq('month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || { is_reviewed: false });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('monthly_attendance_status')
    .upsert(
      {
        department_id: body.department_id,
        month: body.month,
        is_reviewed: body.is_reviewed,
      },
      { onConflict: 'department_id,month' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
