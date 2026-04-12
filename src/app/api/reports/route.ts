import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (!deptId || !year || !month) {
    return NextResponse.json({ error: 'department_id, year, and month required' }, { status: 400 });
  }

  const y = parseInt(year);
  const m = parseInt(month);
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  // Get all daily results for this dept in this month
  const { data: results, error } = await supabase
    .from('daily_results')
    .select('*, staff(*)')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by staff
  const staffTotals: Record<string, {
    staff_id: string;
    staff_name: string;
    role: string;
    total_share: number;
    days_present: number;
    daily_details: { date: string; share: number; type: string }[];
  }> = {};

  for (const r of (results || [])) {
    if (!staffTotals[r.staff_id]) {
      staffTotals[r.staff_id] = {
        staff_id: r.staff_id,
        staff_name: r.staff?.name || 'Unknown',
        role: r.staff?.role || 'Unknown',
        total_share: 0,
        days_present: 0,
        daily_details: [],
      };
    }
    staffTotals[r.staff_id].total_share += r.final_share;
    staffTotals[r.staff_id].days_present += 1;
    staffTotals[r.staff_id].daily_details.push({
      date: r.date,
      share: r.final_share,
      type: r.calculation_type,
    });
  }

  // Sort by total share descending
  const aggregated = Object.values(staffTotals).sort((a, b) => b.total_share - a.total_share);

  // Also get daily income totals
  const { data: incomeData } = await supabase
    .from('daily_income')
    .select('*')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate);

  const totalIncome = (incomeData || []).reduce((s, d) => s + (d.amount || 0), 0);
  const totalDistributed = aggregated.reduce((s, a) => s + a.total_share, 0);

  return NextResponse.json({
    department_id: deptId,
    year: y,
    month: m,
    total_income: Math.round(totalIncome * 100) / 100,
    total_distributed: Math.round(totalDistributed * 100) / 100,
    staff_count: aggregated.length,
    staff: aggregated.map((s) => ({
      ...s,
      total_share: Math.round(s.total_share * 100) / 100,
    })),
  });
}
