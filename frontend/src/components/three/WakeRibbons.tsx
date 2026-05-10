import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function WakeRibbons({ active }: { active: boolean }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const ribbons = useMemo(() => {
    return Array.from({ length: 5 }, (_, ribbon) => {
      const points: THREE.Vector3[] = [];
      for (let index = 0; index < 96; index += 1) {
        const t = index / 95;
        const x = 0.25 + t * 5.8;
        const radius = 0.22 + t * 0.85;
        const phase = ribbon * 1.28;
        points.push(
          new THREE.Vector3(
            x,
            Math.sin(t * Math.PI * 7 + phase) * radius * 0.34,
            0.92 + Math.cos(t * Math.PI * 6 + phase) * radius * 0.24,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, 96, 0.008, 6, false);
    });
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, index) => {
      child.position.x = Math.sin(clock.elapsedTime * 0.7 + index) * 0.08;
      child.rotation.x = active ? Math.sin(clock.elapsedTime * 0.45 + index) * 0.08 : 0;
    });
  });

  return (
    <group ref={groupRef}>
      {ribbons.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshBasicMaterial color={index % 2 ? '#2f8cff' : '#20e7ff'} transparent opacity={active ? 0.34 : 0.14} />
        </mesh>
      ))}
    </group>
  );
}
