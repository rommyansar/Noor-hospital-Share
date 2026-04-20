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

function getStaffConfig(staff: any, deptId: string, fallbackRulePercentage: string): { role: string, percentage: string } {
  let role = staff.role;
  let percentage = fallbackRulePercentage;

  if (staff.department_percentages && typeof staff.department_percentages === 'object') {
    const config = staff.department_percentages[deptId];
    if (config) {
      if (typeof config === 'object' && config !== null) {
        if (config.role) role = String(config.role).trim();
        if (config.percentage) percentage = String(config.percentage).trim();
      } else if (String(config).trim() !== '') {
        percentage = String(config).trim();
      }
    }
  }

  return { role, percentage };
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
  incomesData: any[],
  deptTotalAmount: number,
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

    // Pool from either explicit Manual Amount or the MAIN department income (TDA)
    const baseIncome = addon.amount_source === 'MANUAL' 
      ? (Number(addon.manual_amount) || 0) 
      : mainIncome;
      
    const pool = Math.round(baseIncome * (addonPct / 100) * 100) / 100;
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

      // Step 1: Base Income -> Attendance Adjusted Base
      let adjustedBase = baseIncome;
      let noteExtra = '';

      if (attRule === 'none') {
        noteExtra = ' (No attendance)';
      } else if (attRule === 'monthly') {
        if (daysInMonth > 0) {
          const ratio = presentDays / daysInMonth;
          adjustedBase = Math.round(baseIncome * ratio * 100) / 100;
        }
        noteExtra = ` (Monthly: ${presentDays}/${daysInMonth})`;
      } else if (attRule === 'daily') {
        if (addon.amount_source === 'MANUAL') {
          if (daysInMonth > 0) {
            const ratio = presentDays / daysInMonth;
            adjustedBase = Math.round(baseIncome * ratio * 100) / 100;
          }
          noteExtra = ` (Daily Fixed: ${presentDays}/${daysInMonth})`;
        } else {
          // Calculate sum of exact daily income for present days
          let presentIncome = 0;
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            if (!globalLeavesByDate[dateStr]?.has(staff.id)) {
               const dayIncome = deptTotalAmount > 0 
                 ? deptTotalAmount / daysInMonth 
                 : (incomesData?.find((d: any) => d.date === dateStr)?.amount || 0);
               presentIncome += dayIncome;
            }
          }
          adjustedBase = Math.round(presentIncome * 100) / 100;
          noteExtra = ` (Daily: ₹${Math.round(adjustedBase).toLocaleString('en-IN')} present)`;
        }
      }

      const PoolAfterBase = Math.round(adjustedBase * (addonPct / 100) * 100) / 100;

      // Step 2: Apply group distribution (divide by total staff in role)
      let share = 0;
      if (distType === 'group') {
        share = Math.round((PoolAfterBase / presentCount) * 100) / 100;
      } else {
        share = PoolAfterBase;
      }

      const pctStrDisplay = addonPct.toString();

      if (share >= 0) {
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
            base_amount: baseIncome,
            adjusted_base: adjustedBase,
            addon_pool: PoolAfterBase,
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

  // OT departments use /api/calculate/ot — exclude from standard engine
  if (department_id === 'all') {
    deptsToProcess = deptsToProcess.filter(d => d.calculation_method !== 'ot');
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
      .select('total_amount, applied_rules, is_locked, auto_staff_ids, manual_staff_ids')
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

    const overrideStaffIds = new Set<string>();
    const overrideMap = (allOverrides || []).reduce((acc: any, cur: any) => {
      acc[cur.staff_id] = cur;
      overrideStaffIds.add(cur.staff_id);
      return acc;
    }, {});

    // Include staff from new JSONB entry formats
    const checkStaffIds = (arr: any[]) => {
      if (!Array.isArray(arr)) return;
      for (const entry of arr) {
        if (typeof entry === 'object' && entry !== null && entry.staff_id) overrideStaffIds.add(String(entry.staff_id));
        else if (typeof entry === 'string') overrideStaffIds.add(entry);
      }
    };
    checkStaffIds(totalAmountRow?.manual_staff_ids as any[]);
    checkStaffIds(totalAmountRow?.auto_staff_ids as any[]);

    let allStaffData = primaryStaffData || [];
    
    // Inject any non-native staff manually added
    const extraIds = Array.from(overrideStaffIds).filter(id => !allStaffData.find((s: any) => s.id === id));
    if (extraIds.length > 0) {
      const { data: extraStaff } = await supabase.from('staff').select('*').in('id', extraIds).eq('is_active', true);
      if (extraStaff) {
        allStaffData = [...allStaffData, ...extraStaff];
      }
    }

    const staffData = allStaffData;
    if (staffData.length === 0 && dept.calculation_method !== 'auto_manual') continue;

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
      incomesData || [],
      deptTotalAmount,
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
          const { role: configuredRole } = getStaffConfig(s, dept.id, '0');
          const rk = configuredRole.toUpperCase().trim();
          staffCountByRole[rk] = (staffCountByRole[rk] || 0) + 1;
        }

        for (const staff of staffData) {
          const stored = amounts.find((a: any) => a.staff_id === staff.id);
          if (!stored || stored.amount <= 0) continue;

          // Resolve role and percentage dynamically for this department
          const fallbackRulePct = ruleMap[staff.role?.toUpperCase().trim()]?.percentage || '0';
          const { role: configuredRole, percentage: configuredPct } = getStaffConfig(staff, dept.id, fallbackRulePct);
          const userRole = configuredRole.toUpperCase().trim();
          
          const rule = ruleMap[userRole];
          if (!rule) continue;

          const override = overrideMap[staff.id];
          // Always use rule's distribution_type
          const distType = rule.distribution_type;
          const pctStr = override?.percentage !== null && override?.percentage !== undefined
            ? override.percentage.toString()
            : configuredPct;

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
            share = poolAmount / presentCount;
          } else {
            share = adjustedBase * (parsePercentage(pctStr) / 100);
          }
          
          // Do NOT apply prorate ratio here because 'stored.amount' (Working Amount) 
          // generated by the frontend already has the monthly attendance ratio applied.
          // Applying it again would cause a double deduction.
          share = Math.round(share * 100) / 100;

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
              applied_ratio_multiplier: 1,
            },
          });
          totalDistributed += share;
        }
      }
    } else if (dept.calculation_method === 'auto_manual') {
      // ════════════════════════════════════════════════════════════════
      // AUTO + MANUAL HYBRID MODE (v2 — Multi-Entry)
      // ════════════════════════════════════════════════════════════════
      // Entries are now objects: {entry_id, staff_id, role, percentage, dist_type, amount?}
      // Same staff can appear N times with different roles/percentages
      // Backward compat: old string[] format falls back to ruleMap lookup
      // ════════════════════════════════════════════════════════════════

      const rawAutoEntries: any[] = Array.isArray(totalAmountRow?.auto_staff_ids) ? totalAmountRow.auto_staff_ids : [];
      const rawManualEntries: any[] = Array.isArray(totalAmountRow?.manual_staff_ids) ? totalAmountRow.manual_staff_ids : [];

      // Normalize entries: support both old string[] and new object[] formats
      const normalizeEntry = (raw: any, isManual: boolean): any | null => {
        if (typeof raw === 'object' && raw !== null && raw.staff_id) {
          return raw; // New format
        }
        if (typeof raw === 'string') {
          // Old format — migrate using ruleMap
          const staffObj = staffData.find((s: any) => s.id === raw);
          if (!staffObj) return null;
          const userRole = staffObj.role.toUpperCase().trim();
          const rule = ruleMap[userRole];
          return {
            entry_id: raw,
            staff_id: raw,
            role: staffObj.role,
            percentage: rule ? Number(rule.percentage) : 0,
            dist_type: rule?.distribution_type || 'individual',
          };
        }
        return null;
      };

      const autoEntries = rawAutoEntries.map(r => normalizeEntry(r, false)).filter(Boolean);
      const manualEntries = rawManualEntries.map(r => normalizeEntry(r, true)).filter(Boolean);

      // ── PART A: AUTO ENTRIES (TDA-based, daily loop) ──
      if (autoEntries.length > 0 && deptTotalAmount > 0) {
        // Build role counts for group distribution in AUTO pool
        const autoRoleCounts: Record<string, number> = {};
        for (const entry of autoEntries) {
          const rk = entry.role.toUpperCase().trim();
          autoRoleCounts[rk] = (autoRoleCounts[rk] || 0) + 1;
        }

        // Daily loop: TDA ÷ totalDays = dailyIncome
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          const dailyIncome = deptTotalAmount / daysInMonth;
          if (dailyIncome <= 0) continue;

          const dayData = incomesData?.find((d: any) => d.date === dateStr);

          // Determine present staff IDs for this day
          let presentStaffIds: Set<string> | null = null;
          if (dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids) && dayData.present_staff_ids.length > 0) {
            presentStaffIds = new Set(dayData.present_staff_ids as string[]);
          }

          const isDailyAtt = dept.attendance_rule === 'daily';
          const onLeaveSet = isDailyAtt ? (globalLeavesByDate[dateStr] || new Set<string>()) : new Set<string>();

          for (const entry of autoEntries) {
            // Check if staff is present today (at staff level)
            if (presentStaffIds && !presentStaffIds.has(entry.staff_id)) continue;
            if (!presentStaffIds && onLeaveSet.has(entry.staff_id)) continue;

            const pctStr = String(entry.percentage);
            const distType = entry.dist_type || 'individual';
            let share = 0;
            let poolAmount = 0;
            let presentCount = 1;

            if (distType === 'group') {
              // Count present entries with the same role today
              presentCount = autoEntries.filter((e: any) => {
                if (e.role.toUpperCase().trim() !== entry.role.toUpperCase().trim()) return false;
                if (presentStaffIds && !presentStaffIds.has(e.staff_id)) return false;
                if (!presentStaffIds && onLeaveSet.has(e.staff_id)) return false;
                return true;
              }).length || 1;
              share = computeGroupShare(dailyIncome, pctStr, presentCount);
              poolAmount = computePoolAmount(dailyIncome, pctStr);
            } else {
              share = computeIndividualShare(dailyIncome, pctStr);
            }

            // Apply Monthly Ratio if applicable
            let absentDays = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dStr = `${month}-${String(d).padStart(2, '0')}`;
              if (globalLeavesByDate[dStr]?.has(entry.staff_id)) absentDays++;
            }
            const presentDays = daysInMonth - absentDays;
            
            // Prevent double-deduction: If this specific day's attendance is explicitly dictated by presentStaffIds,
            // DO NOT apply the global monthly prorate ratio on top of their share for this day.
            const isExplicitDay = presentStaffIds !== null;
            const prorateRatio = (dept.attendance_rule === 'monthly' && !isExplicitDay) ? (presentDays / daysInMonth) : 1;

            share = Math.round(share * prorateRatio * 100) / 100;

            newResults.push({
              staff_id: entry.staff_id, department_id: dept.id, date: dateStr,
              income_amount: dailyIncome, calculation_type: 'rule',
              rule_percentage: pctStr, distribution_type: distType,
              pool_amount: poolAmount, present_count: presentCount,
              final_share: share,
              breakdown: {
                role: entry.role,
                percentage: `${parsePercentage(pctStr)}%`,
                distribution: distType,
                presentInRole: presentCount,
                gross_income: dailyIncome,
                mode: 'auto',
                entry_id: entry.entry_id,
                attendance_rule: dept.attendance_rule,
                prorate_ratio: dept.attendance_rule === 'monthly' ? `${presentDays}/${daysInMonth}` : undefined,
                note: `Auto entry: TDA/day × ${parsePercentage(pctStr)}%${distType === 'group' ? ` ÷ ${presentCount} entries` : ''}${dept.attendance_rule === 'monthly' ? ` × (${presentDays}/${daysInMonth})` : ''}`,
              },
            });
            totalDistributed += share;
          }
        }
      }

      // ── PART B: MANUAL ENTRIES (Amount embedded in entry) ──
      if (manualEntries.length > 0) {
        // Build role counts for group distribution in MANUAL pool
        const manualRoleCounts: Record<string, number> = {};
        for (const entry of manualEntries) {
          const rk = entry.role.toUpperCase().trim();
          manualRoleCounts[rk] = (manualRoleCounts[rk] || 0) + 1;
        }

        for (const entry of manualEntries) {
          // Amount is embedded in the entry object (v2) or from department_staff_amounts (v1 fallback)
          let manualAmount = Number(entry.amount) || 0;
          if (manualAmount <= 0) {
            // V1 fallback: check overrideMap from department_staff_amounts
            const override = overrideMap[entry.staff_id];
            if (override) manualAmount = Number(override.amount) || 0;
          }
          if (manualAmount <= 0) continue; // Skip entries without amount

          const pctStr = String(entry.percentage);
          const distType = entry.dist_type || 'individual';
          let share = 0;
          let poolAmount = 0;
          let presentCount = 1;

          if (distType === 'group') {
            presentCount = manualRoleCounts[entry.role.toUpperCase().trim()] || 1;
            poolAmount = computePoolAmount(manualAmount, pctStr);
            share = poolAmount / presentCount;
          } else {
            share = manualAmount * (parsePercentage(pctStr) / 100);
          }

          // Apply Monthly Ratio if applicable
          let absentDays = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${month}-${String(d).padStart(2, '0')}`;
            if (globalLeavesByDate[dStr]?.has(entry.staff_id)) absentDays++;
          }
          const presentDays = daysInMonth - absentDays;
          const prorateRatio = dept.attendance_rule === 'monthly' ? (presentDays / daysInMonth) : 1;

          share = Math.round(share * prorateRatio * 100) / 100;

          newResults.push({
            staff_id: entry.staff_id, department_id: dept.id, date: `${month}-01`,
            income_amount: manualAmount, calculation_type: 'rule',
            rule_percentage: pctStr, distribution_type: distType,
            pool_amount: poolAmount, present_count: presentCount,
            final_share: share,
            breakdown: {
              adjusted_base: manualAmount,
              gross_income: manualAmount,
              dist_type: distType,
              mode: 'manual',
              role: entry.role,
              entry_id: entry.entry_id,
              attendance_rule: dept.attendance_rule,
              prorate_ratio: dept.attendance_rule === 'monthly' ? `${presentDays}/${daysInMonth}` : undefined,
              note: `Manual entry: ₹${manualAmount} × ${parsePercentage(pctStr)}%${distType === 'group' ? ` ÷ ${presentCount} entries` : ''}${dept.attendance_rule === 'monthly' ? ` × (${presentDays}/${daysInMonth})` : ''}`,
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

        // Department-level presence: present_staff_ids is the PRIMARY source.
        // If an explicit present_staff_ids list exists for a day, it alone determines
        // who is present in THIS department — global leaves do NOT override it.
        // This allows a staff member to be present in one dept and absent in another.
        let presentStaff = [];
        if (dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids) && dayData.present_staff_ids.length > 0) {
          const explicitIds = new Set(dayData.present_staff_ids as string[]);
          presentStaff = staffData.filter((s: any) => explicitIds.has(s.id));
        } else {
          // No explicit list
          // If 'daily', exclude absent staff (day-wise filtering). 
          // If 'monthly' or 'none', include everyone here to keep group divisors static, then apply ratio later.
          const isDailyAtt = dept.attendance_rule === 'daily';
          const onLeaveSet = isDailyAtt ? (globalLeavesByDate[dateStr] || new Set()) : new Set();
          presentStaff = staffData.filter((s: any) => !onLeaveSet.has(s.id));
        }

        if (presentStaff.length === 0 && dayData?.amount === 0 && deptTotalAmount === 0) continue;

        const presentCountByRole: Record<string, number> = {};
        for (const s of presentStaff) {
          const { role: configuredRole } = getStaffConfig(s, dept.id, '0');
          const rk = configuredRole.toUpperCase().trim();
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
          
          const fallbackRulePct = ruleMap[staff.role?.toUpperCase().trim()]?.percentage || '0';
          const { role: configuredRole, percentage: configuredPct } = getStaffConfig(staff, dept.id, fallbackRulePct);
          const userRole = configuredRole.toUpperCase().trim();

          const rule = ruleMap[userRole];
          if (!rule) continue;

          const override = overrideMap[staff.id];
          // Always use rule's distribution_type
          const distType = rule.distribution_type;
          const pctStr = override?.percentage !== null && override?.percentage !== undefined
            ? override.percentage.toString()
            : configuredPct;

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

          // Apply Monthly Ratio if applicable
          let absentDays = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${month}-${String(d).padStart(2, '0')}`;
            if (globalLeavesByDate[dStr]?.has(staff.id)) absentDays++;
          }
          const presentDays = daysInMonth - absentDays;
          
          // Prevent double-deduction: If this specific day's attendance is explicitly dictated by present_staff_ids,
          // DO NOT apply the global monthly prorate ratio on top of their share for this day.
          const isExplicitDay = dayData && dayData.present_staff_ids && Array.isArray(dayData.present_staff_ids) && dayData.present_staff_ids.length > 0;
          const prorateRatio = (dept.attendance_rule === 'monthly' && !isExplicitDay) ? (presentDays / daysInMonth) : 1;
          
          share = Math.round(share * prorateRatio * 100) / 100;

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
              attendance_rule: dept.attendance_rule,
              prorate_ratio: dept.attendance_rule === 'monthly' ? `${presentDays}/${daysInMonth}` : undefined,
              note: `Generic computation${dept.attendance_rule === 'monthly' ? ` × (${presentDays}/${daysInMonth})` : ''}`,
            },
          });
          totalDistributed += share;
        }
      }
    }

    // Deduplicate results: keep only the last entry per (staff_id, date, department_id, entry_id)
    const deduped = new Map<string, any>();
    for (const r of newResults) {
      const entryIdSuffix = r.breakdown?.entry_id ? `|${r.breakdown.entry_id}` : '';
      const key = `${r.staff_id}|${r.date}|${r.department_id}${entryIdSuffix}`;
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
      const { error } = await supabase.from('daily_results').insert(chunk);
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
