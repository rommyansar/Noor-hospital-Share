import * as XLSX from 'xlsx';
import type { MonthlyResult } from '@/lib/types';
import { MONTHS } from '@/lib/types';

type ResultWithJoins = MonthlyResult & {
  staff?: { name: string };
  departments?: { name: string };
  share_rules?: { role_name: string; share_type: string; distribution_type: string };
};

export function exportToExcel(
  results: ResultWithJoins[],
  year: number,
  month: number,
  type: 'staff' | 'department' = 'staff'
) {
  const monthName = MONTHS[month - 1];
  const filename = `hospital_shares_${type}_${monthName}_${year}.xlsx`;

  if (type === 'staff') {
    const rows = results.map((r) => ({
      'Staff Name': r.staff?.name || 'Unknown',
      'Department': r.departments?.name || 'Unknown',
      'Role': r.share_rules?.role_name || 'Unknown',
      'Distribution': r.distribution_type || 'pool',
      'Department Income': Number(r.department_income),
      'Rule %': Number(r.rule_percentage),
      'Share Pool': Number(r.share_pool),
      'Staff in Pool': r.staff_in_pool,
      'Base Share': Number(r.base_share),
      'Effective Days': Number(r.effective_worked_days),
      'Total Days': r.total_days,
      'Attendance %': `${(Number(r.attendance_ratio) * 100).toFixed(1)}%`,
      'Final Share': Number(r.manual_override ?? r.final_share),
      'Override': r.manual_override != null ? `₹${r.manual_override}` : '-',
      'Override Reason': r.override_reason || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);
    XLSX.writeFile(wb, filename);
  } else {
    const deptMap = new Map<string, { income: number; totalShares: number; staffCount: number }>();
    for (const r of results) {
      const deptName = r.departments?.name || 'Unknown';
      const existing = deptMap.get(deptName) || { income: 0, totalShares: 0, staffCount: 0 };
      existing.income = Number(r.department_income);
      existing.totalShares += Number(r.manual_override ?? r.final_share);
      existing.staffCount += 1;
      deptMap.set(deptName, existing);
    }

    const rows = Array.from(deptMap.entries()).map(([name, data]) => ({
      'Department': name,
      'Monthly Income': data.income,
      'Total Shares': Math.round(data.totalShares * 100) / 100,
      'Staff Count': data.staffCount,
      'Share % of Income': data.income > 0 ? `${((data.totalShares / data.income) * 100).toFixed(2)}%` : '0%',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Dept Summary ${monthName} ${year}`);
    XLSX.writeFile(wb, filename);
  }
}

export function exportToCSV(results: ResultWithJoins[], year: number, month: number) {
  const monthName = MONTHS[month - 1];
  const filename = `hospital_shares_${monthName}_${year}.csv`;

  const rows = results.map((r) => ({
    'Staff Name': r.staff?.name || 'Unknown',
    'Department': r.departments?.name || 'Unknown',
    'Role': r.share_rules?.role_name || 'Unknown',
    'Distribution': r.distribution_type || 'pool',
    'Income': Number(r.department_income),
    'Rule %': Number(r.rule_percentage),
    'Base Share': Number(r.base_share),
    'Eff. Days': Number(r.effective_worked_days),
    'Attendance %': `${(Number(r.attendance_ratio) * 100).toFixed(1)}%`,
    'Final Share': Number(r.manual_override ?? r.final_share),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
