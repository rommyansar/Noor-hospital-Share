import { NextResponse } from 'next/server';
import { createServerSupabaseClient as createClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MUSI_ELIGIBLE_STAFF_INDS = [
  '2481', '103048', '103047', '1202', '11633', '2666', '47781', '2893', '6422',
  '1179', '1064', '88', '2741', '1110', '26256', '63252', '1982', '37997',
  '10215', '341', '2800', '1104', '6486', '7563', '1468', '2799', '5635',
  '1889', '645', '5632', '2802', '613', '6770', '332', '2975', '1952', '18469'
];

const INC_TAX_DEFAULTS: Record<string, number> = {
  '2481': 20.0,
  '1202': 10.5,
  '47781': 10.5,
  '11633': 10.5,
  '2666': 10.5,
};

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

  // Map tax data
  const taxMap: Record<string, any> = {};
  try {
    const TAX_FILE_PATH = path.join(process.cwd(), 'src/lib/taxData.json');
    if (fs.existsSync(TAX_FILE_PATH)) {
      const taxData = JSON.parse(fs.readFileSync(TAX_FILE_PATH, 'utf8'));
      for (const t of taxData) {
        taxMap[t.ind] = t;
      }
    }
  } catch (err) {
    console.error('Error reading tax data:', err);
  }

  // Convert to array and sort by grand total descending
  const staffList = Object.values(staffMap)
    .map(s => {
      const grand_total = s.grand_total;
      const taxes = taxMap[s.staff_code || ''] || { inc_tax: 0, enabled: true };
      
      let ch = 0;
      let aam_musi = 0;
      let j_sal = 0;
      let inc_tax = 0;

      const staffCode = (s.staff_code || '').trim();
      const isTemporary = staffCode.toUpperCase().startsWith('T-');

      if (taxes.enabled !== false && !isTemporary) {
        // 1. INC.TAX deduction first
        // INC.TAX is ONLY for doctors listed in INC_TAX_DEFAULTS.
        // Always use the hardcoded default percentage — legacy values in taxData.json
        // (flat amounts like 5212, or wrong decimals like 0.01) are completely ignored.
        const incTaxPercent = INC_TAX_DEFAULTS[staffCode] || 0;

        inc_tax = Number(((grand_total * incTaxPercent) / 100).toFixed(2));
        
        const remaining_amount = grand_total - inc_tax;

        // 2. Remaining 3 taxes on the remaining amount
        if (MUSI_ELIGIBLE_STAFF_INDS.includes(staffCode)) {
          aam_musi = Number((remaining_amount / 10).toFixed(2));
          // If MUSI is ON -> CH.AAM is OFF (skip it)
          ch = 0;
        } else {
          aam_musi = 0;
          // If MUSI is OFF -> CH.AAM applies normally
          ch = Number((remaining_amount / 16).toFixed(2));
        }

        j_sal = Number((remaining_amount / 120).toFixed(2));
      }

      const total_tax = ch + aam_musi + j_sal + inc_tax;
      const net_amount = grand_total - total_tax;

      return {
        ...s,
        grand_total,
        taxes: { ch, aam_musi, j_sal, inc_tax },
        total_tax,
        net_amount,
        dept_totals: Object.fromEntries(
          Object.entries(s.dept_totals).map(([k, v]) => [k, v])
        ),
      };
    })
    .sort((a, b) => b.grand_total - a.grand_total);

  const grandTotal = staffList.reduce((s, st) => s + st.grand_total, 0);

  return NextResponse.json({
    year: y,
    month: m,
    department_ids: deptIds,
    department_names: deptNameMap,
    staff_count: staffList.length,
    grand_total: grandTotal,
    staff: staffList,
  });
}
