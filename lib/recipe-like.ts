interface QueryError {
  code?: string;
  message: string;
}

export function clampLikeCount(value: number) {
  return Math.max(0, value);
}

export function isRecipeLikeUniqueConflict(error: QueryError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}
