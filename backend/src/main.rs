mod models;
mod pipeline;

use std::{net::SocketAddr, path::PathBuf};

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{SecondsFormat, Utc};
use models::{
    JobMeta, JobStatus, LogsResponse, LogLevel, SimulateResponse, SimulationRequest, UploadResponse,
};
use serde::Serialize;
use tokio::fs;
use tower_http::{cors::CorsLayer, services::ServeDir};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    jobs_root: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("aerodynamics_cfd_backend=info,tower_http=info")
        .init();

    let jobs_root = std::env::current_dir()?.join("jobs");
    fs::create_dir_all(&jobs_root).await?;

    let state = AppState {
        jobs_root: jobs_root.clone(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/upload", post(upload))
        .route("/simulate/{job_id}", post(simulate))
        .route("/logs/{job_id}", get(logs))
        .route("/result/{job_id}", get(result))
        .route("/model/{job_id}", get(model))
        .nest_service("/jobs", ServeDir::new(jobs_root))
        .layer(DefaultBodyLimit::max(220 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let address = SocketAddr::from(([127, 0, 0, 1], 8080));
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("AeroForge CFD backend listening on http://{address}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "solver": "simpleFoam",
        "turbulence_model": "kOmegaSST"
    }))
}

async fn upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, ApiError> {
    let job_id = Uuid::new_v4().to_string();
    let job_dir = state.jobs_root.join(&job_id);
    let upload_dir = job_dir.join("upload");
    fs::create_dir_all(&upload_dir).await.map_err(ApiError::internal)?;

    let mut saved_file: Option<(String, PathBuf, String)> = None;

    while let Some(field) = multipart.next_field().await.map_err(ApiError::bad_request)? {
        let Some(file_name) = field.file_name().map(sanitize_filename) else {
            continue;
        };

        let extension = file_name
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();

        if !matches!(extension.as_str(), "obj" | "stl" | "gltf" | "glb") {
            return Err(ApiError::bad_request(format!(
                "Unsupported file extension '.{extension}'. Upload OBJ, STL, GLTF, or GLB."
            )));
        }

        let bytes = field.bytes().await.map_err(ApiError::bad_request)?;
        let upload_path = upload_dir.join(&file_name);
        fs::write(&upload_path, bytes).await.map_err(ApiError::internal)?;
        saved_file = Some((file_name, upload_path, extension));
        break;
    }

    let Some((file_name, upload_path, extension)) = saved_file else {
        return Err(ApiError::bad_request("Multipart form did not contain a file"));
    };

    let meta = JobMeta {
        id: job_id.clone(),
        original_file: file_name.clone(),
        upload_path: upload_path.to_string_lossy().to_string(),
        extension,
        status: JobStatus::Uploaded,
        created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
    };

    pipeline::write_meta(&job_dir, &meta)
        .await
        .map_err(ApiError::internal)?;
    pipeline::append_log(
        &job_dir,
        LogLevel::Info,
        format!("Upload received: {file_name}"),
    )
    .await
    .map_err(ApiError::internal)?;
    pipeline::append_log(
        &job_dir,
        LogLevel::Info,
        "Job initialized under jobs/<job_id>/ with OpenFOAM case generation queued.",
    )
    .await
    .map_err(ApiError::internal)?;

    Ok(Json(UploadResponse {
        job_id: job_id.clone(),
        status: JobStatus::Uploaded,
        model_url: format!("/model/{job_id}"),
    }))
}

async fn simulate(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    body: Option<Json<SimulationRequest>>,
) -> Result<Json<SimulateResponse>, ApiError> {
    let job_dir = state.jobs_root.join(&job_id);
    if !job_dir.exists() {
        return Err(ApiError::not_found("Unknown job id"));
    }

    let mut meta = pipeline::read_meta(&job_dir)
        .await
        .map_err(ApiError::internal)?;
    if matches!(meta.status, JobStatus::Running) {
        return Ok(Json(SimulateResponse {
            job_id,
            status: JobStatus::Running,
        }));
    }

    meta.status = JobStatus::Running;
    pipeline::write_meta(&job_dir, &meta)
        .await
        .map_err(ApiError::internal)?;

    let request = body.map(|Json(value)| value).unwrap_or_default();
    let job_id_for_task = job_id.clone();
    tokio::spawn(async move {
        if let Err(error) = pipeline::run_job(&job_dir, request).await {
            let _ = pipeline::append_log(&job_dir, LogLevel::Error, format!("{error:#}")).await;
            let _ = pipeline::set_status(&job_dir, JobStatus::Failed).await;
        }
    });

    Ok(Json(SimulateResponse {
        job_id: job_id_for_task,
        status: JobStatus::Running,
    }))
}

async fn logs(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Json<LogsResponse>, ApiError> {
    let job_dir = state.jobs_root.join(&job_id);
    if !job_dir.exists() {
        return Err(ApiError::not_found("Unknown job id"));
    }
    let meta = pipeline::read_meta(&job_dir)
        .await
        .map_err(ApiError::internal)?;
    let entries = pipeline::read_logs(&job_dir)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(LogsResponse {
        job_id,
        status: meta.status,
        logs: entries,
    }))
}

async fn result(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Response, ApiError> {
    let path = state.jobs_root.join(&job_id).join("result.json");
    if !path.exists() {
        return Err(ApiError::not_found("Result is not ready yet"));
    }
    let bytes = fs::read(path).await.map_err(ApiError::internal)?;
    Ok((
        [(header::CONTENT_TYPE, HeaderValue::from_static("application/json"))],
        bytes,
    )
        .into_response())
}

async fn model(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Response, ApiError> {
    let job_dir = state.jobs_root.join(&job_id);
    let meta = pipeline::read_meta(&job_dir)
        .await
        .map_err(ApiError::internal)?;
    let stl_path = pipeline::model_stl_path(&job_dir);
    let fallback = PathBuf::from(meta.upload_path);
    let path = if stl_path.exists() { stl_path } else { fallback };
    if !path.exists() {
        return Err(ApiError::not_found("Model file is not available"));
    }
    let content_type = if path.extension().and_then(|value| value.to_str()) == Some("stl") {
        "model/stl"
    } else {
        "application/octet-stream"
    };
    let bytes = fs::read(path).await.map_err(ApiError::internal)?;
    Ok((
        [(header::CONTENT_TYPE, HeaderValue::from_static(content_type))],
        Body::from(bytes),
    )
        .into_response())
}

fn sanitize_filename(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "model.stl".to_string()
    } else {
        sanitized
    }
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl ApiError {
    fn bad_request(error: impl ToString) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: error.to_string(),
        }
    }

    fn not_found(error: impl ToString) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: error.to_string(),
        }
    }

    fn internal(error: impl ToString) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                error: self.message,
            }),
        )
            .into_response()
    }
}
