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

// POST /api/lock — lock or unlock a month
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = getSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { year, month, action } = await request.json(); // action: 'lock' | 'unlock'
  const lockState = action === 'lock';

  await supabase.from('monthly_income').update({ is_locked: lockState }).eq('year', year).eq('month', month);
  await supabase.from('monthly_results').update({ is_locked: lockState }).eq('year', year).eq('month', month);

  // Audit
  await supabase.from('audit_log').insert({
    table_name: 'monthly_results',
    action: action,
    new_values: { year, month },
    performed_by: user.id,
  });

  return NextResponse.json({ success: true });
}
