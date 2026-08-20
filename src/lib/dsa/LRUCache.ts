/**
 * Enterprise LRU (Least Recently Used) Cache
 * 
 * Implemented using a Doubly-Linked List + Hash Map for constant time O(1)
 * get, put, and eviction operations. Reduces DB roundtrips and optimizes
 * response times for 5,000+ daily active users.
 */

class DLLNode<K, V> {
  key: K;
  value: V;
  prev: DLLNode<K, V> | null = null;
  next: DLLNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, DLLNode<K, V>> = new Map();
  private head: DLLNode<K, V>;
  private tail: DLLNode<K, V>;

  constructor(capacity = 250) {
    this.capacity = capacity;
    // Dummy head and tail nodes to avoid null boundary checks
    this.head = new DLLNode<K, V>(null as any, null as any);
    this.tail = new DLLNode<K, V>(null as any, null as any);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get cached item in O(1) time. Moves accessed node to head (most recently used).
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Put key-value pair into cache in O(1) time. Evicts LRU item if capacity exceeded.
   */
  put(key: K, value: V): void {
    const existingNode = this.cache.get(key);

    if (existingNode) {
      existingNode.value = value;
      this.moveToHead(existingNode);
    } else {
      const newNode = new DLLNode<K, V>(key, value);
      this.cache.set(key, newNode);
      this.addNode(newNode);

      if (this.cache.size > this.capacity) {
        const lruNode = this.popTail();
        if (lruNode) {
          this.cache.delete(lruNode.key);
        }
      }
    }
  }

  /**
   * Invalidate a key.
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get total cached items.
   */
  size(): number {
    return this.cache.size;
  }

  // --- Internal Helper Methods ---

  private addNode(node: DLLNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  private removeNode(node: DLLNode<K, V>): void {
    const prev = node.prev;
    const next = node.next;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
  }

  private moveToHead(node: DLLNode<K, V>): void {
    this.removeNode(node);
    this.addNode(node);
  }

  private popTail(): DLLNode<K, V> | null {
    const res = this.tail.prev;
    if (res && res !== this.head) {
      this.removeNode(res);
      return res;
    }
    return null;
  }
}
