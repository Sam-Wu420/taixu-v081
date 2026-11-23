import { mulberry32 } from '../core/rng';

type Random = () => number;
type DayWork = Generator<void, void, undefined>;
interface DayJob { day: number; random: Random; work: DayWork }

/** 按入队日期逐步结算众生；同步调用方可立即排空。 */
export class NpcDayScheduler {
  private readonly jobs: DayJob[] = [];

  constructor(
    private readonly makeWork: (days: number, day: number, random: Random) => DayWork,
    private readonly advance: (work: DayWork, day: number, random: Random) => IteratorResult<void, void>,
  ) {}

  get pending(): boolean { return this.jobs.length > 0; }

  enqueue(days: number, day: number, seed = Math.floor(Math.random() * 0x100000000)): void {
    const random = mulberry32(seed);
    this.jobs.push({ day, random, work: this.makeWork(days, day, random) });
  }

  pump(budgetMs = 2): void {
    const start = performance.now();
    while (this.pending) {
      this.step();
      if (performance.now() - start >= budgetMs) break;
    }
  }

  flush(): void { while (this.pending) this.step(); }
  clear(): void { this.jobs.length = 0; }

  private step(): void {
    const job = this.jobs[0];
    if (this.advance(job.work, job.day, job.random).done) this.jobs.shift();
  }
}
