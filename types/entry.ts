export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64 data URL
}

export interface Entry {
  _id: string;
  _rev?: string;
  type: "entry";
  content: string;
  tags: string[];
  date: string;
  createdAt: string;
  attachments?: Attachment[];
}
