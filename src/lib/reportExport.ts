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
  // Universal breakdown fields (built by API for ALL departments)
  breakdown_lines?: string[];
  working_amount?: number;
  working_amount_lines?: string[];
  display_percentage?: string;
  division_info?: string;
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
    custom_heading?: string | null;
  }[];
}

export interface ReportExportData {
  department_name: string;
  year: number;
  month: number;
  total_income: number;
  total_distributed: number;
  staff: StaffReportData[];
  report_heading?: string;
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
    if (val % 1 === 0) return `${val}%`;
    // Strip trailing zeros: 3.0000 → 3, 3.50 → 3.5
    const cleaned = parseFloat(val.toFixed(4));
    if (cleaned % 1 === 0) return `${cleaned}%`;
    return `${cleaned}%`;
  }
  const s = String(val).trim();
  if (!s) return '';
  // Already has % — still normalize the numeric part to strip trailing zeros
  if (s.endsWith('%')) {
    const numPart = parseFloat(s.replace('%', ''));
    if (!isNaN(numPart)) {
      if (numPart % 1 === 0) return `${numPart}%`;
      return `${parseFloat(numPart.toFixed(4))}%`;
    }
    return s;
  }
  // Raw numeric string
  const n = parseFloat(s);
  if (!isNaN(n)) {
    if (n % 1 === 0) return `${n}%`;
    return `${parseFloat(n.toFixed(4))}%`;
  }
  return s;
}

function getShortDeptName(name: string) {
  const map: Record<string, string> = {
    'Dental': 'DNT',
    'Delivery': 'DEL',
    'Out Patient Department': 'OPD',
    'General Surgery': 'SUR',
    'Eye Operation': 'EYE',
    'Emergency': 'EMG',
    'X-Ray': 'XRY',
    'Ultrasound': 'USG',
    'Pathology': 'PAT',
    'Physiotherapy': 'PHY',
    'Nursery': 'NUR',
    'Orthopedics': 'ORT',
    'ECG': 'ECG',
    'Endoscopy': 'END',
  };
  if (map[name]) return map[name];
  return name.substring(0, 3).toUpperCase();
}

/** Join an array of raw pct values into a clean newline-separated string with % on each. */
function joinPcts(pcts: (string | number)[]): string {
  const normalized = [...new Set(pcts.map(normPct))].filter(Boolean);
  return normalized.join('\n');
}

/** Convert Unicode chars (→, ₹) to PDF-safe ASCII equivalents */
function sanitizePdfText(text: string): string {
  return text
    .replace(/→/g, '->')
    .replace(/₹/g, 'Rs.');
}

// ── Normal Report Data ─────────────────────────

interface NormalRow {
  srNo: number;
  staffName: string;
  workAmount: number | string;
  percentage: string;
  shareAmount: number;
  otBreakdown: string;
  origin: string;
}

function buildNormalRows(data: ReportExportData): NormalRow[] {
  // Universal: always build breakdown for ALL departments
  return data.staff.map((s, idx) => {
    const displayPercentage = s.display_percentage || '';
    // Use breakdown_lines from API, sanitized for PDF
    const otBreakdown = sanitizePdfText((s.breakdown_lines || []).join('\n'));

    // Use per-percentage working amount lines if available, else fall back to combined total
    let workAmount: number | string;
    if (s.working_amount_lines && s.working_amount_lines.length > 0) {
      workAmount = sanitizePdfText(s.working_amount_lines.join('\n'));
    } else {
      workAmount = Math.round((s.working_amount || 0) * 100) / 100;
    }

    return {
      srNo: idx + 1,
      staffName: s.staff_name,
      workAmount,
      percentage: displayPercentage,
      shareAmount: s.total_share,
      otBreakdown,
      origin: s.origin_department,
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
      offCLDays = 'N/A';
      workingDays = 'N/A';
    }

    // Use universal fields from API (same as normal report)
    const displayPercentage = s.display_percentage || '';
    // Use per-percentage working amount lines if available
    let workingAmount: number | string;
    if (s.working_amount_lines && s.working_amount_lines.length > 0) {
      workingAmount = sanitizePdfText(s.working_amount_lines.join('\n'));
    } else {
      workingAmount = s.working_amount || 0;
    }
    const deptIncome = data.total_income;

    // Division info
    const divInfo = s.division_info || 'Individual (no division)';
    const distributionType = divInfo.startsWith('÷') ? 'Group' : 'Individual';
    let groupCount: number | string = '-';
    if (divInfo.startsWith('÷')) {
      const match = divInfo.match(/(\d+)/);
      groupCount = match ? parseInt(match[1]) : '-';
    }

    // Use universal breakdown_lines from API — sanitize for PDF
    const calculationBreakdown = sanitizePdfText((s.breakdown_lines || []).join('\n'));

    rows.push({
      srNo: idx + 1,
      staffName: s.staff_name,
      role: s.role,
      origin: isAddon ? s.origin_department : data.department_name,
      totalDays: totalDaysInMonth,
      offCLDays,
      workingDays,
      deptIncome,
      workingAmount: typeof workingAmount === 'string' ? workingAmount : Math.round(workingAmount * 100) / 100,
      percentage: displayPercentage,
      distributionType,
      groupCount,
      calculationBreakdown,
      finalShare: s.total_share,
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
  ];
  if (data.report_heading) {
    headerRows.push([data.report_heading]);
  }
  headerRows.push([]);

  // Extract custom headings
  const addonCustomHeadings: Record<string, string> = {};
  for (const staff of data.staff) {
    if (staff.addon_contributions) {
      for (const ac of staff.addon_contributions) {
        if (ac.custom_heading) {
          addonCustomHeadings[ac.department] = ac.custom_heading;
        }
      }
    }
  }

  let sheetData: (string | number)[][];

  if (type === 'normal') {
    const rows = buildNormalRows(data);
    // Universal: always include Breakdown column
    const tableHeader = ['Sr. No.', 'Staff Name', 'Work Amount (Rs.)', 'Percentage (%)', 'Breakdown', 'Share Amount (Rs.)'];
    const tableRows: (string | number)[][] = [];
    let currentOrigin = data.department_name;
    
    rows.forEach(r => {
      if (r.origin !== data.department_name && r.origin !== currentOrigin) {
        currentOrigin = r.origin;
        const customHeading = addonCustomHeadings[r.origin];
        if (customHeading) {
          tableRows.push([customHeading, '', '', '', '', '']);
        }
      }
      tableRows.push([r.srNo, r.staffName, r.workAmount, r.percentage, r.otBreakdown, r.shareAmount]);
    });

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
    const tableRows: (string | number)[][] = [];
    let currentOrigin = data.department_name;
    
    rows.forEach(r => {
      if (r.origin !== data.department_name && r.origin !== currentOrigin) {
        currentOrigin = r.origin;
        const customHeading = addonCustomHeadings[r.origin];
        if (customHeading) {
          tableRows.push([customHeading, '', '', '', '', '', '', '', '', '', '', '']);
        }
      }
      tableRows.push([
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
    });

    sheetData = [
      ...headerRows,
      tableHeader,
      ...tableRows,
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  if (type === 'normal') {
    // Universal: always 6 columns with Breakdown
    ws['!cols'] = [
      { wch: 8 },   // Sr. No.
      { wch: 30 },  // Staff Name
      { wch: 18 },  // Work Amount
      { wch: 15 },  // Percentage
      { wch: 60 },  // Breakdown
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

  // Merge header cells — always 6 columns for normal, 13 for detailed
  const colCount = type === 'normal' ? 6 : 13;
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, // Hospital name
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, // Report title
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, // Department
    { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }, // Reporting Period
    { s: { r: 5, c: 0 }, e: { r: 5, c: colCount - 1 } }, // Summary
    { s: { r: 6, c: 0 }, e: { r: 6, c: colCount - 1 } }, // Policy note
  ];
  if (data.report_heading) {
    merges.push({ s: { r: 7, c: 0 }, e: { r: 7, c: colCount - 1 } }); // Custom heading
  }
  ws['!merges'] = merges;

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

  // Extract custom headings for PDF
  const addonCustomHeadings: Record<string, string> = {};
  for (const staff of data.staff) {
    if (staff.addon_contributions) {
      for (const ac of staff.addon_contributions) {
        if (ac.custom_heading) {
          addonCustomHeadings[ac.department] = ac.custom_heading;
        }
      }
    }
  }

  const doc = new jsPDF({
    orientation: isDetailed ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'legal',
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
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Department: ${data.department_name}`, 14, yPos);
  
  if (isDetailed) {
    doc.text(`Period: ${getMonthYear(data)}`, pageWidth / 2 - 20, yPos);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth - 14, yPos, { align: 'right' });
  } else {
    yPos += 6;
    doc.text(`Reporting Period: ${getMonthYear(data)}`, 14, yPos);
  }
  yPos += 6;

  // ── Custom Report Heading (if set) ──
  if (data.report_heading) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(data.report_heading, 14, yPos);
    yPos += 6;
  }

  // Summary row
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const totalDays = getDaysInMonth(data.year, data.month);
  const summaryText = `Total Income: ${formatCurrency(data.total_income)}  |  Total Distributed: ${formatCurrency(data.total_distributed)}  |  Staff: ${data.staff.length}  |  Days in Month: ${totalDays}`;
  doc.text(summaryText, 14, yPos);
  yPos += 5;

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('All calculations are based on approved hospital share policy. Amounts in Indian Rupees (Rs.).', 14, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 7;

  // ── Table ──
  if (type === 'normal') {
    const rows = buildNormalRows(data);
    // Universal: always include Breakdown column
    const headCols = ['Sr.', 'Staff Name', 'Work Amount (Rs.)', '%', 'Breakdown', 'Share Amount (Rs.)'];

    const bodyRows: any[][] = [];
    let currentOrigin = data.department_name;
    
    rows.forEach(r => {
      if (r.origin !== data.department_name && r.origin !== currentOrigin) {
        currentOrigin = r.origin;
        const customHeading = addonCustomHeadings[r.origin];
        if (customHeading) {
          bodyRows.push([{ content: customHeading, colSpan: 6, styles: { fontStyle: 'bold', halign: 'left', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]);
        }
      }
      bodyRows.push([r.srNo, r.staffName, formatCurrency(r.workAmount), r.percentage, r.otBreakdown, formatCurrency(r.shareAmount)]);
    });

    const colStyles: Record<number, any> = {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 35 },
      2: { halign: 'left', cellWidth: 30, overflow: 'visible' },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'left', cellWidth: 46 },
      5: { halign: 'right', cellWidth: 38, overflow: 'visible' },
    };

    autoTable(doc, {
      startY: yPos,
      head: [headCols],
      body: bodyRows,
      theme: 'grid',
      styles: {
        overflow: 'linebreak',
        textColor: [0, 0, 0],
      },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 10,
        cellPadding: 3,
        textColor: [0, 0, 0],
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
      typeof r.workingAmount === 'string' ? r.workingAmount : `Rs. ${formatCurrencyShort(r.workingAmount)}`,
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
      5:  { halign: 'right', cellWidth: 30, overflow: 'visible' },     // Working Amount
      6:  { halign: 'center', cellWidth: 18 },    // %
      7:  { halign: 'center', cellWidth: 20 },    // Distribution
      8:  { halign: 'center', cellWidth: 14 },    // Group Count
      9:  { halign: 'left', cellWidth: 'auto' },  // Calculation Breakdown
      10: { halign: 'right', cellWidth: 30, overflow: 'visible' },     // Final Share
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
          fontSize: 10,
          halign: 'center',
          cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
          lineWidth: 0.1,
          lineColor: [71, 85, 105],
        },
        bodyStyles: {
          fontSize: 10,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          lineWidth: 0.1,
          lineColor: [203, 213, 225],
          textColor: [0, 0, 0],
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
      const customHeading = addonCustomHeadings[deptName];
      if (customHeading) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(customHeading, 14, currentY + 2);
        currentY += 8;
      }

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

// ── COMBINED PDF Export ─────────────────────────

export function exportCombinedPDF(dataList: ReportExportData[]): void {
  if (!dataList || dataList.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'legal',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 15;

  // ── Hospital Header (Only once at the start) ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NOOR HOSPITAL, QADIAN', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const firstData = dataList[0];
  doc.text(`MONTHLY COMBINED SHARE DISTRIBUTION REPORT (${MONTHS[firstData.month - 1]} ${firstData.year})`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.6);
  doc.line(12, yPos, pageWidth - 12, yPos);
  yPos += 6;

  for (let i = 0; i < dataList.length; i++) {
    const data = dataList[i];

    // Ensure we have enough space for the department header (at least 40mm)
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 15;
    }

    // ── Department, Period & Summary ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Department: ${data.department_name}`, 14, yPos);
    yPos += 6;

    if (data.report_heading) {
      doc.setFontSize(12);
      doc.text(data.report_heading, 14, yPos);
      yPos += 6;
    }

    // Summary row
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const totalDays = getDaysInMonth(data.year, data.month);
    const summaryText = `Total Income: ${formatCurrency(data.total_income)}  |  Total Distributed: ${formatCurrency(data.total_distributed)}  |  Staff: ${data.staff.length}  |  Days in Month: ${totalDays}`;
    doc.text(summaryText, 14, yPos);
    yPos += 5;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('All calculations are based on approved hospital share policy. Amounts in Indian Rupees (Rs.).', 14, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 7;

    // ── Table ──
    const rows = buildNormalRows(data);
    const headCols = ['Sr.', 'Staff Name', 'Work Amount (Rs.)', '%', 'Breakdown', 'Share Amount (Rs.)'];

    // Extract custom headings for addon departments
    const addonCustomHeadings: Record<string, string> = {};
    for (const staff of data.staff) {
      if (staff.addon_contributions) {
        for (const ac of staff.addon_contributions) {
          if (ac.custom_heading) {
            addonCustomHeadings[ac.department] = ac.custom_heading;
          }
        }
      }
    }

    const bodyRows: any[][] = [];
    let currentOrigin = data.department_name;
    
    rows.forEach(r => {
      if (r.origin !== data.department_name && r.origin !== currentOrigin) {
        currentOrigin = r.origin;
        const customHeading = addonCustomHeadings[r.origin];
        if (customHeading) {
          bodyRows.push([{ content: customHeading, colSpan: 6, styles: { fontStyle: 'bold', halign: 'left', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]);
        }
      }
      bodyRows.push([r.srNo, r.staffName, formatCurrency(r.workAmount), r.percentage, r.otBreakdown, formatCurrency(r.shareAmount)]);
    });

    // Portrait Legal: pageWidth ~215mm, margins 15mm each side => ~185mm available
    const colStyles: Record<number, any> = {
      0: { halign: 'center', cellWidth: 10 },  // Sr.
      1: { halign: 'left', cellWidth: 38 },    // Staff Name
      2: { halign: 'right', cellWidth: 24, overflow: 'visible' },   // Work Amount
      3: { halign: 'center', cellWidth: 13 },  // %
      4: { halign: 'left', cellWidth: 58 },    // Breakdown
      5: { halign: 'right', cellWidth: 35, overflow: 'visible' },   // Share Amount — expanded from 25mm for large values
    };

    autoTable(doc, {
      startY: yPos,
      head: [headCols],
      body: bodyRows,
      theme: 'grid',
      styles: { overflow: 'linebreak', textColor: [0, 0, 0] },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10, halign: 'center' },
      bodyStyles: { fontSize: 10, cellPadding: 3, textColor: [0, 0, 0] },
      columnStyles: colStyles,
      alternateRowStyles: { fillColor: [245, 250, 248] },
      margin: { left: 12, right: 12 },
    });

    yPos = (doc as any).lastAutoTable?.finalY + 15; // spacing between departments
  }

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Noor Hospital, Qadian — Combined Report — ${MONTHS[firstData.month - 1]} ${firstData.year} — Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `Combined_Report_${MONTHS[firstData.month - 1]}_${firstData.year}.pdf`;
  doc.save(fileName);
}

// ── INDIVIDUAL-WISE REPORT Export ───────────────

export interface IndividualReportData {
  year: number;
  month: number;
  department_ids: string[];
  department_names: Record<string, string>;
  staff_count: number;
  grand_total: number;
  staff: {
    staff_id: string;
    staff_name: string;
    staff_code?: string;
    role: string;
    dept_totals: Record<string, number>;
    grand_total: number;
    taxes: { ch: number; aam_musi: number; j_sal: number; inc_tax: number };
    total_tax: number;
    net_amount: number;
  }[];
}

export function exportIndividualPDF(data: IndividualReportData): void {
  const deptIds = data.department_ids;
  const deptNames = data.department_names;

  // Use landscape Legal for wide tables
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'legal',
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
  doc.text('INDIVIDUAL-WISE SHARE REPORT', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // ── Separator line ──
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(12, yPos, pageWidth - 12, yPos);
  yPos += 6;

  // ── Period info ──
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Reporting Period: ${MONTHS[data.month - 1]} ${data.year}`, 14, yPos);
  doc.text(`Staff: ${data.staff_count}  |  Departments: ${deptIds.length}`, pageWidth - 14, yPos, { align: 'right' });
  yPos += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Grand Total Distributed: Rs. ${formatCurrencyShort(data.grand_total)}`, 14, yPos);
  yPos += 5;

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Staff-wise total share across selected departments. Amounts in Indian Rupees (Rs.).', 14, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 7;

  // ── Build table ──
  const headCols = ['IND No.', 'Staff Name'];
  for (const dId of deptIds) {
    headCols.push(getShortDeptName(deptNames[dId] || dId));
  }
  headCols.push('Total Share');
  headCols.push('INC.TAX');
  headCols.push('MUSI');
  headCols.push('J.SAL');
  headCols.push('CH.AAM');
  headCols.push('DED');
  headCols.push('Net Amount');

  const bodyRows: any[][] = [];
  data.staff.forEach((s) => {
    const row: any[] = [s.staff_code || '-', s.staff_name];
    for (const dId of deptIds) {
      const amt = s.dept_totals[dId] || 0;
      row.push(amt > 0 ? formatCurrencyShort(amt) : '-');
    }
    row.push(formatCurrencyShort(s.grand_total));
    row.push(s.taxes.inc_tax > 0 ? formatCurrencyShort(s.taxes.inc_tax) : '-');
    row.push(s.taxes.aam_musi > 0 ? formatCurrencyShort(s.taxes.aam_musi) : '-');
    row.push(s.taxes.j_sal > 0 ? formatCurrencyShort(s.taxes.j_sal) : '-');
    row.push(s.taxes.ch > 0 ? formatCurrencyShort(s.taxes.ch) : '-');
    // DED = sum of all taxes
    const ded = s.taxes.ch + s.taxes.aam_musi + s.taxes.j_sal + s.taxes.inc_tax;
    row.push(ded > 0 ? formatCurrencyShort(ded) : '-');
    row.push(formatCurrencyShort(s.net_amount));
    bodyRows.push(row);
  });

  // Add totals row
  const totalRow: any[] = ['', { content: 'TOTAL', styles: { fontStyle: 'bold' } }];
  for (const dId of deptIds) {
    const deptTotal = data.staff.reduce((s, st) => s + (st.dept_totals[dId] || 0), 0);
    totalRow.push({ content: formatCurrencyShort(deptTotal), styles: { fontStyle: 'bold' } });
  }
  totalRow.push({ content: formatCurrencyShort(data.grand_total), styles: { fontStyle: 'bold' } });
  
  const totalIncTax = data.staff.reduce((s, st) => s + st.taxes.inc_tax, 0);
  const totalAam = data.staff.reduce((s, st) => s + st.taxes.aam_musi, 0);
  const totalJSal = data.staff.reduce((s, st) => s + st.taxes.j_sal, 0);
  const totalCh = data.staff.reduce((s, st) => s + st.taxes.ch, 0);
  const totalDed = totalCh + totalAam + totalJSal + totalIncTax;
  const totalNetAll = data.staff.reduce((s, st) => s + st.net_amount, 0);
  
  totalRow.push({ content: formatCurrencyShort(totalIncTax), styles: { fontStyle: 'bold' } });
  totalRow.push({ content: formatCurrencyShort(totalAam), styles: { fontStyle: 'bold' } });
  totalRow.push({ content: formatCurrencyShort(totalJSal), styles: { fontStyle: 'bold' } });
  totalRow.push({ content: formatCurrencyShort(totalCh), styles: { fontStyle: 'bold' } });
  totalRow.push({ content: formatCurrencyShort(totalDed), styles: { fontStyle: 'bold' } });
  totalRow.push({ content: formatCurrencyShort(totalNetAll), styles: { fontStyle: 'bold' } });
  
  bodyRows.push(totalRow);

  // ── Column Width Calculation (proportional, guaranteed to fit within page) ──
  const deptColCount = deptIds.length;
  const totalCols = 2 + deptColCount + 7; // IND + Name + Depts + Total Share + 5 taxes + Net Amount = 9 + deptCount
  // Table margins are 8mm left + 8mm right = 16mm
  const availWidth = pageWidth - 16; // 340mm for Legal landscape

  // Weight for each column type (higher = more space)
  const WGT_IND = 1.4;
  const WGT_NAME = 2.4;
  const WGT_DEPT = 2.0;
  const WGT_TOTAL = 2.4;
  const WGT_TAX = 2.0;
  const WGT_NET = 3.0;

  // Sum of all weights
  const sumWgt = WGT_IND + WGT_NAME + WGT_TOTAL + 5 * WGT_TAX + WGT_NET + deptColCount * WGT_DEPT;
  const px = availWidth / sumWgt;

  // Calculate exact column widths to perfectly fill the available width
  const W_IND = px * WGT_IND;
  const W_NAME = px * WGT_NAME;
  const W_DEPT = px * WGT_DEPT;
  const W_TOTAL = px * WGT_TOTAL;
  const W_TAX = px * WGT_TAX;
  const W_NET = px * WGT_NET;

  // Build column styles
  const colStyles: Record<number, any> = {};
  colStyles[0] = { halign: 'center', cellWidth: W_IND, overflow: 'linebreak' };                                // IND No.
  colStyles[1] = { halign: 'left', cellWidth: W_NAME, overflow: 'linebreak' };                                 // Staff Name
  for (let i = 2; i < totalCols - 7; i++) {
    colStyles[i] = { halign: 'right', cellWidth: W_DEPT, overflow: 'visible' };                                // Department columns
  }
  colStyles[totalCols - 7] = { halign: 'right', fontStyle: 'bold', cellWidth: W_TOTAL, overflow: 'visible' }; // Total Share
  colStyles[totalCols - 6] = { halign: 'right', cellWidth: W_TAX, overflow: 'visible' };                     // INC.TAX
  colStyles[totalCols - 5] = { halign: 'right', cellWidth: W_TAX, overflow: 'visible' };                     // MUSI
  colStyles[totalCols - 4] = { halign: 'right', cellWidth: W_TAX, overflow: 'visible' };                     // J.SAL
  colStyles[totalCols - 3] = { halign: 'right', cellWidth: W_TAX, overflow: 'visible' };                     // CH.AAM
  colStyles[totalCols - 2] = { halign: 'right', fontStyle: 'bold', cellWidth: W_TAX, overflow: 'visible' };  // DED
  colStyles[totalCols - 1] = { halign: 'right', fontStyle: 'bold', cellWidth: W_NET, overflow: 'visible' };   // Net Amount

  autoTable(doc, {
    startY: yPos,
    head: [headCols],
    body: bodyRows,
    theme: 'grid',
    tableWidth: availWidth,
    styles: {
      textColor: [0, 0, 0],
      fontSize: 7,
      cellPadding: 0.5,
    },
    headStyles: {
      fillColor: [60, 60, 60],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      overflow: 'linebreak',
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 0.5,
      textColor: [0, 0, 0],
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [240, 240, 240],
    },
    margin: { left: 8, right: 8 },
  });

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Noor Hospital, Qadian — Individual Report — ${MONTHS[data.month - 1]} ${data.year} — Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `Individual_Report_${MONTHS[data.month - 1]}_${data.year}.pdf`;
  doc.save(fileName);
}

export function exportIndividualExcel(data: IndividualReportData): void {
  const deptIds = data.department_ids;
  const deptNames = data.department_names;

  const wb = XLSX.utils.book_new();

  const headerRows: (string | number)[][] = [
    ['NOOR HOSPITAL, QADIAN'],
    ['INDIVIDUAL-WISE SHARE REPORT'],
    [],
    [`Reporting Period: ${MONTHS[data.month - 1]} ${data.year}`],
    [`Staff Count: ${data.staff_count}  |  Departments: ${deptIds.length}  |  Grand Total: Rs. ${data.grand_total.toLocaleString('en-IN')}/-`],
    ['Staff-wise total share across selected departments. Amounts in Indian Rupees (Rs.).'],
    [],
  ];

  // Table header
  const tableHeader = ['Sr. No.', 'Staff Name', 'Role'];
  for (const dId of deptIds) {
    tableHeader.push(getShortDeptName(deptNames[dId] || dId));
  }
  tableHeader.push('Total Share (Rs.)');
  tableHeader.push('INC.TAX (Rs.)');
  tableHeader.push('MUSI (Rs.)');
  tableHeader.push('J.SAL (Rs.)');
  tableHeader.push('CH.AAM (Rs.)');
  tableHeader.push('DED (Rs.)');
  tableHeader.push('Net Amount (Rs.)');

  // Table rows
  const tableRows: (string | number)[][] = [];
  data.staff.forEach((s, idx) => {
    const row: (string | number)[] = [idx + 1, s.staff_name, s.role];
    for (const dId of deptIds) {
      const amt = s.dept_totals[dId] || 0;
      row.push(amt > 0 ? amt : 0);
    }
    row.push(s.grand_total);
    row.push(s.taxes.inc_tax);
    row.push(s.taxes.aam_musi);
    row.push(s.taxes.j_sal);
    row.push(s.taxes.ch);
    const ded = s.taxes.ch + s.taxes.aam_musi + s.taxes.j_sal + s.taxes.inc_tax;
    row.push(ded > 0 ? ded : 0);
    row.push(s.net_amount);
    tableRows.push(row);
  });

  // Totals row
  const totalRow: (string | number)[] = ['', 'TOTAL', ''];
  for (const dId of deptIds) {
    const deptTotal = data.staff.reduce((s, st) => s + (st.dept_totals[dId] || 0), 0);
    totalRow.push(deptTotal);
  }
  totalRow.push(data.grand_total);
  const totalCh = data.staff.reduce((s, st) => s + st.taxes.ch, 0);
  const totalAam = data.staff.reduce((s, st) => s + st.taxes.aam_musi, 0);
  const totalJSal = data.staff.reduce((s, st) => s + st.taxes.j_sal, 0);
  const totalIncTax = data.staff.reduce((s, st) => s + st.taxes.inc_tax, 0);
  const totalDed = totalCh + totalAam + totalJSal + totalIncTax;
  const totalNetAll = data.staff.reduce((s, st) => s + st.net_amount, 0);
  
  totalRow.push(totalIncTax);
  totalRow.push(totalAam);
  totalRow.push(totalJSal);
  totalRow.push(totalCh);
  totalRow.push(totalDed);
  totalRow.push(totalNetAll);
  
  tableRows.push(totalRow);

  const sheetData = [
    ...headerRows,
    tableHeader,
    ...tableRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  const cols = [
    { wch: 8 },   // Sr.
    { wch: 30 },  // Staff Name
    { wch: 18 },  // Role
  ];
  for (let i = 0; i < deptIds.length; i++) {
    cols.push({ wch: 15 });
  }
  cols.push({ wch: 15 }); // Total Share
  cols.push({ wch: 12 }); // INC.TAX
  cols.push({ wch: 15 }); // MUSI
  cols.push({ wch: 12 }); // JSAL
  cols.push({ wch: 12 }); // CH.AAM
  cols.push({ wch: 12 }); // DED
  cols.push({ wch: 18 }); // Net
  ws['!cols'] = cols;

  // Merge header rows
  const totalCols = 3 + deptIds.length + 7;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: totalCols - 1 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: totalCols - 1 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: totalCols - 1 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Individual Report');
  const fileName = `Individual_Report_${MONTHS[data.month - 1]}_${data.year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

