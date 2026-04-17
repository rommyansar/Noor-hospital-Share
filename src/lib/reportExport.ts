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

// ── Normal Report Data ─────────────────────────

interface NormalRow {
  srNo: number;
  staffName: string;
  workAmount: number;
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
      const uniquePcts = [...new Set(s.work_entries.map(w => w.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : 'Mixed';
    } else if (s.rule_entries.length > 0) {
      const uniquePcts = [...new Set(s.rule_entries.map(r => r.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : `${uniquePcts[0]}%`;
    }

    // For rule-based staff, sum income amounts as "work amount"
    const ruleWorkAmount = s.rule_entries.reduce((sum, r) => sum + r.income_amount, 0);
    const workAmount = totalWorkAmount > 0 ? totalWorkAmount : ruleWorkAmount;

    // Build OT breakdown string for normal report
    let otBreakdown = '';
    if (hasOTData && ((s.major_cases || 0) > 0 || (s.minor_cases || 0) > 0)) {
      const parts: string[] = [];
      if ((s.major_cases || 0) > 0) parts.push(`Major: ${s.major_cases} (₹${(s.major_base || 0).toLocaleString('en-IN')})`);
      if ((s.minor_cases || 0) > 0) parts.push(`Minor: ${s.minor_cases} (₹${(s.minor_base || 0).toLocaleString('en-IN')})`);
      if (s.ot_mode) parts.push(`${s.ot_mode}${(s.ot_group_count || 0) > 1 ? ` ÷${s.ot_group_count}` : ''}`);
      otBreakdown = parts.join(' | ');
    }

    return {
      srNo: idx + 1,
      staffName: s.origin_department !== data.department_name 
        ? `${s.staff_name} (${s.origin_department})` 
        : s.staff_name,
      workAmount: Math.round(workAmount * 100) / 100,
      percentage: displayPercentage,
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
  workingAmount: number;
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
    let workingAmount = 0;
    let calculationBreakdown = '';

    if (s.work_entries.length > 0) {
      // Work-entry based staff
      const totalWorkAmt = s.work_entries.reduce((sum, w) => sum + w.work_amount, 0);
      const uniquePcts = [...new Set(s.work_entries.map(w => w.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : 'Mixed';
      distributionType = 'Work Entry';
      workingAmount = totalWorkAmt;

      const parts = s.work_entries.map(w => {
        const pct = parseFloat(w.percentage || '0') || 0;
        return `${w.description}: Rs. ${w.work_amount.toLocaleString('en-IN')} × ${pct}% = Rs. ${w.calculated_share.toLocaleString('en-IN')}`;
      });
      calculationBreakdown = parts.join('\n');

    } else if (s.rule_entries.length > 0) {
      // Rule-based staff
      const firstEntry = s.rule_entries[0];
      const uniquePcts = [...new Set(s.rule_entries.map(r => r.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : `${uniquePcts[0]}%`;
      
      const distType = firstEntry.distribution_type || 'individual';
      distributionType = distType === 'group' ? 'Group' : 'Individual';
      groupCount = distType === 'group' ? firstEntry.present_count : '-';

      // For daily-based summation: workingAmount is the sum of daily income entries
      workingAmount = s.rule_entries.reduce((sum, r) => sum + r.income_amount, 0);

      // Check daily_details for note (has breakdown info)
      const note = s.daily_details?.[0]?.note || '';

      const pct = parseFloat(firstEntry.percentage || '0') || 0;

      if (distType === 'group') {
        const poolAmt = Math.round(workingAmount * (pct / 100) * 100) / 100;
        const count = firstEntry.present_count || 1;
        // Simplify calculation breakdown text to reflect real attendance-adjusted math
        calculationBreakdown = `Rs. ${workingAmount.toLocaleString('en-IN')} × ${pct}% = Rs. ${poolAmt.toLocaleString('en-IN')}\n÷ ${count} staff = Rs. ${s.total_share.toLocaleString('en-IN')}`;
      } else {
        // Simplify calculation breakdown text to reflect real attendance-adjusted math
        calculationBreakdown = `Rs. ${workingAmount.toLocaleString('en-IN')} × ${pct}% = Rs. ${s.total_share.toLocaleString('en-IN')}`;
      }

      // If addon, prepend addon context
      if (isAddon && note) {
        calculationBreakdown = `[${note}]\n→ ${calculationBreakdown}`;
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
      workingAmount: Math.round(workingAmount * 100) / 100,
      percentage: displayPercentage,
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

function formatCurrency(val: number): string {
  const formatted = val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, '');
  return `Rs. ${formatted}`;
}

function formatCurrencyShort(val: number): string {
  return val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, '');
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
      'Role',
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
      r.role,
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
      1:  { halign: 'left' },                     // Staff Name
      2:  { halign: 'center' },                   // Role
      3:  { halign: 'center' },                   // Total Days
      4:  { halign: 'center' },                   // Off/CL
      5:  { halign: 'center' },                   // Working Days
      6:  { halign: 'right' },                    // Working Amount
      7:  { halign: 'center' },                   // %
      8:  { halign: 'center' },                   // Distribution
      9:  { halign: 'center' },                   // Group Count
      10: { halign: 'left' },                     // Calculation
      11: { halign: 'right' },                    // Final Share
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
          { content: '', colSpan: 6 },
          { content: 'Section Total:', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
          { content: `Rs. ${formatCurrencyShort(sectionRows.reduce((s, r) => s + r.finalShare, 0))}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } },
        ]],
        theme: 'grid',
        styles: {
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 41, 59], // slate-800
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          lineWidth: 0.1,
          lineColor: [71, 85, 105],
        },
        bodyStyles: {
          fontSize: 7,
          cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
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
