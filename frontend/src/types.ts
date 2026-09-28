export type Availability = 'available' | 'empty' | 'pending' | 'unavailable';
export interface Language { name: string; bytes: number; percentage: number }
export interface CommitWeek { week_start: number; commits: number }
export type AvailabilityKey = 'issues' | 'pull_requests' | 'languages' | 'activity' | 'readme';
export interface Analysis {
  full_name: string;
  url: string;
  description: string | null;
  license: string | null;
  pushed_at: string | null;
  stars: number;
  forks: number;
  open_issues: number | null;
  open_pull_requests: number | null;
  languages: Language[];
  activity: CommitWeek[];
  availability: Record<AvailabilityKey, Availability>;
  warnings: string[];
  retrieved_at: string;
  ai_available: boolean;
}
export interface Dimension { score: number | null; explanation: string; evidence: string[] }
export interface Assessment {
  full_name: string;
  status: 'assessed' | 'insufficient_evidence';
  overall_score: number | null;
  dimensions: Record<'maintenance' | 'documentation' | 'community', Dimension>;
  evidence: Record<string, string>;
  limitations: string[];
  provider: string;
  model: string;
  assessed_at: string;
}
