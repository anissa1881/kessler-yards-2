// The map: an original two-lane arena, "Kessler Yards". A wall splits the floor into a west lane
// and an east lane joined at mid through a pillar gate and at both ends, so routes have to commit
// and sightlines can be broken. Every box is a collider for a body and a surface a bullet stops on.
import * as THREE from 'three';
import { YARD } from './palette.js';

/** The floor's half width; the arena is 30 m square, walls 5 m high. */
const HALF = 15;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Four surfaces, each one colour from the yard's palette: the floor a worn concrete, the walls a
  // paler render, the crates a weathered timber, the lane stripes the one accent hue.
  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: new THREE.Color(YARD.floor), roughness: 0.96, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ color: new THREE.Color(YARD.wall), roughness: 0.91, metalness: 0.02 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color(YARD.crate), roughness: 0.88, metalness: 0.03 }),
    accent: new THREE.MeshStandardMaterial({ color: new THREE.Color(YARD.accent), roughness: 0.55, metalness: 0.05 }),
  };

  const colliders = [];
  const shootables = [];

  /** One solid box: it stops a body and it stops a bullet. */
  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // The floor and the four walls.
  box(HALF * 2, 0.4, HALF * 2, 0, -0.2, 0, 'floor');
  box(0.5, 5, HALF * 2, -HALF, 2.5, 0, 'wall');
  box(0.5, 5, HALF * 2, HALF, 2.5, 0, 'wall');
  box(HALF * 2, 5, 0.5, 0, 2.5, -HALF, 'wall');
  box(HALF * 2, 5, 0.5, 0, 2.5, HALF, 'wall');

  // The spine wall: it runs most of the arena's length, leaving a gate at mid and open ends.
  box(0.6, 5, 9.0, 0, 2.5, -7.5, 'wall');
  box(0.6, 5, 9.0, 0, 2.5, 7.5, 'wall');
  // The mid gate is a pillar pair, so it can be held from either side but never sealed.
  box(0.6, 5, 1.0, -0.9, 2.5, -3.0, 'wall');
  box(0.6, 5, 1.0, 0.9, 2.5, -3.0, 'wall');
  box(0.6, 1.3, 2.6, 0, 0.65, 0, 'crate');

  // West lane: crates that break the long sightline, a tall stack to hide a body in.
  box(2.2, 1.2, 2.2, -7.5, 0.6, -6.0, 'crate');
  box(2.2, 1.2, 2.2, -7.5, 1.8, -6.0, 'crate');
  box(1.2, 2.6, 1.2, -11.5, 1.3, -1.0, 'crate');
  box(3.0, 1.0, 1.4, -4.4, 0.5, 3.4, 'crate');
  box(1.4, 2.2, 1.4, -12.0, 1.1, 8.5, 'crate');

  // East lane: its own cover, placed so neither lane is the mirror of the other.
  box(2.4, 1.1, 2.4, 7.9, 0.55, 5.6, 'crate');
  box(1.2, 2.8, 1.2, 11.0, 1.4, 0.4, 'crate');
  box(1.4, 1.0, 3.4, 4.6, 0.5, -5.2, 'crate');
  box(3.2, 0.9, 1.2, 8.2, 0.45, -10.0, 'crate');

  // The two spawn ends: a low barrier at each, so a spawn is cover rather than open floor.
  box(5.0, 1.0, 0.8, -6.0, 0.5, -13.0, 'crate');
  box(5.0, 1.0, 0.8, 6.0, 0.5, 13.0, 'crate');

  // A raised catwalk at the east end: a defender's perch, reachable by a ramp of boxes.
  box(5.0, 1.5, 4.0, 11.6, 0.75, 10.6, 'wall');
  box(5.0, 0.25, 0.7, 11.6, 1.62, 8.6, 'crate');

  // Light: an overcast sky bouncing off the concrete, a warm low sun over the east lane and a cool
  // fill over the west. The sky term is the one that lifts the shadows: without it the crates' faces
  // away from the sun go to near black, and a capture of them is a capture of nothing.
  const sky = new THREE.HemisphereLight(new THREE.Color(YARD.haze), new THREE.Color(YARD.ground), 1.55);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(YARD.sun), 2.4);
  key.position.set(11, 16, 9);
  key.target.position.set(2, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 56;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(YARD.shade), 0.9);
  fill.position.set(-12, 10, -8);
  scene.add(fill);

  // A few accent strips on the floor mark the two lane centres, so the map reads at a glance.
  for (const z of [-9, 9]) {
    box(0.18, 0.02, 4.0, -7.0, 0.01, z, 'accent');
    box(0.18, 0.02, 4.0, 7.0, 0.01, z, 'accent');
  }

  return { colliders, shootables, group, half: HALF };
}
