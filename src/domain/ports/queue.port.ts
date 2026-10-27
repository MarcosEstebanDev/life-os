export interface JobQueue {
  enqueueExtractText(documentId: string): Promise<void>;
  enqueueExtractObligations(documentId: string): Promise<void>;
}
