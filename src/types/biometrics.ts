export type PunchType = 'check_in' | 'check_out' | 'shift_start' | 'shift_end' | 'verify_action';

export type BiometricLogStatus = 'success' | 'failed' | 'unrecognized' | 'pending';

export interface BiometricLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  device_id: string;
  biometric_user_id: string;
  punch_type: PunchType;
  timestamp: string;
  status: BiometricLogStatus | string;
  created_at: string;
}

export interface BiometricDevice {
  id: string;
  tenant_id: string;
  device_name: string;
  ip_address: string;
  port: number;
  location?: string;
  status: 'online' | 'offline';
  last_sync_at?: string;
  created_at: string;
}
