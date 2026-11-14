export type Nft = {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: number;
  version: number;
  art: number;
};
export type Line = { id: string; quantity: number };
export type Cart = { lines: Line[]; coupon: string };
export type Quote = {
  items: (Line & { nft: Nft })[];
  subtotal: string;
  discount: string;
  fee: string;
  total: string;
  signature: string;
};
export type Wallet = { address: string; secondary: string };
export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  wallet: Wallet;
};
export type Order = {
  id: string;
  status: "pending" | "confirmed" | "declined";
  quote: Quote;
  transaction: string;
  version: number;
};
export type Change = { id: string; resource: string; version: number };
export type Catalog = { items: Nft[]; pages: number };
export type Search = {
  q: string;
  category: string;
  sort: string;
  page: number;
  available: boolean;
};
