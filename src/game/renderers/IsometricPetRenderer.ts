import * as THREE from 'three';
import { createLowPolyPet, type PetRig } from '../factories/LowPolyPetFactory';
import { GridCell3D } from './GridCell3D';
import { DeckRenderer } from './DeckRenderer';
import { Tween, Easing } from '../utils/Tween';
import type { GridEntity } from '../../store/gameStore';
import {
  MOOD_FACTORS,
  QUALITY_POST_FX,
  VISUAL_THEME,
  type QualityLevel,
  type SceneMood,
} from '../theme/visualTheme';
import { getCardModelProfile } from '../../utils/runtimeConfig';

type PetAnimationState = 'idle' | 'angry';

interface TransformSnapshot {
  target: THREE.Object3D;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface PetMotionProfile {
  idleLift: number;
  idleBodyRoll: number;
  idleHeadPitch: number;
  idleHeadYaw: number;
  idleTailSwing: number;
  idleEarTwitch: number;
  idleLegSwing: number;
  angryLift: number;
  angryBodyPitch: number;
  angryBodyRoll: number;
  angryHeadPitch: number;
  angryHeadYaw: number;
  angryTailSwing: number;
  angryEarPin: number;
  angryLegPunch: number;
}

interface PetMaterialState {
  material: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
}

interface PetMesh {
  rig: PetRig;
  entityId: string;
  cardId: string;
  state: PetAnimationState | null;
  animationToken: number;
  restPose: TransformSnapshot[];
  stressRatio: number;
  auraIntensity: number;
  auraColor: THREE.Color | null;
  materials: PetMaterialState[];
  shadow: THREE.Mesh;
  debugBounds: THREE.Box3;
  debugBoundsHelper: THREE.Box3Helper;
}

interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function createBackdropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uWarmth: { value: MOOD_FACTORS.idle.warmth },
      uDanger: { value: 0 },
      uTopColor: { value: new THREE.Color(VISUAL_THEME.scene.ambientTop) },
      uBottomColor: { value: new THREE.Color(VISUAL_THEME.scene.ambientBottom) },
      uAccentColor: { value: new THREE.Color(VISUAL_THEME.scene.stageGlow) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uWarmth;
      uniform float uDanger;
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform vec3 uAccentColor;
      varying vec3 vWorld;

      void main() {
        float h = clamp((vWorld.y + 300.0) / 1800.0, 0.0, 1.0);
        float curtain = 0.5 + 0.5 * sin(vWorld.x * 0.006 + uTime * 0.22);
        float haze = smoothstep(0.0, 0.9, h);
        vec3 base = mix(uBottomColor, uTopColor, h);
        base += uAccentColor * curtain * (0.07 + uWarmth * 0.16);
        base += vec3(0.2, 0.06, 0.05) * uDanger * (1.0 - h) * 0.32;
        float alpha = mix(0.16, 0.44, haze) + uWarmth * 0.06 + uDanger * 0.04;
        gl_FragColor = vec4(base, alpha);
      }
    `,
  });
}

function createStageMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uWarmth: { value: MOOD_FACTORS.idle.warmth },
      uAccent: { value: MOOD_FACTORS.idle.accent },
      uDanger: { value: 0 },
      uGlowColor: { value: new THREE.Color(VISUAL_THEME.scene.stageGlow) },
      uActionColor: { value: new THREE.Color(VISUAL_THEME.scene.actionGlow) },
      uDangerColor: { value: new THREE.Color(VISUAL_THEME.scene.dangerGlow) },
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
      uniform float uWarmth;
      uniform float uAccent;
      uniform float uDanger;
      uniform vec3 uGlowColor;
      uniform vec3 uActionColor;
      uniform vec3 uDangerColor;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - 0.5;
        float dist = length(centered * vec2(1.0, 0.72));
        float halo = smoothstep(0.52, 0.04, dist);
        float ring = smoothstep(0.25, 0.22, abs(dist - 0.32));
        float sweep = 0.5 + 0.5 * sin(uTime * 0.9 + vUv.y * 7.0);
        float stripe = smoothstep(0.48, 0.0, abs(fract(vUv.x * 6.0 + uTime * 0.05) - 0.5));
        vec3 color = uGlowColor * (0.22 + uWarmth * 0.3) * halo;
        color += uActionColor * ring * (0.08 + uAccent * 0.24) * sweep;
        color += uDangerColor * halo * uDanger * (0.2 + 0.25 * sweep);
        color += vec3(0.25, 0.18, 0.1) * stripe * halo * 0.08;
        float alpha = halo * (0.16 + uWarmth * 0.14) + ring * 0.12 + uDanger * 0.1;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function createShadowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x291b2a,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
}

export class IsometricPetRenderer {
  private static readonly DESIGN_WIDTH = 1920;
  private static readonly DESIGN_HEIGHT = 1080;
  private static readonly PET_FACING_Y = Math.PI * 1.22;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly petMeshes = new Map<string, PetMesh>();
  private readonly gridCellMeshes = new Map<string, GridCell3D>();
  private readonly deckRenderer: DeckRenderer;
  private readonly clock = new THREE.Clock();

  private readonly backdropMaterial: THREE.ShaderMaterial;
  private readonly stageMaterial: THREE.ShaderMaterial;
  private readonly backdropMesh: THREE.Mesh;
  private readonly stageMesh: THREE.Mesh;

  private qualityLevel: QualityLevel = 'high';
  private sceneMood: SceneMood = 'idle';
  private petBoundsDebugVisible = true;

  private readonly GRID_START_X = 400;
  private readonly GRID_START_Y = 200;
  private readonly CELL_WIDTH = 180;
  private readonly CELL_HEIGHT = 140;
  private readonly CELL_PADDING = 10;
  private readonly PET_WORLD_SCALE = 70;
  private readonly PET_GROUND_Y = 0.5;

  constructor(canvas: HTMLCanvasElement) {
    const initialWidth = Math.max(1, canvas.width || canvas.clientWidth || window.innerWidth);
    const initialHeight = Math.max(1, canvas.height || canvas.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.sortObjects = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(initialWidth, initialHeight, false);

    const halfW = IsometricPetRenderer.DESIGN_WIDTH * 0.5;
    const halfH = IsometricPetRenderer.DESIGN_HEIGHT * 0.5;
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 6000);
    this.camera.position.set(halfW, 590, halfH - 620);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(halfW, -140, halfH);
    this.camera.updateProjectionMatrix();

    this.scene = new THREE.Scene();
    this.setupLights();

    this.backdropMaterial = createBackdropMaterial();
    this.backdropMesh = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), this.backdropMaterial);
    this.backdropMesh.position.set(halfW, 520, halfH);
    this.scene.add(this.backdropMesh);

    this.stageMaterial = createStageMaterial();
    this.stageMesh = new THREE.Mesh(new THREE.PlaneGeometry(1760, 1140), this.stageMaterial);
    this.stageMesh.rotation.x = -Math.PI / 2;
    this.stageMesh.position.set(halfW, -3, halfH + 70);
    this.scene.add(this.stageMesh);

    this.deckRenderer = new DeckRenderer(
      this.scene,
      world => this.projectWorldToDesignPoint(world),
      1500,
      120
    );

    this.setQualityLevel('high');
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xfff4e7, 1.1);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff1d9, 1.7);
    keyLight.position.set(660, 820, 80);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf4c7ff, 0.6);
    fillLight.position.set(1400, 320, 920);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x9fd4ff, 0.44);
    rimLight.position.set(-340, 240, -180);
    this.scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0xffefd8, 0x9278a8, 0.75);
    this.scene.add(hemiLight);
  }

  private screenToNdc(screenX: number, screenY: number): THREE.Vector2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const localX = screenX - rect.left;
    const localY = screenY - rect.top;
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
      return null;
    }

    return new THREE.Vector2((localX / rect.width) * 2 - 1, -(localY / rect.height) * 2 + 1);
  }

  public setQualityLevel(level: QualityLevel): void {
    this.qualityLevel = level;
    const ratioCap = level === 'high' ? 2 : level === 'medium' ? 1.5 : 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));
    const fx = QUALITY_POST_FX[level];
    this.renderer.toneMappingExposure = 1.02 + fx.bloomStrength * 0.28;
  }

  public updateSceneMood(mood: SceneMood): void {
    if (this.sceneMood === mood) return;
    this.sceneMood = mood;
    this.gridCellMeshes.forEach(cell => cell.setSceneMood(mood));
  }

  public gridToWorld(row: number, col: number): THREE.Vector3 {
    const designX =
      this.GRID_START_X + col * (this.CELL_WIDTH + this.CELL_PADDING) + this.CELL_WIDTH / 2;
    const designY =
      this.GRID_START_Y + row * (this.CELL_HEIGHT + this.CELL_PADDING) + this.CELL_HEIGHT / 2;
    return new THREE.Vector3(designX, this.PET_GROUND_Y, designY);
  }

  private gridKey(row: number, col: number): string {
    return `${row}|${col}`;
  }

  private getRigNodes(rig: PetRig): THREE.Object3D[] {
    return [rig.root, rig.body, rig.head, ...rig.ears, ...rig.tails, ...rig.legs, ...rig.extras];
  }

  private projectWorldToDesignPoint(world: THREE.Vector3): { x: number; y: number } | null {
    this.camera.updateMatrixWorld(true);
    const projected = world.clone().project(this.camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      projected.x < -1.25 ||
      projected.x > 1.25 ||
      projected.y < -1.25 ||
      projected.y > 1.25
    ) {
      return null;
    }
    return {
      x: ((projected.x + 1) * 0.5) * IsometricPetRenderer.DESIGN_WIDTH,
      y: ((1 - projected.y) * 0.5) * IsometricPetRenderer.DESIGN_HEIGHT,
    };
  }

  private getProjectedBounds(root: THREE.Object3D): ProjectedBounds | null {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) return null;

    const corners = [
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
    ];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let count = 0;

    corners.forEach(corner => {
      const point = this.projectWorldToDesignPoint(corner);
      if (!point) return;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      count++;
    });

    if (count === 0) return null;
    return { minX, maxX, minY, maxY };
  }

  private computeGroundedY(root: THREE.Group, worldX: number, worldZ: number): number {
    root.position.set(worldX, 0, worldZ);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    return this.PET_GROUND_Y - bounds.min.y;
  }

  private captureRestPose(rig: PetRig): TransformSnapshot[] {
    return this.getRigNodes(rig).map(target => ({
      target,
      position: target.position.clone(),
      rotation: target.rotation.clone(),
      scale: target.scale.clone(),
    }));
  }

  private getRestSnapshot(petMesh: PetMesh, target: THREE.Object3D): TransformSnapshot {
    const snapshot = petMesh.restPose.find(entry => entry.target === target);
    if (!snapshot) {
      throw new Error(`Missing rest pose for animated target on ${petMesh.cardId}`);
    }
    return snapshot;
  }

  private restoreRestPose(petMesh: PetMesh): void {
    petMesh.restPose.forEach(entry => {
      entry.target.position.copy(entry.position);
      entry.target.rotation.copy(entry.rotation);
      entry.target.scale.copy(entry.scale);
    });
  }

  private stopAnimations(petMesh: PetMesh): void {
    petMesh.animationToken += 1;
    petMesh.restPose.forEach(entry => {
      Tween.killTarget(entry.target.position);
      Tween.killTarget(entry.target.rotation);
      Tween.killTarget(entry.target.scale);
    });
  }

  private isAnimationActive(key: string, token: number): boolean {
    const petMesh = this.petMeshes.get(key);
    return petMesh != null && petMesh.animationToken === token;
  }

  private loopTween(
    key: string,
    token: number,
    target: object,
    a: Record<string, number>,
    b: Record<string, number>,
    durationMs: number,
    easing: (t: number) => number,
    startForward = true
  ): void {
    const run = (forward: boolean) => {
      if (!this.isAnimationActive(key, token)) return;
      Tween.to(target, forward ? b : a, durationMs, easing, () => {
        run(!forward);
      });
    };
    run(startForward);
  }

  private enhancePetMaterials(root: THREE.Object3D): PetMaterialState[] {
    const materials: PetMaterialState[] = [];
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (Array.isArray(object.material)) return;

      const material = object.material;
      if (!(material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial)) {
        return;
      }

      material.emissive = material.emissive ?? new THREE.Color(0x000000);
      material.emissiveIntensity = 0.12;
      material.needsUpdate = true;
      materials.push({
        material,
        baseColor: material.color.clone(),
      });
    });
    return materials;
  }

  private createShadow(worldPos: THREE.Vector3, shadowSize = 1): THREE.Mesh {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(78 * shadowSize, 28),
      createShadowMaterial()
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(worldPos.x, -0.9, worldPos.z + 6);
    shadow.renderOrder = 1;
    this.scene.add(shadow);
    return shadow;
  }

  private createPetDebugBoundsHelper(): { box: THREE.Box3; helper: THREE.Box3Helper } {
    const box = new THREE.Box3();
    const helper = new THREE.Box3Helper(box, 0x00e5ff);
    helper.visible = this.petBoundsDebugVisible;
    helper.renderOrder = 3000;
    const material = helper.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;
    material.opacity = 0.9;
    this.scene.add(helper);
    return { box, helper };
  }

  private updatePetDebugBounds(petMesh: PetMesh): void {
    if (!this.petBoundsDebugVisible) {
      petMesh.debugBoundsHelper.visible = false;
      return;
    }

    petMesh.rig.root.updateMatrixWorld(true);
    petMesh.debugBounds.setFromObject(petMesh.rig.root);
    const isVisible = !petMesh.debugBounds.isEmpty();
    petMesh.debugBoundsHelper.visible = isVisible;
    if (!isVisible) return;

    const material = petMesh.debugBoundsHelper.material as THREE.LineBasicMaterial;
    material.color.setHex(petMesh.stressRatio >= 0.5 ? 0xff4f6d : 0x00e5ff);
    petMesh.debugBoundsHelper.updateMatrixWorld(true);
  }

  public setPetBoundsDebugVisible(visible: boolean): void {
    this.petBoundsDebugVisible = visible;
    this.petMeshes.forEach(petMesh => {
      petMesh.debugBoundsHelper.visible = visible;
    });
  }

  private getMotionProfile(cardId: string): PetMotionProfile {
    switch (cardId) {
      case 'pet_001':
        return {
          idleLift: 1.8,
          idleBodyRoll: 0.03,
          idleHeadPitch: 0.05,
          idleHeadYaw: 0.035,
          idleTailSwing: 0.22,
          idleEarTwitch: 0.08,
          idleLegSwing: 0.045,
          angryLift: 3.8,
          angryBodyPitch: 0.11,
          angryBodyRoll: 0.05,
          angryHeadPitch: 0.07,
          angryHeadYaw: 0.11,
          angryTailSwing: 0.42,
          angryEarPin: 0.16,
          angryLegPunch: 0.12,
        };
      case 'pet_002':
        return {
          idleLift: 1.5,
          idleBodyRoll: 0.022,
          idleHeadPitch: 0.035,
          idleHeadYaw: 0.028,
          idleTailSwing: 0.18,
          idleEarTwitch: 0.05,
          idleLegSwing: 0.03,
          angryLift: 4.6,
          angryBodyPitch: 0.15,
          angryBodyRoll: 0.08,
          angryHeadPitch: 0.08,
          angryHeadYaw: 0.16,
          angryTailSwing: 0.55,
          angryEarPin: 0.22,
          angryLegPunch: 0.18,
        };
      case 'pet_003':
        return {
          idleLift: 1.2,
          idleBodyRoll: 0.015,
          idleHeadPitch: 0.03,
          idleHeadYaw: 0.02,
          idleTailSwing: 0,
          idleEarTwitch: 0.03,
          idleLegSwing: 0.02,
          angryLift: 2.6,
          angryBodyPitch: 0.08,
          angryBodyRoll: 0.03,
          angryHeadPitch: 0.05,
          angryHeadYaw: 0.08,
          angryTailSwing: 0,
          angryEarPin: 0.08,
          angryLegPunch: 0.06,
        };
      case 'pet_004':
        return {
          idleLift: 1.7,
          idleBodyRoll: 0.03,
          idleHeadPitch: 0.05,
          idleHeadYaw: 0.03,
          idleTailSwing: 0.26,
          idleEarTwitch: 0.07,
          idleLegSwing: 0.04,
          angryLift: 4.2,
          angryBodyPitch: 0.12,
          angryBodyRoll: 0.06,
          angryHeadPitch: 0.08,
          angryHeadYaw: 0.13,
          angryTailSwing: 0.48,
          angryEarPin: 0.18,
          angryLegPunch: 0.16,
        };
      case 'pet_005':
        return {
          idleLift: 1.4,
          idleBodyRoll: 0.02,
          idleHeadPitch: 0.04,
          idleHeadYaw: 0.025,
          idleTailSwing: 0.2,
          idleEarTwitch: 0.05,
          idleLegSwing: 0.03,
          angryLift: 3.2,
          angryBodyPitch: 0.1,
          angryBodyRoll: 0.04,
          angryHeadPitch: 0.07,
          angryHeadYaw: 0.1,
          angryTailSwing: 0.36,
          angryEarPin: 0.14,
          angryLegPunch: 0.1,
        };
      case 'pet_006':
        return {
          idleLift: 1.9,
          idleBodyRoll: 0.028,
          idleHeadPitch: 0.05,
          idleHeadYaw: 0.03,
          idleTailSwing: 0.24,
          idleEarTwitch: 0.06,
          idleLegSwing: 0.038,
          angryLift: 4.4,
          angryBodyPitch: 0.12,
          angryBodyRoll: 0.06,
          angryHeadPitch: 0.08,
          angryHeadYaw: 0.12,
          angryTailSwing: 0.5,
          angryEarPin: 0.18,
          angryLegPunch: 0.14,
        };
      default:
        return {
          idleLift: 1.4,
          idleBodyRoll: 0.02,
          idleHeadPitch: 0.04,
          idleHeadYaw: 0.025,
          idleTailSwing: 0.16,
          idleEarTwitch: 0.04,
          idleLegSwing: 0.03,
          angryLift: 3,
          angryBodyPitch: 0.09,
          angryBodyRoll: 0.04,
          angryHeadPitch: 0.06,
          angryHeadYaw: 0.09,
          angryTailSwing: 0.28,
          angryEarPin: 0.12,
          angryLegPunch: 0.08,
        };
    }
  }

  public createGridCells(): void {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const centerX =
          this.GRID_START_X + col * (this.CELL_WIDTH + this.CELL_PADDING) + this.CELL_WIDTH / 2;
        const centerZ =
          this.GRID_START_Y + row * (this.CELL_HEIGHT + this.CELL_PADDING) + this.CELL_HEIGHT / 2;
        const cell3d = new GridCell3D(
          row,
          col,
          centerX,
          centerZ,
          this.CELL_WIDTH,
          this.CELL_HEIGHT
        );
        cell3d.setSceneMood(this.sceneMood);
        this.scene.add(cell3d.mesh);
        this.scene.add(cell3d.borderMesh);
        this.scene.add(cell3d.glowMesh);
        this.gridCellMeshes.set(`${row}|${col}`, cell3d);
      }
    }
  }

  public setDeckCount(count: number): void {
    this.deckRenderer.setCount(count);
  }

  public pulseDeckDraw(): void {
    this.deckRenderer.pulseDraw();
  }

  public getDeckDrawAnchor(): { x: number; y: number } | null {
    return this.deckRenderer.getDrawAnchor();
  }

  public screenToWorld3D(screenX: number, screenY: number): THREE.Vector3 | null {
    const ndc = this.screenToNdc(screenX, screenY);
    if (!ndc) return null;

    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(groundPlane, target);

    return intersected ? target : null;
  }

  public screenToGridCell(screenX: number, screenY: number): { row: number; col: number } | null {
    const ndc = this.screenToNdc(screenX, screenY);
    if (!ndc) return null;

    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Mesh[] = [];
    this.gridCellMeshes.forEach(cell => meshes.push(cell.mesh));

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const { row, col } = hit.userData as { row: number; col: number };
      return { row, col };
    }
    return null;
  }

  public syncCellState(row: number, col: number, state: 'empty' | 'occupied' | 'ruins'): void {
    const cell = this.gridCellMeshes.get(`${row}|${col}`);
    if (!cell) return;
    if (state === 'ruins') cell.setRuins();
    else if (state === 'occupied') cell.setOccupied();
    else cell.setEmpty();
  }

  public setCellHighlight(row: number, col: number, highlighted: boolean): void {
    this.gridCellMeshes.get(`${row}|${col}`)?.setHighlighted(highlighted);
  }

  public setCellHoverMode(
    row: number,
    col: number,
    mode: 'none' | 'placement' | 'targeting'
  ): void {
    this.gridCellMeshes.get(`${row}|${col}`)?.setHoverMode(mode);
  }

  public setCellActionPick(row: number, col: number, eligible: boolean, selected: boolean): void {
    this.gridCellMeshes.get(`${row}|${col}`)?.setActionPick(eligible, selected);
  }

  public getGridCellCenterAnchor(row: number, col: number): { x: number; y: number } | null {
    return this.projectWorldToDesignPoint(this.gridToWorld(row, col));
  }

  public getCellGuiAnchor(
    row: number,
    col: number,
    yOffset = 22
  ): { x: number; y: number } | null {
    const petMesh = this.petMeshes.get(this.gridKey(row, col));
    if (petMesh) {
      const bounds = this.getProjectedBounds(petMesh.rig.root);
      if (bounds) {
        return {
          x: (bounds.minX + bounds.maxX) * 0.5,
          y: bounds.minY + yOffset,
        };
      }
    }

    const cell = this.getGridCellCenterAnchor(row, col);
    return cell ? { x: cell.x, y: cell.y + yOffset } : null;
  }

  public getPetStressAnchor(
    row: number,
    col: number
  ): { x: number; y: number; scale: number } | null {
    const petMesh = this.petMeshes.get(this.gridKey(row, col));
    if (!petMesh) return null;

    const bounds = this.getProjectedBounds(petMesh.rig.root);
    if (!bounds) return null;

    const width = Math.max(1, bounds.maxX - bounds.minX);
    return {
      x: (bounds.minX + bounds.maxX) * 0.5,
      y: bounds.maxY - 140,
      scale: Math.max(1.2, Math.min(1.4, width / 132)),
    };
  }

  public getPetStatusAnchor(
    row: number,
    col: number
  ): { x: number; y: number; scale: number } | null {
    const center = this.getGridCellCenterAnchor(row, col);
    if (!center) return null;
    return {
      x: center.x + 57,
      y: center.y - 53,
      scale: 1.08,
    };
  }

  public spawnPet(row: number, col: number, entity: GridEntity): void {
    const key = this.gridKey(row, col);
    const existing = this.petMeshes.get(key);
    if (existing && existing.entityId === entity.id && existing.cardId === entity.cardId) {
      this.updatePetStress(row, col, entity.stress, entity.maxStress);
      return;
    }
    if (existing) this.removePet(row, col);

    const modelProfile = getCardModelProfile(entity.cardId);
    const rig = createLowPolyPet(modelProfile?.source ?? entity.cardId);
    const root = rig.root;
    root.scale.setScalar(this.PET_WORLD_SCALE * (modelProfile?.scale ?? 1));
    root.rotation.set(0, IsometricPetRenderer.PET_FACING_Y + (modelProfile?.rotationY ?? 0), 0);

    const worldPos = this.gridToWorld(row, col);
    root.position.set(
      worldPos.x + (modelProfile?.offsetX ?? 0),
      this.computeGroundedY(root, worldPos.x, worldPos.z) + (modelProfile?.offsetY ?? 0),
      worldPos.z + (modelProfile?.offsetZ ?? 0)
    );
    root.traverse(obj => {
      obj.renderOrder = 20 + row * 100 + col;
    });

    const shadow = this.createShadow(worldPos, modelProfile?.shadowSize ?? 1);
    const materials = this.enhancePetMaterials(root);
    this.scene.add(root);
    const debugBounds = this.createPetDebugBoundsHelper();

    const petMesh: PetMesh = {
      rig,
      entityId: entity.id,
      cardId: entity.cardId,
      state: null,
      animationToken: 0,
      restPose: this.captureRestPose(rig),
      stressRatio: 0,
      auraIntensity: 0,
      auraColor: null,
      materials,
      shadow,
      debugBounds: debugBounds.box,
      debugBoundsHelper: debugBounds.helper,
    };
    this.petMeshes.set(key, petMesh);
    this.updatePetDebugBounds(petMesh);
    this.playIdle(row, col);
    this.updatePetStress(row, col, entity.stress, entity.maxStress);
  }

  public removePet(row: number, col: number): void {
    const key = this.gridKey(row, col);
    const petMesh = this.petMeshes.get(key);
    if (!petMesh) return;

    this.stopAnimations(petMesh);
    this.scene.remove(petMesh.rig.root);
    this.scene.remove(petMesh.shadow);
    this.scene.remove(petMesh.debugBoundsHelper);

    petMesh.shadow.geometry.dispose();
    (petMesh.shadow.material as THREE.Material).dispose();
    petMesh.debugBoundsHelper.geometry.dispose();
    (petMesh.debugBoundsHelper.material as THREE.Material).dispose();

    petMesh.rig.root.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(material => material.dispose());
      } else {
        child.material.dispose();
      }
    });

    this.petMeshes.delete(key);
  }

  public playIdle(row: number, col: number): void {
    const key = this.gridKey(row, col);
    const petMesh = this.petMeshes.get(key);
    if (!petMesh || petMesh.state === 'idle') return;

    this.stopAnimations(petMesh);
    this.restoreRestPose(petMesh);
    petMesh.state = 'idle';

    const profile = this.getMotionProfile(petMesh.cardId);
    const token = petMesh.animationToken;
    const { rig } = petMesh;
    const rootRest = this.getRestSnapshot(petMesh, rig.root);
    const bodyRest = this.getRestSnapshot(petMesh, rig.body);
    const headRest = this.getRestSnapshot(petMesh, rig.head);

    this.loopTween(
      key,
      token,
      rig.root.position,
      { y: rootRest.position.y },
      { y: rootRest.position.y + profile.idleLift },
      820,
      Easing.easeInOutQuad
    );
    this.loopTween(
      key,
      token,
      rig.body.rotation,
      { z: bodyRest.rotation.z - profile.idleBodyRoll },
      { z: bodyRest.rotation.z + profile.idleBodyRoll },
      720,
      Easing.easeInOutQuad,
      false
    );
    this.loopTween(
      key,
      token,
      rig.head.rotation,
      {
        x: headRest.rotation.x - profile.idleHeadPitch * 0.45,
        y: headRest.rotation.y - profile.idleHeadYaw,
      },
      {
        x: headRest.rotation.x + profile.idleHeadPitch,
        y: headRest.rotation.y + profile.idleHeadYaw,
      },
      960,
      Easing.easeInOutQuad
    );

    rig.ears.forEach((ear, index) => {
      const rest = this.getRestSnapshot(petMesh, ear);
      const dir = index % 2 === 0 ? 1 : -1;
      this.loopTween(
        key,
        token,
        ear.rotation,
        {
          x: rest.rotation.x - profile.idleEarTwitch * 0.4,
          z: rest.rotation.z - dir * profile.idleEarTwitch,
        },
        {
          x: rest.rotation.x + profile.idleEarTwitch,
          z: rest.rotation.z + dir * profile.idleEarTwitch * 0.45,
        },
        900 + index * 90,
        Easing.easeInOutQuad,
        index % 2 === 0
      );
    });

    rig.tails.forEach((tail, index) => {
      const rest = this.getRestSnapshot(petMesh, tail);
      const dir = index === 0 ? 1 : index % 2 === 0 ? -1 : 1;
      this.loopTween(
        key,
        token,
        tail.rotation,
        {
          x: rest.rotation.x - profile.idleTailSwing * 0.14,
          y: rest.rotation.y - dir * profile.idleTailSwing,
        },
        {
          x: rest.rotation.x + profile.idleTailSwing * 0.08,
          y: rest.rotation.y + dir * profile.idleTailSwing,
        },
        760 + index * 80,
        Easing.easeInOutQuad,
        dir > 0
      );
    });

    rig.legs.forEach((leg, index) => {
      const rest = this.getRestSnapshot(petMesh, leg);
      const dir = index % 2 === 0 ? 1 : -1;
      this.loopTween(
        key,
        token,
        leg.rotation,
        { x: rest.rotation.x - dir * profile.idleLegSwing },
        { x: rest.rotation.x + dir * profile.idleLegSwing },
        860,
        Easing.easeInOutQuad,
        index < 2
      );
    });
  }

  public playAngry(row: number, col: number): void {
    const key = this.gridKey(row, col);
    const petMesh = this.petMeshes.get(key);
    if (!petMesh || petMesh.state === 'angry') return;

    this.stopAnimations(petMesh);
    this.restoreRestPose(petMesh);
    petMesh.state = 'angry';

    const profile = this.getMotionProfile(petMesh.cardId);
    const token = petMesh.animationToken;
    const { rig } = petMesh;
    const rootRest = this.getRestSnapshot(petMesh, rig.root);
    const bodyRest = this.getRestSnapshot(petMesh, rig.body);
    const headRest = this.getRestSnapshot(petMesh, rig.head);

    this.loopTween(
      key,
      token,
      rig.root.position,
      { y: rootRest.position.y },
      { y: rootRest.position.y + profile.angryLift },
      130,
      Easing.linear
    );
    this.loopTween(
      key,
      token,
      rig.body.rotation,
      {
        x: bodyRest.rotation.x + profile.angryBodyPitch * 0.55,
        z: bodyRest.rotation.z - profile.angryBodyRoll,
      },
      {
        x: bodyRest.rotation.x + profile.angryBodyPitch,
        z: bodyRest.rotation.z + profile.angryBodyRoll,
      },
      120,
      Easing.linear
    );
    this.loopTween(
      key,
      token,
      rig.head.rotation,
      {
        x: headRest.rotation.x + profile.angryHeadPitch * 0.2,
        y: headRest.rotation.y - profile.angryHeadYaw,
      },
      {
        x: headRest.rotation.x + profile.angryHeadPitch,
        y: headRest.rotation.y + profile.angryHeadYaw,
      },
      95,
      Easing.linear
    );

    rig.ears.forEach((ear, index) => {
      const rest = this.getRestSnapshot(petMesh, ear);
      const dir = index % 2 === 0 ? 1 : -1;
      this.loopTween(
        key,
        token,
        ear.rotation,
        {
          x: rest.rotation.x - profile.angryEarPin,
          z: rest.rotation.z - dir * profile.angryEarPin * 0.25,
        },
        {
          x: rest.rotation.x - profile.angryEarPin * 0.55,
          z: rest.rotation.z + dir * profile.angryEarPin * 0.12,
        },
        110,
        Easing.linear,
        index % 2 === 0
      );
    });

    rig.tails.forEach((tail, index) => {
      const rest = this.getRestSnapshot(petMesh, tail);
      const dir = index === 0 ? 1 : index % 2 === 0 ? -1 : 1;
      this.loopTween(
        key,
        token,
        tail.rotation,
        {
          x: rest.rotation.x - profile.angryTailSwing * 0.16,
          y: rest.rotation.y - dir * profile.angryTailSwing,
        },
        {
          x: rest.rotation.x + profile.angryTailSwing * 0.08,
          y: rest.rotation.y + dir * profile.angryTailSwing,
        },
        88 + index * 14,
        Easing.linear,
        dir > 0
      );
    });

    rig.legs.forEach((leg, index) => {
      const rest = this.getRestSnapshot(petMesh, leg);
      const dir = index % 2 === 0 ? 1 : -1;
      this.loopTween(
        key,
        token,
        leg.rotation,
        { x: rest.rotation.x - dir * profile.angryLegPunch * 0.4 },
        { x: rest.rotation.x + dir * profile.angryLegPunch },
        96,
        Easing.linear,
        index < 2
      );
    });

    rig.extras.forEach((extra, index) => {
      const rest = this.getRestSnapshot(petMesh, extra);
      this.loopTween(
        key,
        token,
        extra.rotation,
        { z: rest.rotation.z - 0.03 },
        { z: rest.rotation.z + 0.03 },
        100 + index * 10,
        Easing.linear,
        index % 2 === 0
      );
    });
  }

  public updatePetStress(row: number, col: number, stress: number, maxStress: number): void {
    const key = this.gridKey(row, col);
    const petMesh = this.petMeshes.get(key);
    if (!petMesh) return;

    const ratio = Math.max(0, Math.min(1, stress / Math.max(1, maxStress)));
    petMesh.stressRatio = ratio;
    if (ratio < 0.5) this.playIdle(row, col);
    else this.playAngry(row, col);
  }

  public updatePetAura(
    row: number,
    col: number,
    color: number | null,
    intensity: number
  ): void {
    const key = this.gridKey(row, col);
    const petMesh = this.petMeshes.get(key);
    if (!petMesh) return;
    petMesh.auraColor = color == null ? null : new THREE.Color(color);
    petMesh.auraIntensity = Math.max(0, intensity);
  }

  private updateSceneShaders(elapsed: number): void {
    const mood = MOOD_FACTORS[this.sceneMood];
    this.backdropMaterial.uniforms.uTime.value = elapsed;
    this.backdropMaterial.uniforms.uWarmth.value = mood.warmth;
    this.backdropMaterial.uniforms.uDanger.value = mood.danger;

    this.stageMaterial.uniforms.uTime.value = elapsed;
    this.stageMaterial.uniforms.uWarmth.value = mood.warmth;
    this.stageMaterial.uniforms.uAccent.value = mood.accent;
    this.stageMaterial.uniforms.uDanger.value = mood.danger;
  }

  private updatePetMaterials(elapsed: number): void {
    const mood = MOOD_FACTORS[this.sceneMood];
    this.petMeshes.forEach(petMesh => {
      petMesh.materials.forEach(({ material, baseColor }) => {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * (1.4 + petMesh.stressRatio * 4));
        const tintTarget =
          petMesh.auraColor
            ? petMesh.auraColor
            : petMesh.stressRatio > 0.72
            ? new THREE.Color(VISUAL_THEME.scene.dangerGlow)
            : new THREE.Color(VISUAL_THEME.scene.rim);
        material.color.copy(baseColor);
        material.emissive.copy(baseColor).lerp(tintTarget, 0.28 + petMesh.stressRatio * 0.34);
        material.emissiveIntensity =
          0.08 +
          mood.accent * 0.06 +
          petMesh.stressRatio * 0.22 +
          pulse * 0.03 +
          petMesh.auraIntensity * 0.18;
      });

      const pulse = 0.5 + 0.5 * Math.sin(elapsed * (1.4 + petMesh.stressRatio * 4));
      const scale = 1 + petMesh.stressRatio * 0.18;
      petMesh.shadow.scale.setScalar(scale);
      (petMesh.shadow.material as THREE.MeshBasicMaterial).opacity =
        0.08 + petMesh.stressRatio * 0.08 + pulse * 0.02;
    });
  }

  public render(): void {
    const elapsed = this.clock.getElapsedTime();
    this.camera.updateMatrixWorld(true);
    this.updateSceneShaders(elapsed);
    this.gridCellMeshes.forEach(cell => cell.update(elapsed));
    this.updatePetMaterials(elapsed);
    this.petMeshes.forEach(petMesh => this.updatePetDebugBounds(petMesh));
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.setQualityLevel(this.qualityLevel);
    this.renderer.setSize(width, height);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  public destroy(): void {
    for (const [key] of this.petMeshes) {
      const [row, col] = key.split('|').map(Number);
      this.removePet(row, col);
    }

    this.gridCellMeshes.forEach(cell3d => cell3d.dispose());
    this.gridCellMeshes.clear();

    this.scene.remove(this.stageMesh);
    this.scene.remove(this.backdropMesh);
    this.stageMesh.geometry.dispose();
    this.stageMaterial.dispose();
    this.backdropMesh.geometry.dispose();
    this.backdropMaterial.dispose();

    this.deckRenderer.dispose();
    this.renderer.dispose();
  }
}
