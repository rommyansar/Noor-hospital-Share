import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { invalidateReportCache } from '@/lib/cache';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const month = searchParams.get('month');

  if (!deptId || !month) {
    return NextResponse.json({ error: 'department_id and month required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('department_monthly_totals')
    .select('*')
    .eq('department_id', deptId)
    .eq('month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { department_id, month, total_amount, applied_rules, is_locked, auto_staff_ids, manual_staff_ids } = body;

  if (!department_id || !month) {
    return NextResponse.json({ error: 'department_id and month required' }, { status: 400 });
  }

  const upsertPayload: Record<string, any> = {
    department_id,
    month,
    total_amount: total_amount || 0,
    applied_rules: applied_rules || [],
    auto_staff_ids: Array.isArray(auto_staff_ids) ? auto_staff_ids : [],
    manual_staff_ids: Array.isArray(manual_staff_ids) ? manual_staff_ids : [],
  };
  if (typeof is_locked === 'boolean') {
    upsertPayload.is_locked = is_locked;
  }

  const { data, error } = await supabase
    .from('department_monthly_totals')
    .upsert(upsertPayload, { onConflict: 'department_id,month' })
    .select()
    .single();

  if (error) {
    console.error("Supabase upsert error in monthly-totals:", error);
    return NextResponse.json({ error: error.message || error }, { status: 500 });
  }
  invalidateReportCache();
  return NextResponse.json(data);
}
