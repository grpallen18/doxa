import { Attributes } from 'graphology-types'
import { NodeProgram } from 'sigma/rendering'
import type { ProgramInfo } from 'sigma/rendering'
import type { NodeDisplayData, RenderParams } from 'sigma/types'
import { floatColor } from 'sigma/utils'

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext

const UNIFORMS = ['u_sizeRatio', 'u_correctionRatio', 'u_matrix'] as const

/**
 * Same disc geometry as Sigma's NodeCircleProgram (triangle covering the circle).
 */
const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`

/**
 * Soft radial fill: lifted center, kind color midtone, darker rim + specular glint.
 */
const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float edgeDist = length(v_diffVector) - v_radius + border;

  #ifdef PICKING_MODE
  if (edgeDist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;
  #else
  float radius = max(v_radius, 0.0001);
  float r = length(v_diffVector) / radius;
  vec2 uv = v_diffVector / radius;

  vec3 base = v_color.rgb;
  vec3 lift = base + (vec3(1.0) - base) * 0.42;
  vec3 shade = base * 0.48;

  // Center highlight → base → darker rim
  vec3 color = mix(lift, base, smoothstep(0.0, 0.42, r));
  color = mix(color, shade, smoothstep(0.48, 0.98, r));

  // Soft specular (upper-left)
  float shine = pow(max(0.0, 1.0 - distance(uv, vec2(-0.32, 0.38))), 3.2) * 0.38;
  color += vec3(shine);

  // Thin darker lip at the silhouette
  float lip = smoothstep(0.78, 1.0, r);
  color = mix(color, shade * 0.75, lip * 0.55);

  float t = 0.0;
  if (edgeDist > border)
    t = 1.0;
  else if (edgeDist > 0.0)
    t = edgeDist / border;

  gl_FragColor = mix(vec4(clamp(color, 0.0, 1.0), v_color.a), transparent, t);
  #endif
}
`

/**
 * Elegant disc renderer: radial depth + specular shine (replaces flat NodeCircle).
 */
export class NeoNodeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> extends NodeProgram<(typeof UNIFORMS)[number], N, E, G> {
  static readonly ANGLE_1 = 0
  static readonly ANGLE_2 = (2 * Math.PI) / 3
  static readonly ANGLE_3 = (4 * Math.PI) / 3

  getDefinition() {
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS,
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_size', size: 1, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
      CONSTANT_DATA: [
        [NeoNodeProgram.ANGLE_1],
        [NeoNodeProgram.ANGLE_2],
        [NeoNodeProgram.ANGLE_3],
      ],
    }
  }

  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData) {
    const array = this.array
    const color = floatColor(data.color)

    array[startIndex++] = data.x
    array[startIndex++] = data.y
    array[startIndex++] = data.size
    array[startIndex++] = color
    array[startIndex++] = nodeIndex
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo): void {
    const { u_sizeRatio, u_correctionRatio, u_matrix } = uniformLocations

    gl.uniform1f(u_correctionRatio, params.correctionRatio)
    gl.uniform1f(u_sizeRatio, params.sizeRatio)
    gl.uniformMatrix3fv(u_matrix, false, params.matrix)
  }
}
