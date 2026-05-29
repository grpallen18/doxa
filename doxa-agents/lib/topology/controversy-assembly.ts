import { isStrongControversyEdge, type AgreementClusterRelationshipKind } from "./relationship-taxonomy.ts";

export type ClusterEdge = {
  a: string;
  b: string;
  kind: AgreementClusterRelationshipKind;
  relationshipId: string;
};

export type ControversyComponent = {
  clusterIds: string[];
  topicId: string;
  edgeRelationshipIds: string[];
};

export class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string) {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) this.parent.set(py, px);
  }

  getComponents(): Map<string, string[]> {
    const comp = new Map<string, string[]>();
    for (const [x] of this.parent) {
      const root = this.find(x);
      if (!comp.has(root)) comp.set(root, []);
      comp.get(root)!.push(x);
    }
    return comp;
  }
}

export function assembleControversyComponents(
  edges: ClusterEdge[],
  topicByCluster: Map<string, string>
): ControversyComponent[] {
  const strongEdges = edges.filter((e) => isStrongControversyEdge(e.kind));
  const uf = new UnionFind();
  const edgesByComponentRoot = new Map<string, string[]>();

  for (const edge of strongEdges) {
    const ta = topicByCluster.get(edge.a);
    const tb = topicByCluster.get(edge.b);
    if (!ta || !tb || ta !== tb) continue;
    uf.union(edge.a, edge.b);
  }

  for (const edge of strongEdges) {
    const ta = topicByCluster.get(edge.a);
    const tb = topicByCluster.get(edge.b);
    if (!ta || !tb || ta !== tb) continue;
    const root = uf.find(edge.a);
    if (!edgesByComponentRoot.has(root)) edgesByComponentRoot.set(root, []);
    edgesByComponentRoot.get(root)!.push(edge.relationshipId);
  }

  const components = uf.getComponents();
  const results: ControversyComponent[] = [];

  for (const [, members] of components) {
    const unique = [...new Set(members)];
    if (unique.length < 2) continue;
    const topicId = topicByCluster.get(unique[0]);
    if (!topicId) continue;
    if (!unique.every((id) => topicByCluster.get(id) === topicId)) continue;
    const root = uf.find(unique[0]);
    results.push({
      clusterIds: unique.sort(),
      topicId,
      edgeRelationshipIds: [...new Set(edgesByComponentRoot.get(root) ?? [])],
    });
  }

  return results;
}
