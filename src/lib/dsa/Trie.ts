/**
 * Enterprise Trie (Prefix Tree) Data Structure
 * 
 * Provides O(K) time complexity prefix search and instant filtering
 * across multi-thousand employee directories, candidate pools, and skill tags.
 */

export interface TrieNodeValue<T> {
  id: string;
  data: T;
}

export class TrieNode<T> {
  children: Map<string, TrieNode<T>> = new Map();
  isEndOfWord = false;
  records: TrieNodeValue<T>[] = [];
}

export class Trie<T> {
  private root: TrieNode<T> = new TrieNode<T>();
  private size = 0;

  /**
   * Insert a string key (e.g. employee name, email, skill) associated with a record.
   */
  insert(key: string, recordId: string, data: T): void {
    if (!key) return;
    const normalized = key.toLowerCase().trim();
    let current = this.root;

    for (const char of normalized) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode<T>());
      }
      current = current.children.get(char)!;
    }

    current.isEndOfWord = true;
    // Prevent duplicate entries for the same record ID under the same node
    if (!current.records.some(r => r.id === recordId)) {
      current.records.push({ id: recordId, data });
      this.size++;
    }
  }

  /**
   * Index multiple searchable fields (e.g. name, department, role, email, skills) for a single record.
   */
  indexRecord(recordId: string, data: T, fields: (string | undefined | null)[]): void {
    fields.forEach(field => {
      if (field && typeof field === 'string') {
        // Index full phrase
        this.insert(field, recordId, data);
        // Also index individual words for multi-word fields
        const words = field.split(/\s+/);
        if (words.length > 1) {
          words.forEach(w => {
            if (w.length > 1) this.insert(w, recordId, data);
          });
        }
      }
    });
  }

  /**
   * Search for all records matching a prefix in O(K) time, where K is prefix length.
   */
  searchPrefix(prefix: string, limit = 50): T[] {
    if (!prefix) return [];
    const normalized = prefix.toLowerCase().trim();
    let current = this.root;

    for (const char of normalized) {
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char)!;
    }

    // Collect all records in the subtree rooted at current
    const results: T[] = [];
    const visitedRecordIds = new Set<string>();

    const dfs = (node: TrieNode<T>) => {
      if (results.length >= limit) return;
      if (node.isEndOfWord) {
        for (const item of node.records) {
          if (!visitedRecordIds.has(item.id)) {
            visitedRecordIds.add(item.id);
            results.push(item.data);
            if (results.length >= limit) return;
          }
        }
      }
      for (const childNode of node.children.values()) {
        dfs(childNode);
        if (results.length >= limit) return;
      }
    };

    dfs(current);
    return results;
  }

  /**
   * Clear the Trie memory.
   */
  clear(): void {
    this.root = new TrieNode<T>();
    this.size = 0;
  }

  /**
   * Get total unique key-value pairs stored in the Trie.
   */
  getSize(): number {
    return this.size;
  }
}
