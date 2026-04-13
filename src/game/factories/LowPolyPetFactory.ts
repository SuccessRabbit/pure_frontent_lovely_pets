import * as THREE from 'three';

type Vec3 = [number, number, number];

export interface PetRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  ears: THREE.Group[];
  tails: THREE.Group[];
  legs: THREE.Group[];
  extras: THREE.Group[];
}

/** 宠物配色方案 - 马卡龙风格 Low-poly */
const PET_COLORS: Record<string, number> = {
  pet_001: 0xf5deb3, // 新晋柯基 - 小麦色
  pet_002: 0xa0a0a0, // 暴躁二哈 - 灰白
  pet_003: 0xdeb887, // 摸鱼水豚 - 浅棕
  pet_004: 0xff8c00, // 橘猫胖丁 - 橙色
  pet_005: 0xe6e6fa, // 高冷布偶 - 淡紫
  pet_006: 0xffd700, // 永动机猫 - 金色
};

function createFlatMaterial(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
  });
}

function setTransform(
  object: THREE.Object3D,
  position?: Vec3,
  rotation?: Vec3,
  scale?: Vec3
) {
  if (position) object.position.set(position[0], position[1], position[2]);
  if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) object.scale.set(scale[0], scale[1], scale[2]);
}

function addMesh(
  parent: THREE.Object3D,
  mesh: THREE.Mesh,
  position?: Vec3,
  rotation?: Vec3,
  scale?: Vec3
): THREE.Mesh {
  setTransform(mesh, position, rotation, scale);
  parent.add(mesh);
  return mesh;
}

function createPivot(
  parent: THREE.Object3D,
  name: string,
  position?: Vec3,
  rotation?: Vec3
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  setTransform(pivot, position, rotation);
  parent.add(pivot);
  return pivot;
}

function createBox(w: number, h: number, d: number, mat: THREE.MeshLambertMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat);
}

function createOctahedron(r: number, mat: THREE.MeshLambertMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat);
}

function createTetrahedron(r: number, mat: THREE.MeshLambertMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.TetrahedronGeometry(r, 0), mat);
}

function createCone(
  r: number,
  h: number,
  mat: THREE.MeshLambertMaterial,
  segments = 4
): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, segments, 1), mat);
}

function createSphere(
  r: number,
  mat: THREE.MeshLambertMaterial,
  widthSegments = 5,
  heightSegments = 4
): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, widthSegments, heightSegments), mat);
}

function createPetRig(): PetRig {
  const root = new THREE.Group();
  root.name = 'pet-root';
  const body = createPivot(root, 'body', [0, 0, 0]);
  const head = createPivot(body, 'head', [0, 0.42, 0.18]);
  return {
    root,
    body,
    head,
    ears: [],
    tails: [],
    legs: [],
    extras: [],
  };
}

function createEyePair(
  parent: THREE.Object3D,
  color: number,
  radius: number,
  left: Vec3,
  right: Vec3,
  scale?: Vec3
) {
  const eyeMat = createFlatMaterial(color);
  addMesh(parent, createSphere(radius, eyeMat, 4, 3), left, undefined, scale);
  addMesh(parent, createSphere(radius, eyeMat, 4, 3), right, undefined, scale);
}

function createBrowPair(
  parent: THREE.Object3D,
  color: number,
  left: Vec3,
  right: Vec3,
  rotation = 0.28
) {
  const browMat = createFlatMaterial(color);
  addMesh(parent, createBox(0.12, 0.03, 0.03, browMat), left, [0, 0, -rotation]);
  addMesh(parent, createBox(0.12, 0.03, 0.03, browMat), right, [0, 0, rotation]);
}

function createEar(
  rig: PetRig,
  position: Vec3,
  rotation: Vec3,
  meshFactory: () => THREE.Mesh,
  innerColor?: number
): THREE.Group {
  const pivot = createPivot(rig.head, `ear-${rig.ears.length}`, position, rotation);
  pivot.add(meshFactory());
  if (innerColor !== undefined) {
    const inner = createTetrahedron(0.045, createFlatMaterial(innerColor));
    setTransform(inner, [0, 0.08, 0.01], [0.1, 0, 0]);
    pivot.add(inner);
  }
  rig.ears.push(pivot);
  return pivot;
}

function createLeg(
  rig: PetRig,
  position: Vec3,
  upperSize: Vec3,
  pawSize: Vec3,
  legMat: THREE.MeshLambertMaterial,
  pawMat = legMat,
  rotation?: Vec3
): THREE.Group {
  const pivot = createPivot(rig.body, `leg-${rig.legs.length}`, position, rotation);
  addMesh(
    pivot,
    createBox(upperSize[0], upperSize[1], upperSize[2], legMat),
    [0, -upperSize[1] * 0.5, 0]
  );
  addMesh(
    pivot,
    createBox(pawSize[0], pawSize[1], pawSize[2], pawMat),
    [0, -(upperSize[1] + pawSize[1] * 0.45), 0.02]
  );
  rig.legs.push(pivot);
  return pivot;
}

function createTail(
  rig: PetRig,
  position: Vec3,
  rotation: Vec3,
  build: (pivot: THREE.Group) => void
): THREE.Group {
  const pivot = createPivot(rig.body, `tail-${rig.tails.length}`, position, rotation);
  build(pivot);
  rig.tails.push(pivot);
  return pivot;
}

function createAccessory(
  rig: PetRig,
  parent: THREE.Object3D,
  name: string,
  position: Vec3,
  rotation?: Vec3
): THREE.Group {
  const pivot = createPivot(parent, name, position, rotation);
  rig.extras.push(pivot);
  return pivot;
}

/** pet_001 新晋柯基 - 短腿小狗狗 */
function createCorgi(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_001);
  const whiteMat = createFlatMaterial(0xfff7ef);
  const darkMat = createFlatMaterial(0x2c1810);

  addMesh(rig.body, createBox(0.82, 0.28, 0.58, bodyMat), [0, 0.28, 0]);
  addMesh(rig.body, createBox(0.5, 0.22, 0.34, bodyMat), [0, 0.28, -0.18]);
  addMesh(rig.body, createBox(0.32, 0.18, 0.28, whiteMat), [0, 0.22, 0.24]);
  addMesh(rig.body, createBox(0.26, 0.16, 0.18, bodyMat), [0, 0.42, 0.16], [0.18, 0, 0]);

  rig.head.position.set(0, 0.44, 0.2);
  addMesh(rig.head, createOctahedron(0.23, bodyMat), [0, 0.1, 0.08], [0.1, 0, 0], [1.1, 1, 1.08]);
  addMesh(rig.head, createBox(0.22, 0.14, 0.2, whiteMat), [0, -0.02, 0.24], [0.06, 0, 0]);
  addMesh(rig.head, createSphere(0.07, whiteMat, 4, 3), [-0.07, -0.01, 0.28], undefined, [1.1, 0.9, 0.7]);
  addMesh(rig.head, createSphere(0.07, whiteMat, 4, 3), [0.07, -0.01, 0.28], undefined, [1.1, 0.9, 0.7]);
  addMesh(rig.head, createSphere(0.035, darkMat, 4, 3), [0, -0.02, 0.36], undefined, [1.2, 0.9, 0.8]);
  createEyePair(rig.head, 0x2c1810, 0.032, [-0.09, 0.07, 0.31], [0.09, 0.07, 0.31], [1, 1, 0.6]);
  createBrowPair(rig.head, 0x7f5d36, [-0.1, 0.13, 0.25], [0.1, 0.13, 0.25], 0.18);

  createEar(
    rig,
    [-0.18, 0.2, 0.02],
    [0.05, 0, -0.25],
    () => {
      const ear = createTetrahedron(0.12, bodyMat);
      setTransform(ear, [0, 0.09, 0], [0.1, 0, 0]);
      return ear;
    },
    0xffd1b8
  );
  createEar(
    rig,
    [0.18, 0.2, 0.02],
    [0.05, 0, 0.25],
    () => {
      const ear = createTetrahedron(0.12, bodyMat);
      setTransform(ear, [0, 0.09, 0], [0.1, 0, 0]);
      return ear;
    },
    0xffd1b8
  );

  const pawMat = createFlatMaterial(0xf6e9da);
  createLeg(rig, [-0.27, 0.18, 0.18], [0.12, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, pawMat);
  createLeg(rig, [0.27, 0.18, 0.18], [0.12, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, pawMat);
  createLeg(rig, [-0.27, 0.18, -0.16], [0.12, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, pawMat);
  createLeg(rig, [0.27, 0.18, -0.16], [0.12, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, pawMat);

  createTail(rig, [0, 0.33, -0.34], [-0.45, 0, 0], pivot => {
    addMesh(pivot, createTetrahedron(0.09, bodyMat), [0, 0.04, -0.03], [0.1, 0, 0]);
    addMesh(pivot, createBox(0.07, 0.04, 0.1, whiteMat), [0, 0.04, -0.11], [0.12, 0, 0]);
  });

  return rig;
}

/** pet_002 暴躁二哈 - 眼神犀利的灰白狗狗 */
function createHusky(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_002);
  const whiteMat = createFlatMaterial(0xffffff);
  const blackMat = createFlatMaterial(0x2c2c2c);
  const blueMat = createFlatMaterial(0x4a90e2);

  addMesh(rig.body, createBox(0.86, 0.32, 0.62, bodyMat), [0, 0.3, 0]);
  addMesh(rig.body, createBox(0.4, 0.2, 0.36, whiteMat), [0, 0.22, 0.23], [0.06, 0, 0]);
  addMesh(rig.body, createBox(0.26, 0.18, 0.18, bodyMat), [0, 0.44, 0.2], [0.16, 0, 0]);

  rig.head.position.set(0, 0.48, 0.24);
  addMesh(rig.head, createOctahedron(0.25, bodyMat), [0, 0.12, 0.08], [0.12, 0, 0], [1.05, 1, 1.12]);
  addMesh(rig.head, createBox(0.26, 0.14, 0.18, whiteMat), [0, 0, 0.24], [0.08, 0, 0]);
  addMesh(rig.head, createBox(0.12, 0.14, 0.06, blackMat), [-0.09, 0.05, 0.28], [0.05, 0, -0.18]);
  addMesh(rig.head, createBox(0.12, 0.14, 0.06, blackMat), [0.09, 0.05, 0.28], [0.05, 0, 0.18]);
  addMesh(rig.head, createBox(0.11, 0.07, 0.08, blackMat), [0, -0.01, 0.33], [0.08, 0, 0]);
  addMesh(rig.head, createSphere(0.035, blackMat, 4, 3), [0, -0.02, 0.38], undefined, [1.25, 0.9, 0.8]);
  createEyePair(rig.head, 0x4a90e2, 0.034, [-0.1, 0.09, 0.31], [0.1, 0.09, 0.31], [1, 1, 0.55]);
  createBrowPair(rig.head, 0x1f1f1f, [-0.1, 0.17, 0.24], [0.1, 0.17, 0.24], 0.3);

  createEar(
    rig,
    [-0.2, 0.25, 0.02],
    [0, 0, -0.12],
    () => {
      const ear = createCone(0.08, 0.24, bodyMat);
      setTransform(ear, [0, 0.12, 0], [0, 0, Math.PI]);
      return ear;
    },
    0xffd8d8
  );
  createEar(
    rig,
    [0.2, 0.25, 0.02],
    [0, 0, 0.12],
    () => {
      const ear = createCone(0.08, 0.24, bodyMat);
      setTransform(ear, [0, 0.12, 0], [0, 0, Math.PI]);
      return ear;
    },
    0xffd8d8
  );

  createLeg(rig, [-0.28, 0.18, 0.2], [0.11, 0.22, 0.12], [0.13, 0.08, 0.16], bodyMat, whiteMat);
  createLeg(rig, [0.28, 0.18, 0.2], [0.11, 0.22, 0.12], [0.13, 0.08, 0.16], bodyMat, whiteMat);
  createLeg(rig, [-0.28, 0.18, -0.18], [0.11, 0.24, 0.12], [0.13, 0.08, 0.16], bodyMat, whiteMat);
  createLeg(rig, [0.28, 0.18, -0.18], [0.11, 0.24, 0.12], [0.13, 0.08, 0.16], bodyMat, whiteMat);

  createTail(rig, [0, 0.36, -0.36], [0.75, 0, 0], pivot => {
    addMesh(pivot, createCone(0.07, 0.2, bodyMat), [0, 0.08, -0.03], [0, 0, Math.PI]);
    addMesh(pivot, createCone(0.05, 0.18, whiteMat), [0, 0.19, -0.08], [0, 0, Math.PI]);
  });

  const eyeGlow = createAccessory(rig, rig.head, 'husky-eye-glow', [0, 0.09, 0.3]);
  addMesh(eyeGlow, createBox(0.04, 0.02, 0.01, blueMat), [-0.1, 0, 0]);
  addMesh(eyeGlow, createBox(0.04, 0.02, 0.01, blueMat), [0.1, 0, 0]);

  return rig;
}

/** pet_003 摸鱼水豚 - 圆润的椭圆身材 */
function createCapybara(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_003);
  const noseMat = createFlatMaterial(0x8b7355);
  const darkMat = createFlatMaterial(0x2c1810);
  const creamMat = createFlatMaterial(0xf3dcc0);

  addMesh(rig.body, createSphere(0.32, bodyMat, 5, 4), [0, 0.31, 0.02], undefined, [1.42, 0.88, 1.34]);
  addMesh(rig.body, createSphere(0.22, bodyMat, 5, 4), [0, 0.29, -0.2], undefined, [1.2, 0.8, 1.1]);
  addMesh(rig.body, createSphere(0.16, creamMat, 4, 3), [0, 0.2, 0.18], undefined, [1.5, 0.65, 1]);

  rig.head.position.set(0, 0.44, 0.24);
  addMesh(rig.head, createSphere(0.22, bodyMat, 5, 4), [0, 0.11, 0.08], undefined, [1.28, 0.92, 1.06]);
  addMesh(rig.head, createBox(0.24, 0.11, 0.16, creamMat), [0, 0.01, 0.24], [0.08, 0, 0]);
  addMesh(rig.head, createSphere(0.075, noseMat, 4, 3), [0, 0, 0.33], undefined, [1.4, 0.9, 0.9]);
  addMesh(rig.head, createBox(0.12, 0.03, 0.05, darkMat), [0, -0.02, 0.39], [0.06, 0, 0]);
  createEyePair(rig.head, 0x2c1810, 0.028, [-0.09, 0.12, 0.26], [0.09, 0.12, 0.26], [1, 1, 0.45]);

  createEar(
    rig,
    [-0.14, 0.2, 0.02],
    [0.2, 0, -0.05],
    () => {
      const ear = createSphere(0.055, bodyMat, 4, 3);
      setTransform(ear, [0, 0.03, 0], undefined, [1, 0.9, 0.8]);
      return ear;
    }
  );
  createEar(
    rig,
    [0.14, 0.2, 0.02],
    [0.2, 0, 0.05],
    () => {
      const ear = createSphere(0.055, bodyMat, 4, 3);
      setTransform(ear, [0, 0.03, 0], undefined, [1, 0.9, 0.8]);
      return ear;
    }
  );

  createLeg(rig, [-0.22, 0.18, 0.16], [0.14, 0.12, 0.14], [0.16, 0.06, 0.18], bodyMat, noseMat);
  createLeg(rig, [0.22, 0.18, 0.16], [0.14, 0.12, 0.14], [0.16, 0.06, 0.18], bodyMat, noseMat);
  createLeg(rig, [-0.22, 0.18, -0.14], [0.14, 0.12, 0.14], [0.16, 0.06, 0.18], bodyMat, noseMat);
  createLeg(rig, [0.22, 0.18, -0.14], [0.14, 0.12, 0.14], [0.16, 0.06, 0.18], bodyMat, noseMat);

  const sleepy = createAccessory(rig, rig.head, 'capybara-brow', [0, 0.15, 0.24]);
  addMesh(sleepy, createBox(0.07, 0.02, 0.02, darkMat), [-0.08, 0, 0], [0, 0, -0.08]);
  addMesh(sleepy, createBox(0.07, 0.02, 0.02, darkMat), [0.08, 0, 0], [0, 0, 0.08]);

  return rig;
}

/** pet_004 橘猫胖丁 - 圆滚滚的橘猫 */
function createOrangeCat(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_004);
  const creamMat = createFlatMaterial(0xfff5e6);
  const pinkMat = createFlatMaterial(0xffb6c1);
  const darkMat = createFlatMaterial(0x2c1810);

  addMesh(rig.body, createBox(0.74, 0.3, 0.56, bodyMat), [0, 0.3, 0]);
  addMesh(rig.body, createSphere(0.17, creamMat, 4, 3), [0, 0.23, 0.19], undefined, [1.3, 1, 0.8]);
  addMesh(rig.body, createBox(0.4, 0.12, 0.08, creamMat), [0, 0.21, 0.23], [0.08, 0, 0]);

  rig.head.position.set(0, 0.45, 0.2);
  addMesh(rig.head, createOctahedron(0.24, bodyMat), [0, 0.13, 0.08], [0.1, 0, 0], [1.05, 1, 1.08]);
  addMesh(rig.head, createSphere(0.1, creamMat, 4, 3), [-0.07, 0.02, 0.24], undefined, [1.1, 0.9, 0.8]);
  addMesh(rig.head, createSphere(0.1, creamMat, 4, 3), [0.07, 0.02, 0.24], undefined, [1.1, 0.9, 0.8]);
  addMesh(rig.head, createSphere(0.03, pinkMat, 4, 3), [0, 0.02, 0.34], undefined, [1.2, 1, 0.8]);
  createEyePair(rig.head, 0x2c1810, 0.032, [-0.1, 0.1, 0.27], [0.1, 0.1, 0.27], [1, 1.1, 0.45]);
  createBrowPair(rig.head, 0x8d4f19, [-0.1, 0.17, 0.22], [0.1, 0.17, 0.22], 0.12);

  createEar(
    rig,
    [-0.19, 0.22, 0.02],
    [0.02, 0, -0.18],
    () => {
      const ear = createTetrahedron(0.11, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd0c0
  );
  createEar(
    rig,
    [0.19, 0.22, 0.02],
    [0.02, 0, 0.18],
    () => {
      const ear = createTetrahedron(0.11, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd0c0
  );

  createLeg(rig, [-0.24, 0.18, 0.18], [0.13, 0.15, 0.13], [0.15, 0.07, 0.16], bodyMat, creamMat);
  createLeg(rig, [0.24, 0.18, 0.18], [0.13, 0.15, 0.13], [0.15, 0.07, 0.16], bodyMat, creamMat);
  createLeg(rig, [-0.24, 0.18, -0.16], [0.13, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, creamMat);
  createLeg(rig, [0.24, 0.18, -0.16], [0.13, 0.16, 0.13], [0.15, 0.07, 0.16], bodyMat, creamMat);

  createTail(rig, [0, 0.34, -0.34], [0.45, 0, 0], pivot => {
    addMesh(pivot, createBox(0.08, 0.08, 0.22, bodyMat), [0, 0.04, -0.08], [0.1, 0, 0]);
    addMesh(pivot, createBox(0.07, 0.07, 0.18, bodyMat), [0, 0.1, -0.22], [0.22, 0, 0]);
    addMesh(pivot, createBox(0.06, 0.06, 0.1, creamMat), [0, 0.16, -0.32], [0.28, 0, 0]);
  });

  const whiskers = createAccessory(rig, rig.head, 'cat-whiskers', [0, 0.02, 0.27]);
  addMesh(whiskers, createBox(0.14, 0.01, 0.01, darkMat), [-0.12, 0, 0], [0, 0, 0.14]);
  addMesh(whiskers, createBox(0.14, 0.01, 0.01, darkMat), [0.12, 0, 0], [0, 0, -0.14]);

  return rig;
}

/** pet_005 高冷布偶 - 优雅的紫色猫咪 */
function createRagdoll(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_005);
  const whiteMat = createFlatMaterial(0xffffff);
  const blueMat = createFlatMaterial(0x4169e1);
  const accentMat = createFlatMaterial(0xb0a0d5);

  addMesh(rig.body, createBox(0.68, 0.28, 0.52, bodyMat), [0, 0.29, 0]);
  addMesh(rig.body, createSphere(0.15, whiteMat, 4, 3), [0, 0.22, 0.18], undefined, [1.4, 1.1, 0.8]);
  addMesh(rig.body, createSphere(0.11, accentMat, 4, 3), [0, 0.36, 0.06], undefined, [1.2, 0.9, 1.1]);

  rig.head.position.set(0, 0.45, 0.22);
  addMesh(rig.head, createOctahedron(0.22, bodyMat), [0, 0.12, 0.08], [0.08, 0, 0], [1, 1, 1.1]);
  addMesh(rig.head, createSphere(0.1, whiteMat, 4, 3), [-0.08, 0.03, 0.22], undefined, [0.95, 0.95, 0.7]);
  addMesh(rig.head, createSphere(0.1, whiteMat, 4, 3), [0.08, 0.03, 0.22], undefined, [0.95, 0.95, 0.7]);
  addMesh(rig.head, createBox(0.1, 0.08, 0.08, whiteMat), [0, 0.01, 0.29], [0.06, 0, 0]);
  createEyePair(rig.head, 0x4169e1, 0.034, [-0.09, 0.09, 0.28], [0.09, 0.09, 0.28], [1, 1.1, 0.45]);
  createBrowPair(rig.head, 0x7d73a3, [-0.09, 0.16, 0.22], [0.09, 0.16, 0.22], 0.08);

  createEar(
    rig,
    [-0.18, 0.21, 0.02],
    [0.05, 0, -0.14],
    () => {
      const ear = createTetrahedron(0.1, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd9eb
  );
  createEar(
    rig,
    [0.18, 0.21, 0.02],
    [0.05, 0, 0.14],
    () => {
      const ear = createTetrahedron(0.1, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd9eb
  );

  createLeg(rig, [-0.22, 0.17, 0.18], [0.1, 0.19, 0.11], [0.13, 0.08, 0.14], bodyMat, whiteMat);
  createLeg(rig, [0.22, 0.17, 0.18], [0.1, 0.19, 0.11], [0.13, 0.08, 0.14], bodyMat, whiteMat);
  createLeg(rig, [-0.22, 0.17, -0.16], [0.1, 0.21, 0.11], [0.13, 0.08, 0.14], bodyMat, whiteMat);
  createLeg(rig, [0.22, 0.17, -0.16], [0.1, 0.21, 0.11], [0.13, 0.08, 0.14], bodyMat, whiteMat);

  createTail(rig, [0, 0.31, -0.32], [0.38, 0, 0], pivot => {
    addMesh(pivot, createBox(0.06, 0.06, 0.2, bodyMat), [0, 0.04, -0.08], [0.08, 0, 0]);
    addMesh(pivot, createBox(0.08, 0.08, 0.18, whiteMat), [0, 0.11, -0.22], [0.2, 0, 0]);
    addMesh(pivot, createBox(0.05, 0.05, 0.14, bodyMat), [0, 0.17, -0.32], [0.24, 0, 0]);
  });

  const chestFluff = createAccessory(rig, rig.body, 'ragdoll-fluff', [0, 0.26, 0.14], [0.15, 0, 0]);
  addMesh(chestFluff, createCone(0.08, 0.18, whiteMat, 5), [0, -0.02, 0.02], [0, 0, Math.PI]);
  addMesh(chestFluff, createCone(0.05, 0.14, whiteMat, 5), [-0.05, -0.04, 0], [0, 0, Math.PI * 1.02]);
  addMesh(chestFluff, createCone(0.05, 0.14, whiteMat, 5), [0.05, -0.04, 0], [0, 0, Math.PI * 0.98]);

  const eyeShine = createAccessory(rig, rig.head, 'ragdoll-eye-shine', [0, 0.1, 0.28]);
  addMesh(eyeShine, createBox(0.02, 0.02, 0.01, blueMat), [-0.08, 0.02, 0.02]);
  addMesh(eyeShine, createBox(0.02, 0.02, 0.01, blueMat), [0.08, 0.02, 0.02]);

  return rig;
}

/** pet_006 永动机猫 - 金色的传奇猫咪 */
function createEternalCat(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(PET_COLORS.pet_006);
  const whiteMat = createFlatMaterial(0xfff8dc);
  const goldMat = createFlatMaterial(0xdaa520);
  const amberMat = createFlatMaterial(0xffec7a);

  addMesh(rig.body, createBox(0.72, 0.3, 0.56, bodyMat), [0, 0.3, 0]);
  addMesh(rig.body, createBox(0.38, 0.14, 0.08, whiteMat), [0, 0.23, 0.22], [0.08, 0, 0]);
  addMesh(rig.body, createSphere(0.12, goldMat, 4, 3), [0, 0.39, 0.04], undefined, [1.2, 0.85, 1]);

  rig.head.position.set(0, 0.46, 0.21);
  addMesh(rig.head, createOctahedron(0.24, bodyMat), [0, 0.13, 0.08], [0.08, 0, 0], [1.05, 1, 1.08]);
  addMesh(rig.head, createSphere(0.1, whiteMat, 4, 3), [-0.07, 0.03, 0.24], undefined, [1, 0.95, 0.72]);
  addMesh(rig.head, createSphere(0.1, whiteMat, 4, 3), [0.07, 0.03, 0.24], undefined, [1, 0.95, 0.72]);
  addMesh(rig.head, createSphere(0.03, goldMat, 4, 3), [0, 0.02, 0.34], undefined, [1.1, 1, 0.8]);
  createEyePair(rig.head, 0xffd700, 0.036, [-0.09, 0.1, 0.28], [0.09, 0.1, 0.28], [1, 1.1, 0.45]);
  createBrowPair(rig.head, 0xb8860b, [-0.09, 0.18, 0.22], [0.09, 0.18, 0.22], 0.08);

  createEar(
    rig,
    [-0.19, 0.22, 0.02],
    [0.02, 0, -0.12],
    () => {
      const ear = createTetrahedron(0.11, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd48c
  );
  createEar(
    rig,
    [0.19, 0.22, 0.02],
    [0.02, 0, 0.12],
    () => {
      const ear = createTetrahedron(0.11, bodyMat);
      setTransform(ear, [0, 0.08, 0]);
      return ear;
    },
    0xffd48c
  );

  createLeg(rig, [-0.24, 0.18, 0.18], [0.11, 0.19, 0.12], [0.13, 0.08, 0.15], bodyMat, whiteMat);
  createLeg(rig, [0.24, 0.18, 0.18], [0.11, 0.19, 0.12], [0.13, 0.08, 0.15], bodyMat, whiteMat);
  createLeg(rig, [-0.24, 0.18, -0.16], [0.11, 0.2, 0.12], [0.13, 0.08, 0.15], bodyMat, whiteMat);
  createLeg(rig, [0.24, 0.18, -0.16], [0.11, 0.2, 0.12], [0.13, 0.08, 0.15], bodyMat, whiteMat);

  createTail(rig, [0, 0.35, -0.3], [0.55, 0, 0], pivot => {
    addMesh(pivot, createBox(0.08, 0.08, 0.22, bodyMat), [0, 0.04, -0.08], [0.1, 0, 0]);
    addMesh(pivot, createBox(0.07, 0.07, 0.16, amberMat), [0, 0.12, -0.22], [0.2, 0, 0]);
  });
  createTail(rig, [-0.08, 0.33, -0.3], [0.48, 0.18, 0], pivot => {
    addMesh(pivot, createBox(0.06, 0.06, 0.2, bodyMat), [0, 0.04, -0.08], [0.12, 0, 0]);
    addMesh(pivot, createBox(0.05, 0.05, 0.14, goldMat), [0, 0.11, -0.2], [0.24, 0, 0]);
  });
  createTail(rig, [0.08, 0.33, -0.3], [0.48, -0.18, 0], pivot => {
    addMesh(pivot, createBox(0.06, 0.06, 0.2, bodyMat), [0, 0.04, -0.08], [0.12, 0, 0]);
    addMesh(pivot, createBox(0.05, 0.05, 0.14, goldMat), [0, 0.11, -0.2], [0.24, 0, 0]);
  });

  const crown = createAccessory(rig, rig.head, 'eternal-crown', [0, 0.24, 0.12], [0.02, 0, 0]);
  addMesh(crown, createCone(0.06, 0.14, goldMat, 5), [0, 0.05, 0], [0, 0, Math.PI]);
  addMesh(crown, createSphere(0.03, amberMat, 4, 3), [0, 0.12, 0.01]);
  const halo = createAccessory(rig, rig.body, 'eternal-halo', [0, 0.48, 0.02], [Math.PI / 2, 0, 0]);
  addMesh(halo, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 4, 8), goldMat));

  return rig;
}

function createDefaultPet(): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(0x888888);
  const accentMat = createFlatMaterial(0xb0b0b0);

  addMesh(rig.body, createBox(0.55, 0.28, 0.4, bodyMat), [0, 0.28, 0]);
  rig.head.position.set(0, 0.42, 0.16);
  addMesh(rig.head, createBox(0.28, 0.2, 0.2, accentMat), [0, 0.08, 0.08]);
  createEyePair(rig.head, 0x222222, 0.03, [-0.07, 0.08, 0.2], [0.07, 0.08, 0.2], [1, 1, 0.4]);
  createLeg(rig, [-0.18, 0.17, 0.12], [0.1, 0.16, 0.1], [0.12, 0.07, 0.12], bodyMat);
  createLeg(rig, [0.18, 0.17, 0.12], [0.1, 0.16, 0.1], [0.12, 0.07, 0.12], bodyMat);
  createLeg(rig, [-0.18, 0.17, -0.12], [0.1, 0.16, 0.1], [0.12, 0.07, 0.12], bodyMat);
  createLeg(rig, [0.18, 0.17, -0.12], [0.1, 0.16, 0.1], [0.12, 0.07, 0.12], bodyMat);
  createTail(rig, [0, 0.3, -0.26], [0.3, 0, 0], pivot => {
    addMesh(pivot, createBox(0.05, 0.05, 0.16, accentMat), [0, 0.04, -0.06], [0.1, 0, 0]);
  });

  return rig;
}

/** 根据宠物 ID 创建对应的 Low-poly 模型 */
export function createLowPolyPet(petId: string): PetRig {
  switch (petId) {
    case 'pet_001':
      return createCorgi();
    case 'pet_002':
      return createHusky();
    case 'pet_003':
      return createCapybara();
    case 'pet_004':
      return createOrangeCat();
    case 'pet_005':
      return createRagdoll();
    case 'pet_006':
      return createEternalCat();
    default:
      return createDefaultPet();
  }
}
