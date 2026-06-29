import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// LangGraph checkpoints live in an isolated schema `studio_lg` on the SAME database,
// so Prisma migrations never touch them and vice-versa.
let saver: PostgresSaver | null = null;

export function getCheckpointer(): PostgresSaver {
  if (!saver) {
    saver = PostgresSaver.fromConnString(process.env.DATABASE_URL ?? '', {
      schema: 'studio_lg',
    });
  }
  return saver;
}

/** Run once (e.g. worker boot) to create the checkpoint tables. */
export async function setupCheckpointer(): Promise<void> {
  await getCheckpointer().setup();
}
