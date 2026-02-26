import { GET } from '../../../api/api';
import type { UserEntity, NotificationEntity } from '../../../api/types';
import { toBool, User } from '../../../api/types';
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  avatar?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  isUnread: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const row = await GET('current-user') as UserEntity | null;
  if (!row) return { id: 'current', name: 'Demo User', email: 'demo@example.com', role: 'Admin', company: 'Demo Company' };
  return {
    id: row.id,
    name: new User(row).fullName(),
    email: row.email,
    role: row.role,
    company: 'Demo Company',
  };
}

export async function getNotifications(): Promise<Notification[]> {
  const rows = await GET('notifications') as NotificationEntity[];
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    message: row.message,
    time: row.time,
    isUnread: toBool(row.is_unread),
  }));
}
