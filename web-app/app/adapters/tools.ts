import { GET, PUT } from '../../../api/api';
import type { CrunchColumnEntity, ProcessEntity, ProcessStepEntity } from '../../../api/types';
import { toBool } from '../../../api/types';
import { parseJson } from './helpers';

// ── Crunch ───────────────────────────────────

export interface CrunchColumn {
  id: string;
  originalName: string;
  friendlyName: string;
  dataType: string;
  description: string;
  sampleValues: string[];
  isAcronym: boolean;
  acronymExpansion: string;
}

export async function getCrunchColumns(): Promise<CrunchColumn[]> {
  const rows = await GET('crunch-columns') as CrunchColumnEntity[];
  return rows.map(row => ({
    id: row.id,
    originalName: row.original_name,
    friendlyName: row.friendly_name,
    dataType: row.data_type,
    description: row.description,
    sampleValues: parseJson<string[]>(row.sample_values, []),
    isAcronym: toBool(row.is_acronym),
    acronymExpansion: row.acronym_expansion,
  }));
}

// ── Flow ─────────────────────────────────────

export interface FlowListItem {
  id: string;
  name: string;
  description: string;
  department: string;
  stepsCount: number;
}

export async function getFlows(): Promise<FlowListItem[]> {
  const processes = await GET('processes') as ProcessEntity[];
  return Promise.all(processes.map(async (process) => {
    const steps = await GET(`processes/${process.id}/steps`) as ProcessStepEntity[];
    return {
      id: process.id,
      name: process.name,
      description: process.description,
      department: process.department,
      stepsCount: steps.length,
    };
  }));
}

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  owner: string;
  role: string;
  tools: string[];
  duration: string;
  sortOrder: number;
  type: 'action' | 'decision' | 'start' | 'end';
}

export interface Flow {
  name: string;
  description: string;
  department: string;
  steps: ProcessStep[];
}

export async function getFlow(processId: string): Promise<Flow> {
  const process = await GET(`processes/${processId}`) as ProcessEntity | undefined;
  if (!process) {
    return { name: '', description: '', department: '', steps: [] };
  }

  const steps = await GET(`processes/${processId}/steps`) as ProcessStepEntity[];

  return {
    name: process.name,
    description: process.description,
    department: process.department,
    steps: steps.map(step => ({
      id: step.id,
      title: step.title,
      description: step.description,
      owner: step.owner,
      role: step.role,
      tools: parseJson<string[]>(step.tools, []),
      duration: step.duration,
      sortOrder: step.sort_order,
      type: step.type as ProcessStep['type'],
    })),
  };
}

// ── Write Operations ───────────────────────

export async function putProcess(id: string, entity: Partial<ProcessEntity>): Promise<void> {
  await PUT(`processes/${id}`, entity as Record<string, unknown>);
}

export async function putProcessStep(processId: string, stepId: string, entity: Partial<ProcessStepEntity>): Promise<void> {
  await PUT(`processes/${processId}/steps/${stepId}`, entity as Record<string, unknown>);
}
