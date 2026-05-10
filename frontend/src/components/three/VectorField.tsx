import { useMemo } from 'react';
import * as THREE from 'three';
import type { CfdPoint } from '../../types';
import { speed, velocityColor } from '../../utils/field';

export function VectorField({ points }: { points: CfdPoint[] }) {
  const { positions, colors } = useMemo(() => {
    const selected = points.filter((_, index) => index % 18 === 0);
    const positionBuffer = new Float32Array(selected.length * 6);
    const colorBuffer = new Float32Array(selected.length * 6);
    selected.forEach((point, index) => {
      const base = index * 6;
      const magnitude = speed(point);
      const scale = 0.12;
      positionBuffer[base] = point.x;
      positionBuffer[base + 1] = point.y;
      positionBuffer[base + 2] = point.z;
      positionBuffer[base + 3] = point.x + point.vx * scale;
      positionBuffer[base + 4] = point.y + point.vy * scale;
      positionBuffer[base + 5] = point.z + point.vz * scale;
      const color = velocityColor(magnitude);
      color.toArray(colorBuffer, base);
      color.toArray(colorBuffer, base + 3);
    });
    return { positions: positionBuffer, colors: colorBuffer };
  }, [points]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial blending={THREE.AdditiveBlending} transparent opacity={0.72} vertexColors />
    </lineSegments>
  );
}
