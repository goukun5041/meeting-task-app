import type { Project, ProjectFormInput } from '../types/issue'
import { apiRequest } from './httpClient'

export async function fetchProjects(): Promise<Project[]> {
  const response = await apiRequest<{ projects: Project[] }>('/api/projects')
  return response.projects
}

export async function createProject(input: ProjectFormInput): Promise<Project> {
  const response = await apiRequest<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.project
}

export async function updateProject(id: string, input: ProjectFormInput & { updatedAt: string }): Promise<Project> {
  const response = await apiRequest<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return response.project
}

export async function deleteProject(id: string): Promise<void> {
  await apiRequest<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
