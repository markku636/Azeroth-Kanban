import { setupCheckpointer } from '@/lib/orchestrator/checkpointer';

// One-off: create the LangGraph checkpoint tables in schema studio_lg.
setupCheckpointer()
  .then(() => {
    console.log('studio_lg checkpoint tables ready');
    process.exit(0);
  })
  .catch((e) => {
    console.error('checkpointer setup failed', e);
    process.exit(1);
  });
