use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobMeta {
    pub id: String,
    pub original_file: String,
    pub upload_path: String,
    pub extension: String,
    pub status: JobStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum JobStatus {
    Uploaded,
    Running,
    Complete,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Info,
    Warning,
    Error,
    Success,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SimulationRequest {
    pub wind_speed: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UploadResponse {
    pub job_id: String,
    pub status: JobStatus,
    pub model_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimulateResponse {
    pub job_id: String,
    pub status: JobStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogsResponse {
    pub job_id: String,
    pub status: JobStatus,
    pub logs: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdPoint {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub pressure: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdMetadata {
    pub solver: String,
    pub turbulence_model: String,
    pub wind_speed: f32,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdResult {
    pub points: Vec<CfdPoint>,
    pub metadata: CfdMetadata,
}
