import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const date = searchParams.get('date');

  if (!deptId || !date) {
    return NextResponse.json({ error: 'department_id and date required' }, { status: 400 });
  }

  // Get all staff of that department
  const { data: staffList, error: staffError } = await supabase
    .from('staff')
    .select('*')
    .eq('department_id', deptId)
    .eq('is_active', true)
    .order('name');

  if (staffError) return NextResponse.json({ error: staffError.message }, { status: 500 });

  // Get attendance records for that date
  const staffIds = (staffList || []).map((s) => s.id);
  let attendanceMap: Record<string, boolean> = {};

  if (staffIds.length > 0) {
    const { data: attData } = await supabase
      .from('daily_attendance')
      .select('*')
      .eq('date', date)
      .in('staff_id', staffIds);

    if (attData) {
      for (const a of attData) {
        attendanceMap[a.staff_id] = a.is_present;
      }
    }
  }

  // Build response: each staff with their attendance
  const result = (staffList || []).map((s) => ({
    ...s,
    is_present: attendanceMap[s.id] ?? false,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  // Expect: { records: [{ staff_id, date, is_present }] }
  const records = body.records as { staff_id: string; date: string; is_present: boolean }[];

  if (!records || !Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'records array required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('daily_attendance')
    .upsert(
      records.map((r) => ({
        staff_id: r.staff_id,
        date: r.date,
        is_present: r.is_present,
      })),
      { onConflict: 'staff_id,date' }
    )
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
