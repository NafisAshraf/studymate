import { removeStopwords, eng, ben } from "stopword";

const combinedStopwords = [...eng, ...ben];

export function cleanQueryForKeywordSearch(query: string): string {
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  const cleaned = removeStopwords(tokens, combinedStopwords);
  if (cleaned.length === 0) return query.trim();
  return cleaned.join(" ");
}
