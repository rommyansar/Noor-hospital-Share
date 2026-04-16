import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { invalidateReportCache } from '@/lib/cache';

/**
 * GET /api/monthly-status?month=YYYY-MM
 * Returns the global review status for a month.
 * Note: Also accepts legacy `department_id` param but ignores it (global now).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM

  if (!month) {
    return NextResponse.json({ error: 'month required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('monthly_attendance_status')
    .select('*')
    .eq('month', month)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || { is_reviewed: false, is_locked: false });
}

/**
 * POST /api/monthly-status
 * Set the global review status and lock status for a month.
 * Body: { month, is_reviewed?, is_locked? }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const upsertPayload: Record<string, any> = {
    month: body.month,
  };
  if (typeof body.is_reviewed === 'boolean') {
    upsertPayload.is_reviewed = body.is_reviewed;
  }
  if (typeof body.is_locked === 'boolean') {
    upsertPayload.is_locked = body.is_locked;
  }

  const { data, error } = await supabase
    .from('monthly_attendance_status')
    .upsert(upsertPayload, { onConflict: 'month' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateReportCache();
  return NextResponse.json(data);
}
