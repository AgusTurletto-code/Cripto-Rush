// Retrato de un personaje en alta resolución con fondo transparente (para publicidad).
// Uso: tools/portrait/index.html?char=hank&size=768&pose=run|idle|cheer
import * as THREE from 'three';
import { buildCharacter } from '../../src/game/characters.js';

const q = new URLSearchParams(location.search);
const size = Number(q.get('size') || 768);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(size, size); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff0e0, 0x553366, 2.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xff9a59, 2.2); rim.position.set(-4, 2, -3); scene.add(rim);
const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
cam.position.set(0, 1.25, 6.4); cam.lookAt(0, 1.12, 0);
const ch = buildCharacter(q.get('char') || 'hank');
const pose = q.get('pose') || 'run';
for (let i = 0; i < 40; i++) ch.userData.animate(1 / 60, { mode: pose, speed: 18, laneDir: 0 });
ch.rotation.y = Number(q.get('rot') || 0.45);
scene.add(ch);
renderer.render(scene, cam);
window.__png = renderer.domElement.toDataURL('image/png');
