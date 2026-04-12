import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get('staff_id');
  const deptId = searchParams.get('department_id');
  const date = searchParams.get('date');

  let query = supabase.from('staff_work_entries').select('*, staff(*)').order('created_at');

  if (staffId) query = query.eq('staff_id', staffId);
  if (deptId) query = query.eq('department_id', deptId);
  if (date) query = query.eq('date', date);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('staff_work_entries')
    .insert({
      staff_id: body.staff_id,
      department_id: body.department_id,
      date: body.date,
      description: body.description || '',
      amount: body.amount || 0,
      percentage: body.percentage || '0',
    })
    .select('*, staff(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('staff_work_entries').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
