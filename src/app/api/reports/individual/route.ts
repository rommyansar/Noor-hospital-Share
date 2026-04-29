import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Individual-wise Report API
 * 
 * Fetches daily_results across multiple departments for a given month,
 * then aggregates total share per staff member across selected departments.
 * 
 * Query params:
 *   - department_ids: comma-separated department IDs
 *   - year: number
 *   - month: number (1-12)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deptIdsParam = searchParams.get('department_ids');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (!deptIdsParam || !year || !month) {
    return NextResponse.json(
      { error: 'department_ids, year, and month required' },
      { status: 400 }
    );
  }

  const deptIds = deptIdsParam.split(',').map(id => id.trim()).filter(Boolean);
  if (deptIds.length === 0) {
    return NextResponse.json({ error: 'No departments selected' }, { status: 400 });
  }

  const y = parseInt(year);
  const m = parseInt(month);
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const supabase = await createClient();

  // Fetch all departments info
  const { data: allDepts } = await supabase
    .from('departments')
    .select('id, name')
    .in('id', deptIds);

  const deptNameMap: Record<string, string> = {};
  for (const d of (allDepts || [])) {
    deptNameMap[d.id] = d.name;
  }

  // Fetch daily_results for ALL selected departments at once
  const { data: results, error } = await supabase
    .from('daily_results')
    .select('staff_id, department_id, final_share, staff(name, role, staff_code)')
    .in('department_id', deptIds)
    .gte('date', startDate)
    .lt('date', endDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate per staff member
  // staffMap[staff_id] = { name, role, dept_totals: { dept_id: total }, grand_total }
  const staffMap: Record<string, {
    staff_id: string;
    staff_name: string;
    staff_code?: string;
    role: string;
    dept_totals: Record<string, number>;
    grand_total: number;
  }> = {};

  for (const r of (results || [])) {
    const staffId = r.staff_id;
    if (!staffMap[staffId]) {
      staffMap[staffId] = {
        staff_id: staffId,
        staff_name: (r.staff as any)?.name || 'Unknown',
        staff_code: (r.staff as any)?.staff_code || '',
        role: (r.staff as any)?.role || 'Unknown',
        dept_totals: {},
        grand_total: 0,
      };
    }

    const deptId = r.department_id;
    if (!staffMap[staffId].dept_totals[deptId]) {
      staffMap[staffId].dept_totals[deptId] = 0;
    }
    staffMap[staffId].dept_totals[deptId] += r.final_share;
    staffMap[staffId].grand_total += r.final_share;
  }

  // Convert to array and sort by grand total descending
  const staffList = Object.values(staffMap)
    .map(s => ({
      ...s,
      grand_total: Math.round(s.grand_total * 100) / 100,
      dept_totals: Object.fromEntries(
        Object.entries(s.dept_totals).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
    }))
    .sort((a, b) => b.grand_total - a.grand_total);

  const grandTotal = staffList.reduce((s, st) => s + st.grand_total, 0);

  return NextResponse.json({
    year: y,
    month: m,
    department_ids: deptIds,
    department_names: deptNameMap,
    staff_count: staffList.length,
    grand_total: Math.round(grandTotal * 100) / 100,
    staff: staffList,
  });
}
