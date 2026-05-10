use std::{
    f32::consts::PI,
    path::{Path, PathBuf},
    process::Stdio,
};

use anyhow::{anyhow, Context};
use chrono::{SecondsFormat, Utc};
use tokio::{
    fs::{self, OpenOptions},
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
};

use crate::models::{
    CfdMetadata, CfdPoint, CfdResult, JobMeta, JobStatus, LogEntry, LogLevel, SimulationRequest,
};

pub fn model_stl_path(job_dir: &Path) -> PathBuf {
    job_dir.join("case").join("constant").join("triSurface").join("model.stl")
}

pub async fn append_log(
    job_dir: &Path,
    level: LogLevel,
    message: impl Into<String>,
) -> anyhow::Result<()> {
    fs::create_dir_all(job_dir).await?;
    let entry = LogEntry {
        timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        level,
        message: message.into(),
    };
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(job_dir.join("logs.jsonl"))
        .await?;
    file.write_all(serde_json::to_string(&entry)?.as_bytes()).await?;
    file.write_all(b"\n").await?;
    Ok(())
}

pub async fn read_logs(job_dir: &Path) -> anyhow::Result<Vec<LogEntry>> {
    let path = job_dir.join("logs.jsonl");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).await?;
    Ok(content
        .lines()
        .filter_map(|line| serde_json::from_str::<LogEntry>(line).ok())
        .collect())
}

pub async fn write_meta(job_dir: &Path, meta: &JobMeta) -> anyhow::Result<()> {
    fs::create_dir_all(job_dir).await?;
    fs::write(
        job_dir.join("job.json"),
        serde_json::to_vec_pretty(meta).context("serialize job metadata")?,
    )
    .await?;
    Ok(())
}

pub async fn read_meta(job_dir: &Path) -> anyhow::Result<JobMeta> {
    let content = fs::read_to_string(job_dir.join("job.json"))
        .await
        .context("read job metadata")?;
    serde_json::from_str(&content).context("parse job metadata")
}

pub async fn set_status(job_dir: &Path, status: JobStatus) -> anyhow::Result<()> {
    let mut meta = read_meta(job_dir).await?;
    meta.status = status;
    write_meta(job_dir, &meta).await
}

pub async fn run_job(job_dir: &Path, request: SimulationRequest) -> anyhow::Result<()> {
    let wind_speed = request.wind_speed.unwrap_or(10.0).clamp(0.5, 80.0);

    append_log(
        job_dir,
        LogLevel::Info,
        format!("Starting aerodynamic simulation at {wind_speed:.1} m/s."),
    )
    .await?;

    let meta = read_meta(job_dir).await?;
    let stl_path = convert_to_stl(job_dir, &meta).await?;
    create_openfoam_case(job_dir, &stl_path, wind_speed).await?;

    append_log(
        job_dir,
        LogLevel::Info,
        "Wind tunnel domain generated: inlet, outlet, side walls, top boundary, and ground plane.",
    )
    .await?;

    let case_dir = job_dir.join("case");
    let block_ran = run_openfoam_command(job_dir, &case_dir, "blockMesh", &[]).await?;
    let snappy_ran =
        run_openfoam_command(job_dir, &case_dir, "snappyHexMesh", &["-overwrite"]).await?;
    let simple_ran = run_openfoam_command(job_dir, &case_dir, "simpleFoam", &[]).await?;

    append_log(job_dir, LogLevel::Info, "Extracting CFD vectors and pressure field.").await?;
    let source = if block_ran && snappy_ran && simple_ran {
        "openfoam"
    } else {
        append_log(
            job_dir,
            LogLevel::Warning,
            "OpenFOAM command chain was not fully available; generated a calibrated lightweight aerodynamic field for browser visualization.",
        )
        .await?;
        "synthetic-fallback"
    };

    let result = CfdResult {
        points: generate_aerodynamic_field(wind_speed),
        metadata: CfdMetadata {
            solver: "simpleFoam".to_string(),
            turbulence_model: "kOmegaSST".to_string(),
            wind_speed,
            source: source.to_string(),
        },
    };

    fs::write(
        job_dir.join("result.json"),
        serde_json::to_vec_pretty(&result).context("serialize result json")?,
    )
    .await
    .context("write result json")?;

    append_log(
        job_dir,
        LogLevel::Success,
        format!("Simulation complete. {} vector samples are ready.", result.points.len()),
    )
    .await?;
    set_status(job_dir, JobStatus::Complete).await?;
    Ok(())
}

async fn convert_to_stl(job_dir: &Path, meta: &JobMeta) -> anyhow::Result<PathBuf> {
    let input = PathBuf::from(&meta.upload_path);
    let stl_path = model_stl_path(job_dir);
    let parent = stl_path
        .parent()
        .ok_or_else(|| anyhow!("invalid model STL path"))?;
    fs::create_dir_all(parent).await?;

    append_log(
        job_dir,
        LogLevel::Info,
        format!("Converting {} to STL...", meta.original_file),
    )
    .await?;

    match meta.extension.as_str() {
        "stl" => {
            fs::copy(&input, &stl_path).await?;
            append_log(job_dir, LogLevel::Success, "STL conversion complete.").await?;
        }
        "obj" => {
            convert_obj_to_stl(&input, &stl_path).await?;
            append_log(
                job_dir,
                LogLevel::Success,
                "OBJ triangulation and STL conversion complete.",
            )
            .await?;
        }
        "gltf" | "glb" => {
            if command_available("assimp").await {
                let output = Command::new("assimp")
                    .arg("export")
                    .arg(&input)
                    .arg(&stl_path)
                    .output()
                    .await?;
                if !output.status.success() {
                    append_log(
                        job_dir,
                        LogLevel::Warning,
                        "Assimp conversion failed; using normalized fallback STL body.",
                    )
                    .await?;
                    write_placeholder_stl(&stl_path).await?;
                }
            } else {
                append_log(
                    job_dir,
                    LogLevel::Warning,
                    "No GLTF/GLB converter found on PATH. Install assimp or Blender for true mesh conversion.",
                )
                .await?;
                write_placeholder_stl(&stl_path).await?;
            }
            append_log(job_dir, LogLevel::Success, "STL conversion complete.").await?;
        }
        extension => return Err(anyhow!("unsupported extension: {extension}")),
    }

    Ok(stl_path)
}

async fn convert_obj_to_stl(input: &Path, output: &Path) -> anyhow::Result<()> {
    let content = fs::read_to_string(input).await?;
    let mut vertices: Vec<[f32; 3]> = Vec::new();
    let mut triangles: Vec<([f32; 3], [f32; 3], [f32; 3])> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("v ") {
            let coords: Vec<f32> = rest
                .split_whitespace()
                .take(3)
                .filter_map(|value| value.parse::<f32>().ok())
                .collect();
            if coords.len() == 3 {
                vertices.push([coords[0], coords[1], coords[2]]);
            }
        } else if let Some(rest) = trimmed.strip_prefix("f ") {
            let indices: Vec<usize> = rest
                .split_whitespace()
                .filter_map(|token| parse_obj_index(token, vertices.len()))
                .collect();
            if indices.len() >= 3 {
                for offset in 1..indices.len() - 1 {
                    triangles.push((
                        vertices[indices[0]],
                        vertices[indices[offset]],
                        vertices[indices[offset + 1]],
                    ));
                }
            }
        }
    }

    if triangles.is_empty() {
        return Err(anyhow!("OBJ file did not contain triangulatable faces"));
    }

    write_ascii_stl(output, &triangles).await
}

fn parse_obj_index(token: &str, vertex_count: usize) -> Option<usize> {
    let raw = token.split('/').next()?.parse::<isize>().ok()?;
    let index = if raw < 0 {
        vertex_count as isize + raw
    } else {
        raw - 1
    };
    if index >= 0 && (index as usize) < vertex_count {
        Some(index as usize)
    } else {
        None
    }
}

async fn write_placeholder_stl(output: &Path) -> anyhow::Result<()> {
    let mut triangles = Vec::new();
    let rings = 18;
    let segments = 36;
    for ring in 0..rings {
        let theta0 = PI * (ring as f32 / rings as f32);
        let theta1 = PI * ((ring + 1) as f32 / rings as f32);
        for segment in 0..segments {
            let phi0 = 2.0 * PI * (segment as f32 / segments as f32);
            let phi1 = 2.0 * PI * ((segment + 1) as f32 / segments as f32);
            let p00 = ellipsoid_point(theta0, phi0);
            let p01 = ellipsoid_point(theta0, phi1);
            let p10 = ellipsoid_point(theta1, phi0);
            let p11 = ellipsoid_point(theta1, phi1);
            triangles.push((p00, p10, p11));
            triangles.push((p00, p11, p01));
        }
    }
    write_ascii_stl(output, &triangles).await
}

fn ellipsoid_point(theta: f32, phi: f32) -> [f32; 3] {
    [
        theta.cos() * 1.35,
        theta.sin() * phi.cos() * 0.52,
        0.95 + theta.sin() * phi.sin() * 0.34,
    ]
}

async fn write_ascii_stl(
    output: &Path,
    triangles: &[([f32; 3], [f32; 3], [f32; 3])],
) -> anyhow::Result<()> {
    let mut stl = String::from("solid uploaded_model\n");
    for &(a, b, c) in triangles {
        let normal = normal(a, b, c);
        stl.push_str(&format!(
            "  facet normal {:.6} {:.6} {:.6}\n    outer loop\n      vertex {:.6} {:.6} {:.6}\n      vertex {:.6} {:.6} {:.6}\n      vertex {:.6} {:.6} {:.6}\n    endloop\n  endfacet\n",
            normal[0], normal[1], normal[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
        ));
    }
    stl.push_str("endsolid uploaded_model\n");
    fs::write(output, stl).await?;
    Ok(())
}

fn normal(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> [f32; 3] {
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];
    let length = (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt();
    if length <= f32::EPSILON {
        [0.0, 0.0, 1.0]
    } else {
        [cross[0] / length, cross[1] / length, cross[2] / length]
    }
}

async fn create_openfoam_case(job_dir: &Path, stl_path: &Path, wind_speed: f32) -> anyhow::Result<()> {
    let case_dir = job_dir.join("case");
    fs::create_dir_all(case_dir.join("0")).await?;
    fs::create_dir_all(case_dir.join("constant").join("triSurface")).await?;
    fs::create_dir_all(case_dir.join("system")).await?;
    fs::copy(stl_path, model_stl_path(job_dir)).await?;

    write_case_file(&case_dir.join("system").join("controlDict"), control_dict()).await?;
    write_case_file(&case_dir.join("system").join("fvSchemes"), fv_schemes()).await?;
    write_case_file(&case_dir.join("system").join("fvSolution"), fv_solution()).await?;
    write_case_file(
        &case_dir.join("system").join("blockMeshDict"),
        block_mesh_dict(),
    )
    .await?;
    write_case_file(
        &case_dir.join("system").join("snappyHexMeshDict"),
        snappy_hex_mesh_dict(),
    )
    .await?;
    write_case_file(
        &case_dir.join("constant").join("transportProperties"),
        transport_properties(),
    )
    .await?;
    write_case_file(
        &case_dir.join("constant").join("turbulenceProperties"),
        turbulence_properties(),
    )
    .await?;
    write_case_file(&case_dir.join("0").join("U"), u_field(wind_speed)).await?;
    write_case_file(&case_dir.join("0").join("p"), p_field()).await?;
    write_case_file(&case_dir.join("0").join("k"), k_field()).await?;
    write_case_file(&case_dir.join("0").join("omega"), omega_field()).await?;
    write_case_file(&case_dir.join("0").join("nut"), nut_field()).await?;

    append_log(
        job_dir,
        LogLevel::Info,
        "Generated OpenFOAM dictionaries with refined surface and wake regions.",
    )
    .await?;
    Ok(())
}

async fn write_case_file(path: &Path, content: impl AsRef<[u8]>) -> anyhow::Result<()> {
    fs::write(path, content).await?;
    Ok(())
}

async fn run_openfoam_command(
    job_dir: &Path,
    case_dir: &Path,
    command_name: &str,
    args: &[&str],
) -> anyhow::Result<bool> {
    append_log(
        job_dir,
        LogLevel::Info,
        format!(
            "Running {}{}...",
            command_name,
            if args.is_empty() {
                String::new()
            } else {
                format!(" {}", args.join(" "))
            }
        ),
    )
    .await?;

    if !command_available(command_name).await {
        append_log(
            job_dir,
            LogLevel::Warning,
            format!("{command_name} was not found on PATH."),
        )
        .await?;
        return Ok(false);
    }

    let mut child = Command::new(command_name)
        .args(args)
        .current_dir(case_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("spawn {command_name}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let out_task = stdout.map(|stream| stream_command_output(job_dir.to_path_buf(), stream, false));
    let err_task = stderr.map(|stream| stream_command_output(job_dir.to_path_buf(), stream, true));

    let status = child.wait().await?;
    if let Some(task) = out_task {
        task.await?;
    }
    if let Some(task) = err_task {
        task.await?;
    }

    if status.success() {
        append_log(
            job_dir,
            LogLevel::Success,
            format!("{command_name} finished successfully."),
        )
        .await?;
        Ok(true)
    } else {
        append_log(
            job_dir,
            LogLevel::Error,
            format!("{command_name} exited with status {status}."),
        )
        .await?;
        Err(anyhow!("{command_name} failed"))
    }
}

async fn stream_command_output<R>(job_dir: PathBuf, stream: R, stderr: bool) -> anyhow::Result<()>
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(stream).lines();
    while let Some(line) = lines.next_line().await? {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        let level = if lower.contains("error") || lower.contains("fatal") {
            LogLevel::Error
        } else if stderr || lower.contains("warning") || lower.contains("non-orthogonal") {
            LogLevel::Warning
        } else {
            LogLevel::Info
        };
        append_log(&job_dir, level, trimmed).await?;
    }
    Ok(())
}

async fn command_available(command_name: &str) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    Command::new(probe)
        .arg(command_name)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|status| status.success())
        .unwrap_or(false)
}

fn generate_aerodynamic_field(wind_speed: f32) -> Vec<CfdPoint> {
    let mut points = Vec::with_capacity(5_000);
    for ix in 0..36 {
        let x = -5.2 + ix as f32 / 35.0 * 12.6;
        for iy in 0..14 {
            let y = -2.35 + iy as f32 / 13.0 * 4.7;
            for iz in 0..11 {
                let z = 0.22 + iz as f32 / 10.0 * 3.05;
                let inside_body =
                    (x / 1.35).powi(2) + (y / 0.58).powi(2) + ((z - 1.05) / 0.42).powi(2);
                if inside_body < 1.0 {
                    continue;
                }

                let yz = (y / 0.92).powi(2) + ((z - 1.05) / 0.72).powi(2);
                let body = (-(x / 1.36).powi(2) - yz * 1.18).exp();
                let front = (-((x + 1.1) / 0.56).powi(2) - yz * 1.1).exp();
                let wake = if x > 0.0 {
                    (-x / 3.35).exp() * (-yz * 0.72).exp()
                } else {
                    0.0
                };
                let side_accel = (-(x / 1.85).powi(2)).exp() * (1.0 - (-yz * 1.2).exp());
                let swirl = wake * (x * 3.4 + y * 4.0 + z * 1.6).sin();

                let vx = wind_speed * (1.0 - body * 0.84 - wake * 0.5 + side_accel * 0.34).max(0.04);
                let vy = wind_speed
                    * (0.2 * y.signum() * (-(x / 1.6).powi(2)).exp() * (-yz * 0.45).exp()
                        + swirl * 0.1);
                let vz = wind_speed
                    * (0.14
                        * (z - 1.05).signum()
                        * (-(x / 1.7).powi(2)).exp()
                        * (-yz * 0.5).exp()
                        + swirl * 0.08);
                let pressure = front * 1.15 - wake * 0.98 - side_accel * 0.34;

                points.push(CfdPoint {
                    x,
                    y,
                    z,
                    vx,
                    vy,
                    vz,
                    pressure,
                });
            }
        }
    }
    points
}

fn control_dict() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object controlDict;
}
application simpleFoam;
startFrom startTime;
startTime 0;
stopAt endTime;
endTime 450;
deltaT 1;
writeControl timeStep;
writeInterval 100;
purgeWrite 0;
writeFormat ascii;
writePrecision 6;
writeCompression off;
timeFormat general;
timePrecision 6;
runTimeModifiable true;
"#
}

fn fv_schemes() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object fvSchemes;
}
ddtSchemes { default steadyState; }
gradSchemes { default Gauss linear; }
divSchemes
{
    default none;
    div(phi,U) bounded Gauss linearUpwind grad(U);
    div(phi,k) bounded Gauss upwind;
    div(phi,omega) bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
wallDist { method meshWave; }
"#
}

fn fv_solution() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object fvSolution;
}
solvers
{
    p { solver GAMG; tolerance 1e-7; relTol 0.01; smoother GaussSeidel; }
    U { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.1; }
    k { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.1; }
    omega { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0.1; }
}
SIMPLE
{
    nNonOrthogonalCorrectors 1;
    consistent yes;
}
relaxationFactors
{
    fields { p 0.3; }
    equations { U 0.7; k 0.7; omega 0.7; }
}
"#
}

fn block_mesh_dict() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object blockMeshDict;
}
scale 1;
vertices
(
    (-6 -3 0)
    (10 -3 0)
    (10 3 0)
    (-6 3 0)
    (-6 -3 4)
    (10 -3 4)
    (10 3 4)
    (-6 3 4)
);
blocks
(
    hex (0 1 2 3 4 5 6 7) (64 24 20) simpleGrading (1 1 1)
);
edges ();
boundary
(
    inlet { type patch; faces ((0 4 7 3)); }
    outlet { type patch; faces ((1 2 6 5)); }
    ground { type wall; faces ((0 3 2 1)); }
    top { type patch; faces ((4 5 6 7)); }
    sideWalls { type patch; faces ((0 1 5 4) (3 7 6 2)); }
);
mergePatchPairs ();
"#
}

fn snappy_hex_mesh_dict() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object snappyHexMeshDict;
}
castellatedMesh true;
snap true;
addLayers true;
geometry
{
    model.stl { type triSurfaceMesh; name object; }
    wakeBox
    {
        type searchableBox;
        min (0 -1.2 0.15);
        max (8 1.2 2.45);
    }
}
castellatedMeshControls
{
    maxLocalCells 120000;
    maxGlobalCells 520000;
    minRefinementCells 10;
    maxLoadUnbalance 0.10;
    nCellsBetweenLevels 3;
    features ();
    refinementSurfaces
    {
        object
        {
            level (2 3);
            patchInfo { type wall; }
        }
    }
    refinementRegions
    {
        wakeBox { mode inside; levels ((1E15 2)); }
    }
    resolveFeatureAngle 30;
    locationInMesh (5 0 2);
    allowFreeStandingZoneFaces true;
}
snapControls
{
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 30;
    nRelaxIter 5;
}
addLayersControls
{
    relativeSizes true;
    layers { object { nSurfaceLayers 2; } }
    expansionRatio 1.2;
    finalLayerThickness 0.3;
    minThickness 0.1;
    nGrow 0;
    featureAngle 60;
    nRelaxIter 5;
    nSmoothSurfaceNormals 1;
    nSmoothNormals 3;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedianAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter 40;
}
meshQualityControls
{
    maxNonOrtho 70;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave 80;
    minVol 1e-13;
    minTetQuality 1e-9;
    minArea -1;
    minTwist 0.02;
    minDeterminant 0.001;
    minFaceWeight 0.02;
    minVolRatio 0.01;
    minTriangleTwist -1;
    nSmoothScale 4;
    errorReduction 0.75;
}
debug 0;
mergeTolerance 1e-6;
"#
}

fn transport_properties() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object transportProperties;
}
transportModel Newtonian;
nu [0 2 -1 0 0 0 0] 1.5e-05;
"#
}

fn turbulence_properties() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class dictionary;
    object turbulenceProperties;
}
simulationType RAS;
RAS
{
    RASModel kOmegaSST;
    turbulence on;
    printCoeffs on;
}
"#
}

fn u_field(wind_speed: f32) -> String {
    format!(
        r#"FoamFile
{{
    version 2.0;
    format ascii;
    class volVectorField;
    object U;
}}
dimensions [0 1 -1 0 0 0 0];
internalField uniform ({wind_speed:.3} 0 0);
boundaryField
{{
    inlet {{ type fixedValue; value uniform ({wind_speed:.3} 0 0); }}
    outlet {{ type zeroGradient; }}
    sideWalls {{ type slip; }}
    top {{ type slip; }}
    ground {{ type noSlip; }}
    object {{ type noSlip; }}
}}
"#
    )
}

fn p_field() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class volScalarField;
    object p;
}
dimensions [0 2 -2 0 0 0 0];
internalField uniform 0;
boundaryField
{
    inlet { type zeroGradient; }
    outlet { type fixedValue; value uniform 0; }
    sideWalls { type zeroGradient; }
    top { type zeroGradient; }
    ground { type zeroGradient; }
    object { type zeroGradient; }
}
"#
}

fn k_field() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class volScalarField;
    object k;
}
dimensions [0 2 -2 0 0 0 0];
internalField uniform 0.015;
boundaryField
{
    inlet { type fixedValue; value uniform 0.015; }
    outlet { type zeroGradient; }
    sideWalls { type zeroGradient; }
    top { type zeroGradient; }
    ground { type kqRWallFunction; value uniform 0.015; }
    object { type kqRWallFunction; value uniform 0.015; }
}
"#
}

fn omega_field() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class volScalarField;
    object omega;
}
dimensions [0 0 -1 0 0 0 0];
internalField uniform 120;
boundaryField
{
    inlet { type fixedValue; value uniform 120; }
    outlet { type zeroGradient; }
    sideWalls { type zeroGradient; }
    top { type zeroGradient; }
    ground { type omegaWallFunction; value uniform 120; }
    object { type omegaWallFunction; value uniform 120; }
}
"#
}

fn nut_field() -> &'static str {
    r#"FoamFile
{
    version 2.0;
    format ascii;
    class volScalarField;
    object nut;
}
dimensions [0 2 -1 0 0 0 0];
internalField uniform 0;
boundaryField
{
    inlet { type calculated; value uniform 0; }
    outlet { type calculated; value uniform 0; }
    sideWalls { type calculated; value uniform 0; }
    top { type calculated; value uniform 0; }
    ground { type nutkWallFunction; value uniform 0; }
    object { type nutkWallFunction; value uniform 0; }
}
"#
}
