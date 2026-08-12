import { Attributes } from 'graphology-types'
import {
  createEdgeCompoundProgram,
  DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS,
  EdgeProgram,
} from 'sigma/rendering'
import type { EdgeProgramType, ProgramInfo } from 'sigma/rendering'
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from 'sigma/types'
import { floatColor, parseColor } from 'sigma/utils'

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext

type ArrowHeadOptions = {
  extremity: 'target' | 'source' | 'both'
  lengthToThicknessRatio: number
  widenessToThicknessRatio: number
}

type GradientEdgeData = EdgeDisplayData & {
  targetColor?: string
}

type BlurLayer = {
  sizeMult: number
  alphaRatio: number
}

function buildBlurLayers(
  count = 7,
  maxMult = 4.4,
  minMult = 1.25
): BlurLayer[] {
  const layers: BlurLayer[] = []
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1)
    const sizeMult = maxMult + (minMult - maxMult) * u
    const r = 1 - u
    const alphaRatio = 0.11 * Math.exp(-2.8 * r * r)
    layers.push({ sizeMult, alphaRatio })
  }
  return layers
}

const BLUR_LAYERS = buildBlurLayers()

/** Scale a premultiplied rgba() / hex color's alpha without shifting hue. */
function scaleEdgeAlpha(color: string, alphaRatio: number): string {
  const parsed = parseColor(color)
  const srcAlpha = Math.max(parsed.a, 0.001)
  const r = Math.min(255, parsed.r / srcAlpha)
  const g = Math.min(255, parsed.g / srcAlpha)
  const b = Math.min(255, parsed.b / srcAlpha)
  const a = Math.min(0.28, srcAlpha * alphaRatio)
  return `rgba(${Math.round(r * a)}, ${Math.round(g * a)}, ${Math.round(b * a)}, ${a})`
}

function endpointColors(
  sourceData: NodeDisplayData,
  targetData: NodeDisplayData,
  data: GradientEdgeData
): { from: number; to: number } {
  const fromStr =
    typeof data.color === 'string' && data.color
      ? data.color
      : typeof sourceData.color === 'string'
        ? sourceData.color
        : '#888888'
  const toStr =
    typeof data.targetColor === 'string' && data.targetColor
      ? data.targetColor
      : typeof targetData.color === 'string'
        ? targetData.color
        : fromStr
  return { from: floatColor(fromStr), to: floatColor(toStr) }
}

function getVertexShader(arrowHead: ArrowHeadOptions | null): string {
  const hasTarget =
    arrowHead?.extremity === 'target' || arrowHead?.extremity === 'both'
  const hasSource =
    arrowHead?.extremity === 'source' || arrowHead?.extremity === 'both'

  return /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_colorFrom;
attribute vec4 a_colorTo;
attribute float a_direction;
attribute float a_thickness;
attribute vec2 a_source;
attribute vec2 a_target;
attribute float a_current;
attribute float a_curvature;
${hasTarget ? 'attribute float a_targetSize;' : ''}
${hasSource ? 'attribute float a_sourceSize;' : ''}

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform vec2 u_dimensions;
uniform float u_minEdgeThickness;
uniform float u_feather;
${arrowHead ? 'uniform float u_widenessToThicknessRatio;' : ''}

varying vec4 v_colorFrom;
varying vec4 v_colorTo;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;
${hasTarget ? 'varying float v_targetSize; varying vec2 v_targetPoint;' : ''}
${hasSource ? 'varying float v_sourceSize; varying vec2 v_sourcePoint;' : ''}

const float bias = 255.0 / 254.0;
const float epsilon = 1.2;

vec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {
  return vec2(
    (pos.x + 1.0) * dimensions.x / 2.0,
    (pos.y + 1.0) * dimensions.y / 2.0
  );
}

vec2 viewportToClipspace(vec2 pos, vec2 dimensions) {
  return vec2(
    pos.x / dimensions.x * 2.0 - 1.0,
    pos.y / dimensions.y * 2.0 - 1.0
  );
}

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 position = a_source * max(0.0, a_current) + a_target * max(0.0, 1.0 - a_current);
  position = (u_matrix * vec3(position, 1)).xy;

  vec2 source = (u_matrix * vec3(a_source, 1)).xy;
  vec2 target = (u_matrix * vec3(a_target, 1)).xy;

  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);
  vec2 viewportSource = clipspaceToViewport(source, u_dimensions);
  vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);

  vec2 delta = viewportTarget.xy - viewportSource.xy;
  float len = length(delta);
  vec2 normal = vec2(-delta.y, delta.x) * a_direction;
  vec2 unitNormal = normal / len;
  float boundingBoxThickness = len * a_curvature;

  float curveThickness = max(minThickness, a_thickness / u_sizeRatio);
  v_thickness = curveThickness * u_pixelRatio;
  v_feather = u_feather;

  v_cpA = viewportSource;
  v_cpB = 0.5 * (viewportSource + viewportTarget) + unitNormal * a_direction * boundingBoxThickness;
  v_cpC = viewportTarget;

  vec2 viewportOffsetPosition = (
    viewportPosition +
    unitNormal * (boundingBoxThickness / 2.0 + sign(boundingBoxThickness) * (
      ${arrowHead ? 'curveThickness * u_widenessToThicknessRatio' : 'curveThickness'} + epsilon
    )) *
    max(0.0, a_direction)
  );

  position = viewportToClipspace(viewportOffsetPosition, u_dimensions);
  gl_Position = vec4(position, 0, 1);

  ${hasTarget ? 'v_targetSize = a_targetSize * u_pixelRatio / u_sizeRatio; v_targetPoint = viewportTarget;' : ''}
  ${hasSource ? 'v_sourceSize = a_sourceSize * u_pixelRatio / u_sizeRatio; v_sourcePoint = viewportSource;' : ''}

  #ifdef PICKING_MODE
  v_colorFrom = a_id;
  v_colorTo = a_id;
  #else
  v_colorFrom = a_colorFrom;
  v_colorTo = a_colorTo;
  #endif

  v_colorFrom.a *= bias;
  v_colorTo.a *= bias;
}
`
}

function getFragmentShader(arrowHead: ArrowHeadOptions | null): string {
  const hasTarget =
    arrowHead?.extremity === 'target' || arrowHead?.extremity === 'both'
  const hasSource =
    arrowHead?.extremity === 'source' || arrowHead?.extremity === 'both'

  return /* glsl */ `
precision highp float;

varying vec4 v_colorFrom;
varying vec4 v_colorTo;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;
${hasTarget ? 'varying float v_targetSize; varying vec2 v_targetPoint;' : ''}
${hasSource ? 'varying float v_sourceSize; varying vec2 v_sourcePoint;' : ''}
${
  arrowHead
    ? 'uniform float u_lengthToThicknessRatio; uniform float u_widenessToThicknessRatio;'
    : ''
}

float det(vec2 a, vec2 b) {
  return a.x * b.y - b.x * a.y;
}

vec2 getDistanceVector(vec2 b0, vec2 b1, vec2 b2, out float tOut) {
  float a = det(b0, b2), b = 2.0 * det(b1, b0), d = 2.0 * det(b2, b1);
  float f = b * d - a * a;
  vec2 d21 = b2 - b1, d10 = b1 - b0, d20 = b2 - b0;
  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);
  gf = vec2(gf.y, -gf.x);
  vec2 pp = -f * gf / dot(gf, gf);
  vec2 d0p = b0 - pp;
  float ap = det(d0p, d20), bp = 2.0 * det(d10, d0p);
  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);
  tOut = t;
  return mix(mix(b0, b1, t), mix(b1, b2, t), t);
}

float distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2, out float tOut) {
  return length(getDistanceVector(b0 - p, b1 - p, b2 - p, tOut));
}

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float tCurve;
  float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC, tCurve);
  float thickness = v_thickness;
  ${
    hasTarget
      ? `
  float distToTarget = length(gl_FragCoord.xy - v_targetPoint);
  float targetArrowLength = v_targetSize + thickness * u_lengthToThicknessRatio;
  if (distToTarget < targetArrowLength) {
    thickness = (distToTarget - v_targetSize) / (targetArrowLength - v_targetSize) * u_widenessToThicknessRatio * thickness;
  }`
      : ''
  }
  ${
    hasSource
      ? `
  float distToSource = length(gl_FragCoord.xy - v_sourcePoint);
  float sourceArrowLength = v_sourceSize + thickness * u_lengthToThicknessRatio;
  if (distToSource < sourceArrowLength) {
    thickness = (distToSource - v_sourceSize) / (sourceArrowLength - v_sourceSize) * u_widenessToThicknessRatio * thickness;
  }`
      : ''
  }

  float halfThickness = max(thickness * 0.5, 0.001);
  float feather = max(v_feather, 0.001);
  float outer = halfThickness + feather;
  if (dist > outer) {
    gl_FragColor = transparent;
  } else {
    #ifdef PICKING_MODE
    gl_FragColor = v_colorFrom;
    #else
    vec4 color = mix(v_colorFrom, v_colorTo, tCurve);
    float t = smoothstep(halfThickness, outer, dist);
    gl_FragColor = mix(color, transparent, t);
    #endif
  }
}
`
}

type CurveProgramOptions = {
  additive?: boolean
}

function createNeoGradientCurveProgram(
  arrowHead: ArrowHeadOptions | null = null,
  layer?: BlurLayer,
  options?: CurveProgramOptions
): EdgeProgramType {
  const hasTarget =
    arrowHead?.extremity === 'target' || arrowHead?.extremity === 'both'
  const hasSource =
    arrowHead?.extremity === 'source' || arrowHead?.extremity === 'both'

  const UNIFORMS = [
    'u_matrix',
    'u_sizeRatio',
    'u_dimensions',
    'u_pixelRatio',
    'u_feather',
    'u_minEdgeThickness',
    ...(arrowHead
      ? (['u_lengthToThicknessRatio', 'u_widenessToThicknessRatio'] as const)
      : []),
  ] as const

  return class NeoGradientCurveProgram<
    N extends Attributes = Attributes,
    E extends Attributes = Attributes,
    G extends Attributes = Attributes,
  > extends EdgeProgram<(typeof UNIFORMS)[number], N, E, G> {
    getDefinition() {
      return {
        VERTICES: 6,
        VERTEX_SHADER_SOURCE: getVertexShader(arrowHead),
        FRAGMENT_SHADER_SOURCE: getFragmentShader(arrowHead),
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS,
        ATTRIBUTES: [
          { name: 'a_source', size: 2, type: FLOAT },
          { name: 'a_target', size: 2, type: FLOAT },
          ...(hasTarget
            ? [{ name: 'a_targetSize', size: 1, type: FLOAT }]
            : []),
          ...(hasSource
            ? [{ name: 'a_sourceSize', size: 1, type: FLOAT }]
            : []),
          { name: 'a_thickness', size: 1, type: FLOAT },
          { name: 'a_curvature', size: 1, type: FLOAT },
          {
            name: 'a_colorFrom',
            size: 4,
            type: UNSIGNED_BYTE,
            normalized: true,
          },
          {
            name: 'a_colorTo',
            size: 4,
            type: UNSIGNED_BYTE,
            normalized: true,
          },
          {
            name: 'a_id',
            size: 4,
            type: UNSIGNED_BYTE,
            normalized: true,
          },
        ],
        CONSTANT_ATTRIBUTES: [
          { name: 'a_current', size: 1, type: FLOAT },
          { name: 'a_direction', size: 1, type: FLOAT },
        ],
        CONSTANT_DATA: [
          [0, 1],
          [0, -1],
          [1, 1],
          [0, -1],
          [1, 1],
          [1, -1],
        ],
      }
    }

    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      sourceData: NodeDisplayData,
      targetData: NodeDisplayData,
      data: EdgeDisplayData
    ) {
      const edgeData = data as GradientEdgeData
      let thickness = data.size || 1
      let colorData = edgeData
      if (layer) {
        thickness *= layer.sizeMult
        colorData = {
          ...edgeData,
          color: scaleEdgeAlpha(
            typeof edgeData.color === 'string' ? edgeData.color : '#888888',
            layer.alphaRatio
          ),
          targetColor: scaleEdgeAlpha(
            typeof edgeData.targetColor === 'string'
              ? edgeData.targetColor
              : typeof edgeData.color === 'string'
                ? edgeData.color
                : '#888888',
            layer.alphaRatio
          ),
        }
      }

      const { from, to } = endpointColors(sourceData, targetData, colorData)
      const curvatureValue = (data as { curvature?: number }).curvature
      const curvature = typeof curvatureValue === 'number' ? curvatureValue : 0.25

      const array = this.array
      array[startIndex++] = sourceData.x
      array[startIndex++] = sourceData.y
      array[startIndex++] = targetData.x
      array[startIndex++] = targetData.y
      if (hasTarget) array[startIndex++] = targetData.size
      if (hasSource) array[startIndex++] = sourceData.size
      array[startIndex++] = thickness
      array[startIndex++] = curvature
      array[startIndex++] = from
      array[startIndex++] = to
      array[startIndex++] = edgeIndex
    }

    setUniforms(
      params: RenderParams,
      { gl, uniformLocations }: ProgramInfo
    ): void {
      const {
        u_matrix,
        u_pixelRatio,
        u_feather,
        u_sizeRatio,
        u_dimensions,
        u_minEdgeThickness,
      } = uniformLocations

      gl.uniformMatrix3fv(u_matrix, false, params.matrix)
      gl.uniform1f(u_pixelRatio, params.pixelRatio)
      gl.uniform1f(u_sizeRatio, params.sizeRatio)
      gl.uniform1f(u_feather, params.antiAliasingFeather)
      gl.uniform2f(
        u_dimensions,
        params.width * params.pixelRatio,
        params.height * params.pixelRatio
      )
      gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness)

      if (arrowHead) {
        const { u_lengthToThicknessRatio, u_widenessToThicknessRatio } =
          uniformLocations
        gl.uniform1f(
          u_lengthToThicknessRatio,
          arrowHead.lengthToThicknessRatio
        )
        gl.uniform1f(
          u_widenessToThicknessRatio,
          arrowHead.widenessToThicknessRatio
        )
      }
    }

    renderProgram(params: RenderParams, programInfo: ProgramInfo): void {
      if (!options?.additive || programInfo.isPicking) {
        super.renderProgram(params, programInfo)
        return
      }
      const { gl } = programInfo
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      super.renderProgram(params, programInfo)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    }
  } as unknown as EdgeProgramType
}

const arrowHead: ArrowHeadOptions = {
  ...DEFAULT_EDGE_ARROW_HEAD_PROGRAM_OPTIONS,
  extremity: 'target',
}

/** Curved arrow: soft blur halo + crisp core, both source→target gradients. */
export const NeoCurvedArrowProgram = createEdgeCompoundProgram([
  ...BLUR_LAYERS.map((layer) => createNeoGradientCurveProgram(null, layer)),
  createNeoGradientCurveProgram(arrowHead),
])

/** Cross-island filament: hairline, additive, no fake-blur ribbons. */
export const NeoHairlineCurveProgram = createNeoGradientCurveProgram(
  null,
  undefined,
  { additive: true }
)
