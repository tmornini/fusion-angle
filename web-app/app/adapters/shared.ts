import { GET } from '../../../api/api';
import type { UserEntity, CompanySettingsEntity } from '../../../api/types';
import { User } from '../../../api/types';
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  avatar?: string;
}

export function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const [row, settings] = await Promise.all([
    GET('current-user') as Promise<UserEntity>,
    GET('company-settings') as Promise<CompanySettingsEntity>,
  ]);
  return {
    id: row.id,
    name: new User(row).fullName(),
    email: row.email,
    role: row.role,
    company: settings.name,
  };
}
