'use client';
/**
 * Arena3D — full 3D top-down arena rendered with React Three Fiber.
 *
 * Dynamically imported (ssr: false) from Arena.tsx to avoid Next.js SSR issues
 * with Three.js / WebGL.
 *
 * Architecture:
 *  - Canvas with a top-down perspective camera + OrbitControls (clamped to avoid
 *    going below the horizon)
 *  - 10×10 tile grid rendered as Three.js Box meshes
 *  - One PlayerMesh per player — Capsule geometry, smooth lerp via useFrame
 *  - AttackEffect: flat line + floating damage text on each attack event
 *  - DeathEffect: Sparkles burst when a player goes from alive → dead
 */

import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Sparkles, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useMatchStore, type PlayerState } from '../../store/match.store';

// ─── Tile map ─────────────────────────────────────────────────────────────────

type TileType = 'empty' | 'resource_node' | 'wall';

const DEFAULT_TILES: TileType[][] = [
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['empty','wall', 'wall', 'empty','empty',        'empty','empty','wall', 'wall', 'empty'],
  ['empty','wall', 'empty','empty','empty',        'empty','empty','empty','wall', 'empty'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['resource_node','empty','empty','resource_node','empty','empty','resource_node','empty','empty','resource_node'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
  ['empty','empty','empty','empty','empty',        'empty','empty','empty','empty','empty'],
  ['empty','wall', 'empty','empty','empty',        'empty','empty','empty','wall', 'empty'],
  ['empty','wall', 'wall', 'empty','empty',        'empty','empty','wall', 'wall', 'empty'],
  ['empty','empty','empty','empty','resource_node','empty','empty','empty','empty','empty'],
];

const TILE_COLORS: Record<TileType, string> = {
  empty: '#1a1f2e',
  resource_node: '#064e3b',
  wall: '#374151',
};

// Convert grid (col, row) → 3D world (x, z) with unit spacing
function gridToWorld(col: number, row: number): [number, number] {
  return [col - 4.5, row - 4.5];
}

// ─── Tile grid ────────────────────────────────────────────────────────────────

function TileGrid() {
  return (
    <>
      {DEFAULT_TILES.map((row, ri) =>
        row.map((tile, ci) => {
          const [wx, wz] = gridToWorld(ci, ri);
          const isWall = tile === 'wall';
          const isResource = tile === 'resource_node';
          return (
            <group key={`${ri}-${ci}`} position={[wx, 0, wz]}>
              <mesh castShadow={isWall} receiveShadow>
                <boxGeometry args={[0.95, isWall ? 1.5 : 0.1, 0.95]} />
                <meshStandardMaterial
                  color={TILE_COLORS[tile]}
                  emissive={isResource ? '#065f46' : '#000000'}
                  emissiveIntensity={isResource ? 0.6 : 0}
                />
              </mesh>
              {isResource && (
                <pointLight
                  position={[0, 0.8, 0]}
                  color="#34d399"
                  intensity={1.2}
                  distance={2}
                />
              )}
            </group>
          );
        }),
      )}
    </>
  );
}

// ─── Per-player mesh ──────────────────────────────────────────────────────────

interface AttackFx {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  damage: number;
  born: number;
}

interface PlayerMeshProps {
  player: PlayerState;
  isSelf: boolean;
  onAttackEffect?: (fx: AttackFx) => void;
}

function PlayerMesh({ player, isSelf }: PlayerMeshProps) {
  const { posX, posZ } = {
    posX: player.position.x - 4.5,
    posZ: player.position.y - 4.5,
  };

  const ref = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(posX, 0.65, posZ));

  // Smooth lerp to target position on each frame
  useFrame(() => {
    targetPos.current.set(posX, 0.65, posZ);
    if (ref.current) {
      ref.current.position.lerp(targetPos.current, 0.18);
    }
  });

  const hpPct = Math.max(0, player.hp) / 100;
  const color = isSelf ? '#fbbf24' : player.isBot ? '#818cf8' : '#60a5fa';

  return (
    <group ref={ref} visible={player.alive}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial
          color={color}
          opacity={player.alive ? 1 : 0.3}
          transparent={!player.alive}
        />
      </mesh>

      {/* Amber ring for self */}
      {isSelf && (
        <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.42, 32]} />
          <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* HP bar + name via HTML overlay */}
      <Html
        position={[0, 1.1, 0]}
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        distanceFactor={6}
      >
        <div style={{ width: 52, textAlign: 'center' }}>
          <div style={{
            fontSize: 9,
            color: isSelf ? '#fbbf24' : '#e5e7eb',
            whiteSpace: 'nowrap',
            marginBottom: 2,
            textShadow: '0 0 4px #000',
          }}>
            {player.username.slice(0, 10)}{player.isBot ? ' 🤖' : ''}
          </div>
          <div style={{
            height: 3,
            width: '100%',
            background: '#374151',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${hpPct * 100}%`,
              background: hpPct > 0.5 ? '#22c55e' : '#ef4444',
              transition: 'width 0.1s',
            }} />
          </div>
        </div>
      </Html>
    </group>
  );
}

// ─── Attack effect (line + floating damage number) ────────────────────────────

const ATTACK_FX_DURATION = 600; // ms

function AttackEffects({ effects }: { effects: AttackFx[] }) {
  const now = Date.now();
  return (
    <>
      {effects.map((fx, i) => {
        const age = now - fx.born;
        if (age > ATTACK_FX_DURATION) return null;
        const opacity = 1 - age / ATTACK_FX_DURATION;
        return (
          <group key={i}>
            <Line
              points={[fx.fromPos, fx.toPos]}
              color="#f87171"
              lineWidth={2}
              transparent
              opacity={opacity}
            />
            <Html position={fx.toPos.toArray()} center style={{ pointerEvents: 'none' }}>
              <span style={{
                color: '#f87171',
                fontSize: 14,
                fontWeight: 'bold',
                textShadow: '0 0 6px #000',
                opacity,
              }}>
                -{fx.damage}
              </span>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// ─── Death sparkles ───────────────────────────────────────────────────────────

function DeathEffect({ position }: { position: [number, number, number] }) {
  return (
    <Sparkles
      position={position}
      count={30}
      size={1.5}
      speed={0.8}
      color="#f87171"
      scale={1.5}
    />
  );
}

// ─── Scene camera setup ───────────────────────────────────────────────────────

function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 14, 6);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

// ─── Main scene ───────────────────────────────────────────────────────────────

function Scene({ playerId }: { playerId: string | null }) {
  const { players } = useMatchStore();
  const [attackFxList] = useState<AttackFx[]>([]);

  // Track previous alive state for death effects
  const prevAlive = useRef<Record<string, boolean>>({});
  const deadPositions = useRef<Record<string, [number, number, number]>>({});

  players.forEach((p) => {
    const wasAlive = prevAlive.current[p.playerId] ?? true;
    if (wasAlive && !p.alive) {
      deadPositions.current[p.playerId] = [p.position.x - 4.5, 0.65, p.position.y - 4.5];
    }
    prevAlive.current[p.playerId] = p.alive;
  });

  // Purge expired attack effects
  const now = Date.now();
  const activeEffects = attackFxList.filter((fx) => now - fx.born < ATTACK_FX_DURATION);

  return (
    <>
      <CameraSetup />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <OrbitControls
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
        enablePan={false}
        zoomSpeed={0.6}
        rotateSpeed={0.5}
        target={[0, 0, 0]}
      />

      <TileGrid />

      {players.map((p) => (
        <PlayerMesh
          key={p.playerId}
          player={p}
          isSelf={p.playerId === playerId}
        />
      ))}

      {/* Death sparkles for freshly eliminated players */}
      {Object.entries(deadPositions.current).map(([id, pos]) => (
        <DeathEffect key={`death-${id}`} position={pos} />
      ))}

      <AttackEffects effects={activeEffects} />
    </>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

interface Arena3DProps {
  playerId: string | null;
}

export function Arena3D({ playerId }: Arena3DProps) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true }}
      camera={{ fov: 55 }}
      style={{ width: '100%', height: '100%', background: '#0f1319' }}
    >
      <Scene playerId={playerId} />
    </Canvas>
  );
}
