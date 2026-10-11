export {};

declare const active: (value: number) => boolean;
declare const email: (value: number) => string;
declare const input: unknown;
declare const items: Array<{ id: string }>;

const values: number[] = [];
values.filter(active);
values.map(email);

const narrowed = input as { id: string };
const options = { timeout: 1 };
items.reduce((accumulator, item) => {
  accumulator.push(item);
  return accumulator;
}, [] as Array<{ id: string }>);

void narrowed;
void options;
