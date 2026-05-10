import { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, Gauge, Radar, UploadCloud } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchLogs, fetchResult, modelUrl, startSimulation, uploadModel } from './api';
import { DebugConsole } from './components/DebugConsole';
import { ModelUploadPanel } from './components/ModelUploadPanel';
import { SimulationViewer } from './components/SimulationViewer';
import type { CfdResult, JobStatus, LogEntry, UploadResponse, ViewMode } from './types';

type RotationAxis = 'x' | 'y' | 'z';

type ModelRotation = Record<RotationAxis, number>;

const emptyLogs: LogEntry[] = [
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: 'AeroForge diagnostics online. Upload a model to initialize the wind tunnel.',
  },
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localModelUrl, setLocalModelUrl] = useState<string | null>(null);
  const [job, setJob] = useState<UploadResponse | null>(null);
  const [status, setStatus] = useState<JobStatus>('Unknown');
  const [logs, setLogs] = useState<LogEntry[]>(emptyLogs);
  const [result, setResult] = useState<CfdResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('velocity');
  const [windSpeed, setWindSpeed] = useState(10);
  const [modelRotation, setModelRotation] = useState<ModelRotation>({ x: 0, y: 0, z: 0 });
  const [busy, setBusy] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerModelUrl = useMemo(() => {
    if (localModelUrl) return localModelUrl;
    if (job) return modelUrl(job.job_id);
    return null;
  }, [job, localModelUrl]);

  useEffect(() => {
    return () => {
      if (localModelUrl) URL.revokeObjectURL(localModelUrl);
    };
  }, [localModelUrl]);

  useEffect(() => {
    if (!job) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetchLogs(job.job_id);
        if (cancelled) return;
        setLogs(response.logs.length ? response.logs : emptyLogs);
        setStatus(response.status);
        if (response.status === 'Complete' && !result) {
          const data = await fetchResult(job.job_id);
          if (!cancelled) setResult(data);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : 'Unable to fetch logs');
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, 900);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job, result]);

  const handleFileSelected = (file: File) => {
    if (localModelUrl) URL.revokeObjectURL(localModelUrl);
    setSelectedFile(file);
    setLocalModelUrl(URL.createObjectURL(file));
    setResult(null);
    setJob(null);
    setStatus('Unknown');
    setModelRotation({ x: 0, y: 0, z: 0 });
    setLogs([
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Loaded ${file.name} into the local preview buffer.`,
      },
    ]);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const response = await uploadModel(selectedFile);
      setJob(response);
      setStatus(response.status);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await startSimulation(job.job_id, windSpeed);
      setStatus(response.status);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'Simulation failed to start');
    } finally {
      setBusy(false);
    }
  };

  const rotateModel = (axis: RotationAxis, degrees: number) => {
    setModelRotation((current) => ({
      ...current,
      [axis]: normalizeDegrees(current[axis] + degrees),
    }));
  };

  return (
    <main className="app-shell min-h-screen overflow-hidden bg-night text-slate-100">
      <div className="aurora-layer" />
      <div className="relative z-10 flex min-h-screen flex-col gap-4 p-4 lg:p-5">
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel flex min-h-20 flex-wrap items-center justify-between gap-4 px-5 py-4"
        >
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-md border border-cyanGlow/40 bg-cyanGlow/10 shadow-neon">
              <Radar className="h-6 w-6 text-cyanGlow" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.38em] text-cyanGlow/80">AeroForge CFD</p>
              <h1 className="text-xl font-semibold text-white md:text-2xl">Real-Time Wind Tunnel Workbench</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status} />
            <MetricPill icon={<Gauge className="h-4 w-4" />} label={`${windSpeed.toFixed(1)} m/s`} />
            <MetricPill icon={<Cpu className="h-4 w-4" />} label="kOmegaSST" />
            <MetricPill icon={<Activity className="h-4 w-4" />} label={`${logs.length} logs`} />
          </div>
        </motion.header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <ModelUploadPanel
            busy={busy}
            error={error}
            file={selectedFile}
            jobId={job?.job_id}
            status={status}
            viewMode={viewMode}
            windSpeed={windSpeed}
            modelRotation={modelRotation}
            onFileSelected={handleFileSelected}
            onResetModelRotation={() => setModelRotation({ x: 0, y: 0, z: 0 })}
            onRunSimulation={handleRun}
            onRotateModel={rotateModel}
            onUpload={handleUpload}
            onViewModeChange={setViewMode}
            onWindSpeedChange={setWindSpeed}
          />

          <motion.section
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel relative min-h-[520px] overflow-hidden"
          >
            <SimulationViewer
              modelUrl={viewerModelUrl}
              fileName={selectedFile?.name}
              result={result}
              status={status}
              viewMode={viewMode}
              windSpeed={windSpeed}
              modelRotation={modelRotation}
            />
            <AnimatePresence>
              {busy && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid place-items-center bg-night/38 backdrop-blur-sm"
                >
                  <div className="rounded-md border border-cyanGlow/40 bg-black/50 px-5 py-4 text-sm text-cyanGlow shadow-neon">
                    Synchronizing CFD pipeline...
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </section>

        <DebugConsole
          logs={logs}
          open={consoleOpen}
          status={status}
          onToggle={() => setConsoleOpen((value) => !value)}
        />
      </div>
    </main>
  );
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return normalized === 270 ? -90 : normalized;
}

function StatusBadge({ status }: { status: JobStatus }) {
  const className =
    status === 'Complete'
      ? 'border-success/50 bg-success/10 text-success'
      : status === 'Running'
        ? 'border-cyanGlow/50 bg-cyanGlow/10 text-cyanGlow'
        : status === 'Failed'
          ? 'border-danger/50 bg-danger/10 text-danger'
          : 'border-white/15 bg-white/8 text-slate-300';

  return (
    <div className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${className}`}>
      {status === 'Unknown' ? 'Idle' : status}
    </div>
  );
}

function MetricPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
      <span className="text-cyanGlow">{icon}</span>
      {label}
    </div>
  );
}
