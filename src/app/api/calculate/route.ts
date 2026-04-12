import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import {
  parsePercentage,
  computeIndividualShare,
  computeGroupShare,
  computePoolAmount,
  computeWorkEntryShare,
} from '@/lib/calculate';

function getDaysInMonth(yearStr: string, monthStr: string) {
  return new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { month, department_id } = body;

  if (!month) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  // Parse year/month
  const [yearStr, monthNumStr] = month.split('-');
  const daysInMonth = getDaysInMonth(yearStr, monthNumStr);

  // Determine which departments to process
  let deptsToProcess: { id: string, name: string }[] = [];
  if (department_id && department_id !== 'all') {
    const { data: dept } = await supabase.from('departments').select('id, name').eq('id', department_id).single();
    if (dept) deptsToProcess.push(dept);
    else return NextResponse.json({ error: 'Department not found' }, { status: 400 });
  } else {
    const { data: allDepts } = await supabase.from('departments').select('id, name').eq('is_active', true);
    if (allDepts) deptsToProcess = allDepts;
  }

  // Loop over each department
  let totalDistributed = 0;

  for (const dept of deptsToProcess) {
    // 1. Check if reviewed
    const { data: status } = await supabase
      .from('monthly_attendance_status')
      .select('is_reviewed')
      .eq('department_id', dept.id)
      .eq('month', month)
      .maybeSingle();

    if (!status?.is_reviewed) {
      return NextResponse.json({ error: `Attendance for ${dept.name} is not reviewed yet.` }, { status: 400 });
    }

    // 2. Fetch required data for the whole month for this department
    const { data: incomesData } = await supabase.from('daily_income').select('*').eq('department_id', dept.id).like('date', `${month}-%`);
    const { data: leavesData } = await supabase.from('staff_leaves').select('*').eq('department_id', dept.id).like('date', `${month}-%`);
    const { data: workData } = await supabase.from('staff_work_entries').select('*').eq('department_id', dept.id).like('date', `${month}-%`);
    const { data: rulesData } = await supabase.from('department_rules').select('*').eq('department_id', dept.id).eq('is_active', true);
    const { data: staffData } = await supabase.from('staff').select('*').eq('department_id', dept.id).eq('is_active', true);

    if (!staffData || staffData.length === 0) continue;

    const incomesByDate: Record<string, number> = {};
    if (incomesData) incomesData.forEach(d => { incomesByDate[d.date] = d.amount; });

    const leavesByDate: Record<string, Set<string>> = {};
    if (leavesData) leavesData.forEach(l => {
      if (!leavesByDate[l.date]) leavesByDate[l.date] = new Set();
      leavesByDate[l.date].add(l.staff_id);
    });

    const workByDateAndStaff: Record<string, Record<string, any[]>> = {};
    if (workData) workData.forEach(w => {
      if (!workByDateAndStaff[w.date]) workByDateAndStaff[w.date] = {};
      if (!workByDateAndStaff[w.date][w.staff_id]) workByDateAndStaff[w.date][w.staff_id] = [];
      workByDateAndStaff[w.date][w.staff_id].push(w);
    });

    const ruleMap: Record<string, any> = {};
    if (rulesData) rulesData.forEach(r => { ruleMap[r.role] = r; });

    const newResults: any[] = [];

    // Calculate day by day
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const dayData = incomesData?.find(d => d.date === dateStr);
      const income = dayData?.amount || 0;
      
      const onLeaveSet = leavesByDate[dateStr] || new Set();
      
      // Compute present staff for this specific day
      let presentStaff = [];
      if (dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids)) {
        // If explicitly set via the new manual selector, use ONLY those staff and ensure they aren't on leave
        presentStaff = staffData.filter(s => dayData.present_staff_ids.includes(s.id) && !onLeaveSet.has(s.id));
      } else {
        // Fallback: everyone minus those on leave
        presentStaff = staffData.filter(s => !onLeaveSet.has(s.id));
      }
      
      if (presentStaff.length === 0) continue;

      const presentCountByRole: Record<string, number> = {};
      for (const s of presentStaff) {
        presentCountByRole[s.role] = (presentCountByRole[s.role] || 0) + 1;
      }

      // 1. Process all work entries (manual overrides/cross-dept) for this day FIRST
      const dayWorkEntries = workData?.filter(w => w.date === dateStr) || [];
      let manualDeductions = 0;
      
      // Group work entries by staff
      const workByStaff = dayWorkEntries.reduce((acc, w) => {
        if (!acc[w.staff_id]) acc[w.staff_id] = [];
        acc[w.staff_id].push(w);
        return acc;
      }, {} as Record<string, { amount: number; percentage: string; }[]>);

      for (const [staffId, rawEntries] of Object.entries(workByStaff)) {
        const entries = rawEntries as { amount: number; percentage: string; }[];
        const share = computeWorkEntryShare(entries);
        newResults.push({
            staff_id: staffId, department_id: dept.id, date: dateStr,
            income_amount: income, // Gross income before deduction
            calculation_type: 'work_entry', rule_percentage: null,
            distribution_type: null, pool_amount: 0, present_count: 1, final_share: share,
            breakdown: { entries, total: share, type: 'manual_override' },
        });
        manualDeductions += share;
        totalDistributed += share;
      }

      // 2. Adjust income pool for regular rules
      const adjustedIncome = Math.max(0, income - manualDeductions);

      // 3. Process primary staff regular rules
      for (const staff of presentStaff) {
        // Skip if this staff had a manual work entry
        if (workByStaff[staff.id]) continue;

        const rule = ruleMap[staff.role];
        if (!rule) {
            newResults.push({
            staff_id: staff.id, department_id: dept.id, date: dateStr, income_amount: adjustedIncome, calculation_type: 'rule',
            rule_percentage: '0', distribution_type: 'individual', pool_amount: 0, present_count: 1, final_share: 0,
            breakdown: { note: `No rule defined for role: ${staff.role}` }
          });
          continue;
        }

        const pctStr = rule.percentage;
        const distType = rule.distribution_type;
        let share = 0;
        let poolAmount = 0;
        let presentCount = 1;

        if (distType === 'group') {
          // Note: presentCountByRole includes staff with manual overrides. 
          // We leave them in the count so group division remains accurate across the role pool.
          presentCount = presentCountByRole[staff.role] || 1;
          share = computeGroupShare(adjustedIncome, pctStr, presentCount);
          poolAmount = computePoolAmount(adjustedIncome, pctStr);
        } else {
          share = computeIndividualShare(adjustedIncome, pctStr);
        }

        newResults.push({
          staff_id: staff.id, department_id: dept.id, date: dateStr, income_amount: adjustedIncome, calculation_type: 'rule',
          rule_percentage: pctStr, distribution_type: distType, pool_amount: poolAmount, present_count: presentCount,
          final_share: share, breakdown: { role: staff.role, percentage: `${parsePercentage(pctStr)}%`, distribution: distType, presentInRole: presentCount, gross_income: income, manual_deductions: manualDeductions }
        });
        totalDistributed += share;
      }
    }

    // Delete old results for this dept and month
    await supabase.from('daily_results').delete().eq('department_id', dept.id).like('date', `${month}-%`);

    // Insert new results in chunks (max 1000 items per chunk)
    const chunkSize = 1000;
    for (let i = 0; i < newResults.length; i += chunkSize) {
       const chunk = newResults.slice(i, i + chunkSize);
       const { error } = await supabase.from('daily_results').insert(chunk);
       if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    message: department_id === 'all' ? 'Overall calculation completed' : 'Department calculation completed',
    total_distributed: totalDistributed
  });
}
