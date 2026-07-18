// Memory-only File attachments per node (the Analyzer node's ad video).
// Deliberately outside the persisted store: a video File is far too big for
// localStorage, so after a refresh the user re-attaches — the node's
// persisted `fileName` tells them which file it was.

const files = new Map<string, File>()

export function setNodeFile(nodeId: string, file: File): void {
  files.set(nodeId, file)
}

export function getNodeFile(nodeId: string): File | undefined {
  return files.get(nodeId)
}

export function dropNodeFile(nodeId: string): void {
  files.delete(nodeId)
}
