import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();
  
  // Use first department in array as primary department_id for legacy compatibility
  const primaryDept = body.department_ids && body.department_ids.length > 0 ? body.department_ids[0] : body.department_id;
  
  const { data, error } = await supabase
    .from('staff')
    .update({ 
      name: body.name, 
      department_id: primaryDept, 
      department_ids: body.department_ids || [body.department_id],
      department_percentages: body.department_percentages || {},
      role: body.role, 
      is_active: body.is_active,
      staff_code: body.staff_code?.trim() || null 
    })
    .eq('id', id)
    .select('*, departments(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('staff').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
