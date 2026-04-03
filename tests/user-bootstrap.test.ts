import { beforeEach, describe, expect, it } from "vitest";

import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  USER_BOOTSTRAP_VERSION,
} from "@/lib/server/user-bootstrap";

interface MemoryUserRow {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  social_provider: string;
  social_id: string | null;
  settings_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface MemoryRecipeBookRow {
  id: string;
  user_id: string;
  name: string;
  book_type: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface MemoryPlannerColumnRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

function createMemoryBootstrapClient({
  users = [],
  recipeBooks = [],
  plannerColumns = [],
}: {
  users?: MemoryUserRow[];
  recipeBooks?: MemoryRecipeBookRow[];
  plannerColumns?: MemoryPlannerColumnRow[];
}) {
  const state = {
    users,
    recipeBooks,
    plannerColumns,
  };

  return {
    state,
    from(table: "users" | "recipe_books" | "meal_plan_columns") {
      if (table === "users") {
        const selectQuery = {
          filters: {} as Record<string, string>,
          eq(column: string, value: string) {
            this.filters[column] = value;
            return this;
          },
          async maybeSingle() {
            const row = state.users.find((candidate) =>
              Object.entries(this.filters).every(([column, value]) => {
                return String(candidate[column as keyof MemoryUserRow]) === value;
              }));

            return {
              data: row ?? null,
              error: null,
            };
          },
        };

        const insertQuery = {
          value: null as MemoryUserRow | null,
          select() {
            return this;
          },
          async maybeSingle() {
            return {
              data: this.value,
              error: null,
            };
          },
        };

        const updateQuery = {
          filters: {} as Record<string, string>,
          patch: {} as Partial<MemoryUserRow>,
          eq(column: string, value: string) {
            this.filters[column] = value;
            return this;
          },
          select() {
            return this;
          },
          async maybeSingle() {
            const row = state.users.find((candidate) =>
              Object.entries(this.filters).every(([column, value]) => {
                return String(candidate[column as keyof MemoryUserRow]) === value;
              }));

            if (!row) {
              return {
                data: null,
                error: null,
              };
            }

            Object.assign(row, this.patch);

            return {
              data: row,
              error: null,
            };
          },
        };

        return {
          select() {
            return selectQuery;
          },
          insert(value: MemoryUserRow) {
            state.users.push(value);
            insertQuery.value = value;
            return insertQuery;
          },
          update(patch: Partial<MemoryUserRow>) {
            updateQuery.patch = patch;
            return updateQuery;
          },
        };
      }

      if (table === "recipe_books") {
        const selectQuery = {
          filters: {} as Record<string, string>,
          orders: [] as Array<{ column: keyof MemoryRecipeBookRow; ascending: boolean }>,
          eq(column: string, value: string) {
            this.filters[column] = value;
            return this;
          },
          order(column: keyof MemoryRecipeBookRow, options: { ascending: boolean }) {
            this.orders.push({ column, ascending: options.ascending });
            return this;
          },
          then(onFulfilled?: (value: { data: MemoryRecipeBookRow[]; error: null }) => unknown) {
            const filtered = state.recipeBooks
              .filter((candidate) =>
                Object.entries(this.filters).every(([column, value]) => {
                  return String(candidate[column as keyof MemoryRecipeBookRow]) === value;
                }))
              .sort((left, right) => {
                for (const order of this.orders) {
                  const leftValue = left[order.column];
                  const rightValue = right[order.column];

                  if (leftValue === rightValue) {
                    continue;
                  }

                  const comparison = leftValue < rightValue ? -1 : 1;
                  return order.ascending ? comparison : comparison * -1;
                }

                return 0;
              });

            return Promise.resolve({
              data: filtered,
              error: null,
            }).then(onFulfilled);
          },
        };

        const insertQuery = {
          value: null as MemoryRecipeBookRow | null,
          select() {
            return this;
          },
          async maybeSingle() {
            return {
              data: this.value,
              error: null,
            };
          },
        };

        return {
          select() {
            return selectQuery;
          },
          insert(value: MemoryRecipeBookRow) {
            state.recipeBooks.push(value);
            insertQuery.value = value;
            return insertQuery;
          },
        };
      }

      const selectQuery = {
        filters: {} as Record<string, string>,
        orders: [] as Array<{ column: keyof MemoryPlannerColumnRow; ascending: boolean }>,
        eq(column: string, value: string) {
          this.filters[column] = value;
          return this;
        },
        order(column: keyof MemoryPlannerColumnRow, options: { ascending: boolean }) {
          this.orders.push({ column, ascending: options.ascending });
          return this;
        },
        then(onFulfilled?: (value: { data: MemoryPlannerColumnRow[]; error: null }) => unknown) {
          const filtered = state.plannerColumns
            .filter((candidate) =>
              Object.entries(this.filters).every(([column, value]) => {
                return String(candidate[column as keyof MemoryPlannerColumnRow]) === value;
              }))
            .sort((left, right) => {
              for (const order of this.orders) {
                const leftValue = left[order.column];
                const rightValue = right[order.column];

                if (leftValue === rightValue) {
                  continue;
                }

                const comparison = leftValue < rightValue ? -1 : 1;
                return order.ascending ? comparison : comparison * -1;
              }

              return 0;
            });

          return Promise.resolve({
            data: filtered,
            error: null,
          }).then(onFulfilled);
        },
      };

      const insertQuery = {
        value: null as MemoryPlannerColumnRow | null,
        select() {
          return this;
        },
        async maybeSingle() {
          return {
            data: this.value,
            error: null,
          };
        },
      };

      return {
        select() {
          return selectQuery;
        },
        insert(value: MemoryPlannerColumnRow) {
          state.plannerColumns.push(value);
          insertQuery.value = value;
          return insertQuery;
        },
      };
    },
  };
}

describe("user bootstrap", () => {
  beforeEach(() => {
    // no-op; placeholder for future deterministic clock setup if needed
  });

  it("creates a public user row from authenticated user metadata when missing", async () => {
    const client = createMemoryBootstrapClient({});

    const row = await ensurePublicUserRow(client as never, {
      id: "user-1",
      email: "cook@example.com",
      app_metadata: { provider: "google" },
      user_metadata: {
        nickname: "집밥러",
        picture: "https://example.com/profile.png",
      },
    });

    expect(row.nickname).toBe("집밥러");
    expect(client.state.users).toHaveLength(1);
    expect(client.state.users[0]?.social_provider).toBe("google");
  });

  it("creates system recipe books and default planner columns once for completed users", async () => {
    const client = createMemoryBootstrapClient({
      users: [
        {
          id: "user-1",
          nickname: "집밥러",
          email: "cook@example.com",
          profile_image_url: null,
          social_provider: "google",
          social_id: "social-1",
          settings_json: {},
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
    });

    await ensureUserBootstrapState(client as never, "user-1");

    expect(client.state.recipeBooks.map((book) => book.book_type)).toEqual([
      "my_added",
      "saved",
      "liked",
    ]);
    expect(client.state.plannerColumns.map((column) => column.name)).toEqual([
      "아침",
      "점심",
      "저녁",
    ]);
    expect(client.state.users[0]?.settings_json.user_bootstrap_version).toBe(
      USER_BOOTSTRAP_VERSION,
    );
  });

  it("does not recreate planner defaults after bootstrap marker is set", async () => {
    const client = createMemoryBootstrapClient({
      users: [
        {
          id: "user-1",
          nickname: "집밥러",
          email: "cook@example.com",
          profile_image_url: null,
          social_provider: "google",
          social_id: "social-1",
          settings_json: {
            user_bootstrap_version: USER_BOOTSTRAP_VERSION,
          },
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
      plannerColumns: [],
    });

    await ensureUserBootstrapState(client as never, "user-1");

    expect(client.state.recipeBooks).toHaveLength(0);
    expect(client.state.plannerColumns).toHaveLength(0);
  });

  it("bootstraps recipe books and planner columns even when nickname is empty", async () => {
    const client = createMemoryBootstrapClient({
      users: [
        {
          id: "user-1",
          nickname: "",
          email: "cook@example.com",
          profile_image_url: null,
          social_provider: "google",
          social_id: "social-1",
          settings_json: {},
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
    });

    await ensureUserBootstrapState(client as never, "user-1");

    expect(client.state.recipeBooks.map((book) => book.book_type)).toEqual([
      "my_added",
      "saved",
      "liked",
    ]);
    expect(client.state.plannerColumns.map((column) => column.name)).toEqual([
      "아침",
      "점심",
      "저녁",
    ]);
    expect(client.state.users[0]?.settings_json.user_bootstrap_version).toBe(
      USER_BOOTSTRAP_VERSION,
    );
  });

  it("formats missing-table bootstrap errors into schema guidance", () => {
    const message = formatBootstrapErrorMessage(
      new Error("Could not find the table 'public.recipe_books' in the schema cache"),
      "fallback",
    );

    expect(message).toBe("Supabase 스키마가 준비되지 않았어요. 마이그레이션을 먼저 적용해주세요.");
  });
});
