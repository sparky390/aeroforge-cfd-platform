import { useMemo } from 'react';
import * as THREE from 'three';
import type { CfdPoint } from '../../types';
import { pressureColor } from '../../utils/field';

export function PressureCloud({ points }: { points: CfdPoint[] }) {
  const { positions, colors } = useMemo(() => {
    const selected = points.filter((_, index) => index % 3 === 0);
    const positionBuffer = new Float32Array(selected.length * 3);
    const colorBuffer = new Float32Array(selected.length * 3);
    selected.forEach((point, index) => {
      positionBuffer[index * 3] = point.x;
      positionBuffer[index * 3 + 1] = point.y;
      positionBuffer[index * 3 + 2] = point.z;
      pressureColor(point.pressure).toArray(colorBuffer, index * 3);
    });
    return { positions: positionBuffer, colors: colorBuffer };
  }, [points]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        opacity={0.32}
        size={0.1}
        transparent
        vertexColors
      />
    </points>
  );
}
