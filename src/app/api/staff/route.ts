import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');

  // We should just return all staff and sort them by name, since the requirement is to not group by department anymore
  let query = supabase.from('staff').select('*, departments(*)').order('name');
  if (deptId) {
    // Check if department_ids contains the passed deptId
    query = query.contains('department_ids', [deptId]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from('staff')
    .insert({
      name: body.name,
      department_id: body.department_ids && body.department_ids.length > 0 ? body.department_ids[0] : body.department_id,
      department_ids: body.department_ids || [body.department_id],
      department_percentages: body.department_percentages || {},
      role: body.role || 'Staff',
      is_active: body.is_active ?? true,
      staff_code: body.staff_code || null,
    })
    .select('*, departments(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
