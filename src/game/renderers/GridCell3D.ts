import * as THREE from 'three';
import { MOOD_FACTORS, type SceneMood } from '../theme/visualTheme';

type CellState = 'empty' | 'occupied' | 'ruins';
type CellHoverMode = 'none' | 'placement' | 'targeting';

const CELL_STATE_STYLE: Record<
  CellState,
  { base: number; edge: number; glow: number; metalness: number; roughness: number }
> = {
  empty: {
    base: 0x6f6f94,
    edge: 0x99b4ff,
    glow: 0xb2d2ff,
    metalness: 0.08,
    roughness: 0.8,
  },
  occupied: {
    base: 0x5a7a6b,
    edge: 0x8ce2c2,
    glow: 0xb8f5d1,
    metalness: 0.06,
    roughness: 0.7,
  },
  ruins: {
    base: 0x3e3846,
    edge: 0x786f82,
    glow: 0xa67669,
    metalness: 0.2,
    roughness: 0.92,
  },
};

const HOVER_STYLE: Record<
  CellHoverMode,
  { fill: number; edge: number; intensity: number }
> = {
  none: { fill: 0xffffff, edge: 0xffffff, intensity: 0 },
  placement: { fill: 0x8fe9d1, edge: 0xdafcf1, intensity: 0.74 },
  targeting: { fill: 0xffd494, edge: 0xfff1c4, intensity: 0.92 },
};

function createGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.18 },
      uDanger: { value: 0 },
      uEdgeStrength: { value: 0.36 },
      uFillColor: { value: new THREE.Color(0xffffff) },
      uEdgeColor: { value: new THREE.Color(0xffffff) },
      uMoodAccent: { value: MOOD_FACTORS.idle.accent },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uDanger;
      uniform float uEdgeStrength;
      uniform float uMoodAccent;
      uniform vec3 uFillColor;
      uniform vec3 uEdgeColor;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered * vec2(1.0, 0.82));
        float falloff = smoothstep(0.52, 0.08, dist);
        float edge = smoothstep(0.18, 0.02, abs(max(abs(centered.x), abs(centered.y)) - 0.45));
        float sweep = 0.5 + 0.5 * sin(uTime * 1.6 + (vUv.x + vUv.y) * 8.0);
        float shimmer = (0.35 + sweep * 0.65) * edge * (0.28 + uMoodAccent * 0.22);
        float dangerPulse = (0.5 + 0.5 * sin(uTime * 4.0 + vUv.y * 6.0)) * uDanger;
        vec3 color = mix(uFillColor, uEdgeColor, edge * 0.85 + shimmer * 0.35);
        float alpha = falloff * (0.06 + uIntensity * 0.12) + shimmer * uEdgeStrength + dangerPulse * 0.16;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export class GridCell3D {
  public readonly row: number;
  public readonly col: number;
  public readonly mesh: THREE.Mesh;
  public readonly borderMesh: THREE.LineSegments;
  public readonly glowMesh: THREE.Mesh;

  private readonly surfaceMaterial: THREE.MeshStandardMaterial;
  private readonly borderMaterial: THREE.LineBasicMaterial;
  private readonly glowMaterial: THREE.ShaderMaterial;

  private currentState: CellState = 'empty';
  private hoverMode: CellHoverMode = 'none';
  private isActionPickEligible = false;
  private isActionPickSelected = false;
  private currentMood: SceneMood = 'idle';
  private visualPulse = 0;

  constructor(row: number, col: number, centerX: number, centerZ: number, width: number, height: number) {
    this.row = row;
    this.col = col;

    const geometry = new THREE.BoxGeometry(width, 6, height);
    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      color: CELL_STATE_STYLE.empty.base,
      emissive: 0x120f18,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.9,
      metalness: CELL_STATE_STYLE.empty.metalness,
      roughness: CELL_STATE_STYLE.empty.roughness,
    });
    this.mesh = new THREE.Mesh(geometry, this.surfaceMaterial);
    this.mesh.position.set(centerX, -1.4, centerZ);
    this.mesh.receiveShadow = false;
    this.mesh.userData = { gridKey: `${row}|${col}`, row, col };

    const borderGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 6.2, height));
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: CELL_STATE_STYLE.empty.edge,
      transparent: true,
      opacity: 0.78,
    });
    this.borderMesh = new THREE.LineSegments(borderGeometry, this.borderMaterial);
    this.borderMesh.position.copy(this.mesh.position);

    const glowGeometry = new THREE.PlaneGeometry(width * 1.08, height * 1.08, 1, 1);
    this.glowMaterial = createGlowMaterial();
    this.glowMesh = new THREE.Mesh(glowGeometry, this.glowMaterial);
    this.glowMesh.rotation.x = -Math.PI / 2;
    this.glowMesh.position.set(centerX, 2.8, centerZ);

    this.applyVisualState();
  }

  private applyVisualState(): void {
    const mood = MOOD_FACTORS[this.currentMood];
    const stateStyle = CELL_STATE_STYLE[this.currentState];
    const hoverStyle = HOVER_STYLE[this.hoverMode];

    let baseColor = stateStyle.base;
    let edgeColor = stateStyle.edge;
    let glowColor = stateStyle.glow;
    let glowIntensity = 0.22 + mood.intensity * 0.16;
    let opacity = this.currentState === 'ruins' ? 0.84 : 0.9;

    if (this.hoverMode !== 'none') {
      baseColor = hoverStyle.fill;
      edgeColor = hoverStyle.edge;
      glowColor = hoverStyle.edge;
      glowIntensity = hoverStyle.intensity;
      opacity = this.hoverMode === 'targeting' ? 0.46 : 0.62;
    }

    if (this.isActionPickEligible) {
      baseColor = 0xffc977;
      edgeColor = 0xfff2c9;
      glowColor = 0xffd98d;
      glowIntensity = Math.max(glowIntensity, 0.78);
      opacity = Math.max(opacity, 0.38);
    }

    if (this.isActionPickSelected) {
      baseColor = 0xd9b8ff;
      edgeColor = 0xf9ecff;
      glowColor = 0xe6c9ff;
      glowIntensity = 1;
      opacity = 0.42;
    }

    this.surfaceMaterial.color.setHex(baseColor);
    this.surfaceMaterial.emissive.setHex(glowColor);
    this.surfaceMaterial.emissiveIntensity =
      0.16 + glowIntensity * 0.35 + mood.accent * 0.08 + mood.danger * 0.12;
    this.surfaceMaterial.opacity = opacity;
    this.surfaceMaterial.roughness = stateStyle.roughness;
    this.surfaceMaterial.metalness = stateStyle.metalness;

    this.borderMaterial.color.setHex(edgeColor);
    this.borderMaterial.opacity = 0.68 + glowIntensity * 0.18;

    (this.glowMaterial.uniforms.uFillColor.value as THREE.Color).setHex(baseColor);
    (this.glowMaterial.uniforms.uEdgeColor.value as THREE.Color).setHex(edgeColor);
    this.glowMaterial.uniforms.uIntensity.value = glowIntensity;
    this.glowMaterial.uniforms.uDanger.value =
      this.currentState === 'ruins' ? 0.24 + mood.danger * 0.35 : mood.danger * 0.6;
    this.glowMaterial.uniforms.uEdgeStrength.value =
      0.3 + glowIntensity * 0.22 + (this.isActionPickSelected ? 0.14 : 0);
    this.glowMaterial.uniforms.uMoodAccent.value = mood.accent;
  }

  public update(timeSeconds: number): void {
    this.visualPulse += 0.04;
    this.glowMaterial.uniforms.uTime.value = timeSeconds + this.visualPulse;

    const mood = MOOD_FACTORS[this.currentMood];
    const bob = Math.sin(timeSeconds * 1.35 + this.row * 0.7 + this.col * 0.5) * 0.4;
    this.mesh.position.y = -1.4 + mood.accent * 0.08;
    this.glowMesh.position.y = 2.8 + bob;
    this.borderMesh.position.y = this.mesh.position.y + 0.16;
  }

  public setSceneMood(mood: SceneMood): void {
    if (this.currentMood === mood) return;
    this.currentMood = mood;
    this.applyVisualState();
  }

  public setEmpty(): void {
    this.currentState = 'empty';
    this.applyVisualState();
  }

  public setOccupied(): void {
    this.currentState = 'occupied';
    this.applyVisualState();
  }

  public setRuins(): void {
    this.currentState = 'ruins';
    this.applyVisualState();
  }

  public setHighlighted(highlighted: boolean): void {
    this.setHoverMode(highlighted ? 'placement' : 'none');
  }

  public setHoverMode(mode: CellHoverMode): void {
    if (this.hoverMode === mode) return;
    this.hoverMode = mode;
    this.applyVisualState();
  }

  public setActionPick(eligible: boolean, selected: boolean): void {
    if (this.isActionPickEligible === eligible && this.isActionPickSelected === selected) return;
    this.isActionPickEligible = eligible;
    this.isActionPickSelected = selected;
    this.applyVisualState();
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.borderMesh.geometry.dispose();
    this.borderMaterial.dispose();
    this.glowMesh.geometry.dispose();
    this.glowMaterial.dispose();
  }
}
