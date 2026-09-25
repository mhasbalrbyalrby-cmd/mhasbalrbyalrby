export interface BiometricLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  device_id: string;
  biometric_user_id: string;
  punch_type: 'check_in' | 'check_out' | 'shift_start' | 'shift_end' | 'verify_action';
  timestamp: string;
  status: string;
  created_at: string;
}
