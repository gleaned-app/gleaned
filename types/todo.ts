export interface Todo {
  _id: string;
  _rev?: string;
  type: "todo";
  text: string;
  done: boolean;
  createdAt: string;
  dueDate?: string;   // "YYYY-MM-DD"
  color?: string;     // hex color
  encrypted?: boolean;
  textEnc?: string;   // AES-GCM ciphertext of text
}
