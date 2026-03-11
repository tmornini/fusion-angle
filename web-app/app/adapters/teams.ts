import { GET } from '../../../api/api';
import type { UserEntity } from '../../../api/types';
import { User } from '../../../api/types';
import { parseJson } from './helpers';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  availability: number;
  performanceScore: number;
  projectsCompleted: number;
  currentProjects: number;
  strengths: string[];
  teamDimensions: Record<string, number>;
  status: string;
}

const TOP_MEMBERS_COUNT = 6;

export async function getTeamMembers(): Promise<TeamMember[]> {
  const rows = await GET('users') as UserEntity[];
  return rows
    .filter(user => user.id !== 'current' && user.department !== '' && user.performance_score > 0)
    .slice(0, TOP_MEMBERS_COUNT)
    .map(user => ({
      id: user.id,
      name: new User(user).fullName(),
      role: user.role,
      department: user.department,
      email: user.email,
      availability: user.availability,
      performanceScore: user.performance_score,
      projectsCompleted: user.projects_completed,
      currentProjects: user.current_projects,
      strengths: parseJson<string[]>(user.strengths, []),
      teamDimensions: parseJson<Record<string, number>>(user.team_dimensions, {}),
      status: user.status,
    }));
}

// ── Manage Users ────────────────────────────

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  department: string;
  status: 'active' | 'pending' | 'deactivated';
  lastActive: string;
}

export async function getManagedUsers(): Promise<ManagedUser[]> {
  const rows = await GET('users') as UserEntity[];
  return rows
    .filter(user => user.id !== 'current')
    .map(user => ({
      id: user.id,
      name: new User(user).fullName(),
      email: user.email,
      role: user.role as ManagedUser['role'],
      department: user.department,
      status: user.status as ManagedUser['status'],
      lastActive: user.last_active,
    }));
}
