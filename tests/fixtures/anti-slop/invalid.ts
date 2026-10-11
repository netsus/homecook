export {};

declare const active: (value: number) => boolean;
declare const email: (value: number) => string;
declare const input: unknown;
declare const enabled: boolean;
declare const items: Array<{ id: string }>;

const values: number[] = [];
values.filter(active).map(email);
const narrowed = input as unknown as { id: string };
const options = { ...(enabled ? { timeout: 1 } : {}) };
items.reduce((accumulator, item) => [...accumulator, item], [] as Array<{ id: string }>);
items.reduce(
  (accumulator, item) => Object.assign({}, accumulator, { [item.id]: item }),
  {} as Record<string, { id: string }>,
);

void narrowed;
void options;
