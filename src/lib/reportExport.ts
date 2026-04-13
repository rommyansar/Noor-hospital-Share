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
  work_entries: WorkEntry[];
  rule_entries: RuleEntry[];
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
  role: string;
  workAmount: number;
  percentage: string;
  shareAmount: number;
}

function buildNormalRows(staff: StaffReportData[]): NormalRow[] {
  return staff.map((s, idx) => {
    // Combine all work entry amounts
    const totalWorkAmount = s.work_entries.reduce((sum, w) => sum + w.work_amount, 0);

    // If there are work entries, calculate combined percentage from actual data
    let displayPercentage = '';
    if (s.work_entries.length > 0) {
      // Show first percentage or "Mixed" if multiple different percentages
      const uniquePcts = [...new Set(s.work_entries.map(w => w.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : 'Mixed';
    } else if (s.rule_entries.length > 0) {
      const uniquePcts = [...new Set(s.rule_entries.map(r => r.percentage))];
      displayPercentage = uniquePcts.length === 1 ? `${uniquePcts[0]}%` : `${uniquePcts[0]}%`;
    }

    // For rule-based staff, sum income amounts as "work amount"
    const ruleWorkAmount = s.rule_entries.reduce((sum, r) => sum + r.income_amount, 0);
    const workAmount = totalWorkAmount > 0 ? totalWorkAmount : ruleWorkAmount;

    return {
      srNo: idx + 1,
      staffName: s.staff_name,
      role: s.role,
      workAmount: Math.round(workAmount * 100) / 100,
      percentage: displayPercentage,
      shareAmount: Math.round(s.total_share * 100) / 100,
    };
  });
}

// ── Detailed Report Data ───────────────────────

interface DetailedRow {
  srNo: number;
  staffName: string;
  role: string;
  workType: string;
  workAmount: number;
  percentage: string;
  calculatedShare: number;
}

function buildDetailedRows(staff: StaffReportData[]): DetailedRow[] {
  const rows: DetailedRow[] = [];
  let srNo = 1;

  for (const s of staff) {
    // Work entries (e.g., Major Operation, Minor Operation, Assist)
    for (const w of s.work_entries) {
      rows.push({
        srNo,
        staffName: s.staff_name,
        role: s.role,
        workType: w.description || 'Work Entry',
        workAmount: w.work_amount,
        percentage: `${w.percentage}%`,
        calculatedShare: w.calculated_share,
      });
      srNo++;
    }

    // Rule-based entries
    for (const r of s.rule_entries) {
      const typeLabel = r.distribution_type === 'group'
        ? `Rule (Group ÷ ${r.present_count})`
        : 'Rule (Individual)';
      rows.push({
        srNo,
        staffName: s.staff_name,
        role: s.role,
        workType: typeLabel,
        workAmount: r.income_amount,
        percentage: `${r.percentage}%`,
        calculatedShare: r.calculated_share,
      });
      srNo++;
    }
  }

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
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
    ['(All calculations are based on approved hospital share policy)'],
    [],
  ];

  let sheetData: (string | number)[][];

  if (type === 'normal') {
    const rows = buildNormalRows(data.staff);
    const tableHeader = ['Sr. No.', 'Staff Name', 'Role', 'Work Amount (₹)', 'Percentage (%)', 'Share Amount (₹)'];
    const tableRows = rows.map(r => [
      r.srNo,
      r.staffName,
      r.role,
      r.workAmount,
      r.percentage,
      r.shareAmount,
    ]);

    sheetData = [
      ...headerRows,
      tableHeader,
      ...tableRows,
    ];
  } else {
    const rows = buildDetailedRows(data.staff);
    const tableHeader = ['Sr. No.', 'Staff Name', 'Role', 'Work Type', 'Work Amount (₹)', 'Percentage (%)', 'Calculated Share (₹)'];
    const tableRows = rows.map(r => [
      r.srNo,
      r.staffName,
      r.role,
      r.workType,
      r.workAmount,
      r.percentage,
      r.calculatedShare,
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
    ws['!cols'] = [
      { wch: 8 },   // Sr. No.
      { wch: 28 },  // Staff Name
      { wch: 18 },  // Role
      { wch: 18 },  // Work Amount
      { wch: 15 },  // Percentage
      { wch: 18 },  // Share Amount
    ];
  } else {
    ws['!cols'] = [
      { wch: 8 },   // Sr. No.
      { wch: 28 },  // Staff Name
      { wch: 18 },  // Role
      { wch: 25 },  // Work Type
      { wch: 18 },  // Work Amount
      { wch: 15 },  // Percentage
      { wch: 20 },  // Calculated Share
    ];
  }

  // Merge header cells
  const colCount = type === 'normal' ? 6 : 7;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, // Hospital name
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, // Report title
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, // Department
    { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }, // Reporting Period
    { s: { r: 5, c: 0 }, e: { r: 5, c: colCount - 1 } }, // Policy note
  ];

  const sheetName = type === 'normal' ? 'Normal Report' : 'Detailed Report';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fileName = `${data.department_name}_${MONTHS[data.month - 1]}_${data.year}_${type}_report.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ── PDF Export ──────────────────────────────────

export function exportPDF(data: ReportExportData, type: ReportType): void {
  const doc = new jsPDF({
    orientation: type === 'detailed' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // ── Hospital Header ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NOOR HOSPITAL, QADIAN', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(getReportTitle(data, type), pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // ── Separator line ──
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 8;

  // ── Department & Period ──
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Department: ${data.department_name}`, 20, yPos);
  yPos += 6;
  doc.text(`Reporting Period: ${getMonthYear(data)}`, 20, yPos);
  yPos += 6;

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('(All calculations are based on approved hospital share policy)', 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 10;

  // ── Table ──
  if (type === 'normal') {
    const rows = buildNormalRows(data.staff);
    autoTable(doc, {
      startY: yPos,
      head: [['Sr. No.', 'Staff Name', 'Role', 'Work Amount (₹)', 'Percentage (%)', 'Share Amount (₹)']],
      body: rows.map(r => [
        r.srNo,
        r.staffName,
        r.role,
        formatCurrency(r.workAmount),
        r.percentage,
        formatCurrency(r.shareAmount),
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'left', cellWidth: 45 },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'center', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 30 },
      },
      alternateRowStyles: {
        fillColor: [245, 250, 248],
      },
      margin: { left: 15, right: 15 },
    });
  } else {
    const rows = buildDetailedRows(data.staff);
    autoTable(doc, {
      startY: yPos,
      head: [['Sr.', 'Staff Name', 'Role', 'Work Type', 'Work Amount (₹)', '% ', 'Calculated Share (₹)']],
      body: rows.map(r => [
        r.srNo,
        r.staffName,
        r.role,
        r.workType,
        formatCurrency(r.workAmount),
        r.percentage,
        formatCurrency(r.calculatedShare),
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 45 },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'left', cellWidth: 50 },
        4: { halign: 'right', cellWidth: 35 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'right', cellWidth: 35 },
      },
      alternateRowStyles: {
        fillColor: [240, 245, 255],
      },
      margin: { left: 15, right: 15 },
    });
  }

  // ── Signature Section ──
  // Get the final Y position after the table
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || yPos + 50;
  let sigY = finalY + 25;

  // Check if we need a new page for signatures
  const pageHeight = doc.internal.pageSize.getHeight();
  if (sigY + 40 > pageHeight) {
    doc.addPage();
    sigY = 30;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const leftCol = 20;
  const rightCol = pageWidth / 2 + 10;
  const lineLength = 60;

  // Row 1: Prepared By & Checked By
  doc.text('Prepared By:', leftCol, sigY);
  doc.line(leftCol + 25, sigY + 1, leftCol + 25 + lineLength, sigY + 1);

  doc.text('Checked By:', rightCol, sigY);
  doc.line(rightCol + 25, sigY + 1, rightCol + 25 + lineLength, sigY + 1);

  sigY += 18;

  // Row 2: Approved By & Date
  doc.text('Approved By:', leftCol, sigY);
  doc.line(leftCol + 25, sigY + 1, leftCol + 25 + lineLength, sigY + 1);

  doc.text('Date:', rightCol, sigY);
  doc.line(rightCol + 12, sigY + 1, rightCol + 12 + lineLength, sigY + 1);

  // Save
  const fileName = `${data.department_name}_${MONTHS[data.month - 1]}_${data.year}_${type}_report.pdf`;
  doc.save(fileName);
}
