/**
 * Enterprise Directed Acyclic Graph (DAG) Scheduler
 * 
 * Provides:
 * - Topological sorting (Kahn's algorithm) in O(V + E) time
 * - Dependency cycle detection to prevent workflow deadlocks
 * - Critical path and execution layer resolution for tasks and onboarding pipelines
 */

export interface DAGNode<T> {
  id: string;
  data: T;
  dependencies: string[]; // List of parent node IDs that must complete first
}

export class DAGScheduler<T> {
  private nodes: Map<string, DAGNode<T>> = new Map();

  /**
   * Add a node to the DAG.
   */
  addNode(node: DAGNode<T>): void {
    this.nodes.set(node.id, {
      ...node,
      dependencies: [...(node.dependencies || [])]
    });
  }

  /**
   * Add a directed dependency edge: `fromId` must be finished before `toId` can start.
   */
  addDependency(fromId: string, toId: string): void {
    const target = this.nodes.get(toId);
    if (target && !target.dependencies.includes(fromId)) {
      target.dependencies.push(fromId);
    }
  }

  /**
   * Perform topological sort using Kahn's Algorithm.
   * Returns nodes in strict valid execution sequence.
   * Throws an Error if a cyclic dependency is detected.
   */
  topologicalSort(): DAGNode<T>[] {
    const inDegree: Map<string, number> = new Map();
    const adjacencyList: Map<string, string[]> = new Map();

    // Initialize graph structures
    for (const [id] of this.nodes) {
      inDegree.set(id, 0);
      adjacencyList.set(id, []);
    }

    // Populate in-degrees and adjacency edges
    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (this.nodes.has(depId)) {
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
          adjacencyList.get(depId)!.push(id);
        }
      }
    }

    // Queue nodes with 0 in-degree (no prerequisites)
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sortedOrder: DAGNode<T>[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      sortedOrder.push(this.nodes.get(currentId)!);

      for (const neighborId of adjacencyList.get(currentId) || []) {
        const newDegree = (inDegree.get(neighborId) || 0) - 1;
        inDegree.set(neighborId, newDegree);
        if (newDegree === 0) {
          queue.push(neighborId);
        }
      }
    }

    // If sorted order contains fewer nodes than total nodes, a cycle exists
    if (sortedOrder.length !== this.nodes.size) {
      throw new Error("Cyclic dependency detected in task graph. Workflow execution blocked.");
    }

    return sortedOrder;
  }

  /**
   * Get parallel execution layers (batches of tasks that can run concurrently).
   */
  getExecutionBatches(): DAGNode<T>[][] {
    const inDegree: Map<string, number> = new Map();
    const adjacencyList: Map<string, string[]> = new Map();

    for (const [id] of this.nodes) {
      inDegree.set(id, 0);
      adjacencyList.set(id, []);
    }

    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (this.nodes.has(depId)) {
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
          adjacencyList.get(depId)!.push(id);
        }
      }
    }

    let currentBatch: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        currentBatch.push(id);
      }
    }

    const batches: DAGNode<T>[][] = [];
    let processedCount = 0;

    while (currentBatch.length > 0) {
      const nextBatch: string[] = [];
      const batchNodes: DAGNode<T>[] = [];

      for (const currentId of currentBatch) {
        batchNodes.push(this.nodes.get(currentId)!);
        processedCount++;

        for (const neighborId of adjacencyList.get(currentId) || []) {
          const newDegree = (inDegree.get(neighborId) || 0) - 1;
          inDegree.set(neighborId, newDegree);
          if (newDegree === 0) {
            nextBatch.push(neighborId);
          }
        }
      }

      batches.push(batchNodes);
      currentBatch = nextBatch;
    }

    if (processedCount !== this.nodes.size) {
      throw new Error("Cyclic dependency detected in task graph.");
    }

    return batches;
  }

  /**
   * Clear all nodes.
   */
  clear(): void {
    this.nodes.clear();
  }
}
