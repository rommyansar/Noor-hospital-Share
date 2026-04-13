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
    work_entries: {
      date: string;
      description: string;
      work_amount: number;
      percentage: string;
      calculated_share: number;
    }[];
    rule_entries: {
      date: string;
      income_amount: number;
      percentage: string;
      distribution_type: string;
      present_count: number;
      calculated_share: number;
    }[];
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
        work_entries: [],
        rule_entries: [],
      };
    }
    staffTotals[r.staff_id].total_share += r.final_share;
    staffTotals[r.staff_id].days_present += 1;
    staffTotals[r.staff_id].daily_details.push({
      date: r.date,
      share: r.final_share,
      type: r.calculation_type,
    });

    const breakdown = r.breakdown as Record<string, unknown> | null;

    if (r.calculation_type === 'work_entry') {
      // Extract individual work entries from the breakdown
      const entries = (breakdown?.entries || []) as { amount: number; percentage: string }[];
      for (const entry of entries) {
        const pct = parseFloat(entry.percentage || '0') || 0;
        const calcShare = Math.round((entry.amount * pct / 100) * 100) / 100;
        staffTotals[r.staff_id].work_entries.push({
          date: r.date,
          description: (entry as Record<string, unknown>).description as string || 'Work Entry',
          work_amount: entry.amount,
          percentage: entry.percentage,
          calculated_share: calcShare,
        });
      }
    } else {
      // Rule-based entry
      staffTotals[r.staff_id].rule_entries.push({
        date: r.date,
        income_amount: r.income_amount,
        percentage: r.rule_percentage || '0',
        distribution_type: r.distribution_type || 'individual',
        present_count: r.present_count || 1,
        calculated_share: r.final_share,
      });
    }
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

  // Also fetch actual work entry descriptions from staff_work_entries for this month
  const { data: workEntries } = await supabase
    .from('staff_work_entries')
    .select('*')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');

  // Build a lookup: staff_id -> date -> entries
  const workLookup: Record<string, Record<string, { description: string; amount: number; percentage: string }[]>> = {};
  for (const w of (workEntries || [])) {
    if (!workLookup[w.staff_id]) workLookup[w.staff_id] = {};
    if (!workLookup[w.staff_id][w.date]) workLookup[w.staff_id][w.date] = [];
    workLookup[w.staff_id][w.date].push({
      description: w.description || 'Work Entry',
      amount: w.amount,
      percentage: w.percentage,
    });
  }

  // Enhance staff data with actual descriptions from work entries
  for (const staff of aggregated) {
    const staffWorkLookup = workLookup[staff.staff_id] || {};
    // Replace work_entries with actual data from staff_work_entries table
    const enhancedWorkEntries: typeof staff.work_entries = [];
    for (const dateKey of Object.keys(staffWorkLookup)) {
      for (const entry of staffWorkLookup[dateKey]) {
        const pct = parseFloat(entry.percentage || '0') || 0;
        const calcShare = Math.round((entry.amount * pct / 100) * 100) / 100;
        enhancedWorkEntries.push({
          date: dateKey,
          description: entry.description,
          work_amount: entry.amount,
          percentage: entry.percentage,
          calculated_share: calcShare,
        });
      }
    }
    if (enhancedWorkEntries.length > 0) {
      staff.work_entries = enhancedWorkEntries;
    }
  }

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
