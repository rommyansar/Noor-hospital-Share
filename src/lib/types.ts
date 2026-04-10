// ============================================
// Database Types
// ============================================

export interface Department {
  id: string;
  name: string;
  type: 'clinical' | 'non_clinical';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShareRule {
  id: string;
  department_id: string;
  role_name: string;
  share_percentage: number;
  share_type: 'fixed' | 'group';
  distribution_type: 'per_person' | 'pool';
  absent_handling: 'exclude' | 'include';
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  departments?: Department;
}

export interface Staff {
  id: string;
  name: string;
  department_id: string;
  share_rule_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  departments?: Department;
  share_rules?: ShareRule;
}

export interface MonthlyIncome {
  id: string;
  department_id: string;
  year: number;
  month: number;
  income_amount: number;
  is_locked: boolean;
  created_at: string;
  departments?: Department;
}

export interface Attendance {
  id: string;
  staff_id: string;
  year: number;
  month: number;
  total_days: number;
  worked_days: number;
  paid_leaves: number;
  unpaid_leaves: number;
  half_days: number;
  created_at: string;
  updated_at: string;
  staff?: Staff;
}

export interface MonthlyResult {
  id: string;
  staff_id: string;
  department_id: string;
  share_rule_id: string;
  year: number;
  month: number;
  department_income: number;
  rule_percentage: number;
  distribution_type: string;
  share_pool: number;
  staff_in_pool: number;
  base_share: number;
  effective_worked_days: number;
  total_days: number;
  attendance_ratio: number;
  final_share: number;
  manual_override: number | null;
  override_reason: string | null;
  is_locked: boolean;
  calculated_at: string;
  staff?: Staff;
  departments?: Department;
  share_rules?: ShareRule;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
}

// ============================================
// Form Types
// ============================================

export interface DepartmentForm {
  name: string;
  type: 'clinical' | 'non_clinical';
  is_active: boolean;
}

export interface ShareRuleForm {
  department_id: string;
  role_name: string;
  share_percentage: number;
  share_type: 'fixed' | 'group';
  distribution_type: 'per_person' | 'pool';
  absent_handling: 'exclude' | 'include';
  effective_from: string;
  effective_to: string;
  is_active: boolean;
}

export interface StaffForm {
  name: string;
  department_id: string;
  share_rule_id: string;
  is_active: boolean;
}

export interface AttendanceForm {
  staff_id: string;
  year: number;
  month: number;
  total_days: number;
  worked_days: number;
  paid_leaves: number;
  unpaid_leaves: number;
  half_days: number;
}

export interface MonthlyIncomeForm {
  department_id: string;
  year: number;
  month: number;
  income_amount: number;
}

// ============================================
// Calculation Types
// ============================================

export interface CalculationPreview {
  staff_id: string;
  staff_name: string;
  department_name: string;
  role_name: string;
  distribution_type: string;
  department_income: number;
  rule_percentage: number;
  share_pool: number;
  staff_in_pool: number;
  base_share: number;
  effective_worked_days: number;
  total_days: number;
  attendance_ratio: number;
  final_share: number;
}

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  department?: string;
}

// ============================================
// UI Types
// ============================================

export interface MonthYear {
  year: number;
  month: number;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}
