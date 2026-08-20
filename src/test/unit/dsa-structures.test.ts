import { describe, it, expect } from "vitest";
import { PriorityQueue, createMaxHeap, createMinHeap } from "@/lib/dsa/PriorityQueue";
import { VectorMath } from "@/lib/dsa/VectorMath";
import { DAGScheduler } from "@/lib/dsa/DAGScheduler";
import { Trie } from "@/lib/dsa/Trie";
import { LRUCache } from "@/lib/dsa/LRUCache";
import { SlidingWindowAggregator } from "@/lib/dsa/SlidingWindow";

describe("DSA Engine Suite", () => {
  describe("PriorityQueue", () => {
    it("orders elements correctly in Min-Heap mode", () => {
      const pq = new PriorityQueue<number>();
      pq.push(50);
      pq.push(10);
      pq.push(30);
      pq.push(5);

      expect(pq.peek()).toBe(5);
      expect(pq.pop()).toBe(5);
      expect(pq.pop()).toBe(10);
      expect(pq.pop()).toBe(30);
      expect(pq.pop()).toBe(50);
      expect(pq.isEmpty()).toBe(true);
    });

    it("ranks candidates in Max-Heap mode using createMaxHeap", () => {
      interface CandidateRecord {
        id: string;
        name: string;
        atsScore: number;
      }

      const maxHeap = createMaxHeap<CandidateRecord>(c => c.atsScore);
      maxHeap.push({ id: "1", name: "Alice", atsScore: 78 });
      maxHeap.push({ id: "2", name: "Bob", atsScore: 95 });
      maxHeap.push({ id: "3", name: "Charlie", atsScore: 84 });

      expect(maxHeap.peek()?.name).toBe("Bob");
      const drained = maxHeap.drain();
      expect(drained.map(c => c.name)).toEqual(["Bob", "Charlie", "Alice"]);
    });
  });

  describe("VectorMath", () => {
    it("computes cosine similarity accurately", () => {
      const v1 = [1, 1, 0, 0];
      const v2 = [1, 1, 0, 0];
      expect(VectorMath.cosineSimilarity(v1, v2)).toBeCloseTo(1.0);

      const v3 = [0, 0, 1, 1];
      expect(VectorMath.cosineSimilarity(v1, v3)).toBeCloseTo(0.0);
    });

    it("computes Jaccard similarity for skill sets", () => {
      const req = ["React", "TypeScript", "Node.js", "PostgreSQL"];
      const cand = ["React", "TypeScript", "Python"];
      const score = VectorMath.jaccardSimilarity(req, cand);
      // Intersection: 2, Union: 5 -> 2/5 = 0.4
      expect(score).toBeCloseTo(0.4);
    });

    it("computes candidate match score against JD", () => {
      const resume = "Experienced React and TypeScript developer with solid Node.js and SQL database skills.";
      const jd = "Looking for a Senior React Developer proficient in TypeScript, Node.js, and Supabase.";
      const result = VectorMath.computeCandidateMatchScore(resume, jd, ["React", "TypeScript", "Node.js", "Supabase"]);

      expect(result.overallScore).toBeGreaterThan(50);
      expect(result.matchedSkills).toContain("React");
      expect(result.matchedSkills).toContain("TypeScript");
      expect(result.missingSkills).toContain("Supabase");
    });
  });

  describe("DAGScheduler", () => {
    it("executes tasks in valid topological sequence", () => {
      const dag = new DAGScheduler<{ title: string }>();
      dag.addNode({ id: "1", data: { title: "ATS Screen" }, dependencies: [] });
      dag.addNode({ id: "2", data: { title: "Assessment" }, dependencies: ["1"] });
      dag.addNode({ id: "3", data: { title: "Interview" }, dependencies: ["2"] });
      dag.addNode({ id: "4", data: { title: "Offer" }, dependencies: ["3"] });

      const sorted = dag.topologicalSort();
      expect(sorted.map(n => n.id)).toEqual(["1", "2", "3", "4"]);
    });

    it("detects circular dependencies and throws error", () => {
      const dag = new DAGScheduler<string>();
      dag.addNode({ id: "A", data: "A", dependencies: ["B"] });
      dag.addNode({ id: "B", data: "B", dependencies: ["A"] });

      expect(() => dag.topologicalSort()).toThrow(/Cyclic dependency/);
    });

    it("computes parallel execution batches", () => {
      const dag = new DAGScheduler<string>();
      dag.addNode({ id: "Task1", data: "Task 1", dependencies: [] });
      dag.addNode({ id: "Task2", data: "Task 2", dependencies: [] });
      dag.addNode({ id: "Task3", data: "Task 3", dependencies: ["Task1", "Task2"] });

      const batches = dag.getExecutionBatches();
      expect(batches.length).toBe(2);
      expect(batches[0].map(n => n.id)).toEqual(["Task1", "Task2"]);
      expect(batches[1].map(n => n.id)).toEqual(["Task3"]);
    });
  });

  describe("Trie", () => {
    it("indexes and retrieves items by prefix", () => {
      const trie = new Trie<{ name: string }>();
      trie.insert("Alice Smith", "1", { name: "Alice Smith" });
      trie.insert("Alexander Bell", "2", { name: "Alexander Bell" });
      trie.insert("Bob Builder", "3", { name: "Bob Builder" });

      const results = trie.searchPrefix("al");
      expect(results.length).toBe(2);
      expect(results.map(r => r.name)).toContain("Alice Smith");
      expect(results.map(r => r.name)).toContain("Alexander Bell");
    });
  });

  describe("SlidingWindowAggregator", () => {
    it("calculates moving average and EWMA", () => {
      const window = new SlidingWindowAggregator(60, 0.5);
      const now = Date.now();
      window.addSample(10, now);
      window.addSample(20, now + 1000);
      window.addSample(30, now + 2000);

      expect(window.getAverage(now + 2000)).toBe(20);
      expect(window.getEventCount(now + 2000)).toBe(3);
      expect(window.getMax(now + 2000)).toBe(30);
      expect(window.getMin(now + 2000)).toBe(10);
    });
  });
});
