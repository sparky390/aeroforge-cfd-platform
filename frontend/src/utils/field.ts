import * as THREE from 'three';
import type { CfdPoint } from '../types';

export function speed(point: CfdPoint): number {
  return Math.sqrt(point.vx * point.vx + point.vy * point.vy + point.vz * point.vz);
}

export function velocityColor(value: number, maxSpeed = 16): THREE.Color {
  const t = THREE.MathUtils.clamp(value / maxSpeed, 0, 1);
  if (t < 0.33) {
    return new THREE.Color().lerpColors(new THREE.Color('#2f8cff'), new THREE.Color('#4dff9d'), t / 0.33);
  }
  if (t < 0.66) {
    return new THREE.Color().lerpColors(new THREE.Color('#4dff9d'), new THREE.Color('#ffcf5a'), (t - 0.33) / 0.33);
  }
  return new THREE.Color().lerpColors(new THREE.Color('#ffcf5a'), new THREE.Color('#ff4f72'), (t - 0.66) / 0.34);
}

export function pressureColor(pressure: number): THREE.Color {
  const t = THREE.MathUtils.clamp((pressure + 1.2) / 2.4, 0, 1);
  return new THREE.Color().lerpColors(new THREE.Color('#20e7ff'), new THREE.Color('#ff4f72'), t);
}

export function createPreviewField(windSpeed = 10): CfdPoint[] {
  const points: CfdPoint[] = [];
  for (let ix = 0; ix < 34; ix += 1) {
    const x = -5 + (ix / 33) * 12;
    for (let iy = 0; iy < 12; iy += 1) {
      const y = -2.2 + (iy / 11) * 4.4;
      for (let iz = 0; iz < 9; iz += 1) {
        const z = 0.25 + (iz / 8) * 2.8;
        const body = Math.exp(-((x / 1.35) ** 2 + (y / 0.62) ** 2 + ((z - 1.05) / 0.46) ** 2));
        if (body > 0.56) continue;
        const yz = (y / 0.92) ** 2 + ((z - 1.05) / 0.7) ** 2;
        const front = Math.exp(-(((x + 1.08) / 0.55) ** 2 + yz * 1.1));
        const wake = x > 0 ? Math.exp(-x / 3.3) * Math.exp(-yz * 0.72) : 0;
        const side = Math.exp(-((x / 1.8) ** 2)) * (1 - Math.exp(-yz * 1.2));
        const swirl = wake * Math.sin(x * 3.4 + y * 4.2 + z * 1.7);
        points.push({
          x,
          y,
          z,
          vx: windSpeed * Math.max(0.05, 1 - body * 0.86 - wake * 0.5 + side * 0.34),
          vy: windSpeed * (0.18 * Math.sign(y || 1) * Math.exp(-((x / 1.6) ** 2)) * Math.exp(-yz * 0.45) + swirl * 0.1),
          vz: windSpeed * (0.13 * Math.sign(z - 1.05 || 1) * Math.exp(-((x / 1.7) ** 2)) * Math.exp(-yz * 0.5) + swirl * 0.08),
          pressure: front * 1.1 - wake * 0.95 - side * 0.32,
        });
      }
    }
  }
  return points;
}
