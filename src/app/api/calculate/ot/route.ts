import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import { invalidateReportCache } from '@/lib/cache';

function getDaysInMonth(yearStr: string, monthStr: string) {
  return new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { month, department_id } = body;

  if (!month || !department_id) {
    return NextResponse.json({ error: 'month (YYYY-MM) and department_id required' }, { status: 400 });
  }

  const [yearStr, monthNumStr] = month.split('-');
  const daysInMonth = getDaysInMonth(yearStr, monthNumStr);

  try {
    // 1. Fetch all OT cases for this month + department
    const { data: otCases, error: casesErr } = await supabase
      .from('ot_cases')
      .select('*')
      .eq('month', month)
      .eq('department_id', department_id)
      .order('date', { ascending: true });

    if (casesErr) {
      return NextResponse.json({ error: casesErr.message }, { status: 500 });
    }

    if (!otCases || otCases.length === 0) {
      return NextResponse.json({ error: 'No OT cases found for this month and department' }, { status: 400 });
    }

    // 2. Fetch staff names for lookups
    const { data: allStaff } = await supabase.from('staff').select('id, name, role').eq('is_active', true);
    const staffMap: Record<string, { name: string; role: string }> = {};
    (allStaff || []).forEach((s: any) => { staffMap[s.id] = { name: s.name, role: s.role }; });

    // 3. Calculate shares per staff from OT cases — track per-case-type breakdown
    const staffShares: Record<string, {
      total_share: number;
      total_working_amount: number;
      case_breakdowns: { case_type: string; role_type: string; amount: number; pct: number; mode: string; group_count: number; share: number }[];
    }> = {};

    const addShare = (
      staffId: string,
      share: number,
      caseAmount: number,
      pct: number,
      mode: string,
      groupCount: number,
      caseType: string,
      roleType: string,
    ) => {
      if (!staffId || share <= 0) return;
      if (!staffShares[staffId]) {
        staffShares[staffId] = {
          total_share: 0,
          total_working_amount: 0,
          case_breakdowns: [],
        };
      }
      staffShares[staffId].total_share += share;
      staffShares[staffId].total_working_amount += caseAmount;
      staffShares[staffId].case_breakdowns.push({
        case_type: caseType,
        role_type: roleType,
        amount: caseAmount,
        pct,
        mode,
        group_count: groupCount,
        share,
      });
    };

    let totalOTIncome = 0;

    for (const c of otCases) {
      const amt = parseFloat(c.amount) || 0;
      totalOTIncome += amt;
      if (amt <= 0) continue;

      const caseType = c.case_type || 'Major';

      // Doctor (Main) — always individual
      if (c.doctor_id) {
        const pct = parseFloat(c.doctor_pct) || 0;
        const share = Math.round((amt * pct / 100) * 100) / 100;
        addShare(c.doctor_id, share, amt, pct, 'individual', 1, caseType, 'Doctor');
      }

      // Helper for role groups
      const processRole = (ids: string[], pctRaw: number, mode: string, roleType: string) => {
        if (!ids || ids.length === 0) return;
        const pct = parseFloat(String(pctRaw)) || 0;
        const totalShare = Math.round((amt * pct / 100) * 100) / 100;
        if (mode === 'group') {
          const perPerson = Math.round((totalShare / ids.length) * 100) / 100;
          ids.forEach(id => addShare(id, perPerson, amt, pct, 'group', ids.length, caseType, roleType));
        } else {
          ids.forEach(id => addShare(id, totalShare, amt, pct, 'individual', 1, caseType, roleType));
        }
      };

      processRole(c.assist_doctor_ids || [], c.assist_doctor_pct, c.assist_doctor_mode || 'group', 'Assist Doctor');
      processRole(c.assist_nurse_ids || [], c.assist_nurse_pct, c.assist_nurse_mode || 'group', 'Assist Nurse');
      processRole(c.paramedical_ids || [], c.paramedical_pct, c.paramedical_mode || 'group', 'Paramedical');
    }

    // 4. Process OT add-ons
    const { data: otAddons } = await supabase
      .from('ot_monthly_addons')
      .select('*')
      .eq('month', month)
      .eq('department_id', department_id);

    const addonResults: any[] = [];

    if (otAddons && otAddons.length > 0) {
      const startDate = `${month}-01`;
      const endDate = monthNumStr === '12'
        ? `${parseInt(yearStr) + 1}-01-01`
        : `${yearStr}-${String(parseInt(monthNumStr) + 1).padStart(2, '0')}-01`;

      // Fetch global leaves for attendance determination
      const { data: allLeavesData } = await supabase
        .from('staff_leaves')
        .select('*')
        .gte('date', startDate)
        .lt('date', endDate);

      const globalLeavesByDate: Record<string, Set<string>> = {};
      if (allLeavesData) {
        for (const l of allLeavesData) {
          if (!globalLeavesByDate[l.date]) globalLeavesByDate[l.date] = new Set();
          globalLeavesByDate[l.date].add(l.staff_id);
        }
      }

      // Build per-day OT income from actual OT cases (for daily attendance mode)
      const otIncomeByDate: Record<string, number> = {};
      for (const c of otCases) {
        const amt = parseFloat(c.amount) || 0;
        const caseDate = c.date;
        if (caseDate && amt > 0) {
          otIncomeByDate[caseDate] = (otIncomeByDate[caseDate] || 0) + amt;
        }
      }

      // ── Build per-staff conflict-day sets from OT cases ──
      // A "conflict day" for a staff = a day where they worked in the main OT dept
      const staffConflictDates: Record<string, Set<string>> = {};
      for (const c of otCases) {
        const caseDate = c.date;
        if (!caseDate) continue;
        const participantIds: string[] = [];
        if (c.doctor_id) participantIds.push(c.doctor_id);
        (c.assist_doctor_ids || []).forEach((id: string) => participantIds.push(id));
        (c.assist_nurse_ids || []).forEach((id: string) => participantIds.push(id));
        (c.paramedical_ids || []).forEach((id: string) => participantIds.push(id));
        for (const id of participantIds) {
          if (!staffConflictDates[id]) staffConflictDates[id] = new Set();
          staffConflictDates[id].add(caseDate);
        }
      }

      for (const addon of otAddons) {
        const isManual = addon.amount_source === 'MANUAL';
        const rawManual = parseFloat(addon.manual_amount) || 0;
        const addonPct = parseFloat(addon.percentage) || 0;
        const excludeMainDays = !!addon.exclude_main_dept_days;

        if (!addon.addon_department_id) continue;
        if (addonPct <= 0) continue; // Percentage is ALWAYS required
        if (isManual && rawManual <= 0) continue;

        // Step 1: Global base amount (Manual Amount or Total OT Income)
        const globalBase = isManual ? rawManual : totalOTIncome;
        const attRule = addon.attendance_rule || 'none';

        const [{ data: addonStaff }, { data: addonRules }, { data: addonDeptData }] = await Promise.all([
          supabase.from('staff').select('*').contains('department_ids', [addon.addon_department_id]).eq('is_active', true),
          supabase.from('department_rules').select('*').eq('department_id', addon.addon_department_id).eq('is_active', true),
          supabase.from('departments').select('id, name').eq('id', addon.addon_department_id).single(),
        ]);

        const addonDeptName = addonDeptData?.name || 'Unknown';
        const appliedRuleIds: string[] = Array.isArray(addon.applied_rules) ? addon.applied_rules : [];
        const ruleMap: Record<string, any> = {};
        (addonRules || []).forEach((r: any) => {
          if (appliedRuleIds.length === 0 || appliedRuleIds.includes(r.id)) {
            ruleMap[r.role.toUpperCase().trim()] = r;
          }
        });

        const roleCounts: Record<string, number> = {};
        (addonStaff || []).forEach((s: any) => {
          let role = s.role || 'Unknown';
          if (s.department_percentages && typeof s.department_percentages === 'object') {
            const config = s.department_percentages[addon.addon_department_id];
            if (config && typeof config === 'object' && config.role) {
              role = String(config.role).trim();
            }
          }
          const rk = role.toUpperCase().trim();
          roleCounts[rk] = (roleCounts[rk] || 0) + 1;
        });

        // Include ALL active staff from the addon department
        const activeStaff = (addonStaff || []).filter((s: any) => s.is_active !== false);
        const staffCount = activeStaff.length;
        if (staffCount === 0) continue;

        let distType = addon.calculation_type || 'individual';

        for (const staff of activeStaff) {
          // ── PER-STAFF: Determine excluded dates (conflict + attendance) ──
          const conflictDates = excludeMainDays
            ? (staffConflictDates[staff.id] || new Set<string>())
            : new Set<string>();

          const excludedDates = new Set<string>();
          let absentDays = 0;

          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${month}-${String(d).padStart(2, '0')}`;
            const isConflict = conflictDates.has(dateStr);
            const isAbsent = globalLeavesByDate[dateStr]?.has(staff.id) || false;

            if (isConflict) excludedDates.add(dateStr);
            if (isAbsent) {
              absentDays++;
              if (attRule !== 'none') excludedDates.add(dateStr);
            }
          }

          const validDays = daysInMonth - excludedDates.size;
          const conflictDayCount = conflictDates.size;
          const presentDays = daysInMonth - absentDays;

          // ── Step 2: Compute per-staff adjustedBase ──
          let adjustedBase = globalBase;
          let noteExtra = '';

          if (excludeMainDays || attRule !== 'none') {
            // Both TDA and Manual use the same absolute deduction approach:
            let validIncome = 0;
            let excludedIncome = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${month}-${String(d).padStart(2, '0')}`;
              const dayIncome = otIncomeByDate[dateStr] || 0;
              if (!excludedDates.has(dateStr)) {
                validIncome += dayIncome;
              } else {
                excludedIncome += dayIncome;
              }
            }
            if (isManual) {
              // Manual: subtract the EXACT excluded OT income from the manual base
              // This guarantees the absolute deduction matches TDA mode behavior
              adjustedBase = Math.max(0, globalBase - excludedIncome);
              noteExtra = `(-₹${Math.round(excludedIncome).toLocaleString('en-IN')} from base${conflictDayCount > 0 ? ` for ${conflictDayCount} conflict days` : ''})`;
            } else {
              // TDA: use valid income directly as the base
              adjustedBase = validIncome;
              noteExtra = `(₹${Math.round(validIncome).toLocaleString('en-IN')} of ₹${Math.round(totalOTIncome).toLocaleString('en-IN')}${conflictDayCount > 0 ? `, ${conflictDayCount} conflict days excluded` : ''})`;
            }
          } else {
            noteExtra = '(No attendance)';
          }

          // Step 3: Apply Percentage on per-staff adjusted base
          const pool = Math.round(adjustedBase * (addonPct / 100) * 100) / 100;

          // Step 4: Group or Individual division
          let share = distType === 'group'
            ? (staffCount > 0 ? Math.round((pool / staffCount) * 100) / 100 : 0)
            : pool;

          if (share >= 0) {
            addonResults.push({
              staff_id: staff.id,
              department_id: department_id,
              date: `${month}-01`,
              income_amount: globalBase,
              calculation_type: 'rule',
              rule_percentage: String(addonPct),
              distribution_type: distType,
              pool_amount: pool,
              present_count: staffCount,
              final_share: share,
              breakdown: {
                role: (staff.department_percentages && staff.department_percentages[addon.addon_department_id]?.role) || staff.role,
                percentage: `${addonPct}%`,
                type: 'addon_share',
                note: `Add-on: ${addonDeptName} ${noteExtra}`,
                addon_department: addonDeptName,
                addon_pct: `${addonPct}%`,
                base_amount: globalBase,
                adjusted_base: adjustedBase,
                pool_after_pct: pool,
                distribution_type: distType,
                attendance_rule: attRule,
                amount_source: isManual ? 'MANUAL' : 'TDA',
                manual_amount: isManual ? rawManual : null,
                exclude_main_dept_days: excludeMainDays,
                conflict_days_excluded: conflictDayCount,
                total_days: daysInMonth,
                present_days: presentDays,
                absent_days: absentDays,
                valid_days: validDays,
                staff_count: staffCount,
              },
            });
          }
        }
      }
    }

    // 5. Build daily_results entries for OT core staff
    // Store under REAL department_id (not OT_ prefix)
    const coreResults: any[] = [];
    for (const [staffId, data] of Object.entries(staffShares)) {
      const staff = staffMap[staffId];
      if (!staff) continue; // Skip orphaned/deleted staff directly

      // Build detailed per-case-type note
      // Group breakdowns by role_type for a clean summary
      const byRole: Record<string, { total_amount: number; total_share: number; pcts: Set<string>; entries: string[] }> = {};
      for (const cb of data.case_breakdowns) {
        const key = `${cb.case_type} (${cb.role_type})`;
        if (!byRole[key]) byRole[key] = { total_amount: 0, total_share: 0, pcts: new Set(), entries: [] };
        byRole[key].total_amount += cb.amount;
        byRole[key].total_share += cb.share;
        byRole[key].pcts.add(`${cb.pct}`);
        const groupNote = cb.mode === 'group' && cb.group_count > 1 ? ` ÷ ${cb.group_count}` : '';
        byRole[key].entries.push(`₹${cb.amount.toLocaleString('en-IN')} × ${cb.pct}%${groupNote} = ₹${cb.share.toLocaleString('en-IN')}`);
      }

      const noteLines: string[] = [];
      for (const [key, val] of Object.entries(byRole)) {
        noteLines.push(`${key}: ${val.entries.join(' + ')}`);
      }
      noteLines.push(`Total Working Amount: ₹${data.total_working_amount.toLocaleString('en-IN')}`);
      noteLines.push(`Final Share: ₹${Math.round(data.total_share).toLocaleString('en-IN')}`);

      const pctDisplay = [...new Set(data.case_breakdowns.map(cb => `${cb.pct}`))].join('/');
      const modeDisplay = [...new Set(data.case_breakdowns.map(cb => cb.mode))].join('/');
      const avgGroupCount = data.case_breakdowns.filter(cb => cb.mode === 'group').length > 0
        ? Math.round(data.case_breakdowns.filter(cb => cb.mode === 'group').reduce((a, cb) => a + cb.group_count, 0) / data.case_breakdowns.filter(cb => cb.mode === 'group').length)
        : 1;

      coreResults.push({
        staff_id: staffId,
        department_id: department_id,  // Real department ID
        date: `${month}-01`,
        income_amount: data.total_working_amount,
        calculation_type: 'rule',
        rule_percentage: pctDisplay,
        distribution_type: modeDisplay,
        pool_amount: data.total_working_amount,
        present_count: avgGroupCount,
        final_share: Math.round(data.total_share * 100) / 100,
        breakdown: {
          role: staff?.role || 'Unknown',
          percentage: `${pctDisplay}%`,
          distribution: modeDisplay,
          presentInRole: avgGroupCount,
          gross_income: data.total_working_amount,
          note: noteLines.join('\n'),
          type: 'ot_core',
          case_details: byRole,
          raw_cases: data.case_breakdowns,
        },
      });
    }

    const allResults = [...coreResults, ...addonResults];

    // 6. Delete old results for this REAL department and insert new
    const startDate = `${month}-01`;
    const endDate = monthNumStr === '12'
      ? `${parseInt(yearStr) + 1}-01-01`
      : `${yearStr}-${String(parseInt(monthNumStr) + 1).padStart(2, '0')}-01`;

    await supabase.from('daily_results')
      .delete()
      .eq('department_id', department_id)
      .gte('date', startDate)
      .lt('date', endDate);

    // Insert all results as separate rows (core + addon entries per staff)
    // Unique constraint on (staff_id, date, department_id) must be dropped
    // to allow staff to have multiple entries (e.g., OT surgery share + addon share)
    const chunkSize = 500;
    for (let i = 0; i < allResults.length; i += chunkSize) {
      const chunk = allResults.slice(i, i + chunkSize);
      const { error } = await supabase.from('daily_results').insert(chunk);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    invalidateReportCache();

    const totalDistributed = allResults.reduce((s, r) => s + r.final_share, 0);

    return NextResponse.json({
      success: true,
      message: 'OT calculation completed',
      total_ot_income: totalOTIncome,
      total_distributed: Math.round(totalDistributed * 100) / 100,
      staff_count: allResults.length,
      core_count: coreResults.length,
      addon_count: addonResults.length,
    });
  } catch (err: any) {
    console.error('OT calculation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
