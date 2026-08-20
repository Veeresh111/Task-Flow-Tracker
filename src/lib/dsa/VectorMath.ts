/**
 * Enterprise Vector Math & Semantic Similarity Engine
 * 
 * High-performance mathematical utilities for:
 * - Cosine Similarity between skill vectors / embeddings
 * - TF-IDF (Term Frequency - Inverse Document Frequency) calculation
 * - Jaccard Index for token-set overlap (e.g. required vs acquired skills)
 * - Euclidean distance for multidimensional employee telemetry
 */

export class VectorMath {
  /**
   * Calculate Cosine Similarity between two numeric vectors.
   * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for normalized frequencies).
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    const similarity = dotProduct / denominator;
    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Calculate Jaccard Similarity between two arrays/sets of string tokens.
   * Useful for quick skill keywords intersection over union.
   */
  static jaccardSimilarity(setA: string[], setB: string[]): number {
    if (!setA || !setB || (setA.length === 0 && setB.length === 0)) return 0;
    const a = new Set(setA.map(s => s.toLowerCase().trim()).filter(Boolean));
    const b = new Set(setB.map(s => s.toLowerCase().trim()).filter(Boolean));

    if (a.size === 0 && b.size === 0) return 0;

    let intersectionCount = 0;
    for (const item of a) {
      if (b.has(item)) {
        intersectionCount++;
      }
    }

    const unionCount = a.size + b.size - intersectionCount;
    return unionCount > 0 ? intersectionCount / unionCount : 0;
  }

  /**
   * Compute Term Frequency (TF) vector for a text document given a vocabulary.
   */
  static computeTF(tokens: string[], vocabulary: string[]): number[] {
    const totalTokens = tokens.length || 1;
    const countMap = new Map<string, number>();

    tokens.forEach(t => {
      const norm = t.toLowerCase().trim();
      countMap.set(norm, (countMap.get(norm) || 0) + 1);
    });

    return vocabulary.map(word => {
      const count = countMap.get(word.toLowerCase().trim()) || 0;
      return count / totalTokens;
    });
  }

  /**
   * Tokenize and normalize raw text into clean alphanumeric keywords.
   */
  static tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  /**
   * Compute semantic match score between a candidate resume text and a job description.
   * Combines TF-IDF Cosine Similarity with Jaccard Keyword Overlap.
   */
  static computeCandidateMatchScore(
    resumeText: string,
    jdText: string,
    requiredSkills: string[] = []
  ): {
    overallScore: number;
    cosineScore: number;
    keywordScore: number;
    matchedSkills: string[];
    missingSkills: string[];
  } {
    const resumeTokens = this.tokenize(resumeText);
    const jdTokens = this.tokenize(jdText);

    // Build unified vocabulary
    const vocabSet = new Set<string>([...resumeTokens, ...jdTokens]);
    const vocabulary = Array.from(vocabSet);

    const resumeTF = this.computeTF(resumeTokens, vocabulary);
    const jdTF = this.computeTF(jdTokens, vocabulary);

    const cosineScore = Math.round(this.cosineSimilarity(resumeTF, jdTF) * 100);

    // Skill-specific extraction
    const resumeTextLower = resumeText.toLowerCase();
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    requiredSkills.forEach(skill => {
      const cleanSkill = skill.toLowerCase().trim();
      if (cleanSkill && resumeTextLower.includes(cleanSkill)) {
        matchedSkills.push(skill);
      } else if (cleanSkill) {
        missingSkills.push(skill);
      }
    });

    const keywordScore = requiredSkills.length > 0
      ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
      : cosineScore;

    // Weighted combination: 60% skill keyword match + 40% contextual cosine similarity
    const overallScore = Math.round((keywordScore * 0.6) + (cosineScore * 0.4));

    return {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      cosineScore,
      keywordScore,
      matchedSkills,
      missingSkills,
    };
  }
}
