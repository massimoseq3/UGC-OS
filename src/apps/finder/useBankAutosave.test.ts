import { describe, expect, it, vi } from 'vitest'

// The photo memo's module reaches IndexedDB on import; the saver only needs a Map.
vi.mock('./services/productImages', () => ({ newImageMemo: () => new Map() }))

import { createSaver, type BankAutosaveOptions } from './useBankAutosave'

type Draft = { title: string; body: string }

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(initial: Draft, rowId: string | null = null, restored = false) {
  const states: string[] = []
  const saver = createSaver<Draft>(initial, rowId, restored, (state) => states.push(state))
  let next = 0
  const persist = vi.fn(async (value: Draft, id: string | null) => ({ id: id ?? `row-${++next}`, stored: value }))
  const onAbandon = vi.fn()
  const options: BankAutosaveOptions<Draft> = {
    rowId,
    canSave: (d) => !!d.title.trim() && !!d.body.trim(),
    persist,
    onAbandon,
    restored,
  }
  const show = (value: Draft) => saver.sync(value, options)
  show(initial)
  saver.enter()
  return { saver, persist, onAbandon, show, states }
}

describe('Bank autosave', () => {
  it('writes nothing until the required fields are filled, then creates ONE row and updates it', async () => {
    const { saver, persist, show } = setup({ title: '', body: '' })

    show({ title: '', body: 'Hook line' })
    await saver.flush()
    expect(persist).not.toHaveBeenCalled()

    show({ title: 'Lazy girl', body: 'Hook line' })
    await saver.flush()
    show({ title: 'Lazy girl', body: 'Hook line, then the demo' })
    await saver.flush()

    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[0][1]).toBeNull()
    expect(persist.mock.calls[1][1]).toBe('row-1')
  })

  it('does not write when nothing changed since the last save', async () => {
    const { saver, persist, show } = setup({ title: 'Saved', body: 'Already' }, 'row-9')
    await saver.flush()
    show({ title: 'Saved', body: 'Already' })
    await saver.flush()
    expect(persist).not.toHaveBeenCalled()
  })

  it('never runs two writes at once, and a flush that arrives mid-save lands the latest edit into the same row', async () => {
    const { saver, persist, show } = setup({ title: '', body: '' })
    let release: () => void = () => {}
    persist.mockImplementationOnce(
      (value: Draft) => new Promise((resolve) => { release = () => resolve({ id: 'row-1', stored: value }) }),
    )

    show({ title: 'A', body: 'first' })
    const first = saver.flush()
    show({ title: 'A', body: 'first, then more' })
    const second = saver.flush()
    expect(persist).toHaveBeenCalledTimes(1)

    release()
    await first
    await second
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[1][0]).toEqual({ title: 'A', body: 'first, then more' })
    expect(persist.mock.calls[1][1]).toBe('row-1')
  })

  it('reports a form that closed with changes a required field was blocking', async () => {
    const { saver, onAbandon, show } = setup({ title: '', body: '' })
    show({ title: '', body: 'Unsaved script' })
    saver.leave()
    await tick()
    expect(onAbandon).toHaveBeenCalledWith({ title: '', body: 'Unsaved script' }, null)
  })

  it('stays quiet when the member discarded, or when the form came straight back (StrictMode)', async () => {
    const discarded = setup({ title: '', body: '' })
    discarded.show({ title: '', body: 'Throw this away' })
    discarded.saver.discard()
    discarded.saver.leave()

    const remounted = setup({ title: '', body: '' })
    remounted.show({ title: '', body: 'Still on screen' })
    remounted.saver.leave()
    remounted.saver.enter()

    await tick()
    expect(discarded.onAbandon).not.toHaveBeenCalled()
    expect(remounted.onAbandon).not.toHaveBeenCalled()
  })

  it('treats a reopened draft as unsaved even though it is what the form opened with', async () => {
    const { saver, persist } = setup({ title: 'Back again', body: 'From the toast' }, null, true)
    await saver.flush()
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
