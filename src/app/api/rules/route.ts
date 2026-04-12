import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');

  let query = supabase.from('department_rules').select('*, departments(*)').order('role');
  if (deptId) query = query.eq('department_id', deptId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  // Upsert by department_id + role
  const { data, error } = await supabase
    .from('department_rules')
    .upsert(
      {
        department_id: body.department_id,
        role: body.role,
        percentage: body.percentage || '0',
        distribution_type: body.distribution_type || 'individual',
        is_active: body.is_active ?? true,
      },
      { onConflict: 'department_id,role' }
    )
    .select('*, departments(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
