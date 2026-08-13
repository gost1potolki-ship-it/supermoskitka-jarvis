export type MessageDtoSender = 'CUSTOMER' | 'AI' | 'HUMAN';

export interface MessageDto {
  messageId: string;
  sender: MessageDtoSender;
  text: string;
  createdAt: string;
}
