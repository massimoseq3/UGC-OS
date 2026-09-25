import type { BlockKind } from '../../types'
import type { Executor } from '../types'
import { brollExecutor } from './broll'
import { scenesExecutor } from './scenes'
import {
  analyzerExecutor,
  charactersExecutor,
  editExecutor,
  outliersExecutor,
  playgroundExecutor,
  scriptsExecutor,
  voiceExecutor,
} from './simple'

export const EXECUTORS: Partial<Record<BlockKind, Executor>> = {
  voice: voiceExecutor,
  scripts: scriptsExecutor,
  characters: charactersExecutor,
  playground: playgroundExecutor,
  analyzer: analyzerExecutor,
  outliers: outliersExecutor,
  edit: editExecutor,
  broll: brollExecutor,
  scenes: scenesExecutor,
}
