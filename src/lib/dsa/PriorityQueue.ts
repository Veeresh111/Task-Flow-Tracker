/**
 * Enterprise Priority Queue (Binary Heap)
 * 
 * High-performance generic Min-Heap and Max-Heap implementation with:
 * - O(log N) insertion and deletion
 * - O(1) top element inspection (peek)
 * - Custom comparator support for complex enterprise records
 * 
 * Used for:
 * - Top-K candidate ranking in ATS and recruitment pipelines
 * - Real-time task scheduling and dependency execution
 * - Urgent complaint and incident priority dispatch
 */

export type Comparator<T> = (a: T, b: T) => number;

export class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: Comparator<T>;

  /**
   * @param comparator - Returns negative if `a` has higher priority than `b`,
   * positive if `b` has higher priority than `a`, and 0 if equal.
   * Default comparator creates a Min-Heap for numbers.
   */
  constructor(comparator?: Comparator<T>) {
    this.compare = comparator || ((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * Insert an element into the priority queue in O(log N) time.
   */
  push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Remove and return the highest priority element in O(log N) time.
   */
  pop(): T | undefined {
    if (this.isEmpty()) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  /**
   * Peek at the highest priority element in O(1) time without removing it.
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Return the total number of items in the queue.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Check if the queue is empty.
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Return a shallow clone of the internal heap elements.
   */
  toArray(): T[] {
    return [...this.heap];
  }

  /**
   * Extract all elements in priority order (destructively sorts into a new array).
   */
  drain(): T[] {
    const result: T[] = [];
    while (!this.isEmpty()) {
      result.push(this.pop()!);
    }
    return result;
  }

  /**
   * Clear all elements from the queue.
   */
  clear(): void {
    this.heap = [];
  }

  // --- Internal Heap Helper Methods ---

  private parentIndex(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  private leftChildIndex(i: number): number {
    return 2 * i + 1;
  }

  private rightChildIndex(i: number): number {
    return 2 * i + 2;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = this.parentIndex(current);
      if (this.compare(this.heap[current], this.heap[parent]) < 0) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (this.leftChildIndex(current) < length) {
      let highestPriority = current;
      const left = this.leftChildIndex(current);
      const right = this.rightChildIndex(current);

      if (left < length && this.compare(this.heap[left], this.heap[highestPriority]) < 0) {
        highestPriority = left;
      }

      if (right < length && this.compare(this.heap[right], this.heap[highestPriority]) < 0) {
        highestPriority = right;
      }

      if (highestPriority !== current) {
        this.swap(current, highestPriority);
        current = highestPriority;
      } else {
        break;
      }
    }
  }
}

/**
 * Factory for creating a Max-Heap for numeric ranking (e.g. ATS candidate scores).
 */
export function createMaxHeap<T>(scoreExtractor: (item: T) => number): PriorityQueue<T> {
  return new PriorityQueue<T>((a, b) => scoreExtractor(b) - scoreExtractor(a));
}

/**
 * Factory for creating a Min-Heap for priority queues (e.g. deadline or severity).
 */
export function createMinHeap<T>(scoreExtractor: (item: T) => number): PriorityQueue<T> {
  return new PriorityQueue<T>((a, b) => scoreExtractor(a) - scoreExtractor(b));
}
