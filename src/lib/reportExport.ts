// ============================================
// Report Export Utility — Excel & PDF
// ============================================
// Supports Normal Report (aggregated) and Detailed Report (full breakdown)
// ============================================

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Types ──────────────────────────────────────

export interface WorkEntry {
  date: string;
  description: string;
  work_amount: number;
  percentage: string;
  calculated_share: number;
}

export interface RuleEntry {
  date: string;
  income_amount: number;
  percentage: string;
  distribution_type: string;
  present_count: number;
  calculated_share: number;
}

interface StaffReportData {
  staff_id: string;
  staff_name: string;
  role: string;
  total_share: number;
  days_present: number;
  origin_department: string;
  work_entries: WorkEntry[];
  rule_entries: RuleEntry[];
  daily_details?: { date: string; share: number; type: string; note?: string }[];
  // OT case-type breakdown
  major_cases?: number;
  minor_cases?: number;
  major_base?: number;
  minor_base?: number;
  combined_working_amount?: number;
  ot_mode?: string;
  ot_group_count?: number;
  raw_cases?: { case_type: string; role_type: string; amount: number; pct: number; mode: string; group_count: number; share: number }[];
  // Addon tracking
  addon_contributions?: {
    department: string; share: number; pct: string;
    attendance: string; note: string;
    base_amount?: number; adjusted_base?: number; pool?: number;
    present_days?: number; total_days?: number; absent_days?: number;
    present_count?: number; distribution_type?: string;
    amount_source?: string; manual_amount?: number | null;
  }[];
}

export interface ReportExportData {
  department_name: string;
  year: number;
  month: number;
  total_income: number;
  total_distributed: number;
  staff: StaffReportData[];
}

export type ReportType = 'normal' | 'detailed';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Helpers ─────────────────────────────────────

/** Normalize a percentage value to always end with %. Handles strings like "10%", "3.75", "10" etc. */
function normPct(val: string | number): string {
  if (typeof val === 'number') {
    return val % 1 === 0 ? `${val}%` : `${parseFloat(val.toFixed(4))}%`;
  }
  const s = String(val).trim();
  if (!s) return '';
  // Already has %
  if (s.endsWith('%')) return s;
  // Raw numeric string
  const n = parseFloat(s);
  if (!isNaN(n)) {
    return n % 1 === 0 ? `${n}%` : `${parseFloat(n.toFixed(4))}%`;
  }
  return s;
}

/** Join an array of raw pct values into a clean comma-space-separated string with % on each. */
function joinPcts(pcts: (string | number)[]): string {
  const normalized = [...new Set(pcts.map(normPct))].filter(Boolean);
  return normalized.join(', ');
}

// ── Normal Report Data ─────────────────────────

interface NormalRow {
  srNo: number;
  staffName: string;
  workAmount: number | string;
  percentage: string;
  shareAmount: number;
  otBreakdown: string;
}

function buildNormalRows(data: ReportExportData): NormalRow[] {
  // Check if this is an OT department by seeing if any staff has OT breakdown data
  const hasOTData = data.staff.some(s => (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0);

  return data.staff.map((s, idx) => {
    // Combine all work entry amounts
    const totalWorkAmount = s.work_entries.reduce((sum, w) => sum + w.work_amount, 0);

    // If there are work entries, calculate combined percentage from actual data
    let displayPercentage = '';
    if (s.work_entries.length > 0) {
      displayPercentage = joinPcts(s.work_entries.map(w => w.percentage));
    } else if (s.rule_entries.length > 0) {
      displayPercentage = joinPcts(s.rule_entries.map(r => r.percentage));
    }

    // For rule-based staff, sum income amounts as "work amount"
    const ruleWorkAmount = s.rule_entries.reduce((sum, r) => sum + r.income_amount, 0);
    const workAmount = totalWorkAmount > 0 ? totalWorkAmount : ruleWorkAmount;

    // Build OT breakdown string for normal report — case-by-case
    let otBreakdown = '';
    const parts: string[] = [];
    const rawCases = (s as any).raw_cases || [];
    
    // Extracted percentages for OT Core
    let corePcts: string[] = [];
    if (hasOTData && rawCases.length > 0) {
      corePcts = rawCases.map((rc: any) => normPct(rc.pct));
      const groups: Record<string, { amount: number; share: number; pct: number; mode: string; group_count: number }> = {};
      for (const rc of rawCases) {
        const key = `${rc.pct}-${rc.mode}-${rc.group_count || 1}`;
        if (!groups[key]) groups[key] = { amount: 0, share: 0, pct: rc.pct, mode: rc.mode, group_count: rc.group_count || 1 };
        groups[key].amount += rc.amount;
        groups[key].share += rc.share;
      }
      
      const sortedKeys = Object.keys(groups).sort((a, b) => groups[b].pct - groups[a].pct);
      for (const key of sortedKeys) {
        const data = groups[key];
        const pctStr = normPct(data.pct);
        const amountStr = data.amount.toLocaleString('en-IN');
        const shareStr = Math.round(data.share).toLocaleString('en-IN');
        
        if (data.mode === 'group' && data.group_count > 1) {
          const poolAmt = Math.round(data.amount * (data.pct / 100) * 100) / 100;
          parts.push(`Rs. ${amountStr} x ${pctStr} = Rs. ${poolAmt.toLocaleString('en-IN')}\n / ${data.group_count} staff = Rs. ${shareStr}`);
        } else {
          parts.push(`${pctStr} -> Rs. ${amountStr} = Rs. ${shareStr}`);
        }
      }
      
      // Compute OT total (before addons)
      const coreShare = rawCases.reduce((sum: number, rc: any) => sum + rc.share, 0);
      parts.push(`= Total Share: Rs. ${Math.round(coreShare).toLocaleString('en-IN')}`);
    } else if (hasOTData && ((s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0)) {
      if ((s.major_cases || 0) > 0) parts.push(`Major: ${s.major_cases} (Rs. ${(s.major_base || 0).toLocaleString('en-IN')})`);
      if ((s.minor_cases || 0) > 0) parts.push(`Minor: ${s.minor_cases} (Rs. ${(s.minor_base || 0).toLocaleString('en-IN')})`);
    }

    const addonContribs = (s as any).addon_contributions || [];
    const hasAddon = addonContribs.length > 0;
    const hasCoreOT = rawCases.length > 0 || (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0;
    
    let finalWorkAmount: number | string = workAmount;
    let finalPercentage = displayPercentage;

    if (hasAddon) {
      const addonPcts = addonContribs.map((ac: any) => normPct(ac.pct));
      finalPercentage = joinPcts([...corePcts, ...addonPcts]);
    } else {
      if (corePcts.length > 0) {
        finalPercentage = joinPcts(corePcts);
      }
    }

    if (hasAddon) {

      if (!hasCoreOT) {
        // Addon-only staff
        const firstAc = addonContribs[0];
        finalWorkAmount = firstAc.amount_source === 'MANUAL' ? (firstAc.adjusted_base || firstAc.base_amount || 0) : (firstAc.pool || 0);
      } else {
        // Mixed staff - generate separated values "50/-  25/-"
        const coreWorkAmt = rawCases.length > 0 ? rawCases.reduce((sum: number, rc: any) => sum + rc.amount, 0) : workAmount;
        const addonAmts = addonContribs.map((ac: any) => ac.amount_source === 'MANUAL' ? (ac.adjusted_base || ac.base_amount || 0) : (ac.pool || 0));
        
        const coreStr = `${Math.round(coreWorkAmt).toLocaleString('en-IN')}/-`;
        const addonStrs = addonAmts.map((a: number) => `${Math.round(a).toLocaleString('en-IN')}/-`);
        finalWorkAmount = [coreStr, ...addonStrs].join('\n');
      }

      for (const ac of addonContribs) {
         // Use adjusted_base for manual amount so the math works: adjusted_base x pct = pool
         const acAmt = (ac.amount_source === 'MANUAL' ? (ac.adjusted_base || ac.base_amount) : ac.pool) || 0;
         const acPctStr = ac.pct;
         const acShareStr = Math.round(ac.share).toLocaleString('en-IN');
         
         if (ac.distribution_type === 'group' && ac.present_count > 1) {
           parts.push(`Rs. ${acAmt.toLocaleString('en-IN')} x ${acPctStr} = Rs. ${(ac.pool || 0).toLocaleString('en-IN')}\n / ${ac.present_count} staff = Rs. ${acShareStr}`);
         } else {
           parts.push(`${acPctStr} -> Rs. ${acAmt.toLocaleString('en-IN')} = Rs. ${acShareStr}`);
         }
      }
    }
    otBreakdown = parts.join('\n');

    return {
      srNo: idx + 1,
      staffName: s.staff_name,
      workAmount: typeof finalWorkAmount === 'number' ? Math.round(finalWorkAmount * 100) / 100 : finalWorkAmount,
      percentage: finalPercentage,
      shareAmount: Math.round(s.total_share * 100) / 100,
      otBreakdown,
    };
  });
}

// ── Detailed Report Data (Comprehensive) ───────

interface DetailedComprehensiveRow {
  srNo: number;
  staffName: string;
  role: string;
  origin: string;
  totalDays: number;
  offCLDays: number | string;
  workingDays: number | string;
  deptIncome: number;
  workingAmount: number | string;
  percentage: string;
  distributionType: string;
  groupCount: number | string;
  calculationBreakdown: string;
  finalShare: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDetailedComprehensiveRows(data: ReportExportData): DetailedComprehensiveRow[] {
  const rows: DetailedComprehensiveRow[] = [];
  const totalDaysInMonth = getDaysInMonth(data.year, data.month);

  data.staff.forEach((s, idx) => {
    const isAddon = s.origin_department !== data.department_name;

    // Calculate Off/CL days
    const daysPresent = s.days_present;
    let offCLDays: number | string = '-';
    let workingDays: number | string = '-';
    
    if (daysPresent >= 0) {
      offCLDays = totalDaysInMonth - daysPresent;
      workingDays = daysPresent;
    } else {
      // days_present === -1 means "no attendance" rule
      offCLDays = 'N/A';
      workingDays = 'N/A';
    }

    // Get percentage and distribution info
    let displayPercentage = '';
    let distributionType = '';
    let groupCount: number | string = '-';
    let deptIncome = data.total_income;
    let workingAmount: number | string = 0;
    let calculationBreakdown = '';

    if (s.work_entries.length > 0) {
      // Work-entry based staff
      const totalWorkAmt = s.work_entries.reduce((sum, w) => sum + w.work_amount, 0);
      displayPercentage = joinPcts(s.work_entries.map(w => w.percentage));
      distributionType = 'Work Entry';
      workingAmount = totalWorkAmt;

      const parts = s.work_entries.map(w => {
        const pctStr = normPct(w.percentage || 0);
        return `${w.description}: Rs. ${w.work_amount.toLocaleString('en-IN')} × ${pctStr} = Rs. ${w.calculated_share.toLocaleString('en-IN')}`;
      });
      calculationBreakdown = parts.join('\n');

    } else if (s.rule_entries.length > 0) {
      // Rule-based staff
      const firstEntry = s.rule_entries[0];
      displayPercentage = joinPcts(s.rule_entries.map(r => r.percentage));
      
      const distType = firstEntry.distribution_type || 'individual';
      distributionType = distType === 'group' ? 'Group' : 'Individual';
      groupCount = distType === 'group' ? firstEntry.present_count : '-';

      // Check daily_details for note (has breakdown info)
      const note = s.daily_details?.[0]?.note || '';

      // Check if this is an addon-only staff (no OT core work)
      const addonContribs = (s as any).addon_contributions || [];
      const hasAddon = addonContribs.length > 0;
      const rawCases = (s as any).raw_cases || [];
      const hasCoreOT = rawCases.length > 0 || (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0;

      if (hasAddon && !hasCoreOT) {
        // ADDON-ONLY staff: show addon calculation breakdown
        const ac = addonContribs[0]; // Primary addon
        const isManualAddon = ac.amount_source === 'MANUAL';
        const baseAmt = ac.base_amount || 0;
        const adjBase = ac.adjusted_base || 0;
        const addonPool = ac.pool || 0;
        const pDays = ac.present_days ?? 0;
        const tDays = ac.total_days ?? 0;
        const aDays = ac.absent_days ?? 0;
        const addonCount = ac.present_count || 1;
        const addonDist = ac.distribution_type || 'individual';

        workingAmount = isManualAddon ? baseAmt : addonPool;
        displayPercentage = ac.pct;
        distributionType = addonDist === 'group' ? 'Group' : 'Individual';
        groupCount = addonDist === 'group' ? addonCount : '-';

        const parts: string[] = [];
        if (isManualAddon) {
          parts.push(`Manual Amount: Rs. ${baseAmt.toLocaleString('en-IN')}`);
        } else {
          parts.push(`Department TDA: Rs. ${baseAmt.toLocaleString('en-IN')}`);
        }

        if (ac.attendance !== 'none' && tDays > 0) {
          parts.push(`Attendance: ${pDays}/${tDays} days (${aDays} off)`);
          parts.push(`Adjusted Base: Rs. ${adjBase.toLocaleString('en-IN')}`);
        }

        parts.push(`x ${ac.pct} = Pool: Rs. ${addonPool.toLocaleString('en-IN')}`);

        if (addonDist === 'group') {
          parts.push(`/ ${addonCount} staff = Rs. ${s.total_share.toLocaleString('en-IN')}`);
        } else {
          parts.push(`Final Share = Rs. ${s.total_share.toLocaleString('en-IN')}`);
        }

        calculationBreakdown = parts.join('\n');
      } else {
        // Standard rule-based or OT core + addon
        workingAmount = s.rule_entries.reduce((sum, r) => sum + r.income_amount, 0);

        // Check for raw_cases (case-by-case OT breakdown)
        const rawCases = (s as any).raw_cases || [];
        if (rawCases.length > 0) {
          const groups: Record<string, { amount: number; share: number; pct: number; mode: string; group_count: number }> = {};
          for (const rc of rawCases) {
            const key = `${rc.pct}-${rc.mode}-${rc.group_count || 1}`;
            if (!groups[key]) groups[key] = { amount: 0, share: 0, pct: rc.pct, mode: rc.mode, group_count: rc.group_count || 1 };
            groups[key].amount += rc.amount;
            groups[key].share += rc.share;
          }

          const caseParts: string[] = [];
          const sortedKeys = Object.keys(groups).sort((a, b) => groups[b].pct - groups[a].pct);
          for (const key of sortedKeys) {
            const data = groups[key];
            const pctStr = normPct(data.pct);
            const amountStr = data.amount.toLocaleString('en-IN');
            const shareStr = Math.round(data.share).toLocaleString('en-IN');
            
            if (data.mode === 'group' && data.group_count > 1) {
              const poolAmt = Math.round(data.amount * (data.pct / 100) * 100) / 100;
              caseParts.push(`Rs. ${amountStr} x ${pctStr} = Rs. ${poolAmt.toLocaleString('en-IN')}\n / ${data.group_count} staff = Rs. ${shareStr}`);
            } else {
              caseParts.push(`${pctStr} -> Rs. ${amountStr} = Rs. ${shareStr}`);
            }
          }
          const coreShare = rawCases.reduce((sum: number, rc: any) => sum + rc.share, 0);
          caseParts.push(`= OT Total: Rs. ${Math.round(coreShare).toLocaleString('en-IN')}`);
          calculationBreakdown = caseParts.join('\n');
        } else {
          // Fallback: old summary style
          const pct = parseFloat(firstEntry.percentage || '0') || 0;
          const pctStr = normPct(pct);
          if (distType === 'group') {
            const poolAmt = Math.round(workingAmount * (pct / 100) * 100) / 100;
            const count = firstEntry.present_count || 1;
            calculationBreakdown = `Rs. ${workingAmount.toLocaleString('en-IN')} x ${pctStr} = Rs. ${poolAmt.toLocaleString('en-IN')}\n / ${count} staff = Rs. ${s.total_share.toLocaleString('en-IN')}`;
          } else {
            calculationBreakdown = `Rs. ${workingAmount.toLocaleString('en-IN')} x ${pctStr} = Rs. ${s.total_share.toLocaleString('en-IN')}`;
          }
        }

        // If has addon contributions, append them
        if (hasAddon) {
          for (const ac of addonContribs) {
            const isManualAc = ac.amount_source === 'MANUAL';
            const acParts: string[] = [];
            acParts.push(`\n[Add-on: ${ac.department}]`);
            if (isManualAc) {
              acParts.push(`Manual Amount: Rs. ${(ac.base_amount || 0).toLocaleString('en-IN')}`);
            } else {
              acParts.push(`Department TDA: Rs. ${(ac.base_amount || 0).toLocaleString('en-IN')}`);
            }
            if (ac.attendance !== 'none' && ac.total_days > 0) {
              acParts.push(`Attendance: ${ac.present_days}/${ac.total_days} days (${ac.absent_days} off)`);
              acParts.push(`Adjusted Base: Rs. ${(ac.adjusted_base || 0).toLocaleString('en-IN')}`);
            }
            
            const acPctStr = normPct(ac.pct);
            const acShareStr = Math.round(ac.share).toLocaleString('en-IN');
            
            if (ac.distribution_type === 'group' && ac.present_count > 1) {
              acParts.push(`x ${acPctStr} = Pool: Rs. ${(ac.pool || 0).toLocaleString('en-IN')}\n / ${ac.present_count} staff = Final Share: Rs. ${acShareStr}`);
            } else {
              acParts.push(`x ${acPctStr} = Final Share: Rs. ${acShareStr}`);
            }
            calculationBreakdown += acParts.join('\n');
          }
        }

        // If addon, prepend addon context
        if (isAddon && note && !hasAddon) {
          calculationBreakdown = `[${note}]\n-> ${calculationBreakdown}`;
        }
      }
    }

    let finalWorkingAmount: number | string = workingAmount;
    let finalPercentage = displayPercentage;

    let corePcts: string[] = [];
    const rawCases = (s as any).raw_cases || [];
    if (rawCases.length > 0) {
      corePcts = rawCases.map((rc: any) => normPct(rc.pct));
    }
    
    // Check addon presence again for the bottom export builder
    const addonContribs = (s as any).addon_contributions || [];
    const hasAddon = addonContribs.length > 0;
    const hasCoreOT = rawCases.length > 0 || (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0;

    if (hasAddon) {
      const addonPcts = addonContribs.map((ac: any) => normPct(ac.pct));
      finalPercentage = joinPcts([...corePcts, ...addonPcts]);

      if (!hasCoreOT) {
        // Addon-only staff
        const firstAc = addonContribs[0];
        finalWorkingAmount = firstAc.amount_source === 'MANUAL' ? (firstAc.adjusted_base || firstAc.base_amount || 0) : (firstAc.pool || 0);
      } else {
        // Mixed staff
        const coreAmt = rawCases.length > 0 ? rawCases.reduce((sum: number, rc: any) => sum + rc.amount, 0) : workingAmount;
        const addonAmts = addonContribs.map((ac: any) => ac.amount_source === 'MANUAL' ? (ac.adjusted_base || ac.base_amount || 0) : (ac.pool || 0));
        
        const coreStr = `${Math.round(coreAmt).toLocaleString('en-IN')}/-`;
        const addonStrs = addonAmts.map((a: number) => `${Math.round(a).toLocaleString('en-IN')}/-`);
        finalWorkingAmount = [coreStr, ...addonStrs].join('\n');
      }
    } else {
      // Non-addon mixed/core OT
      if (corePcts.length > 0) {
        finalPercentage = joinPcts(corePcts);
      }
    }

    rows.push({
      srNo: idx + 1,
      staffName: s.staff_name,
      role: s.role,
      origin: isAddon ? s.origin_department : data.department_name,
      totalDays: totalDaysInMonth,
      offCLDays,
      workingDays,
      deptIncome,
      workingAmount: typeof finalWorkingAmount === 'number' ? Math.round(finalWorkingAmount * 100) / 100 : finalWorkingAmount,
      percentage: finalPercentage,
      distributionType,
      groupCount,
      calculationBreakdown,
      finalShare: Math.round(s.total_share * 100) / 100,
    });
  });

  return rows;
}

// ── Shared Header Info ─────────────────────────

function getReportTitle(data: ReportExportData, type: ReportType): string {
  return type === 'normal'
    ? 'MONTHLY SHARE DISTRIBUTION REPORT'
    : 'MONTHLY SHARE DISTRIBUTION REPORT — DETAILED';
}

function getMonthYear(data: ReportExportData): string {
  return `${MONTHS[data.month - 1]} ${data.year}`;
}

function formatCurrency(val: number | string): string {
  if (typeof val === 'string') return val;
  const formatted = val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, '');
  return `${formatted}/-`;
}

function formatCurrencyShort(val: number | string): string {
  if (typeof val === 'string') return val;
  return `${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, '')}/-`;
}

// ── Excel Export ────────────────────────────────

export function exportExcel(data: ReportExportData, type: ReportType): void {
  const wb = XLSX.utils.book_new();

  // Header rows
  const headerRows: (string | number)[][] = [
    ['NOOR HOSPITAL, QADIAN'],
    [getReportTitle(data, type)],
    [],
    [`Department: ${data.department_name}`],
    [`Reporting Period: ${getMonthYear(data)}`],
    [`Total Department Income: ${formatCurrency(data.total_income)}    |    Total Distributed: ${formatCurrency(data.total_distributed)}    |    Staff Count: ${data.staff.length}`],
    ['(All calculations are based on approved hospital share policy)'],
    [],
  ];

  let sheetData: (string | number)[][];

  if (type === 'normal') {
    const rows = buildNormalRows(data);
    const hasOTData = rows.some(r => r.otBreakdown);
    const tableHeader = hasOTData
      ? ['Sr. No.', 'Staff Name', 'Work Amount (Rs.)', 'Percentage (%)', 'OT Breakdown', 'Share Amount (Rs.)']
      : ['Sr. No.', 'Staff Name', 'Work Amount (Rs.)', 'Percentage (%)', 'Share Amount (Rs.)'];
    const tableRows = rows.map(r => hasOTData
      ? [r.srNo, r.staffName, r.workAmount, r.percentage, r.otBreakdown, r.shareAmount]
      : [r.srNo, r.staffName, r.workAmount, r.percentage, r.shareAmount]
    );

    sheetData = [
      ...headerRows,
      tableHeader,
      ...tableRows,
    ];
  } else {
    const rows = buildDetailedComprehensiveRows(data);
    const tableHeader = [
      'Sr.', 'Staff Name', 'Department',
      'Total Days', 'Off/CL', 'Working Days',
      'Working Amount (Rs.)', 'Percentage',
      'Distribution', 'Group Count',
      'Calculation Breakdown',
      'Final Share (Rs.)',
    ];
    const tableRows = rows.map(r => [
      r.srNo,
      r.staffName,
      r.origin,
      r.totalDays,
      r.offCLDays,
      r.workingDays,
      r.workingAmount,
      r.percentage,
      r.distributionType,
      r.groupCount,
      r.calculationBreakdown,
      r.finalShare,
    ]);

    sheetData = [
      ...headerRows,
      tableHeader,
      ...tableRows,
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  if (type === 'normal') {
    const hasOTData = data.staff.some(s => (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0);
    ws['!cols'] = hasOTData
      ? [
          { wch: 8 },   // Sr. No.
          { wch: 30 },  // Staff Name
          { wch: 18 },  // Work Amount
          { wch: 15 },  // Percentage
          { wch: 60 },  // OT Breakdown
          { wch: 18 },  // Share Amount
        ]
      : [
          { wch: 8 },   // Sr. No.
          { wch: 40 },  // Staff Name
          { wch: 18 },  // Work Amount
          { wch: 15 },  // Percentage
          { wch: 18 },  // Share Amount
        ];
  } else {
    ws['!cols'] = [
      { wch: 5 },   // Sr.
      { wch: 25 },  // Staff Name
      { wch: 18 },  // Department
      { wch: 10 },  // Total Days
      { wch: 8 },   // Off/CL
      { wch: 12 },  // Working Days
      { wch: 16 },  // Working Amount
      { wch: 10 },  // Percentage
      { wch: 12 },  // Distribution
      { wch: 10 },  // Group Count
      { wch: 70 },  // Calculation Breakdown
      { wch: 16 },  // Final Share
    ];
  }

  // Merge header cells
  const hasOTCol = type === 'normal' && data.staff.some(s => (s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0);
  const colCount = type === 'normal' ? (hasOTCol ? 7 : 6) : 13;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, // Hospital name
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, // Report title
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, // Department
    { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }, // Reporting Period
    { s: { r: 5, c: 0 }, e: { r: 5, c: colCount - 1 } }, // Summary
    { s: { r: 6, c: 0 }, e: { r: 6, c: colCount - 1 } }, // Policy note
  ];

  const sheetName = type === 'normal' ? 'Normal Report' : 'Detailed Report';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeDeptName = data.department_name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const fileName = `${safeDeptName}_${MONTHS[data.month - 1]}_${data.year}_${type}_report.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ── PDF Export ──────────────────────────────────

// Indian Legal paper size: 215mm x 356mm (8.5" x 14")
const INDIAN_LEGAL_WIDTH = 356; // landscape width
const INDIAN_LEGAL_HEIGHT = 215; // landscape height

export function exportPDF(data: ReportExportData, type: ReportType): void {
  const isDetailed = type === 'detailed';

  const doc = new jsPDF({
    orientation: isDetailed ? 'landscape' : 'portrait',
    unit: 'mm',
    format: isDetailed ? [INDIAN_LEGAL_HEIGHT, INDIAN_LEGAL_WIDTH] : 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 15;

  // ── Hospital Header ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NOOR HOSPITAL, QADIAN', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(getReportTitle(data, type), pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // ── Separator line ──
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.6);
  doc.line(12, yPos, pageWidth - 12, yPos);
  yPos += 6;

  // ── Department, Period & Summary (side-by-side for landscape) ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Department: ${data.department_name}`, 14, yPos);
  
  if (isDetailed) {
    doc.text(`Period: ${getMonthYear(data)}`, pageWidth / 2 - 20, yPos);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth - 14, yPos, { align: 'right' });
  } else {
    yPos += 5;
    doc.text(`Reporting Period: ${getMonthYear(data)}`, 14, yPos);
  }
  yPos += 5;

  // Summary row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const totalDays = getDaysInMonth(data.year, data.month);
  const summaryText = `Total Income: ${formatCurrency(data.total_income)}  |  Total Distributed: ${formatCurrency(data.total_distributed)}  |  Staff: ${data.staff.length}  |  Days in Month: ${totalDays}`;
  doc.text(summaryText, 14, yPos);
  yPos += 4;

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('All calculations are based on approved hospital share policy. Amounts in Indian Rupees (₹).', 14, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 6;

  // ── Table ──
  if (type === 'normal') {
    const rows = buildNormalRows(data);
    const hasOTData = rows.some(r => r.otBreakdown);

    const headCols = hasOTData
      ? ['Sr.', 'Staff Name', 'Work Amount (Rs.)', '%', 'OT Breakdown', 'Share Amount (Rs.)']
      : ['Sr.', 'Staff Name', 'Work Amount (Rs.)', 'Percentage', 'Share Amount (Rs.)'];

    const bodyRows = rows.map(r => hasOTData
      ? [r.srNo, r.staffName, formatCurrency(r.workAmount), r.percentage, r.otBreakdown, formatCurrency(r.shareAmount)]
      : [r.srNo, r.staffName, formatCurrency(r.workAmount), r.percentage, formatCurrency(r.shareAmount)]
    );

    const colStyles: Record<number, any> = hasOTData
      ? {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'left', cellWidth: 40 },
          2: { halign: 'right', cellWidth: 25 },
          3: { halign: 'center', cellWidth: 15 },
          4: { halign: 'left', cellWidth: 65 },
          5: { halign: 'right', cellWidth: 25 },
        }
      : {
          0: { halign: 'center', cellWidth: 15 },
          1: { halign: 'left', cellWidth: 55 },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'center', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 40 },
        };

    autoTable(doc, {
      startY: yPos,
      head: [headCols],
      body: bodyRows,
      theme: 'grid',
      styles: {
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: hasOTData ? 8 : 10,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: hasOTData ? 8 : 9,
        cellPadding: 3,
      },
      columnStyles: colStyles,
      alternateRowStyles: {
        fillColor: [245, 250, 248],
      },
      margin: { left: 15, right: 15 },
    });
  } else {
    // ── DETAILED REPORT — Comprehensive Layout ──
    const detailedRows = buildDetailedComprehensiveRows(data);

    // Separate main vs addon staff
    const mainStaff = detailedRows.filter(r => r.origin === data.department_name);
    const addonStaff = detailedRows.filter(r => r.origin !== data.department_name);

    // Group addon staff by origin department
    const addonByDept: Record<string, DetailedComprehensiveRow[]> = {};
    for (const r of addonStaff) {
      if (!addonByDept[r.origin]) addonByDept[r.origin] = [];
      addonByDept[r.origin].push(r);
    }

    const headCols = [
      'Sr.',
      'Staff Name',
      'Total\nDays',
      'Off/CL\nTaken',
      'Working\nDays',
      'Working Amount\n(Rs.)',
      '%',
      'Distribution\nType',
      'Group\nCount',
      'Calculation Breakdown',
      'Final Share\n(Rs.)',
    ];

    const mapRow = (r: DetailedComprehensiveRow) => [
      r.srNo,
      r.staffName,
      r.totalDays,
      r.offCLDays,
      r.workingDays,
      `Rs. ${formatCurrencyShort(r.workingAmount)}`,
      r.percentage,
      r.distributionType,
      r.groupCount,
      r.calculationBreakdown,
      `Rs. ${formatCurrencyShort(r.finalShare)}`,
    ];

    // Available width in landscape legal: ~356 - 24 (margins) = 332mm
    const colStyles: Record<number, any> = {
      0:  { halign: 'center', cellWidth: 10 },    // Sr.
      1:  { halign: 'left', cellWidth: 'auto' },  // Staff Name
      2:  { halign: 'center', cellWidth: 14 },    // Total Days
      3:  { halign: 'center', cellWidth: 14 },    // Off/CL
      4:  { halign: 'center', cellWidth: 16 },    // Working Days
      5:  { halign: 'right', cellWidth: 30 },     // Working Amount
      6:  { halign: 'center', cellWidth: 14 },    // %
      7:  { halign: 'center', cellWidth: 20 },    // Distribution
      8:  { halign: 'center', cellWidth: 14 },    // Group Count
      9:  { halign: 'left', cellWidth: 'auto' },  // Calculation Breakdown
      10: { halign: 'right', cellWidth: 30 },     // Final Share
    };

    // Helper to render a section with a section header
    const renderSection = (
      sectionTitle: string, 
      sectionRows: DetailedComprehensiveRow[],
      startY: number,
      sectionColor: [number, number, number],
    ): number => {
      // Section header
      autoTable(doc, {
        startY,
        head: [],
        body: [[{ content: sectionTitle, colSpan: 12, styles: { 
          fillColor: sectionColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left',
          cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
        } }]],
        theme: 'plain',
        margin: { left: 12, right: 12 },
      });

      const afterHeader = (doc as any).lastAutoTable?.finalY || startY + 8;

      // Data table
      autoTable(doc, {
        startY: afterHeader,
        head: [headCols],
        body: sectionRows.map(mapRow),
        foot: [[
          { content: '', colSpan: 5 },
          { content: 'Section Total:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
          { content: `Rs. ${formatCurrencyShort(sectionRows.reduce((s, r) => s + r.finalShare, 0))}`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
        ]],
        theme: 'grid',
        styles: {
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 41, 59], // slate-800
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center',
          cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
          lineWidth: 0.1,
          lineColor: [71, 85, 105],
        },
        bodyStyles: {
          fontSize: 8.5,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          lineWidth: 0.1,
          lineColor: [203, 213, 225],
          textColor: [15, 23, 42],
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          lineWidth: 0.1,
          lineColor: [148, 163, 184],
        },
        columnStyles: colStyles,
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 12, right: 12 },
        tableLineWidth: 0.1,
        tableLineColor: [148, 163, 184],
        didDrawPage: (data: any) => {
          // Footer on each page
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `${data.department_name || 'Noor Hospital'} — ${getMonthYear(data)} — Page ${doc.getNumberOfPages()}`,
            pageWidth / 2,
            pageHeight - 6,
            { align: 'center' }
          );
          doc.setTextColor(0, 0, 0);
        },
      });

      return (doc as any).lastAutoTable?.finalY || afterHeader + 40;
    };

    let currentY = yPos;

    // Render main department staff
    if (mainStaff.length > 0) {
      currentY = renderSection(
        `▸ MAIN DEPARTMENT: ${data.department_name.toUpperCase()} (${mainStaff.length} Staff)`,
        mainStaff,
        currentY,
        [16, 185, 129], // emerald
      );
      currentY += 4;
    }

    // Render each addon department section
    for (const [deptName, deptRows] of Object.entries(addonByDept)) {
      currentY = renderSection(
        `▸ ADD-ON: ${deptName.toUpperCase()} (${deptRows.length} Staff)`,
        deptRows,
        currentY,
        [59, 130, 246], // blue
      );
      currentY += 4;
    }

    // ── Grand Total Row ──
    autoTable(doc, {
      startY: currentY + 2,
      head: [],
      body: [[
        { content: '', colSpan: 6 },
        { content: 'GRAND TOTAL:', colSpan: 5, styles: { 
          halign: 'right', fontStyle: 'bold', fontSize: 10, textColor: [15, 23, 42],
        }},
        { content: `Rs. ${formatCurrencyShort(data.total_distributed)}`, styles: { 
          halign: 'right', fontStyle: 'bold', fontSize: 10, textColor: [16, 185, 129],
          fillColor: [240, 253, 244],
        }},
      ]],
      theme: 'plain',
      margin: { left: 12, right: 12 },
    });

    yPos = (doc as any).lastAutoTable?.finalY || currentY + 20;
  }

  // ── Signature Section ──
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || yPos + 50;
  let sigY = finalY + 20;

  // Check if we need a new page for signatures
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 25;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const margin = 14;
  const sigSpacing = (pageWidth - margin * 2) / 4;
  const lineLen = sigSpacing - 15;

  const sigFields = ['Prepared By', 'Checked By', 'Approved By', 'Date'];
  sigFields.forEach((label, i) => {
    const x = margin + i * sigSpacing;
    doc.setFontSize(8);
    doc.text(`${label}:`, x, sigY);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.line(x, sigY + 6, x + lineLen, sigY + 6);
  });

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Noor Hospital, Qadian — ${data.department_name} — ${getMonthYear(data)} — Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }
  doc.setTextColor(0, 0, 0);

  // Save
  const safeDeptName = data.department_name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const fileName = `${safeDeptName}_${MONTHS[data.month - 1]}_${data.year}_${type}_report.pdf`;
  doc.save(fileName);
}
