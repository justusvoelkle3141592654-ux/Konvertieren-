// Material für Voxel-Geometrie. Ein Shader für alle Blöcke:
//  - pixelgenaue Atlas-Texturen (Alpha-Test für Laub/Pflanzen, Blending für Glas/Wasser)
//  - Licht: Himmelslicht (abhängig von Tageszeit) und Blocklicht, Stufen 0–15
//  - Ambient Occlusion pro Vertex, Seitenschattierung (Oben 100 %, Nord/Süd 80 %, Ost/West 60 %, Unten 50 %)
//  - linearer Nebel passend zur Sichtweite
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  attribute vec2 aUv;
  attribute vec4 aLight;   // x: Himmelslicht 0–1, y: Blocklicht 0–1, z: AO-Faktor, w: Seitenschattierung
  attribute vec4 aTint;    // rgb: Biomfarbe (1,1,1 = ungefärbt)
  varying vec2 vUv;
  varying vec4 vLight;
  varying vec3 vTint;
  varying float vDepth;
  void main() {
    vUv = aUv;
    vLight = aLight;
    vTint = aTint.rgb;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uDaylight;     // 0–1, Anteil des Himmelslichts (Tag/Nacht)
  uniform float uBrightness;   // Helligkeitsregler aus den Optionen
  uniform float uAoStrength;   // 0 = keine AO, 1 = volle AO
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlphaTest;    // 0.5 für Laub/Pflanzen, 0 sonst
  uniform float uOpacity;      // Deckkraft (Transparenz-Pass)
  varying vec2 vUv;
  varying vec4 vLight;
  varying vec3 vTint;
  varying float vDepth;
  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < uAlphaTest) discard;
    float sky = vLight.x * 15.0 * uDaylight;
    float lvl = max(sky, vLight.y * 15.0);
    float lightFactor = max(pow(0.8, 15.0 - lvl), 0.035);
    float ao = mix(1.0, vLight.z, uAoStrength);
    vec3 color = tex.rgb * vTint * lightFactor * ao * vLight.w * uBrightness;
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    color = mix(color, uFogColor, fog);
    gl_FragColor = vec4(color, tex.a * uOpacity);
  }
`;

/**
 * Erzeugt die gemeinsamen Materialien für undurchsichtige und transparente Geometrie.
 * Die Uniforms werden vom Renderer pro Frame aktualisiert.
 */
export function createBlockMaterials(atlasTexture) {
  const shared = {
    uAtlas: { value: atlasTexture },
    uDaylight: { value: 1 },
    uBrightness: { value: 1 },
    uAoStrength: { value: 1 },
    uFogColor: { value: new THREE.Color('#9fc4ff') },
    uFogNear: { value: 40 },
    uFogFar: { value: 96 },
  };

  const opaque = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...shared, uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 } },
    side: THREE.FrontSide,
  });

  const transparent = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...shared, uAlphaTest: { value: 0.01 }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  return { opaque, transparent, shared };
}
