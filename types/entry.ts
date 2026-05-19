export interface Entry {
  _id: string;
  _rev?: string;
  type: "entry";
  content: string;
  tags: string[];
  date: string;
  createdAt: string;
}
