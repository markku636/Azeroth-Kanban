// Port of ui2api.py convert() + prune() — ComfyUI UI-workflow JSON → /prompt API graph.
// Faithful TS port of the four load-bearing behaviors: bypass(mode4) passthrough,
// mute(mode2), widget-value consumption (incl. converted-to-link gotcha + control_after_generate),
// and prune-to-output-reachable.
export type Spec = unknown;
export interface ObjectInfo {
  [nodeType: string]: {
    input?: { required?: Record<string, Spec>; optional?: Record<string, Spec> };
    output_node?: boolean;
  };
}
export interface WfNode {
  id: number;
  type: string;
  mode?: number;
  inputs?: { name: string; type: string; link: number | null }[];
  outputs?: { type: string }[];
  widgets_values?: unknown;
}
export interface Workflow { nodes: WfNode[]; links: [number, number, number, number, number, string][] }
export type ApiPrompt = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

const WPRIM = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);
const SKIP_TYPES = new Set(["Note", "MarkdownNote", "Reroute"]);

function isWidget(spec: any): boolean {
  if (!Array.isArray(spec) || spec.length === 0) return false;
  const t = spec[0];
  return Array.isArray(t) || WPRIM.has(t);
}

function nodeInputsSpec(oi: ObjectInfo, ntype: string): [string, any][] {
  const inp = oi[ntype]?.input ?? {};
  const out: [string, any][] = [];
  for (const sect of ["required", "optional"] as const) {
    const o = (inp as any)[sect] ?? {};
    for (const name of Object.keys(o)) out.push([name, o[name]]);
  }
  return out;
}

function hasCag(name: string, spec: any): boolean {
  if (Array.isArray(spec) && spec.length >= 1 && spec[0] === "INT") {
    const cfg = spec.length > 1 && spec[1] && typeof spec[1] === "object" ? spec[1] : {};
    if (cfg.control_after_generate) return true;
  }
  return name === "seed" || name === "noise_seed" || name === "rand_seed";
}

export function convert(wf: Workflow, oi: ObjectInfo): ApiPrompt {
  const nodes = new Map<number, WfNode>();
  for (const n of wf.nodes) nodes.set(n.id, n);
  const linkmap = new Map<number, [number, number]>();
  for (const l of wf.links ?? []) linkmap.set(l[0], [l[1], l[2]]);

  function srcFor(nodeId: number, slot: number, depth = 0): [number, number] | null {
    const n = nodes.get(nodeId);
    if (n === undefined || depth > 32) return n !== undefined ? [nodeId, slot] : null;
    const m = n.mode;
    if (m === 2) return null; // mute
    if (m === 4) {            // bypass → passthrough
      const outs = n.outputs ?? [];
      const otype = slot < outs.length ? outs[slot]?.type : undefined;
      let link: number | null = null;
      for (const inp of n.inputs ?? []) {
        if (inp.link != null && inp.type === otype) { link = inp.link; break; }
      }
      if (link === null) {
        const ins = n.inputs ?? [];
        if (slot < ins.length && ins[slot]?.link != null) link = ins[slot].link;
      }
      if (link === null || !linkmap.has(link)) return null;
      const s = linkmap.get(link)!;
      return srcFor(s[0], s[1], depth + 1);
    }
    return [nodeId, slot];
  }

  const prompt: ApiPrompt = {};
  for (const [nid, n] of Array.from(nodes)) {
    const ntype = n.type ?? "";
    if (SKIP_TYPES.has(ntype) || !(ntype in oi)) continue;
    if (n.mode === 2 || n.mode === 4) continue;
    const inputs: Record<string, unknown> = {};
    const linked = new Set<string>();
    for (const inp of n.inputs ?? []) {
      if (inp.link != null && linkmap.has(inp.link)) {
        const s = linkmap.get(inp.link)!;
        const r = srcFor(s[0], s[1]);
        if (r !== null) inputs[inp.name] = [String(r[0]), r[1]];
        linked.add(inp.name);
      }
    }
    const specs = nodeInputsSpec(oi, ntype);
    const specOf = new Map(specs);
    const wv = n.widgets_values;
    if (wv && !Array.isArray(wv) && typeof wv === "object") {
      const allnames = new Set(specs.map(([name]) => name));
      for (const [k, v] of Object.entries(wv as Record<string, unknown>)) {
        if (allnames.has(k) && isWidget(specOf.get(k)) && !linked.has(k)) inputs[k] = v;
      }
    } else if (Array.isArray(wv)) {
      let vi = 0;
      for (const [name, spec] of specs) {
        if (!isWidget(spec)) continue;
        if (vi >= wv.length) break;
        const val = wv[vi]; vi += 1;
        if (!linked.has(name)) inputs[name] = val;
        if (hasCag(name, spec) && vi < wv.length) vi += 1;
      }
    }
    prompt[String(nid)] = { class_type: ntype, inputs };
  }
  return prompt;
}

export function prune(prompt: ApiPrompt, oi: ObjectInfo): ApiPrompt {
  let roots = Object.keys(prompt).filter((nid) => oi[prompt[nid].class_type]?.output_node);
  if (roots.length === 0) {
    const outs = new Set(["VHS_VideoCombine", "SaveImage", "SaveAnimatedWEBP", "PreviewImage"]);
    roots = Object.keys(prompt).filter((nid) => outs.has(prompt[nid].class_type));
  }
  const keep = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const nid = stack.pop()!;
    if (keep.has(nid) || !(nid in prompt)) continue;
    keep.add(nid);
    for (const v of Object.values(prompt[nid].inputs)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string") stack.push(v[0] as string);
    }
  }
  const out: ApiPrompt = {};
  for (const k of Object.keys(prompt)) if (keep.has(k)) out[k] = prompt[k];
  return out;
}
