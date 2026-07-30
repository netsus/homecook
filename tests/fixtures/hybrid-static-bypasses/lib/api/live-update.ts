function safeRemove(_paths: string[]) {
  void _paths;
}

export let remove: unknown = safeRemove;
(remove as number)++;
