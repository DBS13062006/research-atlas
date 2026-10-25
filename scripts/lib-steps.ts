// Runs steps in order, printing a timing line for each and stopping at the first failure.
import { spawnSync } from "node:child_process";

export type Step = { label: string; run: () => number | Promise<number> };

export function pnpm(script: string, args: string[] = [], env: Record<string, string> = {}): Step {
  return {
    label: [script, ...args].join(" "),
    run: () =>
      spawnSync("pnpm", ["--silent", script, ...args], { stdio: "inherit", env: { ...process.env, ...env } })
        .status ?? 1,
  };
}

export async function runSteps(title: string, steps: Step[], cleanup?: () => void): Promise<void> {
  const started = Date.now();
  const done: string[] = [];
  try {
    for (const step of steps) {
      console.log(`\n── ${step.label}`);
      const t = Date.now();
      const status = await step.run();
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      if (status !== 0) {
        console.error(`\n${title}: FAILED at "${step.label}" (exit ${status}) after ${secs} s`);
        console.log(done.join("\n"));
        process.exitCode = status;
        return;
      }
      done.push(`  ok  ${secs.padStart(6)} s  ${step.label}`);
    }
  } finally {
    cleanup?.();
  }
  console.log(
    `\n${title}: all ${steps.length} steps passed in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
  console.log(done.join("\n"));
}
