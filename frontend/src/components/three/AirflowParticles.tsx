import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CfdPoint, ViewMode } from '../../types';
import { pressureColor, speed, velocityColor } from '../../utils/field';

interface Particle {
  source: CfdPoint;
  drift: number;
}

export function AirflowParticles({ points, viewMode }: { points: CfdPoint[]; viewMode: ViewMode }) {
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const particles = useMemo<Particle[]>(() => {
    const count = Math.min(950, Math.max(300, points.length));
    return Array.from({ length: count }, (_, index) => ({
      source: points[index % points.length],
      drift: Math.random() * Math.PI * 2,
    }));
  }, [points]);

  const positions = useMemo(() => {
    const buffer = new Float32Array(particles.length * 3);
    particles.forEach((particle, index) => {
      buffer[index * 3] = particle.source.x + (Math.random() - 0.5) * 0.1;
      buffer[index * 3 + 1] = particle.source.y + (Math.random() - 0.5) * 0.08;
      buffer[index * 3 + 2] = particle.source.z + (Math.random() - 0.5) * 0.08;
    });
    return buffer;
  }, [particles]);

  const colors = useMemo(() => new Float32Array(particles.length * 3), [particles.length]);

  useEffect(() => {
    particles.forEach((particle, index) => {
      const color =
        viewMode === 'pressure'
          ? pressureColor(particle.source.pressure)
          : velocityColor(speed(particle.source));
      color.toArray(colors, index * 3);
    });
    geometryRef.current?.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const colorAttribute = geometryRef.current?.getAttribute('color');
    if (colorAttribute) colorAttribute.needsUpdate = true;
  }, [colors, particles, viewMode]);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const offset = index * 3;
      positions[offset] += particle.source.vx * delta * 0.075;
      positions[offset + 1] += particle.source.vy * delta * 0.045 + Math.sin(time * 2.4 + particle.drift) * 0.0015;
      positions[offset + 2] += particle.source.vz * delta * 0.045 + Math.cos(time * 2.2 + particle.drift) * 0.0015;

      if (positions[offset] > 7.1) {
        positions[offset] = -5.2 - Math.random() * 0.4;
        positions[offset + 1] = -2.15 + Math.random() * 4.3;
        positions[offset + 2] = 0.22 + Math.random() * 2.85;
      }
    }
    const attribute = geometryRef.current?.getAttribute('position');
    if (attribute) attribute.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        opacity={0.86}
        size={0.044}
        transparent
        vertexColors
      />
    </points>
  );
}
