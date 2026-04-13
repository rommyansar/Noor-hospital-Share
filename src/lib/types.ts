// ============================================
// Hospital Share v2 — Daily-Based System Types
// ============================================

// --- Database Models ---

export interface Department {
  id: string;
  name: string;
  is_active: boolean;
  is_sub_department: boolean;
  include_general_staff: boolean;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  name: string;
  department_id: string;
  role: string;
  is_active: boolean;
  is_general: boolean;
  staff_code?: string;
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
  is_sub_department: boolean;
  include_general_staff: boolean;
}

export interface StaffForm {
  name: string;
  department_id: string;
  role: string;
  is_active: boolean;
  is_general: boolean;
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
