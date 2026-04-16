import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_income')
    .select('date')
    .limit(1);

  return NextResponse.json({ error, dateOutput: data?.[0]?.date, data });
}
