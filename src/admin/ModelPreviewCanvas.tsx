import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createLowPolyPet } from '../game/factories/LowPolyPetFactory';

interface ModelPreviewCanvasProps {
  presetSource?: string;
}

export function ModelPreviewCanvas({ presetSource }: ModelPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 220, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 320 / 220, 0.1, 100);
    camera.position.set(0, 1.35, 4.2);

    const ambient = new THREE.AmbientLight(0xfff3df, 1.2);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 6, 4);
    const rim = new THREE.DirectionalLight(0xaad7ff, 0.7);
    rim.position.set(-3, 3, -3);
    scene.add(ambient, key, rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 32),
      new THREE.MeshBasicMaterial({
        color: 0x331f25,
        transparent: true,
        opacity: 0.18,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    scene.add(ground);

    const rig = createLowPolyPet(presetSource || 'default');
    rig.root.scale.setScalar(1.8);
    rig.root.rotation.y = Math.PI * 0.9;
    scene.add(rig.root);

    let frame = 0;
    let raf = 0;
    const renderFrame = () => {
      frame += 0.016;
      rig.root.rotation.y += 0.008;
      rig.body.position.y = Math.sin(frame * 1.8) * 0.05;
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      window.cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [presetSource]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 220, display: 'block' }} />;
}
