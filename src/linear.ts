const API_KEY = process.env.LINEAR_API_KEY;
const ENDPOINT = "https://api.linear.app/graphql";

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  priorityLabel: string;
  dueDate: string | null;
  state: { name: string; type: string };
  labels: { nodes: { name: string; color: string }[] };
  project: { name: string } | null;
  team: { name: string; key: string };
};

async function query<T>(q: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: API_KEY!,
    },
    body: JSON.stringify({ query: q, variables }),
  });
  const json = await res.json() as any;
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export async function fetchMyIssues(): Promise<LinearIssue[]> {
  const data = await query<any>(`
    query {
      viewer {
        assignedIssues(
          first: 100
          orderBy: updatedAt
          filter: { state: { type: { nin: ["completed", "canceled"] } } }
        ) {
          nodes {
            id
            identifier
            title
            priority
            priorityLabel
            dueDate
            state { name type }
            labels { nodes { name color } }
            project { name }
            team { name key }
          }
        }
      }
    }
  `);
  return data.viewer.assignedIssues.nodes;
}

/**
 * Map Linear priority to Eisenhower quadrant.
 *   1 (Urgent)  → urgent + important
 *   2 (High)    → not urgent + important
 *   3 (Medium)  → urgent + not important
 *   4 (Low) / 0 (None) → not urgent + not important
 */
export function toEisenhower(priority: number): { urgent: boolean; important: boolean } {
  switch (priority) {
    case 1: return { urgent: true, important: true };
    case 2: return { urgent: false, important: true };
    case 3: return { urgent: true, important: false };
    default: return { urgent: false, important: false };
  }
}
