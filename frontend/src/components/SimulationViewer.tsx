import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Grid, Html, OrbitControls, Stars } from '@react-three/drei';
import type { CfdResult, JobStatus, ViewMode } from '../types';
import { createPreviewField } from '../utils/field';
import { AirflowParticles } from './three/AirflowParticles';
import { ModelPreview } from './three/ModelPreview';
import { PressureCloud } from './three/PressureCloud';
import { VectorField } from './three/VectorField';
import { WakeRibbons } from './three/WakeRibbons';

type RotationAxis = 'x' | 'y' | 'z';

type ModelRotation = Record<RotationAxis, number>;

interface Props {
  fileName?: string;
  modelUrl: string | null;
  result: CfdResult | null;
  status: JobStatus;
  viewMode: ViewMode;
  windSpeed: number;
  modelRotation: ModelRotation;
}

export function SimulationViewer({ fileName, modelUrl, result, status, viewMode, windSpeed, modelRotation }: Props) {
  const points = useMemo(() => result?.points ?? createPreviewField(windSpeed), [result, windSpeed]);

  return (
    <div className="relative h-full min-h-[520px] w-full">
      <Canvas camera={{ position: [6, 3.6, 4.6], fov: 46 }} dpr={[1, 1.75]}>
        <color attach="background" args={['#020612']} />
        <fog attach="fog" args={['#020612', 8, 18]} />
        <ambientLight intensity={0.36} />
        <directionalLight position={[4, 7, 5]} intensity={1.8} color="#d8fcff" />
        <pointLight position={[-4, 2.6, 1.8]} intensity={9} color="#20e7ff" />
        <pointLight position={[3.5, -3, 2]} intensity={5} color="#ff4f72" />

        <Suspense fallback={<Loader />}>
          <Stars radius={55} depth={16} count={700} factor={1.2} saturation={0} fade speed={0.4} />
          <Grid
            args={[16, 8]}
            cellColor="#165366"
            cellSize={0.5}
            fadeDistance={12}
            fadeStrength={1.2}
            infiniteGrid
            position={[1, -1.72, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            sectionColor="#20e7ff"
            sectionSize={2}
          />
          <WindTunnelFrame />
          <ModelPreview src={modelUrl} fileName={fileName} modelRotation={modelRotation} />
          <AirflowParticles points={points} viewMode={viewMode} />
          {(viewMode === 'pressure' || status !== 'Unknown') && <PressureCloud points={points} />}
          {(viewMode === 'vectors' || status === 'Running') && <VectorField points={points} />}
          <WakeRibbons active={status === 'Running' || status === 'Complete'} />
          <Environment preset="night" />
        </Suspense>
        <OrbitControls enableDamping makeDefault maxDistance={14} minDistance={2.6} />
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-cyanGlow/20 bg-black/34 px-4 py-3 backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.28em] text-cyanGlow/80">Flow Field</p>
        <p className="mt-1 text-lg font-semibold text-white">{result ? 'CFD Result Loaded' : 'Predictive Preview'}</p>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 flex gap-2 rounded-md border border-white/10 bg-black/34 p-2 backdrop-blur-md">
        <Legend color="bg-blueGlow" label="low" />
        <Legend color="bg-success" label="mid" />
        <Legend color="bg-amberWarn" label="fast" />
        <Legend color="bg-danger" label="peak" />
      </div>
    </div>
  );
}

function Loader() {
  return (
    <Html center>
      <div className="rounded-md border border-cyanGlow/30 bg-black/60 px-4 py-3 font-mono text-xs text-cyanGlow shadow-neon">
        loading wind tunnel
      </div>
    </Html>
  );
}

function WindTunnelFrame() {
  return (
    <group>
      <mesh position={[1, 0, -1.74]}>
        <boxGeometry args={[12, 4.4, 0.02]} />
        <meshBasicMaterial color="#20e7ff" transparent opacity={0.045} />
      </mesh>
      <mesh position={[-5, 0, 0.1]}>
        <boxGeometry args={[0.02, 4.4, 3.5]} />
        <meshBasicMaterial color="#2f8cff" transparent opacity={0.08} />
      </mesh>
      <mesh position={[7, 0, 0.1]}>
        <boxGeometry args={[0.02, 4.4, 3.5]} />
        <meshBasicMaterial color="#ff4f72" transparent opacity={0.07} />
      </mesh>
    </group>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-300">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </div>
  );
}
