import { ChangeEvent, useRef } from 'react';
import { Box, FileUp, Play, RefreshCcw, RotateCcw, RotateCw, SlidersHorizontal, UploadCloud, Waves } from 'lucide-react';
import { motion } from 'framer-motion';
import type { JobStatus, ViewMode } from '../types';

type RotationAxis = 'x' | 'y' | 'z';

type ModelRotation = Record<RotationAxis, number>;

interface Props {
  busy: boolean;
  error: string | null;
  file: File | null;
  jobId?: string;
  status: JobStatus;
  viewMode: ViewMode;
  windSpeed: number;
  modelRotation: ModelRotation;
  onFileSelected: (file: File) => void;
  onResetModelRotation: () => void;
  onRunSimulation: () => void;
  onRotateModel: (axis: RotationAxis, degrees: number) => void;
  onUpload: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onWindSpeedChange: (speed: number) => void;
}

const viewModes: Array<{ id: ViewMode; label: string }> = [
  { id: 'velocity', label: 'Velocity' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'vectors', label: 'Vectors' },
];

export function ModelUploadPanel({
  busy,
  error,
  file,
  jobId,
  status,
  viewMode,
  windSpeed,
  modelRotation,
  onFileSelected,
  onResetModelRotation,
  onRunSimulation,
  onRotateModel,
  onUpload,
  onViewModeChange,
  onWindSpeedChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) onFileSelected(nextFile);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-panel flex min-h-[520px] flex-col gap-4 p-4"
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".obj,.stl,.gltf,.glb"
        onChange={handleChange}
      />

      <button
        type="button"
        className="upload-zone group"
        onClick={() => inputRef.current?.click()}
      >
        <div className="grid h-14 w-14 place-items-center rounded-md border border-cyanGlow/35 bg-cyanGlow/10 text-cyanGlow shadow-neon transition group-hover:scale-105">
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-semibold text-white">{file ? file.name : 'Upload 3D Model'}</p>
          <p className="mt-1 text-xs text-slate-400">OBJ, STL, GLTF, or GLB</p>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <ActionButton
          disabled={!file || busy}
          icon={<FileUp className="h-4 w-4" />}
          label="Upload"
          onClick={onUpload}
        />
        <ActionButton
          disabled={!jobId || busy || status === 'Running'}
          icon={<Play className="h-4 w-4" />}
          label="Run CFD"
          onClick={onRunSimulation}
        />
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersHorizontal className="h-4 w-4 text-cyanGlow" />
            Wind Speed
          </div>
          <span className="font-mono text-sm text-cyanGlow">{windSpeed.toFixed(1)} m/s</span>
        </div>
        <input
          className="accent-cyanGlow"
          type="range"
          min="2"
          max="40"
          step="0.5"
          value={windSpeed}
          onChange={(event) => onWindSpeedChange(Number(event.target.value))}
        />
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <RotateCw className="h-4 w-4 text-cyanGlow" />
            Orientation
          </div>
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-cyanGlow transition hover:border-cyanGlow/50 hover:bg-cyanGlow/10"
            title="Reset model orientation"
            onClick={onResetModelRotation}
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2">
          <OrientationRow axis="x" label="Pitch" value={modelRotation.x} onRotate={onRotateModel} />
          <OrientationRow axis="y" label="Yaw" value={modelRotation.y} onRotate={onRotateModel} />
          <OrientationRow axis="z" label="Roll" value={modelRotation.z} onRotate={onRotateModel} />
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Waves className="h-4 w-4 text-cyanGlow" />
          Visualization
        </div>
        <div className="grid grid-cols-3 gap-2">
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                viewMode === mode.id
                  ? 'border-cyanGlow/60 bg-cyanGlow/15 text-cyanGlow shadow-neon'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyanGlow/40 hover:text-white'
              }`}
              onClick={() => onViewModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoTile icon={<Box className="h-4 w-4" />} label="Domain" value="16m tunnel" />
        <InfoTile icon={<Waves className="h-4 w-4" />} label="Solver" value="simpleFoam" />
        <InfoTile icon={<SlidersHorizontal className="h-4 w-4" />} label="Turbulence" value="kOmegaSST" />
        <InfoTile icon={<Play className="h-4 w-4" />} label="Mesh" value="Snappy" />
      </div>

      <div className="mt-auto rounded-md border border-cyanGlow/15 bg-cyanGlow/[0.05] p-3 font-mono text-xs text-slate-300">
        <p className="text-cyanGlow">job_id</p>
        <p className="mt-1 break-all">{jobId ?? 'awaiting-upload'}</p>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
    </motion.aside>
  );
}

function OrientationRow({
  axis,
  label,
  value,
  onRotate,
}: {
  axis: RotationAxis;
  label: string;
  value: number;
  onRotate: (axis: RotationAxis, degrees: number) => void;
}) {
  return (
    <div className="grid grid-cols-[56px_1fr_72px] items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-cyanGlow/50 hover:text-cyanGlow"
          title={`Rotate ${label.toLowerCase()} -90 degrees`}
          onClick={() => onRotate(axis, -90)}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-cyanGlow/50 hover:text-cyanGlow"
          title={`Rotate ${label.toLowerCase()} +90 degrees`}
          onClick={() => onRotate(axis, 90)}
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </div>
      <span className="rounded-md border border-cyanGlow/15 bg-cyanGlow/[0.06] px-2 py-2 text-center font-mono text-xs text-cyanGlow">
        {value}deg
      </span>
    </div>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="neon-button flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-2 text-cyanGlow">{icon}</div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
