/**
 * Union-find helpers for Viewpoint / Controversy assembly (Neo Proposition/Argument uids).
 * Ported from topology/controversy-assembly.ts.
 */

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

export type RelEdge = {
  a: string;
  b: string;
  kind: string;
  decisionUid: string;
  topicKey: string;
};

export type Component = {
  memberIds: string[];
  topicKey: string;
  edgeDecisionUids: string[];
};

export function assembleComponents(
  edges: RelEdge[],
  kindFilter: (kind: string) => boolean,
  minMembers = 2
): Component[] {
  const filtered = edges.filter((e) => kindFilter(e.kind) && e.topicKey);
  const uf = new UnionFind();
  const edgesByRoot = new Map<string, string[]>();

  for (const edge of filtered) {
    uf.union(edge.a, edge.b);
  }
  for (const edge of filtered) {
    const root = uf.find(edge.a);
    if (!edgesByRoot.has(root)) edgesByRoot.set(root, []);
    edgesByRoot.get(root)!.push(edge.decisionUid);
  }

  const results: Component[] = [];
  for (const [, members] of uf.getComponents()) {
    const unique = [...new Set(members)].sort();
    if (unique.length < minMembers) continue;
    const topicKey = filtered.find((e) => unique.includes(e.a) || unique.includes(e.b))
      ?.topicKey;
    if (!topicKey) continue;
    if (!unique.every((id) => {
      const sample = filtered.find((e) => e.a === id || e.b === id);
      return sample?.topicKey === topicKey;
    })) continue;
    const root = uf.find(unique[0]);
    results.push({
      memberIds: unique,
      topicKey,
      edgeDecisionUids: [...new Set(edgesByRoot.get(root) ?? [])],
    });
  }
  return results;
}

/**
 * Mega-merge guard: split connected components that exceed maxMembers by
 * growing BFS clusters and leaving remainder as sibling components.
 */
export function splitOversizedComponents(
  components: Component[],
  edges: RelEdge[],
  maxMembers: number
): Component[] {
  if (maxMembers < 2) return components;
  const out: Component[] = [];
  for (const comp of components) {
    if (comp.memberIds.length <= maxMembers) {
      out.push(comp);
      continue;
    }
    out.push(...partitionComponent(comp, edges, maxMembers));
  }
  return out;
}

function partitionComponent(
  comp: Component,
  edges: RelEdge[],
  maxMembers: number
): Component[] {
  const memberSet = new Set(comp.memberIds);
  const adj = new Map<string, string[]>();
  for (const id of comp.memberIds) adj.set(id, []);
  const internal: RelEdge[] = [];
  for (const e of edges) {
    if (!memberSet.has(e.a) || !memberSet.has(e.b)) continue;
    internal.push(e);
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }

  const remaining = new Set(comp.memberIds);
  const parts: Component[] = [];
  while (remaining.size) {
    const start = [...remaining].sort()[0];
    const cluster: string[] = [];
    const queue = [start];
    const seen = new Set<string>([start]);
    while (queue.length && cluster.length < maxMembers) {
      const cur = queue.shift()!;
      if (!remaining.has(cur)) continue;
      cluster.push(cur);
      remaining.delete(cur);
      for (const nxt of adj.get(cur) ?? []) {
        if (!seen.has(nxt) && remaining.has(nxt) && cluster.length + queue.length < maxMembers) {
          seen.add(nxt);
          queue.push(nxt);
        }
      }
    }
    if (!cluster.length) break;
    const clusterSet = new Set(cluster);
    const edgeDecisionUids = [
      ...new Set(
        internal
          .filter((e) => clusterSet.has(e.a) && clusterSet.has(e.b))
          .map((e) => e.decisionUid)
      ),
    ];
    parts.push({
      memberIds: [...cluster].sort(),
      topicKey: comp.topicKey,
      edgeDecisionUids,
    });
  }
  return parts.length ? parts : [comp];
}
