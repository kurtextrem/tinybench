import { test, expect } from "vitest";
import { Bench } from "../src/";
import { BenchEvent } from "../src/event";

test("basic", async () => {
  const bench = new Bench({ time: 100 });
  bench
    .add("foo", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    })
    .add("bar", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

  await bench.run();

  const tasks = bench.tasks;

  expect(tasks.length).toEqual(2);

  expect(tasks[0].name).toEqual("foo");
  expect(tasks[0].result.totalTime).toBeGreaterThan(50);

  expect(tasks[1].name).toEqual("bar");
  expect(tasks[1].result.totalTime).toBeGreaterThan(100);

  expect(tasks[0].result.hz * tasks[0].result.period).toBeCloseTo(1);
});

test("events order", async () => {
  const controller = new AbortController();
  const bench = new Bench({
    signal: controller.signal,
    warmupIterations: 0,
    warmupTime: 0,
  });
  bench
    .add("foo", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    })
    .add("bar", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    })
    .add("error", async () => {
      throw new Error("fake");
    })
    .add("abort", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

  const events: string[] = [];

  bench.addEventListener("start", () => {
    events.push("start");
  });

  bench.addEventListener("error", () => {
    events.push("error");
  });

  bench.addEventListener("reset", () => {
    events.push("reset");
  });

  bench.addEventListener("cycle", () => {
    events.push("cycle");
  });

  bench.addEventListener("abort", () => {
    events.push("abort");
  });

  bench.addEventListener("add", () => {
    events.push("add");
  });

  bench.addEventListener("remove", () => {
    events.push("remove");
  });

  bench.addEventListener("complete", () => {
    events.push("complete");
  });

  setTimeout(() => {
    controller.abort();
    // the abort task takes 1000ms (500ms time || 10 iterations => 10 * 1000)
  }, 900);

  bench.add("temporary", () => {});
  bench.remove("temporary");

  await bench.run();
  bench.reset();

  expect(events).toEqual([
    "add",
    "remove",
    "start",
    "error",
    "cycle",
    "cycle",
    "cycle",
    "abort",
    "complete",
    "reset",
  ]);
  // aborted has no results
  expect(bench.getTask("abort").result).toBeUndefined();
}, 10000);

test("error event", async () => {
  const bench = new Bench({ time: 50 });

  let err = new Error();
  bench.add("error", () => {
    throw err;
  });

  let taskErr: Error;
  bench.addEventListener("error", (e: BenchEvent) => {
    const task = e.currentTarget!;
    taskErr = task.result.error as Error;
  });

  await bench.run();

  expect(taskErr).toBe(err);
});

test("detect faster task", async () => {
  const bench = new Bench({ time: 200 });
  bench
    .add("faster", async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    })
    .add("slower", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

  await bench.run();

  const fasterTask = bench.getTask("faster");
  const slowerTask = bench.getTask("slower");

  expect(fasterTask.result!.mean).toBeLessThan(slowerTask.result!.mean);
  expect(fasterTask.result!.min).toBeLessThan(slowerTask.result!.min);
  expect(fasterTask.result!.max).toBeLessThan(slowerTask.result!.max);

  // moe should be smaller since it's faster
  expect(fasterTask.result!.moe).toBeLessThan(slowerTask.result!.moe);
});

test("statistics", async () => {
  const bench = new Bench({ time: 200 });
  bench.add("foo", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await bench.run();

  const fooTask = bench.getTask("foo");

  expect(fooTask.result!.variance).toBeTypeOf("number");
  expect(fooTask.result!.sd).toBeTypeOf("number");
  expect(fooTask.result!.sem).toBeTypeOf("number");
  expect(fooTask.result!.df).toBeTypeOf("number");
  expect(fooTask.result!.critical).toBeTypeOf("number");
  expect(fooTask.result!.moe).toBeTypeOf("number");
  expect(fooTask.result!.rme).toBeTypeOf("number");
});
