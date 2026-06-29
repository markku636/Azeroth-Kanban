import { Worker } from 'bullmq';
import { Command } from '@langchain/langgraph';
import { connection, PIPELINE_QUEUE, type PipelineJob } from '@/lib/orchestrator/queue';
import { buildGraph } from '@/lib/orchestrator/graph';
import { runKeyframesStage, runRenderStage, runExportStage, runRefineStage, runCharacterPortraitStage } from '@/lib/orchestrator/stages';
import { setupCheckpointer } from '@/lib/orchestrator/checkpointer';
import { publishProgress } from '@/lib/orchestrator/events';

// Separate process from Next. concurrency:1 = jobs queue through the single local GPU.
// HITL: when a gate node interrupt()s, the stream simply ends (state safe in the Postgres
// checkpoint); a later `resume` job continues it via Command.
async function main() {
  await setupCheckpointer();
  const graph = buildGraph();
  console.log('[worker] studio-pipeline ready (concurrency=1)');

  new Worker<PipelineJob>(
    PIPELINE_QUEUE,
    async (job) => {
      const { projectId, resume, resumeValue, mode, shotIds, sceneId, exportFormat, refine } = job.data;
      try {
        if (mode === 'refine' && refine) {
          console.log(`[worker] ${projectId} -> refine ${refine.refineMode} shot[${refine.shotId}]`);
          await runRefineStage(projectId, refine);
          return;
        }
        if (mode === 'export') {
          console.log(`[worker] ${projectId} -> export ${exportFormat}`);
          await runExportStage(projectId, exportFormat ?? 'gif');
          return;
        }
        if (mode === 'character' && job.data.character) {
          console.log(`[worker] character portrait -> ${job.data.character.characterId}`);
          await runCharacterPortraitStage(job.data.character.characterId, job.data.character.prompt);
          return;
        }
        // Staged, crash-safe modes (two-phase UI): generate keyframes only, or render+assemble.
        if (mode === 'keyframes') {
          console.log(`[worker] ${projectId} -> keyframes${shotIds?.length ? ` [${shotIds.length}]` : ' (all)'}`);
          await runKeyframesStage(projectId, shotIds);
          return;
        }
        if (mode === 'render') {
          console.log(`[worker] ${projectId} -> render${sceneId ? ` scene[${sceneId}]` : shotIds?.length ? ` [${shotIds.length}]` : ' (all)'}`);
          await runRenderStage(projectId, shotIds, sceneId);
          return;
        }
        // Legacy full LangGraph run / resume.
        const config = { configurable: { thread_id: `studio:${projectId}` }, streamMode: 'updates' as const };
        const input = resume ? new Command({ resume: resumeValue }) : { projectId };
        for await (const chunk of await graph.stream(input as never, config)) {
          const node = Object.keys(chunk as object)[0];
          if (node) console.log(`[worker] ${projectId} -> ${node}`);
        }
      } catch (e) {
        await publishProgress({ projectId, stage: 'error', message: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },
    { connection, concurrency: 1 },
  );
}

main().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
