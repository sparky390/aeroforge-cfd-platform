import { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

type RotationAxis = 'x' | 'y' | 'z';

type ModelRotation = Record<RotationAxis, number>;

export function ModelPreview({
  src,
  fileName,
  modelRotation,
}: {
  src: string | null;
  fileName?: string;
  modelRotation: ModelRotation;
}) {
  const rotation = toRadians(modelRotation);
  if (!src || !fileName) return <ProceduralAeroBody />;

  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'stl') return <StlModel src={src} rotation={rotation} />;
  if (extension === 'obj') return <ObjModel src={src} rotation={rotation} />;
  if (extension === 'gltf' || extension === 'glb') return <GltfModel src={src} rotation={rotation} />;
  return <ProceduralAeroBody />;
}

function StlModel({ src, rotation }: { src: string; rotation: [number, number, number] }) {
  const loaded = useLoader(STLLoader, src);
  const { geometry, scale } = useMemo(() => normalizeGeometry(loaded), [loaded]);
  return (
    <group rotation={rotation}>
      <mesh geometry={geometry} scale={scale} position={[0, 0, 0.15]}>
        <meshPhysicalMaterial
          color="#d8fcff"
          emissive="#20e7ff"
          emissiveIntensity={0.12}
          metalness={0.28}
          roughness={0.34}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

function ObjModel({ src, rotation }: { src: string; rotation: [number, number, number] }) {
  const object = useLoader(OBJLoader, src);
  const normalized = useMemo(() => normalizeObject(object), [object]);
  return (
    <group rotation={rotation}>
      <primitive object={normalized} />
    </group>
  );
}

function GltfModel({ src, rotation }: { src: string; rotation: [number, number, number] }) {
  const gltf = useLoader(GLTFLoader, src);
  const normalized = useMemo(() => normalizeObject(gltf.scene), [gltf.scene]);
  return (
    <group rotation={rotation}>
      <primitive object={normalized} />
    </group>
  );
}

function ProceduralAeroBody() {
  return (
    <group position={[0, 0, 0.9]}>
      <mesh scale={[1.45, 0.5, 0.34]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshPhysicalMaterial color="#d8fcff" emissive="#20e7ff" emissiveIntensity={0.18} metalness={0.32} roughness={0.28} />
      </mesh>
      <mesh position={[-0.35, 0, 0.22]} scale={[0.58, 0.42, 0.18]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial color="#7ff5ff" transparent opacity={0.48} roughness={0.18} />
      </mesh>
      <mesh position={[0.2, 0, -0.34]} scale={[1.1, 1.6, 0.05]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial color="#20e7ff" emissive="#20e7ff" emissiveIntensity={0.14} transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function toRadians(rotation: ModelRotation): [number, number, number] {
  return [
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
  ];
}

function normalizeGeometry(geometry: THREE.BufferGeometry) {
  const clone = geometry.clone();
  clone.computeVertexNormals();
  clone.center();
  const box = new THREE.Box3().setFromBufferAttribute(clone.getAttribute('position') as THREE.BufferAttribute);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  return { geometry: clone, scale: 2.1 / maxSize };
}

function normalizeObject(source: THREE.Object3D) {
  const clone = source.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  clone.position.sub(center);
  clone.scale.setScalar(2.2 / maxSize);
  clone.traverse((child) => {
    if ('material' in child) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: '#d8fcff',
        emissive: '#20e7ff',
        emissiveIntensity: 0.1,
        metalness: 0.25,
        roughness: 0.34,
        transparent: true,
        opacity: 0.9,
      });
    }
  });
  clone.position.y += 0.85;
  return clone;
}
