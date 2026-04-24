import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { invalidateReportCache } from '@/lib/cache';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('department_id');
  const month = searchParams.get('month');

  if (!departmentId) return NextResponse.json({ error: 'Missing department_id' }, { status: 400 });

  const supabase = await createClient();
  let query = supabase
    .from('monthly_department_addons')
    .select('*')
    .eq('department_id', departmentId);

  if (month) {
    query = query.eq('month', month);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { department_id, month, addons } = body;

  if (!department_id || !month) {
    return NextResponse.json({ error: 'Missing department_id or month' }, { status: 400 });
  }

  // Delete existing addons for this department and month first to handle updates
  const { error: deleteError } = await supabase
    .from('monthly_department_addons')
    .delete()
    .eq('department_id', department_id)
    .eq('month', month);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (!addons || !Array.isArray(addons) || addons.length === 0) {
    invalidateReportCache();
    return NextResponse.json({ message: 'Addons cleared' });
  }

  // Insert new addons with applied_rules and attendance_rule
  const entriesToInsert = addons.map((a: any) => ({
    department_id,
    month,
    addon_department_id: a.addon_department_id,
    percentage: a.percentage || 0,
    attendance_rule: a.attendance_rule || 'none',
    applied_rules: a.applied_rules || [],
    amount_source: a.amount_source || 'TDA',
    manual_amount: a.manual_amount || null,
    custom_heading: a.custom_heading || null,
  }));

  // Try insert with custom_heading; if column doesn't exist yet, retry without it
  let { data, error } = await supabase
    .from('monthly_department_addons')
    .insert(entriesToInsert)
    .select();

  if (error && error.message?.includes('custom_heading')) {
    // Column doesn't exist yet — strip it and retry
    const fallbackEntries = entriesToInsert.map(({ custom_heading, ...rest }: any) => rest);
    const fallbackResult = await supabase
      .from('monthly_department_addons')
      .insert(fallbackEntries)
      .select();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  invalidateReportCache();
  return NextResponse.json(data);
}
