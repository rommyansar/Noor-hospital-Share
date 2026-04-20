// ============================================
// Hospital Share v2 — Daily-Based System Types
// ============================================

// --- Database Models ---

export interface Department {
  id: string;
  name: string;
  is_active: boolean;
  calculation_method: 'income' | 'staff_based' | 'auto_manual' | 'ot';
  attendance_rule: 'daily' | 'monthly' | 'none';
  created_at: string;
  updated_at: string;
}

export interface MonthlyDepartmentAddon {
  id: string;
  department_id: string;
  addon_department_id: string;
  month: string;
  percentage: number;
  calculation_type: 'individual' | 'group';
  attendance_rule: 'daily' | 'monthly' | 'none';
  created_at: string;
}

export interface Staff {
  id: string;
  name: string;
  department_id: string;
  department_ids?: string[];
  role: string;
  is_active: boolean;
  staff_code?: string;
  department_percentages?: Record<string, any>;
  created_at: string;

  updated_at: string;
  departments?: Department;
}

export interface DepartmentRule {
  id: string;
  department_id: string;
  role: string;
  percentage: string; // Plain number: "3", "10", "0.5"
  distribution_type: 'individual' | 'group';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  departments?: Department;
}

export interface DailyIncome {
  id: string;
  department_id: string;
  date: string;
  amount: number;
  present_staff_ids?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyAttendanceStatus {
  id: string;
  department_id: string;
  month: string;
  is_reviewed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentStaffAmount {
  id: string;
  department_id: string;
  staff_id: string;
  month: string;
  amount: number;
  created_at: string;
  staff?: Staff;
}

export type LeaveType = 'OFF' | 'CL';

export interface StaffLeave {
  id: string;
  staff_id: string;
  date: string;
  leave_type: LeaveType;
  created_at: string;
  staff?: Staff;
}

export interface StaffWorkEntry {
  id: string;
  staff_id: string;
  department_id: string;
  date: string;
  description: string;
  amount: number;
  percentage: string; // Plain number: "40", "10"
  created_at: string;
  staff?: Staff;
}

export interface OTMonthlyAddon {
  id: string;
  month: string;
  department_id: string;
  addon_department_id: string;
  percentage: number;
  calculation_type: 'individual' | 'group';
  attendance_rule: 'daily' | 'monthly' | 'none';
  applied_rules?: string[];
  amount_source?: 'TDA' | 'MANUAL';
  manual_amount?: number | string;
  exclude_main_dept_days?: boolean;
  created_at: string;
}

export interface OTCase {
  id: string;
  month: string;
  department_id: string;
  date: string;
  case_type: 'Major' | 'Minor';
  amount: number;
  
  doctor_id: string | null;
  doctor_pct: number;
  
  assist_doctor_ids: string[];
  assist_doctor_pct: number;
  assist_doctor_mode: 'individual' | 'group';
  
  assist_nurse_ids: string[];
  assist_nurse_pct: number;
  assist_nurse_mode: 'individual' | 'group';
  
  paramedical_ids: string[];
  paramedical_pct: number;
  paramedical_mode: 'individual' | 'group';
  
  created_at: string;
}


export interface DailyResult {
  id: string;
  staff_id: string;
  department_id: string;
  date: string;
  income_amount: number;
  calculation_type: 'rule' | 'work_entry';
  rule_percentage: string | null;
  distribution_type: string | null;
  pool_amount: number;
  present_count: number;
  final_share: number;
  breakdown: unknown;
  calculated_at: string;
  staff?: Staff;
  departments?: Department;
}

// --- Form Types ---

export interface DepartmentForm {
  name: string;
  is_active: boolean;
}

export interface StaffForm {
  name: string;
  department_id: string;
  department_ids?: string[];
  department_percentages?: Record<string, any>;
  staff_code?: string;
  role: string;
  is_active: boolean;
}

export interface DepartmentRuleForm {
  department_id: string;
  role: string;
  percentage: string;
  distribution_type: 'individual' | 'group';
  is_active: boolean;
}

export interface WorkEntryForm {
  staff_id: string;
  department_id: string;
  date: string;
  description: string;
  amount: number;
  percentage: string;
}

// --- UI Types ---

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
