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

  // ── Check GLOBAL attendance review status ──
  const { data: globalStatus } = await supabase
    .from('monthly_attendance_status')
    .select('is_reviewed')
    .eq('month', month)
    .maybeSingle();

  if (!globalStatus?.is_reviewed) {
    return NextResponse.json({ error: `Attendance for ${month} is not reviewed yet.` }, { status: 400 });
  }

  // Determine which departments to process
  let deptsToProcess: { id: string, name: string, include_general_staff: boolean }[] = [];
  if (department_id && department_id !== 'all') {
    const { data: dept } = await supabase.from('departments').select('id, name, include_general_staff').eq('id', department_id).single();
    if (dept) deptsToProcess.push(dept);
    else return NextResponse.json({ error: 'Department not found' }, { status: 400 });
  } else {
    const { data: allDepts } = await supabase.from('departments').select('id, name, include_general_staff').eq('is_active', true);
    if (allDepts) deptsToProcess = allDepts;
  }

  // ── Fetch ALL general staff once (shared across departments) ──
  const { data: allGeneralStaff } = await supabase
    .from('staff')
    .select('*')
    .eq('is_general', true)
    .eq('is_active', true);

  const generalStaffList = allGeneralStaff || [];

  // ── Fetch ALL leaves for this month GLOBALLY (no department_id) ──
  const { data: allLeavesData } = await supabase
    .from('staff_leaves')
    .select('*')
    .gte('date', `${month}-01`)
    .lt('date', monthNumStr === '12'
      ? `${parseInt(yearStr) + 1}-01-01`
      : `${yearStr}-${String(parseInt(monthNumStr) + 1).padStart(2, '0')}-01`
    );

  // Build global leave map: date → Set of staff_ids on leave
  const globalLeavesByDate: Record<string, Set<string>> = {};
  if (allLeavesData) {
    for (const l of allLeavesData) {
      if (!globalLeavesByDate[l.date]) globalLeavesByDate[l.date] = new Set();
      globalLeavesByDate[l.date].add(l.staff_id);
    }
  }

  // Loop over each department
  let totalDistributed = 0;

  for (const dept of deptsToProcess) {
    // Fetch required data for the whole month for this department
    const { data: incomesData } = await supabase.from('daily_income').select('*').eq('department_id', dept.id).like('date', `${month}-%`);
    const { data: workData } = await supabase.from('staff_work_entries').select('*').eq('department_id', dept.id).like('date', `${month}-%`);
    const { data: rulesData } = await supabase.from('department_rules').select('*').eq('department_id', dept.id).eq('is_active', true);
    const { data: primaryStaffData } = await supabase.from('staff').select('*').eq('department_id', dept.id).eq('is_active', true);

    // ── Merge general staff if enabled for this department ──
    let staffData = primaryStaffData || [];
    if (dept.include_general_staff && generalStaffList.length > 0) {
      // Add general staff who are NOT already in this department (avoid duplicates)
      const deptStaffIds = new Set(staffData.map(s => s.id));
      const eligibleGeneralStaff = generalStaffList.filter(gs => !deptStaffIds.has(gs.id));
      staffData = [...staffData, ...eligibleGeneralStaff];
    }

    if (staffData.length === 0) continue;

    const ruleMap: Record<string, any> = {};
    if (rulesData) rulesData.forEach(r => { ruleMap[r.role] = r; });

    const newResults: any[] = [];

    // Calculate day by day
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const dayData = incomesData?.find(d => d.date === dateStr);
      const income = dayData?.amount || 0;
      
      // ── GLOBAL leave set for this date ──
      const onLeaveSet = globalLeavesByDate[dateStr] || new Set();
      
      // Compute present staff for this specific day
      let presentStaff = [];
      if (dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids)) {
        // If explicitly set via the manual selector, use ONLY those staff and ensure they aren't on leave
        const explicitIds = new Set(dayData.present_staff_ids as string[]);
        const primaryPresent = (primaryStaffData || []).filter(s => explicitIds.has(s.id) && !onLeaveSet.has(s.id));
        
        // General staff: present unless on leave (they're not tracked in present_staff_ids since it's dept-specific)
        let generalPresent: typeof generalStaffList = [];
        if (dept.include_general_staff) {
          const deptStaffIds = new Set((primaryStaffData || []).map(s => s.id));
          generalPresent = generalStaffList.filter(gs => !deptStaffIds.has(gs.id) && !onLeaveSet.has(gs.id));
        }
        
        presentStaff = [...primaryPresent, ...generalPresent];
      } else {
        // Fallback: everyone minus those on leave
        presentStaff = staffData.filter(s => !onLeaveSet.has(s.id));
      }
      
      if (presentStaff.length === 0) continue;

      const presentCountByRole: Record<string, number> = {};
      for (const s of presentStaff) {
        presentCountByRole[s.role] = (presentCountByRole[s.role] || 0) + 1;
      }

      // 1. Process all work entries for this day FIRST
      const dayWorkEntries = workData?.filter(w => w.date === dateStr) || [];
      let manualDeductions = 0;
      
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
            income_amount: income,
            calculation_type: 'work_entry', rule_percentage: null,
            distribution_type: null, pool_amount: 0, present_count: 1, final_share: share,
            breakdown: { entries, total: share, type: 'manual_override' },
        });
        manualDeductions += share;
        totalDistributed += share;
      }

      // 2. Adjust income pool for regular rules
      const adjustedIncome = Math.max(0, income - manualDeductions);

      // 3. Process staff via rules
      for (const staff of presentStaff) {
        if (workByStaff[staff.id]) continue;

        const rule = ruleMap[staff.role];
        if (!rule) {
            newResults.push({
            staff_id: staff.id, department_id: dept.id, date: dateStr, income_amount: adjustedIncome, calculation_type: 'rule',
            rule_percentage: '0', distribution_type: 'individual', pool_amount: 0, present_count: 1, final_share: 0,
            breakdown: { note: `No rule defined for role: ${staff.role}`, is_general: staff.is_general || false }
          });
          continue;
        }

        const pctStr = rule.percentage;
        const distType = rule.distribution_type;
        let share = 0;
        let poolAmount = 0;
        let presentCount = 1;

        if (distType === 'group') {
          presentCount = presentCountByRole[staff.role] || 1;
          share = computeGroupShare(adjustedIncome, pctStr, presentCount);
          poolAmount = computePoolAmount(adjustedIncome, pctStr);
        } else {
          share = computeIndividualShare(adjustedIncome, pctStr);
        }

        newResults.push({
          staff_id: staff.id, department_id: dept.id, date: dateStr, income_amount: adjustedIncome, calculation_type: 'rule',
          rule_percentage: pctStr, distribution_type: distType, pool_amount: poolAmount, present_count: presentCount,
          final_share: share, breakdown: { role: staff.role, percentage: `${parsePercentage(pctStr)}%`, distribution: distType, presentInRole: presentCount, gross_income: income, manual_deductions: manualDeductions, is_general: staff.is_general || false }
        });
        totalDistributed += share;
      }
    }

    // Delete old results for this dept and month
    await supabase.from('daily_results').delete().eq('department_id', dept.id).like('date', `${month}-%`);

    // Insert new results in chunks
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
