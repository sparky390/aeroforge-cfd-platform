# Realistic Aerodynamics CFD Platform

A browser-based aerodynamic visualization platform for uploading 3D models, running an OpenFOAM-style CFD pipeline, watching live debug logs, and inspecting airflow in a futuristic engineering dashboard.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, React Three Fiber, Three.js, Framer Motion
- Backend: Rust, Axum, Tokio, Serde
- CFD pipeline: `blockMesh`, `snappyHexMesh`, `simpleFoam` with `kOmegaSST`

## Local Run

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

In a second terminal:

```bash
cargo run --manifest-path backend/Cargo.toml
```

The frontend expects the backend at `http://127.0.0.1:8080`. You can override this with `VITE_API_URL`.

## OpenFOAM Notes

The backend writes a complete case under `jobs/<job_id>/case`, including wind tunnel boundaries, `kOmegaSST`, `blockMeshDict`, `snappyHexMeshDict`, and `simpleFoam` controls.

If OpenFOAM commands are installed and available on `PATH`, the backend runs:

```bash
blockMesh
snappyHexMesh -overwrite
simpleFoam
```

If those commands are not available, the backend logs warnings and generates a lightweight aerodynamic vector/pressure field so the UI remains demo-ready.
