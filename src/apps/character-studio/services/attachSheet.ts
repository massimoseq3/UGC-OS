import { useBankStore } from '../../../stores/bankStore'
import type { CharacterHistoryItem, Model } from '../../../stores/types'

// Attach a generated character sheet to a saved influencer. Sheets never
// create a new bank entry — they become `Model.sheetImage` on an existing
// one. If the influencer already had a different sheet, that older sheet's
// history row is unlinked first so its Saved badge clears and deleting the
// row later purges its blob (updateModel's guard keeps the blob alive while
// the row still references it).
export async function attachSheetToModel(item: CharacterHistoryItem, model: Model): Promise<void> {
  const { updateModel, updateCharacterHistory, characterHistory } = useBankStore.getState()

  if (model.sheetImage && model.sheetImage !== item.imageRef) {
    const previous = characterHistory.find((h) => h.imageRef === model.sheetImage)
    if (previous) await updateCharacterHistory(previous.id, { linkedModelId: undefined })
  }

  await updateModel(model.id, { sheetImage: item.imageRef })
  await updateCharacterHistory(item.id, { linkedModelId: model.id })
}
