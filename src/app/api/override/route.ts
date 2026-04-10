import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    }
  );
}

// POST /api/override — manual override for a staff result
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = getSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { result_id, override_amount, reason } = await request.json();

  if (!result_id || override_amount == null || !reason || reason.trim() === '') {
    return NextResponse.json({ error: 'Result ID, override amount, and reason are required.' }, { status: 400 });
  }

  // Get old value for audit
  const { data: oldResult } = await supabase.from('monthly_results').select('*').eq('id', result_id).single();
  if (!oldResult) return NextResponse.json({ error: 'Result not found.' }, { status: 404 });
  if (oldResult.is_locked) return NextResponse.json({ error: 'Month is locked.' }, { status: 400 });

  const { error } = await supabase.from('monthly_results').update({
    manual_override: override_amount,
    override_reason: reason,
  }).eq('id', result_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit
  await supabase.from('audit_log').insert({
    table_name: 'monthly_results',
    record_id: result_id,
    action: 'override',
    old_values: { final_share: oldResult.final_share, manual_override: oldResult.manual_override },
    new_values: { manual_override: override_amount, override_reason: reason },
    performed_by: user.id,
  });

  return NextResponse.json({ success: true });
}
