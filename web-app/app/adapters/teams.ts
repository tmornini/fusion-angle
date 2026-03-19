import { GET } from '../../../api/api';
import type {
    UserEntity,
} from '../../../api/types';
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

export async function getTeamMembers(
): Promise<TeamMember[]> {
  const rows =
    await GET<UserEntity[]>('users');
  return rows
    .filter(entity =>
      entity.id !== 'current'
      && entity.department !== ''
      && entity.performance_score > 0,
    )
    .slice(0, TOP_MEMBERS_COUNT)
    .map(entity => {
      const user = new User(entity);
      return {
        id: user.id,
        name: user.fullName(),
        role: user.role,
        department: user.department,
        email: user.email,
        availability: user.availability,
        performanceScore:
          user.performanceScore,
        projectsCompleted:
          user.projectsCompleted,
        currentProjects:
          user.currentProjects,
        strengths: parseJson<string[]>(
          user.strengths,
          [],
        ),
        teamDimensions:
          parseJson<
            Record<string, number>
          >(user.teamDimensions, {}),
        status: user.status,
      };
    });
}

// ── Manage Users ──────────────────

export type UserRole =
    | 'admin'
    | 'manager'
    | 'member'
    | 'viewer';

export type UserAccountStatus =
    | 'active'
    | 'pending'
    | 'deactivated';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  lastActive: string;
}

export async function getManagedUsers(
): Promise<ManagedUser[]> {
  const rows =
    await GET<UserEntity[]>('users');
  return rows
    .filter(
      entity => entity.id !== 'current',
    )
    .map(entity => {
      const user = new User(entity);
      return {
        id: user.id,
        name: user.fullName(),
        email: user.email,
        role: user.role,
        department: user.department,
        status: user.status,
        lastActive: user.lastActive,
      };
    });
}
