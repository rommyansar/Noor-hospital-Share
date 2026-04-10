import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { CalculationPreview, ValidationError } from '@/lib/types';

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

/* eslint-disable @typescript-eslint/no-explicit-any */
// Core calculation logic — server-side single source of truth
async function runCalculation(supabase: ReturnType<typeof createServerClient>, year: number, month: number, department_id?: string) {
  const errors: ValidationError[] = [];
  const previews: CalculationPreview[] = [];

  // Get active departments
  let query = supabase.from('departments').select('*').eq('is_active', true);
  if (department_id) {
    query = query.eq('id', department_id);
  }
  const { data: departments } = await query;
  if (!departments || departments.length === 0) {
    errors.push({ type: 'error', message: 'No active departments found.' });
    return { errors, previews };
  }

  for (const dept of departments) {
    // Get income
    const { data: incomeData } = await supabase
      .from('monthly_income').select('*')
      .eq('department_id', dept.id).eq('year', year).eq('month', month).single();

    if (!incomeData || Number(incomeData.income_amount) <= 0) {
      errors.push({ type: 'warning', message: `No income entered for ${dept.name}.`, department: dept.name });
      continue;
    }

    const income = Number(incomeData.income_amount);

    // Get active rules (check effective dates)
    const calcDate = new Date(year, month - 1, 15); // mid-month for date check
    const rulesQuery = supabase
      .from('share_rules').select('*')
      .eq('department_id', dept.id).eq('is_active', true);

    const { data: rules } = await rulesQuery;
    if (!rules || rules.length === 0) {
      errors.push({ type: 'warning', message: `No active share rules for ${dept.name}.`, department: dept.name });
      continue;
    }

    // Filter by effective dates
    const activeRules = rules.filter((r: any) => {
      if (r.effective_from && new Date(r.effective_from) > calcDate) return false;
      if (r.effective_to && new Date(r.effective_to) < calcDate) return false;
      return true;
    });

    // Validate total percentage for pool-type rules
    const poolTotal = activeRules
      .filter((r: any) => r.distribution_type === 'pool')
      .reduce((sum: number, r: any) => sum + Number(r.share_percentage), 0);
    if (poolTotal > 100) {
      errors.push({ type: 'error', message: `${dept.name}: Pool-type rules total ${poolTotal}% (exceeds 100%).`, department: dept.name });
    }

    for (const rule of activeRules) {
      const sharePool = income * (Number(rule.share_percentage) / 100);

      // Get active staff for this rule
      const { data: staffList } = await supabase
        .from('staff').select('*')
        .eq('department_id', dept.id).eq('share_rule_id', rule.id).eq('is_active', true);

      if (!staffList || staffList.length === 0) {
        errors.push({ type: 'warning', message: `No staff assigned to role "${rule.role_name}" in ${dept.name}.`, department: dept.name });
        continue;
      }

      // Get attendance for all staff in this rule
      const staffIds = staffList.map((s: any) => s.id);
      const { data: attendanceList } = await supabase
        .from('attendance').select('*')
        .in('staff_id', staffIds).eq('year', year).eq('month', month);

      const attendanceMap = new Map<string, any>(attendanceList?.map((a: any) => [a.staff_id, a]) || []);

      // Check missing attendance
      const missingAttendance = staffList.filter((s: any) => !attendanceMap.has(s.id));
      if (missingAttendance.length > 0) {
        errors.push({
          type: 'error',
          message: `Missing attendance for ${missingAttendance.map((s: any) => s.name).join(', ')} in ${dept.name}.`,
          department: dept.name,
        });
        continue;
      }

      // Determine present staff for pool division
      let presentStaff = staffList;
      if (rule.absent_handling === 'exclude') {
        presentStaff = staffList.filter((s: any) => {
          const att = attendanceMap.get(s.id);
          return att && att.worked_days > 0;
        });
      }

      const poolDivisor = presentStaff.length || 1;

      for (const member of staffList) {
        const att = attendanceMap.get(member.id);
        if (!att) continue;

        const totalDays = Number(att.total_days);
        if (totalDays === 0) continue;

        const workedDays = Number(att.worked_days);
        const paidLeaves = Number(att.paid_leaves || 0);
        const halfDays = Number(att.half_days || 0);

        // Enhanced attendance formula (Working Days, CL, OFF only)
        const effectiveWorkedDays = workedDays + paidLeaves;
        const attendanceRatio = Math.min(effectiveWorkedDays / totalDays, 1);

        // Calculate share based on distribution type
        let baseShare: number;
        if (rule.distribution_type === 'per_person') {
          baseShare = sharePool; // Each person gets the full pool
        } else {
          // pool: divide among staff
          if (rule.absent_handling === 'exclude' && workedDays === 0) {
            // Excluded absent staff get 0
            baseShare = 0;
          } else {
            baseShare = sharePool / poolDivisor;
          }
        }

        // If worked_days = 0 and no paid leaves, final share = 0
        const finalShare = effectiveWorkedDays === 0 ? 0 : Math.round(baseShare * attendanceRatio * 100) / 100;

        previews.push({
          staff_id: member.id,
          staff_name: member.name,
          department_name: dept.name,
          role_name: rule.role_name,
          distribution_type: rule.distribution_type,
          department_income: income,
          rule_percentage: Number(rule.share_percentage),
          share_pool: sharePool,
          staff_in_pool: poolDivisor,
          base_share: baseShare,
          effective_worked_days: effectiveWorkedDays,
          total_days: totalDays,
          attendance_ratio: attendanceRatio,
          final_share: finalShare,
        });
      }
    }
  }

  return { errors, previews };
}

// POST /api/calculate — preview or save
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = getSupabase(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { year, month, action, department_id } = body; // action: 'preview' | 'save'

  if (!year || !month) {
    return NextResponse.json({ error: 'Year and month required.' }, { status: 400 });
  }

  // Check if month is locked
  if (action === 'save') {
    const { data: lockedCheck } = await supabase
      .from('monthly_results').select('id').eq('year', year).eq('month', month).eq('is_locked', true).limit(1);
    if (lockedCheck && lockedCheck.length > 0) {
      return NextResponse.json({ error: 'This month is locked. Unlock it first.' }, { status: 400 });
    }
  }

  const { errors, previews } = await runCalculation(supabase, year, month, department_id);

  // Block on hard errors
  const hardErrors = errors.filter(e => e.type === 'error');
  if (hardErrors.length > 0 && action === 'save') {
    return NextResponse.json({ errors, previews, saved: false }, { status: 200 });
  }

  if (action === 'preview') {
    return NextResponse.json({ errors, previews, saved: false });
  }

  // Save results
  // Delete existing results first
  let deleteQuery = supabase.from('monthly_results').delete().eq('year', year).eq('month', month);
  if (department_id) {
    deleteQuery = deleteQuery.eq('department_id', department_id);
  }
  await deleteQuery;

  // Map staff to department/rule for insert
  const { data: allStaff } = await supabase.from('staff').select('id, department_id, share_rule_id');
  const staffMap = new Map(allStaff?.map((s: any) => [s.id, s]) || []);

  const rows = previews.map(p => {
    const s = staffMap.get(p.staff_id);
    return {
      staff_id: p.staff_id,
      department_id: s?.department_id,
      share_rule_id: s?.share_rule_id,
      year,
      month,
      department_income: p.department_income,
      rule_percentage: p.rule_percentage,
      distribution_type: p.distribution_type,
      share_pool: p.share_pool,
      staff_in_pool: p.staff_in_pool,
      base_share: p.base_share,
      effective_worked_days: p.effective_worked_days,
      total_days: p.total_days,
      attendance_ratio: p.attendance_ratio,
      final_share: p.final_share,
      is_locked: false,
    };
  });

  const { error: insertError } = await supabase.from('monthly_results').insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message, saved: false }, { status: 500 });
  }

  // Audit log
  await supabase.from('audit_log').insert({
    table_name: 'monthly_results',
    action: 'calculate',
    new_values: { year, month, count: rows.length },
    performed_by: user.id,
  });

  return NextResponse.json({ errors, previews, saved: true, count: rows.length });
}
