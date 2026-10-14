import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/canvas/main.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const functions = [
    section('function smartCascadeGraphForTail(', 'function cascadeTailForLoop('),
    section('function canRunSmartCascade(', 'function cascadeConnectionKeys('),
    section('function selectedCascadeTarget(', 'function syncCascadeRunButton('),
    section('function cascadeRunBtnClickHandler(', "cascadeRunBtn.addEventListener('click'"),
].join('\n');

function graphContext(ids, links, selection, loopId = '') {
    const nodes = ids.map(id => ({ id, type: id === loopId ? 'smart-loop' : 'smart-image' }));
    const downstream = id => links.filter(([from]) => from === id).map(([, to]) => nodes.find(n => n.id === to));
    const calls = [];
    const context = {
        nodes, selectedIds: selection, smartCascadeRuns: new Map(),
        isSmartImageNode: node => node?.type === 'smart-image',
        isHistoryGroupNode: () => false,
        isSmartAssetImageNode: () => false,
        resolveSmartCascadeLoop: () => loopId ? { node: nodes.find(n => n.id === loopId) } : null,
        downstreamImageTargetsFor: node => downstream(node.id),
        downstreamCascadeTargetsFor: node => downstream(node.id),
        downstreamNodesForId: id => downstream(id),
        hasDownstreamImageNode: node => downstream(node.id).length > 0,
        hasDownstreamWorkflowImageNode: node => downstream(node.id).length > 0,
        smartImageChainTo: id => {
            const path = [], seen = new Set();
            while (id && !seen.has(id)) {
                seen.add(id);
                const node = nodes.find(n => n.id === id);
                if (node.type === 'smart-loop') break;
                path.unshift(node);
                id = links.find(([, to]) => to === id)?.[0];
            }
            return path;
        },
        runSmartCascade: (node, options) => calls.push({ node, options }),
        requestSmartCascadeStop: key => calls.push({ stop: key }),
    };
    vm.createContext(context);
    vm.runInContext(functions, context);
    return { context, calls };
}

describe('selection cascade', () => {
    it('runs a selected partial chain without unselected upstream or downstream nodes', () => {
        const { context, calls } = graphContext(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']], ['b', 'c']);
        const target = context.selectedCascadeTarget();
        expect(target.id).toBe('c');
        const graph = context.smartCascadeGraphForTail(target, { selectedNodeIds: ['b', 'c'] });
        expect(graph.root.id).toBe('b');
        expect(graph.edges.map(edge => edge.key)).toEqual(['b->c']);
        context.cascadeRunBtnClickHandler();
        expect(calls[0].node.id).toBe('c');
        expect(calls[0].options.selectedNodeIds).toEqual(['b', 'c']);
        expect(calls[0].options.selectedNodeIds).not.toBe(context.selectedIds);
    });

    it('runs selected branches together and excludes unselected branches', () => {
        const { context } = graphContext(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['a', 'd']], ['a', 'b', 'c']);
        const target = context.selectedCascadeTarget();
        expect(target).not.toBeNull();
        expect(context.smartCascadeGraphForTail(target, { selectedNodeIds: context.selectedIds }).edges.map(e => e.key))
            .toEqual(['a->b', 'a->c']);
    });

    it('does not enable execution for disconnected selections', () => {
        const { context } = graphContext(['a', 'b', 'c'], [['a', 'b']], ['a', 'b', 'c']);
        expect(context.selectedCascadeTarget()).toBeNull();
    });

    it('does not pick up an unselected upstream loop', () => {
        const { context } = graphContext(['loop', 'a'], [['loop', 'a']], ['a', 'missing'], 'loop');
        expect(context.selectedCascadeTarget()).toBeNull();
    });

    it('supports a selected loop and its direct target', () => {
        const { context } = graphContext(['loop', 'a'], [['loop', 'a']], ['loop', 'a'], 'loop');
        expect(context.selectedCascadeTarget().id).toBe('a');
    });

    it('stops the active run for this selection', () => {
        const { context, calls } = graphContext(['a', 'b'], [['a', 'b']], ['a', 'b']);
        context.smartCascadeRuns.set('run-1', { runKey: 'run-1', selectedNodeIds: ['a', 'b'] });
        context.cascadeRunBtnClickHandler();
        expect(calls).toEqual([{ stop: 'run-1' }]);
    });
});
