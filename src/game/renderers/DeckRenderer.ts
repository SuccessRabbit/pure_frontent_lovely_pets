import * as THREE from 'three';
import { Tween, Easing } from '../utils/Tween';
import { VISUAL_THEME } from '../theme/visualTheme';

interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * 3D deck stack with a readable top profile.
 * It exposes a draw anchor so Pixi cards can fly from the stack into the hand.
 */
export class DeckRenderer {
  private static readonly MAX_VISIBLE_CARDS = 6;

  private readonly scene: THREE.Scene;
  private readonly projector: (world: THREE.Vector3) => ProjectedPoint | null;
  private readonly group = new THREE.Group();
  private readonly slabs: THREE.Mesh[] = [];
  private readonly cardGeom = new THREE.BoxGeometry(106, 4, 148);
  private readonly baseGeom = new THREE.BoxGeometry(134, 8, 176);
  private readonly baseMat = new THREE.MeshLambertMaterial({
    color: VISUAL_THEME.colors.surfaceDarkSoft,
    flatShading: true,
    transparent: true,
    opacity: 0.9,
  });
  private readonly sideMat = new THREE.MeshLambertMaterial({
    color: VISUAL_THEME.colors.cream,
    flatShading: true,
  });
  private readonly backMat = new THREE.MeshLambertMaterial({
    color: VISUAL_THEME.colors.coral,
    flatShading: true,
  });
  private readonly edgeMat = new THREE.MeshLambertMaterial({
    color: VISUAL_THEME.colors.coralStrong,
    flatShading: true,
  });

  private count = 0;
  private pulseAlpha = { value: 0.92 };
  private lastDrawAnchor: ProjectedPoint | null = null;

  constructor(
    scene: THREE.Scene,
    projector: (world: THREE.Vector3) => ProjectedPoint | null,
    centerX: number,
    centerZ: number
  ) {
    this.scene = scene;
    this.projector = projector;

    this.group.position.set(centerX, 4, centerZ);
    this.group.rotation.set(-0.06, Math.PI * 0.08, 0.08);
    this.scene.add(this.group);

    const base = new THREE.Mesh(this.baseGeom, this.baseMat);
    base.position.set(0, -6, 0);
    this.group.add(base);

    for (let i = 0; i < DeckRenderer.MAX_VISIBLE_CARDS; i++) {
      const slab = new THREE.Mesh(this.cardGeom, [
        this.sideMat,
        this.sideMat,
        this.backMat,
        this.sideMat,
        this.edgeMat,
        this.edgeMat,
      ]);
      slab.position.set(i * 1.2, i * 2.2, -i * 1.8);
      slab.rotation.set(0, 0, -i * 0.02);
      slab.visible = false;
      this.group.add(slab);
      this.slabs.push(slab);
    }
  }

  public setCount(count: number): void {
    this.count = Math.max(0, count);
    const visible = Math.min(DeckRenderer.MAX_VISIBLE_CARDS, this.count);
    this.slabs.forEach((slab, index) => {
      slab.visible = index < visible;
      if (!slab.visible) return;
      slab.position.set(index * 1.2, index * 2.2, -index * 1.8);
      slab.rotation.set(0, 0, -index * 0.02);
    });
  }

  public pulseDraw(): void {
    Tween.killTarget(this.group.position);
    Tween.killTarget(this.group.rotation);
    Tween.killTarget(this.pulseAlpha);

    const baseY = 4;
    const baseRotZ = 0.08;
    this.group.position.y = baseY + 2;
    this.group.rotation.z = baseRotZ + 0.02;
    this.pulseAlpha.value = 0.96;
    this.baseMat.opacity = this.pulseAlpha.value;

    Tween.to(this.group.position, { y: baseY + 10 }, 180, Easing.easeOutCubic, () => {
      Tween.to(this.group.position, { y: baseY }, 260, Easing.easeOutBack);
    });
    Tween.to(this.group.rotation, { z: baseRotZ + 0.08 }, 140, Easing.easeOutQuad, () => {
      Tween.to(this.group.rotation, { z: baseRotZ }, 220, Easing.easeOutBack);
    });
    Tween.to(this.pulseAlpha, { value: 1 }, 160, Easing.easeOutQuad, () => {
      this.baseMat.opacity = this.pulseAlpha.value;
      Tween.to(this.pulseAlpha, { value: 0.92 }, 240, Easing.easeOutQuad, () => {
        this.baseMat.opacity = this.pulseAlpha.value;
      });
    });
  }

  public getDrawAnchor(): ProjectedPoint | null {
    const visible = Math.min(DeckRenderer.MAX_VISIBLE_CARDS, Math.max(1, this.count));
    const topIndex = visible - 1;
    const local = new THREE.Vector3(topIndex * 1.2 + 18, topIndex * 2.2 + 22, -topIndex * 1.8 + 4);
    this.group.updateMatrixWorld(true);
    const world = local.applyMatrix4(this.group.matrixWorld);
    const projected = this.projector(world);
    if (projected) {
      this.lastDrawAnchor = projected;
      return projected;
    }
    return this.lastDrawAnchor;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.cardGeom.dispose();
    this.baseGeom.dispose();
    this.baseMat.dispose();
    this.sideMat.dispose();
    this.backMat.dispose();
    this.edgeMat.dispose();
  }
}
