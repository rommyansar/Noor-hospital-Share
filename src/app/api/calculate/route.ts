import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { acquireCalculationLock, releaseCalculationLock, invalidateReportCache } from '@/lib/cache';
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

function getStaffPercentage(staff: any, deptId: string, rulePercentage: string): string {
  if (staff.department_percentages && typeof staff.department_percentages === 'object') {
    const override = staff.department_percentages[deptId];
    if (override && String(override).trim() !== '') {
      return String(override).trim();
    }
  }
  return rulePercentage;
}

// ============================================================
// UNIFIED ADD-ON PROCESSING FUNCTION
// ============================================================
// Add-On departments are DEPENDENT share receivers.
// Their share is ALWAYS calculated from the MAIN department's income.
// Flow:
//   pool = main_income × addon_percentage
//   For each addon staff member (matched by role to addon dept's rules):
//     Individual: share = pool × role_percentage
//     Group: role_pool = pool × role_percentage → share = role_pool / staff_count_in_role
//   Attendance applied based on addon entry's attendance_rule (not dept global).
// ============================================================
async function processAddons(
  supabase: any,
  mainDeptId: string,
  mainDeptName: string,
  mainIncome: number,
  month: string,
  daysInMonth: number,
  globalLeavesByDate: Record<string, Set<string>>,
): Promise<{ results: any[]; totalAddonDeduction: number }> {
  const results: any[] = [];
  let totalAddonDeduction = 0;

  // Fetch addon configurations for this main department and month
  const { data: addonConfigs } = await supabase
    .from('monthly_department_addons')
    .select('*')
    .eq('department_id', mainDeptId)
    .eq('month', month);

  const addons = (addonConfigs || []) as any[];
  if (addons.length === 0 || mainIncome <= 0) return { results, totalAddonDeduction };

  // Pre-fetch all addon data in parallel (fixes N+1 query problem)
  const validAddons = addons.filter(a => a.addon_department_id && (Number(a.percentage) || 0) > 0);
  const addonDeptIds = validAddons.map(a => a.addon_department_id);

  // Batch fetch all addon staff, rules, and department names in parallel
  const [allAddonStaffRes, allAddonRulesRes, allAddonDeptsRes] = await Promise.all([
    addonDeptIds.length > 0
      ? supabase.from('staff').select('*').eq('is_active', true)
      : Promise.resolve({ data: [] }),
    addonDeptIds.length > 0
      ? supabase.from('department_rules').select('*').in('department_id', addonDeptIds).eq('is_active', true)
      : Promise.resolve({ data: [] }),
    addonDeptIds.length > 0
      ? supabase.from('departments').select('id, name').in('id', addonDeptIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Build lookup maps from batch results
  const allStaff = (allAddonStaffRes.data || []) as any[];
  const addonStaffByDept: Record<string, any[]> = {};
  for (const deptId of addonDeptIds) {
    addonStaffByDept[deptId] = allStaff.filter(s => (s.department_ids || []).includes(deptId));
  }

  const allAddonRules = (allAddonRulesRes.data || []) as any[];
  const addonRulesByDept: Record<string, any[]> = {};
  for (const r of allAddonRules) {
    if (!addonRulesByDept[r.department_id]) addonRulesByDept[r.department_id] = [];
    addonRulesByDept[r.department_id].push(r);
  }

  const addonDeptNames: Record<string, string> = {};
  for (const d of (allAddonDeptsRes.data || [])) {
    addonDeptNames[(d as any).id] = (d as any).name;
  }

  for (const addon of validAddons) {
    const addonDeptId = addon.addon_department_id;
    const addonPct = Number(addon.percentage) || 0;
    const attRule: 'daily' | 'monthly' | 'none' = addon.attendance_rule || 'none';
    const appliedRules: string[] = Array.isArray(addon.applied_rules) ? addon.applied_rules : [];

    // Pool from MAIN department income
    const pool = Math.round(mainIncome * (addonPct / 100) * 100) / 100;
    totalAddonDeduction += pool;

    const staffList = addonStaffByDept[addonDeptId] || [];
    const addonRules = addonRulesByDept[addonDeptId] || [];
    const ruleMap: Record<string, any> = {};
    for (const r of addonRules) {
      if (appliedRules.length === 0 || appliedRules.includes(r.id)) {
        ruleMap[r.role.toUpperCase().trim()] = r;
      }
    }

    if (staffList.length === 0) continue;

    const addonDeptName = addonDeptNames[addonDeptId] || 'Unknown';

    // Count staff per role (for group distribution)
    const roleCounts: Record<string, number> = {};
    for (const s of staffList) {
      const rk = s.role.toUpperCase().trim();
      roleCounts[rk] = (roleCounts[rk] || 0) + 1;
    }

    // Count absent days per staff
    const getAbsentDays = (staffId: string): number => {
      let absent = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        if (globalLeavesByDate[dateStr]?.has(staffId)) absent++;
      }
      return absent;
    };

    for (const staff of staffList) {
      const userRole = staff.role.toUpperCase().trim();
      const rule = ruleMap[userRole];
      if (!rule) continue;

      const overridePct = staff.department_percentages?.[addonDeptId];
      const effectivePct = (overridePct && String(overridePct).trim() !== '') ? parseFloat(String(overridePct)) : (parseFloat(rule.percentage) || 0);

      // Always use rule's distribution_type — not addon config
      const distType = rule.distribution_type || 'individual';
      const attRule = addon.attendance_rule || 'none';

      const absentDays = getAbsentDays(staff.id);
      const presentDays = daysInMonth - absentDays;
      const presentCount = distType === 'group' ? (roleCounts[userRole] || 1) : 1;

      // ── CORRECT ADD-ON SEQUENCE: TDA → Add-On% → Attendance → Group ──

      // Step 1: pool = mainIncome × addonPct (already computed above as `pool`)
      // Step 2: Apply attendance reduction per staff
      let adjustedPool = pool;
      let noteExtra = '';
      if ((attRule === 'monthly' || attRule === 'daily') && daysInMonth > 0) {
        const ratio = presentDays / daysInMonth;
        adjustedPool = Math.round(pool * ratio * 100) / 100;
        noteExtra = ` (Prorated ${presentDays}/${daysInMonth})`;
      } else {
        noteExtra = ' (No attendance)';
      }

      // Step 3: Apply group distribution (divide by total staff in role)
      let share = 0;
      if (distType === 'group') {
        share = Math.round((adjustedPool / presentCount) * 100) / 100;
      } else {
        share = adjustedPool;
      }

      const pctStrDisplay = addonPct.toString();

      if (share > 0) {
        results.push({
          staff_id: staff.id,
          department_id: mainDeptId,
          date: `${month}-01`,
          income_amount: Math.round(mainIncome * (daysInMonth > 0 ? (presentDays / daysInMonth) : 1) * 100) / 100,
          calculation_type: 'rule',
          rule_percentage: pctStrDisplay,
          distribution_type: distType,
          pool_amount: pool,
          present_count: presentCount,
          final_share: share,
          breakdown: {
            role: staff.role,
            percentage: `${addonPct}%`,
            type: 'addon_share',
            note: `Add-on: ${addonDeptName} from ${mainDeptName}${noteExtra}`,
            addon_department: addonDeptName,
            addon_pct: `${addonPct}%`,
            addon_pool: pool,
            adjusted_pool: adjustedPool,
            distribution_type: distType,
            attendance_rule: attRule,
            total_days: daysInMonth,
            present_days: presentDays,
            absent_days: absentDays,
            prorate_ratio: attRule !== 'none' ? `${presentDays}/${daysInMonth}` : undefined,
          },
        });
      }
    }
  }

  return { results, totalAddonDeduction };
}


export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { month, department_id } = body;

  if (!month) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  // ── Calculation Lock Mechanism ──
  const lockKey = department_id === 'all' ? `calc_all_${month}` : `calc_dept_${department_id}_${month}`;
  if (!acquireCalculationLock(lockKey)) {
    return NextResponse.json({ error: 'Calculation already in progress. Please wait.' }, { status: 409 });
  }

  try {
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
  let deptsToProcess: { id: string; name: string; calculation_method: string; attendance_rule: string }[] = [];
  if (department_id && department_id !== 'all') {
    const { data: dept } = await supabase.from('departments').select('id, name, calculation_method, attendance_rule').eq('id', department_id).single();
    if (dept) deptsToProcess.push(dept);
    else return NextResponse.json({ error: 'Department not found' }, { status: 400 });
  } else {
    const { data: allDepts } = await supabase.from('departments').select('id, name, calculation_method, attendance_rule').eq('is_active', true);
    if (allDepts) deptsToProcess = allDepts;
  }

  // ── Fetch ALL leaves for this month GLOBALLY ──
  const { data: allLeavesData } = await supabase
    .from('staff_leaves')
    .select('*')
    .gte('date', `${month}-01`)
    .lt('date', monthNumStr === '12'
      ? `${parseInt(yearStr) + 1}-01-01`
      : `${yearStr}-${String(parseInt(monthNumStr) + 1).padStart(2, '0')}-01`
    );

  const globalLeavesByDate: Record<string, Set<string>> = {};
  if (allLeavesData) {
    for (const l of allLeavesData) {
      if (!globalLeavesByDate[l.date]) globalLeavesByDate[l.date] = new Set();
      globalLeavesByDate[l.date].add(l.staff_id);
    }
  }

  let totalDistributed = 0;
  const startDate = `${month}-01`;
  const endDate = monthNumStr === '12'
    ? `${parseInt(yearStr) + 1}-01-01`
    : `${yearStr}-${String(parseInt(monthNumStr) + 1).padStart(2, '0')}-01`;

  for (const dept of deptsToProcess) {
    // Fetch Department Total Amount, Applied Rules, and Lock status
    const { data: totalAmountRow } = await supabase
      .from('department_monthly_totals')
      .select('total_amount, applied_rules, is_locked')
      .eq('department_id', dept.id)
      .eq('month', month)
      .maybeSingle();

    // Skip locked departments (unless explicitly requested by ID)
    if (totalAmountRow?.is_locked && department_id === 'all') {
      continue;
    }

    const deptTotalAmount = Number(totalAmountRow?.total_amount) || 0;
    const appliedMainRules: string[] = Array.isArray(totalAmountRow?.applied_rules) ? totalAmountRow.applied_rules : [];

    // Fetch required data in parallel (was sequential — 4 round-trips → 1)
    const [{ data: incomesData }, { data: workData }, { data: rulesData }, { data: primaryStaffData }] = await Promise.all([
      supabase.from('daily_income').select('*').eq('department_id', dept.id).gte('date', startDate).lt('date', endDate),
      supabase.from('staff_work_entries').select('*').eq('department_id', dept.id).gte('date', startDate).lt('date', endDate),
      supabase.from('department_rules').select('*').eq('department_id', dept.id).eq('is_active', true),
      supabase.from('staff').select('*').contains('department_ids', [dept.id]).eq('is_active', true),
    ]);

    const ruleMap: Record<string, any> = {};
    if (rulesData) {
      rulesData.forEach((r: any) => {
        if (appliedMainRules.length === 0 || appliedMainRules.includes(r.id)) {
          ruleMap[r.role.toUpperCase().trim()] = r;
        }
      });
    }

    // Fetch overrides (Extra Staff manually added via UI)
    const { data: allOverrides } = await supabase
      .from('department_staff_amounts')
      .select('*')
      .eq('department_id', dept.id)
      .eq('month', month);

    const overrideMap = (allOverrides || []).reduce((acc: any, cur: any) => {
      acc[cur.staff_id] = cur;
      return acc;
    }, {});

    const overrideStaffIds = Object.keys(overrideMap);
    let allStaffData = primaryStaffData || [];
    
    // Inject any non-native staff manually added to monthly entry override amounts
    if (overrideStaffIds.length > 0) {
      const extraIds = overrideStaffIds.filter(id => !allStaffData.find((s: any) => s.id === id));
      if (extraIds.length > 0) {
        const { data: extraStaff } = await supabase.from('staff').select('*').in('id', extraIds).eq('is_active', true);
        if (extraStaff) {
          allStaffData = [...allStaffData, ...extraStaff];
        }
      }
    }

    const staffData = allStaffData;
    if (staffData.length === 0) continue;

    const newResults: any[] = [];

    // Determine total monthly income for addon pool calculation
    const totalMonthlyIncome = deptTotalAmount > 0
      ? deptTotalAmount
      : (incomesData?.reduce((sum: number, d: any) => sum + (d.amount || 0), 0) || 0);

    // ── PROCESS ADD-ONS (unified, always from main income) ──
    const { results: addonResults, totalAddonDeduction } = await processAddons(
      supabase,
      dept.id,
      dept.name,
      totalMonthlyIncome,
      month,
      daysInMonth,
      globalLeavesByDate,
    );
    newResults.push(...addonResults);
    totalDistributed += addonResults.reduce((s: number, r: any) => s + r.final_share, 0);

    if (dept.calculation_method === 'staff_based') {
      // ── STAFF BASED: percentage applied to each staff's manually entered amount ──
      const { data: amounts } = await supabase
        .from('department_staff_amounts')
        .select('staff_id, amount')
        .eq('department_id', dept.id)
        .eq('month', month);

      if (amounts && amounts.length > 0) {
        // Calculate attendance data for proration
        const applyProration = dept.attendance_rule === 'monthly';
        const totalWorkingDays = daysInMonth;

        // Count staff per role for group distribution
        const staffCountByRole: Record<string, number> = {};
        for (const s of staffData) {
          const rk = s.role.toUpperCase().trim();
          staffCountByRole[rk] = (staffCountByRole[rk] || 0) + 1;
        }

        for (const staff of staffData) {
          const stored = amounts.find((a: any) => a.staff_id === staff.id);
          if (!stored || stored.amount <= 0) continue;

          const userRole = staff.role.toUpperCase().trim();
          const rule = ruleMap[userRole];
          if (!rule) continue;

          const override = overrideMap[staff.id];
          // Always use rule's distribution_type — override rows default to 'individual' in DB
          const distType = rule.distribution_type;
          const pctStr = override?.percentage !== null && override?.percentage !== undefined
            ? override.percentage.toString()
            : getStaffPercentage(staff, dept.id, rule.percentage);

          // Calculate attendance
          let absentDays = 0;
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            if (globalLeavesByDate[dateStr]?.has(staff.id)) absentDays++;
          }
          const presentDays = totalWorkingDays - absentDays;
          const prorateRatio = applyProration ? (presentDays / totalWorkingDays) : 1;

          // 1. Working Amount is exactly what was entered in the Input Box
          // (Frontend auto-fills this via TDA * attendance, or user types it)
          const adjustedBase = stored.amount;
          // 2. Apply Percentage on Working Amount
          let poolAmount = 0;
          let presentCount = 1;
          let share = 0;

          if (distType === 'group') {
            presentCount = staffCountByRole[userRole] || 1;
            poolAmount = computePoolAmount(adjustedBase, pctStr);
            share = Math.round((poolAmount / presentCount) * 100) / 100;
          } else {
            share = Math.round(adjustedBase * (parsePercentage(pctStr) / 100) * 100) / 100;
          }

          newResults.push({
            staff_id: staff.id, department_id: dept.id, date: `${month}-01`,
            income_amount: adjustedBase, calculation_type: 'rule',
            rule_percentage: pctStr, distribution_type: distType,
            pool_amount: poolAmount, present_count: presentCount, final_share: share,
            breakdown: {
              adjusted_base: adjustedBase,
              note: `Staff work amount × ${parsePercentage(pctStr)}%${distType === 'group' ? ` ÷ ${presentCount} staff` : ''}`,
              role: staff.role,
              percentage: `${parsePercentage(pctStr)}%`,
              gross_income: stored.amount,
              dist_type: distType,
              attendance_rule: dept.attendance_rule,
              total_days: daysInMonth,
              present_days: presentDays,
              absent_days: absentDays,
              prorate_ratio: applyProration ? `${presentDays}/${totalWorkingDays}` : undefined,
            },
          });
          totalDistributed += share;
        }
      }
    } else {
      // ── DAILY INCOME-BASED CALCULATION ──
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${month}-${String(day).padStart(2, '0')}`;
        const dayData = incomesData?.find((d: any) => d.date === dateStr);
        const income = deptTotalAmount > 0
          ? deptTotalAmount / daysInMonth
          : (dayData?.amount || 0);

        const onLeaveSet = dept.attendance_rule === 'none' ? new Set() : (globalLeavesByDate[dateStr] || new Set());

        let presentStaff = [];
        if (dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids)) {
          const explicitIds = new Set(dayData.present_staff_ids as string[]);
          presentStaff = staffData.filter((s: any) => explicitIds.has(s.id) && !onLeaveSet.has(s.id));
        } else {
          presentStaff = staffData.filter((s: any) => !onLeaveSet.has(s.id));
        }

        if (presentStaff.length === 0 && dayData?.amount === 0 && deptTotalAmount === 0) continue;

        const presentCountByRole: Record<string, number> = {};
        for (const s of presentStaff) {
          const rk = s.role.toUpperCase().trim();
          presentCountByRole[rk] = (presentCountByRole[rk] || 0) + 1;
        }

        const dayWorkEntries = workData?.filter((w: any) => w.date === dateStr) || [];
        let manualDeductions = 0;

        const workByStaff = dayWorkEntries.reduce((acc: any, w: any) => {
          if (!acc[w.staff_id]) acc[w.staff_id] = [];
          acc[w.staff_id].push(w);
          return acc;
        }, {} as Record<string, { amount: number; percentage: string }[]>);

        for (const [staffId, rawEntries] of Object.entries(workByStaff)) {
          const entries = rawEntries as { amount: number; percentage: string }[];
          const share = computeWorkEntryShare(entries);
          newResults.push({
            staff_id: staffId, department_id: dept.id, date: dateStr,
            income_amount: income, calculation_type: 'work_entry',
            rule_percentage: null, distribution_type: null,
            pool_amount: 0, present_count: 1, final_share: share,
            breakdown: { entries, total: share, type: 'manual_override' },
          });
          manualDeductions += share;
          totalDistributed += share;
        }

        const adjustedIncome = Math.max(0, income - manualDeductions);

        for (const staff of presentStaff) {
          if (workByStaff[staff.id]) continue;
          const userRole = staff.role.toUpperCase().trim();
          const rule = ruleMap[userRole];
          if (!rule) continue;

          const override = overrideMap[staff.id];
          // Always use rule's distribution_type — override rows default to 'individual' in DB
          const distType = rule.distribution_type;
          const pctStr = override?.percentage !== null && override?.percentage !== undefined
            ? override.percentage.toString()
            : getStaffPercentage(staff, dept.id, rule.percentage);

          let share = 0;
          let poolAmount = 0;
          let presentCount = 1;

          if (distType === 'group') {
            presentCount = presentCountByRole[userRole] || 1;
            share = computeGroupShare(adjustedIncome, pctStr, presentCount);
            poolAmount = computePoolAmount(adjustedIncome, pctStr);
          } else {
            share = computeIndividualShare(adjustedIncome, pctStr);
          }

          newResults.push({
            staff_id: staff.id, department_id: dept.id, date: dateStr,
            income_amount: income, calculation_type: 'rule',
            rule_percentage: pctStr, distribution_type: distType,
            pool_amount: poolAmount, present_count: presentCount,
            final_share: share,
            breakdown: {
              role: staff.role,
              percentage: `${parsePercentage(pctStr)}%`,
              distribution: distType,
              presentInRole: presentCount,
              gross_income: income,
              manual_deductions: manualDeductions,
            },
          });
          totalDistributed += share;
        }
      }
    }

    // Deduplicate results: keep only the last entry per (staff_id, date, department_id)
    const deduped = new Map<string, any>();
    for (const r of newResults) {
      const key = `${r.staff_id}|${r.date}|${r.department_id}`;
      if (deduped.has(key)) {
        // Merge: sum the final_share values
        const existing = deduped.get(key);
        existing.final_share = Math.round((existing.final_share + r.final_share) * 100) / 100;
        existing.breakdown = { ...existing.breakdown, merged: true, addon_note: r.breakdown?.note };
      } else {
        deduped.set(key, { ...r });
      }
    }
    const dedupedResults = Array.from(deduped.values());

    // Delete old results for this dept and month
    await supabase.from('daily_results').delete().eq('department_id', dept.id).gte('date', startDate).lt('date', endDate);

    // Upsert new results in chunks (safety net for any remaining edge cases)
    const chunkSize = 500;
    for (let i = 0; i < dedupedResults.length; i += chunkSize) {
      const chunk = dedupedResults.slice(i, i + chunkSize);
      const { error } = await supabase.from('daily_results').upsert(chunk, {
        onConflict: 'staff_id,date,department_id',
        ignoreDuplicates: false,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Clear cache to repopulate on next fetch
  invalidateReportCache();

  return NextResponse.json({
    success: true,
    message: department_id === 'all' ? 'Overall calculation completed' : 'Department calculation completed',
    total_distributed: totalDistributed,
  });

  } finally {
    releaseCalculationLock(lockKey);
  }
}
