export interface MeasurementSubmitResultDto {
  conversationId: string;
  submissionId: string;
  status: 'SUBMITTED';
  firestore: 'UPSERTED';
  sheet: 'SENT';
}

export interface MeasurementSubmitPartialDetailsDto {
  conversationId: string;
  submissionId: string;
  status: 'PARTIAL';
  firestore: 'UPSERTED';
  sheet: 'ERROR';
}
