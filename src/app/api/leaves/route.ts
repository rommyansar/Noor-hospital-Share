import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

/**
 * GET /api/leaves?department_id=...&month=YYYY-MM
 * Returns all leave records for a department in a month.
 *
 * GET /api/leaves?department_id=...&date=YYYY-MM-DD
 * Returns leave records for a specific date (used by calculation).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const date = searchParams.get('date');
  const month = searchParams.get('month'); // YYYY-MM

  if (!deptId) {
    return NextResponse.json({ error: 'department_id required' }, { status: 400 });
  }

  let query = supabase
    .from('staff_leaves')
    .select('*, staff(id, name, role)')
    .eq('department_id', deptId)
    .order('date');

  if (date) {
    // Single-date query (for calculation)
    query = query.eq('date', date);
  } else if (month) {
    // Month range query (for attendance page)
    const [y, m] = month.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('date', startDate).lt('date', endDate);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/**
 * POST /api/leaves
 * Add or remove a leave day.
 * Body: { staff_id, department_id, date, leave_type: 'OFF' | 'CL' }
 *
 * If leave_type is provided → upsert leave record (mark OFF/CL)
 * If leave_type is null/empty → delete the record (mark as PRESENT)
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { staff_id, department_id, date, leave_type } = body;

  if (!staff_id || !department_id || !date) {
    return NextResponse.json({ error: 'staff_id, department_id, and date required' }, { status: 400 });
  }

  if (!leave_type) {
    // Remove leave = mark as present
    const { error } = await supabase
      .from('staff_leaves')
      .delete()
      .eq('staff_id', staff_id)
      .eq('date', date);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removed: true });
  }

  // Upsert leave record
  const { data, error } = await supabase
    .from('staff_leaves')
    .upsert(
      { staff_id, department_id, date, leave_type },
      { onConflict: 'staff_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * DELETE /api/leaves?id=...
 * Remove a specific leave record.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('staff_leaves').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
