import * as THREE from 'three';

/** 格子状态 */
type CellState = 'empty' | 'occupied' | 'ruins';
type CellHoverMode = 'none' | 'placement' | 'targeting';

/** 3D 网格格子 - 管理单个格子的 3D 平面和边框 */
export class GridCell3D {
  public readonly row: number;
  public readonly col: number;
  public readonly mesh: THREE.Mesh;
  public readonly borderMesh: THREE.LineSegments;

  private currentState: CellState = 'empty';
  private hoverMode: CellHoverMode = 'none';
  private isActionPickEligible = false;
  private isActionPickSelected = false;

  // 颜色定义
  private static readonly COLOR_EMPTY = 0x3d5a80;
  private static readonly COLOR_EMPTY_LINE = 0x7eb8da;
  private static readonly COLOR_OCCUPIED = 0x1e8449;
  private static readonly COLOR_OCCUPIED_LINE = 0x58d68d;
  private static readonly COLOR_RUINS = 0x2c3c4c;
  private static readonly COLOR_RUINS_LINE = 0x566573;
  private static readonly COLOR_PLACEMENT = 0x3498db;
  private static readonly COLOR_PLACEMENT_LINE = 0x5dade2;
  private static readonly COLOR_TARGETING = 0xf59e0b;
  private static readonly COLOR_TARGETING_LINE = 0xf8c471;
  private static readonly COLOR_SELECTED = 0xd946ef;
  private static readonly COLOR_ELIGIBLE = 0xf59e0b;

  constructor(row: number, col: number, centerX: number, centerZ: number, width: number, height: number) {
    this.row = row;
    this.col = col;

    // 创建扁平板块几何体（躺在 XZ 平面上，有一定厚度便于射线检测）
    // 使用 BoxGeometry 替代 PlaneGeometry，避免射线检测问题
    const geometry = new THREE.BoxGeometry(width, 2, height);
    const material = new THREE.MeshLambertMaterial({
      color: GridCell3D.COLOR_EMPTY,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(centerX, -0.5, centerZ); // 底部在 Y=-1, 顶部在 Y=1, 中间在 Y=0
    this.mesh.userData = { gridKey: `${row}|${col}`, row, col };

    // 创建边框线（与板块顶部边缘对齐）
    const borderGeometry = new THREE.BufferGeometry();
    const hw = width / 2;
    const hh = height / 2;
    const vertices = new Float32Array([
      // 4 个角点围成的矩形边框（在 Y=1 高度）
      -hw, 1, -hh,  hw, 1, -hh,  // 底边
      hw, 1, -hh,   hw, 1, hh,   // 右边
      hw, 1, hh,   -hw, 1, hh,   // 顶边
      -hw, 1, hh,  -hw, 1, -hh,  // 左边
    ]);
    borderGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const borderMaterial = new THREE.LineBasicMaterial({
      color: GridCell3D.COLOR_EMPTY_LINE,
      linewidth: 2,
    });
    this.borderMesh = new THREE.LineSegments(borderGeometry, borderMaterial);
    this.borderMesh.position.set(centerX, 1, centerZ); // 边框在板块顶部高度
  }

  /** 应用当前状态的默认颜色 */
  private applyStateColor(): void {
    const mat = this.mesh.material as THREE.MeshLambertMaterial;
    const borderMat = this.borderMesh.material as THREE.LineBasicMaterial;

    switch (this.currentState) {
      case 'occupied':
        mat.color.setHex(GridCell3D.COLOR_OCCUPIED);
        mat.opacity = 0.85;
        borderMat.color.setHex(GridCell3D.COLOR_OCCUPIED_LINE);
        break;
      case 'ruins':
        mat.color.setHex(GridCell3D.COLOR_RUINS);
        mat.opacity = 0.92;
        borderMat.color.setHex(GridCell3D.COLOR_RUINS_LINE);
        break;
      default:
        mat.color.setHex(GridCell3D.COLOR_EMPTY);
        mat.opacity = 0.75;
        borderMat.color.setHex(GridCell3D.COLOR_EMPTY_LINE);
    }
  }

  private applyVisualState(): void {
    const mat = this.mesh.material as THREE.MeshLambertMaterial;
    const borderMat = this.borderMesh.material as THREE.LineBasicMaterial;

    if (this.isActionPickSelected) {
      mat.color.setHex(GridCell3D.COLOR_SELECTED);
      mat.opacity = 0.34;
      borderMat.color.setHex(GridCell3D.COLOR_SELECTED);
      return;
    }

    if (this.hoverMode === 'targeting') {
      mat.color.setHex(GridCell3D.COLOR_TARGETING);
      mat.opacity = this.isActionPickEligible ? 0.3 : 0.24;
      borderMat.color.setHex(GridCell3D.COLOR_TARGETING_LINE);
      return;
    }

    if (this.isActionPickEligible) {
      mat.color.setHex(GridCell3D.COLOR_ELIGIBLE);
      mat.opacity = 0.18;
      borderMat.color.setHex(GridCell3D.COLOR_ELIGIBLE);
      return;
    }

    if (this.hoverMode === 'placement') {
      mat.color.setHex(GridCell3D.COLOR_PLACEMENT);
      mat.opacity = 0.65;
      borderMat.color.setHex(GridCell3D.COLOR_PLACEMENT_LINE);
      return;
    }

    this.applyStateColor();
  }

  /** 设置为空状态 */
  setEmpty(): void {
    this.currentState = 'empty';
    this.applyVisualState();
  }

  /** 设置为占用状态 */
  setOccupied(): void {
    this.currentState = 'occupied';
    this.applyVisualState();
  }

  /** 设置为废墟状态 */
  setRuins(): void {
    this.currentState = 'ruins';
    this.applyVisualState();
  }

  /** 设置高亮状态 */
  setHighlighted(highlighted: boolean): void {
    this.setHoverMode(highlighted ? 'placement' : 'none');
  }

  setHoverMode(mode: CellHoverMode): void {
    if (this.hoverMode === mode) return;
    this.hoverMode = mode;
    this.applyVisualState();
  }

  /** 设置行动牌选格样式 */
  setActionPick(eligible: boolean, selected: boolean): void {
    if (this.isActionPickEligible === eligible && this.isActionPickSelected === selected) return;
    this.isActionPickEligible = eligible;
    this.isActionPickSelected = selected;
    this.applyVisualState();
  }

  /** 销毁格子，释放资源 */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.borderMesh.geometry.dispose();
    (this.borderMesh.material as THREE.Material).dispose();
  }
}
