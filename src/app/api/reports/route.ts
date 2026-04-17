import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { getReportCache, setReportCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get('department_id');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (!deptId || !year || !month) {
    return NextResponse.json({ error: 'department_id, year, and month required' }, { status: 400 });
  }

  const monthStr = `${year}-${String(parseInt(month)).padStart(2, '0')}`;
  const cachedData = getReportCache(deptId, monthStr);
  if (cachedData) {
    return NextResponse.json(cachedData);
  }

  const supabase = await createClient();

  const y = parseInt(year);
  const m = parseInt(month);
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  // Fetch department name, monthly total, income data, and work entries ALL in parallel
  const [deptRes, deptTotalRes, incomeRes, workEntriesRes, otCasesRes] = await Promise.all([
    supabase.from('departments').select('name').eq('id', deptId).single(),
    supabase.from('department_monthly_totals').select('total_amount').eq('department_id', deptId).eq('month', monthStr).maybeSingle(),
    supabase.from('daily_income').select('amount').eq('department_id', deptId).gte('date', startDate).lt('date', endDate),
    supabase.from('staff_work_entries').select('*').eq('department_id', deptId).gte('date', startDate).lt('date', endDate).order('date'),
    // Also check if this dept has OT cases (for income calculation)
    supabase.from('ot_cases').select('amount').eq('department_id', deptId).eq('month', monthStr),
  ]);

  const mainDeptName = deptRes.data?.name || 'Unknown';

  // Get all daily results for this dept in this month
  const { data: results, error } = await supabase
    .from('daily_results')
    .select('*, staff(*, departments(name))')
    .eq('department_id', deptId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filteredResults = results || [];

  // Aggregate by staff
  const staffTotals: Record<string, any> = {};

  // Build set of dates present for each staff to avoid double counting for daily rules
  const presentDates: Record<string, Set<string>> = {};

  for (const r of filteredResults) {
    const breakdownObj = r.breakdown as Record<string, any> | null;
    const isAddon = breakdownObj?.type === 'addon_share' || !!breakdownObj?.addon_department;
    
    if (!staffTotals[r.staff_id]) {
      staffTotals[r.staff_id] = {
        staff_id: r.staff_id,
        staff_name: r.staff?.name || 'Unknown',
        role: r.staff?.role || 'Unknown',
        origin_department: mainDeptName,
        total_share: 0,
        days_present: 0,
        daily_details: [],
        work_entries: [],
        rule_entries: [],
        // OT case-type breakdown fields
        major_cases: 0,
        minor_cases: 0,
        major_base: 0,
        minor_base: 0,
        combined_working_amount: 0,
        ot_mode: '',
        ot_group_count: 0,
        raw_cases: [],
        // Addon tracking
        addon_contributions: [] as { department: string; share: number; pct: string; attendance: string; note: string }[],
      };
      presentDates[r.staff_id] = new Set();
    }
    
    // Extract OT case-type breakdown from stored breakdown (ot_core type)
    if (breakdownObj?.type === 'ot_core' && breakdownObj?.case_details) {
      const caseDetails = breakdownObj.case_details as Record<string, any>;
      for (const [key, val] of Object.entries(caseDetails)) {
        const caseType = key.split(' (')[0]; // "Major (Doctor)" → "Major"
        if (caseType === 'Major') {
          staffTotals[r.staff_id].major_cases += (val.entries?.length || 0);
          staffTotals[r.staff_id].major_base += (val.total_amount || 0);
        } else if (caseType === 'Minor') {
          staffTotals[r.staff_id].minor_cases += (val.entries?.length || 0);
          staffTotals[r.staff_id].minor_base += (val.total_amount || 0);
        }
      }
      staffTotals[r.staff_id].combined_working_amount = r.income_amount || 0;
      staffTotals[r.staff_id].ot_mode = breakdownObj.distribution || '';
      staffTotals[r.staff_id].ot_group_count = breakdownObj.presentInRole || 0;
      if (breakdownObj.raw_cases) {
        staffTotals[r.staff_id].raw_cases = breakdownObj.raw_cases;
      }
      // Set origin to main dept for staff with core OT work
      staffTotals[r.staff_id].origin_department = mainDeptName;
    }

    // Track addon contributions for combined display
    if (isAddon && breakdownObj) {
      staffTotals[r.staff_id].addon_contributions.push({
        department: breakdownObj.addon_department || 'Unknown',
        share: r.final_share,
        pct: breakdownObj.addon_pct || breakdownObj.percentage || '0%',
        attendance: breakdownObj.attendance_rule || 'none',
        note: breakdownObj.note || '',
        pool: breakdownObj.pool_after_pct || breakdownObj.addon_pool || 0,
        base_amount: breakdownObj.base_amount || 0,
        adjusted_base: breakdownObj.adjusted_base || 0,
        present_days: breakdownObj.present_days ?? 0,
        total_days: breakdownObj.total_days ?? 0,
        absent_days: breakdownObj.absent_days ?? 0,
        present_count: r.present_count || 1,
        distribution_type: breakdownObj.distribution_type || 'individual',
        amount_source: breakdownObj.amount_source || 'TDA',
        manual_amount: breakdownObj.manual_amount || null,
      });
      // If this staff ONLY has addon entries (no core OT), use addon dept name
      if (!staffTotals[r.staff_id].combined_working_amount && staffTotals[r.staff_id].origin_department === mainDeptName) {
        staffTotals[r.staff_id].origin_department = breakdownObj.addon_department || mainDeptName;
      }
    }
    
    staffTotals[r.staff_id].total_share += r.final_share;
    
    const breakdown = r.breakdown as Record<string, any> | null;
    const ruleInBreakdown = breakdown?.attendance_rule as string | undefined;

    if (ruleInBreakdown === 'monthly' && breakdown?.present_days !== undefined) {
      staffTotals[r.staff_id].days_present = Number(breakdown.present_days);
    } else if (ruleInBreakdown === 'none') {
      staffTotals[r.staff_id].days_present = -1;
    } else if (staffTotals[r.staff_id].days_present >= 0) {
      presentDates[r.staff_id].add(r.date);
      staffTotals[r.staff_id].days_present = presentDates[r.staff_id].size;
    }

    staffTotals[r.staff_id].daily_details.push({
      date: r.date,
      share: r.final_share,
      type: r.calculation_type,
      note: (r.breakdown as Record<string, unknown> | null)?.note as string || null,
    });

    if (r.calculation_type === 'work_entry') {
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

  // Apply sorting rules
  const aggregated = Object.values(staffTotals).sort((a: any, b: any) => {
    const aIsMain = a.origin_department === mainDeptName;
    const bIsMain = b.origin_department === mainDeptName;

    // 1. Priority: Main Department Staff First
    if (aIsMain && !bIsMain) return -1;
    if (!aIsMain && bIsMain) return 1;

    // 2. Within Main Department: Doctors First, then others, all by Amount DESC
    if (aIsMain && bIsMain) {
      const aIsDoctor = a.role.toLowerCase().includes('doctor');
      const bIsDoctor = b.role.toLowerCase().includes('doctor');
      
      if (aIsDoctor && !bIsDoctor) return -1;
      if (!aIsDoctor && bIsDoctor) return 1;

      return b.total_share - a.total_share;
    }

    // 3. For Add-On Departments: group by dept name (alphabetical), then by amount DESC
    if (a.origin_department !== b.origin_department) {
      return a.origin_department.localeCompare(b.origin_department);
    }
    return b.total_share - a.total_share;
  });

  // Compute total income
  // If department has OT cases, use OT income. Otherwise use monthly total / daily income.
  const otIncome = (otCasesRes.data || []).reduce((s: number, c: any) => s + (parseFloat(c.amount) || 0), 0);
  let totalIncome = 0;
  if (otIncome > 0) {
    totalIncome = otIncome;
  } else {
    totalIncome = Number(deptTotalRes.data?.total_amount) || 0;
    if (totalIncome <= 0) {
      totalIncome = (incomeRes.data || []).reduce((s: number, d: any) => s + (d.amount || 0), 0);
    }
  }

  const totalDistributed = aggregated.reduce((s: number, a: any) => s + a.total_share, 0);

  const workEntries = workEntriesRes.data;

  const workLookup: Record<string, Record<string, any[]>> = {};
  for (const w of (workEntries || [])) {
    if (!workLookup[w.staff_id]) workLookup[w.staff_id] = {};
    if (!workLookup[w.staff_id][w.date]) workLookup[w.staff_id][w.date] = [];
    workLookup[w.staff_id][w.date].push({
      description: w.description || 'Work Entry',
      amount: w.amount,
      percentage: w.percentage,
    });
  }

  // Enhance staff data
  for (const staff of aggregated) {
    const staffWorkLookup = workLookup[staff.staff_id] || {};
    const enhancedWorkEntries: any[] = [];
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

  const result = {
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
  };

  setReportCache(deptId, monthStr, result);

  return NextResponse.json(result);
}
