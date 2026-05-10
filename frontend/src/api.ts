import type { CfdResult, LogsResponse, SimulateResponse, UploadResponse } from './types';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080';

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function uploadModel(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return requestJson<UploadResponse>(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function startSimulation(jobId: string, windSpeed: number): Promise<SimulateResponse> {
  return requestJson<SimulateResponse>(`${API_BASE}/simulate/${jobId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wind_speed: windSpeed }),
  });
}

export async function fetchLogs(jobId: string): Promise<LogsResponse> {
  return requestJson<LogsResponse>(`${API_BASE}/logs/${jobId}`);
}

export async function fetchResult(jobId: string): Promise<CfdResult> {
  return requestJson<CfdResult>(`${API_BASE}/result/${jobId}`);
}

export function modelUrl(jobId: string): string {
  return `${API_BASE}/model/${jobId}`;
}
