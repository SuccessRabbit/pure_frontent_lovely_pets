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

function createCylinder(
  rTop: number,
  rBottom: number,
  h: number,
  mat: THREE.MeshLambertMaterial,
  segments = 6
): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1), mat);
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

type HeadStyle = 'octa' | 'sphere' | 'box';
type EarStyle = 'pointy' | 'floppy' | 'round' | 'long' | 'crest' | 'feather' | 'none';
type TailStyle = 'stub' | 'plume' | 'curl' | 'paddle' | 'fan' | 'ring' | 'puff' | 'none';
type SnoutStyle = 'muzzle' | 'short' | 'beak' | 'none';
type AccessoryStyle =
  | 'none'
  | 'glasses'
  | 'laptop'
  | 'briefcase'
  | 'calculator'
  | 'guitar'
  | 'headset'
  | 'clipboard'
  | 'leaf'
  | 'badge'
  | 'megaphone'
  | 'mic'
  | 'bubble_tea'
  | 'chart'
  | 'gavel'
  | 'crate';

interface ChibiAnimalOptions {
  bodyColor: number;
  accentColor: number;
  detailColor?: number;
  bellyColor?: number;
  extraColor?: number;
  cheekColor?: number;
  headStyle?: HeadStyle;
  earStyle?: EarStyle;
  tailStyle?: TailStyle;
  snoutStyle?: SnoutStyle;
  accessory?: AccessoryStyle;
  bodyScale?: Vec3;
  headScale?: Vec3;
  bodyOffset?: Vec3;
  headOffset?: Vec3;
  eyeScale?: Vec3;
  addWhiskers?: boolean;
}

function createHeadMesh(style: HeadStyle, mat: THREE.MeshLambertMaterial): THREE.Mesh {
  switch (style) {
    case 'sphere':
      return createSphere(0.22, mat, 5, 4);
    case 'box':
      return createBox(0.36, 0.26, 0.28, mat);
    default:
      return createOctahedron(0.23, mat);
  }
}

function addSnout(
  rig: PetRig,
  style: SnoutStyle,
  accentMat: THREE.MeshLambertMaterial,
  darkMat: THREE.MeshLambertMaterial
) {
  if (style === 'none') return;
  if (style === 'beak') {
    addMesh(rig.head, createCone(0.045, 0.16, accentMat, 4), [0, 0, 0.3], [Math.PI / 2, 0, 0]);
    addMesh(rig.head, createSphere(0.022, darkMat, 4, 3), [0, 0.02, 0.38], undefined, [1.1, 0.8, 1]);
    return;
  }

  const scale: Vec3 = style === 'short' ? [1, 0.75, 0.8] : [1.2, 0.9, 0.95];
  addMesh(rig.head, createBox(0.2, 0.12, 0.18, accentMat), [0, -0.02, 0.24], [0.06, 0, 0], scale);
  addMesh(rig.head, createSphere(0.028, darkMat, 4, 3), [0, style === 'short' ? 0 : -0.01, 0.34], undefined, [1.2, 0.85, 0.75]);
  if (style === 'muzzle') {
    addMesh(rig.head, createSphere(0.055, accentMat, 4, 3), [-0.06, -0.01, 0.27], undefined, [1, 0.8, 0.65]);
    addMesh(rig.head, createSphere(0.055, accentMat, 4, 3), [0.06, -0.01, 0.27], undefined, [1, 0.8, 0.65]);
  }
  addMesh(rig.head, createBox(0.08, 0.012, 0.015, darkMat), [0, -0.055, 0.31], [0, 0, 0.02]);
  addMesh(rig.head, createBox(0.08, 0.012, 0.015, darkMat), [0, -0.055, 0.31], [0, 0, -0.02]);
  addMesh(rig.head, createBox(0.014, 0.05, 0.015, darkMat), [0, -0.035, 0.31]);
}

function addChibiEars(
  rig: PetRig,
  style: EarStyle,
  bodyMat: THREE.MeshLambertMaterial,
  accentMat: THREE.MeshLambertMaterial
) {
  if (style === 'none') return;
  if (style === 'crest') {
    [-0.08, 0, 0.08].forEach((offset, index) => {
      const crest = createAccessory(
        rig,
        rig.head,
        `crest-${index}`,
        [offset, 0.19 + Math.abs(offset) * 0.15, 0.08]
      );
      addMesh(crest, createTetrahedron(0.07 - Math.abs(offset) * 0.08, accentMat), [0, 0.04, 0], [0.1, 0, 0]);
    });
    return;
  }
  if (style === 'feather') {
    createEar(
      rig,
      [-0.16, 0.2, 0.02],
      [0.15, 0, -0.5],
      () => createCone(0.06, 0.2, bodyMat, 5)
    );
    createEar(
      rig,
      [0.16, 0.2, 0.02],
      [0.15, 0, 0.5],
      () => createCone(0.06, 0.2, bodyMat, 5)
    );
    return;
  }
  if (style === 'round') {
    createEar(rig, [-0.16, 0.14, 0.05], [0, 0, 0], () => createSphere(0.09, bodyMat, 4, 3), undefined);
    createEar(rig, [0.16, 0.14, 0.05], [0, 0, 0], () => createSphere(0.09, bodyMat, 4, 3), undefined);
    return;
  }
  if (style === 'long') {
    createEar(
      rig,
      [-0.17, 0.16, 0.03],
      [0.08, 0, -0.2],
      () => createBox(0.07, 0.24, 0.06, bodyMat),
      undefined
    );
    createEar(
      rig,
      [0.17, 0.16, 0.03],
      [0.08, 0, 0.2],
      () => createBox(0.07, 0.24, 0.06, bodyMat),
      undefined
    );
    return;
  }
  if (style === 'floppy') {
    createEar(
      rig,
      [-0.15, 0.17, 0.02],
      [0.24, 0, -0.55],
      () => createBox(0.06, 0.2, 0.07, bodyMat),
      undefined
    );
    createEar(
      rig,
      [0.15, 0.17, 0.02],
      [0.24, 0, 0.55],
      () => createBox(0.06, 0.2, 0.07, bodyMat),
      undefined
    );
    return;
  }
  createEar(
    rig,
    [-0.18, 0.2, 0.02],
    [0.05, 0, -0.28],
    () => createTetrahedron(0.11, bodyMat),
    accentMat.color.getHex()
  );
  createEar(
    rig,
    [0.18, 0.2, 0.02],
    [0.05, 0, 0.28],
    () => createTetrahedron(0.11, bodyMat),
    accentMat.color.getHex()
  );
}

function addChibiTail(
  rig: PetRig,
  style: TailStyle,
  bodyMat: THREE.MeshLambertMaterial,
  accentMat: THREE.MeshLambertMaterial
) {
  if (style === 'none') return;
  if (style === 'puff') {
    createTail(rig, [0.08, 0.34, -0.28], [0.3, 0, 0], pivot => {
      addMesh(pivot, createSphere(0.08, bodyMat, 4, 3), [0.02, 0.04, -0.08]);
      addMesh(pivot, createSphere(0.05, accentMat, 4, 3), [0.08, 0.07, -0.1]);
    });
    return;
  }
  if (style === 'curl') {
    createTail(rig, [0.02, 0.35, -0.3], [Math.PI / 2, 0, 0], pivot => {
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 4, 10), bodyMat);
      setTransform(curl, [0.02, 0.08, 0.01], [0, 0.4, 0]);
      pivot.add(curl);
    });
    return;
  }
  if (style === 'paddle') {
    createTail(rig, [0.06, 0.28, -0.3], [0.18, 0, 0], pivot => {
      addMesh(pivot, createBox(0.08, 0.03, 0.16, bodyMat), [0, 0.02, -0.06], [0.12, 0, 0]);
      addMesh(pivot, createBox(0.18, 0.03, 0.22, accentMat), [0.02, 0.02, -0.19], [0.02, 0, 0]);
    });
    return;
  }
  if (style === 'fan') {
    createTail(rig, [0.06, 0.32, -0.32], [0.4, 0, 0], pivot => {
      addMesh(pivot, createCone(0.14, 0.2, bodyMat, 5), [0, 0.06, -0.04], [Math.PI, 0, 0]);
      addMesh(pivot, createCone(0.08, 0.16, accentMat, 5), [0, 0.06, -0.03], [Math.PI, 0, 0]);
    });
    return;
  }
  if (style === 'ring') {
    createTail(rig, [0.05, 0.34, -0.3], [Math.PI / 2, 0, 0], pivot => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 4, 8), bodyMat);
      setTransform(ring, [0.04, 0.1, 0], [0, 0.5, 0]);
      pivot.add(ring);
      addMesh(pivot, createBox(0.04, 0.04, 0.11, accentMat), [0.09, 0.1, -0.02], [0.1, 0, 0]);
    });
    return;
  }
  if (style === 'plume') {
    createTail(rig, [0.04, 0.34, -0.3], [0.4, -0.1, 0], pivot => {
      addMesh(pivot, createBox(0.05, 0.05, 0.18, bodyMat), [0, 0.05, -0.08], [0.1, 0, 0]);
      addMesh(pivot, createBox(0.05, 0.05, 0.12, accentMat), [0.01, 0.1, -0.18], [0.18, 0, 0]);
    });
    return;
  }
  createTail(rig, [0, 0.32, -0.28], [0.32, 0, 0], pivot => {
    addMesh(pivot, createBox(0.05, 0.05, 0.12, bodyMat), [0, 0.04, -0.05], [0.1, 0, 0]);
  });
}

function addAccessoryDetails(
  rig: PetRig,
  style: AccessoryStyle,
  accentMat: THREE.MeshLambertMaterial,
  extraMat: THREE.MeshLambertMaterial,
  detailMat: THREE.MeshLambertMaterial
) {
  if (style === 'none') return;
  if (style === 'glasses') {
    const frame = createAccessory(rig, rig.head, 'glasses', [0, 0.08, 0.18]);
    addMesh(frame, new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 4, 8), detailMat), [-0.08, 0, 0]);
    addMesh(frame, new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 4, 8), detailMat), [0.08, 0, 0]);
    addMesh(frame, createBox(0.06, 0.012, 0.012, detailMat), [0, 0, 0]);
    return;
  }
  if (style === 'headset') {
    const headset = createAccessory(rig, rig.head, 'headset', [0, 0.12, 0.08]);
    addMesh(headset, new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 4, 10), detailMat), [0, 0.02, 0], [Math.PI / 2, 0, 0]);
    addMesh(headset, createBox(0.04, 0.08, 0.04, extraMat), [-0.18, 0, 0.02]);
    addMesh(headset, createBox(0.04, 0.08, 0.04, extraMat), [0.18, 0, 0.02]);
    return;
  }
  if (style === 'guitar') {
    const guitar = createAccessory(rig, rig.body, 'guitar', [0.16, 0.18, 0.18], [0.2, 0.2, -0.7]);
    addMesh(guitar, createSphere(0.08, extraMat, 4, 3), [0, -0.04, 0], undefined, [1.1, 0.8, 0.55]);
    addMesh(guitar, createBox(0.04, 0.22, 0.04, accentMat), [0, 0.12, 0]);
    return;
  }
  if (style === 'clipboard') {
    const board = createAccessory(rig, rig.body, 'clipboard', [0.18, 0.22, 0.18], [0.15, 0.2, -0.35]);
    addMesh(board, createBox(0.14, 0.2, 0.03, extraMat), [0, 0, 0]);
    addMesh(board, createBox(0.05, 0.03, 0.04, accentMat), [0, 0.11, 0]);
    return;
  }
  if (style === 'leaf') {
    const leaf = createAccessory(rig, rig.body, 'leaf', [-0.18, 0.16, 0.04], [0.1, 0, -0.6]);
    addMesh(leaf, createSphere(0.07, accentMat, 4, 3), [0, 0, 0], undefined, [1.4, 0.35, 0.8]);
    addMesh(leaf, createBox(0.01, 0.12, 0.01, detailMat), [-0.02, -0.04, 0]);
    return;
  }
  if (style === 'badge') {
    const badge = createAccessory(rig, rig.body, 'badge', [0, 0.22, 0.26]);
    addMesh(badge, createBox(0.16, 0.1, 0.02, extraMat), [0, 0, 0]);
    addMesh(badge, createSphere(0.02, detailMat, 4, 3), [-0.04, 0, 0.02]);
    addMesh(badge, createBox(0.04, 0.01, 0.02, detailMat), [0.03, 0.01, 0.02], [0, 0, 0.55]);
    addMesh(badge, createBox(0.06, 0.01, 0.02, detailMat), [0.04, -0.01, 0.02], [0, 0, -0.55]);
    return;
  }
  if (style === 'megaphone') {
    const horn = createAccessory(rig, rig.body, 'megaphone', [0.18, 0.2, 0.16], [0.1, 0.2, -0.9]);
    addMesh(horn, createCone(0.09, 0.18, extraMat, 4), [0, 0, 0], [0, 0, Math.PI / 2]);
    addMesh(horn, createBox(0.04, 0.1, 0.04, accentMat), [-0.06, -0.06, 0]);
    return;
  }
  if (style === 'mic') {
    const mic = createAccessory(rig, rig.body, 'mic', [0.18, 0.2, 0.18], [0.1, 0.18, -0.4]);
    addMesh(mic, createSphere(0.05, extraMat, 4, 3), [0, 0.1, 0]);
    addMesh(mic, createCylinder(0.012, 0.012, 0.2, detailMat), [0, 0, 0]);
    return;
  }
  if (style === 'bubble_tea') {
    const cup = createAccessory(rig, rig.body, 'bubble-tea', [0.18, 0.18, 0.2], [0.1, 0.2, -0.25]);
    addMesh(cup, createBox(0.1, 0.14, 0.08, extraMat), [0, 0, 0]);
    addMesh(cup, createCylinder(0.008, 0.008, 0.16, detailMat), [0.02, 0.14, 0]);
    addMesh(cup, createSphere(0.015, detailMat, 4, 3), [-0.02, -0.04, 0.02]);
    addMesh(cup, createSphere(0.015, detailMat, 4, 3), [0.02, -0.01, -0.02]);
    return;
  }
  if (style === 'laptop') {
    const laptop = createAccessory(rig, rig.body, 'laptop', [0, 0.2, 0.24], [0.32, 0, 0]);
    addMesh(laptop, createBox(0.22, 0.14, 0.02, detailMat), [0, 0.02, -0.05], [0.9, 0, 0]);
    addMesh(laptop, createBox(0.24, 0.02, 0.16, extraMat), [0, -0.04, 0.04]);
    return;
  }
  if (style === 'briefcase') {
    const bag = createAccessory(rig, rig.body, 'briefcase', [0.2, 0.18, 0.12], [0.12, 0.1, -0.3]);
    addMesh(bag, createBox(0.18, 0.12, 0.08, extraMat), [0, 0, 0]);
    addMesh(bag, createBox(0.07, 0.025, 0.02, accentMat), [0, 0.07, 0]);
    return;
  }
  if (style === 'calculator') {
    const calc = createAccessory(rig, rig.body, 'calculator', [0.17, 0.18, 0.2], [0.15, 0.18, -0.25]);
    addMesh(calc, createBox(0.16, 0.2, 0.06, detailMat), [0, 0, 0]);
    addMesh(calc, createBox(0.1, 0.05, 0.05, extraMat), [0, 0.06, 0.04]);
    [-0.04, 0, 0.04].forEach(x => addMesh(calc, createSphere(0.012, accentMat, 4, 3), [x, -0.02, 0.04]));
    return;
  }
  if (style === 'chart') {
    const chart = createAccessory(rig, rig.body, 'chart', [0.18, 0.18, 0.18], [0.1, 0.2, -0.25]);
    addMesh(chart, createBox(0.16, 0.18, 0.03, extraMat), [0, 0, 0]);
    addMesh(chart, createBox(0.02, 0.08, 0.02, accentMat), [-0.04, -0.02, 0.03]);
    addMesh(chart, createBox(0.02, 0.12, 0.02, accentMat), [0, -0.01, 0.03]);
    addMesh(chart, createBox(0.02, 0.15, 0.02, detailMat), [0.04, 0, 0.03]);
    return;
  }
  if (style === 'gavel') {
    const gavel = createAccessory(rig, rig.body, 'gavel', [0.18, 0.18, 0.18], [0.18, 0.2, -0.55]);
    addMesh(gavel, createBox(0.12, 0.05, 0.05, extraMat), [0, 0.08, 0]);
    addMesh(gavel, createCylinder(0.01, 0.01, 0.18, accentMat), [-0.02, -0.02, 0], [0, 0, 0.55]);
    return;
  }
  if (style === 'crate') {
    const crate = createAccessory(rig, rig.body, 'crate', [0.18, 0.18, 0.18], [0.08, 0.16, -0.15]);
    addMesh(crate, createBox(0.16, 0.12, 0.12, extraMat), [0, 0, 0]);
    addMesh(crate, createBox(0.16, 0.01, 0.01, accentMat), [0, 0.03, 0.06]);
    addMesh(crate, createBox(0.01, 0.12, 0.01, accentMat), [-0.05, 0, 0.06]);
  }
}

function createChibiAnimal(options: ChibiAnimalOptions): PetRig {
  const rig = createPetRig();
  const bodyMat = createFlatMaterial(options.bodyColor);
  const accentMat = createFlatMaterial(options.accentColor);
  const detailMat = createFlatMaterial(options.detailColor ?? 0x2c1810);
  const bellyMat = createFlatMaterial(options.bellyColor ?? options.accentColor);
  const extraMat = createFlatMaterial(options.extraColor ?? options.accentColor);

  addMesh(rig.body, createBox(0.78, 0.3, 0.56, bodyMat), options.bodyOffset ?? [0, 0.28, 0], undefined, options.bodyScale);
  addMesh(rig.body, createBox(0.34, 0.18, 0.26, bellyMat), [0, 0.22, 0.22]);
  addMesh(rig.body, createBox(0.5, 0.18, 0.3, bodyMat), [0, 0.28, -0.16]);

  const head = createHeadMesh(options.headStyle ?? 'octa', bodyMat);
  rig.head.position.set(
    options.headOffset?.[0] ?? 0,
    options.headOffset?.[1] ?? 0.43,
    options.headOffset?.[2] ?? 0.18
  );
  addMesh(rig.head, head, [0, 0.08, 0.1], [0.1, 0, 0], options.headScale ?? [1.05, 1, 1]);
  createEyePair(rig.head, detailMat.color.getHex(), 0.03, [-0.085, 0.08, 0.28], [0.085, 0.08, 0.28], options.eyeScale ?? [1, 1, 0.6]);

  if (options.cheekColor) {
    const cheekMat = createFlatMaterial(options.cheekColor);
    addMesh(rig.head, createSphere(0.035, cheekMat, 4, 3), [-0.13, 0.01, 0.24], undefined, [1, 0.5, 0.35]);
    addMesh(rig.head, createSphere(0.035, cheekMat, 4, 3), [0.13, 0.01, 0.24], undefined, [1, 0.5, 0.35]);
  }

  addSnout(rig, options.snoutStyle ?? 'muzzle', accentMat, detailMat);
  addChibiEars(rig, options.earStyle ?? 'pointy', bodyMat, accentMat);

  createLeg(rig, [-0.26, 0.18, 0.18], [0.11, 0.18, 0.12], [0.14, 0.07, 0.15], bodyMat, accentMat);
  createLeg(rig, [0.26, 0.18, 0.18], [0.11, 0.18, 0.12], [0.14, 0.07, 0.15], bodyMat, accentMat);
  createLeg(rig, [-0.26, 0.18, -0.16], [0.11, 0.18, 0.12], [0.14, 0.07, 0.15], bodyMat, accentMat);
  createLeg(rig, [0.26, 0.18, -0.16], [0.11, 0.18, 0.12], [0.14, 0.07, 0.15], bodyMat, accentMat);

  if (options.addWhiskers) {
    const whisker = createAccessory(rig, rig.head, 'whiskers', [0, 0.02, 0.22]);
    addMesh(whisker, createBox(0.22, 0.01, 0.01, detailMat), [-0.14, 0.03, 0.02], [0, 0, -0.18]);
    addMesh(whisker, createBox(0.22, 0.01, 0.01, detailMat), [-0.14, -0.01, 0.02], [0, 0, 0.08]);
    addMesh(whisker, createBox(0.22, 0.01, 0.01, detailMat), [0.14, 0.03, 0.02], [0, 0, 0.18]);
    addMesh(whisker, createBox(0.22, 0.01, 0.01, detailMat), [0.14, -0.01, 0.02], [0, 0, -0.08]);
  }

  createBrowPair(rig.head, detailMat.color.getHex(), [-0.1, 0.14, 0.24], [0.1, 0.14, 0.24], 0.12);
  addChibiTail(rig, options.tailStyle ?? 'stub', bodyMat, accentMat);
  addAccessoryDetails(rig, options.accessory ?? 'none', accentMat, extraMat, detailMat);

  return rig;
}

function createNightOwl(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x7a6658,
    accentColor: 0xf4e8d3,
    extraColor: 0xffd166,
    detailColor: 0x2f2f3a,
    cheekColor: 0xffd7a8,
    headStyle: 'sphere',
    earStyle: 'feather',
    tailStyle: 'fan',
    snoutStyle: 'beak',
    accessory: 'headset',
    eyeScale: [1.2, 1.1, 0.7],
  });
}

function createRockParrot(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x25a18e,
    accentColor: 0xffe066,
    extraColor: 0xff6b6b,
    detailColor: 0x17323a,
    headStyle: 'sphere',
    earStyle: 'crest',
    tailStyle: 'plume',
    snoutStyle: 'beak',
    accessory: 'guitar',
  });
}

function createKpiBeaver(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xa47148,
    accentColor: 0xf3dfc1,
    extraColor: 0x5da271,
    detailColor: 0x3d2a20,
    headStyle: 'box',
    earStyle: 'round',
    tailStyle: 'paddle',
    snoutStyle: 'short',
    accessory: 'clipboard',
  });
}

function createSlackerSloth(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xb08d74,
    accentColor: 0xead7c3,
    extraColor: 0x8bc6a2,
    detailColor: 0x46352b,
    headStyle: 'sphere',
    earStyle: 'round',
    tailStyle: 'stub',
    snoutStyle: 'short',
    accessory: 'leaf',
    eyeScale: [1.4, 0.7, 0.4],
  });
}

function createClockinShiba(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xe58a3a,
    accentColor: 0xfff5ec,
    extraColor: 0x3f88c5,
    detailColor: 0x3f2517,
    headStyle: 'octa',
    earStyle: 'pointy',
    tailStyle: 'curl',
    snoutStyle: 'muzzle',
    accessory: 'badge',
    cheekColor: 0xffd1bd,
  });
}

function createTrendingRabbit(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xf0ecf7,
    accentColor: 0xffd7e7,
    extraColor: 0xff4d8d,
    detailColor: 0x493243,
    headStyle: 'sphere',
    earStyle: 'long',
    tailStyle: 'puff',
    snoutStyle: 'short',
    accessory: 'megaphone',
  });
}

function createPrMeerkat(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xc89b6a,
    accentColor: 0xf7e2c8,
    extraColor: 0x5b7cfa,
    detailColor: 0x4a3424,
    headStyle: 'box',
    earStyle: 'pointy',
    tailStyle: 'ring',
    snoutStyle: 'short',
    accessory: 'mic',
  });
}

function createMilkTeaPanda(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x2f2e41,
    accentColor: 0xfff7e8,
    extraColor: 0xc08a5b,
    detailColor: 0x16161d,
    bellyColor: 0xfff7e8,
    headStyle: 'sphere',
    earStyle: 'round',
    tailStyle: 'puff',
    snoutStyle: 'short',
    accessory: 'bubble_tea',
  });
}

function createInternPony(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xa9a9a9,
    accentColor: 0xe8e8e8,
    extraColor: 0x7aaed6,
    detailColor: 0x505050,
    headStyle: 'box',
    earStyle: 'pointy',
    tailStyle: 'plume',
    snoutStyle: 'muzzle',
    accessory: 'badge',
  });
}

function createVeteranHorse(): PetRig {
  const rig = createChibiAnimal({
    bodyColor: 0x696969,
    accentColor: 0xd3d3d3,
    extraColor: 0xd4af37,
    detailColor: 0x2c1810,
    headStyle: 'box',
    earStyle: 'pointy',
    tailStyle: 'plume',
    snoutStyle: 'muzzle',
    accessory: 'glasses',
  });
  const medal = createAccessory(rig, rig.body, 'medal', [0.18, 0.3, 0.08]);
  const goldMat = createFlatMaterial(0xd4af37);
  addMesh(medal, createSphere(0.05, goldMat, 4, 3), [0, 0, 0]);
  return rig;
}

function createHustleHorse(): PetRig {
  const rig = createChibiAnimal({
    bodyColor: 0x8b4513,
    accentColor: 0xf5deb3,
    extraColor: 0xff4500,
    detailColor: 0x2c1810,
    headStyle: 'box',
    earStyle: 'pointy',
    tailStyle: 'plume',
    snoutStyle: 'muzzle',
    accessory: 'laptop',
  });
  const bolt = createAccessory(rig, rig.head, 'bolt', [0.18, 0.16, 0.12]);
  addMesh(bolt, createCone(0.04, 0.12, createFlatMaterial(0xffd700), 4), [0, 0.06, 0], [0, 0, 0.5]);
  return rig;
}

function createFinanceHamster(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xf4a460,
    accentColor: 0xfff8dc,
    extraColor: 0xffd700,
    detailColor: 0x6d4c41,
    headStyle: 'sphere',
    earStyle: 'round',
    tailStyle: 'puff',
    snoutStyle: 'short',
    accessory: 'calculator',
    cheekColor: 0xffb6c1,
  });
}

function createInvestorFox(): PetRig {
  return createChibiAnimal({
    bodyColor: 0xff8c00,
    accentColor: 0xffffff,
    extraColor: 0x8b4513,
    detailColor: 0x2c1810,
    headStyle: 'octa',
    earStyle: 'pointy',
    tailStyle: 'plume',
    snoutStyle: 'muzzle',
    accessory: 'briefcase',
    addWhiskers: true,
  });
}

function createOvertimePenguin(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x2b2d42,
    accentColor: 0xf8fafc,
    extraColor: 0x5b8def,
    detailColor: 0x161a24,
    bellyColor: 0xf8fafc,
    headStyle: 'sphere',
    earStyle: 'none',
    tailStyle: 'none',
    snoutStyle: 'beak',
    accessory: 'laptop',
  });
}

function createDataOtter(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x8b6b4f,
    accentColor: 0xefdcc5,
    extraColor: 0x14b8a6,
    detailColor: 0x3c2a1f,
    headStyle: 'sphere',
    earStyle: 'round',
    tailStyle: 'plume',
    snoutStyle: 'short',
    accessory: 'chart',
  });
}

function createLegalMastiff(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x8a5b3d,
    accentColor: 0xf5e6d3,
    extraColor: 0x7c3aed,
    detailColor: 0x3d2618,
    headStyle: 'box',
    earStyle: 'floppy',
    tailStyle: 'stub',
    snoutStyle: 'muzzle',
    accessory: 'gavel',
  });
}

function createLogisticsBeaver(): PetRig {
  return createChibiAnimal({
    bodyColor: 0x8b6b4a,
    accentColor: 0xeed9bf,
    extraColor: 0x6c9f4a,
    detailColor: 0x412d20,
    headStyle: 'box',
    earStyle: 'round',
    tailStyle: 'paddle',
    snoutStyle: 'short',
    accessory: 'crate',
  });
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

export type LowPolyPetPreset =
  | 'corgi'
  | 'husky'
  | 'capybara'
  | 'orange_cat'
  | 'ragdoll'
  | 'eternal_cat'
  | 'intern_pony'
  | 'veteran_horse'
  | 'hustle_horse'
  | 'finance_hamster'
  | 'investor_fox'
  | 'overtime_penguin'
  | 'data_otter'
  | 'legal_mastiff'
  | 'logistics_beaver'
  | 'night_owl'
  | 'rock_parrot'
  | 'kpi_beaver'
  | 'slacker_sloth'
  | 'clockin_shiba'
  | 'trending_rabbit'
  | 'pr_meerkat'
  | 'milk_tea_panda'
  | 'default';

const PRESET_FACTORIES: Record<LowPolyPetPreset, () => PetRig> = {
  corgi: createCorgi,
  husky: createHusky,
  capybara: createCapybara,
  orange_cat: createOrangeCat,
  ragdoll: createRagdoll,
  eternal_cat: createEternalCat,
  intern_pony: createInternPony,
  veteran_horse: createVeteranHorse,
  hustle_horse: createHustleHorse,
  finance_hamster: createFinanceHamster,
  investor_fox: createInvestorFox,
  overtime_penguin: createOvertimePenguin,
  data_otter: createDataOtter,
  legal_mastiff: createLegalMastiff,
  logistics_beaver: createLogisticsBeaver,
  night_owl: createNightOwl,
  rock_parrot: createRockParrot,
  kpi_beaver: createKpiBeaver,
  slacker_sloth: createSlackerSloth,
  clockin_shiba: createClockinShiba,
  trending_rabbit: createTrendingRabbit,
  pr_meerkat: createPrMeerkat,
  milk_tea_panda: createMilkTeaPanda,
  default: createDefaultPet,
};

const CARD_ID_TO_PRESET: Record<string, LowPolyPetPreset> = {
  pet_001: 'corgi',
  pet_002: 'husky',
  pet_003: 'capybara',
  pet_004: 'orange_cat',
  pet_005: 'ragdoll',
  pet_006: 'eternal_cat',
  pet_007: 'night_owl',
  pet_008: 'rock_parrot',
  pet_009: 'kpi_beaver',
  pet_010: 'slacker_sloth',
  pet_011: 'clockin_shiba',
  pet_012: 'trending_rabbit',
  pet_013: 'pr_meerkat',
  pet_014: 'milk_tea_panda',
  worker_001: 'intern_pony',
  worker_002: 'veteran_horse',
  worker_003: 'hustle_horse',
  worker_004: 'finance_hamster',
  worker_005: 'investor_fox',
  worker_006: 'overtime_penguin',
  worker_007: 'data_otter',
  worker_008: 'legal_mastiff',
  worker_009: 'logistics_beaver',
};

export function getAvailableLowPolyPetPresets(): LowPolyPetPreset[] {
  return Object.keys(PRESET_FACTORIES) as LowPolyPetPreset[];
}

/** 根据宠物 ID 或预设名创建对应的 Low-poly 模型 */
export function createLowPolyPet(petIdOrPreset: string): PetRig {
  const preset = CARD_ID_TO_PRESET[petIdOrPreset] ?? (petIdOrPreset as LowPolyPetPreset);
  const factory = PRESET_FACTORIES[preset] ?? PRESET_FACTORIES.default;
  return factory();
}
