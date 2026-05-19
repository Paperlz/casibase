import { apiFetch, apiPost } from "~/lib/api"

export type SkillReference = {
  name: string
  content?: string
}

export type MarketplaceSource = {
  id: string
  name: string
}

export type MarketplaceSkill = {
  source?: string
  name: string
  displayName?: string
  type?: string
  description?: string
  homepage?: string
  emoji?: string
  tags?: string[]
}

export type Skill = {
  owner: string
  name: string
  createdTime: string
  displayName: string
  type: string
  description: string
  homepage: string
  emoji: string
  metadata: string
  content: string
  skillMd: string
  references: SkillReference[]
  state: string
}

export function getGlobalSkills(): Promise<any> {
  return apiFetch("/api/get-global-skills")
}

export function getSkills(
  owner: string,
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  return apiFetch(
    `/api/get-skills?owner=${encodeURIComponent(owner)}&p=${page}&pageSize=${pageSize}&field=${field}&value=${encodeURIComponent(value)}&sortField=${sortField}&sortOrder=${sortOrder}`
  )
}

export function getSkill(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-skill?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function updateSkill(owner: string, name: string, skill: Skill): Promise<any> {
  return apiPost(`/api/update-skill?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, skill)
}

export function addSkill(skill: Skill): Promise<any> {
  return apiPost("/api/add-skill", skill)
}

export function deleteSkill(skill: Skill): Promise<any> {
  return apiPost("/api/delete-skill", skill)
}

export function loadSkill(path: string): Promise<any> {
  return apiFetch(`/api/load-skill?path=${encodeURIComponent(path)}`)
}

export function getMarketplaceSources(): Promise<any> {
  return apiFetch("/api/get-marketplace-sources")
}

export function getMarketplaceSkills(source = "", keyword = ""): Promise<any> {
  return apiFetch(
    `/api/get-marketplace-skills?source=${encodeURIComponent(source)}&keyword=${encodeURIComponent(keyword)}`
  )
}

export function installMarketplaceSkill(item: MarketplaceSkill): Promise<any> {
  return apiPost("/api/install-marketplace-skill", item)
}
