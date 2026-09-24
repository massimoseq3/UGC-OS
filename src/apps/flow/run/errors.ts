// Whether a saved task handle is still worth resuming.
//
// kie said the task itself failed — polling it again can only fail again, so
// its handle goes and the next try submits fresh. Every other error (a bad or
// expired key, a dropped connection, a download that stalled, a poll that
// timed out) leaves the handle alone: kie probably made the thing, and the
// next try fetches it rather than paying twice.
export function taskIsDead(err: unknown): boolean {
  return err instanceof Error && /^Generation failed\b/.test(err.message)
}
