export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
export type JobStatus = 'Uploaded' | 'Running' | 'Complete' | 'Failed' | 'Unknown';
export type ViewMode = 'velocity' | 'pressure' | 'vectors';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface UploadResponse {
  job_id: string;
  status: JobStatus;
  model_url: string;
}

export interface LogsResponse {
  job_id: string;
  status: JobStatus;
  logs: LogEntry[];
}

export interface SimulateResponse {
  job_id: string;
  status: JobStatus;
}

export interface CfdPoint {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  pressure: number;
}

export interface CfdResult {
  points: CfdPoint[];
  metadata?: {
    solver: string;
    turbulence_model: string;
    wind_speed: number;
    source: string;
  };
}
