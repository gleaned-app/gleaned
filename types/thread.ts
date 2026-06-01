export interface Thread {
  _id: string;
  _rev?: string;
  type: "thread";
  text: string;
  notes?: string;     // markdown, stored encrypted alongside text
  done: boolean;
  createdAt: string;
  dueDate?: string;   // "YYYY-MM-DD"
  color?: string;     // hex color
  encrypted?: boolean;
  textEnc?: string;   // AES-GCM ciphertext of text
}
